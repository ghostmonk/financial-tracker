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

const SELECT_COLS: &str =
    "id, pattern, match_field, match_type, category_id, priority, auto_apply, created_at";

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

pub fn create_rule(
    conn: &Connection,
    params: CreateRuleParams,
) -> Result<CategorizationRule, DbError> {
    let id = Uuid::new_v4().to_string();
    let priority = params.priority.unwrap_or(0);
    let auto_apply = params.auto_apply.unwrap_or(true);
    conn.execute(
        "INSERT INTO categorization_rules (id, pattern, match_field, match_type, category_id, priority, auto_apply) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            id,
            params.pattern,
            params.match_field,
            params.match_type,
            params.category_id,
            priority,
            auto_apply,
        ],
    )?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM categorization_rules WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(params![&id], row_to_rule)?)
}

pub fn list_rules(conn: &Connection) -> Result<Vec<CategorizationRule>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM categorization_rules ORDER BY priority DESC, created_at ASC",
        SELECT_COLS
    ))?;
    let rules = stmt
        .query_map([], row_to_rule)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rules)
}

pub fn update_rule(
    conn: &Connection,
    id: &str,
    params: UpdateRuleParams,
) -> Result<CategorizationRule, DbError> {
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

    if sets.is_empty() {
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM categorization_rules WHERE id = ?1",
            SELECT_COLS
        ))?;
        return Ok(stmt.query_row(rusqlite::params![id], row_to_rule)?);
    }

    values.push(Box::new(id.to_string()));
    let sql = format!(
        "UPDATE categorization_rules SET {} WHERE id = ?",
        sets.join(", ")
    );
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        values.iter().map(|v| v.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM categorization_rules WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(rusqlite::params![id], row_to_rule)?)
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
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let schema = include_str!("../schema.sql");
        conn.execute_batch(schema).unwrap();
        // Insert a test category for FK constraint
        conn.execute(
            "INSERT INTO categories (id, name, category_type, sort_order) VALUES (?1, ?2, ?3, ?4)",
            params!["cat-1", "Groceries", "expense", 0],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO categories (id, name, category_type, sort_order) VALUES (?1, ?2, ?3, ?4)",
            params!["cat-2", "Dining Out", "expense", 1],
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_create_and_list_rules() {
        let conn = setup_db();

        let rule1 = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "METRO".to_string(),
                match_field: "description".to_string(),
                match_type: "contains".to_string(),
                category_id: "cat-1".to_string(),
                priority: Some(10),
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

        let rule2 = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "RESTAURANT".to_string(),
                match_field: "payee".to_string(),
                match_type: "starts_with".to_string(),
                category_id: "cat-2".to_string(),
                priority: Some(5),
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
        let conn = setup_db();

        let rule = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "COSTCO".to_string(),
                match_field: "description".to_string(),
                match_type: "contains".to_string(),
                category_id: "cat-1".to_string(),
                priority: None,
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
                priority: Some(20),
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
        let conn = setup_db();

        let rule = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "TEST".to_string(),
                match_field: "description".to_string(),
                match_type: "contains".to_string(),
                category_id: "cat-1".to_string(),
                priority: None,
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
                auto_apply: None,
            },
        )
        .unwrap();

        assert_eq!(unchanged.id, rule.id);
        assert_eq!(unchanged.pattern, "TEST");
    }

    #[test]
    fn test_delete_rule() {
        let conn = setup_db();

        let rule = create_rule(
            &conn,
            CreateRuleParams {
                pattern: "DELETE ME".to_string(),
                match_field: "description".to_string(),
                match_type: "exact".to_string(),
                category_id: "cat-1".to_string(),
                priority: None,
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
}
