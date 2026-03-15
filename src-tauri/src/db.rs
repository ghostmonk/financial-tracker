use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DbError {
    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Database not initialized")]
    NotInitialized,
}

impl serde::Serialize for DbError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &PathBuf, password: &str) -> Result<Self, DbError> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "key", password)?;
        // Verify the key works
        conn.pragma_query_value(None, "cipher_version", |_row| Ok(()))?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn initialize_schema(&self) -> Result<(), DbError> {
        let conn = self.conn.lock().unwrap();
        let schema = include_str!("schema.sql");

        // Migration: category redesign
        // Check if categories table exists with old schema (no slug column)
        let table_exists: bool = conn.prepare("SELECT 1 FROM categories LIMIT 1").is_ok();
        let has_slug: bool = conn.prepare("SELECT slug FROM categories LIMIT 1").is_ok();

        if table_exists && !has_slug {
            conn.execute_batch("DELETE FROM categorization_rules; DELETE FROM categories;")?;
            conn.execute_batch("DROP TABLE IF EXISTS categories;")?;
        }

        conn.execute_batch(schema)?;

        // Migration: add categorized_by_rule if missing
        conn.execute_batch(
            "ALTER TABLE transactions ADD COLUMN categorized_by_rule INTEGER NOT NULL DEFAULT 0;",
        )
        .ok();

        // Migration: add merchant and is_recurring to transactions
        conn.execute_batch("ALTER TABLE transactions ADD COLUMN merchant TEXT;")
            .ok();
        conn.execute_batch(
            "ALTER TABLE transactions ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0;",
        )
        .ok();

        // Migration: add amount conditions to categorization_rules
        conn.execute_batch("ALTER TABLE categorization_rules ADD COLUMN amount_min REAL;")
            .ok();
        conn.execute_batch("ALTER TABLE categorization_rules ADD COLUMN amount_max REAL;")
            .ok();

        // Migration: add account_id to categorization_rules
        conn.execute_batch("ALTER TABLE categorization_rules ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE;").ok();

        // Migration: add receipt tracking to transactions
        conn.execute_batch(
            "ALTER TABLE transactions ADD COLUMN has_receipt INTEGER NOT NULL DEFAULT 0;",
        )
        .ok();
        conn.execute_batch("ALTER TABLE transactions ADD COLUMN receipt_path TEXT;")
            .ok();

        Ok(())
    }

    pub fn connection(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }
}
