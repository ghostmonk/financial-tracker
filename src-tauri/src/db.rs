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

        // Migration: add account_id to categorization_rules (legacy, column kept for compat)
        conn.execute_batch("ALTER TABLE categorization_rules ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE;").ok();

        // Migration: rule_accounts junction table (many-to-many rules <-> accounts)
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS rule_accounts (
                rule_id TEXT NOT NULL REFERENCES categorization_rules(id) ON DELETE CASCADE,
                account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                PRIMARY KEY (rule_id, account_id)
            );",
        )?;
        // Migrate any existing account_id data from the old column
        conn.execute_batch(
            "INSERT OR IGNORE INTO rule_accounts (rule_id, account_id)
             SELECT id, account_id FROM categorization_rules WHERE account_id IS NOT NULL;",
        )?;

        // Migration: replace income_tax with federal_tax_payment + provincial_tax_payment
        let income_tax_exists: bool = conn
            .prepare("SELECT 1 FROM categories WHERE slug = 'income_tax'")
            .and_then(|mut s| s.query_row([], |_| Ok(true)))
            .unwrap_or(false);

        if income_tax_exists {
            conn.execute(
                "UPDATE categories SET slug = 'federal_tax_payment', name = 'Federal Tax Payment' WHERE slug = 'income_tax'",
                [],
            ).ok();
            // Get parent_id from the renamed category
            let parent_info: Option<(String, String)> = conn
                .prepare("SELECT parent_id, direction FROM categories WHERE slug = 'federal_tax_payment'")
                .and_then(|mut s| s.query_row([], |row| Ok((row.get(0)?, row.get(1)?))))
                .ok();
            if let Some((parent_id, direction)) = parent_info {
                conn.execute(
                    "INSERT OR IGNORE INTO categories (id, slug, name, parent_id, direction, sort_order) VALUES (?1, 'provincial_tax_payment', 'Provincial Tax Payment', ?2, ?3, ?4)",
                    rusqlite::params![uuid::Uuid::new_v4().to_string(), parent_id, direction, 0],
                ).ok();
            }
        }

        // Migration: add GST/QST columns to fiscal_year_settings
        conn.execute_batch("ALTER TABLE fiscal_year_settings ADD COLUMN gst_collected REAL;").ok();
        conn.execute_batch("ALTER TABLE fiscal_year_settings ADD COLUMN qst_collected REAL;").ok();
        conn.execute_batch("ALTER TABLE fiscal_year_settings ADD COLUMN gst_remitted REAL;").ok();
        conn.execute_batch("ALTER TABLE fiscal_year_settings ADD COLUMN qst_remitted REAL;").ok();

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
