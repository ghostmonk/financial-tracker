use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::db::DbError;
use crate::import::types::{ImportPreview, ParsedImport, ParsedTransaction};
use crate::models::transaction::{
    check_duplicates_by_fitid, check_duplicates_by_hash, create_transactions_batch,
    get_transaction_ids_by_hashes, CreateTransactionParams,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported_count: usize,
    pub skipped_count: usize,
    pub categorized_count: usize,
}

pub fn compute_import_hash(date: &str, amount: f64, description: &str, account_id: &str) -> String {
    let normalized_desc = description.trim().to_lowercase();
    let amount_str = format!("{:.2}", amount);
    let input = format!("{}|{}|{}|{}", date, amount_str, normalized_desc, account_id);
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn preview_import(
    conn: &Connection,
    account_id: &str,
    mut parsed: ParsedImport,
) -> Result<ImportPreview, DbError> {
    // Compute import_hash for each transaction
    for tx in &mut parsed.transactions {
        tx.import_hash = compute_import_hash(&tx.date, tx.amount, &tx.description, account_id);
    }

    // Check FITID duplicates
    let fitids: Vec<String> = parsed
        .transactions
        .iter()
        .filter_map(|tx| tx.fitid.clone())
        .collect();
    let duplicate_fitids = check_duplicates_by_fitid(conn, account_id, &fitids)?;

    // Check hash duplicates
    let hashes: Vec<String> = parsed
        .transactions
        .iter()
        .map(|tx| tx.import_hash.clone())
        .collect();
    let duplicate_hashes = check_duplicates_by_hash(conn, &hashes)?;

    // Count duplicates: a transaction is duplicate if its fitid OR hash is duplicate
    let duplicate_fitid_set: std::collections::HashSet<&str> =
        duplicate_fitids.iter().map(|s| s.as_str()).collect();
    let duplicate_hash_set: std::collections::HashSet<&str> =
        duplicate_hashes.iter().map(|s| s.as_str()).collect();

    let duplicate_count = parsed
        .transactions
        .iter()
        .filter(|tx| {
            let fitid_dup = tx
                .fitid
                .as_ref()
                .map_or(false, |f| duplicate_fitid_set.contains(f.as_str()));
            let hash_dup = duplicate_hash_set.contains(tx.import_hash.as_str());
            fitid_dup || hash_dup
        })
        .count();

    let new_count = parsed.transactions.len() - duplicate_count;

    Ok(ImportPreview {
        parsed,
        duplicate_fitids,
        duplicate_hashes,
        new_count,
        duplicate_count,
    })
}

pub fn execute_import(
    conn: &Connection,
    account_id: &str,
    filename: &str,
    file_type: &str,
    transactions: &[ParsedTransaction],
    skip_duplicate_fitids: &[String],
    skip_duplicate_hashes: &[String],
) -> Result<ImportResult, DbError> {
    let skip_fitid_set: std::collections::HashSet<&str> =
        skip_duplicate_fitids.iter().map(|s| s.as_str()).collect();
    let skip_hash_set: std::collections::HashSet<&str> =
        skip_duplicate_hashes.iter().map(|s| s.as_str()).collect();

    let filtered: Vec<&ParsedTransaction> = transactions
        .iter()
        .filter(|tx| {
            let fitid_skip = tx
                .fitid
                .as_ref()
                .map_or(false, |f| skip_fitid_set.contains(f.as_str()));
            let hash_skip = skip_hash_set.contains(tx.import_hash.as_str());
            !fitid_skip && !hash_skip
        })
        .collect();

    let skipped_count = transactions.len() - filtered.len();

    let batch: Vec<CreateTransactionParams> = filtered
        .iter()
        .map(|tx| CreateTransactionParams {
            date: tx.date.clone(),
            amount: tx.amount,
            description: tx.description.clone(),
            payee: tx.payee.clone(),
            account_id: account_id.to_string(),
            category_id: None,
            is_business: None,
            tax_deductible: None,
            gst_amount: None,
            qst_amount: None,
            notes: None,
            import_hash: Some(tx.import_hash.clone()),
            fitid: tx.fitid.clone(),
            transaction_type: tx.transaction_type.clone(),
        })
        .collect();

    let imported_count = create_transactions_batch(conn, batch)?;

    // Get IDs of imported transactions for rule application
    let imported_hashes: Vec<String> = filtered.iter().map(|tx| tx.import_hash.clone()).collect();
    let imported_ids = get_transaction_ids_by_hashes(conn, &imported_hashes)?;
    let categorized_count =
        crate::categorize::apply_rules_to_transactions(conn, &imported_ids).unwrap_or(0);

    // Create import record
    let record_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO import_records (id, filename, file_type, account_id, transaction_count, duplicate_count) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            record_id,
            filename,
            file_type,
            account_id,
            imported_count as i64,
            skipped_count as i64,
        ],
    )?;

    Ok(ImportResult {
        imported_count,
        skipped_count,
        categorized_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let schema = include_str!("../schema.sql");
        conn.execute_batch(schema).unwrap();
        // Insert a test account
        conn.execute(
            "INSERT INTO accounts (id, name, account_type, currency) VALUES (?1, ?2, ?3, ?4)",
            params!["acct-1", "Test Checking", "checking", "CAD"],
        )
        .unwrap();
        conn
    }

    fn make_parsed_tx(
        date: &str,
        amount: f64,
        description: &str,
        fitid: Option<&str>,
    ) -> ParsedTransaction {
        ParsedTransaction {
            date: date.to_string(),
            amount,
            description: description.to_string(),
            payee: None,
            fitid: fitid.map(|s| s.to_string()),
            transaction_type: None,
            import_hash: String::new(),
        }
    }

    #[test]
    fn test_compute_import_hash_consistent() {
        let h1 = compute_import_hash("2025-01-15", -42.50, "GROCERY STORE", "acct-1");
        let h2 = compute_import_hash("2025-01-15", -42.50, "GROCERY STORE", "acct-1");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64); // SHA-256 hex
    }

    #[test]
    fn test_compute_import_hash_normalization() {
        let h1 = compute_import_hash("2025-01-15", -42.50, "  Grocery Store  ", "acct-1");
        let h2 = compute_import_hash("2025-01-15", -42.50, "grocery store", "acct-1");
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_compute_import_hash_different_inputs() {
        let h1 = compute_import_hash("2025-01-15", -42.50, "GROCERY STORE", "acct-1");
        let h2 = compute_import_hash("2025-01-16", -42.50, "GROCERY STORE", "acct-1");
        let h3 = compute_import_hash("2025-01-15", -42.51, "GROCERY STORE", "acct-1");
        let h4 = compute_import_hash("2025-01-15", -42.50, "GROCERY STORE", "acct-2");
        assert_ne!(h1, h2);
        assert_ne!(h1, h3);
        assert_ne!(h1, h4);
    }

    #[test]
    fn test_preview_import_identifies_duplicates() {
        let conn = setup_db();

        // First, insert a transaction directly to create a known duplicate
        conn.execute(
            "INSERT INTO transactions (id, date, amount, description, account_id, import_hash, fitid) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                "existing-1",
                "2025-01-15",
                -42.50,
                "GROCERY STORE",
                "acct-1",
                compute_import_hash("2025-01-15", -42.50, "GROCERY STORE", "acct-1"),
                "FIT001",
            ],
        )
        .unwrap();

        let parsed = ParsedImport {
            account_id_hint: None,
            institution_hint: None,
            currency: None,
            transactions: vec![
                make_parsed_tx("2025-01-15", -42.50, "GROCERY STORE", Some("FIT001")), // duplicate by fitid+hash
                make_parsed_tx("2025-01-20", -15.00, "COFFEE SHOP", None),              // new
            ],
        };

        let preview = preview_import(&conn, "acct-1", parsed).unwrap();
        assert_eq!(preview.duplicate_count, 1);
        assert_eq!(preview.new_count, 1);
        assert!(preview.duplicate_fitids.contains(&"FIT001".to_string()));
    }

    #[test]
    fn test_execute_import_creates_transactions_and_record() {
        let conn = setup_db();

        let mut txns = vec![
            make_parsed_tx("2025-01-15", -42.50, "GROCERY STORE", Some("FIT001")),
            make_parsed_tx("2025-01-20", -15.00, "COFFEE SHOP", None),
        ];
        // Compute hashes
        for tx in &mut txns {
            tx.import_hash =
                compute_import_hash(&tx.date, tx.amount, &tx.description, "acct-1");
        }

        let result = execute_import(
            &conn,
            "acct-1",
            "test.ofx",
            "ofx",
            &txns,
            &[],
            &[],
        )
        .unwrap();

        assert_eq!(result.imported_count, 2);
        assert_eq!(result.skipped_count, 0);
        assert_eq!(result.categorized_count, 0);

        // Verify transactions exist
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM transactions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);

        // Verify import record exists
        let record_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM import_records", [], |row| row.get(0))
            .unwrap();
        assert_eq!(record_count, 1);

        let (rec_count, rec_dup): (i64, i64) = conn
            .query_row(
                "SELECT transaction_count, duplicate_count FROM import_records",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(rec_count, 2);
        assert_eq!(rec_dup, 0);
    }

    #[test]
    fn test_execute_import_skips_duplicates() {
        let conn = setup_db();

        let mut txns = vec![
            make_parsed_tx("2025-01-15", -42.50, "GROCERY STORE", Some("FIT001")),
            make_parsed_tx("2025-01-20", -15.00, "COFFEE SHOP", None),
            make_parsed_tx("2025-01-22", -8.00, "BUS FARE", Some("FIT002")),
        ];
        for tx in &mut txns {
            tx.import_hash =
                compute_import_hash(&tx.date, tx.amount, &tx.description, "acct-1");
        }

        let hash_to_skip = txns[1].import_hash.clone();

        let result = execute_import(
            &conn,
            "acct-1",
            "test.ofx",
            "ofx",
            &txns,
            &["FIT001".to_string()],
            &[hash_to_skip],
        )
        .unwrap();

        assert_eq!(result.imported_count, 1);
        assert_eq!(result.skipped_count, 2);
        assert_eq!(result.categorized_count, 0);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM transactions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_import_same_file_twice_detects_all_duplicates() {
        let conn = setup_db();

        let make_parsed = || ParsedImport {
            account_id_hint: None,
            institution_hint: None,
            currency: None,
            transactions: vec![
                make_parsed_tx("2025-01-15", -42.50, "GROCERY STORE", Some("FIT001")),
                make_parsed_tx("2025-01-20", -15.00, "COFFEE SHOP", Some("FIT002")),
            ],
        };

        // First import: preview then execute
        let preview1 = preview_import(&conn, "acct-1", make_parsed()).unwrap();
        assert_eq!(preview1.new_count, 2);
        assert_eq!(preview1.duplicate_count, 0);

        let result1 = execute_import(
            &conn,
            "acct-1",
            "test.ofx",
            "ofx",
            &preview1.parsed.transactions,
            &preview1.duplicate_fitids,
            &preview1.duplicate_hashes,
        )
        .unwrap();
        assert_eq!(result1.imported_count, 2);
        assert_eq!(result1.categorized_count, 0);

        // Second import of same data: all should be duplicates
        let preview2 = preview_import(&conn, "acct-1", make_parsed()).unwrap();
        assert_eq!(preview2.new_count, 0);
        assert_eq!(preview2.duplicate_count, 2);

        let result2 = execute_import(
            &conn,
            "acct-1",
            "test.ofx",
            "ofx",
            &preview2.parsed.transactions,
            &preview2.duplicate_fitids,
            &preview2.duplicate_hashes,
        )
        .unwrap();
        assert_eq!(result2.imported_count, 0);
        assert_eq!(result2.skipped_count, 2);
        assert_eq!(result2.categorized_count, 0);
    }
}
