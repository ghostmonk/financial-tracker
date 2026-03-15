# Financial Tracker

A desktop application for importing, categorizing, and analyzing personal and business financial transactions. Built for Canadian self-employed individuals who need to track expenses against T2125/TP-80 tax line items and compute GST/QST input tax credits.

## Why This Exists

Bank transaction exports (OFX, QFX, CSV) are messy. Categorizing hundreds of transactions by hand is tedious. Tax season requires mapping every business expense to specific CRA line items, tracking receipts, and computing proration for vehicle and home office use. This app consolidates all of that into a single encrypted local database with no cloud dependency.

## Features

- **Import**: Parse OFX/QFX (bank/credit card statements) and CSV files with configurable column mapping. Duplicate detection via FITID and content hashing.
- **Categorization**: Two-level category taxonomy (23 parent categories, ~150 subcategories) covering income, expense, transfer, and adjustment directions. Auto-categorization rules with pattern matching (contains, starts_with, exact) and optional amount conditions.
- **Batch categorization**: Group uncategorized transactions by normalized merchant name, assign categories in bulk, drill down into individual transactions with filters.
- **Transaction management**: Search, filter (date range, account, direction, amount, category, recurring, uncategorized), sort, inline category editing, bulk operations.
- **Tax workspace**: Map business expenses to T2125/TP-80 line items, compute GST/QST ITCs/ITRs, track receipts, set vehicle and home office proration percentages, add manual tax line items. In-app tax reference guide with CRA reminders.
- **Tags**: Flexible tagging system (work, vacation, reimbursable, tax-deductible, medical, family) with junction table.
- **Encryption**: SQLCipher-encrypted database. Password required to unlock on each launch.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri 2 |
| Frontend | React 19, TypeScript 5.8, Vite 7 |
| Styling | Tailwind CSS v4 |
| Backend | Rust (rusqlite + bundled-sqlcipher) |
| Database | SQLite with SQLCipher encryption |
| Parsing | Custom OFX/SGML parser, csv crate |
| Testing | cargo test (106 Rust tests), Playwright (71 e2e tests) |

## Quickstart

Prerequisites: [Rust](https://rustup.rs/), [Node.js](https://nodejs.org/) (v18+), a C compiler (for SQLCipher).

```bash
git clone <repo-url>
cd financial-tracker
npm install
make dev
```

The app opens a desktop window. Create a password on first launch. Import a bank statement file to get started.

## Installation

### macOS

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Clone and install
git clone <repo-url>
cd financial-tracker
npm install

# Development mode (debug Rust, fast compile)
make dev

# Production build
make build
```

The built app bundle appears in `src-tauri/target/release/bundle/`.

### Windows / Linux

Same steps. Tauri supports all three platforms. Icons are included for Windows (`.ico`), macOS (`.icns`), and Linux (`.png`).

**Needs confirmation**: No CI builds or release binaries are published yet. Building from source is the only installation method.

## Configuration

No external configuration files or environment variables are required. The app stores its encrypted database in the OS app data directory (e.g. `~/Library/Application Support/` on macOS, `%APPDATA%` on Windows).

Tax rules (GST/QST rates, T2125/TP-80 line mappings, proration types) are bundled in `src-tauri/src/tax-rules.json`. Currently hardcoded for the CA-QC jurisdiction. Edit this file and rebuild to change tax configuration.

## Usage

### Importing transactions

1. Navigate to **Import**
2. Select or create an account (checking, savings, credit card, investment)
3. Choose a `.ofx`, `.qfx`, or `.csv` file
4. For CSV: map columns (date, amount, description) and select date format
5. Review the preview showing new vs duplicate transactions
6. Import. Auto-categorization rules run automatically on new transactions.

### Categorizing transactions

**Quick categorization** (Categorize page): Groups uncategorized transactions by normalized merchant name. Click "Categorize All" to assign a category and create a rule in one step. The rule auto-applies to future imports.

**Drill-down**: Click a group name to see individual transactions. Filter by description or amount range. Select a subset and assign a category with optional rule creation including amount conditions.

**Inline editing** (Transactions page): Click any transaction's category pill to change it via a searchable dropdown.

### Tax workspace

1. Navigate to **Tax**
2. Select fiscal year
3. View business transactions grouped by month, mapped to T2125 line items
4. Set proration percentages (vehicle km, home office sqft)
5. Add manual tax line items for expenses not captured by bank imports
6. Track receipt status per item
7. Review annual summary with gross, deductible, GST ITC, and QST ITR totals

## Development

```bash
make dev              # Debug Rust, hot-reload frontend
make dev-release      # Release Rust, hot-reload frontend
make format           # cargo fmt + eslint --fix
make format-check     # Check without modifying
```

The Vite dev server runs on port 1420. Tauri launches the desktop window pointing to it.

### Project structure

```
src/                          # React frontend
  pages/                      # Route pages (9 total)
  components/                 # Feature-organized components
    accounts/                 # Account CRUD
    categories/               # Category CRUD + tags
    categorize/               # Batch categorization UI
    dashboard/                # Monthly summary + breakdown
    import/                   # Multi-step import wizard
    shared/                   # Modal, FormField, Table
    tax/                      # Tax workspace components
    transactions/             # Transaction table + filters
  contexts/                   # DatabaseContext (unlock state)
  lib/                        # tauri.ts (IPC wrappers), types.ts, hooks.ts, utils.ts, styles.ts
src-tauri/                    # Rust backend
  src/
    commands/                 # Tauri IPC command handlers
    import/                   # OFX/CSV parsers + import pipeline
    models/                   # Database models (account, category, transaction, rule, tag, tax)
    categorize.rs             # Rule matching engine + merchant normalization
    db.rs                     # SQLCipher database wrapper
    db_utils.rs               # UpdateBuilder, in_clause, db_command macro
    tax.rs                    # Tax rules config loader (OnceLock)
    schema.sql                # Full database schema
    tax-rules.json            # T2125/TP-80 line mappings + GST/QST rates
    test_utils.rs             # Shared test fixtures
e2e/                          # Playwright e2e tests
  mocks/                      # Tauri IPC mock layer
    tauri-ipc.ts              # Mock injector (addInitScript)
    handlers.ts               # Default response map for all commands
    factories.ts              # Type-safe test data factories
  specs/                      # Test spec files (10 files, 71 tests)
  fixtures.ts                 # Custom Playwright test with mockPage fixture
docs/plans/                   # Implementation plans
```

### Architecture notes

**IPC**: All frontend-backend communication goes through Tauri's `invoke()`. The `src/lib/tauri.ts` file wraps every command with typed async functions. The `src/lib/types.ts` file mirrors the Rust serde structs.

**Database**: Single encrypted SQLite file. Schema managed via `schema.sql` (loaded at startup) plus ALTER TABLE migrations in `db.rs` for backward compatibility. No migration framework -- migrations use `.ok()` to silently skip if the column already exists.

**Category system**: Two-level hierarchy. Categories have a `direction` (income, expense, transfer, adjustment) and a `slug` (unique, stable identifier used for tax line mapping). ~150 categories seeded on first launch.

**Rule engine**: Rules match on description or payee field using contains/starts_with/exact patterns. Optional amount_min/amount_max conditions. Rules ordered by priority (highest wins). `categorized_by_rule` flag distinguishes rule-applied from manual categorizations. `reapply_all_rules` clears rule-applied categories and re-runs all rules.

**Tax rules**: Bundled JSON config maps category slugs to T2125/TP-80 line numbers. Proration types (vehicle, home office) compute business-use percentages from fiscal year settings. GST/QST ITC/ITR computed by reverse-calculating tax from tax-inclusive amounts.

## Testing

```bash
# Rust unit tests (106 tests)
make test-rust

# TypeScript type checking
make test-ts

# Playwright e2e tests (71 tests, ~6 seconds)
make test-e2e

# Playwright interactive UI
make test-e2e-ui

# All tests
make test-all
```

### E2E test architecture

Tests run against the Vite dev server (no Tauri shell). A mock layer injects `window.__TAURI_INTERNALS__` via Playwright's `addInitScript()`, intercepting all `invoke()` calls and returning pre-evaluated static JSON data. Test data factories in `e2e/mocks/factories.ts` import types directly from `src/lib/types.ts` -- if a Rust struct changes and the TS type updates, the factories fail to compile.

Override specific commands per test:

```typescript
await mockPage("/unlock", {
  is_database_initialized: { data: false },      // success response
  unlock_database: { error: "Invalid password" }, // error response
});
```

## Deployment

No deployment pipeline. This is a desktop application built and run locally. `make build` produces platform-specific installers via Tauri's bundler.

**Needs confirmation**: No auto-update mechanism is configured. The `tauri.conf.json` has `bundle.targets: "all"` which builds DMG/app (macOS), MSI/NSIS (Windows), and deb/AppImage (Linux).

## Troubleshooting

**SQLCipher build fails**: Ensure you have a C compiler installed. On macOS: `xcode-select --install`. On Ubuntu: `sudo apt install build-essential`.

**Port 1420 in use**: The Vite dev server requires port 1420 (configured in `vite.config.ts` with `strictPort: true`). Kill any process using that port before running `make dev`.

**Database corruption / forgot password**: The SQLCipher-encrypted database cannot be recovered without the password. Delete the database file from the app data directory to start fresh.

**E2E tests fail with "Unhandled command"**: A new Tauri command was added but not registered in `e2e/mocks/handlers.ts`. Add a default response entry for the new command.

## Contributing

No formal contribution guidelines. The codebase uses:

- `cargo fmt` + `cargo clippy` for Rust
- `eslint --fix` for TypeScript/React
- `make format` runs both

Run `make test-all` before submitting changes.
