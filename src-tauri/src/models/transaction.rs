use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbError;
use crate::db_utils::{in_clause, UpdateBuilder};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub date: String,
    pub amount: f64,
    pub description: String,
    pub payee: Option<String>,
    pub merchant: Option<String>,
    pub account_id: String,
    pub category_id: Option<String>,
    pub is_recurring: bool,
    pub tax_deductible: bool,
    pub gst_amount: Option<f64>,
    pub qst_amount: Option<f64>,
    pub notes: Option<String>,
    pub import_hash: Option<String>,
    pub fitid: Option<String>,
    pub transaction_type: Option<String>,
    pub categorized_by_rule: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTransactionParams {
    pub date: String,
    pub amount: f64,
    pub description: String,
    pub payee: Option<String>,
    pub merchant: Option<String>,
    pub account_id: String,
    pub category_id: Option<String>,
    pub is_recurring: Option<bool>,
    pub tax_deductible: Option<bool>,
    pub gst_amount: Option<f64>,
    pub qst_amount: Option<f64>,
    pub notes: Option<String>,
    pub import_hash: Option<String>,
    pub fitid: Option<String>,
    pub transaction_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTransactionParams {
    pub date: Option<String>,
    pub amount: Option<f64>,
    pub description: Option<String>,
    pub payee: Option<Option<String>>,
    pub merchant: Option<Option<String>>,
    pub category_id: Option<Option<String>>,
    pub is_recurring: Option<bool>,
    pub tax_deductible: Option<bool>,
    pub gst_amount: Option<Option<f64>>,
    pub qst_amount: Option<Option<f64>>,
    pub notes: Option<Option<String>>,
    pub transaction_type: Option<Option<String>>,
}

#[derive(Debug, Deserialize, Default)]
pub struct TransactionFilters {
    pub account_id: Option<String>,
    pub category_id: Option<String>,
    pub direction: Option<String>,
    pub is_recurring: Option<bool>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub search: Option<String>,
    pub uncategorized_only: Option<bool>,
    pub amount_min: Option<f64>,
    pub amount_max: Option<f64>,
    pub sort_field: Option<String>,
    pub sort_dir: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

pub const SELECT_COLS: &str =
    "id, date, amount, description, payee, merchant, account_id, category_id, \
                           is_recurring, tax_deductible, gst_amount, qst_amount, notes, \
                           import_hash, fitid, transaction_type, categorized_by_rule, \
                           created_at, updated_at";

pub fn row_to_transaction(row: &rusqlite::Row) -> rusqlite::Result<Transaction> {
    Ok(Transaction {
        id: row.get(0)?,
        date: row.get(1)?,
        amount: row.get(2)?,
        description: row.get(3)?,
        payee: row.get(4)?,
        merchant: row.get(5)?,
        account_id: row.get(6)?,
        category_id: row.get(7)?,
        is_recurring: row.get(8)?,
        tax_deductible: row.get(9)?,
        gst_amount: row.get(10)?,
        qst_amount: row.get(11)?,
        notes: row.get(12)?,
        import_hash: row.get(13)?,
        fitid: row.get(14)?,
        transaction_type: row.get(15)?,
        categorized_by_rule: row.get(16)?,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
    })
}

pub fn create_transactions_batch(
    conn: &Connection,
    batch: Vec<CreateTransactionParams>,
) -> Result<usize, DbError> {
    conn.execute_batch("BEGIN")?;
    let mut count = 0usize;
    for params in &batch {
        let id = Uuid::new_v4().to_string();
        let is_recurring = params.is_recurring.unwrap_or(false);
        let tax_deductible = params.tax_deductible.unwrap_or(false);
        let result = conn.execute(
            "INSERT INTO transactions (id, date, amount, description, payee, merchant, account_id, category_id, \
             is_recurring, tax_deductible, gst_amount, qst_amount, notes, import_hash, fitid, transaction_type) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            rusqlite::params![
                id,
                params.date,
                params.amount,
                params.description,
                params.payee,
                params.merchant,
                params.account_id,
                params.category_id,
                is_recurring,
                tax_deductible,
                params.gst_amount,
                params.qst_amount,
                params.notes,
                params.import_hash,
                params.fitid,
                params.transaction_type,
            ],
        );
        match result {
            Ok(_) => count += 1,
            Err(e) => {
                conn.execute_batch("ROLLBACK")?;
                return Err(DbError::from(e));
            }
        }
    }
    conn.execute_batch("COMMIT")?;
    Ok(count)
}

#[derive(Debug, Clone, Serialize)]
pub struct TransactionSummary {
    pub total_count: u32,
    pub total_debit: f64,
    pub total_credit: f64,
    pub parent_category_count: u32,
    pub child_category_count: u32,
}

struct FilterClause {
    conditions: Vec<String>,
    values: Vec<Box<dyn rusqlite::types::ToSql>>,
    next_param_idx: usize,
    use_direction_join: bool,
}

fn build_filter_clause(filters: &TransactionFilters) -> FilterClause {
    let mut conditions = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 1;
    let mut use_direction_join = false;

    if let Some(ref account_id) = filters.account_id {
        conditions.push(format!("t.account_id = ?{}", param_idx));
        values.push(Box::new(account_id.clone()));
        param_idx += 1;
    }
    if let Some(ref category_id) = filters.category_id {
        conditions.push(format!(
            "(t.category_id = ?{} OR t.category_id IN (SELECT id FROM categories WHERE parent_id = ?{}))",
            param_idx, param_idx + 1
        ));
        values.push(Box::new(category_id.clone()));
        values.push(Box::new(category_id.clone()));
        param_idx += 2;
    }
    if let Some(ref direction) = filters.direction {
        use_direction_join = true;
        conditions.push(format!("c.direction = ?{}", param_idx));
        values.push(Box::new(direction.clone()));
        param_idx += 1;
    }
    if let Some(is_recurring) = filters.is_recurring {
        conditions.push(format!("t.is_recurring = ?{}", param_idx));
        values.push(Box::new(is_recurring));
        param_idx += 1;
    }
    if let Some(ref date_from) = filters.date_from {
        conditions.push(format!("t.date >= ?{}", param_idx));
        values.push(Box::new(date_from.clone()));
        param_idx += 1;
    }
    if let Some(ref date_to) = filters.date_to {
        conditions.push(format!("t.date <= ?{}", param_idx));
        values.push(Box::new(date_to.clone()));
        param_idx += 1;
    }
    if let Some(ref search) = filters.search {
        conditions.push(format!(
            "(t.description LIKE ?{0} OR t.payee LIKE ?{0})",
            param_idx
        ));
        values.push(Box::new(format!("%{}%", search)));
        param_idx += 1;
    }
    if filters.uncategorized_only == Some(true) {
        conditions.push("t.category_id IS NULL".to_string());
    }
    if let Some(amount_min) = filters.amount_min {
        conditions.push(format!("ABS(t.amount) >= ?{}", param_idx));
        values.push(Box::new(amount_min));
        param_idx += 1;
    }
    if let Some(amount_max) = filters.amount_max {
        conditions.push(format!("ABS(t.amount) <= ?{}", param_idx));
        values.push(Box::new(amount_max));
        param_idx += 1;
    }

    FilterClause {
        conditions,
        values,
        next_param_idx: param_idx,
        use_direction_join,
    }
}

fn where_clause_str(conditions: &[String]) -> String {
    if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    }
}

fn join_clause_str(use_direction_join: bool) -> &'static str {
    if use_direction_join {
        "INNER JOIN categories c ON t.category_id = c.id"
    } else {
        ""
    }
}

pub fn list_transactions(
    conn: &Connection,
    filters: TransactionFilters,
) -> Result<Vec<Transaction>, DbError> {
    let fc = build_filter_clause(&filters);
    let where_clause = where_clause_str(&fc.conditions);
    let join_clause = join_clause_str(fc.use_direction_join);
    let mut values = fc.values;
    let param_idx = fc.next_param_idx;

    let limit = filters.limit.unwrap_or(50);
    let offset = filters.offset.unwrap_or(0);

    let select_cols = SELECT_COLS
        .split(", ")
        .map(|col| format!("t.{}", col.trim()))
        .collect::<Vec<_>>()
        .join(", ");

    let order_col = match filters.sort_field.as_deref() {
        Some("description") => "t.description",
        Some("merchant") => "t.merchant",
        Some("payee") => "t.payee",
        Some("amount") => "t.amount",
        Some("account") => "t.account_id",
        _ => "t.date",
    };
    let order_dir = match filters.sort_dir.as_deref() {
        Some("asc") => "ASC",
        _ => "DESC",
    };

    let sql = format!(
        "SELECT {} FROM transactions t {} {} ORDER BY {} {}, t.created_at DESC LIMIT ?{} OFFSET ?{}",
        select_cols, join_clause, where_clause, order_col, order_dir, param_idx, param_idx + 1
    );

    values.push(Box::new(limit));
    values.push(Box::new(offset));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();

    let mut stmt = conn.prepare(&sql)?;
    let transactions = stmt
        .query_map(param_refs.as_slice(), row_to_transaction)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(transactions)
}

pub fn get_transaction_summary(
    conn: &Connection,
    filters: TransactionFilters,
) -> Result<TransactionSummary, DbError> {
    let fc = build_filter_clause(&filters);
    let where_clause = where_clause_str(&fc.conditions);
    let join_clause = join_clause_str(fc.use_direction_join);

    // Totals query
    let totals_sql = format!(
        "SELECT COUNT(*), \
         COALESCE(SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END), 0), \
         COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) \
         FROM transactions t {} {}",
        join_clause, where_clause
    );
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        fc.values.iter().map(|v| v.as_ref()).collect();

    let (total_count, total_debit, total_credit): (u32, f64, f64) =
        conn.query_row(&totals_sql, param_refs.as_slice(), |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;

    // Child category count (categories with parent_id IS NOT NULL)
    let child_where = if where_clause.is_empty() {
        "WHERE t.category_id IS NOT NULL AND t.category_id IN (SELECT id FROM categories WHERE parent_id IS NOT NULL)".to_string()
    } else {
        format!(
            "{} AND t.category_id IS NOT NULL AND t.category_id IN (SELECT id FROM categories WHERE parent_id IS NOT NULL)",
            where_clause
        )
    };
    let child_sql = format!(
        "SELECT COUNT(DISTINCT t.category_id) FROM transactions t {} {}",
        join_clause, child_where
    );
    let child_category_count: u32 =
        conn.query_row(&child_sql, param_refs.as_slice(), |row| row.get(0))?;

    // Parent category count (categories with parent_id IS NULL)
    let parent_where = if where_clause.is_empty() {
        "WHERE t.category_id IS NOT NULL AND t.category_id IN (SELECT id FROM categories WHERE parent_id IS NULL)".to_string()
    } else {
        format!(
            "{} AND t.category_id IS NOT NULL AND t.category_id IN (SELECT id FROM categories WHERE parent_id IS NULL)",
            where_clause
        )
    };
    let parent_sql = format!(
        "SELECT COUNT(DISTINCT t.category_id) FROM transactions t {} {}",
        join_clause, parent_where
    );
    let parent_category_count: u32 =
        conn.query_row(&parent_sql, param_refs.as_slice(), |row| row.get(0))?;

    Ok(TransactionSummary {
        total_count,
        total_debit,
        total_credit,
        parent_category_count,
        child_category_count,
    })
}

pub fn update_transaction(
    conn: &Connection,
    id: &str,
    params: UpdateTransactionParams,
) -> Result<Transaction, DbError> {
    let mut builder = UpdateBuilder::new();
    builder
        .set_if("date", &params.date)
        .set_if("amount", &params.amount)
        .set_if("description", &params.description)
        .set_nullable("payee", &params.payee)
        .set_nullable("merchant", &params.merchant)
        .set_nullable("category_id", &params.category_id)
        .set_if("is_recurring", &params.is_recurring)
        .set_if("tax_deductible", &params.tax_deductible)
        .set_nullable("gst_amount", &params.gst_amount)
        .set_nullable("qst_amount", &params.qst_amount)
        .set_nullable("notes", &params.notes)
        .set_nullable("transaction_type", &params.transaction_type);
    builder.execute(conn, "transactions", id, true)?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM transactions WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(params![id], row_to_transaction)?)
}

pub fn update_transactions_category(
    conn: &Connection,
    ids: &[String],
    category_id: Option<&str>,
) -> Result<(), DbError> {
    if ids.is_empty() {
        return Ok(());
    }
    let (placeholders, mut in_values) = in_clause(ids, 2);
    let sql = format!(
        "UPDATE transactions SET category_id = ?1, categorized_by_rule = 0, updated_at = datetime('now') WHERE id IN ({})",
        placeholders
    );
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    values.push(Box::new(category_id.map(|s| s.to_string())));
    values.append(&mut in_values);
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())?;
    Ok(())
}

pub fn delete_transaction(conn: &Connection, id: &str) -> Result<(), DbError> {
    conn.execute("DELETE FROM transactions WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_used_category_ids(conn: &Connection) -> Result<Vec<String>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT category_id FROM transactions WHERE category_id IS NOT NULL ORDER BY category_id",
    )?;
    let ids = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(ids)
}

pub fn get_transaction_ids_by_hashes(
    conn: &Connection,
    hashes: &[String],
) -> Result<Vec<String>, DbError> {
    if hashes.is_empty() {
        return Ok(Vec::new());
    }
    let (placeholders, values) = in_clause(hashes, 1);
    let sql = format!(
        "SELECT id FROM transactions WHERE import_hash IN ({})",
        placeholders
    );
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let ids = stmt
        .query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(ids)
}

pub fn check_duplicates_by_fitid(
    conn: &Connection,
    account_id: &str,
    fitids: &[String],
) -> Result<Vec<String>, DbError> {
    if fitids.is_empty() {
        return Ok(Vec::new());
    }
    let (placeholders, mut in_values) = in_clause(fitids, 2);
    let sql = format!(
        "SELECT fitid FROM transactions WHERE account_id = ?1 AND fitid IN ({})",
        placeholders
    );
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    values.push(Box::new(account_id.to_string()));
    values.append(&mut in_values);
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let existing = stmt
        .query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(existing)
}

pub fn check_duplicates_by_hash(
    conn: &Connection,
    hashes: &[String],
) -> Result<Vec<String>, DbError> {
    if hashes.is_empty() {
        return Ok(Vec::new());
    }
    let (placeholders, values) = in_clause(hashes, 1);
    let sql = format!(
        "SELECT import_hash FROM transactions WHERE import_hash IN ({})",
        placeholders
    );
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let existing = stmt
        .query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(existing)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::fixtures::{insert_test_account, setup_db};

    fn insert_category(conn: &Connection, id: &str, name: &str, parent_id: Option<&str>) {
        conn.execute(
            "INSERT INTO categories (id, slug, name, parent_id, direction, sort_order) \
             VALUES (?1, ?2, ?3, ?4, 'income', 0)",
            params![id, name, name, parent_id],
        )
        .unwrap();
    }

    fn insert_tx(conn: &Connection, id: &str, category_id: &str) {
        insert_test_account(conn, "acct-1");
        conn.execute(
            "INSERT INTO transactions (id, date, amount, description, account_id, category_id) \
             VALUES (?1, '2025-01-15', 100.0, 'Test tx', 'acct-1', ?2)",
            params![id, category_id],
        )
        .unwrap();
    }

    #[test]
    fn test_category_filter_includes_children() {
        let conn = setup_db();

        insert_category(&conn, "parent-1", "Income", None);
        insert_category(&conn, "child-1", "Salary", Some("parent-1"));
        insert_category(&conn, "child-2", "Bonus", Some("parent-1"));

        insert_tx(&conn, "tx-parent", "parent-1");
        insert_tx(&conn, "tx-child1", "child-1");
        insert_tx(&conn, "tx-child2", "child-2");

        let filters = TransactionFilters {
            category_id: Some("parent-1".to_string()),
            limit: Some(100),
            ..Default::default()
        };

        let results = list_transactions(&conn, filters).unwrap();
        assert_eq!(results.len(), 3, "Should return parent + both children");

        let mut ids: Vec<&str> = results.iter().map(|t| t.id.as_str()).collect();
        ids.sort();
        assert_eq!(ids, vec!["tx-child1", "tx-child2", "tx-parent"]);
    }
}
