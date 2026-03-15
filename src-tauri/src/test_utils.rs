/// Shared test utilities for setting up in-memory databases with test fixtures.
/// Used across model and integration test modules to eliminate duplicate helpers.
#[cfg(test)]
pub mod fixtures {
    use rusqlite::{params, Connection};

    /// Create an in-memory SQLite database with the full schema loaded and foreign keys enabled.
    pub fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let schema = include_str!("schema.sql");
        conn.execute_batch(schema).unwrap();
        conn
    }

    /// Insert a minimal test account. Uses INSERT OR IGNORE so it can be called multiple times
    /// with the same id without failing.
    pub fn insert_test_account(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT OR IGNORE INTO accounts (id, name, institution, account_type) VALUES (?1, ?2, ?3, ?4)",
            params![id, "Test Account", "Test Bank", "checking"],
        )
        .unwrap();
    }

    /// Insert a minimal test category. Uses INSERT OR IGNORE so it can be called multiple times
    /// with the same id without failing.
    pub fn insert_test_category(conn: &Connection, id: &str, slug: &str) {
        conn.execute(
            "INSERT OR IGNORE INTO categories (id, slug, name, direction, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, slug, slug, "expense", 0],
        )
        .unwrap();
    }

    /// Insert a minimal test transaction. Automatically inserts the required account and category
    /// if they don't already exist (using default ids "acct-1" and "cat-1").
    pub fn insert_test_transaction(conn: &Connection, id: &str) {
        insert_test_account(conn, "acct-1");
        insert_test_category(conn, "cat-1", "test");
        conn.execute(
            "INSERT INTO transactions (id, account_id, date, description, amount, category_id, transaction_type) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, "acct-1", "2024-01-01", "Test", 10.0, "cat-1", "debit"],
        )
        .unwrap();
    }
}
