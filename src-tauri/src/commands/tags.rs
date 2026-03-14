use tauri::State;

use crate::models::tag::{self, Tag};
use crate::AppState;

use super::with_db_conn;

#[tauri::command(rename_all = "snake_case")]
pub fn list_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, String> {
    with_db_conn(&state, |conn| {
        tag::list_tags(conn).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_tag(state: State<'_, AppState>, name: String) -> Result<Tag, String> {
    with_db_conn(&state, |conn| {
        tag::get_or_create_tag(conn, &name).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_tag(state: State<'_, AppState>, id: String) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        tag::delete_tag(conn, &id).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_transaction_tags(
    state: State<'_, AppState>,
    transaction_id: String,
    tag_ids: Vec<String>,
) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        tag::set_transaction_tags(conn, &transaction_id, &tag_ids).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_transaction_tags(
    state: State<'_, AppState>,
    transaction_id: String,
) -> Result<Vec<Tag>, String> {
    with_db_conn(&state, |conn| {
        tag::get_transaction_tags(conn, &transaction_id).map_err(|e| e.to_string())
    })
}
