use tauri::State;

use crate::categorize::{self, UncategorizedGroup};
use crate::db_command;
use crate::models::categorization_rule::{
    self, CategorizationRule, CreateRuleParams, UpdateRuleParams,
};
use crate::AppState;

use super::with_db_conn;

db_command!(list_categorization_rules -> Vec<CategorizationRule>, categorization_rule::list_rules);
db_command!(create_categorization_rule -> CategorizationRule, categorization_rule::create_rule, params: CreateRuleParams => move);
db_command!(update_categorization_rule -> CategorizationRule, categorization_rule::update_rule, id: String, params: UpdateRuleParams => move);
db_command!(delete_categorization_rule -> (), categorization_rule::delete_rule, id: String);

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

db_command!(apply_single_rule -> usize, categorize::apply_single_rule, rule_id: String);

#[tauri::command(rename_all = "snake_case")]
pub fn reapply_all_rules(state: State<'_, AppState>) -> Result<usize, String> {
    with_db_conn(&state, |conn| {
        categorize::reapply_all_rules(conn).map_err(|e| e.to_string())
    })
}
