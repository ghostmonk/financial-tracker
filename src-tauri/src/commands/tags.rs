use tauri::State;

use crate::db_command;
use crate::models::tag::{self, Tag};
use crate::AppState;

use super::with_db_conn;

db_command!(list_tags -> Vec<Tag>, tag::list_tags);
db_command!(create_tag -> Tag, tag::get_or_create_tag, name: String);
db_command!(delete_tag -> (), tag::delete_tag, id: String);
db_command!(get_transaction_tags -> Vec<Tag>, tag::get_transaction_tags, transaction_id: String);

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
