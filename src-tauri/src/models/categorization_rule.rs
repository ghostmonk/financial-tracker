use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use crate::db::DbError;
use crate::db_utils::UpdateBuilder;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorizationRule {
    pub id: String,
    pub pattern: String,
    pub match_field: String,
    pub match_type: String,
    pub category_id: String,
    pub account_ids: Vec<String>,
    pub priority: i32,
    pub amount_min: Option<f64>,
    pub amount_max: Option<f64>,
    pub auto_apply: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRuleParams {
    pub pattern: String,
    pub match_field: String,
    pub match_type: String,
    pub category_id: String,
    pub account_ids: Option<Vec<String>>,
    pub priority: Option<i32>,
    pub amount_min: Option<f64>,
    pub amount_max: Option<f64>,
    pub auto_apply: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRuleParams {
    pub pattern: Option<String>,
    pub match_field: Option<String>,
    pub match_type: Option<String>,
    pub category_id: Option<String>,
    pub account_ids: Option<Vec<String>>,
    pub priority: Option<i32>,
    pub amount_min: Option<Option<f64>>,
    pub amount_max: Option<Option<f64>>,
    pub auto_apply: Option<bool>,
}

const SELECT_COLS: &str =
    "id, pattern, match_field, match_type, category_id, priority, amount_min, amount_max, auto_apply, created_at";

fn row_to_rule_base(row: &rusqlite::Row) -> rusqlite::Result<CategorizationRule> {
    Ok(CategorizationRule {
        id: row.get(0)?,
        pattern: row.get(1)?,
        match_field: row.get(2)?,
        match_type: row.get(3)?,
        category_id: row.get(4)?,
        account_ids: vec![],
        priority: row.get(5)?,
        amount_min: row.get(6)?,
        amount_max: row.get(7)?,
        auto_apply: row.get(8)?,
        created_at: row.get(9)?,
    })
}

/// Load all rule_accounts rows into a HashMap keyed by rule_id.
pub fn load_rule_account_ids(conn: &Connection) -> Result<HashMap<String, Vec<String>>, DbError> {
    let mut stmt =
        conn.prepare("SELECT rule_id, account_id FROM rule_accounts ORDER BY rule_id")?;
    let rows: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for (rule_id, account_id) in rows {
        map.entry(rule_id).or_default().push(account_id);
    }
    Ok(map)
}

/// Merge account_ids from the map into a list of rules.
fn merge_account_ids(rules: &mut [CategorizationRule], map: &HashMap<String, Vec<String>>) {
    for rule in rules.iter_mut() {
        if let Some(ids) = map.get(&rule.id) {
            rule.account_ids = ids.clone();
        }
    }
}

fn insert_rule_accounts(
    conn: &Connection,
    rule_id: &str,
    account_ids: &[String],
) -> Result<(), DbError> {
    for acct_id in account_ids {
        conn.execute(
            "INSERT INTO rule_accounts (rule_id, account_id) VALUES (?1, ?2)",
            params![rule_id, acct_id],
        )?;
    }
    Ok(())
}

fn replace_rule_accounts(
    conn: &Connection,
    rule_id: &str,
    account_ids: &[String],
) -> Result<(), DbError> {
    conn.execute(
        "DELETE FROM rule_accounts WHERE rule_id = ?1",
        params![rule_id],
    )?;
    insert_rule_accounts(conn, rule_id, account_ids)
}

pub fn create_rule(
    conn: &Connection,
    params: CreateRuleParams,
) -> Result<CategorizationRule, DbError> {
    let id = Uuid::new_v4().to_string();
    let priority = params.priority.unwrap_or(0);
    let auto_apply = params.auto_apply.unwrap_or(true);
    conn.execute(
        "INSERT INTO categorization_rules (id, pattern, match_field, match_type, category_id, priority, amount_min, amount_max, auto_apply) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            id,
            params.pattern,
            params.match_field,
            params.match_type,
            params.category_id,
            priority,
            params.amount_min,
            params.amount_max,
            auto_apply,
        ],
    )?;

    let account_ids = params.account_ids.unwrap_or_default();
    insert_rule_accounts(conn, &id, &account_ids)?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM categorization_rules WHERE id = ?1",
        SELECT_COLS
    ))?;
    let mut rule = stmt.query_row(rusqlite::params![&id], row_to_rule_base)?;
    rule.account_ids = account_ids;
    Ok(rule)
}

pub fn list_rules(conn: &Connection) -> Result<Vec<CategorizationRule>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM categorization_rules ORDER BY priority DESC, created_at ASC",
        SELECT_COLS
    ))?;
    let mut rules = stmt
        .query_map([], row_to_rule_base)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let map = load_rule_account_ids(conn)?;
    merge_account_ids(&mut rules, &map);
    Ok(rules)
}

pub fn update_rule(
    conn: &Connection,
    id: &str,
    params: UpdateRuleParams,
) -> Result<CategorizationRule, DbError> {
    let mut builder = UpdateBuilder::new();
    builder
        .set_if("pattern", &params.pattern)
        .set_if("match_field", &params.match_field)
        .set_if("match_type", &params.match_type)
        .set_if("category_id", &params.category_id)
        .set_if("priority", &params.priority)
        .set_nullable("amount_min", &params.amount_min)
        .set_nullable("amount_max", &params.amount_max)
        .set_if("auto_apply", &params.auto_apply);
    builder.execute(conn, "categorization_rules", id, false)?;

    if let Some(ref account_ids) = params.account_ids {
        replace_rule_accounts(conn, id, account_ids)?;
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM categorization_rules WHERE id = ?1",
        SELECT_COLS
    ))?;
    let mut rule = stmt.query_row(rusqlite::params![id], row_to_rule_base)?;

    // Load account_ids for this rule
    let map = load_rule_account_ids(conn)?;
    if let Some(ids) = map.get(id) {
        rule.account_ids = ids.clone();
    }
    Ok(rule)
}

pub fn delete_rule(conn: &Connection, id: &str) -> Result<(), DbError> {
    conn.execute(
        "DELETE FROM categorization_rules WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::fixtures::{insert_test_account, insert_test_category, setup_db};

    fn setup_db_with_categories() -> rusqlite::Connection {
        let conn = setup_db();
        insert_test_category(&conn, "cat-1", "groceries");
        insert_test_category(&conn, "cat-2", "dining_out");
        conn
    }

    #[test]
    fn test_create_and_list_rules() {
        let conn = setup_db_with_categories();

        let rule1 = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "METRO".to_string(),
                match_field: "description".to_string(),
                match_type: "contains".to_string(),
                category_id: "cat-1".to_string(),
                priority: Some(10),
                account_ids: None,
                amount_min: None,
                amount_max: None,
                auto_apply: None,
            },
        )
        .unwrap();

        assert_eq!(rule1.pattern, "METRO");
        assert_eq!(rule1.match_field, "description");
        assert_eq!(rule1.match_type, "contains");
        assert_eq!(rule1.category_id, "cat-1");
        assert_eq!(rule1.priority, 10);
        assert!(rule1.auto_apply);
        assert!(rule1.account_ids.is_empty());

        let rule2 = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "RESTAURANT".to_string(),
                match_field: "payee".to_string(),
                match_type: "starts_with".to_string(),
                category_id: "cat-2".to_string(),
                priority: Some(5),
                account_ids: None,
                amount_min: None,
                amount_max: None,
                auto_apply: Some(false),
            },
        )
        .unwrap();

        assert!(!rule2.auto_apply);

        let rules = list_rules(&conn).unwrap();
        assert_eq!(rules.len(), 2);
        // priority DESC: rule1 (10) before rule2 (5)
        assert_eq!(rules[0].pattern, "METRO");
        assert_eq!(rules[1].pattern, "RESTAURANT");
    }

    #[test]
    fn test_update_rule() {
        let conn = setup_db_with_categories();

        let rule = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "COSTCO".to_string(),
                match_field: "description".to_string(),
                match_type: "contains".to_string(),
                category_id: "cat-1".to_string(),
                priority: None,
                account_ids: None,
                amount_min: None,
                amount_max: None,
                auto_apply: None,
            },
        )
        .unwrap();

        assert_eq!(rule.priority, 0);
        assert!(rule.auto_apply);

        let updated = update_rule(
            &conn,
            &rule.id,
            UpdateRuleParams {
                pattern: Some("COSTCO WHOLESALE".to_string()),
                match_field: None,
                match_type: Some("exact".to_string()),
                category_id: Some("cat-2".to_string()),
                account_ids: None,
                priority: Some(20),
                amount_min: None,
                amount_max: None,
                auto_apply: Some(false),
            },
        )
        .unwrap();

        assert_eq!(updated.pattern, "COSTCO WHOLESALE");
        assert_eq!(updated.match_type, "exact");
        assert_eq!(updated.category_id, "cat-2");
        assert_eq!(updated.priority, 20);
        assert!(!updated.auto_apply);
        // Unchanged field
        assert_eq!(updated.match_field, "description");
    }

    #[test]
    fn test_update_rule_no_changes() {
        let conn = setup_db_with_categories();

        let rule = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "TEST".to_string(),
                match_field: "description".to_string(),
                match_type: "contains".to_string(),
                category_id: "cat-1".to_string(),
                priority: None,
                account_ids: None,
                amount_min: None,
                amount_max: None,
                auto_apply: None,
            },
        )
        .unwrap();

        let unchanged = update_rule(
            &conn,
            &rule.id,
            UpdateRuleParams {
                pattern: None,
                match_field: None,
                match_type: None,
                category_id: None,
                priority: None,
                account_ids: None,
                amount_min: None,
                amount_max: None,
                auto_apply: None,
            },
        )
        .unwrap();

        assert_eq!(unchanged.id, rule.id);
        assert_eq!(unchanged.pattern, "TEST");
    }

    #[test]
    fn test_create_rule_with_amount_conditions() {
        let conn = setup_db_with_categories();

        let rule = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "LARGE PURCHASE".to_string(),
                match_field: "description".to_string(),
                match_type: "contains".to_string(),
                category_id: "cat-1".to_string(),
                priority: Some(5),
                account_ids: None,
                amount_min: Some(100.0),
                amount_max: Some(500.0),
                auto_apply: None,
            },
        )
        .unwrap();

        assert_eq!(rule.amount_min, Some(100.0));
        assert_eq!(rule.amount_max, Some(500.0));

        // Verify persisted via list
        let rules = list_rules(&conn).unwrap();
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].amount_min, Some(100.0));
        assert_eq!(rules[0].amount_max, Some(500.0));
    }

    #[test]
    fn test_update_rule_amount_conditions() {
        let conn = setup_db_with_categories();

        let rule = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "TEST".to_string(),
                match_field: "description".to_string(),
                match_type: "contains".to_string(),
                category_id: "cat-1".to_string(),
                priority: None,
                account_ids: None,
                amount_min: None,
                amount_max: None,
                auto_apply: None,
            },
        )
        .unwrap();

        assert_eq!(rule.amount_min, None);
        assert_eq!(rule.amount_max, None);

        // Set amount conditions
        let updated = update_rule(
            &conn,
            &rule.id,
            UpdateRuleParams {
                pattern: None,
                match_field: None,
                match_type: None,
                category_id: None,
                account_ids: None,
                priority: None,
                amount_min: Some(Some(50.0)),
                amount_max: Some(Some(200.0)),
                auto_apply: None,
            },
        )
        .unwrap();

        assert_eq!(updated.amount_min, Some(50.0));
        assert_eq!(updated.amount_max, Some(200.0));

        // Clear amount conditions
        let cleared = update_rule(
            &conn,
            &rule.id,
            UpdateRuleParams {
                pattern: None,
                match_field: None,
                match_type: None,
                category_id: None,
                account_ids: None,
                priority: None,
                amount_min: Some(None),
                amount_max: Some(None),
                auto_apply: None,
            },
        )
        .unwrap();

        assert_eq!(cleared.amount_min, None);
        assert_eq!(cleared.amount_max, None);
    }

    #[test]
    fn test_delete_rule() {
        let conn = setup_db_with_categories();

        let rule = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "DELETE ME".to_string(),
                match_field: "description".to_string(),
                match_type: "exact".to_string(),
                category_id: "cat-1".to_string(),
                priority: None,
                account_ids: None,
                amount_min: None,
                amount_max: None,
                auto_apply: None,
            },
        )
        .unwrap();

        let rules = list_rules(&conn).unwrap();
        assert_eq!(rules.len(), 1);

        delete_rule(&conn, &rule.id).unwrap();

        let rules = list_rules(&conn).unwrap();
        assert_eq!(rules.len(), 0);
    }

    #[test]
    fn test_create_rule_with_account_ids() {
        let conn = setup_db_with_categories();
        insert_test_account(&conn, "acct-1");
        insert_test_account(&conn, "acct-2");

        let rule = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "STORE".to_string(),
                match_field: "description".to_string(),
                match_type: "contains".to_string(),
                category_id: "cat-1".to_string(),
                priority: None,
                account_ids: Some(vec!["acct-1".to_string(), "acct-2".to_string()]),
                amount_min: None,
                amount_max: None,
                auto_apply: None,
            },
        )
        .unwrap();

        assert_eq!(rule.account_ids.len(), 2);
        assert!(rule.account_ids.contains(&"acct-1".to_string()));
        assert!(rule.account_ids.contains(&"acct-2".to_string()));

        // Verify via list
        let rules = list_rules(&conn).unwrap();
        assert_eq!(rules[0].account_ids.len(), 2);
    }

    #[test]
    fn test_update_rule_account_ids() {
        let conn = setup_db_with_categories();
        insert_test_account(&conn, "acct-1");
        insert_test_account(&conn, "acct-2");

        let rule = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "STORE".to_string(),
                match_field: "description".to_string(),
                match_type: "contains".to_string(),
                category_id: "cat-1".to_string(),
                priority: None,
                account_ids: Some(vec!["acct-1".to_string()]),
                amount_min: None,
                amount_max: None,
                auto_apply: None,
            },
        )
        .unwrap();

        assert_eq!(rule.account_ids, vec!["acct-1".to_string()]);

        // Update to both accounts
        let updated = update_rule(
            &conn,
            &rule.id,
            UpdateRuleParams {
                pattern: None,
                match_field: None,
                match_type: None,
                category_id: None,
                account_ids: Some(vec!["acct-1".to_string(), "acct-2".to_string()]),
                priority: None,
                amount_min: None,
                amount_max: None,
                auto_apply: None,
            },
        )
        .unwrap();

        assert_eq!(updated.account_ids.len(), 2);

        // Clear to empty (all accounts)
        let cleared = update_rule(
            &conn,
            &rule.id,
            UpdateRuleParams {
                pattern: None,
                match_field: None,
                match_type: None,
                category_id: None,
                account_ids: Some(vec![]),
                priority: None,
                amount_min: None,
                amount_max: None,
                auto_apply: None,
            },
        )
        .unwrap();

        assert!(cleared.account_ids.is_empty());
    }

    #[test]
    fn test_delete_rule_cascades_rule_accounts() {
        let conn = setup_db_with_categories();
        insert_test_account(&conn, "acct-1");

        let rule = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "TEST".to_string(),
                match_field: "description".to_string(),
                match_type: "contains".to_string(),
                category_id: "cat-1".to_string(),
                priority: None,
                account_ids: Some(vec!["acct-1".to_string()]),
                amount_min: None,
                amount_max: None,
                auto_apply: None,
            },
        )
        .unwrap();

        delete_rule(&conn, &rule.id).unwrap();

        // Verify junction table is clean
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM rule_accounts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
