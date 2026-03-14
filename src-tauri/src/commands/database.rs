use tauri::{AppHandle, Manager, State};

use crate::db::Database;
use crate::models::category::seed_default_categories;
use crate::AppState;

#[tauri::command]
pub fn unlock_database(
    app: AppHandle,
    state: State<'_, AppState>,
    password: String,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let db_path = app_data_dir.join("financial-tracker.db");
    let database = Database::open(&db_path, &password).map_err(|e| e.to_string())?;
    database
        .initialize_schema()
        .map_err(|e| e.to_string())?;
    {
        let conn = database.connection();
        seed_default_categories(&conn).map_err(|e| e.to_string())?;
    }

    let mut db_lock = state
        .db
        .lock()
        .map_err(|e| format!("Failed to acquire state lock: {}", e))?;
    *db_lock = Some(database);
    Ok(())
}

#[tauri::command]
pub fn is_database_initialized(app: AppHandle) -> Result<bool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let db_path = app_data_dir.join("financial-tracker.db");
    Ok(db_path.exists())
}
