use rusqlite::Connection;

use crate::db::DbError;

/// Builder for constructing dynamic UPDATE statements with optional fields.
///
/// Replaces the repetitive pattern of manually building SET clauses, boxed value lists,
/// and param_ref vectors found across all model update functions.
pub struct UpdateBuilder {
    sets: Vec<String>,
    values: Vec<Box<dyn rusqlite::types::ToSql>>,
}

impl UpdateBuilder {
    pub fn new() -> Self {
        Self {
            sets: Vec::new(),
            values: Vec::new(),
        }
    }

    /// Add a SET clause for an `Option<T>` field. If the outer Option is Some, the value
    /// is included in the update.
    pub fn set_if<T: rusqlite::types::ToSql + 'static>(
        &mut self,
        col: &str,
        value: &Option<T>,
    ) -> &mut Self
    where
        T: Clone,
    {
        if let Some(v) = value {
            self.sets.push(format!("{} = ?", col));
            self.values.push(Box::new(v.clone()));
        }
        self
    }

    /// Add a SET clause for an `Option<Option<T>>` field (nullable column).
    /// - `None` => skip (no change)
    /// - `Some(None)` => set column to NULL
    /// - `Some(Some(v))` => set column to v
    pub fn set_nullable<T: rusqlite::types::ToSql + 'static>(
        &mut self,
        col: &str,
        value: &Option<Option<T>>,
    ) -> &mut Self
    where
        T: Clone,
    {
        if let Some(inner) = value {
            self.sets.push(format!("{} = ?", col));
            self.values.push(Box::new(inner.clone()));
        }
        self
    }

    /// Execute the update. Returns true if any SET clauses were present (update was executed).
    ///
    /// - `table`: table name
    /// - `id`: row id for WHERE clause
    /// - `auto_timestamp`: if true, appends `updated_at = datetime('now')` to SET clauses
    pub fn execute(
        mut self,
        conn: &Connection,
        table: &str,
        id: &str,
        auto_timestamp: bool,
    ) -> Result<bool, DbError> {
        if self.sets.is_empty() {
            return Ok(false);
        }

        if auto_timestamp {
            self.sets.push("updated_at = datetime('now')".to_string());
        }

        self.values.push(Box::new(id.to_string()));
        let sql = format!("UPDATE {} SET {} WHERE id = ?", table, self.sets.join(", "));
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            self.values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())?;
        Ok(true)
    }
}

/// Build IN-clause placeholders and boxed parameter values from a slice of strings.
///
/// Returns `(placeholder_string, values)` where placeholder_string is e.g. "?3, ?4, ?5"
/// and values is a Vec of boxed ToSql values.
///
/// `start_index` controls the 1-based parameter numbering. For example:
/// - `in_clause(&["a", "b"], 1)` produces ("?1, ?2", [...])
/// - `in_clause(&["a", "b"], 3)` produces ("?3, ?4", [...])
/// Macro to reduce boilerplate in simple Tauri CRUD commands that just delegate to a model
/// function through `with_db_conn`. Supports several parameter patterns:
///
/// ```ignore
/// // No params: db_command!(fn_name -> ReturnType, model_fn)
/// db_command!(list_accounts -> Vec<Account>, account::list_accounts);
///
/// // Single ref arg: db_command!(fn_name -> ReturnType, model_fn, id: String)
/// db_command!(delete_account -> (), account::delete_account, id: String);
///
/// // Single move arg: db_command!(fn_name -> ReturnType, model_fn, params: Type => move)
/// db_command!(create_account -> Account, account::create_account, params: CreateAccountParams => move);
///
/// // ref + move: db_command!(fn_name -> ReturnType, model_fn, id: String, params: Type => move)
/// db_command!(update_account -> Account, account::update_account, id: String, params: UpdateAccountParams => move);
/// ```
#[macro_export]
macro_rules! db_command {
    // No extra args: list_*
    ($cmd_name:ident -> $ret:ty, $model_fn:expr) => {
        #[tauri::command(rename_all = "snake_case")]
        pub fn $cmd_name(state: tauri::State<'_, $crate::AppState>) -> Result<$ret, String> {
            $crate::commands::with_db_conn(&state, |conn| {
                $model_fn(conn).map_err(|e| e.to_string())
            })
        }
    };
    // Single ref arg: delete_*
    ($cmd_name:ident -> $ret:ty, $model_fn:expr, $arg:ident : $arg_ty:ty) => {
        #[tauri::command(rename_all = "snake_case")]
        pub fn $cmd_name(
            state: tauri::State<'_, $crate::AppState>,
            $arg: $arg_ty,
        ) -> Result<$ret, String> {
            $crate::commands::with_db_conn(&state, |conn| {
                $model_fn(conn, &$arg).map_err(|e| e.to_string())
            })
        }
    };
    // Single move arg: create_*
    ($cmd_name:ident -> $ret:ty, $model_fn:expr, $arg:ident : $arg_ty:ty => move) => {
        #[tauri::command(rename_all = "snake_case")]
        pub fn $cmd_name(
            state: tauri::State<'_, $crate::AppState>,
            $arg: $arg_ty,
        ) -> Result<$ret, String> {
            $crate::commands::with_db_conn(&state, |conn| {
                $model_fn(conn, $arg).map_err(|e| e.to_string())
            })
        }
    };
    // ref + move args: update_*
    ($cmd_name:ident -> $ret:ty, $model_fn:expr, $ref_arg:ident : $ref_ty:ty, $move_arg:ident : $move_ty:ty => move) => {
        #[tauri::command(rename_all = "snake_case")]
        pub fn $cmd_name(
            state: tauri::State<'_, $crate::AppState>,
            $ref_arg: $ref_ty,
            $move_arg: $move_ty,
        ) -> Result<$ret, String> {
            $crate::commands::with_db_conn(&state, |conn| {
                $model_fn(conn, &$ref_arg, $move_arg).map_err(|e| e.to_string())
            })
        }
    };
}

pub fn in_clause(
    items: &[String],
    start_index: usize,
) -> (String, Vec<Box<dyn rusqlite::types::ToSql>>) {
    let placeholders: Vec<String> = (0..items.len())
        .map(|i| format!("?{}", i + start_index))
        .collect();
    let values: Vec<Box<dyn rusqlite::types::ToSql>> = items
        .iter()
        .map(|s| Box::new(s.clone()) as Box<dyn rusqlite::types::ToSql>)
        .collect();
    (placeholders.join(", "), values)
}
