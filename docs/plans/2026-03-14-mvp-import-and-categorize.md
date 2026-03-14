# MVP: Import & Categorize Financial Data

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Import 2+ years of bank transactions from CSV and OFX/QFX files, categorize them, tag business expenses, and browse/search the full history.

**Architecture:** Rust backend handles all data operations (SQLCipher storage, file parsing, duplicate detection). React frontend communicates via Tauri IPC commands. No HTTP server — direct function calls across the Tauri bridge. Database is a single encrypted file.

**Tech Stack:** Tauri v2, Rust (rusqlite + bundled-sqlcipher), React 19, TypeScript, Vite, Tailwind CSS

---

### Task 1: SQLCipher Database Setup

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/db.rs`
- Create: `src-tauri/src/schema.sql`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add Rust dependencies**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
rusqlite = { version = "0.34", features = ["bundled-sqlcipher"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
sha2 = "0.10"
thiserror = "2"
```

**Step 2: Create the schema**

Create `src-tauri/src/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    institution TEXT,
    account_type TEXT NOT NULL CHECK(account_type IN ('checking', 'savings', 'credit_card', 'investment', 'mortgage', 'asset')),
    currency TEXT NOT NULL DEFAULT 'CAD',
    credit_limit REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    category_type TEXT NOT NULL CHECK(category_type IN ('income', 'expense')),
    is_business_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    payee TEXT,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    is_business INTEGER NOT NULL DEFAULT 0,
    tax_deductible INTEGER NOT NULL DEFAULT 0,
    gst_amount REAL,
    qst_amount REAL,
    notes TEXT,
    import_hash TEXT,
    fitid TEXT,
    transaction_type TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_fitid
    ON transactions(fitid, account_id) WHERE fitid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_import_hash ON transactions(import_hash);

CREATE TABLE IF NOT EXISTS import_records (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK(file_type IN ('csv', 'ofx', 'qfx')),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    transaction_count INTEGER NOT NULL,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS csv_column_mappings (
    id TEXT PRIMARY KEY,
    institution TEXT NOT NULL,
    date_column TEXT NOT NULL,
    amount_column TEXT NOT NULL,
    description_column TEXT NOT NULL,
    payee_column TEXT,
    date_format TEXT NOT NULL DEFAULT '%Y-%m-%d',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categorization_rules (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    match_field TEXT NOT NULL CHECK(match_field IN ('description', 'payee')),
    match_type TEXT NOT NULL CHECK(match_type IN ('contains', 'starts_with', 'exact')),
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 0,
    auto_apply INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Step 3: Create database module**

Create `src-tauri/src/db.rs`:

```rust
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
        conn.execute_batch(schema)?;
        Ok(())
    }

    pub fn connection(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }
}
```

**Step 4: Wire database into Tauri app state**

Update `src-tauri/src/lib.rs` to manage Database as app state. Add `mod db;` and set up the state on app startup. For now, use a hardcoded password — we'll add the unlock UI in Task 7.

**Step 5: Build and verify compilation**

Run: `cd ~/Documents/code/financial-tracker && source "$HOME/.cargo/env" && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: Compiles with no errors (SQLCipher links correctly on macOS)

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: SQLCipher database setup with schema"
```

---

### Task 2: Seed Categories

**Files:**
- Create: `src-tauri/src/models/category.rs`
- Create: `src-tauri/src/models/mod.rs`
- Modify: `src-tauri/src/db.rs`

**Step 1: Create category model with CRUD and seed data**

Create `src-tauri/src/models/mod.rs` and `src-tauri/src/models/category.rs`.

The category model needs:
- `Category` struct (id, name, parent_id, category_type, is_business_default, sort_order)
- `seed_default_categories(conn)` — insert starter categories if table is empty
- `list_categories(conn)` → Vec<Category>
- `create_category(conn, params)` → Category
- `update_category(conn, id, params)` → Category
- `delete_category(conn, id)`

Default categories to seed:

**Income:**
- Employment, Freelance/Contract (business), Investment Income, Refunds, Other Income

**Expense — Personal:**
- Groceries, Dining Out, Rent/Mortgage, Utilities, Transportation, Gas, Insurance, Healthcare, Clothing, Entertainment, Subscriptions, Personal Care, Education, Gifts, Home Maintenance, Pet, Travel, Miscellaneous

**Expense — Business:**
- Software & Tools, Hardware & Equipment, Office Supplies, Professional Services, Advertising & Marketing, Travel (Business), Meals (Business), Internet & Phone, Professional Development, Bank & Service Fees

**Step 2: Call seed on database init**

After `initialize_schema()`, call `seed_default_categories()`.

**Step 3: Build and verify**

Run: `cd ~/Documents/code/financial-tracker && source "$HOME/.cargo/env" && cargo build --manifest-path src-tauri/Cargo.toml`

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: category model with default seed data"
```

---

### Task 3: Account and Transaction Models

**Files:**
- Create: `src-tauri/src/models/account.rs`
- Create: `src-tauri/src/models/transaction.rs`
- Modify: `src-tauri/src/models/mod.rs`

**Step 1: Account model**

- `Account` struct matching schema
- `create_account(conn, params)` → Account
- `list_accounts(conn)` → Vec<Account>
- `update_account(conn, id, params)` → Account
- `delete_account(conn, id)`
- `get_account_by_institution_number(conn, institution, number)` → Option<Account> (for OFX auto-matching)

**Step 2: Transaction model**

- `Transaction` struct matching schema
- `create_transaction(conn, params)` → Transaction
- `create_transactions_batch(conn, Vec<params>)` → count (use a single DB transaction)
- `list_transactions(conn, filters)` → Vec<Transaction> with pagination
  - Filters: account_id, category_id, is_business, date_from, date_to, search (LIKE on description/payee)
- `update_transaction(conn, id, params)` → Transaction
- `update_transactions_category(conn, Vec<id>, category_id)` — bulk re-categorize
- `delete_transaction(conn, id)`
- `check_duplicates_by_fitid(conn, account_id, Vec<fitid>)` → Vec<fitid> (already existing)
- `check_duplicates_by_hash(conn, Vec<hash>)` → Vec<hash> (already existing)

**Step 3: Build and verify**

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: account and transaction models"
```

---

### Task 4: OFX/QFX Parser

**Files:**
- Create: `src-tauri/src/import/mod.rs`
- Create: `src-tauri/src/import/ofx.rs`
- Create: `src-tauri/src/import/types.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod import`)

**Step 1: Define import types**

Create `src-tauri/src/import/types.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedTransaction {
    pub date: String,           // YYYY-MM-DD
    pub amount: f64,
    pub description: String,
    pub payee: Option<String>,
    pub fitid: Option<String>,
    pub transaction_type: Option<String>, // DEBIT, CREDIT, ATM, POS, etc.
    pub import_hash: String,    // SHA-256 of date+amount+description+account_id
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
```

**Step 2: OFX parser**

Create `src-tauri/src/import/ofx.rs`. OFX is SGML, not XML. Parser must handle:
- Strip XML headers if present (some banks wrap OFX in XML)
- Find `<STMTRS>` or `<CCSTMTRS>` (credit card) blocks
- Extract `<BANKACCTFROM>` / `<CCACCTFROM>` for account info
- Parse each `<STMTTRN>` block for: `<TRNTYPE>`, `<DTPOSTED>`, `<TRNAMT>`, `<FITID>`, `<NAME>`, `<MEMO>`
- Date format: `YYYYMMDD` or `YYYYMMDDHHMMSS` → `YYYY-MM-DD`
- Handle QFX (same as OFX, ignore extra `OFXHEADER` preamble)

Don't use an XML parser — parse the SGML tags directly with string operations. OFX tags are not properly closed in many bank exports.

**Step 3: Write tests for OFX parser**

Create test fixtures with sample OFX data (both bank statement and credit card statement). Test:
- Basic OFX parsing
- QFX header handling
- Date format conversion
- Amount parsing (positive and negative)
- Account info extraction
- Handling of `<NAME>` vs `<MEMO>` fields

Run: `cd ~/Documents/code/financial-tracker && source "$HOME/.cargo/env" && cargo test --manifest-path src-tauri/Cargo.toml`

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: OFX/QFX parser with tests"
```

---

### Task 5: CSV Parser

**Files:**
- Create: `src-tauri/src/import/csv.rs`
- Modify: `src-tauri/Cargo.toml` (add `csv` crate)

**Step 1: Add csv dependency**

```toml
csv = "1"
```

**Step 2: CSV parser**

Create `src-tauri/src/import/csv.rs`:

- `preview_csv(file_content: &str)` → first 5 rows + column names (for the mapping UI)
- `parse_csv(file_content: &str, mapping: &CsvColumnMapping)` → ParsedImport
- `CsvColumnMapping` struct: date_column, amount_column, description_column, payee_column (optional), date_format

Handle common date formats: `YYYY-MM-DD`, `MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY/MM/DD`.

Handle amount variations:
- Negative numbers for debits
- Separate debit/credit columns (some banks export this way)
- Currency symbols and commas in amounts ($1,234.56 → 1234.56)

**Step 3: Write tests**

Test with multiple CSV formats (different column orders, date formats, amount formats).

Run: `cd ~/Documents/code/financial-tracker && source "$HOME/.cargo/env" && cargo test --manifest-path src-tauri/Cargo.toml`

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: CSV parser with column mapping and tests"
```

---

### Task 6: Import Pipeline and Duplicate Detection

**Files:**
- Create: `src-tauri/src/import/pipeline.rs`
- Modify: `src-tauri/src/import/mod.rs`

**Step 1: Import hash generation**

Utility function: `compute_import_hash(date: &str, amount: f64, description: &str, account_id: &str) -> String`

Uses SHA-256. Normalize description (lowercase, trim whitespace) before hashing.

**Step 2: Import pipeline**

```rust
pub fn preview_import(db: &Database, account_id: &str, parsed: ParsedImport) -> ImportPreview
```

- Compute import_hash for each transaction (using target account_id)
- Check for FITID duplicates (OFX/QFX): query existing FITIDs in the account
- Check for hash duplicates (CSV fallback): query existing hashes
- Return ImportPreview with counts and duplicate lists

```rust
pub fn execute_import(db: &Database, account_id: &str, transactions: Vec<ParsedTransaction>, skip_duplicates: bool) -> ImportResult
```

- Filter out duplicates if skip_duplicates is true
- Batch insert transactions
- Create import_record entry
- Return count of imported vs skipped

**Step 3: Tests**

Test duplicate detection: import same file twice, verify duplicates are caught.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: import pipeline with duplicate detection"
```

---

### Task 7: Tauri IPC Commands

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/accounts.rs`
- Create: `src-tauri/src/commands/categories.rs`
- Create: `src-tauri/src/commands/transactions.rs`
- Create: `src-tauri/src/commands/import.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create Tauri command modules**

Each command wraps a model/import function and accesses the Database from Tauri state.

**Account commands:**
- `create_account`, `list_accounts`, `update_account`, `delete_account`

**Category commands:**
- `list_categories`, `create_category`, `update_category`, `delete_category`

**Transaction commands:**
- `list_transactions` (with filter params), `update_transaction`, `update_transactions_category`, `delete_transaction`

**Import commands:**
- `preview_csv` — read file, return column names and sample rows
- `parse_and_preview_ofx` — parse OFX/QFX file, run duplicate check, return ImportPreview
- `parse_and_preview_csv` — parse CSV with mapping, run duplicate check, return ImportPreview
- `execute_import` — commit previewed transactions to database

**Database commands:**
- `unlock_database` — open/create database with password, init schema, return success
- `is_database_initialized` — check if db file exists

Use Tauri's file dialog plugin for file selection (add `tauri-plugin-dialog` dependency).

**Step 2: Register all commands in lib.rs invoke_handler**

**Step 3: Build and verify**

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: Tauri IPC commands for all backend operations"
```

---

### Task 8: Frontend Setup — Tailwind, Router, Layout

**Files:**
- Modify: `package.json` (add dependencies)
- Create: `src/styles/globals.css`
- Modify: `src/main.tsx`
- Create: `src/components/Layout.tsx`
- Create: `src/pages/UnlockPage.tsx`
- Create: `src/pages/DashboardPage.tsx`
- Create: `src/pages/TransactionsPage.tsx`
- Create: `src/pages/ImportPage.tsx`
- Create: `src/pages/CategoriesPage.tsx`
- Delete: `src/App.css`, clean up `src/App.tsx`

**Step 1: Install frontend dependencies**

```bash
cd ~/Documents/code/financial-tracker
npm install react-router-dom @tailwindcss/vite tailwindcss
```

**Step 2: Configure Tailwind with Vite plugin**

Update `vite.config.ts` to add Tailwind plugin.

Create `src/styles/globals.css`:
```css
@import "tailwindcss";
```

**Step 3: Create layout with sidebar navigation**

`Layout.tsx`: Sidebar with nav links (Dashboard, Transactions, Import, Categories). Main content area. Dark mode support via Tailwind `dark:` classes. Use `prefers-color-scheme` media query.

**Step 4: Create page shells**

Minimal placeholder pages for each route. `UnlockPage.tsx` has a password input to unlock the database.

**Step 5: Set up React Router in App.tsx**

Routes:
- `/` → UnlockPage (if locked) or redirect to /transactions
- `/transactions` → TransactionsPage
- `/import` → ImportPage
- `/categories` → CategoriesPage
- `/dashboard` → DashboardPage (placeholder for now)

**Step 6: Verify frontend builds**

Run: `cd ~/Documents/code/financial-tracker && npm run build`

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: frontend layout with Tailwind, routing, and page shells"
```

---

### Task 9: Unlock Screen and IPC Hooks

**Files:**
- Create: `src/lib/tauri.ts` (typed invoke wrappers)
- Modify: `src/pages/UnlockPage.tsx`
- Create: `src/hooks/useDatabase.ts`

**Step 1: Create typed Tauri invoke wrappers**

`src/lib/tauri.ts`: Export typed async functions for each Tauri command. This is the single interface between React and Rust.

```typescript
import { invoke } from "@tauri-apps/api/core";

export async function unlockDatabase(password: string): Promise<void> {
  return invoke("unlock_database", { password });
}

export async function listAccounts(): Promise<Account[]> {
  return invoke("list_accounts");
}
// ... etc for all commands
```

**Step 2: Build UnlockPage**

Password input, submit button. On success, navigate to `/transactions`. On first launch, this creates the database. Show appropriate messaging ("Create password" vs "Enter password").

**Step 3: Create useDatabase hook**

Tracks whether database is unlocked. Wraps the check in a React context so all pages redirect to unlock if needed.

**Step 4: Verify with `npm run tauri dev`**

Launch the app, see the unlock screen, enter a password, get redirected.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: database unlock screen with Tauri IPC"
```

---

### Task 10: Import Flow UI

**Files:**
- Modify: `src/pages/ImportPage.tsx`
- Create: `src/components/import/FileSelector.tsx`
- Create: `src/components/import/CsvMappingStep.tsx`
- Create: `src/components/import/ImportPreviewStep.tsx`
- Create: `src/components/import/ImportResultStep.tsx`

**Step 1: File selection**

Use Tauri dialog plugin to open file picker. Filter for `.csv`, `.ofx`, `.qfx` files. Detect file type from extension.

**Step 2: OFX/QFX flow**

File selected → call `parse_and_preview_ofx` → show ImportPreviewStep with:
- Auto-detected account info (institution, account number)
- Account selector (pick existing or create new)
- Transaction count, duplicate count
- Table showing first 20 transactions
- Duplicates highlighted in yellow
- Checkbox: "Skip duplicates" (default: checked)
- "Import" button

**Step 3: CSV flow**

File selected → call `preview_csv` → show CsvMappingStep:
- Preview table of first 5 rows
- Dropdowns to map: date column, amount column, description column, payee column (optional)
- Date format selector
- Account selector
- "Preview" button → call `parse_and_preview_csv` → show ImportPreviewStep (same as OFX)

**Step 4: Import execution**

"Import" button → call `execute_import` → show ImportResultStep:
- "Imported X transactions (Y duplicates skipped)"
- "Import another file" button
- "View transactions" link

**Step 5: Verify end-to-end**

Run app, import a real OFX file, see transactions appear.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: import flow UI for CSV and OFX/QFX"
```

---

### Task 11: Transaction List with Search

**Files:**
- Modify: `src/pages/TransactionsPage.tsx`
- Create: `src/components/transactions/TransactionTable.tsx`
- Create: `src/components/transactions/TransactionFilters.tsx`
- Create: `src/components/transactions/CategorySelect.tsx`

**Step 1: Transaction table**

Sortable, paginated table showing: date, description, payee, amount, category, business flag, account.
- Amounts: red for expenses, green for income
- Category shown as pill/badge
- Business flag as a toggle icon
- Click row to expand/edit

**Step 2: Search and filters**

- Search bar: free text search across description and payee
- Date range filter (from/to)
- Account filter dropdown
- Category filter dropdown
- Business-only toggle
- Uncategorized-only toggle

**Step 3: Inline editing**

- Click category pill → dropdown to change category
- Click business toggle → flip is_business
- Changes save immediately via Tauri command

**Step 4: Bulk operations**

- Checkbox on each row
- Select all
- Bulk actions: set category, toggle business flag

**Step 5: Verify**

Import data, search, filter, re-categorize.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: transaction list with search, filters, and inline editing"
```

---

### Task 12: Category Management

**Files:**
- Modify: `src/pages/CategoriesPage.tsx`
- Create: `src/components/categories/CategoryList.tsx`
- Create: `src/components/categories/CategoryForm.tsx`

**Step 1: Category list**

Grouped by type (Income / Personal Expense / Business Expense). Show parent-child hierarchy with indentation. Each row: name, type, business default flag, transaction count.

**Step 2: Add/edit category**

Modal or inline form: name, type (income/expense), parent category (dropdown), is_business_default.

**Step 3: Delete with protection**

Can't delete if transactions reference the category. Show count of affected transactions. Offer to reassign to another category first.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: category management UI"
```

---

### Task 13: Monthly Summary Dashboard

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Create: `src/components/dashboard/MonthlySummary.tsx`
- Create: `src/components/dashboard/CategoryBreakdown.tsx`
- Create: `src-tauri/src/commands/reports.rs`

**Step 1: Add report queries on Rust side**

- `monthly_summary(year, month)` → { total_income, total_expenses, net, business_income, business_expenses }
- `category_breakdown(year, month)` → Vec<{ category_name, total, is_business, percentage }>

**Step 2: Monthly summary card**

Show: income, expenses, net. Business vs personal split. Month selector (prev/next arrows).

**Step 3: Category breakdown**

Bar chart or sorted list of categories by amount for the selected month. Separate sections for income and expense.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: monthly summary dashboard"
```

---

### Task 14: Account Management

**Files:**
- Create: `src/pages/AccountsPage.tsx`
- Create: `src/components/accounts/AccountList.tsx`
- Create: `src/components/accounts/AccountForm.tsx`
- Modify: `src/components/Layout.tsx` (add nav link)

**Step 1: Account list**

Show all accounts with: name, institution, type, currency, transaction count.

**Step 2: Add/edit account**

Form: name, institution, type (dropdown), currency (CAD/USD).

**Step 3: Delete with protection**

Can't delete if transactions exist. Show count.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: account management UI"
```

---

## Execution Order

Tasks 1-6 are backend, independent of frontend. Tasks 8-14 are frontend.
Task 7 (Tauri commands) bridges them — it depends on 1-6 being complete.

**Critical path:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 10 → 11

**Parallelizable:**
- Tasks 4 and 5 (OFX and CSV parsers) are independent of each other
- Task 8 (frontend setup) can run in parallel with Tasks 1-6
- Tasks 12, 13, 14 can run in parallel after Task 11

**Weekend target:** Tasks 1-11 are the core. 12-14 are nice-to-have but should be achievable.
