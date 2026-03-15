use tauri::State;

use crate::db_command;
use crate::models::fiscal_year_settings::{self, FiscalYearSettings, UpsertFiscalYearSettingsParams};
use crate::models::tax_line_item::{
    self, CreateTaxLineItemParams, TaxLineItem, TaxWorkspaceItem, UpdateTaxLineItemParams,
};
use crate::tax::{self, TaxRules};
use crate::AppState;

use super::with_db_conn;

#[tauri::command(rename_all = "snake_case")]
pub fn get_tax_rules() -> Result<TaxRules, String> {
    Ok(tax::load_tax_rules().clone())
}

db_command!(list_tax_line_items -> Vec<TaxLineItem>, tax_line_item::list_tax_line_items_by_year, fiscal_year: i32 => move);
db_command!(create_tax_line_item_cmd -> TaxLineItem, tax_line_item::create_tax_line_item, params: CreateTaxLineItemParams => move);
db_command!(update_tax_line_item_cmd -> TaxLineItem, tax_line_item::update_tax_line_item, id: String, params: UpdateTaxLineItemParams => move);
db_command!(delete_tax_line_item_cmd -> (), tax_line_item::delete_tax_line_item, id: String);
db_command!(get_fiscal_year_settings_cmd -> Option<FiscalYearSettings>, fiscal_year_settings::get_fiscal_year_settings, fiscal_year: i32 => move);
db_command!(upsert_fiscal_year_settings_cmd -> FiscalYearSettings, fiscal_year_settings::upsert_fiscal_year_settings, params: UpsertFiscalYearSettingsParams => move);

#[tauri::command(rename_all = "snake_case")]
pub fn get_tax_workspace_items(
    state: State<'_, AppState>,
    fiscal_year: i32,
) -> Result<Vec<TaxWorkspaceItem>, String> {
    with_db_conn(&state, |conn| {
        let rules = tax::load_tax_rules();
        let slugs: Vec<String> = rules
            .line_mappings
            .iter()
            .map(|m| m.category_slug.clone())
            .collect();
        tax_line_item::get_tax_workspace_items(conn, fiscal_year, &slugs)
            .map_err(|e| e.to_string())
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
