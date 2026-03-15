use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxLineItem {
    pub id: String,
    pub date: String,
    pub description: String,
    pub amount: f64,
    pub category_id: Option<String>,
    pub has_receipt: bool,
    pub receipt_path: Option<String>,
    pub notes: Option<String>,
    pub fiscal_year: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaxLineItemParams {
    pub date: String,
    pub description: String,
    pub amount: f64,
    pub category_id: Option<String>,
    pub has_receipt: Option<bool>,
    pub receipt_path: Option<String>,
    pub notes: Option<String>,
    pub fiscal_year: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaxLineItemParams {
    pub date: Option<String>,
    pub description: Option<String>,
    pub amount: Option<f64>,
    pub category_id: Option<Option<String>>,
    pub has_receipt: Option<bool>,
    pub receipt_path: Option<Option<String>>,
    pub notes: Option<Option<String>>,
    pub fiscal_year: Option<i32>,
}

const SELECT_COLS: &str =
    "id, date, description, amount, category_id, has_receipt, receipt_path, notes, \
     fiscal_year, created_at, updated_at";

fn row_to_tax_line_item(row: &rusqlite::Row) -> rusqlite::Result<TaxLineItem> {
    Ok(TaxLineItem {
        id: row.get(0)?,
        date: row.get(1)?,
        description: row.get(2)?,
        amount: row.get(3)?,
        category_id: row.get(4)?,
        has_receipt: row.get(5)?,
        receipt_path: row.get(6)?,
        notes: row.get(7)?,
        fiscal_year: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub fn create_tax_line_item(
    conn: &Connection,
    params: CreateTaxLineItemParams,
) -> Result<TaxLineItem, DbError> {
    let id = Uuid::new_v4().to_string();
    let has_receipt = params.has_receipt.unwrap_or(false);
    conn.execute(
        "INSERT INTO tax_line_items (id, date, description, amount, category_id, has_receipt, \
         receipt_path, notes, fiscal_year) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            id,
            params.date,
            params.description,
            params.amount,
            params.category_id,
            has_receipt,
            params.receipt_path,
            params.notes,
            params.fiscal_year,
        ],
    )?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM tax_line_items WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(params![&id], row_to_tax_line_item)?)
}

pub fn update_tax_line_item(
    conn: &Connection,
    id: &str,
    params: UpdateTaxLineItemParams,
) -> Result<TaxLineItem, DbError> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref date) = params.date {
        sets.push("date = ?");
        values.push(Box::new(date.clone()));
    }
    if let Some(ref description) = params.description {
        sets.push("description = ?");
        values.push(Box::new(description.clone()));
    }
    if let Some(amount) = params.amount {
        sets.push("amount = ?");
        values.push(Box::new(amount));
    }
    if let Some(ref category_id) = params.category_id {
        sets.push("category_id = ?");
        values.push(Box::new(category_id.clone()));
    }
    if let Some(has_receipt) = params.has_receipt {
        sets.push("has_receipt = ?");
        values.push(Box::new(has_receipt));
    }
    if let Some(ref receipt_path) = params.receipt_path {
        sets.push("receipt_path = ?");
        values.push(Box::new(receipt_path.clone()));
    }
    if let Some(ref notes) = params.notes {
        sets.push("notes = ?");
        values.push(Box::new(notes.clone()));
    }
    if let Some(fiscal_year) = params.fiscal_year {
        sets.push("fiscal_year = ?");
        values.push(Box::new(fiscal_year));
    }

    if !sets.is_empty() {
        sets.push("updated_at = datetime('now')");
        values.push(Box::new(id.to_string()));
        let sql = format!(
            "UPDATE tax_line_items SET {} WHERE id = ?",
            sets.join(", ")
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())?;
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM tax_line_items WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(rusqlite::params![id], row_to_tax_line_item)?)
}

pub fn delete_tax_line_item(conn: &Connection, id: &str) -> Result<(), DbError> {
    conn.execute(
        "DELETE FROM tax_line_items WHERE id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}

pub fn list_tax_line_items_by_year(
    conn: &Connection,
    fiscal_year: i32,
) -> Result<Vec<TaxLineItem>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM tax_line_items WHERE fiscal_year = ?1 ORDER BY date ASC",
        SELECT_COLS
    ))?;
    let items = stmt
        .query_map(rusqlite::params![fiscal_year], row_to_tax_line_item)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
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
        conn
    }

    fn make_params(date: &str, desc: &str, amount: f64, year: i32) -> CreateTaxLineItemParams {
        CreateTaxLineItemParams {
            date: date.to_string(),
            description: desc.to_string(),
            amount,
            category_id: None,
            has_receipt: None,
            receipt_path: None,
            notes: None,
            fiscal_year: year,
        }
    }

    #[test]
    fn create_tax_line_item_valid_params_returns_item_with_correct_fields() {
        // Arrange
        let conn = setup_db();
        let params = make_params("2025-03-15", "Office supplies", -49.99, 2025);

        // Act
        let item = create_tax_line_item(&conn, params).unwrap();

        // Assert
        assert_eq!(item.date, "2025-03-15");
        assert_eq!(item.description, "Office supplies");
        assert_eq!(item.amount, -49.99);
        assert_eq!(item.fiscal_year, 2025);
        assert!(!item.has_receipt);
        assert!(item.receipt_path.is_none());
        assert!(item.notes.is_none());
        assert!(item.category_id.is_none());
        assert!(!item.id.is_empty());
    }

    #[test]
    fn create_tax_line_item_with_receipt_returns_has_receipt_true() {
        // Arrange
        let conn = setup_db();
        let params = CreateTaxLineItemParams {
            has_receipt: Some(true),
            receipt_path: Some("receipts/2025/test.pdf".to_string()),
            notes: Some("Business purchase".to_string()),
            ..make_params("2025-01-10", "Printer", -299.00, 2025)
        };

        // Act
        let item = create_tax_line_item(&conn, params).unwrap();

        // Assert
        assert!(item.has_receipt);
        assert_eq!(item.receipt_path.unwrap(), "receipts/2025/test.pdf");
        assert_eq!(item.notes.unwrap(), "Business purchase");
    }

    #[test]
    fn create_tax_line_item_with_category_stores_category_id() {
        // Arrange
        let conn = setup_db();
        conn.execute(
            "INSERT INTO categories (id, slug, name, direction, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["cat-1", "office_supplies", "Office Supplies", "expense", 0],
        ).unwrap();
        let params = CreateTaxLineItemParams {
            category_id: Some("cat-1".to_string()),
            ..make_params("2025-02-01", "Pens", -12.50, 2025)
        };

        // Act
        let item = create_tax_line_item(&conn, params).unwrap();

        // Assert
        assert_eq!(item.category_id.unwrap(), "cat-1");
    }

    #[test]
    fn list_tax_line_items_by_year_filters_by_fiscal_year() {
        // Arrange
        let conn = setup_db();
        create_tax_line_item(&conn, make_params("2025-01-01", "Item A", -10.0, 2025)).unwrap();
        create_tax_line_item(&conn, make_params("2025-06-01", "Item B", -20.0, 2025)).unwrap();
        create_tax_line_item(&conn, make_params("2024-12-01", "Item C", -30.0, 2024)).unwrap();

        // Act
        let items_2025 = list_tax_line_items_by_year(&conn, 2025).unwrap();
        let items_2024 = list_tax_line_items_by_year(&conn, 2024).unwrap();

        // Assert
        assert_eq!(items_2025.len(), 2);
        assert_eq!(items_2024.len(), 1);
        assert_eq!(items_2024[0].description, "Item C");
    }

    #[test]
    fn list_tax_line_items_by_year_orders_by_date_ascending() {
        // Arrange
        let conn = setup_db();
        create_tax_line_item(&conn, make_params("2025-06-15", "June", -10.0, 2025)).unwrap();
        create_tax_line_item(&conn, make_params("2025-01-05", "January", -20.0, 2025)).unwrap();
        create_tax_line_item(&conn, make_params("2025-03-20", "March", -30.0, 2025)).unwrap();

        // Act
        let items = list_tax_line_items_by_year(&conn, 2025).unwrap();

        // Assert
        assert_eq!(items[0].description, "January");
        assert_eq!(items[1].description, "March");
        assert_eq!(items[2].description, "June");
    }

    #[test]
    fn list_tax_line_items_by_year_no_items_returns_empty_vec() {
        // Arrange
        let conn = setup_db();

        // Act
        let items = list_tax_line_items_by_year(&conn, 2025).unwrap();

        // Assert
        assert!(items.is_empty());
    }

    #[test]
    fn update_tax_line_item_description_only_preserves_other_fields() {
        // Arrange
        let conn = setup_db();
        let item = create_tax_line_item(&conn, make_params("2025-01-01", "Original", -50.0, 2025)).unwrap();
        let update = UpdateTaxLineItemParams {
            date: None,
            description: Some("Updated".to_string()),
            amount: None,
            category_id: None,
            has_receipt: None,
            receipt_path: None,
            notes: None,
            fiscal_year: None,
        };

        // Act
        let updated = update_tax_line_item(&conn, &item.id, update).unwrap();

        // Assert
        assert_eq!(updated.description, "Updated");
        assert_eq!(updated.date, "2025-01-01");
        assert_eq!(updated.amount, -50.0);
        assert_eq!(updated.fiscal_year, 2025);
    }

    #[test]
    fn update_tax_line_item_multiple_fields_updates_all() {
        // Arrange
        let conn = setup_db();
        let item = create_tax_line_item(&conn, make_params("2025-01-01", "Original", -50.0, 2025)).unwrap();
        let update = UpdateTaxLineItemParams {
            date: Some("2025-02-15".to_string()),
            description: Some("Changed".to_string()),
            amount: Some(-75.0),
            category_id: None,
            has_receipt: Some(true),
            receipt_path: Some(Some("path/receipt.jpg".to_string())),
            notes: Some(Some("A note".to_string())),
            fiscal_year: None,
        };

        // Act
        let updated = update_tax_line_item(&conn, &item.id, update).unwrap();

        // Assert
        assert_eq!(updated.date, "2025-02-15");
        assert_eq!(updated.description, "Changed");
        assert_eq!(updated.amount, -75.0);
        assert!(updated.has_receipt);
        assert_eq!(updated.receipt_path.unwrap(), "path/receipt.jpg");
        assert_eq!(updated.notes.unwrap(), "A note");
    }

    #[test]
    fn update_tax_line_item_clear_nullable_fields_sets_to_null() {
        // Arrange
        let conn = setup_db();
        let params = CreateTaxLineItemParams {
            notes: Some("Initial note".to_string()),
            receipt_path: Some("some/path.pdf".to_string()),
            has_receipt: Some(true),
            ..make_params("2025-01-01", "Test", -10.0, 2025)
        };
        let item = create_tax_line_item(&conn, params).unwrap();
        let update = UpdateTaxLineItemParams {
            date: None,
            description: None,
            amount: None,
            category_id: None,
            has_receipt: Some(false),
            receipt_path: Some(None),
            notes: Some(None),
            fiscal_year: None,
        };

        // Act
        let updated = update_tax_line_item(&conn, &item.id, update).unwrap();

        // Assert
        assert!(!updated.has_receipt);
        assert!(updated.receipt_path.is_none());
        assert!(updated.notes.is_none());
    }

    #[test]
    fn delete_tax_line_item_existing_item_removes_from_db() {
        // Arrange
        let conn = setup_db();
        let item = create_tax_line_item(&conn, make_params("2025-01-01", "Delete me", -10.0, 2025)).unwrap();

        // Act
        delete_tax_line_item(&conn, &item.id).unwrap();

        // Assert
        let items = list_tax_line_items_by_year(&conn, 2025).unwrap();
        assert!(items.is_empty());
    }

    #[test]
    fn delete_tax_line_item_nonexistent_id_succeeds_silently() {
        // Arrange
        let conn = setup_db();

        // Act & Assert
        delete_tax_line_item(&conn, "nonexistent-id").unwrap();
    }

    #[test]
    fn create_tax_line_item_category_deleted_sets_null() {
        // Arrange
        let conn = setup_db();
        conn.execute(
            "INSERT INTO categories (id, slug, name, direction, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["cat-del", "temp", "Temp", "expense", 0],
        ).unwrap();
        let params = CreateTaxLineItemParams {
            category_id: Some("cat-del".to_string()),
            ..make_params("2025-01-01", "Linked", -10.0, 2025)
        };
        let item = create_tax_line_item(&conn, params).unwrap();
        assert_eq!(item.category_id.as_deref(), Some("cat-del"));

        // Act
        conn.execute("DELETE FROM categories WHERE id = 'cat-del'", []).unwrap();

        // Assert
        let items = list_tax_line_items_by_year(&conn, 2025).unwrap();
        assert_eq!(items.len(), 1);
        assert!(items[0].category_id.is_none());
    }
}
