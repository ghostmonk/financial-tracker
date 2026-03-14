use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedTransaction {
    pub date: String, // YYYY-MM-DD
    pub amount: f64,
    pub description: String,
    pub payee: Option<String>,
    pub fitid: Option<String>,
    pub transaction_type: Option<String>, // DEBIT, CREDIT, ATM, POS, etc.
    pub import_hash: String, // SHA-256 of date+amount+description+account_id — filled in later
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedImport {
    pub account_id_hint: Option<String>,  // OFX account number
    pub institution_hint: Option<String>, // OFX FI name
    pub currency: Option<String>,
    pub transactions: Vec<ParsedTransaction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreview {
    pub parsed: ParsedImport,
    pub duplicate_fitids: Vec<String>,
    pub duplicate_hashes: Vec<String>,
    pub new_count: usize,
    pub duplicate_count: usize,
}
