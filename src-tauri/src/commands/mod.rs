pub mod accounts;
pub mod categories;
pub mod database;
pub mod import;
pub mod transactions;

use crate::AppState;
use tauri::State;

fn with_db_conn<F, T>(state: &State<'_, AppState>, f: F) -> Result<T, String>
where
    F: FnOnce(&rusqlite::Connection) -> Result<T, String>,
{
    let guard = state
        .db
        .lock()
        .map_err(|e| format!("Failed to acquire state lock: {}", e))?;
    let db = guard
        .as_ref()
        .ok_or_else(|| "Database not unlocked".to_string())?;
    let conn = db.connection();
    f(&conn)
}
