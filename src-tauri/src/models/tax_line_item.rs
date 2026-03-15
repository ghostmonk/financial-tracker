use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbError;
use crate::db_utils::{in_clause, UpdateBuilder};

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
    let mut builder = UpdateBuilder::new();
    builder
        .set_if("date", &params.date)
        .set_if("description", &params.description)
        .set_if("amount", &params.amount)
        .set_nullable("category_id", &params.category_id)
        .set_if("has_receipt", &params.has_receipt)
        .set_nullable("receipt_path", &params.receipt_path)
        .set_nullable("notes", &params.notes)
        .set_if("fiscal_year", &params.fiscal_year);
    builder.execute(conn, "tax_line_items", id, true)?;

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

#[derive(Debug, Clone, Serialize)]
pub enum TaxItemSource {
    Transaction,
    TaxLineItem,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaxWorkspaceItem {
    pub id: String,
    pub source: TaxItemSource,
    pub date: String,
    pub description: String,
    pub amount: f64,
    pub category_id: Option<String>,
    pub has_receipt: bool,
    pub receipt_path: Option<String>,
    pub notes: Option<String>,
}

/// Query all tax-relevant workspace items for a fiscal year.
/// Combines transactions with tax-mapped categories and manual tax line items.
pub fn get_tax_workspace_items(
    conn: &Connection,
    fiscal_year: i32,
    tax_category_slugs: &[String],
) -> Result<Vec<TaxWorkspaceItem>, DbError> {
    let date_from = format!("{}-01-01", fiscal_year);
    let date_to = format!("{}-12-31", fiscal_year);

    let mut items: Vec<TaxWorkspaceItem> = Vec::new();

    // Get category IDs for tax-mapped slugs
    if !tax_category_slugs.is_empty() {
        let (slug_placeholders, slug_values) = in_clause(tax_category_slugs, 1);
        let cat_sql = format!(
            "SELECT id FROM categories WHERE slug IN ({})",
            slug_placeholders
        );
        let slug_refs: Vec<&dyn rusqlite::types::ToSql> =
            slug_values.iter().map(|v| v.as_ref()).collect();
        let mut cat_stmt = conn.prepare(&cat_sql)?;
        let category_ids: Vec<String> = cat_stmt
            .query_map(slug_refs.as_slice(), |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        if !category_ids.is_empty() {
            let (cat_placeholders, cat_values) = in_clause(&category_ids, 3);
            let t_sql = format!(
                "SELECT id, date, description, amount, category_id, has_receipt, receipt_path, notes \
                 FROM transactions \
                 WHERE date >= ?1 AND date <= ?2 AND category_id IN ({}) \
                 ORDER BY date ASC",
                cat_placeholders
            );
            let mut t_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
            t_values.push(Box::new(date_from.clone()));
            t_values.push(Box::new(date_to.clone()));
            t_values.extend(cat_values);
            let t_refs: Vec<&dyn rusqlite::types::ToSql> =
                t_values.iter().map(|v| v.as_ref()).collect();
            let mut t_stmt = conn.prepare(&t_sql)?;
            let txn_items: Vec<TaxWorkspaceItem> = t_stmt
                .query_map(t_refs.as_slice(), |row| {
                    Ok(TaxWorkspaceItem {
                        id: row.get(0)?,
                        source: TaxItemSource::Transaction,
                        date: row.get(1)?,
                        description: row.get(2)?,
                        amount: row.get(3)?,
                        category_id: row.get(4)?,
                        has_receipt: row.get(5)?,
                        receipt_path: row.get(6)?,
                        notes: row.get(7)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            items.extend(txn_items);
        }
    }

    // Add tax_line_items for the fiscal year
    let line_items = list_tax_line_items_by_year(conn, fiscal_year)?;
    for li in line_items {
        items.push(TaxWorkspaceItem {
            id: li.id,
            source: TaxItemSource::TaxLineItem,
            date: li.date,
            description: li.description,
            amount: li.amount,
            category_id: li.category_id,
            has_receipt: li.has_receipt,
            receipt_path: li.receipt_path,
            notes: li.notes,
        });
    }

    items.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::fixtures::setup_db;

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
        let item = create_tax_line_item(&conn, make_params("2025-01-01", "Original", -50.0, 2025))
            .unwrap();
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
        let item = create_tax_line_item(&conn, make_params("2025-01-01", "Original", -50.0, 2025))
            .unwrap();
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
        let item = create_tax_line_item(&conn, make_params("2025-01-01", "Delete me", -10.0, 2025))
            .unwrap();

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
        conn.execute("DELETE FROM categories WHERE id = 'cat-del'", [])
            .unwrap();

        // Assert
        let items = list_tax_line_items_by_year(&conn, 2025).unwrap();
        assert_eq!(items.len(), 1);
        assert!(items[0].category_id.is_none());
    }
}
