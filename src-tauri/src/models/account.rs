use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub institution: Option<String>,
    pub account_type: String,
    pub currency: String,
    pub credit_limit: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAccountParams {
    pub name: String,
    pub institution: Option<String>,
    pub account_type: String,
    pub currency: Option<String>,
    pub credit_limit: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAccountParams {
    pub name: Option<String>,
    pub institution: Option<Option<String>>,
    pub account_type: Option<String>,
    pub currency: Option<String>,
    pub credit_limit: Option<Option<f64>>,
}

fn row_to_account(row: &rusqlite::Row) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        name: row.get(1)?,
        institution: row.get(2)?,
        account_type: row.get(3)?,
        currency: row.get(4)?,
        credit_limit: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

const SELECT_COLS: &str =
    "id, name, institution, account_type, currency, credit_limit, created_at, updated_at";

pub fn create_account(conn: &Connection, params: CreateAccountParams) -> Result<Account, DbError> {
    let id = Uuid::new_v4().to_string();
    let currency = params.currency.unwrap_or_else(|| "CAD".to_string());
    conn.execute(
        "INSERT INTO accounts (id, name, institution, account_type, currency, credit_limit) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, params.name, params.institution, params.account_type, currency, params.credit_limit],
    )?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM accounts WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(params![&id], row_to_account)?)
}

pub fn list_accounts(conn: &Connection) -> Result<Vec<Account>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM accounts ORDER BY name",
        SELECT_COLS
    ))?;
    let accounts = stmt
        .query_map([], row_to_account)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(accounts)
}

pub fn update_account(
    conn: &Connection,
    id: &str,
    params: UpdateAccountParams,
) -> Result<Account, DbError> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref name) = params.name {
        sets.push("name = ?");
        values.push(Box::new(name.clone()));
    }
    if let Some(ref institution) = params.institution {
        sets.push("institution = ?");
        values.push(Box::new(institution.clone()));
    }
    if let Some(ref account_type) = params.account_type {
        sets.push("account_type = ?");
        values.push(Box::new(account_type.clone()));
    }
    if let Some(ref currency) = params.currency {
        sets.push("currency = ?");
        values.push(Box::new(currency.clone()));
    }
    if let Some(ref credit_limit) = params.credit_limit {
        sets.push("credit_limit = ?");
        values.push(Box::new(*credit_limit));
    }

    if !sets.is_empty() {
        sets.push("updated_at = datetime('now')");
        values.push(Box::new(id.to_string()));
        let sql = format!("UPDATE accounts SET {} WHERE id = ?", sets.join(", "));
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())?;
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM accounts WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(params![id], row_to_account)?)
}

pub fn delete_account(conn: &Connection, id: &str) -> Result<(), DbError> {
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_account_by_institution_number(
    conn: &Connection,
    institution: &str,
    _account_number: &str,
) -> Result<Option<Account>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM accounts WHERE institution = ?1",
        SELECT_COLS
    ))?;
    match stmt.query_row(params![institution], row_to_account) {
        Ok(account) => Ok(Some(account)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(DbError::from(e)),
    }
}
