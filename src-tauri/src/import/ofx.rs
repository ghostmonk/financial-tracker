use crate::import::types::{ParsedImport, ParsedTransaction};

/// Parse OFX/QFX file content into a ParsedImport.
pub fn parse_ofx(content: &str) -> Result<ParsedImport, String> {
    let body = strip_headers(content);

    let account_id_hint = extract_account_id(&body);
    let institution_hint = extract_tag_value(&body, "ORG");
    let currency = extract_tag_value(&body, "CURDEF");

    let stmt_block = find_statement_block(&body)
        .ok_or_else(|| "No STMTRS or CCSTMTRS block found".to_string())?;

    let transactions = parse_transactions(&stmt_block)?;

    Ok(ParsedImport {
        account_id_hint,
        institution_hint,
        currency,
        transactions,
    })
}

/// Strip OFX SGML headers and XML declarations, returning the body starting at <OFX>.
fn strip_headers(content: &str) -> String {
    let upper = content.to_uppercase();
    if let Some(pos) = upper.find("<OFX>") {
        content[pos..].to_string()
    } else {
        content.to_string()
    }
}

/// Find the STMTRS or CCSTMTRS block content.
fn find_statement_block(body: &str) -> Option<String> {
    let upper = body.to_uppercase();

    // Try bank statement first, then credit card
    for (open, close) in &[("<STMTRS>", "</STMTRS>"), ("<CCSTMTRS>", "</CCSTMTRS>")] {
        if let Some(start) = upper.find(open) {
            let content_start = start + open.len();
            let end = upper[content_start..]
                .find(close)
                .map(|e| content_start + e)
                .unwrap_or(body.len());
            return Some(body[content_start..end].to_string());
        }
    }
    None
}

/// Extract account ID from BANKACCTFROM or CCACCTFROM block.
fn extract_account_id(body: &str) -> Option<String> {
    let upper = body.to_uppercase();

    for (open, close) in &[
        ("<BANKACCTFROM>", "</BANKACCTFROM>"),
        ("<CCACCTFROM>", "</CCACCTFROM>"),
    ] {
        if let Some(start) = upper.find(open) {
            let content_start = start + open.len();
            let end = upper[content_start..]
                .find(close)
                .map(|e| content_start + e)
                .unwrap_or(body.len());
            let block = &body[content_start..end];
            if let Some(acctid) = extract_tag_value(block, "ACCTID") {
                return Some(acctid);
            }
        }
    }
    None
}

/// Extract the text value of a single SGML tag like <TAGNAME>value.
/// Handles both unclosed SGML tags and closed XML-style tags.
fn extract_tag_value(block: &str, tag: &str) -> Option<String> {
    let upper = block.to_uppercase();
    let open = format!("<{}>", tag.to_uppercase());

    if let Some(start) = upper.find(&open) {
        let value_start = start + open.len();
        let remaining = &block[value_start..];

        // Value ends at next '<' or end of string
        let end = remaining.find('<').unwrap_or(remaining.len());
        let value = remaining[..end].trim().to_string();
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    } else {
        None
    }
}

/// Parse all STMTTRN blocks within a statement block.
fn parse_transactions(stmt_block: &str) -> Result<Vec<ParsedTransaction>, String> {
    let upper = stmt_block.to_uppercase();
    let mut transactions = Vec::new();
    let mut search_from = 0;

    loop {
        let start = match upper[search_from..].find("<STMTTRN>") {
            Some(pos) => search_from + pos,
            None => break,
        };
        let content_start = start + "<STMTTRN>".len();

        let end = upper[content_start..]
            .find("</STMTTRN>")
            .map(|e| content_start + e)
            .or_else(|| {
                // Some banks don't close STMTTRN — find next STMTTRN or end
                upper[content_start..]
                    .find("<STMTTRN>")
                    .map(|e| content_start + e)
            })
            .unwrap_or(stmt_block.len());

        let trn_block = &stmt_block[content_start..end];
        transactions.push(parse_single_transaction(trn_block)?);

        search_from = end;
    }

    Ok(transactions)
}

/// Parse a single STMTTRN block into a ParsedTransaction.
fn parse_single_transaction(block: &str) -> Result<ParsedTransaction, String> {
    let raw_date = extract_tag_value(block, "DTPOSTED")
        .ok_or_else(|| "STMTTRN missing DTPOSTED".to_string())?;
    let date = parse_ofx_date(&raw_date)?;

    let raw_amount =
        extract_tag_value(block, "TRNAMT").ok_or_else(|| "STMTTRN missing TRNAMT".to_string())?;
    let amount: f64 = raw_amount
        .parse()
        .map_err(|e| format!("Invalid TRNAMT '{}': {}", raw_amount, e))?;

    let name = extract_tag_value(block, "NAME");
    let memo = extract_tag_value(block, "MEMO");

    let (description, payee) = match (&name, &memo) {
        (Some(n), Some(m)) => (n.clone(), Some(m.clone())),
        (Some(n), None) => (n.clone(), None),
        (None, Some(m)) => (m.clone(), None),
        (None, None) => ("(no description)".to_string(), None),
    };

    let fitid = extract_tag_value(block, "FITID");
    let transaction_type = extract_tag_value(block, "TRNTYPE");

    Ok(ParsedTransaction {
        date,
        amount,
        description,
        payee,
        fitid,
        transaction_type,
        import_hash: String::new(),
    })
}

/// Convert OFX date (YYYYMMDD or YYYYMMDDHHMMSS[.XXX]) to YYYY-MM-DD.
fn parse_ofx_date(raw: &str) -> Result<String, String> {
    // Strip timezone offset if present (e.g., "20230115120000[-5:EST]")
    let date_part = raw.split('[').next().unwrap_or(raw);
    // Strip fractional seconds (e.g., "20230115120000.000")
    let date_part = date_part.split('.').next().unwrap_or(date_part);
    let date_part = date_part.trim();

    if date_part.len() < 8 {
        return Err(format!("Date too short: '{}'", raw));
    }

    let year = &date_part[0..4];
    let month = &date_part[4..6];
    let day = &date_part[6..8];

    // Basic validation
    let _y: u32 = year
        .parse()
        .map_err(|_| format!("Invalid year in '{}'", raw))?;
    let m: u32 = month
        .parse()
        .map_err(|_| format!("Invalid month in '{}'", raw))?;
    let d: u32 = day
        .parse()
        .map_err(|_| format!("Invalid day in '{}'", raw))?;

    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return Err(format!("Date out of range: '{}'", raw));
    }

    Ok(format!("{}-{}-{}", year, month, day))
}

#[cfg(test)]
mod tests {
    use super::*;

    const BANK_OFX: &str = r#"OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<DTSERVER>20230115120000
<LANGUAGE>ENG
<FI>
<ORG>Test Bank
<FID>12345
</FI>
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>021000021
<ACCTID>999888777
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20230101
<DTEND>20230131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20230105
<TRNAMT>-42.50
<FITID>20230105001
<NAME>GROCERY STORE
<MEMO>Purchase at grocery
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20230115120000
<TRNAMT>1500.00
<FITID>20230115001
<NAME>EMPLOYER INC
</STMTTRN>
<STMTTRN>
<TRNTYPE>POS
<DTPOSTED>20230120
<TRNAMT>-9.99
<FITID>20230120001
<MEMO>Coffee Shop
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>2500.00
<DTASOF>20230131
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>"#;

    const CC_OFX: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220"?>
<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<DTSERVER>20230201
<LANGUAGE>ENG
<FI>
<ORG>Credit Card Co
</FI>
</SONRS>
</SIGNONMSGSRSV1>
<CREDITCARDMSGSRSV1>
<CCSTMTTRNRS>
<TRNUID>2001
<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<CCSTMTRS>
<CURDEF>CAD
<CCACCTFROM>
<ACCTID>4111111111111111
</CCACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20230201
<TRNAMT>-150.00
<FITID>CC20230201001
<NAME>AIRLINE TICKET
<MEMO>Flight booking
</STMTTRN>
</BANKTRANLIST>
</CCSTMTRS>
</CCSTMTTRNRS>
</CREDITCARDMSGSRSV1>
</OFX>"#;

    const QFX_HEADER: &str = r#"OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<DTSERVER>20230301
<LANGUAGE>ENG
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>061000052
<ACCTID>123456789
<ACCTTYPE>SAVINGS
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>ATM
<DTPOSTED>20230301120000.000[-5:EST]
<TRNAMT>-200.00
<FITID>QFX001
<NAME>ATM WITHDRAWAL
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>"#;

    #[test]
    fn test_bank_statement_parsing() {
        let result = parse_ofx(BANK_OFX).unwrap();
        assert_eq!(result.transactions.len(), 3);
        assert_eq!(result.account_id_hint.as_deref(), Some("999888777"));
        assert_eq!(result.institution_hint.as_deref(), Some("Test Bank"));
        assert_eq!(result.currency.as_deref(), Some("USD"));
    }

    #[test]
    fn test_transaction_details() {
        let result = parse_ofx(BANK_OFX).unwrap();
        let t0 = &result.transactions[0];
        assert_eq!(t0.date, "2023-01-05");
        assert_eq!(t0.amount, -42.50);
        assert_eq!(t0.description, "GROCERY STORE");
        assert_eq!(t0.payee.as_deref(), Some("Purchase at grocery"));
        assert_eq!(t0.fitid.as_deref(), Some("20230105001"));
        assert_eq!(t0.transaction_type.as_deref(), Some("DEBIT"));
        assert!(t0.import_hash.is_empty());
    }

    #[test]
    fn test_credit_deposit() {
        let result = parse_ofx(BANK_OFX).unwrap();
        let t1 = &result.transactions[1];
        assert_eq!(t1.date, "2023-01-15");
        assert_eq!(t1.amount, 1500.00);
        assert_eq!(t1.description, "EMPLOYER INC");
        assert_eq!(t1.payee, None);
        assert_eq!(t1.transaction_type.as_deref(), Some("CREDIT"));
    }

    #[test]
    fn test_memo_only_transaction() {
        let result = parse_ofx(BANK_OFX).unwrap();
        let t2 = &result.transactions[2];
        assert_eq!(t2.description, "Coffee Shop");
        assert_eq!(t2.payee, None); // MEMO used as description when no NAME
    }

    #[test]
    fn test_credit_card_statement() {
        let result = parse_ofx(CC_OFX).unwrap();
        assert_eq!(result.transactions.len(), 1);
        assert_eq!(result.account_id_hint.as_deref(), Some("4111111111111111"));
        assert_eq!(result.institution_hint.as_deref(), Some("Credit Card Co"));
        assert_eq!(result.currency.as_deref(), Some("CAD"));

        let t = &result.transactions[0];
        assert_eq!(t.date, "2023-02-01");
        assert_eq!(t.amount, -150.00);
        assert_eq!(t.description, "AIRLINE TICKET");
        assert_eq!(t.payee.as_deref(), Some("Flight booking"));
        assert_eq!(t.fitid.as_deref(), Some("CC20230201001"));
    }

    #[test]
    fn test_qfx_header_handling() {
        let result = parse_ofx(QFX_HEADER).unwrap();
        assert_eq!(result.transactions.len(), 1);
        assert_eq!(result.account_id_hint.as_deref(), Some("123456789"));

        let t = &result.transactions[0];
        assert_eq!(t.date, "2023-03-01");
        assert_eq!(t.amount, -200.00);
        assert_eq!(t.transaction_type.as_deref(), Some("ATM"));
    }

    #[test]
    fn test_date_yyyymmdd() {
        assert_eq!(parse_ofx_date("20230115").unwrap(), "2023-01-15");
    }

    #[test]
    fn test_date_yyyymmddhhmmss() {
        assert_eq!(parse_ofx_date("20230115120000").unwrap(), "2023-01-15");
    }

    #[test]
    fn test_date_with_timezone() {
        assert_eq!(
            parse_ofx_date("20230301120000.000[-5:EST]").unwrap(),
            "2023-03-01"
        );
    }

    #[test]
    fn test_date_too_short() {
        assert!(parse_ofx_date("2023").is_err());
    }

    #[test]
    fn test_date_invalid_month() {
        assert!(parse_ofx_date("20231301").is_err());
    }

    #[test]
    fn test_positive_amount() {
        let result = parse_ofx(BANK_OFX).unwrap();
        assert!(result.transactions[1].amount > 0.0);
    }

    #[test]
    fn test_negative_amount() {
        let result = parse_ofx(BANK_OFX).unwrap();
        assert!(result.transactions[0].amount < 0.0);
    }

    #[test]
    fn test_no_statement_block() {
        let bad = "<OFX><SIGNONMSGSRSV1></SIGNONMSGSRSV1></OFX>";
        assert!(parse_ofx(bad).is_err());
    }

    #[test]
    fn test_name_and_memo_both_present() {
        let result = parse_ofx(BANK_OFX).unwrap();
        let t0 = &result.transactions[0];
        // NAME becomes description, MEMO becomes payee
        assert_eq!(t0.description, "GROCERY STORE");
        assert_eq!(t0.payee.as_deref(), Some("Purchase at grocery"));
    }

    #[test]
    fn test_import_hash_empty() {
        let result = parse_ofx(BANK_OFX).unwrap();
        for t in &result.transactions {
            assert!(t.import_hash.is_empty());
        }
    }
}
