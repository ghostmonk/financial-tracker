mod db;

use db::{Database, DbError};
use std::sync::Mutex;
use tauri::{Manager, State};

pub struct AppState {
    pub db: Mutex<Option<Database>>,
}

#[tauri::command]
fn unlock_database(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    password: String,
) -> Result<(), DbError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir");
    std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");

    let db_path = app_data_dir.join("financial-tracker.db");
    let database = Database::open(&db_path, &password)?;
    database.initialize_schema()?;

    let mut db_lock = state.db.lock().unwrap();
    *db_lock = Some(database);
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            db: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![greet, unlock_database])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
