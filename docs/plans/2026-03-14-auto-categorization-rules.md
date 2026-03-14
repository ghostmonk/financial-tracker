# Auto-Categorization Rule Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rule engine that auto-categorizes transactions by matching description/payee patterns, with grouped uncategorized transaction view, post-import rule application, and full re-apply after rule edits.

**Architecture:** New `categorization_rule` Rust model with CRUD + matching logic. New `categorize` module for normalization and rule evaluation. Schema migration adds `categorized_by_rule` column to transactions. Frontend gets two new pages: uncategorized groups workspace and rules management. Import pipeline calls rule application after inserting transactions.

**Tech Stack:** Rust (rusqlite, serde, regex for normalization), React + TypeScript + Tailwind, Tauri IPC

---

## Task 1: Schema Migration — Add `categorized_by_rule` Column

**Files:**
- Modify: `src-tauri/src/schema.sql`

**Step 1: Add column to transactions table**

In `src-tauri/src/schema.sql`, add `categorized_by_rule` to the transactions CREATE TABLE (after `transaction_type`):

```sql
categorized_by_rule INTEGER NOT NULL DEFAULT 0,
```

The full transactions table definition becomes:

```sql
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    payee TEXT,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    is_business INTEGER NOT NULL DEFAULT 0,
    tax_deductible INTEGER NOT NULL DEFAULT 0,
    gst_amount REAL,
    qst_amount REAL,
    notes TEXT,
    import_hash TEXT,
    fitid TEXT,
    transaction_type TEXT,
    categorized_by_rule INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Step 2: Handle existing databases**

In `src-tauri/src/db.rs`, after `initialize_schema()` in the `Database::open` flow, add a migration that adds the column if it doesn't exist. The app uses `CREATE TABLE IF NOT EXISTS`, so for existing databases we need an ALTER TABLE. Add this after `conn.execute_batch(schema)`:

```rust
// Migration: add categorized_by_rule if missing
conn.execute_batch(
    "ALTER TABLE transactions ADD COLUMN categorized_by_rule INTEGER NOT NULL DEFAULT 0;"
).ok(); // .ok() ignores "duplicate column" error on subsequent runs
```

This goes in `src-tauri/src/db.rs` inside `initialize_schema()` (line 39-44), after the schema execution.

**Step 3: Verify**

Run: `cargo build` from `src-tauri/`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src-tauri/src/schema.sql src-tauri/src/db.rs
git commit -m "schema: add categorized_by_rule column to transactions"
```

---

## Task 2: Rust Model — CategorizationRule CRUD

**Files:**
- Create: `src-tauri/src/models/categorization_rule.rs`
- Modify: `src-tauri/src/models/mod.rs` (line 3, add module export)

**Step 1: Write tests for the model**

Create `src-tauri/src/models/categorization_rule.rs` with test module first:

```rust
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorizationRule {
    pub id: String,
    pub pattern: String,
    pub match_field: String,
    pub match_type: String,
    pub category_id: String,
    pub priority: i32,
    pub auto_apply: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRuleParams {
    pub pattern: String,
    pub match_field: String,
    pub match_type: String,
    pub category_id: String,
    pub priority: Option<i32>,
    pub auto_apply: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRuleParams {
    pub pattern: Option<String>,
    pub match_field: Option<String>,
    pub match_type: Option<String>,
    pub category_id: Option<String>,
    pub priority: Option<i32>,
    pub auto_apply: Option<bool>,
}

const SELECT_COLS: &str = "id, pattern, match_field, match_type, category_id, priority, auto_apply, created_at";

fn row_to_rule(row: &rusqlite::Row) -> rusqlite::Result<CategorizationRule> {
    Ok(CategorizationRule {
        id: row.get(0)?,
        pattern: row.get(1)?,
        match_field: row.get(2)?,
        match_type: row.get(3)?,
        category_id: row.get(4)?,
        priority: row.get(5)?,
        auto_apply: row.get(6)?,
        created_at: row.get(7)?,
    })
}

pub fn create_rule(conn: &Connection, params: CreateRuleParams) -> Result<CategorizationRule, DbError> {
    let id = Uuid::new_v4().to_string();
    let priority = params.priority.unwrap_or(0);
    let auto_apply = params.auto_apply.unwrap_or(true);
    conn.execute(
        "INSERT INTO categorization_rules (id, pattern, match_field, match_type, category_id, priority, auto_apply) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, params.pattern, params.match_field, params.match_type, params.category_id, priority, auto_apply],
    )?;
    let mut stmt = conn.prepare(&format!("SELECT {} FROM categorization_rules WHERE id = ?1", SELECT_COLS))?;
    Ok(stmt.query_row(rusqlite::params![&id], row_to_rule)?)
}

pub fn list_rules(conn: &Connection) -> Result<Vec<CategorizationRule>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM categorization_rules ORDER BY priority DESC, created_at ASC",
        SELECT_COLS
    ))?;
    let rules = stmt.query_map([], row_to_rule)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rules)
}

pub fn update_rule(conn: &Connection, id: &str, params: UpdateRuleParams) -> Result<CategorizationRule, DbError> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref pattern) = params.pattern {
        sets.push("pattern = ?");
        values.push(Box::new(pattern.clone()));
    }
    if let Some(ref match_field) = params.match_field {
        sets.push("match_field = ?");
        values.push(Box::new(match_field.clone()));
    }
    if let Some(ref match_type) = params.match_type {
        sets.push("match_type = ?");
        values.push(Box::new(match_type.clone()));
    }
    if let Some(ref category_id) = params.category_id {
        sets.push("category_id = ?");
        values.push(Box::new(category_id.clone()));
    }
    if let Some(priority) = params.priority {
        sets.push("priority = ?");
        values.push(Box::new(priority));
    }
    if let Some(auto_apply) = params.auto_apply {
        sets.push("auto_apply = ?");
        values.push(Box::new(auto_apply));
    }

    if !sets.is_empty() {
        values.push(Box::new(id.to_string()));
        let sql = format!("UPDATE categorization_rules SET {} WHERE id = ?", sets.join(", "));
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())?;
    }

    let mut stmt = conn.prepare(&format!("SELECT {} FROM categorization_rules WHERE id = ?1", SELECT_COLS))?;
    Ok(stmt.query_row(params![id], row_to_rule)?)
}

pub fn delete_rule(conn: &Connection, id: &str) -> Result<(), DbError> {
    conn.execute("DELETE FROM categorization_rules WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let schema = include_str!("../schema.sql");
        conn.execute_batch(schema).unwrap();
        conn.execute(
            "INSERT INTO categories (id, name, category_type) VALUES (?1, ?2, ?3)",
            params!["cat-dining", "Dining Out", "expense"],
        ).unwrap();
        conn.execute(
            "INSERT INTO categories (id, name, category_type) VALUES (?1, ?2, ?3)",
            params!["cat-groceries", "Groceries", "expense"],
        ).unwrap();
        conn
    }

    #[test]
    fn test_create_and_list_rules() {
        let conn = setup_db();
        let rule = create_rule(&conn, CreateRuleParams {
            pattern: "MCDONALD'S".to_string(),
            match_field: "description".to_string(),
            match_type: "contains".to_string(),
            category_id: "cat-dining".to_string(),
            priority: Some(10),
            auto_apply: None,
        }).unwrap();
        assert_eq!(rule.pattern, "MCDONALD'S");
        assert!(rule.auto_apply);

        let rules = list_rules(&conn).unwrap();
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].priority, 10);
    }

    #[test]
    fn test_update_rule() {
        let conn = setup_db();
        let rule = create_rule(&conn, CreateRuleParams {
            pattern: "MAXI".to_string(),
            match_field: "description".to_string(),
            match_type: "contains".to_string(),
            category_id: "cat-dining".to_string(),
            priority: None,
            auto_apply: None,
        }).unwrap();

        let updated = update_rule(&conn, &rule.id, UpdateRuleParams {
            category_id: Some("cat-groceries".to_string()),
            pattern: None,
            match_field: None,
            match_type: None,
            priority: Some(5),
            auto_apply: None,
        }).unwrap();
        assert_eq!(updated.category_id, "cat-groceries");
        assert_eq!(updated.priority, 5);
    }

    #[test]
    fn test_delete_rule() {
        let conn = setup_db();
        let rule = create_rule(&conn, CreateRuleParams {
            pattern: "TEST".to_string(),
            match_field: "description".to_string(),
            match_type: "contains".to_string(),
            category_id: "cat-dining".to_string(),
            priority: None,
            auto_apply: None,
        }).unwrap();
        delete_rule(&conn, &rule.id).unwrap();
        let rules = list_rules(&conn).unwrap();
        assert!(rules.is_empty());
    }
}
```

**Step 2: Register module**

In `src-tauri/src/models/mod.rs` (currently lines 1-3), add:

```rust
pub mod categorization_rule;
```

**Step 3: Run tests**

Run: `cd src-tauri && cargo test models::categorization_rule`
Expected: All 3 tests pass

**Step 4: Commit**

```bash
git add src-tauri/src/models/categorization_rule.rs src-tauri/src/models/mod.rs
git commit -m "feat: categorization rule model with CRUD operations"
```

---

## Task 3: Rust — Rule Matching Engine

**Files:**
- Create: `src-tauri/src/categorize.rs`
- Modify: `src-tauri/src/lib.rs` (line 3, add `mod categorize;`)

This module handles: normalizing merchant names for grouping, evaluating rules against transactions, and applying rules in bulk.

**Step 1: Write the module with tests**

Create `src-tauri/src/categorize.rs`:

```rust
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::db::DbError;
use crate::models::categorization_rule::CategorizationRule;

/// Normalize a merchant name for grouping purposes.
/// Strips trailing store numbers (#XXX), long numeric references, and trims.
/// The original transaction data is never modified.
pub fn normalize_merchant_name(description: &str, payee: Option<&str>) -> String {
    // Prefer description (NAME field in OFX), fall back to first segment of payee (MEMO)
    let raw = if !description.is_empty() {
        description
    } else if let Some(p) = payee {
        p.split(';').next().unwrap_or(p)
    } else {
        return String::new();
    };

    let mut name = raw.trim().to_uppercase();

    // Strip trailing store/location numbers: "#1234", "# 1234"
    if let Some(idx) = name.find('#') {
        let after_hash = name[idx + 1..].trim();
        if after_hash.chars().all(|c| c.is_ascii_digit()) {
            name = name[..idx].trim().to_string();
        }
    }

    // Strip trailing long numeric sequences (9+ digits, like reference numbers)
    let words: Vec<&str> = name.split_whitespace().collect();
    if words.len() > 1 {
        if let Some(last) = words.last() {
            if last.len() >= 9 && last.chars().all(|c| c.is_ascii_digit()) {
                name = words[..words.len() - 1].join(" ");
            }
        }
    }

    name.trim().to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UncategorizedGroup {
    pub normalized_name: String,
    pub transaction_count: i64,
    pub total_amount: f64,
    pub sample_description: String,
    pub account_ids: Vec<String>,
}

/// Get uncategorized transactions grouped by normalized merchant name.
/// Groups across all accounts, with optional account filter.
pub fn get_uncategorized_groups(
    conn: &Connection,
    account_id: Option<&str>,
) -> Result<Vec<UncategorizedGroup>, DbError> {
    let mut sql = String::from(
        "SELECT description, payee, amount, account_id FROM transactions WHERE category_id IS NULL"
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(acct) = account_id {
        sql.push_str(" AND account_id = ?1");
        param_values.push(Box::new(acct.to_string()));
    }

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|v| v.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;

    let mut groups: std::collections::HashMap<String, UncategorizedGroup> =
        std::collections::HashMap::new();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;

    for row in rows {
        let (description, payee, amount, acct_id) = row?;
        let normalized = normalize_merchant_name(&description, payee.as_deref());
        let key = if normalized.is_empty() {
            description.clone()
        } else {
            normalized.clone()
        };

        let group = groups.entry(key.clone()).or_insert_with(|| UncategorizedGroup {
            normalized_name: if normalized.is_empty() { description.clone() } else { normalized },
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

/// Match a single transaction against a rule. Returns true if the rule matches.
fn rule_matches(rule: &CategorizationRule, description: &str, payee: Option<&str>) -> bool {
    let field_value = match rule.match_field.as_str() {
        "description" => description,
        "payee" => match payee {
            Some(p) => p,
            None => return false,
        },
        _ => return false,
    };

    let field_upper = field_value.to_uppercase();
    let pattern_upper = rule.pattern.to_uppercase();

    match rule.match_type.as_str() {
        "contains" => field_upper.contains(&pattern_upper),
        "starts_with" => field_upper.starts_with(&pattern_upper),
        "exact" => field_upper == pattern_upper,
        _ => false,
    }
}

/// Apply all auto_apply rules to a set of transaction IDs (e.g. after import).
/// Only affects transactions that are currently uncategorized.
/// Returns the number of transactions categorized.
pub fn apply_rules_to_transactions(
    conn: &Connection,
    transaction_ids: &[String],
) -> Result<usize, DbError> {
    if transaction_ids.is_empty() {
        return Ok(0);
    }

    // Load all auto_apply rules ordered by priority DESC
    let mut rule_stmt = conn.prepare(
        "SELECT id, pattern, match_field, match_type, category_id, priority, auto_apply, created_at \
         FROM categorization_rules WHERE auto_apply = 1 ORDER BY priority DESC"
    )?;
    let rules: Vec<CategorizationRule> = rule_stmt
        .query_map([], |row| {
            Ok(CategorizationRule {
                id: row.get(0)?,
                pattern: row.get(1)?,
                match_field: row.get(2)?,
                match_type: row.get(3)?,
                category_id: row.get(4)?,
                priority: row.get(5)?,
                auto_apply: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    if rules.is_empty() {
        return Ok(0);
    }

    // Fetch uncategorized transactions from the given IDs
    let placeholders: Vec<String> = (0..transaction_ids.len()).map(|i| format!("?{}", i + 1)).collect();
    let sql = format!(
        "SELECT id, description, payee FROM transactions WHERE category_id IS NULL AND id IN ({})",
        placeholders.join(", ")
    );
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    for id in transaction_ids {
        values.push(Box::new(id.clone()));
    }
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();

    let mut stmt = conn.prepare(&sql)?;
    let txns: Vec<(String, String, Option<String>)> = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut categorized = 0usize;
    for (tx_id, description, payee) in &txns {
        for rule in &rules {
            if rule_matches(rule, description, payee.as_deref()) {
                conn.execute(
                    "UPDATE transactions SET category_id = ?1, categorized_by_rule = 1, updated_at = datetime('now') WHERE id = ?2",
                    params![rule.category_id, tx_id],
                )?;
                categorized += 1;
                break; // First matching rule wins (highest priority)
            }
        }
    }

    Ok(categorized)
}

/// Re-apply all rules from scratch.
/// 1. Clear all rule-applied categorizations
/// 2. Run every auto_apply rule against all transactions
/// Returns the number of transactions categorized.
pub fn reapply_all_rules(conn: &Connection) -> Result<usize, DbError> {
    // Step 1: Clear rule-applied categories
    conn.execute(
        "UPDATE transactions SET category_id = NULL, categorized_by_rule = 0, updated_at = datetime('now') \
         WHERE categorized_by_rule = 1",
        [],
    )?;

    // Step 2: Load all auto_apply rules
    let mut rule_stmt = conn.prepare(
        "SELECT id, pattern, match_field, match_type, category_id, priority, auto_apply, created_at \
         FROM categorization_rules WHERE auto_apply = 1 ORDER BY priority DESC"
    )?;
    let rules: Vec<CategorizationRule> = rule_stmt
        .query_map([], |row| {
            Ok(CategorizationRule {
                id: row.get(0)?,
                pattern: row.get(1)?,
                match_field: row.get(2)?,
                match_type: row.get(3)?,
                category_id: row.get(4)?,
                priority: row.get(5)?,
                auto_apply: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    if rules.is_empty() {
        return Ok(0);
    }

    // Step 3: Fetch all uncategorized transactions
    let mut stmt = conn.prepare("SELECT id, description, payee FROM transactions WHERE category_id IS NULL")?;
    let txns: Vec<(String, String, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut categorized = 0usize;
    for (tx_id, description, payee) in &txns {
        for rule in &rules {
            if rule_matches(rule, description, payee.as_deref()) {
                conn.execute(
                    "UPDATE transactions SET category_id = ?1, categorized_by_rule = 1, updated_at = datetime('now') WHERE id = ?2",
                    params![rule.category_id, tx_id],
                )?;
                categorized += 1;
                break;
            }
        }
    }

    Ok(categorized)
}

/// Count of uncategorized transaction groups (for badge display).
pub fn count_uncategorized_groups(conn: &Connection) -> Result<i64, DbError> {
    // We do the grouping in Rust via normalize_merchant_name, so we query raw then group
    let mut stmt = conn.prepare(
        "SELECT description, payee FROM transactions WHERE category_id IS NULL"
    )?;
    let mut groups: std::collections::HashSet<String> = std::collections::HashSet::new();

    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
    })?;

    for row in rows {
        let (description, payee) = row?;
        let normalized = normalize_merchant_name(&description, payee.as_deref());
        let key = if normalized.is_empty() { description } else { normalized };
        groups.insert(key);
    }

    Ok(groups.len() as i64)
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
        conn.execute(
            "INSERT INTO accounts (id, name, account_type, currency) VALUES (?1, ?2, ?3, ?4)",
            params!["acct-1", "Test Checking", "checking", "CAD"],
        ).unwrap();
        conn.execute(
            "INSERT INTO accounts (id, name, account_type, currency) VALUES (?1, ?2, ?3, ?4)",
            params!["acct-2", "Test Credit", "credit_card", "CAD"],
        ).unwrap();
        conn.execute(
            "INSERT INTO categories (id, name, category_type) VALUES (?1, ?2, ?3)",
            params!["cat-dining", "Dining Out", "expense"],
        ).unwrap();
        conn.execute(
            "INSERT INTO categories (id, name, category_type) VALUES (?1, ?2, ?3)",
            params!["cat-groceries", "Groceries", "expense"],
        ).unwrap();
        conn.execute(
            "INSERT INTO categories (id, name, category_type) VALUES (?1, ?2, ?3)",
            params!["cat-gas", "Gas", "expense"],
        ).unwrap();
        conn
    }

    fn insert_tx(conn: &Connection, id: &str, desc: &str, payee: Option<&str>, account: &str) {
        conn.execute(
            "INSERT INTO transactions (id, date, amount, description, payee, account_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, "2026-01-15", -10.0, desc, payee, account],
        ).unwrap();
    }

    // --- Normalization tests ---

    #[test]
    fn test_normalize_strips_store_number() {
        assert_eq!(normalize_merchant_name("MCDONALD'S #148", None), "MCDONALD'S");
        assert_eq!(normalize_merchant_name("TIM HORTONS #22", None), "TIM HORTONS");
        assert_eq!(normalize_merchant_name("DOLLARAMA # 176", None), "DOLLARAMA");
    }

    #[test]
    fn test_normalize_strips_long_reference_numbers() {
        assert_eq!(normalize_merchant_name("HAMFIT 607115539888", None), "HAMFIT");
    }

    #[test]
    fn test_normalize_preserves_location_names() {
        assert_eq!(normalize_merchant_name("MAXI ST-LAMBERT", None), "MAXI ST-LAMBERT");
        assert_eq!(normalize_merchant_name("EXCELSO-BELL-V", None), "EXCELSO-BELL-V");
    }

    #[test]
    fn test_normalize_empty_description_uses_payee() {
        assert_eq!(
            normalize_merchant_name("", Some("E-TRANSFER 105857783212;Tracey RBC;Internet Banking")),
            "E-TRANSFER 105857783212"
        );
    }

    // --- Rule matching tests ---

    #[test]
    fn test_rule_matches_contains() {
        let rule = CategorizationRule {
            id: "r1".into(), pattern: "MCDONALD'S".into(), match_field: "description".into(),
            match_type: "contains".into(), category_id: "cat-1".into(), priority: 0,
            auto_apply: true, created_at: String::new(),
        };
        assert!(rule_matches(&rule, "MCDONALD'S #148", None));
        assert!(rule_matches(&rule, "mcdonald's #400", None));
        assert!(!rule_matches(&rule, "BURGER KING", None));
    }

    #[test]
    fn test_rule_matches_starts_with() {
        let rule = CategorizationRule {
            id: "r1".into(), pattern: "MAXI".into(), match_field: "description".into(),
            match_type: "starts_with".into(), category_id: "cat-1".into(), priority: 0,
            auto_apply: true, created_at: String::new(),
        };
        assert!(rule_matches(&rule, "MAXI ST-LAMBERT", None));
        assert!(rule_matches(&rule, "MAXI #8911", None));
        assert!(!rule_matches(&rule, "SUPER MAXI", None));
    }

    #[test]
    fn test_rule_matches_exact() {
        let rule = CategorizationRule {
            id: "r1".into(), pattern: "MARCHE MILENA".into(), match_field: "description".into(),
            match_type: "exact".into(), category_id: "cat-1".into(), priority: 0,
            auto_apply: true, created_at: String::new(),
        };
        assert!(rule_matches(&rule, "MARCHE MILENA", None));
        assert!(rule_matches(&rule, "marche milena", None));
        assert!(!rule_matches(&rule, "MARCHE MILENA EXTRA", None));
    }

    #[test]
    fn test_rule_matches_payee_field() {
        let rule = CategorizationRule {
            id: "r1".into(), pattern: "Tracey RBC".into(), match_field: "payee".into(),
            match_type: "contains".into(), category_id: "cat-1".into(), priority: 0,
            auto_apply: true, created_at: String::new(),
        };
        assert!(rule_matches(&rule, "some desc", Some("E-TRANSFER 123;Tracey RBC;Internet Banking")));
        assert!(!rule_matches(&rule, "some desc", None));
    }

    // --- Apply rules tests ---

    #[test]
    fn test_apply_rules_to_transactions() {
        let conn = setup_db();
        insert_tx(&conn, "tx1", "MCDONALD'S #148", None, "acct-1");
        insert_tx(&conn, "tx2", "MAXI ST-LAMBERT", None, "acct-1");
        insert_tx(&conn, "tx3", "RANDOM STORE", None, "acct-1");

        // Create rules
        conn.execute(
            "INSERT INTO categorization_rules (id, pattern, match_field, match_type, category_id, priority, auto_apply) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["r1", "MCDONALD'S", "description", "contains", "cat-dining", 0, true],
        ).unwrap();
        conn.execute(
            "INSERT INTO categorization_rules (id, pattern, match_field, match_type, category_id, priority, auto_apply) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["r2", "MAXI", "description", "starts_with", "cat-groceries", 0, true],
        ).unwrap();

        let ids = vec!["tx1".into(), "tx2".into(), "tx3".into()];
        let count = apply_rules_to_transactions(&conn, &ids).unwrap();
        assert_eq!(count, 2);

        // Verify tx1 got dining
        let cat: Option<String> = conn.query_row(
            "SELECT category_id FROM transactions WHERE id = 'tx1'", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(cat, Some("cat-dining".to_string()));

        // Verify tx1 flagged as rule-applied
        let flag: bool = conn.query_row(
            "SELECT categorized_by_rule FROM transactions WHERE id = 'tx1'", [], |r| r.get(0)
        ).unwrap();
        assert!(flag);

        // Verify tx3 still uncategorized
        let cat3: Option<String> = conn.query_row(
            "SELECT category_id FROM transactions WHERE id = 'tx3'", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(cat3, None);
    }

    #[test]
    fn test_reapply_all_rules() {
        let conn = setup_db();
        insert_tx(&conn, "tx1", "MCDONALD'S #148", None, "acct-1");
        insert_tx(&conn, "tx2", "ULTRAMAR # 4219", None, "acct-1");

        // Manually categorize tx1 (not by rule)
        conn.execute(
            "UPDATE transactions SET category_id = 'cat-dining', categorized_by_rule = 0 WHERE id = 'tx1'",
            [],
        ).unwrap();

        // Rule-categorize tx2
        conn.execute(
            "UPDATE transactions SET category_id = 'cat-gas', categorized_by_rule = 1 WHERE id = 'tx2'",
            [],
        ).unwrap();

        // Now change the rule: ULTRAMAR should be dining (simulating rule edit)
        conn.execute(
            "INSERT INTO categorization_rules (id, pattern, match_field, match_type, category_id, priority, auto_apply) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["r1", "ULTRAMAR", "description", "starts_with", "cat-dining", 0, true],
        ).unwrap();

        let count = reapply_all_rules(&conn).unwrap();

        // tx2 was rule-applied, so it got cleared then re-applied with new rule -> dining
        let cat2: Option<String> = conn.query_row(
            "SELECT category_id FROM transactions WHERE id = 'tx2'", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(cat2, Some("cat-dining".to_string()));

        // tx1 was manually categorized, so it stayed as dining (untouched)
        let cat1: Option<String> = conn.query_row(
            "SELECT category_id FROM transactions WHERE id = 'tx1'", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(cat1, Some("cat-dining".to_string()));

        // Only tx2 was re-categorized (tx1 was manual, kept)
        assert_eq!(count, 1);
    }

    // --- Grouping tests ---

    #[test]
    fn test_uncategorized_groups() {
        let conn = setup_db();
        insert_tx(&conn, "tx1", "MCDONALD'S #148", None, "acct-1");
        insert_tx(&conn, "tx2", "MCDONALD'S #400", None, "acct-1");
        insert_tx(&conn, "tx3", "MCDONALD'S #888", None, "acct-2");
        insert_tx(&conn, "tx4", "MAXI ST-LAMBERT", None, "acct-1");
        insert_tx(&conn, "tx5", "MAXI #8911", None, "acct-1");

        let groups = get_uncategorized_groups(&conn, None).unwrap();
        // MCDONALD'S group: 3 txns, MAXI group: 2 txns (MAXI ST-LAMBERT and MAXI don't merge because
        // ST-LAMBERT is not a store number — but MAXI #8911 normalizes to MAXI)
        // So we get: MCDONALD'S (3), MAXI ST-LAMBERT (1), MAXI (1)
        // Actually: "MAXI ST-LAMBERT" normalizes to "MAXI ST-LAMBERT", "MAXI #8911" normalizes to "MAXI"
        // These are different keys. That's correct — they are different stores.
        assert_eq!(groups.len(), 3);
        assert_eq!(groups[0].normalized_name, "MCDONALD'S"); // highest count
        assert_eq!(groups[0].transaction_count, 3);
        assert_eq!(groups[0].account_ids.len(), 2); // across 2 accounts
    }

    #[test]
    fn test_uncategorized_groups_filter_by_account() {
        let conn = setup_db();
        insert_tx(&conn, "tx1", "MCDONALD'S #148", None, "acct-1");
        insert_tx(&conn, "tx2", "MCDONALD'S #400", None, "acct-2");

        let groups = get_uncategorized_groups(&conn, Some("acct-1")).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].transaction_count, 1);
    }

    #[test]
    fn test_count_uncategorized_groups() {
        let conn = setup_db();
        insert_tx(&conn, "tx1", "MCDONALD'S #148", None, "acct-1");
        insert_tx(&conn, "tx2", "MCDONALD'S #400", None, "acct-1");
        insert_tx(&conn, "tx3", "STARBUCKS COFFE", None, "acct-1");

        let count = count_uncategorized_groups(&conn).unwrap();
        assert_eq!(count, 2); // MCDONALD'S group + STARBUCKS COFFE group
    }
}
```

**Step 2: Register module in lib.rs**

In `src-tauri/src/lib.rs` line 3, add:

```rust
mod categorize;
```

So lines 1-4 become:

```rust
mod commands;
mod categorize;
mod db;
mod import;
mod models;
```

**Step 3: Run tests**

Run: `cd src-tauri && cargo test categorize::tests`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src-tauri/src/categorize.rs src-tauri/src/lib.rs
git commit -m "feat: rule matching engine with normalization and grouped uncategorized view"
```

---

## Task 4: Rust — Tauri Commands for Rules & Categorization

**Files:**
- Create: `src-tauri/src/commands/rules.rs`
- Modify: `src-tauri/src/commands/mod.rs` (line 5, add `pub mod rules;`)
- Modify: `src-tauri/src/lib.rs` (lines 22-46, register new commands)

**Step 1: Create commands file**

Create `src-tauri/src/commands/rules.rs`:

```rust
use tauri::State;

use crate::categorize;
use crate::models::categorization_rule::{
    self, CategorizationRule, CreateRuleParams, UpdateRuleParams,
};
use crate::AppState;

use super::with_db_conn;

#[tauri::command(rename_all = "snake_case")]
pub fn list_categorization_rules(
    state: State<'_, AppState>,
) -> Result<Vec<CategorizationRule>, String> {
    with_db_conn(&state, |conn| {
        categorization_rule::list_rules(conn).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_categorization_rule(
    state: State<'_, AppState>,
    params: CreateRuleParams,
) -> Result<CategorizationRule, String> {
    with_db_conn(&state, |conn| {
        categorization_rule::create_rule(conn, params).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_categorization_rule(
    state: State<'_, AppState>,
    id: String,
    params: UpdateRuleParams,
) -> Result<CategorizationRule, String> {
    with_db_conn(&state, |conn| {
        categorization_rule::update_rule(conn, &id, params).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_categorization_rule(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        categorization_rule::delete_rule(conn, &id).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_uncategorized_groups(
    state: State<'_, AppState>,
    account_id: Option<String>,
) -> Result<Vec<categorize::UncategorizedGroup>, String> {
    with_db_conn(&state, |conn| {
        categorize::get_uncategorized_groups(conn, account_id.as_deref())
            .map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn count_uncategorized_groups(
    state: State<'_, AppState>,
) -> Result<i64, String> {
    with_db_conn(&state, |conn| {
        categorize::count_uncategorized_groups(conn).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn apply_rules_to_transaction_ids(
    state: State<'_, AppState>,
    transaction_ids: Vec<String>,
) -> Result<usize, String> {
    with_db_conn(&state, |conn| {
        categorize::apply_rules_to_transactions(conn, &transaction_ids)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn reapply_all_rules(state: State<'_, AppState>) -> Result<usize, String> {
    with_db_conn(&state, |conn| {
        categorize::reapply_all_rules(conn).map_err(|e| e.to_string())
    })
}
```

**Step 2: Register module in commands/mod.rs**

Add `pub mod rules;` to `src-tauri/src/commands/mod.rs` (after line 5):

```rust
pub mod accounts;
pub mod categories;
pub mod database;
pub mod import;
pub mod rules;
pub mod transactions;
```

**Step 3: Register commands in lib.rs**

In `src-tauri/src/lib.rs`, add the new commands to the `generate_handler!` block (after line 45):

```rust
// Rules & Categorization
commands::rules::list_categorization_rules,
commands::rules::create_categorization_rule,
commands::rules::update_categorization_rule,
commands::rules::delete_categorization_rule,
commands::rules::get_uncategorized_groups,
commands::rules::count_uncategorized_groups,
commands::rules::apply_rules_to_transaction_ids,
commands::rules::reapply_all_rules,
```

**Step 4: Build and verify**

Run: `cd src-tauri && cargo build`
Expected: Compiles without errors

Run: `cd src-tauri && cargo test`
Expected: All tests pass (existing + new)

**Step 5: Commit**

```bash
git add src-tauri/src/commands/rules.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: Tauri commands for rule CRUD, uncategorized groups, and rule application"
```

---

## Task 5: Integrate Rule Application Into Import Pipeline

**Files:**
- Modify: `src-tauri/src/import/pipeline.rs` (lines 84-153, `execute_import` function)
- Modify: `src-tauri/src/import/types.rs` (add `categorized_count` to result type if needed)

**Step 1: Update ImportResult to include categorized_count**

In `src-tauri/src/import/pipeline.rs`, update the `ImportResult` struct (lines 13-17):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported_count: usize,
    pub skipped_count: usize,
    pub categorized_count: usize,
}
```

**Step 2: Add rule application after batch insert**

In `execute_import()` (line 132), after `create_transactions_batch`, add rule application. The function needs to know the IDs of inserted transactions. Since `create_transactions_batch` doesn't return IDs, we need to modify the approach.

Change `execute_import` to generate UUIDs before insertion and pass them to the rule engine:

Replace lines 112-132 with:

```rust
    let mut ids: Vec<String> = Vec::new();
    let batch: Vec<CreateTransactionParams> = filtered
        .iter()
        .map(|tx| {
            let id = Uuid::new_v4().to_string();
            ids.push(id.clone());
            CreateTransactionParams {
                date: tx.date.clone(),
                amount: tx.amount,
                description: tx.description.clone(),
                payee: tx.payee.clone(),
                account_id: account_id.to_string(),
                category_id: None,
                is_business: None,
                tax_deductible: None,
                gst_amount: None,
                qst_amount: None,
                notes: None,
                import_hash: Some(tx.import_hash.clone()),
                fitid: tx.fitid.clone(),
                transaction_type: tx.transaction_type.clone(),
            }
        })
        .collect();

    let imported_count = create_transactions_batch(conn, batch)?;

    // Apply categorization rules to newly imported transactions
    let categorized_count = crate::categorize::apply_rules_to_transactions(conn, &ids)
        .unwrap_or(0);
```

And update the return (line 149-152):

```rust
    Ok(ImportResult {
        imported_count,
        skipped_count,
        categorized_count,
    })
```

**Step 3: Fix create_transactions_batch to accept pre-generated IDs**

Actually, `create_transactions_batch` generates its own UUIDs internally. We need to either:
- (a) Return the generated IDs from `create_transactions_batch`, or
- (b) Query the IDs back after insert using import_hash

Option (b) is simpler — after batch insert, query transaction IDs by import_hash for this batch:

Instead of tracking IDs through the batch function, after the insert, query:

```rust
    let imported_count = create_transactions_batch(conn, batch)?;

    // Get IDs of just-imported transactions for rule application
    let imported_hashes: Vec<String> = filtered.iter().map(|tx| tx.import_hash.clone()).collect();
    let imported_ids = get_transaction_ids_by_hashes(conn, &imported_hashes)?;

    let categorized_count = crate::categorize::apply_rules_to_transactions(conn, &imported_ids)
        .unwrap_or(0);
```

Add a helper function in `src-tauri/src/models/transaction.rs`:

```rust
pub fn get_transaction_ids_by_hashes(
    conn: &Connection,
    hashes: &[String],
) -> Result<Vec<String>, DbError> {
    if hashes.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders: Vec<String> = (0..hashes.len()).map(|i| format!("?{}", i + 1)).collect();
    let sql = format!(
        "SELECT id FROM transactions WHERE import_hash IN ({})",
        placeholders.join(", ")
    );
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    for hash in hashes {
        values.push(Box::new(hash.clone()));
    }
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let ids = stmt
        .query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(ids)
}
```

Update the import in `pipeline.rs` to include `get_transaction_ids_by_hashes`:

```rust
use crate::models::transaction::{
    check_duplicates_by_fitid, check_duplicates_by_hash, create_transactions_batch,
    get_transaction_ids_by_hashes, CreateTransactionParams,
};
```

**Step 4: Update frontend ImportResult type**

In `src/lib/types.ts`, update `ImportResult` (lines 137-140):

```typescript
export interface ImportResult {
  imported_count: number;
  skipped_count: number;
  categorized_count: number;
}
```

**Step 5: Update ImportResultStep to show categorized count**

In `src/components/import/ImportResultStep.tsx`, add a line showing how many were auto-categorized and how many remain uncategorized. Reference the existing component structure and add after the imported/skipped counts display.

**Step 6: Run tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass. Existing import tests may need `categorized_count: 0` added to assertions.

Update existing test assertions in `pipeline.rs` tests to include `categorized_count`:

```rust
assert_eq!(result.categorized_count, 0); // no rules exist in test
```

**Step 7: Commit**

```bash
git add src-tauri/src/import/pipeline.rs src-tauri/src/models/transaction.rs src/lib/types.ts src/components/import/ImportResultStep.tsx
git commit -m "feat: apply categorization rules during import, report categorized count"
```

---

## Task 6: Update Transaction Model for `categorized_by_rule`

**Files:**
- Modify: `src-tauri/src/models/transaction.rs`
- Modify: `src/lib/types.ts`

**Step 1: Add field to Rust Transaction struct**

In `src-tauri/src/models/transaction.rs`, add to `Transaction` struct (after `transaction_type` field, line 15):

```rust
pub categorized_by_rule: bool,
```

Update `SELECT_COLS` (line 74) to include `categorized_by_rule`:

```rust
const SELECT_COLS: &str = "id, date, amount, description, payee, account_id, category_id, \
                           is_business, tax_deductible, gst_amount, qst_amount, notes, \
                           import_hash, fitid, transaction_type, categorized_by_rule, created_at, updated_at";
```

Update `row_to_transaction` to read the new column (adjust indices — `categorized_by_rule` is now at index 15, `created_at` at 16, `updated_at` at 17):

```rust
fn row_to_transaction(row: &rusqlite::Row) -> rusqlite::Result<Transaction> {
    Ok(Transaction {
        id: row.get(0)?,
        date: row.get(1)?,
        amount: row.get(2)?,
        description: row.get(3)?,
        payee: row.get(4)?,
        account_id: row.get(5)?,
        category_id: row.get(6)?,
        is_business: row.get(7)?,
        tax_deductible: row.get(8)?,
        gst_amount: row.get(9)?,
        qst_amount: row.get(10)?,
        notes: row.get(11)?,
        import_hash: row.get(12)?,
        fitid: row.get(13)?,
        transaction_type: row.get(14)?,
        categorized_by_rule: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}
```

**Step 2: When user manually categorizes, clear the flag**

In `update_transactions_category` (line 322-344), change the UPDATE to also set `categorized_by_rule = 0`:

```rust
let sql = format!(
    "UPDATE transactions SET category_id = ?1, categorized_by_rule = 0, updated_at = datetime('now') WHERE id IN ({})",
    placeholders.join(", ")
);
```

**Step 3: Update TypeScript Transaction interface**

In `src/lib/types.ts`, add to `Transaction` interface (after `transaction_type`, line 68):

```typescript
categorized_by_rule: boolean;
```

**Step 4: Run tests**

Run: `cd src-tauri && cargo test`
Expected: All pass

**Step 5: Commit**

```bash
git add src-tauri/src/models/transaction.rs src/lib/types.ts
git commit -m "feat: expose categorized_by_rule flag on transaction model"
```

---

## Task 7: Frontend — TypeScript Types & API Layer for Rules

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/tauri.ts`

**Step 1: Add TypeScript types for rules and groups**

In `src/lib/types.ts`, add after the `ImportResult` interface (after line 140):

```typescript
export interface CategorizationRule {
  id: string;
  pattern: string;
  match_field: string;
  match_type: string;
  category_id: string;
  priority: number;
  auto_apply: boolean;
  created_at: string;
}

export interface CreateRuleParams {
  pattern: string;
  match_field: string;
  match_type: string;
  category_id: string;
  priority?: number;
  auto_apply?: boolean;
}

export interface UpdateRuleParams {
  pattern?: string;
  match_field?: string;
  match_type?: string;
  category_id?: string;
  priority?: number;
  auto_apply?: boolean;
}

export interface UncategorizedGroup {
  normalized_name: string;
  transaction_count: number;
  total_amount: number;
  sample_description: string;
  account_ids: string[];
}
```

**Step 2: Add Tauri invoke wrappers**

In `src/lib/tauri.ts`, add the type imports and API functions. Add to the import block (lines 2-17) the new types:

```typescript
import type {
  // ... existing imports ...
  CategorizationRule,
  CreateRuleParams,
  UpdateRuleParams,
  UncategorizedGroup,
} from "./types";
```

Add to the re-export block (lines 19-34):

```typescript
export type {
  // ... existing exports ...
  CategorizationRule,
  CreateRuleParams,
  UpdateRuleParams,
  UncategorizedGroup,
};
```

Add API functions at the end of the file:

```typescript
// Categorization Rules

export async function listCategorizationRules(): Promise<CategorizationRule[]> {
  return invoke("list_categorization_rules");
}

export async function createCategorizationRule(
  params: CreateRuleParams,
): Promise<CategorizationRule> {
  return invoke("create_categorization_rule", { params });
}

export async function updateCategorizationRule(
  id: string,
  params: UpdateRuleParams,
): Promise<CategorizationRule> {
  return invoke("update_categorization_rule", { id, params });
}

export async function deleteCategorizationRule(id: string): Promise<void> {
  return invoke("delete_categorization_rule", { id });
}

export async function getUncategorizedGroups(
  accountId?: string,
): Promise<UncategorizedGroup[]> {
  return invoke("get_uncategorized_groups", {
    account_id: accountId ?? null,
  });
}

export async function countUncategorizedGroups(): Promise<number> {
  return invoke("count_uncategorized_groups");
}

export async function applyRulesToTransactionIds(
  transactionIds: string[],
): Promise<number> {
  return invoke("apply_rules_to_transaction_ids", {
    transaction_ids: transactionIds,
  });
}

export async function reapplyAllRules(): Promise<number> {
  return invoke("reapply_all_rules");
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/tauri.ts
git commit -m "feat: TypeScript types and Tauri API wrappers for rules and categorization"
```

---

## Task 8: Frontend — Uncategorized Groups Page (Categorize Page)

**Files:**
- Create: `src/pages/CategorizePage.tsx`
- Create: `src/components/categorize/UncategorizedGroupList.tsx`
- Create: `src/components/categorize/GroupCategorizeDialog.tsx`

**Step 1: Create UncategorizedGroupList component**

Create `src/components/categorize/UncategorizedGroupList.tsx`:

This component renders the grouped uncategorized transactions as a table. Each row shows: normalized name, transaction count, total amount, accounts involved, and a "Categorize" button. Follows the same Tailwind patterns as `TransactionTable.tsx` (dark mode classes, table layout, etc.).

```typescript
import type { UncategorizedGroup, Account } from "../../lib/tauri";

interface Props {
  groups: UncategorizedGroup[];
  accounts: Account[];
  onCategorize: (group: UncategorizedGroup) => void;
}

export default function UncategorizedGroupList({ groups, accounts, onCategorize }: Props) {
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  const formatAmount = (amount: number) => {
    const abs = Math.abs(amount);
    const formatted = abs.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return amount < 0 ? `-$${formatted}` : `$${formatted}`;
  };

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        All transactions are categorized.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
            <th className="py-3 px-4 font-medium">Merchant</th>
            <th className="py-3 px-4 font-medium text-right">Transactions</th>
            <th className="py-3 px-4 font-medium text-right">Total</th>
            <th className="py-3 px-4 font-medium">Accounts</th>
            <th className="py-3 px-4 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr
              key={group.normalized_name}
              className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <td className="py-3 px-4">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {group.normalized_name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {group.sample_description}
                </div>
              </td>
              <td className="py-3 px-4 text-right tabular-nums">{group.transaction_count}</td>
              <td className="py-3 px-4 text-right tabular-nums">{formatAmount(group.total_amount)}</td>
              <td className="py-3 px-4">
                <div className="flex gap-1 flex-wrap">
                  {group.account_ids.map((id) => (
                    <span
                      key={id}
                      className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded"
                    >
                      {accountMap.get(id) || id}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-3 px-4 text-right">
                <button
                  onClick={() => onCategorize(group)}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Categorize
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 2: Create GroupCategorizeDialog component**

Create `src/components/categorize/GroupCategorizeDialog.tsx`:

A modal dialog that lets the user pick a category for a group. On confirm, it creates a categorization rule (match_type: "contains", match_field: "description", pattern: the group's normalized_name) and then the page refreshes groups.

The dialog shows:
- The group name and transaction count
- A category dropdown (reuse pattern from `CategorySelect.tsx`)
- Match type selector (contains/starts_with/exact) defaulting to "contains"
- Confirm/cancel buttons

```typescript
import { useState } from "react";
import type { UncategorizedGroup, Category, CreateRuleParams } from "../../lib/tauri";

interface Props {
  group: UncategorizedGroup;
  categories: Category[];
  onConfirm: (params: CreateRuleParams) => void;
  onCancel: () => void;
}

export default function GroupCategorizeDialog({ group, categories, onConfirm, onCancel }: Props) {
  const [categoryId, setCategoryId] = useState("");
  const [matchType, setMatchType] = useState<string>("contains");

  const incomeCategories = categories.filter((c) => c.category_type === "income");
  const expenseCategories = categories.filter((c) => c.category_type === "expense");

  const handleConfirm = () => {
    if (!categoryId) return;
    onConfirm({
      pattern: group.normalized_name,
      match_field: "description",
      match_type: matchType,
      category_id: categoryId,
      auto_apply: true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Categorize Group
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {group.normalized_name} — {group.transaction_count} transaction{group.transaction_count !== 1 ? "s" : ""}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            >
              <option value="">Select a category...</option>
              {incomeCategories.length > 0 && (
                <optgroup label="Income">
                  {incomeCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
              {expenseCategories.length > 0 && (
                <optgroup label="Expense">
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.is_business_default ? " \u25C6" : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Match Type
            </label>
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            >
              <option value="contains">Contains</option>
              <option value="starts_with">Starts with</option>
              <option value="exact">Exact match</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!categoryId}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Create Rule & Categorize
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create CategorizePage**

Create `src/pages/CategorizePage.tsx`:

```typescript
import { useState, useEffect, useCallback } from "react";
import {
  listAccounts,
  listCategories,
  getUncategorizedGroups,
  createCategorizationRule,
  reapplyAllRules,
} from "../lib/tauri";
import type { Account, Category, UncategorizedGroup, CreateRuleParams } from "../lib/tauri";
import UncategorizedGroupList from "../components/categorize/UncategorizedGroupList";
import GroupCategorizeDialog from "../components/categorize/GroupCategorizeDialog";

export default function CategorizePage() {
  const [groups, setGroups] = useState<UncategorizedGroup[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [categorizeGroup, setCategorizeGroup] = useState<UncategorizedGroup | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const g = await getUncategorizedGroups(selectedAccountId || undefined);
      setGroups(g);
    } catch (err) {
      console.error("Failed to load groups:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    listAccounts().then(setAccounts).catch(console.error);
    listCategories().then(setCategories).catch(console.error);
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCategorize = async (params: CreateRuleParams) => {
    try {
      await createCategorizationRule(params);
      await reapplyAllRules();
      setCategorizeGroup(null);
      await loadGroups();
    } catch (err) {
      console.error("Failed to create rule:", err);
    }
  };

  const totalTransactions = groups.reduce((sum, g) => sum + g.transaction_count, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Categorize</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {groups.length} group{groups.length !== 1 ? "s" : ""} ({totalTransactions} transaction{totalTransactions !== 1 ? "s" : ""}) remaining
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <UncategorizedGroupList
            groups={groups}
            accounts={accounts}
            onCategorize={setCategorizeGroup}
          />
        </div>
      )}

      {categorizeGroup && (
        <GroupCategorizeDialog
          group={categorizeGroup}
          categories={categories}
          onConfirm={handleCategorize}
          onCancel={() => setCategorizeGroup(null)}
        />
      )}
    </div>
  );
}
```

**Step 4: Verify compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/pages/CategorizePage.tsx src/components/categorize/
git commit -m "feat: uncategorized groups page with categorization dialog"
```

---

## Task 9: Frontend — Rules Management Page

**Files:**
- Create: `src/pages/RulesPage.tsx`

**Step 1: Create RulesPage**

Create `src/pages/RulesPage.tsx`:

Displays all rules in a table. Each row: pattern, match field, match type, category name, priority, auto_apply toggle, edit/delete buttons. A "Re-apply All Rules" button at the top. Add/edit rule via inline form or modal (follow the pattern from `CategoriesPage.tsx`).

```typescript
import { useState, useEffect } from "react";
import {
  listCategorizationRules,
  createCategorizationRule,
  updateCategorizationRule,
  deleteCategorizationRule,
  reapplyAllRules,
  listCategories,
} from "../lib/tauri";
import type { CategorizationRule, Category, CreateRuleParams, UpdateRuleParams } from "../lib/tauri";

export default function RulesPage() {
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [reapplying, setReapplying] = useState(false);
  const [reapplyResult, setReapplyResult] = useState<number | null>(null);
  const [editingRule, setEditingRule] = useState<CategorizationRule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingRule, setDeletingRule] = useState<CategorizationRule | null>(null);

  // Form state
  const [pattern, setPattern] = useState("");
  const [matchField, setMatchField] = useState("description");
  const [matchType, setMatchType] = useState("contains");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState(0);
  const [autoApply, setAutoApply] = useState(true);

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([listCategorizationRules(), listCategories()]);
      setRules(r);
      setCategories(c);
    } catch (err) {
      console.error("Failed to load rules:", err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingRule(null);
    setPattern("");
    setMatchField("description");
    setMatchType("contains");
    setCategoryId("");
    setPriority(0);
    setAutoApply(true);
    setShowForm(true);
  }

  function openEdit(rule: CategorizationRule) {
    setEditingRule(rule);
    setPattern(rule.pattern);
    setMatchField(rule.match_field);
    setMatchType(rule.match_type);
    setCategoryId(rule.category_id);
    setPriority(rule.priority);
    setAutoApply(rule.auto_apply);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) return;
    try {
      if (editingRule) {
        const params: UpdateRuleParams = { pattern, match_field: matchField, match_type: matchType, category_id: categoryId, priority, auto_apply: autoApply };
        await updateCategorizationRule(editingRule.id, params);
      } else {
        const params: CreateRuleParams = { pattern, match_field: matchField, match_type: matchType, category_id: categoryId, priority, auto_apply: autoApply };
        await createCategorizationRule(params);
      }
      setShowForm(false);
      await loadData();
    } catch (err) {
      console.error("Failed to save rule:", err);
    }
  }

  async function handleDelete() {
    if (!deletingRule) return;
    try {
      await deleteCategorizationRule(deletingRule.id);
      setDeletingRule(null);
      await loadData();
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  }

  async function handleReapply() {
    setReapplying(true);
    setReapplyResult(null);
    try {
      const count = await reapplyAllRules();
      setReapplyResult(count);
    } catch (err) {
      console.error("Failed to reapply rules:", err);
    } finally {
      setReapplying(false);
    }
  }

  const incomeCategories = categories.filter((c) => c.category_type === "income");
  const expenseCategories = categories.filter((c) => c.category_type === "expense");

  if (loading) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Rules</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReapply}
            disabled={reapplying}
            className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {reapplying ? "Re-applying..." : "Re-apply All Rules"}
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Add Rule
          </button>
        </div>
      </div>

      {reapplyResult !== null && (
        <div className="mb-4 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md text-sm text-green-800 dark:text-green-200">
          Re-applied rules: {reapplyResult} transaction{reapplyResult !== 1 ? "s" : ""} categorized.
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        {rules.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No rules defined. Create rules from the Categorize page or add one manually.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-3 px-4 font-medium">Pattern</th>
                <th className="py-3 px-4 font-medium">Field</th>
                <th className="py-3 px-4 font-medium">Match</th>
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 font-medium text-right">Priority</th>
                <th className="py-3 px-4 font-medium text-center">Auto</th>
                <th className="py-3 px-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-3 px-4 font-mono text-xs">{rule.pattern}</td>
                  <td className="py-3 px-4">{rule.match_field}</td>
                  <td className="py-3 px-4">{rule.match_type}</td>
                  <td className="py-3 px-4">{categoryMap.get(rule.category_id) || rule.category_id}</td>
                  <td className="py-3 px-4 text-right tabular-nums">{rule.priority}</td>
                  <td className="py-3 px-4 text-center">{rule.auto_apply ? "Yes" : "No"}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(rule)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium">Edit</button>
                      <button onClick={() => setDeletingRule(rule)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {editingRule ? "Edit Rule" : "Add Rule"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pattern</label>
                <input type="text" value={pattern} onChange={(e) => setPattern(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Field</label>
                  <select value={matchField} onChange={(e) => setMatchField(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="description">Description</option>
                    <option value="payee">Payee</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Match Type</label>
                  <select value={matchType} onChange={(e) => setMatchType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="contains">Contains</option>
                    <option value="starts_with">Starts with</option>
                    <option value="exact">Exact match</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                  <option value="">Select...</option>
                  {incomeCategories.length > 0 && <optgroup label="Income">{incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
                  {expenseCategories.length > 0 && <optgroup label="Expense">{expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_business_default ? " \u25C6" : ""}</option>)}</optgroup>}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                  <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} className="rounded" />
                    Auto-apply
                  </label>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">Cancel</button>
              <button type="submit" disabled={!pattern || !categoryId} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">{editingRule ? "Save" : "Create"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete Rule</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Delete rule for "{deletingRule.pattern}"? Existing categorizations will remain until you re-apply rules.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeletingRule(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/pages/RulesPage.tsx
git commit -m "feat: rules management page with CRUD and re-apply"
```

---

## Task 10: Frontend — Wire Up Routes, Nav, and Badge

**Files:**
- Modify: `src/App.tsx` (add routes)
- Modify: `src/components/Layout.tsx` (add nav items + badge)

**Step 1: Add routes in App.tsx**

In `src/App.tsx`, add imports for the new pages:

```typescript
import CategorizePage from "./pages/CategorizePage";
import RulesPage from "./pages/RulesPage";
```

Add routes inside the `<Route element={<Layout />}>` block (after the categories route, line 23):

```typescript
<Route path="categorize" element={<CategorizePage />} />
<Route path="rules" element={<RulesPage />} />
```

**Step 2: Add nav items with badge in Layout.tsx**

In `src/components/Layout.tsx`, add imports:

```typescript
import { useState, useEffect } from "react";
import { countUncategorizedGroups } from "../lib/tauri";
```

Update the `navItems` array to include new pages:

```typescript
const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/categorize", label: "Categorize", showBadge: true },
  { to: "/import", label: "Import" },
  { to: "/accounts", label: "Accounts" },
  { to: "/categories", label: "Categories" },
  { to: "/rules", label: "Rules" },
];
```

Add state for the badge count inside the `Layout` component:

```typescript
const [uncategorizedCount, setUncategorizedCount] = useState(0);

useEffect(() => {
  if (isUnlocked) {
    countUncategorizedGroups().then(setUncategorizedCount).catch(console.error);
  }
}, [isUnlocked]);
```

Update the NavLink rendering to show the badge:

```typescript
{navItems.map(({ to, label, showBadge }) => (
  <NavLink
    key={to}
    to={to}
    className={({ isActive }) =>
      `flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? "bg-gray-700 text-white"
          : "text-gray-400 hover:bg-gray-800 hover:text-white"
      }`
    }
  >
    {label}
    {showBadge && uncategorizedCount > 0 && (
      <span className="ml-2 px-1.5 py-0.5 text-xs font-medium bg-red-600 text-white rounded-full">
        {uncategorizedCount}
      </span>
    )}
  </NavLink>
))}
```

**Step 3: Verify compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/App.tsx src/components/Layout.tsx
git commit -m "feat: add Categorize and Rules routes with nav badge for uncategorized groups"
```

---

## Task 11: Integration Testing & Polish

**Step 1: Run full Rust test suite**

Run: `cd src-tauri && cargo test`
Expected: All tests pass

**Step 2: Run frontend type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Run formatter**

Run: `make format` (or equivalent — `cargo fmt` for Rust, `npx eslint --fix` for frontend)
Expected: Clean

**Step 4: Manual smoke test**

1. Start the app (`make dev` or equivalent)
2. Unlock database
3. Import the CIBC QFX file
4. Check import result shows `categorized_count: 0` (no rules yet)
5. Navigate to Categorize page — verify groups appear (MCDONALD'S, MAXI, CAFE PLUS, etc.)
6. Filter by account — verify filtering works
7. Click "Categorize" on a group — dialog appears
8. Select a category, confirm — rule created, group disappears from list
9. Navigate to Rules page — verify rule appears
10. Click "Re-apply All Rules" — verify count
11. Edit a rule, change category, re-apply — verify transactions updated
12. Delete a rule, re-apply — verify transactions revert to uncategorized
13. Import the same file again — verify duplicates detected AND previously-created rules auto-categorize new matching transactions
14. Check badge in nav updates after categorization

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: auto-categorization rule engine with grouped uncategorized view"
```

---

## Summary of All Files Changed/Created

**New files:**
- `src-tauri/src/models/categorization_rule.rs` — Rule CRUD model
- `src-tauri/src/categorize.rs` — Normalization, matching, grouping, apply/reapply
- `src-tauri/src/commands/rules.rs` — Tauri command handlers
- `src/pages/CategorizePage.tsx` — Uncategorized groups workspace
- `src/pages/RulesPage.tsx` — Rules management
- `src/components/categorize/UncategorizedGroupList.tsx` — Group table component
- `src/components/categorize/GroupCategorizeDialog.tsx` — Category assignment dialog

**Modified files:**
- `src-tauri/src/schema.sql` — `categorized_by_rule` column
- `src-tauri/src/db.rs` — Migration for existing databases
- `src-tauri/src/lib.rs` — Module registration, command handlers
- `src-tauri/src/models/mod.rs` — Module export
- `src-tauri/src/models/transaction.rs` — New field, helper function, flag clearing on manual edit
- `src-tauri/src/commands/mod.rs` — Module export
- `src-tauri/src/import/pipeline.rs` — Post-import rule application, ImportResult update
- `src/lib/types.ts` — New interfaces, updated existing
- `src/lib/tauri.ts` — New API functions
- `src/App.tsx` — New routes
- `src/components/Layout.tsx` — Nav items + badge
- `src/components/import/ImportResultStep.tsx` — Show categorized count
