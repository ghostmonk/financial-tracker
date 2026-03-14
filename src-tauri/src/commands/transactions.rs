use tauri::State;

use crate::categorize;
use crate::models::transaction::{self, Transaction, TransactionFilters, UpdateTransactionParams};
use crate::AppState;

use super::with_db_conn;

#[tauri::command(rename_all = "snake_case")]
pub fn list_transactions(
    state: State<'_, AppState>,
    filters: TransactionFilters,
) -> Result<Vec<Transaction>, String> {
    with_db_conn(&state, |conn| {
        transaction::list_transactions(conn, filters).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_transaction(
    state: State<'_, AppState>,
    id: String,
    params: UpdateTransactionParams,
) -> Result<Transaction, String> {
    with_db_conn(&state, |conn| {
        transaction::update_transaction(conn, &id, params).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_transactions_category(
    state: State<'_, AppState>,
    ids: Vec<String>,
    category_id: Option<String>,
) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        transaction::update_transactions_category(conn, &ids, category_id.as_deref())
            .map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_group_transactions(
    state: State<'_, AppState>,
    normalized_name: String,
    account_id: Option<String>,
) -> Result<Vec<Transaction>, String> {
    with_db_conn(&state, |conn| {
        categorize::get_group_transactions(conn, &normalized_name, account_id.as_deref())
            .map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_transaction(state: State<'_, AppState>, id: String) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        transaction::delete_transaction(conn, &id).map_err(|e| e.to_string())
    })
}
