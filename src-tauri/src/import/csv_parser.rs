use crate::import::types::{ParsedImport, ParsedTransaction};
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvColumnMapping {
    pub date_column: String,
    pub amount_column: String,
    pub description_column: String,
    pub payee_column: Option<String>,
    #[serde(default = "default_date_format")]
    pub date_format: String,
}

fn default_date_format() -> String {
    "%Y-%m-%d".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvPreview {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug)]
pub enum ImportError {
    InvalidCsv(String),
    ColumnNotFound(String),
    DateParseError(String),
    AmountParseError(String),
}

impl fmt::Display for ImportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ImportError::InvalidCsv(msg) => write!(f, "Invalid CSV: {}", msg),
            ImportError::ColumnNotFound(col) => write!(f, "Column not found: {}", col),
            ImportError::DateParseError(msg) => write!(f, "Date parse error: {}", msg),
            ImportError::AmountParseError(msg) => write!(f, "Amount parse error: {}", msg),
        }
    }
}

impl std::error::Error for ImportError {}

/// Return first 5 rows + column names for the mapping UI.
pub fn preview_csv(file_content: &str) -> Result<CsvPreview, ImportError> {
    let mut reader = csv::Reader::from_reader(file_content.as_bytes());

    let columns: Vec<String> = reader
        .headers()
        .map_err(|e| ImportError::InvalidCsv(e.to_string()))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    if columns.is_empty() {
        return Err(ImportError::InvalidCsv("No columns found".to_string()));
    }

    let mut rows = Vec::new();
    for result in reader.records().take(5) {
        let record = result.map_err(|e| ImportError::InvalidCsv(e.to_string()))?;
        rows.push(record.iter().map(|f| f.to_string()).collect());
    }

    Ok(CsvPreview { columns, rows })
}

/// Parse CSV content using the provided column mapping into a ParsedImport.
pub fn parse_csv(
    file_content: &str,
    mapping: &CsvColumnMapping,
) -> Result<ParsedImport, ImportError> {
    let mut reader = csv::Reader::from_reader(file_content.as_bytes());

    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| ImportError::InvalidCsv(e.to_string()))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    let date_idx = resolve_column_index(&headers, &mapping.date_column)?;
    let amount_idx = resolve_column_index(&headers, &mapping.amount_column)?;
    let desc_idx = resolve_column_index(&headers, &mapping.description_column)?;
    let payee_idx = match &mapping.payee_column {
        Some(col) => Some(resolve_column_index(&headers, col)?),
        None => None,
    };

    let mut transactions = Vec::new();

    for (line_num, result) in reader.records().enumerate() {
        let record = result.map_err(|e| ImportError::InvalidCsv(e.to_string()))?;

        let raw_date = record
            .get(date_idx)
            .ok_or_else(|| {
                ImportError::InvalidCsv(format!("Row {} missing date column", line_num))
            })?
            .trim();
        let date = parse_date(raw_date, &mapping.date_format)?;

        let raw_amount = record
            .get(amount_idx)
            .ok_or_else(|| {
                ImportError::InvalidCsv(format!("Row {} missing amount column", line_num))
            })?
            .trim();
        let amount = parse_amount(raw_amount)?;

        let description = record
            .get(desc_idx)
            .ok_or_else(|| {
                ImportError::InvalidCsv(format!("Row {} missing description column", line_num))
            })?
            .trim()
            .to_string();

        let payee = payee_idx.and_then(|idx| {
            record
                .get(idx)
                .map(|v| {
                    let trimmed = v.trim().to_string();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed)
                    }
                })
                .flatten()
        });

        transactions.push(ParsedTransaction {
            date,
            amount,
            description,
            payee,
            fitid: None,
            transaction_type: None,
            import_hash: String::new(),
        });
    }

    Ok(ParsedImport {
        account_id_hint: None,
        institution_hint: None,
        currency: None,
        transactions,
    })
}

/// Resolve a column name or numeric index to a usize index.
fn resolve_column_index(headers: &[String], column: &str) -> Result<usize, ImportError> {
    // Try numeric index first
    if let Ok(idx) = column.parse::<usize>() {
        if idx < headers.len() {
            return Ok(idx);
        }
        return Err(ImportError::ColumnNotFound(format!(
            "Index {} out of range (0..{})",
            idx,
            headers.len()
        )));
    }

    // Match by name (case-insensitive)
    let lower = column.to_lowercase();
    for (i, h) in headers.iter().enumerate() {
        if h.trim().to_lowercase() == lower {
            return Ok(i);
        }
    }

    Err(ImportError::ColumnNotFound(column.to_string()))
}

/// Parse a date string according to the given format, returning YYYY-MM-DD.
fn parse_date(raw: &str, format: &str) -> Result<String, ImportError> {
    let parsed = chrono::NaiveDate::parse_from_str(raw, format).map_err(|e| {
        ImportError::DateParseError(format!("'{}' with format '{}': {}", raw, format, e))
    })?;
    Ok(parsed.format("%Y-%m-%d").to_string())
}

/// Normalize an amount string: strip currency symbols, commas, quotes, then parse.
fn parse_amount(raw: &str) -> Result<f64, ImportError> {
    let cleaned: String = raw
        .chars()
        .filter(|c| *c != '$' && *c != ',' && *c != '"' && *c != ' ')
        .collect();

    if cleaned.is_empty() {
        return Err(ImportError::AmountParseError(format!(
            "Empty amount from '{}'",
            raw
        )));
    }

    cleaned
        .parse::<f64>()
        .map_err(|e| ImportError::AmountParseError(format!("'{}': {}", raw, e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_standard_csv() {
        let csv = "Date,Description,Amount\n2023-01-05,Grocery Store,-42.50\n2023-01-15,Paycheck,1500.00\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert_eq!(result.transactions.len(), 2);
        assert_eq!(result.transactions[0].date, "2023-01-05");
        assert_eq!(result.transactions[0].amount, -42.50);
        assert_eq!(result.transactions[0].description, "Grocery Store");
        assert_eq!(result.transactions[1].amount, 1500.00);
    }

    #[test]
    fn test_different_column_order() {
        let csv = "Amount,Date,Description\n-10.00,2023-06-01,Coffee\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert_eq!(result.transactions[0].date, "2023-06-01");
        assert_eq!(result.transactions[0].amount, -10.00);
        assert_eq!(result.transactions[0].description, "Coffee");
    }

    #[test]
    fn test_date_format_mdy() {
        let csv = "Date,Description,Amount\n01/15/2023,Test,100.00\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%m/%d/%Y".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert_eq!(result.transactions[0].date, "2023-01-15");
    }

    #[test]
    fn test_date_format_ymd_slash() {
        let csv = "Date,Description,Amount\n2023/03/20,Test,50.00\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y/%m/%d".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert_eq!(result.transactions[0].date, "2023-03-20");
    }

    #[test]
    fn test_date_format_dmy() {
        let csv = "Date,Description,Amount\n20/03/2023,Test,50.00\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%d/%m/%Y".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert_eq!(result.transactions[0].date, "2023-03-20");
    }

    #[test]
    fn test_amounts_with_currency_and_commas() {
        let csv = "Date,Description,Amount\n2023-01-01,Big Purchase,\"$1,234.56\"\n2023-01-02,Another,\"$99.99\"\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert_eq!(result.transactions[0].amount, 1234.56);
        assert_eq!(result.transactions[1].amount, 99.99);
    }

    #[test]
    fn test_negative_amounts() {
        let csv =
            "Date,Description,Amount\n2023-01-01,Debit,-500.00\n2023-01-02,Debit2,\"-$1,000.00\"\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert_eq!(result.transactions[0].amount, -500.00);
        assert_eq!(result.transactions[1].amount, -1000.00);
    }

    #[test]
    fn test_optional_payee_column() {
        let csv = "Date,Description,Amount,Payee\n2023-01-01,Groceries,-50.00,Walmart\n2023-01-02,Gas,-30.00,\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: Some("Payee".to_string()),
            date_format: "%Y-%m-%d".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert_eq!(result.transactions[0].payee.as_deref(), Some("Walmart"));
        assert_eq!(result.transactions[1].payee, None);
    }

    #[test]
    fn test_preview_csv() {
        let csv = "Date,Description,Amount\n2023-01-01,A,10\n2023-01-02,B,20\n2023-01-03,C,30\n2023-01-04,D,40\n2023-01-05,E,50\n2023-01-06,F,60\n";
        let preview = preview_csv(csv).unwrap();
        assert_eq!(preview.columns, vec!["Date", "Description", "Amount"]);
        assert_eq!(preview.rows.len(), 5); // max 5
        assert_eq!(preview.rows[0], vec!["2023-01-01", "A", "10"]);
        assert_eq!(preview.rows[4], vec!["2023-01-05", "E", "50"]);
    }

    #[test]
    fn test_preview_csv_fewer_than_five_rows() {
        let csv = "Col1,Col2\nA,B\nC,D\n";
        let preview = preview_csv(csv).unwrap();
        assert_eq!(preview.columns, vec!["Col1", "Col2"]);
        assert_eq!(preview.rows.len(), 2);
    }

    #[test]
    fn test_missing_column() {
        let csv = "Date,Description,Amount\n2023-01-01,Test,10\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Total".to_string(), // does not exist
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let err = parse_csv(csv, &mapping).unwrap_err();
        assert!(matches!(err, ImportError::ColumnNotFound(_)));
    }

    #[test]
    fn test_column_by_index() {
        let csv = "Date,Description,Amount\n2023-01-01,Test,99.00\n";
        let mapping = CsvColumnMapping {
            date_column: "0".to_string(),
            amount_column: "2".to_string(),
            description_column: "1".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert_eq!(result.transactions[0].amount, 99.00);
        assert_eq!(result.transactions[0].description, "Test");
    }

    #[test]
    fn test_no_fitid_for_csv() {
        let csv = "Date,Description,Amount\n2023-01-01,Test,10\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert_eq!(result.transactions[0].fitid, None);
    }

    #[test]
    fn test_import_hash_empty() {
        let csv = "Date,Description,Amount\n2023-01-01,Test,10\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert!(result.transactions[0].import_hash.is_empty());
    }

    #[test]
    fn test_no_account_hints_for_csv() {
        let csv = "Date,Description,Amount\n2023-01-01,Test,10\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert!(result.account_id_hint.is_none());
        assert!(result.institution_hint.is_none());
        assert!(result.currency.is_none());
    }

    #[test]
    fn test_case_insensitive_column_match() {
        let csv = "DATE,description,AMOUNT\n2023-01-01,Test,10\n";
        let mapping = CsvColumnMapping {
            date_column: "date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let result = parse_csv(csv, &mapping).unwrap();
        assert_eq!(result.transactions.len(), 1);
    }

    #[test]
    fn test_invalid_date() {
        let csv = "Date,Description,Amount\nnot-a-date,Test,10\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let err = parse_csv(csv, &mapping).unwrap_err();
        assert!(matches!(err, ImportError::DateParseError(_)));
    }

    #[test]
    fn test_invalid_amount() {
        let csv = "Date,Description,Amount\n2023-01-01,Test,abc\n";
        let mapping = CsvColumnMapping {
            date_column: "Date".to_string(),
            amount_column: "Amount".to_string(),
            description_column: "Description".to_string(),
            payee_column: None,
            date_format: "%Y-%m-%d".to_string(),
        };
        let err = parse_csv(csv, &mapping).unwrap_err();
        assert!(matches!(err, ImportError::AmountParseError(_)));
    }
}
