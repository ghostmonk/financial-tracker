mod categorize;
mod commands;
mod db;
mod import;
mod models;

use db::Database;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Option<Database>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            db: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            // Database
            commands::database::unlock_database,
            commands::database::is_database_initialized,
            // Accounts
            commands::accounts::list_accounts,
            commands::accounts::create_account,
            commands::accounts::update_account,
            commands::accounts::delete_account,
            // Categories
            commands::categories::list_categories,
            commands::categories::create_category,
            commands::categories::update_category,
            commands::categories::delete_category,
            // Transactions
            commands::transactions::list_transactions,
            commands::transactions::update_transaction,
            commands::transactions::update_transactions_category,
            commands::transactions::delete_transaction,
            // Import
            commands::import::preview_csv_file,
            commands::import::parse_and_preview_csv,
            commands::import::parse_and_preview_ofx,
            commands::import::execute_import_command,
            // Rules & Categorization
            commands::rules::list_categorization_rules,
            commands::rules::create_categorization_rule,
            commands::rules::update_categorization_rule,
            commands::rules::delete_categorization_rule,
            commands::rules::get_uncategorized_groups,
            commands::rules::count_uncategorized_groups,
            commands::rules::apply_rules_to_transaction_ids,
            commands::rules::reapply_all_rules,
            // Tags
            commands::tags::list_tags,
            commands::tags::create_tag,
            commands::tags::delete_tag,
            commands::tags::set_transaction_tags,
            commands::tags::get_transaction_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
