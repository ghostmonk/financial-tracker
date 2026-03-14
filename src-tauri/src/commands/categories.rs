use tauri::State;

use crate::models::category::{self, Category, CreateCategoryParams, UpdateCategoryParams};
use crate::AppState;

use super::with_db_conn;

#[tauri::command(rename_all = "snake_case")]
pub fn list_categories(state: State<'_, AppState>) -> Result<Vec<Category>, String> {
    with_db_conn(&state, |conn| {
        category::list_categories(conn).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_category(
    state: State<'_, AppState>,
    params: CreateCategoryParams,
) -> Result<Category, String> {
    with_db_conn(&state, |conn| {
        category::create_category(conn, params).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_category(
    state: State<'_, AppState>,
    id: String,
    params: UpdateCategoryParams,
) -> Result<Category, String> {
    with_db_conn(&state, |conn| {
        category::update_category(conn, &id, params).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_category(state: State<'_, AppState>, id: String) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        category::delete_category(conn, &id).map_err(|e| e.to_string())
    })
}
