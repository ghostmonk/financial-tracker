use tauri::State;

use crate::import::csv_parser::{self, CsvColumnMapping, CsvPreview};
use crate::import::ofx;
use crate::import::pipeline::{self, ImportResult};
use crate::import::types::{ImportPreview, ParsedTransaction};
use crate::AppState;

use super::with_db_conn;

#[tauri::command]
pub fn preview_csv_file(file_content: String) -> Result<CsvPreview, String> {
    csv_parser::preview_csv(&file_content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn parse_and_preview_csv(
    state: State<'_, AppState>,
    file_content: String,
    mapping: CsvColumnMapping,
    account_id: String,
) -> Result<ImportPreview, String> {
    let parsed = csv_parser::parse_csv(&file_content, &mapping).map_err(|e| e.to_string())?;
    with_db_conn(&state, |conn| {
        pipeline::preview_import(conn, &account_id, parsed).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn parse_and_preview_ofx(
    state: State<'_, AppState>,
    file_content: String,
    account_id: String,
) -> Result<ImportPreview, String> {
    let parsed = ofx::parse_ofx(&file_content)?;
    with_db_conn(&state, |conn| {
        pipeline::preview_import(conn, &account_id, parsed).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn execute_import_command(
    state: State<'_, AppState>,
    account_id: String,
    filename: String,
    file_type: String,
    transactions: Vec<ParsedTransaction>,
    skip_duplicate_fitids: Vec<String>,
    skip_duplicate_hashes: Vec<String>,
) -> Result<ImportResult, String> {
    with_db_conn(&state, |conn| {
        pipeline::execute_import(
            conn,
            &account_id,
            &filename,
            &file_type,
            &transactions,
            &skip_duplicate_fitids,
            &skip_duplicate_hashes,
        )
        .map_err(|e| e.to_string())
    })
}
