use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryHotkey {
    pub id: String,
    pub key: String,
    pub category_id: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SetHotkeyParams {
    pub key: String,
    pub category_id: String,
}

const SELECT_COLS: &str = "id, key, category_id, created_at";

fn row_to_hotkey(row: &rusqlite::Row) -> rusqlite::Result<CategoryHotkey> {
    Ok(CategoryHotkey {
        id: row.get(0)?,
        key: row.get(1)?,
        category_id: row.get(2)?,
        created_at: row.get(3)?,
    })
}

pub fn list_hotkeys(conn: &Connection) -> Result<Vec<CategoryHotkey>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM category_hotkeys ORDER BY key",
        SELECT_COLS
    ))?;
    let hotkeys = stmt
        .query_map([], row_to_hotkey)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(hotkeys)
}

pub fn set_hotkey(conn: &Connection, params: SetHotkeyParams) -> Result<CategoryHotkey, DbError> {
    // Remove any existing hotkey for this category
    conn.execute(
        "DELETE FROM category_hotkeys WHERE category_id = ?1",
        params![params.category_id],
    )?;
    // Remove any existing hotkey with this key
    conn.execute(
        "DELETE FROM category_hotkeys WHERE key = ?1",
        params![params.key],
    )?;
    // Insert new mapping
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO category_hotkeys (id, key, category_id) VALUES (?1, ?2, ?3)",
        params![id, params.key, params.category_id],
    )?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM category_hotkeys WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(params![id], row_to_hotkey)?)
}

pub fn remove_hotkey(conn: &Connection, key: &str) -> Result<(), DbError> {
    conn.execute("DELETE FROM category_hotkeys WHERE key = ?1", params![key])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::fixtures::{insert_test_category, setup_db};

    #[test]
    fn test_set_and_list_hotkeys() {
        let conn = setup_db();
        insert_test_category(&conn, "cat-1", "groceries");
        insert_test_category(&conn, "cat-2", "rent");

        set_hotkey(
            &conn,
            SetHotkeyParams {
                key: "g".to_string(),
                category_id: "cat-1".to_string(),
            },
        )
        .unwrap();
        set_hotkey(
            &conn,
            SetHotkeyParams {
                key: "r".to_string(),
                category_id: "cat-2".to_string(),
            },
        )
        .unwrap();

        let hotkeys = list_hotkeys(&conn).unwrap();
        assert_eq!(hotkeys.len(), 2);
        assert_eq!(hotkeys[0].key, "g");
        assert_eq!(hotkeys[1].key, "r");
    }

    #[test]
    fn test_set_hotkey_reassigns_key() {
        let conn = setup_db();
        insert_test_category(&conn, "cat-1", "groceries");
        insert_test_category(&conn, "cat-2", "rent");

        set_hotkey(
            &conn,
            SetHotkeyParams {
                key: "g".to_string(),
                category_id: "cat-1".to_string(),
            },
        )
        .unwrap();
        set_hotkey(
            &conn,
            SetHotkeyParams {
                key: "g".to_string(),
                category_id: "cat-2".to_string(),
            },
        )
        .unwrap();

        let hotkeys = list_hotkeys(&conn).unwrap();
        assert_eq!(hotkeys.len(), 1);
        assert_eq!(hotkeys[0].key, "g");
        assert_eq!(hotkeys[0].category_id, "cat-2");
    }

    #[test]
    fn test_set_hotkey_removes_old_key_for_category() {
        let conn = setup_db();
        insert_test_category(&conn, "cat-1", "groceries");

        set_hotkey(
            &conn,
            SetHotkeyParams {
                key: "g".to_string(),
                category_id: "cat-1".to_string(),
            },
        )
        .unwrap();
        set_hotkey(
            &conn,
            SetHotkeyParams {
                key: "G".to_string(),
                category_id: "cat-1".to_string(),
            },
        )
        .unwrap();

        let hotkeys = list_hotkeys(&conn).unwrap();
        assert_eq!(hotkeys.len(), 1);
        assert_eq!(hotkeys[0].key, "G");
        assert_eq!(hotkeys[0].category_id, "cat-1");
    }

    #[test]
    fn test_remove_hotkey() {
        let conn = setup_db();
        insert_test_category(&conn, "cat-1", "groceries");

        set_hotkey(
            &conn,
            SetHotkeyParams {
                key: "g".to_string(),
                category_id: "cat-1".to_string(),
            },
        )
        .unwrap();
        remove_hotkey(&conn, "g").unwrap();

        let hotkeys = list_hotkeys(&conn).unwrap();
        assert!(hotkeys.is_empty());
    }

    #[test]
    fn test_remove_nonexistent_hotkey_is_ok() {
        let conn = setup_db();
        remove_hotkey(&conn, "z").unwrap();
    }

    #[test]
    fn test_cascade_delete_category() {
        let conn = setup_db();
        insert_test_category(&conn, "cat-1", "groceries");

        set_hotkey(
            &conn,
            SetHotkeyParams {
                key: "g".to_string(),
                category_id: "cat-1".to_string(),
            },
        )
        .unwrap();

        conn.execute("DELETE FROM categories WHERE id = ?1", params!["cat-1"])
            .unwrap();

        let hotkeys = list_hotkeys(&conn).unwrap();
        assert!(hotkeys.is_empty());
    }

    #[test]
    fn test_shift_keys_stored_as_uppercase() {
        let conn = setup_db();
        insert_test_category(&conn, "cat-1", "groceries");
        insert_test_category(&conn, "cat-2", "rent");

        set_hotkey(
            &conn,
            SetHotkeyParams {
                key: "G".to_string(),
                category_id: "cat-1".to_string(),
            },
        )
        .unwrap();
        set_hotkey(
            &conn,
            SetHotkeyParams {
                key: "g".to_string(),
                category_id: "cat-2".to_string(),
            },
        )
        .unwrap();

        let hotkeys = list_hotkeys(&conn).unwrap();
        assert_eq!(hotkeys.len(), 2);
    }
}
