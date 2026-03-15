use serde::Serialize;
use tauri::State;

use crate::models::fiscal_year_settings::{self, FiscalYearSettings, UpsertFiscalYearSettingsParams};
use crate::models::tax_line_item::{
    self, CreateTaxLineItemParams, TaxLineItem, UpdateTaxLineItemParams,
};
use crate::tax::{self, TaxRules};
use crate::AppState;

use super::with_db_conn;

#[derive(Debug, Clone, Serialize)]
pub struct TaxWorkspaceItem {
    pub id: String,
    pub source: String,
    pub date: String,
    pub description: String,
    pub amount: f64,
    pub category_id: Option<String>,
    pub has_receipt: bool,
    pub receipt_path: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_tax_rules() -> Result<TaxRules, String> {
    Ok(tax::load_tax_rules())
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_tax_line_items(
    state: State<'_, AppState>,
    fiscal_year: i32,
) -> Result<Vec<TaxLineItem>, String> {
    with_db_conn(&state, |conn| {
        tax_line_item::list_tax_line_items_by_year(conn, fiscal_year).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_tax_line_item_cmd(
    state: State<'_, AppState>,
    params: CreateTaxLineItemParams,
) -> Result<TaxLineItem, String> {
    with_db_conn(&state, |conn| {
        tax_line_item::create_tax_line_item(conn, params).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_tax_line_item_cmd(
    state: State<'_, AppState>,
    id: String,
    params: UpdateTaxLineItemParams,
) -> Result<TaxLineItem, String> {
    with_db_conn(&state, |conn| {
        tax_line_item::update_tax_line_item(conn, &id, params).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_tax_line_item_cmd(state: State<'_, AppState>, id: String) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        tax_line_item::delete_tax_line_item(conn, &id).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_fiscal_year_settings_cmd(
    state: State<'_, AppState>,
    fiscal_year: i32,
) -> Result<Option<FiscalYearSettings>, String> {
    with_db_conn(&state, |conn| {
        fiscal_year_settings::get_fiscal_year_settings(conn, fiscal_year).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn upsert_fiscal_year_settings_cmd(
    state: State<'_, AppState>,
    params: UpsertFiscalYearSettingsParams,
) -> Result<FiscalYearSettings, String> {
    with_db_conn(&state, |conn| {
        fiscal_year_settings::upsert_fiscal_year_settings(conn, params).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_tax_workspace_items(
    state: State<'_, AppState>,
    fiscal_year: i32,
) -> Result<Vec<TaxWorkspaceItem>, String> {
    with_db_conn(&state, |conn| {
        let rules = tax::load_tax_rules();

        // Collect category slugs from line_mappings
        let slugs: Vec<String> = rules
            .line_mappings
            .iter()
            .map(|m| m.category_slug.clone())
            .collect();

        // Get category IDs for those slugs
        let placeholders: Vec<String> = (0..slugs.len()).map(|i| format!("?{}", i + 1)).collect();
        let sql = format!(
            "SELECT id FROM categories WHERE slug IN ({})",
            placeholders.join(", ")
        );
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        for slug in &slugs {
            values.push(Box::new(slug.clone()));
        }
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            values.iter().map(|v| v.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let category_ids: Vec<String> = stmt
            .query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?;

        // Query transactions with those category IDs within fiscal year date range
        let date_from = format!("{}-01-01", fiscal_year);
        let date_to = format!("{}-12-31", fiscal_year);

        let mut items: Vec<TaxWorkspaceItem> = Vec::new();

        if !category_ids.is_empty() {
            let t_placeholders: Vec<String> =
                (0..category_ids.len()).map(|i| format!("?{}", i + 3)).collect();
            let t_sql = format!(
                "SELECT id, date, description, amount, category_id, has_receipt, receipt_path, notes \
                 FROM transactions \
                 WHERE date >= ?1 AND date <= ?2 AND category_id IN ({}) \
                 ORDER BY date ASC",
                t_placeholders.join(", ")
            );
            let mut t_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
            t_values.push(Box::new(date_from.clone()));
            t_values.push(Box::new(date_to.clone()));
            for cid in &category_ids {
                t_values.push(Box::new(cid.clone()));
            }
            let t_param_refs: Vec<&dyn rusqlite::types::ToSql> =
                t_values.iter().map(|v| v.as_ref()).collect();
            let mut t_stmt = conn.prepare(&t_sql).map_err(|e| e.to_string())?;
            let txn_items: Vec<TaxWorkspaceItem> = t_stmt
                .query_map(t_param_refs.as_slice(), |row| {
                    Ok(TaxWorkspaceItem {
                        id: row.get(0)?,
                        source: "transaction".to_string(),
                        date: row.get(1)?,
                        description: row.get(2)?,
                        amount: row.get(3)?,
                        category_id: row.get(4)?,
                        has_receipt: row.get(5)?,
                        receipt_path: row.get(6)?,
                        notes: row.get(7)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| e.to_string())?;
            items.extend(txn_items);
        }

        // Query tax_line_items for the fiscal year
        let line_items =
            tax_line_item::list_tax_line_items_by_year(conn, fiscal_year).map_err(|e| e.to_string())?;
        for li in line_items {
            items.push(TaxWorkspaceItem {
                id: li.id,
                source: "tax_line_item".to_string(),
                date: li.date,
                description: li.description,
                amount: li.amount,
                category_id: li.category_id,
                has_receipt: li.has_receipt,
                receipt_path: li.receipt_path,
                notes: li.notes,
            });
        }

        // Sort by date ascending
        items.sort_by(|a, b| a.date.cmp(&b.date));

        Ok(items)
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_transaction_receipt(
    state: State<'_, AppState>,
    id: String,
    has_receipt: bool,
    receipt_path: Option<String>,
) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        conn.execute(
            "UPDATE transactions SET has_receipt = ?1, receipt_path = ?2, updated_at = datetime('now') WHERE id = ?3",
            rusqlite::params![has_receipt, receipt_path, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}
