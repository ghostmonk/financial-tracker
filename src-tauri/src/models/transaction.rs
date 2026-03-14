use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbError;

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
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

const SELECT_COLS: &str =
    "id, date, amount, description, payee, merchant, account_id, category_id, \
                           is_recurring, tax_deductible, gst_amount, qst_amount, notes, \
                           import_hash, fitid, transaction_type, categorized_by_rule, \
                           created_at, updated_at";

fn row_to_transaction(row: &rusqlite::Row) -> rusqlite::Result<Transaction> {
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

pub fn create_transaction(
    conn: &Connection,
    params: CreateTransactionParams,
) -> Result<Transaction, DbError> {
    let id = Uuid::new_v4().to_string();
    let is_recurring = params.is_recurring.unwrap_or(false);
    let tax_deductible = params.tax_deductible.unwrap_or(false);
    conn.execute(
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
    )?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM transactions WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(rusqlite::params![&id], row_to_transaction)?)
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

pub fn list_transactions(
    conn: &Connection,
    filters: TransactionFilters,
) -> Result<Vec<Transaction>, DbError> {
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
        conditions.push(format!("t.category_id = ?{}", param_idx));
        values.push(Box::new(category_id.clone()));
        param_idx += 1;
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

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let join_clause = if use_direction_join {
        "INNER JOIN categories c ON t.category_id = c.id"
    } else {
        ""
    };

    let limit = filters.limit.unwrap_or(50);
    let offset = filters.offset.unwrap_or(0);

    let select_cols = SELECT_COLS
        .split(", ")
        .map(|col| format!("t.{}", col.trim()))
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!(
        "SELECT {} FROM transactions t {} {} ORDER BY t.date DESC, t.created_at DESC LIMIT ?{} OFFSET ?{}",
        select_cols, join_clause, where_clause, param_idx, param_idx + 1
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

pub fn update_transaction(
    conn: &Connection,
    id: &str,
    params: UpdateTransactionParams,
) -> Result<Transaction, DbError> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref date) = params.date {
        sets.push("date = ?");
        values.push(Box::new(date.clone()));
    }
    if let Some(amount) = params.amount {
        sets.push("amount = ?");
        values.push(Box::new(amount));
    }
    if let Some(ref description) = params.description {
        sets.push("description = ?");
        values.push(Box::new(description.clone()));
    }
    if let Some(ref payee) = params.payee {
        sets.push("payee = ?");
        values.push(Box::new(payee.clone()));
    }
    if let Some(ref merchant) = params.merchant {
        sets.push("merchant = ?");
        values.push(Box::new(merchant.clone()));
    }
    if let Some(ref category_id) = params.category_id {
        sets.push("category_id = ?");
        values.push(Box::new(category_id.clone()));
    }
    if let Some(is_recurring) = params.is_recurring {
        sets.push("is_recurring = ?");
        values.push(Box::new(is_recurring));
    }
    if let Some(tax_deductible) = params.tax_deductible {
        sets.push("tax_deductible = ?");
        values.push(Box::new(tax_deductible));
    }
    if let Some(ref gst_amount) = params.gst_amount {
        sets.push("gst_amount = ?");
        values.push(Box::new(*gst_amount));
    }
    if let Some(ref qst_amount) = params.qst_amount {
        sets.push("qst_amount = ?");
        values.push(Box::new(*qst_amount));
    }
    if let Some(ref notes) = params.notes {
        sets.push("notes = ?");
        values.push(Box::new(notes.clone()));
    }
    if let Some(ref transaction_type) = params.transaction_type {
        sets.push("transaction_type = ?");
        values.push(Box::new(transaction_type.clone()));
    }

    if !sets.is_empty() {
        sets.push("updated_at = datetime('now')");
        values.push(Box::new(id.to_string()));
        let sql = format!("UPDATE transactions SET {} WHERE id = ?", sets.join(", "));
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())?;
    }

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
    let placeholders: Vec<String> = (0..ids.len()).map(|i| format!("?{}", i + 2)).collect();
    let sql = format!(
        "UPDATE transactions SET category_id = ?1, categorized_by_rule = 0, updated_at = datetime('now') WHERE id IN ({})",
        placeholders.join(", ")
    );
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    values.push(Box::new(category_id.map(|s| s.to_string())));
    for id in ids {
        values.push(Box::new(id.clone()));
    }
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())?;
    Ok(())
}

pub fn delete_transaction(conn: &Connection, id: &str) -> Result<(), DbError> {
    conn.execute("DELETE FROM transactions WHERE id = ?1", params![id])?;
    Ok(())
}

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

pub fn check_duplicates_by_fitid(
    conn: &Connection,
    account_id: &str,
    fitids: &[String],
) -> Result<Vec<String>, DbError> {
    if fitids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders: Vec<String> = (0..fitids.len()).map(|i| format!("?{}", i + 2)).collect();
    let sql = format!(
        "SELECT fitid FROM transactions WHERE account_id = ?1 AND fitid IN ({})",
        placeholders.join(", ")
    );
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    values.push(Box::new(account_id.to_string()));
    for fitid in fitids {
        values.push(Box::new(fitid.clone()));
    }
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
    let placeholders: Vec<String> = (0..hashes.len()).map(|i| format!("?{}", i + 1)).collect();
    let sql = format!(
        "SELECT import_hash FROM transactions WHERE import_hash IN ({})",
        placeholders.join(", ")
    );
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    for hash in hashes {
        values.push(Box::new(hash.clone()));
    }
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let existing = stmt
        .query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(existing)
}
