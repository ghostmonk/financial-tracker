use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub category_type: String,
    pub is_business_default: bool,
    pub sort_order: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryParams {
    pub name: String,
    pub parent_id: Option<String>,
    pub category_type: String,
    pub is_business_default: bool,
    pub sort_order: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryParams {
    pub name: Option<String>,
    pub parent_id: Option<Option<String>>,
    pub category_type: Option<String>,
    pub is_business_default: Option<bool>,
    pub sort_order: Option<i32>,
}

fn row_to_category(row: &rusqlite::Row) -> rusqlite::Result<Category> {
    Ok(Category {
        id: row.get(0)?,
        name: row.get(1)?,
        parent_id: row.get(2)?,
        category_type: row.get(3)?,
        is_business_default: row.get(4)?,
        sort_order: row.get(5)?,
    })
}

pub fn seed_default_categories(conn: &Connection) -> Result<(), DbError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let mut sort = 0i32;
    let mut insert = |name: &str,
                      parent_id: Option<&str>,
                      cat_type: &str,
                      is_business: bool|
     -> Result<(), DbError> {
        conn.execute(
            "INSERT INTO categories (id, name, parent_id, category_type, is_business_default, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                Uuid::new_v4().to_string(),
                name,
                parent_id,
                cat_type,
                is_business,
                sort,
            ],
        )?;
        sort += 1;
        Ok(())
    };

    // Income
    insert("Employment", None, "income", false)?;
    insert("Freelance/Contract", None, "income", true)?;
    insert("Investment Income", None, "income", false)?;
    insert("Refunds", None, "income", false)?;
    insert("Other Income", None, "income", false)?;

    // Expense — Personal
    insert("Groceries", None, "expense", false)?;
    insert("Dining Out", None, "expense", false)?;
    insert("Rent/Mortgage", None, "expense", false)?;
    insert("Utilities", None, "expense", false)?;
    insert("Transportation", None, "expense", false)?;
    insert("Gas", None, "expense", false)?;
    insert("Insurance", None, "expense", false)?;
    insert("Healthcare", None, "expense", false)?;
    insert("Clothing", None, "expense", false)?;
    insert("Entertainment", None, "expense", false)?;
    insert("Subscriptions", None, "expense", false)?;
    insert("Personal Care", None, "expense", false)?;
    insert("Education", None, "expense", false)?;
    insert("Gifts", None, "expense", false)?;
    insert("Home Maintenance", None, "expense", false)?;
    insert("Pet", None, "expense", false)?;
    insert("Travel", None, "expense", false)?;
    insert("Miscellaneous", None, "expense", false)?;

    // Expense — Business
    insert("Software & Tools", None, "expense", true)?;
    insert("Hardware & Equipment", None, "expense", true)?;
    insert("Office Supplies", None, "expense", true)?;
    insert("Professional Services", None, "expense", true)?;
    insert("Advertising & Marketing", None, "expense", true)?;
    insert("Travel (Business)", None, "expense", true)?;
    insert("Meals (Business)", None, "expense", true)?;
    insert("Internet & Phone", None, "expense", true)?;
    insert("Professional Development", None, "expense", true)?;
    insert("Bank & Service Fees", None, "expense", true)?;

    Ok(())
}

pub fn list_categories(conn: &Connection) -> Result<Vec<Category>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, parent_id, category_type, is_business_default, sort_order FROM categories ORDER BY sort_order",
    )?;
    let categories = stmt.query_map([], row_to_category)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(categories)
}

pub fn create_category(
    conn: &Connection,
    params: CreateCategoryParams,
) -> Result<Category, DbError> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO categories (id, name, parent_id, category_type, is_business_default, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            id,
            params.name,
            params.parent_id,
            params.category_type,
            params.is_business_default,
            params.sort_order,
        ],
    )?;
    Ok(Category {
        id,
        name: params.name,
        parent_id: params.parent_id,
        category_type: params.category_type,
        is_business_default: params.is_business_default,
        sort_order: params.sort_order,
    })
}

pub fn update_category(
    conn: &Connection,
    id: &str,
    params: UpdateCategoryParams,
) -> Result<Category, DbError> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref name) = params.name {
        sets.push("name = ?");
        values.push(Box::new(name.clone()));
    }
    if let Some(ref parent_id) = params.parent_id {
        sets.push("parent_id = ?");
        values.push(Box::new(parent_id.clone()));
    }
    if let Some(ref category_type) = params.category_type {
        sets.push("category_type = ?");
        values.push(Box::new(category_type.clone()));
    }
    if let Some(is_business_default) = params.is_business_default {
        sets.push("is_business_default = ?");
        values.push(Box::new(is_business_default));
    }
    if let Some(sort_order) = params.sort_order {
        sets.push("sort_order = ?");
        values.push(Box::new(sort_order));
    }

    if sets.is_empty() {
        let mut stmt = conn.prepare(
            "SELECT id, name, parent_id, category_type, is_business_default, sort_order FROM categories WHERE id = ?1",
        )?;
        return Ok(stmt.query_row(rusqlite::params![id], row_to_category)?);
    }

    values.push(Box::new(id.to_string()));
    let sql = format!(
        "UPDATE categories SET {} WHERE id = ?",
        sets.join(", ")
    );
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())?;

    let mut stmt = conn.prepare(
        "SELECT id, name, parent_id, category_type, is_business_default, sort_order FROM categories WHERE id = ?1",
    )?;
    Ok(stmt.query_row(rusqlite::params![id], row_to_category)?)
}

pub fn delete_category(conn: &Connection, id: &str) -> Result<(), DbError> {
    conn.execute("DELETE FROM categories WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}
