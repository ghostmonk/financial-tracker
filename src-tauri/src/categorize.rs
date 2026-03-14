use regex::Regex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;

static RE_STORE_NUMBER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s*#\d+\s*$").unwrap());
static RE_LONG_NUMBER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+\d{9,}\s*$").unwrap());

use crate::db::DbError;
use crate::models::categorization_rule::CategorizationRule;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UncategorizedGroup {
    pub normalized_name: String,
    pub transaction_count: i64,
    pub total_amount: f64,
    pub sample_description: String,
    pub account_ids: Vec<String>,
}

/// Normalize a merchant name for grouping purposes (never modifies stored data).
///
/// - Prefer description; if empty, use first segment of payee (before first `;`)
/// - Uppercase + trim
/// - Strip trailing `#\d+` patterns (store numbers)
/// - Strip trailing long numeric sequences (9+ digits)
/// - Preserve location names like "MAXI ST-LAMBERT"
pub fn normalize_merchant_name(description: &str, payee: Option<&str>) -> String {
    let raw = if description.trim().is_empty() {
        match payee {
            Some(p) => p.split(';').next().unwrap_or("").to_string(),
            None => String::new(),
        }
    } else {
        description.to_string()
    };

    let mut name = raw.trim().to_uppercase();

    // Strip trailing store number pattern: #\d+
    name = RE_STORE_NUMBER.replace(&name, "").to_string();

    // Strip trailing long numeric sequences (9+ digits)
    name = RE_LONG_NUMBER.replace(&name, "").to_string();

    name.trim().to_string()
}

/// Check if a rule matches a transaction's description/payee fields and amount conditions.
fn rule_matches(
    rule: &CategorizationRule,
    description: &str,
    payee: Option<&str>,
    amount: f64,
) -> bool {
    let field_value = match rule.match_field.as_str() {
        "description" => description.to_uppercase(),
        "payee" => match payee {
            Some(p) => p.to_uppercase(),
            None => return false,
        },
        _ => return false,
    };

    let pattern = rule.pattern.to_uppercase();

    let pattern_matched = match rule.match_type.as_str() {
        "contains" => field_value.contains(&pattern),
        "starts_with" => field_value.starts_with(&pattern),
        "exact" => field_value == pattern,
        _ => false,
    };

    if !pattern_matched {
        return false;
    }

    // After pattern match succeeds, check amount conditions
    if let Some(min) = rule.amount_min {
        if amount.abs() < min {
            return false;
        }
    }
    if let Some(max) = rule.amount_max {
        if amount.abs() > max {
            return false;
        }
    }

    true
}

/// Query all uncategorized transactions, group by normalized merchant name.
/// Optional account_id filter. Returns groups sorted by transaction_count DESC.
pub fn get_uncategorized_groups(
    conn: &Connection,
    account_id: Option<&str>,
) -> Result<Vec<UncategorizedGroup>, DbError> {
    let sql = if account_id.is_some() {
        "SELECT id, description, payee, account_id, amount FROM transactions \
         WHERE category_id IS NULL AND account_id = ?1"
    } else {
        "SELECT id, description, payee, account_id, amount FROM transactions \
         WHERE category_id IS NULL"
    };

    let mut stmt = conn.prepare(sql)?;

    let rows: Vec<(String, String, Option<String>, String, f64)> = if let Some(acct) = account_id {
        stmt.query_map(params![acct], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        stmt.query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
    };

    let mut groups: HashMap<String, UncategorizedGroup> = HashMap::new();

    for (_id, description, payee, acct_id, amount) in rows {
        let normalized = normalize_merchant_name(&description, payee.as_deref());
        let group = groups
            .entry(normalized.clone())
            .or_insert_with(|| UncategorizedGroup {
                normalized_name: normalized,
                transaction_count: 0,
                total_amount: 0.0,
                sample_description: description.clone(),
                account_ids: Vec::new(),
            });
        group.transaction_count += 1;
        group.total_amount += amount;
        if !group.account_ids.contains(&acct_id) {
            group.account_ids.push(acct_id);
        }
    }

    let mut result: Vec<UncategorizedGroup> = groups.into_values().collect();
    result.sort_by(|a, b| b.transaction_count.cmp(&a.transaction_count));
    Ok(result)
}

/// Load all auto_apply=1 rules ordered by priority DESC.
/// For each uncategorized transaction in the given IDs, find first matching rule.
/// UPDATE with category_id + categorized_by_rule=1. Return count of categorized transactions.
pub fn apply_rules_to_transactions(
    conn: &Connection,
    transaction_ids: &[String],
) -> Result<usize, DbError> {
    if transaction_ids.is_empty() {
        return Ok(0);
    }

    let rules = load_auto_rules(conn)?;
    if rules.is_empty() {
        return Ok(0);
    }

    // Fetch uncategorized transactions from the given IDs
    let placeholders: Vec<String> = (0..transaction_ids.len())
        .map(|i| format!("?{}", i + 1))
        .collect();
    let sql = format!(
        "SELECT id, description, payee, amount FROM transactions WHERE category_id IS NULL AND id IN ({})",
        placeholders.join(", ")
    );
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    for id in transaction_ids {
        values.push(Box::new(id.clone()));
    }
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();

    let mut stmt = conn.prepare(&sql)?;
    let txns: Vec<(String, String, Option<String>, f64)> = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut count = 0usize;
    for (tx_id, description, payee, amount) in &txns {
        for rule in &rules {
            if rule_matches(rule, description, payee.as_deref(), *amount) {
                conn.execute(
                    "UPDATE transactions SET category_id = ?1, categorized_by_rule = 1, \
                     updated_at = datetime('now') WHERE id = ?2",
                    params![rule.category_id, tx_id],
                )?;
                count += 1;
                break;
            }
        }
    }

    Ok(count)
}

/// 1. Clear all rule-applied categorizations
/// 2. Load all auto_apply=1 rules
/// 3. Fetch all uncategorized transactions
/// 4. Apply first-match logic, set categorized_by_rule=1
/// 5. Return count
pub fn reapply_all_rules(conn: &Connection) -> Result<usize, DbError> {
    // Clear previous rule-applied categorizations
    conn.execute(
        "UPDATE transactions SET category_id = NULL, categorized_by_rule = 0 \
         WHERE categorized_by_rule = 1",
        [],
    )?;

    let rules = load_auto_rules(conn)?;
    if rules.is_empty() {
        return Ok(0);
    }

    // Fetch all uncategorized transactions
    let mut stmt = conn.prepare(
        "SELECT id, description, payee, amount FROM transactions WHERE category_id IS NULL",
    )?;
    let txns: Vec<(String, String, Option<String>, f64)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut count = 0usize;
    for (tx_id, description, payee, amount) in &txns {
        for rule in &rules {
            if rule_matches(rule, description, payee.as_deref(), *amount) {
                conn.execute(
                    "UPDATE transactions SET category_id = ?1, categorized_by_rule = 1, \
                     updated_at = datetime('now') WHERE id = ?2",
                    params![rule.category_id, tx_id],
                )?;
                count += 1;
                break;
            }
        }
    }

    Ok(count)
}

/// Count distinct normalized merchant names where category_id IS NULL.
pub fn count_uncategorized_groups(conn: &Connection) -> Result<i64, DbError> {
    let mut stmt =
        conn.prepare("SELECT description, payee FROM transactions WHERE category_id IS NULL")?;
    let rows: Vec<(String, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut names: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (description, payee) in &rows {
        let normalized = normalize_merchant_name(description, payee.as_deref());
        names.insert(normalized);
    }

    Ok(names.len() as i64)
}

/// Load all auto_apply=1 rules ordered by priority DESC.
fn load_auto_rules(conn: &Connection) -> Result<Vec<CategorizationRule>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT id, pattern, match_field, match_type, category_id, priority, amount_min, amount_max, auto_apply, created_at \
         FROM categorization_rules WHERE auto_apply = 1 ORDER BY priority DESC",
    )?;
    let rules = stmt
        .query_map([], |row| {
            Ok(CategorizationRule {
                id: row.get(0)?,
                pattern: row.get(1)?,
                match_field: row.get(2)?,
                match_type: row.get(3)?,
                category_id: row.get(4)?,
                priority: row.get(5)?,
                amount_min: row.get(6)?,
                amount_max: row.get(7)?,
                auto_apply: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rules)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let schema = include_str!("schema.sql");
        conn.execute_batch(schema).unwrap();

        // Test accounts
        conn.execute(
            "INSERT INTO accounts (id, name, account_type) VALUES (?1, ?2, ?3)",
            params!["acct-1", "Checking", "checking"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO accounts (id, name, account_type) VALUES (?1, ?2, ?3)",
            params!["acct-2", "Credit Card", "credit_card"],
        )
        .unwrap();

        // Test categories
        conn.execute(
            "INSERT INTO categories (id, slug, name, direction, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["cat-dining", "dining", "Dining", "expense", 0],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO categories (id, slug, name, direction, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["cat-groceries", "groceries", "Groceries", "expense", 1],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO categories (id, slug, name, direction, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["cat-gas", "gas", "Gas", "expense", 2],
        )
        .unwrap();

        conn
    }

    fn insert_tx(conn: &Connection, id: &str, desc: &str, payee: Option<&str>, account: &str) {
        conn.execute(
            "INSERT INTO transactions (id, date, amount, description, payee, account_id) \
             VALUES (?1, '2025-01-15', -10.00, ?2, ?3, ?4)",
            params![id, desc, payee, account],
        )
        .unwrap();
    }

    #[test]
    fn test_normalize_strips_store_number() {
        assert_eq!(
            normalize_merchant_name("MCDONALD'S #148", None),
            "MCDONALD'S"
        );
        assert_eq!(
            normalize_merchant_name("TIM HORTONS #22", None),
            "TIM HORTONS"
        );
    }

    #[test]
    fn test_normalize_strips_long_reference_numbers() {
        assert_eq!(
            normalize_merchant_name("HAMFIT 607115539888", None),
            "HAMFIT"
        );
    }

    #[test]
    fn test_normalize_preserves_location_names() {
        assert_eq!(
            normalize_merchant_name("MAXI ST-LAMBERT", None),
            "MAXI ST-LAMBERT"
        );
    }

    #[test]
    fn test_normalize_empty_description_uses_payee() {
        assert_eq!(
            normalize_merchant_name(
                "",
                Some("E-TRANSFER 105857783212;Tracey RBC;Internet Banking")
            ),
            "E-TRANSFER"
        );
    }

    #[test]
    fn test_rule_matches_contains() {
        let rule = CategorizationRule {
            id: "r1".into(),
            pattern: "mcdonald".into(),
            match_field: "description".into(),
            match_type: "contains".into(),
            category_id: "cat-dining".into(),
            priority: 0,
            amount_min: None,
            amount_max: None,
            auto_apply: true,
            created_at: String::new(),
        };
        assert!(rule_matches(&rule, "MCDONALD'S #148", None, 0.0));
        assert!(rule_matches(&rule, "some mcdonald thing", None, 0.0));
        assert!(!rule_matches(&rule, "BURGER KING", None, 0.0));
    }

    #[test]
    fn test_rule_matches_starts_with() {
        let rule = CategorizationRule {
            id: "r1".into(),
            pattern: "TIM HORTONS".into(),
            match_field: "description".into(),
            match_type: "starts_with".into(),
            category_id: "cat-dining".into(),
            priority: 0,
            amount_min: None,
            amount_max: None,
            auto_apply: true,
            created_at: String::new(),
        };
        assert!(rule_matches(&rule, "Tim Hortons #22", None, 0.0));
        assert!(!rule_matches(&rule, "AT TIM HORTONS", None, 0.0));
    }

    #[test]
    fn test_rule_matches_exact() {
        let rule = CategorizationRule {
            id: "r1".into(),
            pattern: "CAFE PLUS JM IN".into(),
            match_field: "description".into(),
            match_type: "exact".into(),
            category_id: "cat-dining".into(),
            priority: 0,
            amount_min: None,
            amount_max: None,
            auto_apply: true,
            created_at: String::new(),
        };
        assert!(rule_matches(&rule, "cafe plus jm in", None, 0.0));
        assert!(!rule_matches(&rule, "CAFE PLUS JM IN EXTRA", None, 0.0));
    }

    #[test]
    fn test_rule_matches_payee_field() {
        let rule = CategorizationRule {
            id: "r1".into(),
            pattern: "Tracey".into(),
            match_field: "payee".into(),
            match_type: "contains".into(),
            category_id: "cat-dining".into(),
            priority: 0,
            amount_min: None,
            amount_max: None,
            auto_apply: true,
            created_at: String::new(),
        };
        assert!(rule_matches(
            &rule,
            "E-TRANSFER",
            Some("E-TRANSFER 105857783212;Tracey RBC;Internet Banking"),
            0.0,
        ));
        assert!(!rule_matches(&rule, "E-TRANSFER", Some("John Smith"), 0.0,));
        // No payee at all
        assert!(!rule_matches(&rule, "E-TRANSFER", None, 0.0));
    }

    #[test]
    fn test_apply_rules_to_transactions() {
        let conn = setup_db();

        insert_tx(&conn, "tx-1", "MCDONALD'S #148", None, "acct-1");
        insert_tx(&conn, "tx-2", "MAXI ST-LAMBERT", None, "acct-1");
        insert_tx(&conn, "tx-3", "RANDOM STORE", None, "acct-1");

        // Create rules
        conn.execute(
            "INSERT INTO categorization_rules (id, pattern, match_field, match_type, category_id, priority, auto_apply) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["rule-1", "MCDONALD", "description", "contains", "cat-dining", 10, true],
        ).unwrap();
        conn.execute(
            "INSERT INTO categorization_rules (id, pattern, match_field, match_type, category_id, priority, auto_apply) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["rule-2", "MAXI", "description", "starts_with", "cat-groceries", 5, true],
        ).unwrap();

        let ids = vec!["tx-1".into(), "tx-2".into(), "tx-3".into()];
        let count = apply_rules_to_transactions(&conn, &ids).unwrap();
        assert_eq!(count, 2);

        // Verify tx-1 categorized
        let cat: Option<String> = conn
            .query_row(
                "SELECT category_id FROM transactions WHERE id = 'tx-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cat, Some("cat-dining".into()));

        // Verify categorized_by_rule flag
        let flag: i32 = conn
            .query_row(
                "SELECT categorized_by_rule FROM transactions WHERE id = 'tx-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(flag, 1);

        // Verify tx-3 not categorized
        let cat3: Option<String> = conn
            .query_row(
                "SELECT category_id FROM transactions WHERE id = 'tx-3'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cat3, None);
    }

    #[test]
    fn test_reapply_all_rules() {
        let conn = setup_db();

        insert_tx(&conn, "tx-1", "MCDONALD'S #148", None, "acct-1");
        insert_tx(&conn, "tx-2", "MAXI ST-LAMBERT", None, "acct-1");
        insert_tx(&conn, "tx-3", "RANDOM STORE", None, "acct-1");

        // Manually categorize tx-3 (should be preserved)
        conn.execute(
            "UPDATE transactions SET category_id = 'cat-gas', categorized_by_rule = 0 WHERE id = 'tx-3'",
            [],
        ).unwrap();

        // Rule-categorize tx-1 (should be cleared and re-applied)
        conn.execute(
            "UPDATE transactions SET category_id = 'cat-dining', categorized_by_rule = 1 WHERE id = 'tx-1'",
            [],
        ).unwrap();

        // Create rule
        conn.execute(
            "INSERT INTO categorization_rules (id, pattern, match_field, match_type, category_id, priority, auto_apply) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["rule-1", "MCDONALD", "description", "contains", "cat-dining", 10, true],
        ).unwrap();
        conn.execute(
            "INSERT INTO categorization_rules (id, pattern, match_field, match_type, category_id, priority, auto_apply) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["rule-2", "MAXI", "description", "starts_with", "cat-groceries", 5, true],
        ).unwrap();

        let count = reapply_all_rules(&conn).unwrap();
        assert_eq!(count, 2); // tx-1 and tx-2

        // tx-3 manual categorization preserved
        let cat3: Option<String> = conn
            .query_row(
                "SELECT category_id FROM transactions WHERE id = 'tx-3'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cat3, Some("cat-gas".into()));
        let flag3: i32 = conn
            .query_row(
                "SELECT categorized_by_rule FROM transactions WHERE id = 'tx-3'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(flag3, 0);

        // tx-1 re-applied by rule
        let cat1: Option<String> = conn
            .query_row(
                "SELECT category_id FROM transactions WHERE id = 'tx-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cat1, Some("cat-dining".into()));
        let flag1: i32 = conn
            .query_row(
                "SELECT categorized_by_rule FROM transactions WHERE id = 'tx-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(flag1, 1);
    }

    #[test]
    fn test_uncategorized_groups() {
        let conn = setup_db();

        // Two McDonalds from different accounts
        insert_tx(&conn, "tx-1", "MCDONALD'S #148", None, "acct-1");
        insert_tx(&conn, "tx-2", "MCDONALD'S #22", None, "acct-2");
        // One Maxi
        insert_tx(&conn, "tx-3", "MAXI ST-LAMBERT", None, "acct-1");

        let groups = get_uncategorized_groups(&conn, None).unwrap();
        assert_eq!(groups.len(), 2);

        // McDonald's group first (2 txns > 1 txn)
        assert_eq!(groups[0].normalized_name, "MCDONALD'S");
        assert_eq!(groups[0].transaction_count, 2);
        assert_eq!(groups[0].account_ids.len(), 2);

        assert_eq!(groups[1].normalized_name, "MAXI ST-LAMBERT");
        assert_eq!(groups[1].transaction_count, 1);
    }

    #[test]
    fn test_uncategorized_groups_filter_by_account() {
        let conn = setup_db();

        insert_tx(&conn, "tx-1", "MCDONALD'S #148", None, "acct-1");
        insert_tx(&conn, "tx-2", "MCDONALD'S #22", None, "acct-2");
        insert_tx(&conn, "tx-3", "MAXI ST-LAMBERT", None, "acct-1");

        let groups = get_uncategorized_groups(&conn, Some("acct-2")).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].normalized_name, "MCDONALD'S");
        assert_eq!(groups[0].transaction_count, 1);
    }

    #[test]
    fn test_count_uncategorized_groups() {
        let conn = setup_db();

        insert_tx(&conn, "tx-1", "MCDONALD'S #148", None, "acct-1");
        insert_tx(&conn, "tx-2", "MCDONALD'S #22", None, "acct-2");
        insert_tx(&conn, "tx-3", "MAXI ST-LAMBERT", None, "acct-1");

        let count = count_uncategorized_groups(&conn).unwrap();
        assert_eq!(count, 2); // MCDONALD'S and MAXI ST-LAMBERT

        // Categorize one McDonald's — other still uncategorized
        conn.execute(
            "UPDATE transactions SET category_id = 'cat-dining' WHERE id = 'tx-1'",
            [],
        )
        .unwrap();

        let count = count_uncategorized_groups(&conn).unwrap();
        assert_eq!(count, 2); // Still 2 groups (tx-2 McDonald's + tx-3 Maxi)

        // Categorize all McDonald's
        conn.execute(
            "UPDATE transactions SET category_id = 'cat-dining' WHERE id = 'tx-2'",
            [],
        )
        .unwrap();

        let count = count_uncategorized_groups(&conn).unwrap();
        assert_eq!(count, 1); // Only Maxi left
    }

    fn make_rule(amount_min: Option<f64>, amount_max: Option<f64>) -> CategorizationRule {
        CategorizationRule {
            id: "r1".into(),
            pattern: "STORE".into(),
            match_field: "description".into(),
            match_type: "contains".into(),
            category_id: "cat-dining".into(),
            priority: 0,
            amount_min,
            amount_max,
            auto_apply: true,
            created_at: String::new(),
        }
    }

    #[test]
    fn test_rule_matches_amount_min_only() {
        let rule = make_rule(Some(20.0), None);
        // 25 >= 20 -> match
        assert!(rule_matches(&rule, "MY STORE", None, 25.0));
        // 20 >= 20 -> match (boundary)
        assert!(rule_matches(&rule, "MY STORE", None, 20.0));
        // 10 < 20 -> reject
        assert!(!rule_matches(&rule, "MY STORE", None, 10.0));
        // negative amount, abs(−30) = 30 >= 20 -> match
        assert!(rule_matches(&rule, "MY STORE", None, -30.0));
        // negative amount, abs(−5) = 5 < 20 -> reject
        assert!(!rule_matches(&rule, "MY STORE", None, -5.0));
    }

    #[test]
    fn test_rule_matches_amount_max_only() {
        let rule = make_rule(None, Some(50.0));
        // 30 <= 50 -> match
        assert!(rule_matches(&rule, "MY STORE", None, 30.0));
        // 50 <= 50 -> match (boundary)
        assert!(rule_matches(&rule, "MY STORE", None, 50.0));
        // 100 > 50 -> reject
        assert!(!rule_matches(&rule, "MY STORE", None, 100.0));
        // negative, abs(−40) = 40 <= 50 -> match
        assert!(rule_matches(&rule, "MY STORE", None, -40.0));
        // negative, abs(−60) = 60 > 50 -> reject
        assert!(!rule_matches(&rule, "MY STORE", None, -60.0));
    }

    #[test]
    fn test_rule_matches_amount_range() {
        let rule = make_rule(Some(10.0), Some(50.0));
        // within range
        assert!(rule_matches(&rule, "MY STORE", None, 25.0));
        // at min boundary
        assert!(rule_matches(&rule, "MY STORE", None, 10.0));
        // at max boundary
        assert!(rule_matches(&rule, "MY STORE", None, 50.0));
        // below min
        assert!(!rule_matches(&rule, "MY STORE", None, 5.0));
        // above max
        assert!(!rule_matches(&rule, "MY STORE", None, 75.0));
    }

    #[test]
    fn test_rule_matches_no_amount_conditions() {
        let rule = make_rule(None, None);
        assert!(rule_matches(&rule, "MY STORE", None, 0.0));
        assert!(rule_matches(&rule, "MY STORE", None, 999.99));
        assert!(rule_matches(&rule, "MY STORE", None, -500.0));
    }

    #[test]
    fn test_rule_matches_amount_not_checked_when_pattern_fails() {
        let rule = make_rule(Some(10.0), Some(50.0));
        // Pattern doesn't match, amount is in range — should still be false
        assert!(!rule_matches(&rule, "OTHER PLACE", None, 25.0));
    }
}
