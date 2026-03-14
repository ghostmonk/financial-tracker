use tauri::State;

use crate::categorize::{self, UncategorizedGroup};
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
pub fn delete_categorization_rule(state: State<'_, AppState>, id: String) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        categorization_rule::delete_rule(conn, &id).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_uncategorized_groups(
    state: State<'_, AppState>,
    account_id: Option<String>,
) -> Result<Vec<UncategorizedGroup>, String> {
    with_db_conn(&state, |conn| {
        categorize::get_uncategorized_groups(conn, account_id.as_deref()).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn count_uncategorized_groups(state: State<'_, AppState>) -> Result<i64, String> {
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
        categorize::apply_rules_to_transactions(conn, &transaction_ids).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn reapply_all_rules(state: State<'_, AppState>) -> Result<usize, String> {
    with_db_conn(&state, |conn| {
        categorize::reapply_all_rules(conn).map_err(|e| e.to_string())
    })
}
