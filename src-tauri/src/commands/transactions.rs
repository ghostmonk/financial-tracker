use tauri::State;

use crate::categorize;
use crate::db_command;
use crate::models::transaction::{self, Transaction, TransactionFilters, UpdateTransactionParams};
use crate::AppState;

use super::with_db_conn;

db_command!(list_transactions -> Vec<Transaction>, transaction::list_transactions, filters: TransactionFilters => move);
db_command!(update_transaction -> Transaction, transaction::update_transaction, id: String, params: UpdateTransactionParams => move);
db_command!(delete_transaction -> (), transaction::delete_transaction, id: String);
db_command!(list_used_category_ids -> Vec<String>, transaction::list_used_category_ids);

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
