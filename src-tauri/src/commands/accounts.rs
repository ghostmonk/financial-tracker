use tauri::State;

use crate::models::account::{self, Account, CreateAccountParams, UpdateAccountParams};
use crate::AppState;

use super::with_db_conn;

#[tauri::command(rename_all = "snake_case")]
pub fn list_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    with_db_conn(&state, |conn| {
        account::list_accounts(conn).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_account(
    state: State<'_, AppState>,
    params: CreateAccountParams,
) -> Result<Account, String> {
    with_db_conn(&state, |conn| {
        account::create_account(conn, params).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_account(
    state: State<'_, AppState>,
    id: String,
    params: UpdateAccountParams,
) -> Result<Account, String> {
    with_db_conn(&state, |conn| {
        account::update_account(conn, &id, params).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_account(state: State<'_, AppState>, id: String) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        account::delete_account(conn, &id).map_err(|e| e.to_string())
    })
}
