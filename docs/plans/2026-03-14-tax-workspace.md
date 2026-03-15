# Tax Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a tax workspace page that consolidates business income and expenses, maps them to T2125/TP-80 line items, tracks receipts, computes GST/QST ITCs/ITRs, and provides an in-app tax reference guide.

**Architecture:** New `tax` Rust module (model + commands) for tax line items and fiscal year settings. Tax rules config in a bundled JSON file read at startup. Frontend gets a new `/tax` route with fiscal year selector, monthly-grouped tables, receipt upload, and info screen. Business transactions from bank imports appear alongside manual tax line items in a unified view.

**Tech Stack:** Rust (rusqlite, serde, serde_json, uuid, tauri-plugin-fs), React (TypeScript), Tailwind CSS

---

## Task 1: Tax Rules JSON Configuration File

**Files:**
- Create: `src-tauri/src/tax-rules.json`

**Step 1: Create the tax rules config**

```json
{
  "jurisdiction": "CA-QC",
  "fiscal_year_type": "calendar",
  "rates": {
    "gst": 0.05,
    "qst": 0.09975,
    "meals_deduction_pct": 0.50
  },
  "proration_types": {
    "vehicle": {
      "label": "Vehicle business-use",
      "fields": [
        { "key": "vehicle_total_km", "label": "Total kilometres driven", "unit": "km" },
        { "key": "vehicle_business_km", "label": "Business kilometres driven", "unit": "km" }
      ],
      "hint": "Business-use % = business km / total km. CRA requires a logbook to support your claim."
    },
    "home_office": {
      "label": "Home office",
      "fields": [
        { "key": "home_total_sqft", "label": "Total home area", "unit": "sq ft" },
        { "key": "home_office_sqft", "label": "Office area", "unit": "sq ft" }
      ],
      "hint": "Office % = office area / total home area. Space must be used regularly and exclusively for business, or be your principal place of business."
    }
  },
  "line_mappings": [
    {
      "category_slug": "freelance",
      "direction": "income",
      "t2125_line": "8000",
      "t2125_label": "Gross sales, commissions, or fees",
      "tp80_line": "60",
      "tp80_label": "Revenus bruts",
      "gst_eligible": false,
      "qst_eligible": false,
      "proration": null,
      "hint": "All business income from clients. Zero-rated if client is outside Canada."
    },
    {
      "category_slug": "other_income",
      "direction": "income",
      "t2125_line": "8230",
      "t2125_label": "Other income",
      "tp80_line": "154",
      "tp80_label": "Autres revenus",
      "gst_eligible": false,
      "qst_eligible": false,
      "proration": null,
      "hint": "Miscellaneous business income not from direct client work."
    },
    {
      "category_slug": "advertising",
      "direction": "expense",
      "t2125_line": "8521",
      "t2125_label": "Advertising",
      "tp80_line": "160",
      "tp80_label": "Publicite",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Online ads, marketing materials, promotional costs."
    },
    {
      "category_slug": "meals_business",
      "direction": "expense",
      "t2125_line": "8523",
      "t2125_label": "Meals and entertainment",
      "tp80_line": "163",
      "tp80_label": "Repas et frais de representation",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Only 50% of meal/entertainment expenses are deductible. ITC/ITR also limited to 50%."
    },
    {
      "category_slug": "office_supplies",
      "direction": "expense",
      "t2125_line": "8810",
      "t2125_label": "Office expenses",
      "tp80_line": "176",
      "tp80_label": "Fournitures de bureau",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Pens, paper, printer ink, desk accessories, minor office items."
    },
    {
      "category_slug": "software_saas",
      "direction": "expense",
      "t2125_line": "8810",
      "t2125_label": "Office expenses",
      "tp80_line": "176",
      "tp80_label": "Fournitures de bureau",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Software subscriptions, SaaS tools, cloud services used for business."
    },
    {
      "category_slug": "hosting_cloud",
      "direction": "expense",
      "t2125_line": "8810",
      "t2125_label": "Office expenses",
      "tp80_line": "176",
      "tp80_label": "Fournitures de bureau",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Web hosting, cloud infrastructure, domain registration."
    },
    {
      "category_slug": "contractors",
      "direction": "expense",
      "t2125_line": "8871",
      "t2125_label": "Professional fees",
      "tp80_line": "180",
      "tp80_label": "Honoraires professionnels",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Subcontractor and freelancer payments."
    },
    {
      "category_slug": "professional_services",
      "direction": "expense",
      "t2125_line": "8871",
      "t2125_label": "Professional fees",
      "tp80_line": "180",
      "tp80_label": "Honoraires professionnels",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Accountant, lawyer, bookkeeper fees."
    },
    {
      "category_slug": "travel_business",
      "direction": "expense",
      "t2125_line": "8522",
      "t2125_label": "Travel expenses",
      "tp80_line": "162",
      "tp80_label": "Frais de deplacement",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Flights, hotels, car rentals for business travel. Does not include daily commute."
    },
    {
      "category_slug": "shipping",
      "direction": "expense",
      "t2125_line": "8810",
      "t2125_label": "Office expenses",
      "tp80_line": "176",
      "tp80_label": "Fournitures de bureau",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Postage, courier, shipping costs for business."
    },
    {
      "category_slug": "equipment",
      "direction": "expense",
      "t2125_line": "9936",
      "t2125_label": "Capital cost allowance (CCA)",
      "tp80_line": "197",
      "tp80_label": "Deduction pour amortissement",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Major equipment purchases. May need to be capitalized and claimed as CCA over multiple years rather than expensed in full."
    },
    {
      "category_slug": "rent_coworking",
      "direction": "expense",
      "t2125_line": "8910",
      "t2125_label": "Rent",
      "tp80_line": "183",
      "tp80_label": "Loyer",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Coworking space or dedicated business office rent. Home office rent uses proration instead."
    },
    {
      "category_slug": "telecom",
      "direction": "expense",
      "t2125_line": "8220",
      "t2125_label": "Telephone and utilities",
      "tp80_line": "164",
      "tp80_label": "Telephone et services publics",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Business phone line, business portion of mobile plan."
    },
    {
      "category_slug": "other_business",
      "direction": "expense",
      "t2125_line": "9270",
      "t2125_label": "Other expenses",
      "tp80_line": "194",
      "tp80_label": "Autres depenses",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Business expenses that do not fit other categories."
    },
    {
      "category_slug": "tax_preparation",
      "direction": "expense",
      "t2125_line": "8871",
      "t2125_label": "Professional fees",
      "tp80_line": "180",
      "tp80_label": "Honoraires professionnels",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": null,
      "hint": "Tax filing software, accountant fees for business return preparation."
    },
    {
      "category_slug": "fuel",
      "direction": "expense",
      "t2125_line": "9281",
      "t2125_label": "Motor vehicle expenses",
      "tp80_line": "186",
      "tp80_label": "Frais de vehicule a moteur",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": "vehicle",
      "hint": "Gas, diesel. Deductible portion based on business-use %."
    },
    {
      "category_slug": "vehicle_insurance",
      "direction": "expense",
      "t2125_line": "9281",
      "t2125_label": "Motor vehicle expenses",
      "tp80_line": "186",
      "tp80_label": "Frais de vehicule a moteur",
      "gst_eligible": false,
      "qst_eligible": false,
      "proration": "vehicle",
      "hint": "Car insurance premiums. Not subject to GST/QST. Deductible portion based on business-use %."
    },
    {
      "category_slug": "vehicle_maintenance",
      "direction": "expense",
      "t2125_line": "9281",
      "t2125_label": "Motor vehicle expenses",
      "tp80_line": "186",
      "tp80_label": "Frais de vehicule a moteur",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": "vehicle",
      "hint": "Oil changes, tires, repairs. Deductible portion based on business-use %."
    },
    {
      "category_slug": "vehicle_payment",
      "direction": "expense",
      "t2125_line": "9281",
      "t2125_label": "Motor vehicle expenses",
      "tp80_line": "186",
      "tp80_label": "Frais de vehicule a moteur",
      "gst_eligible": false,
      "qst_eligible": false,
      "proration": "vehicle",
      "hint": "Lease payments or interest on vehicle loan (not principal). Deductible portion based on business-use %."
    },
    {
      "category_slug": "parking",
      "direction": "expense",
      "t2125_line": "9281",
      "t2125_label": "Motor vehicle expenses",
      "tp80_line": "186",
      "tp80_label": "Frais de vehicule a moteur",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": "vehicle",
      "hint": "Business-related parking. Deductible portion based on business-use %."
    },
    {
      "category_slug": "electricity",
      "direction": "expense",
      "t2125_line": "9945",
      "t2125_label": "Business-use-of-home expenses",
      "tp80_line": "198",
      "tp80_label": "Depenses d'utilisation de la residence",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": "home_office",
      "hint": "Electricity bill. Deductible portion based on home office %."
    },
    {
      "category_slug": "gas_heating",
      "direction": "expense",
      "t2125_line": "9945",
      "t2125_label": "Business-use-of-home expenses",
      "tp80_line": "198",
      "tp80_label": "Depenses d'utilisation de la residence",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": "home_office",
      "hint": "Natural gas or heating fuel. Deductible portion based on home office %."
    },
    {
      "category_slug": "mortgage",
      "direction": "expense",
      "t2125_line": "9945",
      "t2125_label": "Business-use-of-home expenses",
      "tp80_line": "198",
      "tp80_label": "Depenses d'utilisation de la residence",
      "gst_eligible": false,
      "qst_eligible": false,
      "proration": "home_office",
      "hint": "Mortgage INTEREST only (not principal). Deductible portion based on home office %. Not subject to GST/QST."
    },
    {
      "category_slug": "property_tax",
      "direction": "expense",
      "t2125_line": "9945",
      "t2125_label": "Business-use-of-home expenses",
      "tp80_line": "198",
      "tp80_label": "Depenses d'utilisation de la residence",
      "gst_eligible": false,
      "qst_eligible": false,
      "proration": "home_office",
      "hint": "Municipal/school property tax. Deductible portion based on home office %. Not subject to GST/QST."
    },
    {
      "category_slug": "home_insurance",
      "direction": "expense",
      "t2125_line": "9945",
      "t2125_label": "Business-use-of-home expenses",
      "tp80_line": "198",
      "tp80_label": "Depenses d'utilisation de la residence",
      "gst_eligible": false,
      "qst_eligible": false,
      "proration": "home_office",
      "hint": "Homeowner's insurance premium. Deductible portion based on home office %. Not subject to GST/QST."
    },
    {
      "category_slug": "internet",
      "direction": "expense",
      "t2125_line": "9945",
      "t2125_label": "Business-use-of-home expenses",
      "tp80_line": "198",
      "tp80_label": "Depenses d'utilisation de la residence",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": "home_office",
      "hint": "Home internet service. Deductible portion based on home office %."
    },
    {
      "category_slug": "maintenance_repairs",
      "direction": "expense",
      "t2125_line": "9945",
      "t2125_label": "Business-use-of-home expenses",
      "tp80_line": "198",
      "tp80_label": "Depenses d'utilisation de la residence",
      "gst_eligible": true,
      "qst_eligible": true,
      "proration": "home_office",
      "hint": "Home repairs and maintenance. Deductible portion based on home office %."
    }
  ],
  "reminders": [
    {
      "id": "receipt_retention",
      "context": "receipt",
      "text": "Keep all receipts for 6 years from the end of the tax year. CRA can request them at any time during an audit."
    },
    {
      "id": "vehicle_logbook",
      "context": "vehicle",
      "text": "CRA requires a logbook to support your business-use percentage claim. Record date, destination, purpose, and kilometres for every business trip."
    },
    {
      "id": "meals_50pct",
      "context": "meals",
      "text": "Only 50% of meal and entertainment expenses are deductible. The GST/QST ITC/ITR is also limited to 50%."
    },
    {
      "id": "home_office_exclusive",
      "context": "home_office",
      "text": "Your home office must be used regularly and exclusively for business, OR be your principal place of business (where you earn more than 50% of income)."
    },
    {
      "id": "zero_rated_exports",
      "context": "income",
      "text": "Services provided to non-resident clients (e.g., US companies) are zero-rated for GST/QST. You do not charge GST/QST but can still claim ITCs/ITRs on business expenses."
    },
    {
      "id": "itc_itr_timing",
      "context": "gst_qst",
      "text": "Claim ITCs/ITRs in the reporting period when the expense was paid or became payable, not when the return is filed."
    },
    {
      "id": "cca_half_year",
      "context": "equipment",
      "text": "In the year you acquire a capital asset, you can only claim half the normal CCA rate (half-year rule). Consider immediate expensing rules for eligible property."
    },
    {
      "id": "mortgage_interest_only",
      "context": "home_office",
      "text": "Only the interest portion of your mortgage payment is deductible as a home office expense. Principal payments are not deductible."
    }
  ],
  "info_sections": [
    {
      "id": "t2125_overview",
      "title": "T2125 -- Statement of Business or Professional Activities",
      "body": "Federal form for reporting self-employment income and expenses. Filed as part of your personal T1 return. Reports gross income, allowable expenses by category, net income, and business-use-of-home and motor vehicle expenses. All amounts in CAD."
    },
    {
      "id": "tp80_overview",
      "title": "TP-80 -- Business or Professional Income and Expenses",
      "body": "Quebec equivalent of the federal T2125. Filed with your TP-1 provincial return. Same income and expense structure but with Quebec-specific line numbers. Amounts must match your T2125 figures."
    },
    {
      "id": "gst_qst_overview",
      "title": "GST/QST Returns and Input Tax Credits",
      "body": "As a registered business, you file GST/QST returns (annually, quarterly, or monthly depending on revenue). Even if your income is zero-rated (export services), you must file returns. You can claim Input Tax Credits (ITCs for GST) and Input Tax Refunds (ITRs for QST) on eligible business expenses. ITCs/ITRs are computed by applying the tax rate to the pre-tax amount of eligible expenses."
    },
    {
      "id": "vehicle_expenses",
      "title": "Motor Vehicle Expense Deductions",
      "body": "You can deduct vehicle expenses proportional to business use. Track total km driven in the year and business km driven. Eligible expenses: fuel, insurance, maintenance, lease payments or loan interest, licence and registration, parking. Keep a logbook."
    },
    {
      "id": "home_office_expenses",
      "title": "Business-Use-of-Home Deductions",
      "body": "If you work from home, you can deduct a portion of household expenses. The portion is calculated as: office square footage / total home square footage. Eligible expenses: mortgage interest (not principal), property tax, home insurance, electricity, heating, water, internet, maintenance. Home office expenses cannot create or increase a business loss -- carry forward any excess to the next year."
    }
  ]
}
```

**Step 2: Commit**

```bash
git add src-tauri/src/tax-rules.json
git commit -m "feat: add tax rules JSON config for T2125/TP-80 line mappings and GST/QST rates"
```

---

## Task 2: Database Schema -- Tax Line Items and Fiscal Year Settings

**Files:**
- Modify: `src-tauri/src/schema.sql`
- Modify: `src-tauri/src/db.rs`

**Step 1: Add new tables to schema.sql**

Append after the `transaction_tags` index:

```sql
CREATE TABLE IF NOT EXISTS tax_line_items (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    has_receipt INTEGER NOT NULL DEFAULT 0,
    receipt_path TEXT,
    notes TEXT,
    fiscal_year INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tax_line_items_fiscal_year ON tax_line_items(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_tax_line_items_date ON tax_line_items(date);
CREATE INDEX IF NOT EXISTS idx_tax_line_items_category ON tax_line_items(category_id);

CREATE TABLE IF NOT EXISTS fiscal_year_settings (
    fiscal_year INTEGER PRIMARY KEY,
    vehicle_total_km REAL,
    vehicle_business_km REAL,
    home_total_sqft REAL,
    home_office_sqft REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Step 2: Add receipt columns to transactions via migration in db.rs**

In `db.rs` `initialize_schema()`, after existing migrations, add:

```rust
// Migration: add receipt tracking to transactions
conn.execute_batch("ALTER TABLE transactions ADD COLUMN has_receipt INTEGER NOT NULL DEFAULT 0;")
    .ok();
conn.execute_batch("ALTER TABLE transactions ADD COLUMN receipt_path TEXT;")
    .ok();
```

**Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors

**Step 4: Commit**

```bash
git add src-tauri/src/schema.sql src-tauri/src/db.rs
git commit -m "feat: add tax_line_items, fiscal_year_settings tables and receipt columns on transactions"
```

---

## Task 3: Rust Models -- Tax Line Items

**Files:**
- Create: `src-tauri/src/models/tax_line_item.rs`
- Modify: `src-tauri/src/models/mod.rs`

**Step 1: Create the tax line item model**

```rust
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxLineItem {
    pub id: String,
    pub date: String,
    pub description: String,
    pub amount: f64,
    pub category_id: Option<String>,
    pub has_receipt: bool,
    pub receipt_path: Option<String>,
    pub notes: Option<String>,
    pub fiscal_year: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaxLineItemParams {
    pub date: String,
    pub description: String,
    pub amount: f64,
    pub category_id: Option<String>,
    pub has_receipt: Option<bool>,
    pub receipt_path: Option<String>,
    pub notes: Option<String>,
    pub fiscal_year: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaxLineItemParams {
    pub date: Option<String>,
    pub description: Option<String>,
    pub amount: Option<f64>,
    pub category_id: Option<Option<String>>,
    pub has_receipt: Option<bool>,
    pub receipt_path: Option<Option<String>>,
    pub notes: Option<Option<String>>,
}

const SELECT_COLS: &str =
    "id, date, description, amount, category_id, has_receipt, receipt_path, notes, fiscal_year, created_at, updated_at";

fn row_to_tax_line_item(row: &rusqlite::Row) -> rusqlite::Result<TaxLineItem> {
    Ok(TaxLineItem {
        id: row.get(0)?,
        date: row.get(1)?,
        description: row.get(2)?,
        amount: row.get(3)?,
        category_id: row.get(4)?,
        has_receipt: row.get(5)?,
        receipt_path: row.get(6)?,
        notes: row.get(7)?,
        fiscal_year: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub fn create_tax_line_item(
    conn: &Connection,
    params: CreateTaxLineItemParams,
) -> Result<TaxLineItem, DbError> {
    let id = Uuid::new_v4().to_string();
    let has_receipt = params.has_receipt.unwrap_or(false);
    conn.execute(
        "INSERT INTO tax_line_items (id, date, description, amount, category_id, has_receipt, receipt_path, notes, fiscal_year) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            params.date,
            params.description,
            params.amount,
            params.category_id,
            has_receipt,
            params.receipt_path,
            params.notes,
            params.fiscal_year,
        ],
    )?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM tax_line_items WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(params![&id], row_to_tax_line_item)?)
}

pub fn update_tax_line_item(
    conn: &Connection,
    id: &str,
    params: UpdateTaxLineItemParams,
) -> Result<TaxLineItem, DbError> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref date) = params.date {
        sets.push("date = ?");
        values.push(Box::new(date.clone()));
    }
    if let Some(ref description) = params.description {
        sets.push("description = ?");
        values.push(Box::new(description.clone()));
    }
    if let Some(amount) = params.amount {
        sets.push("amount = ?");
        values.push(Box::new(amount));
    }
    if let Some(ref category_id) = params.category_id {
        sets.push("category_id = ?");
        values.push(Box::new(category_id.clone()));
    }
    if let Some(has_receipt) = params.has_receipt {
        sets.push("has_receipt = ?");
        values.push(Box::new(has_receipt));
    }
    if let Some(ref receipt_path) = params.receipt_path {
        sets.push("receipt_path = ?");
        values.push(Box::new(receipt_path.clone()));
    }
    if let Some(ref notes) = params.notes {
        sets.push("notes = ?");
        values.push(Box::new(notes.clone()));
    }

    if !sets.is_empty() {
        sets.push("updated_at = datetime('now')");
        values.push(Box::new(id.to_string()));
        let sql = format!(
            "UPDATE tax_line_items SET {} WHERE id = ?",
            sets.join(", ")
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())?;
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM tax_line_items WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(rusqlite::params![id], row_to_tax_line_item)?)
}

pub fn delete_tax_line_item(conn: &Connection, id: &str) -> Result<(), DbError> {
    conn.execute(
        "DELETE FROM tax_line_items WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn list_tax_line_items_by_year(
    conn: &Connection,
    fiscal_year: i32,
) -> Result<Vec<TaxLineItem>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM tax_line_items WHERE fiscal_year = ?1 ORDER BY date ASC",
        SELECT_COLS
    ))?;
    let items = stmt
        .query_map(params![fiscal_year], row_to_tax_line_item)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}
```

**Step 2: Add module to mod.rs**

Add `pub mod tax_line_item;` to `src-tauri/src/models/mod.rs`.

**Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src-tauri/src/models/tax_line_item.rs src-tauri/src/models/mod.rs
git commit -m "feat: add tax_line_item model with CRUD operations"
```

---

## Task 4: Rust Models -- Fiscal Year Settings

**Files:**
- Create: `src-tauri/src/models/fiscal_year_settings.rs`
- Modify: `src-tauri/src/models/mod.rs`

**Step 1: Create the fiscal year settings model**

```rust
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::db::DbError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FiscalYearSettings {
    pub fiscal_year: i32,
    pub vehicle_total_km: Option<f64>,
    pub vehicle_business_km: Option<f64>,
    pub home_total_sqft: Option<f64>,
    pub home_office_sqft: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpsertFiscalYearSettingsParams {
    pub fiscal_year: i32,
    pub vehicle_total_km: Option<f64>,
    pub vehicle_business_km: Option<f64>,
    pub home_total_sqft: Option<f64>,
    pub home_office_sqft: Option<f64>,
}

const SELECT_COLS: &str =
    "fiscal_year, vehicle_total_km, vehicle_business_km, home_total_sqft, home_office_sqft, created_at, updated_at";

fn row_to_settings(row: &rusqlite::Row) -> rusqlite::Result<FiscalYearSettings> {
    Ok(FiscalYearSettings {
        fiscal_year: row.get(0)?,
        vehicle_total_km: row.get(1)?,
        vehicle_business_km: row.get(2)?,
        home_total_sqft: row.get(3)?,
        home_office_sqft: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

pub fn upsert_fiscal_year_settings(
    conn: &Connection,
    params: UpsertFiscalYearSettingsParams,
) -> Result<FiscalYearSettings, DbError> {
    conn.execute(
        "INSERT INTO fiscal_year_settings (fiscal_year, vehicle_total_km, vehicle_business_km, home_total_sqft, home_office_sqft) \
         VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT(fiscal_year) DO UPDATE SET \
         vehicle_total_km = excluded.vehicle_total_km, \
         vehicle_business_km = excluded.vehicle_business_km, \
         home_total_sqft = excluded.home_total_sqft, \
         home_office_sqft = excluded.home_office_sqft, \
         updated_at = datetime('now')",
        params![
            params.fiscal_year,
            params.vehicle_total_km,
            params.vehicle_business_km,
            params.home_total_sqft,
            params.home_office_sqft,
        ],
    )?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM fiscal_year_settings WHERE fiscal_year = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(params![params.fiscal_year], row_to_settings)?)
}

pub fn get_fiscal_year_settings(
    conn: &Connection,
    fiscal_year: i32,
) -> Result<Option<FiscalYearSettings>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM fiscal_year_settings WHERE fiscal_year = ?1",
        SELECT_COLS
    ))?;
    let result = stmt.query_row(params![fiscal_year], row_to_settings);
    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(DbError::from(e)),
    }
}
```

**Step 2: Add module to mod.rs**

Add `pub mod fiscal_year_settings;` to `src-tauri/src/models/mod.rs`.

**Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src-tauri/src/models/fiscal_year_settings.rs src-tauri/src/models/mod.rs
git commit -m "feat: add fiscal_year_settings model with upsert and get"
```

---

## Task 5: Rust Models -- Tax Rules Config Loader

**Files:**
- Create: `src-tauri/src/tax.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create the tax rules module**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxRules {
    pub jurisdiction: String,
    pub fiscal_year_type: String,
    pub rates: TaxRates,
    pub proration_types: std::collections::HashMap<String, ProrationType>,
    pub line_mappings: Vec<LineMapping>,
    pub reminders: Vec<Reminder>,
    pub info_sections: Vec<InfoSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxRates {
    pub gst: f64,
    pub qst: f64,
    pub meals_deduction_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProrationType {
    pub label: String,
    pub fields: Vec<ProrationField>,
    pub hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProrationField {
    pub key: String,
    pub label: String,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineMapping {
    pub category_slug: String,
    pub direction: String,
    pub t2125_line: String,
    pub t2125_label: String,
    pub tp80_line: String,
    pub tp80_label: String,
    pub gst_eligible: bool,
    pub qst_eligible: bool,
    pub proration: Option<String>,
    pub hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reminder {
    pub id: String,
    pub context: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InfoSection {
    pub id: String,
    pub title: String,
    pub body: String,
}

pub fn load_tax_rules() -> TaxRules {
    let json = include_str!("tax-rules.json");
    serde_json::from_str(json).expect("Failed to parse tax-rules.json")
}
```

**Step 2: Add `mod tax;` to lib.rs**

Add `mod tax;` after the existing module declarations in `src-tauri/src/lib.rs`.

**Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src-tauri/src/tax.rs src-tauri/src/lib.rs
git commit -m "feat: add tax rules config loader with serde types"
```

---

## Task 6: Tauri Commands -- Tax Module

**Files:**
- Create: `src-tauri/src/commands/tax.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create tax commands**

```rust
use serde::{Deserialize, Serialize};
use tauri::State;

use super::with_db_conn;
use crate::models::fiscal_year_settings::{self, UpsertFiscalYearSettingsParams};
use crate::models::tax_line_item::{self, CreateTaxLineItemParams, UpdateTaxLineItemParams};
use crate::tax;
use crate::AppState;

/// Unified item shown in the tax workspace -- either a bank transaction or a manual tax line item
#[derive(Debug, Serialize)]
pub struct TaxWorkspaceItem {
    pub id: String,
    pub source: String, // "transaction" or "tax_line_item"
    pub date: String,
    pub description: String,
    pub amount: f64,
    pub category_id: Option<String>,
    pub has_receipt: bool,
    pub receipt_path: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
#[serde(rename_all = "snake_case")]
pub fn get_tax_rules() -> Result<tax::TaxRules, String> {
    Ok(tax::load_tax_rules())
}

#[tauri::command]
#[serde(rename_all = "snake_case")]
pub fn list_tax_line_items(
    state: State<'_, AppState>,
    fiscal_year: i32,
) -> Result<Vec<tax_line_item::TaxLineItem>, String> {
    with_db_conn(&state, |conn| {
        tax_line_item::list_tax_line_items_by_year(conn, fiscal_year)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
#[serde(rename_all = "snake_case")]
pub fn create_tax_line_item_cmd(
    state: State<'_, AppState>,
    params: CreateTaxLineItemParams,
) -> Result<tax_line_item::TaxLineItem, String> {
    with_db_conn(&state, |conn| {
        tax_line_item::create_tax_line_item(conn, params).map_err(|e| e.to_string())
    })
}

#[tauri::command]
#[serde(rename_all = "snake_case")]
pub fn update_tax_line_item_cmd(
    state: State<'_, AppState>,
    id: String,
    params: UpdateTaxLineItemParams,
) -> Result<tax_line_item::TaxLineItem, String> {
    with_db_conn(&state, |conn| {
        tax_line_item::update_tax_line_item(conn, &id, params).map_err(|e| e.to_string())
    })
}

#[tauri::command]
#[serde(rename_all = "snake_case")]
pub fn delete_tax_line_item_cmd(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        tax_line_item::delete_tax_line_item(conn, &id).map_err(|e| e.to_string())
    })
}

#[tauri::command]
#[serde(rename_all = "snake_case")]
pub fn get_fiscal_year_settings_cmd(
    state: State<'_, AppState>,
    fiscal_year: i32,
) -> Result<Option<fiscal_year_settings::FiscalYearSettings>, String> {
    with_db_conn(&state, |conn| {
        fiscal_year_settings::get_fiscal_year_settings(conn, fiscal_year)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
#[serde(rename_all = "snake_case")]
pub fn upsert_fiscal_year_settings_cmd(
    state: State<'_, AppState>,
    params: UpsertFiscalYearSettingsParams,
) -> Result<fiscal_year_settings::FiscalYearSettings, String> {
    with_db_conn(&state, |conn| {
        fiscal_year_settings::upsert_fiscal_year_settings(conn, params)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
#[serde(rename_all = "snake_case")]
pub fn get_tax_workspace_items(
    state: State<'_, AppState>,
    fiscal_year: i32,
) -> Result<Vec<TaxWorkspaceItem>, String> {
    with_db_conn(&state, |conn| {
        let rules = tax::load_tax_rules();
        let mapped_slugs: Vec<&str> = rules
            .line_mappings
            .iter()
            .map(|m| m.category_slug.as_str())
            .collect();

        // Get category IDs for mapped slugs
        let placeholders: Vec<String> = (0..mapped_slugs.len())
            .map(|i| format!("?{}", i + 1))
            .collect();
        let sql = format!(
            "SELECT id FROM categories WHERE slug IN ({})",
            placeholders.join(", ")
        );
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        for slug in &mapped_slugs {
            values.push(Box::new(slug.to_string()));
        }
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            values.iter().map(|v| v.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let category_ids: Vec<String> = stmt
            .query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?;

        // Fetch business transactions for the fiscal year
        let mut items: Vec<TaxWorkspaceItem> = Vec::new();

        if !category_ids.is_empty() {
            let t_placeholders: Vec<String> = (0..category_ids.len())
                .map(|i| format!("?{}", i + 1))
                .collect();
            let date_from = format!("{}-01-01", fiscal_year);
            let date_to = format!("{}-12-31", fiscal_year);
            let t_sql = format!(
                "SELECT id, date, description, amount, category_id, \
                 COALESCE(has_receipt, 0), receipt_path, notes \
                 FROM transactions \
                 WHERE category_id IN ({}) AND date >= ?{} AND date <= ?{}",
                t_placeholders.join(", "),
                category_ids.len() + 1,
                category_ids.len() + 2
            );
            let mut t_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
            for cid in &category_ids {
                t_values.push(Box::new(cid.clone()));
            }
            t_values.push(Box::new(date_from));
            t_values.push(Box::new(date_to));
            let t_refs: Vec<&dyn rusqlite::types::ToSql> =
                t_values.iter().map(|v| v.as_ref()).collect();
            let mut t_stmt = conn.prepare(&t_sql).map_err(|e| e.to_string())?;
            let txns = t_stmt
                .query_map(t_refs.as_slice(), |row| {
                    Ok(TaxWorkspaceItem {
                        id: row.get(0)?,
                        source: "transaction".to_string(),
                        date: row.get(1)?,
                        description: row.get(2)?,
                        amount: row.get(3)?,
                        category_id: row.get(4)?,
                        has_receipt: row.get(5)?,
                        receipt_path: row.get(6)?,
                        notes: row.get(7)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| e.to_string())?;
            items.extend(txns);
        }

        // Fetch tax line items for the fiscal year
        let tli_items = tax_line_item::list_tax_line_items_by_year(conn, fiscal_year)
            .map_err(|e| e.to_string())?;
        for tli in tli_items {
            items.push(TaxWorkspaceItem {
                id: tli.id,
                source: "tax_line_item".to_string(),
                date: tli.date,
                description: tli.description,
                amount: tli.amount,
                category_id: tli.category_id,
                has_receipt: tli.has_receipt,
                receipt_path: tli.receipt_path,
                notes: tli.notes,
            });
        }

        // Sort by date ascending
        items.sort_by(|a, b| a.date.cmp(&b.date));

        Ok(items)
    })
}

#[tauri::command]
#[serde(rename_all = "snake_case")]
pub fn update_transaction_receipt(
    state: State<'_, AppState>,
    id: String,
    has_receipt: bool,
    receipt_path: Option<String>,
) -> Result<(), String> {
    with_db_conn(&state, |conn| {
        conn.execute(
            "UPDATE transactions SET has_receipt = ?1, receipt_path = ?2, updated_at = datetime('now') WHERE id = ?3",
            rusqlite::params![has_receipt, receipt_path, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}
```

**Step 2: Add `pub mod tax;` to commands/mod.rs**

**Step 3: Register all new commands in lib.rs invoke_handler**

Add to the `generate_handler!` macro:

```rust
// Tax
commands::tax::get_tax_rules,
commands::tax::list_tax_line_items,
commands::tax::create_tax_line_item_cmd,
commands::tax::update_tax_line_item_cmd,
commands::tax::delete_tax_line_item_cmd,
commands::tax::get_fiscal_year_settings_cmd,
commands::tax::upsert_fiscal_year_settings_cmd,
commands::tax::get_tax_workspace_items,
commands::tax::update_transaction_receipt,
```

**Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`

**Step 5: Commit**

```bash
git add src-tauri/src/commands/tax.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for tax workspace, line items, fiscal settings, and receipts"
```

---

## Task 7: Frontend Types and Tauri Bridge -- Tax Module

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/tauri.ts`

**Step 1: Add TypeScript types to types.ts**

Append:

```typescript
export interface TaxRates {
  gst: number;
  qst: number;
  meals_deduction_pct: number;
}

export interface ProrationField {
  key: string;
  label: string;
  unit: string;
}

export interface ProrationType {
  label: string;
  fields: ProrationField[];
  hint: string;
}

export interface LineMapping {
  category_slug: string;
  direction: string;
  t2125_line: string;
  t2125_label: string;
  tp80_line: string;
  tp80_label: string;
  gst_eligible: boolean;
  qst_eligible: boolean;
  proration: string | null;
  hint: string;
}

export interface Reminder {
  id: string;
  context: string;
  text: string;
}

export interface InfoSection {
  id: string;
  title: string;
  body: string;
}

export interface TaxRules {
  jurisdiction: string;
  fiscal_year_type: string;
  rates: TaxRates;
  proration_types: Record<string, ProrationType>;
  line_mappings: LineMapping[];
  reminders: Reminder[];
  info_sections: InfoSection[];
}

export interface TaxLineItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  category_id: string | null;
  has_receipt: boolean;
  receipt_path: string | null;
  notes: string | null;
  fiscal_year: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTaxLineItemParams {
  date: string;
  description: string;
  amount: number;
  category_id?: string | null;
  has_receipt?: boolean;
  receipt_path?: string | null;
  notes?: string | null;
  fiscal_year: number;
}

export interface UpdateTaxLineItemParams {
  date?: string;
  description?: string;
  amount?: number;
  category_id?: string | null;
  has_receipt?: boolean;
  receipt_path?: string | null;
  notes?: string | null;
}

export interface FiscalYearSettings {
  fiscal_year: number;
  vehicle_total_km: number | null;
  vehicle_business_km: number | null;
  home_total_sqft: number | null;
  home_office_sqft: number | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertFiscalYearSettingsParams {
  fiscal_year: number;
  vehicle_total_km?: number | null;
  vehicle_business_km?: number | null;
  home_total_sqft?: number | null;
  home_office_sqft?: number | null;
}

export interface TaxWorkspaceItem {
  id: string;
  source: "transaction" | "tax_line_item";
  date: string;
  description: string;
  amount: number;
  category_id: string | null;
  has_receipt: boolean;
  receipt_path: string | null;
  notes: string | null;
}
```

**Step 2: Add Tauri bridge functions to tauri.ts**

Append:

```typescript
// Tax

export async function getTaxRules(): Promise<TaxRules> {
  return invoke("get_tax_rules");
}

export async function listTaxLineItems(
  fiscalYear: number,
): Promise<TaxLineItem[]> {
  return invoke("list_tax_line_items", { fiscal_year: fiscalYear });
}

export async function createTaxLineItem(
  params: CreateTaxLineItemParams,
): Promise<TaxLineItem> {
  return invoke("create_tax_line_item_cmd", { params });
}

export async function updateTaxLineItem(
  id: string,
  params: UpdateTaxLineItemParams,
): Promise<TaxLineItem> {
  return invoke("update_tax_line_item_cmd", { id, params });
}

export async function deleteTaxLineItem(id: string): Promise<void> {
  return invoke("delete_tax_line_item_cmd", { id });
}

export async function getFiscalYearSettings(
  fiscalYear: number,
): Promise<FiscalYearSettings | null> {
  return invoke("get_fiscal_year_settings_cmd", { fiscal_year: fiscalYear });
}

export async function upsertFiscalYearSettings(
  params: UpsertFiscalYearSettingsParams,
): Promise<FiscalYearSettings> {
  return invoke("upsert_fiscal_year_settings_cmd", { params });
}

export async function getTaxWorkspaceItems(
  fiscalYear: number,
): Promise<TaxWorkspaceItem[]> {
  return invoke("get_tax_workspace_items", { fiscal_year: fiscalYear });
}

export async function updateTransactionReceipt(
  id: string,
  hasReceipt: boolean,
  receiptPath: string | null,
): Promise<void> {
  return invoke("update_transaction_receipt", {
    id,
    has_receipt: hasReceipt,
    receipt_path: receiptPath,
  });
}
```

Also add the new types to the `import type` and `export type` blocks at the top of `tauri.ts`.

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit` (or equivalent for this project's setup)

**Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/tauri.ts
git commit -m "feat: add TypeScript types and Tauri bridge for tax workspace"
```

---

## Task 8: Tax Workspace Page -- Core Layout and Fiscal Year Selector

**Files:**
- Create: `src/pages/TaxPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

**Step 1: Create TaxPage with fiscal year selector and data loading**

```tsx
import { useState, useEffect, useCallback } from "react";
import {
  getTaxRules,
  getTaxWorkspaceItems,
  getFiscalYearSettings,
  listCategories,
} from "../lib/tauri";
import type {
  TaxRules,
  TaxWorkspaceItem,
  FiscalYearSettings,
  Category,
} from "../lib/types";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

export default function TaxPage() {
  const [fiscalYear, setFiscalYear] = useState(CURRENT_YEAR);
  const [taxRules, setTaxRules] = useState<TaxRules | null>(null);
  const [items, setItems] = useState<TaxWorkspaceItem[]>([]);
  const [settings, setSettings] = useState<FiscalYearSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<"expenses" | "income">("expenses");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getTaxRules().then(setTaxRules).catch(console.error);
    listCategories().then(setCategories).catch(console.error);
  }, []);

  const loadData = useCallback(async (year: number) => {
    setLoading(true);
    try {
      const [itemsResult, settingsResult] = await Promise.all([
        getTaxWorkspaceItems(year),
        getFiscalYearSettings(year),
      ]);
      setItems(itemsResult);
      setSettings(settingsResult);
    } catch (err) {
      console.error("Failed to load tax data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(fiscalYear);
  }, [fiscalYear, loadData]);

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const categorySlugMap = new Map(categories.map((c) => [c.slug, c]));

  // Build mapping from category_id to line mapping
  const lineMappingBySlug = new Map(
    (taxRules?.line_mappings ?? []).map((m) => [m.category_slug, m]),
  );

  // Split items by direction
  const getCategorySlug = (categoryId: string | null) => {
    if (!categoryId) return null;
    const cat = categoryMap.get(categoryId);
    return cat?.slug ?? null;
  };

  const getLineMapping = (categoryId: string | null) => {
    const slug = getCategorySlug(categoryId);
    return slug ? lineMappingBySlug.get(slug) ?? null : null;
  };

  const filteredItems = items.filter((item) => {
    const mapping = getLineMapping(item.category_id);
    if (!mapping) return false;
    return activeTab === "income"
      ? mapping.direction === "income"
      : mapping.direction === "expense";
  });

  // Group by month
  const groupedByMonth = new Map<string, TaxWorkspaceItem[]>();
  for (const item of filteredItems) {
    const month = item.date.substring(0, 7); // "YYYY-MM"
    const group = groupedByMonth.get(month) ?? [];
    group.push(item);
    groupedByMonth.set(month, group);
  }
  const sortedMonths = Array.from(groupedByMonth.keys()).sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Tax Workspace</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Fiscal year selector, proration settings button, info button, add button will go here */}
          <select
            value={fiscalYear}
            onChange={(e) => setFiscalYear(Number(e.target.value))}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(["expenses", "income"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab === "expenses" ? "Expenses" : "Income"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-6">
          {sortedMonths.map((month) => {
            const monthItems = groupedByMonth.get(month)!;
            const monthTotal = monthItems.reduce((sum, i) => sum + Math.abs(i.amount), 0);
            const monthLabel = new Date(month + "-01").toLocaleDateString("en-CA", {
              year: "numeric",
              month: "long",
            });

            return (
              <div key={month}>
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {monthLabel}
                  </h3>
                  <span className="text-sm font-medium text-gray-500">
                    ${monthTotal.toFixed(2)}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Description</th>
                      <th className="pb-2 font-medium">Category (T2125)</th>
                      <th className="pb-2 font-medium text-right">Amount</th>
                      <th className="pb-2 font-medium text-center">Receipt</th>
                      <th className="pb-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthItems.map((item) => {
                      const mapping = getLineMapping(item.category_id);
                      const cat = item.category_id
                        ? categoryMap.get(item.category_id)
                        : null;

                      return (
                        <tr
                          key={item.id}
                          className="border-b border-gray-100 dark:border-gray-800"
                        >
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {item.date}
                          </td>
                          <td className="py-2 pr-3">
                            <span>{item.description}</span>
                            {item.source === "tax_line_item" && (
                              <span className="ml-2 text-xs text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                                manual
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <span>{cat?.name ?? "—"}</span>
                            {mapping && (
                              <span
                                className="ml-1 text-xs text-gray-400"
                                title={`${mapping.t2125_label} / TP-80 Line ${mapping.tp80_line}`}
                              >
                                (L{mapping.t2125_line})
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">
                            ${Math.abs(item.amount).toFixed(2)}
                          </td>
                          <td className="py-2 text-center">
                            {item.has_receipt ? (
                              <span className="text-green-600" title="Receipt on file">
                                &#10003;
                              </span>
                            ) : (
                              <span className="text-gray-300" title="No receipt">
                                &#9744;
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-gray-500 truncate max-w-[200px]">
                            {item.notes ?? ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {sortedMonths.length === 0 && (
            <p className="text-sm text-gray-500">
              No {activeTab} items for {fiscalYear}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add route to App.tsx**

Add import: `import TaxPage from "./pages/TaxPage";`

Add route inside the `<Route element={<Layout />}>` group:
```tsx
<Route path="tax" element={<TaxPage />} />
```

**Step 3: Add nav item to Layout.tsx**

Add to the `navItems` array:
```typescript
{ to: "/tax", label: "Tax" },
```

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit` from project root (or however TS checking works in this project)

**Step 5: Commit**

```bash
git add src/pages/TaxPage.tsx src/App.tsx src/components/Layout.tsx
git commit -m "feat: add tax workspace page with fiscal year selector, monthly grouping, and nav entry"
```

---

## Task 9: Tax Workspace -- Annual Summary Section

**Files:**
- Modify: `src/pages/TaxPage.tsx`

**Step 1: Add annual summary below the monthly groups**

After the monthly groups and before the empty state, add an annual summary component that:

- Groups all items by T2125 line number
- Shows subtotal per line
- Shows grand total for income/expenses
- Shows GST ITC and QST ITR totals (applying rates from `taxRules.rates` to eligible items)
- For prorated items, applies the proration percentage from `settings`
- For meals, applies the 50% deduction rate

The summary should be a table at the bottom:

```
T2125 Line | Label | Gross | Deductible | GST ITC | QST ITR
8810       | Office expenses | $500 | $500 | $25.00 | $49.88
9281       | Motor vehicle   | $3000 | $900 (30%) | $45.00 | $89.78
9945       | Home office     | $8000 | $1000 (12.5%) | $50.00 | $99.75
...
TOTAL      |       | ... | ... | $120.00 | $239.41
```

Computation logic:
- `prorationPct`: if mapping has `proration === "vehicle"`, use `settings.vehicle_business_km / settings.vehicle_total_km`. If `"home_office"`, use `settings.home_office_sqft / settings.home_total_sqft`. Otherwise 1.0.
- `deductionPct`: if category slug is `meals_business`, multiply by `taxRules.rates.meals_deduction_pct`. Otherwise 1.0.
- `deductible = gross * prorationPct * deductionPct`
- `gstItc = mapping.gst_eligible ? (gross / 1.14975 * rates.gst) * prorationPct * deductionPct : 0` (extract GST from tax-inclusive amount)
- `qstItr = mapping.qst_eligible ? (gross / 1.14975 * rates.qst) * prorationPct * deductionPct : 0`

Note: Whether amounts are tax-inclusive or tax-exclusive depends on how bank statements report them. Most Canadian bank transactions are tax-inclusive. The formula above reverse-calculates the tax from a tax-inclusive amount. This can be adjusted in the config later if needed.

**Step 2: Commit**

```bash
git add src/pages/TaxPage.tsx
git commit -m "feat: add annual summary with T2125 line totals and GST/QST ITC/ITR computation"
```

---

## Task 10: Tax Workspace -- Add Tax Line Item Form

**Files:**
- Create: `src/components/tax/TaxLineItemForm.tsx`
- Modify: `src/pages/TaxPage.tsx`

**Step 1: Create the add form component**

A modal/dialog form with fields:
- Date (input type date)
- Description (text input)
- Amount (number input)
- Category (CategorySelect dropdown, filtered to business categories only -- categories whose slug appears in `taxRules.line_mappings`)
- Notes (textarea)
- Receipt upload (file input, optional)

On submit: calls `createTaxLineItem()`, then triggers a refresh of the workspace data.

**Step 2: Wire the form into TaxPage**

Add an "Add Item" button in the top bar. Clicking opens the form as a modal. On successful creation, re-fetch workspace items.

**Step 3: Commit**

```bash
git add src/components/tax/TaxLineItemForm.tsx src/pages/TaxPage.tsx
git commit -m "feat: add tax line item creation form in tax workspace"
```

---

## Task 11: Tax Workspace -- Receipt Upload and Management

**Files:**
- Create: `src/components/tax/ReceiptUpload.tsx`
- Modify: `src/pages/TaxPage.tsx`

**Step 1: Create receipt upload component**

Uses `tauri-plugin-dialog` to open a file picker (images, PDFs). Copies the file to the app data directory under `receipts/<fiscal_year>/<item_id>.<ext>` using `tauri-plugin-fs`. Updates the item's `receipt_path` and `has_receipt` via the appropriate Tauri command (`updateTaxLineItem` for tax line items, `updateTransactionReceipt` for transactions).

The receipt column in the table becomes clickable:
- If no receipt: clicking opens file picker to upload
- If receipt exists: clicking opens/shows the receipt, with option to remove

**Step 2: Commit**

```bash
git add src/components/tax/ReceiptUpload.tsx src/pages/TaxPage.tsx
git commit -m "feat: add receipt upload and viewing for tax workspace items"
```

---

## Task 12: Tax Workspace -- Inline Notes Editing

**Files:**
- Modify: `src/pages/TaxPage.tsx`

**Step 1: Make notes column editable**

Click on a notes cell to switch it to an input. On blur or Enter, save via `updateTaxLineItem` (for manual items) or `updateTransaction` (for bank transactions). Use the `item.source` field to determine which command to call.

**Step 2: Commit**

```bash
git add src/pages/TaxPage.tsx
git commit -m "feat: add inline notes editing in tax workspace"
```

---

## Task 13: Tax Workspace -- Proration Settings Modal

**Files:**
- Create: `src/components/tax/ProrationSettingsModal.tsx`
- Modify: `src/pages/TaxPage.tsx`

**Step 1: Create proration settings modal**

Modal with fields from `taxRules.proration_types`:
- Vehicle: total km, business km, computed % (read-only)
- Home office: total sq ft, office sq ft, computed % (read-only)
- Each field shows its `hint` from config as tooltip/helper text

Pre-populated from `settings` (current fiscal year). On save, calls `upsertFiscalYearSettings` and refreshes data.

**Step 2: Add button to TaxPage top bar**

"Proration Settings" button next to fiscal year selector. Opens the modal.

**Step 3: Commit**

```bash
git add src/components/tax/ProrationSettingsModal.tsx src/pages/TaxPage.tsx
git commit -m "feat: add proration settings modal for vehicle and home office percentages"
```

---

## Task 14: Tax Info Screen

**Files:**
- Create: `src/components/tax/TaxInfoPanel.tsx`
- Modify: `src/pages/TaxPage.tsx`

**Step 1: Create info panel component**

A slide-over or modal that renders `taxRules.info_sections` as expandable sections. Each section shows title and body text. Below the info sections, show all `taxRules.reminders` grouped by context.

**Step 2: Add "Tax Info" button to TaxPage top bar**

**Step 3: Commit**

```bash
git add src/components/tax/TaxInfoPanel.tsx src/pages/TaxPage.tsx
git commit -m "feat: add tax info reference panel with T2125/TP-80/GST-QST guides and reminders"
```

---

## Task 15: Inline Rollover Hints

**Files:**
- Modify: `src/pages/TaxPage.tsx`
- Modify: `src/components/tax/TaxLineItemForm.tsx`
- Modify: `src/components/tax/ProrationSettingsModal.tsx`

**Step 1: Add tooltip hints throughout**

- Category column in the table: hover shows `mapping.hint` from config
- Receipt column header: hover shows the `receipt_retention` reminder
- Meals items: show the `meals_50pct` reminder inline or as tooltip
- Vehicle items: show `vehicle_logbook` reminder
- Home office items: show `home_office_exclusive` and `mortgage_interest_only` reminders
- Proration fields: show their `hint` text

Use a simple `title` attribute or a small tooltip component. Match existing UI patterns in the codebase.

**Step 2: Commit**

```bash
git add src/pages/TaxPage.tsx src/components/tax/TaxLineItemForm.tsx src/components/tax/ProrationSettingsModal.tsx
git commit -m "feat: add inline rollover hints from tax rules config throughout tax workspace"
```

---

## Task 16: Delete and Edit Tax Line Items

**Files:**
- Modify: `src/pages/TaxPage.tsx`

**Step 1: Add row actions for tax line items**

For rows where `source === "tax_line_item"`:
- Edit button: opens the TaxLineItemForm pre-populated with existing values, calls `updateTaxLineItem` on save
- Delete button: confirmation prompt, then calls `deleteTaxLineItem`

Transaction-sourced rows are read-only in this view (edit in the Transactions page).

**Step 2: Commit**

```bash
git add src/pages/TaxPage.tsx
git commit -m "feat: add edit and delete actions for manual tax line items"
```

---

## Task 17: Final Integration and Format Check

**Step 1: Run formatter**

Run: `make format`

**Step 2: Run backend build**

Run: `cd src-tauri && cargo build`

**Step 3: Run frontend type check**

Run: `npx tsc --noEmit`

**Step 4: Fix any issues**

**Step 5: Final commit if any formatting changes**

```bash
git add -A
git commit -m "chore: format and fix lint issues"
```
