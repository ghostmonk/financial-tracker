# Category Taxonomy Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace flat category list with two-level taxonomy (direction/category/subcategory), add slug-based identity, tags junction table, merchant field, is_recurring flag. Transfers become a distinct direction — not expenses.

**Architecture:** Schema migration replaces `category_type` with `direction` (income/expense/transfer/adjustment), adds `slug` (stable internal key). Transactions gain `merchant`, `is_recurring`, lose `is_business` (handled by Business Expenses category group). Tags stored via junction table. Full reseed with ~150 subcategories. All 23 files touching categories updated.

**Tech Stack:** Rust (rusqlite, serde), React + TypeScript + Tailwind, Tauri IPC, SQLite/SQLCipher

---

## Context: Current State

**Working directory:** `/Users/ghostmonk/Documents/code/financial-tracker/.worktrees/category-redesign`
**Branch:** `ghostmonk/category-redesign` (based on `ghostmonk/auto-categorization-rules`)

**Existing schema (to be replaced):**
- `categories`: id, name, parent_id, category_type (income|expense), is_business_default, sort_order
- `transactions`: has category_id, is_business, tax_deductible — no merchant, no tags, no is_recurring
- 28 flat seed categories with UUID ids

**Target schema:**
- `categories`: id, slug (UNIQUE), name, parent_id, direction (income|expense|transfer|adjustment), sort_order
- `transactions`: category_id, merchant, is_recurring, tax_deductible — drop is_business
- New tables: `tags` (id, name, slug), `transaction_tags` (transaction_id, tag_id)
- ~150 seeded categories in parent/child hierarchy

---

## Task 1: Schema — Redesign categories and transactions tables

**Files:**
- Modify: `src-tauri/src/schema.sql`
- Modify: `src-tauri/src/db.rs` (migration for existing databases)

### New categories table:

```sql
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK(direction IN ('income', 'expense', 'transfer', 'adjustment')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Changes from current:
- Added: `slug TEXT NOT NULL UNIQUE`
- Renamed: `category_type` → `direction`
- Added: `transfer` and `adjustment` to direction CHECK
- Removed: `is_business_default`

### New transactions columns:

```sql
-- Add to transactions table:
merchant TEXT,
is_recurring INTEGER NOT NULL DEFAULT 0,
-- Remove: is_business (column stays for migration safety, unused)
```

### New tags tables:

```sql
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transaction_tags (
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);
```

### Migration in db.rs:

Since this is a pre-release desktop app (no production users with data to preserve), the cleanest approach is to:
1. Drop and recreate the categories table with new schema
2. Add new columns to transactions via ALTER TABLE (`.ok()` pattern)
3. Create tags tables
4. Reseed categories

For existing dev databases, add migration block in `initialize_schema()`:

```rust
// Migration: category redesign
// Check if slug column exists on categories
let has_slug: bool = conn
    .prepare("SELECT slug FROM categories LIMIT 1")
    .is_ok();

if !has_slug {
    // Drop old categories (cascades to category_id on transactions via ON DELETE SET NULL)
    conn.execute_batch("DELETE FROM categorization_rules; DELETE FROM categories;")?;
    conn.execute_batch("DROP TABLE IF EXISTS categories;")?;
    // Schema will recreate with new definition on next execute_batch(schema)
    conn.execute_batch(schema)?;
}

// Add merchant and is_recurring to transactions
conn.execute_batch(
    "ALTER TABLE transactions ADD COLUMN merchant TEXT;"
).ok();
conn.execute_batch(
    "ALTER TABLE transactions ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0;"
).ok();
```

**Step 1:** Rewrite `schema.sql` with new categories table, new transaction columns, tags tables.
**Step 2:** Add migration logic in `db.rs`.
**Step 3:** `cargo build` — verify compiles.
**Step 4:** Commit.

---

## Task 2: Rust — Rewrite Category model with slug and direction

**Files:**
- Modify: `src-tauri/src/models/category.rs`

### New structs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub direction: String,
    pub sort_order: i32,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryParams {
    pub slug: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub direction: String,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryParams {
    pub slug: Option<String>,
    pub name: Option<String>,
    pub parent_id: Option<Option<String>>,
    pub direction: Option<String>,
    pub sort_order: Option<i32>,
}
```

Removed: `category_type`, `is_business_default`
Added: `slug`, `direction`, `created_at`

### Rewrite `seed_default_categories`:

The new seed function inserts the full two-level taxonomy. Parent categories are inserted first (with NULL parent_id), then children reference parent by slug lookup.

Use a helper struct for seed data:

```rust
struct SeedCategory {
    slug: &'static str,
    name: &'static str,
    direction: &'static str,
    children: &'static [(&'static str, &'static str)], // (slug, name)
}
```

Define the full taxonomy as a static array (see user's spec for complete list). The lean v1 set:

- Income (salary, bonus, freelance, interest_income, dividend_income, refund_reimbursement, other_income)
- Housing (rent, mortgage, property_tax, home_insurance, maintenance_repairs, furniture, household_supplies, other_housing)
- Utilities (electricity, gas_heating, water_sewer, internet, mobile_phone, streaming, other_utilities)
- Food & Dining (groceries, restaurants, fast_food, coffee, takeout_delivery, alcohol, other_food)
- Transportation (fuel, public_transit, taxi_rideshare, parking, vehicle_payment, vehicle_insurance, vehicle_maintenance, other_transportation)
- Health & Medical (health_insurance, doctor, dentist, pharmacy, fitness_gym, other_health)
- Personal Care (haircuts, skincare, spa, other_personal_care)
- Shopping (clothing, shoes, electronics, software_apps, books, home_decor, general_merchandise, other_shopping)
- Entertainment (movies, music, games, events_tickets, subscriptions, hobbies, sports_recreation, other_entertainment)
- Travel (flights, hotels, vacation_rentals, car_rental, dining_travel, transit_travel, other_travel)
- Family & Childcare (childcare, school_tuition, kids_activities, child_support, other_family)
- Education (tuition, courses, certifications, books_materials, student_loan_payment, other_education)
- Pets (pet_food, vet, pet_grooming, pet_insurance, other_pets)
- Financial (bank_fees, atm_fees, credit_card_interest, loan_interest, loan_principal, investment_fees, currency_exchange, other_financial)
- Savings & Investments (savings_contribution, retirement_contribution, brokerage_contribution, tfsa_savings, other_investing)
- Taxes (income_tax, sales_tax, property_tax_payment, tax_preparation, other_taxes)
- Insurance (life_insurance, disability_insurance, umbrella_insurance, other_insurance)
- Gifts & Donations (gifts_given, charity, religious_giving, other_giving)
- Business Expenses (office_supplies, software_saas, hosting_cloud, advertising, contractors, professional_services, travel_business, meals_business, shipping, equipment, rent_coworking, telecom, other_business)
- Government & Fees (license_permit, registration_fees, legal_fees, fines, other_government)
- Transfer (account_transfer, credit_card_payment, cash_withdrawal, cash_deposit, brokerage_transfer, savings_transfer, loan_payment_transfer)
- Adjustment (refund_reversal, chargeback, correction, balance_adjustment, opening_balance, write_off, other_adjustment)
- Uncategorized (needs_review, unknown_merchant, other)

**Step 1:** Rewrite Category struct, CreateCategoryParams, UpdateCategoryParams.
**Step 2:** Update SELECT_COLS, row_to_category.
**Step 3:** Rewrite seed_default_categories with full taxonomy.
**Step 4:** Update create_category, update_category, list_categories, delete_category.
**Step 5:** Add `get_category_by_slug(conn, slug) -> Result<Option<Category>, DbError>` — used for rule creation UI.
**Step 6:** Run `cargo test` (existing category tests in categorize.rs and categorization_rule.rs need updated seed data).
**Step 7:** Commit.

---

## Task 3: Rust — Update Transaction model (merchant, is_recurring, drop is_business)

**Files:**
- Modify: `src-tauri/src/models/transaction.rs`

### Changes to Transaction struct:

```rust
// Add:
pub merchant: Option<String>,
pub is_recurring: bool,

// Remove (or keep but ignore):
// pub is_business: bool,  — drop from struct, leave column in DB for safety
```

### Changes to TransactionFilters:

```rust
// Remove:
// pub is_business: Option<bool>,

// Add:
pub direction: Option<String>,  // filter by category direction (income/expense/transfer/adjustment)
pub is_recurring: Option<bool>,
```

The `direction` filter joins through `categories` table:
```sql
-- When direction filter is set:
INNER JOIN categories c ON transactions.category_id = c.id AND c.direction = ?
```

### Changes to CreateTransactionParams:

```rust
// Add:
pub merchant: Option<String>,
pub is_recurring: Option<bool>,

// Remove:
// pub is_business: Option<bool>,
```

### Changes to UpdateTransactionParams:

```rust
// Add:
pub merchant: Option<Option<String>>,
pub is_recurring: Option<bool>,

// Remove:
// pub is_business: Option<bool>,
```

### Update all SQL queries:

- SELECT_COLS: add `merchant, is_recurring`, remove `is_business` from read position (but column still exists in DB)
- row_to_transaction: update indices
- create_transaction: add merchant, is_recurring to INSERT
- create_transactions_batch: same
- list_transactions: replace `is_business` filter with `direction` filter (JOIN to categories)
- update_transaction: add merchant, is_recurring handling

**Step 1:** Update Transaction struct and params.
**Step 2:** Update SELECT_COLS and row_to_transaction.
**Step 3:** Update CRUD functions.
**Step 4:** Update list_transactions with direction filter.
**Step 5:** Fix all tests.
**Step 6:** Commit.

---

## Task 4: Rust — Add Tags model with junction table

**Files:**
- Create: `src-tauri/src/models/tag.rs`
- Modify: `src-tauri/src/models/mod.rs`

### Tag struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub created_at: String,
}
```

### Functions:

- `create_tag(conn, name, slug) -> Result<Tag, DbError>`
- `list_tags(conn) -> Result<Vec<Tag>, DbError>`
- `delete_tag(conn, id) -> Result<(), DbError>`
- `get_or_create_tag(conn, name) -> Result<Tag, DbError>` — auto-generates slug from name
- `add_tags_to_transaction(conn, transaction_id, tag_ids: &[String]) -> Result<(), DbError>`
- `remove_tags_from_transaction(conn, transaction_id, tag_ids: &[String]) -> Result<(), DbError>`
- `set_transaction_tags(conn, transaction_id, tag_ids: &[String]) -> Result<(), DbError>` — replace all
- `get_transaction_tags(conn, transaction_id) -> Result<Vec<Tag>, DbError>`
- `list_transactions_by_tag(conn, tag_id) -> Result<Vec<String>, DbError>` — returns transaction IDs

Seed default tags matching the spec:
- work, vacation, reimbursable, tax-deductible, medical, family

**Step 1:** Create tag.rs with structs and CRUD.
**Step 2:** Add tests.
**Step 3:** Register in models/mod.rs.
**Step 4:** Commit.

---

## Task 5: Rust — Add Tauri commands for tags

**Files:**
- Create: `src-tauri/src/commands/tags.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

### Commands:

- `list_tags` — returns all tags
- `create_tag(name: String)` — auto-slug from name
- `delete_tag(id: String)`
- `set_transaction_tags(transaction_id: String, tag_ids: Vec<String>)`
- `get_transaction_tags(transaction_id: String) -> Vec<Tag>`

**Step 1:** Create commands/tags.rs.
**Step 2:** Register in mod.rs and lib.rs.
**Step 3:** Cargo build + test.
**Step 4:** Commit.

---

## Task 6: Rust — Update categorize.rs and categorization_rule tests

**Files:**
- Modify: `src-tauri/src/categorize.rs` (test helpers only — update seed data in setup_db)
- Modify: `src-tauri/src/models/categorization_rule.rs` (test helpers — update seed data)

The categorize engine itself doesn't change — it matches on description/payee, not category fields. But the test `setup_db()` helpers insert categories with old schema (category_type, is_business_default). These need to use the new schema (slug, direction).

**Step 1:** Update all test `setup_db()` functions to insert categories with slug + direction.
**Step 2:** Run full `cargo test --lib`.
**Step 3:** Commit.

---

## Task 7: Rust — Update import pipeline for merchant field

**Files:**
- Modify: `src-tauri/src/import/pipeline.rs`
- Modify: `src-tauri/src/import/types.rs` (if ParsedTransaction needs merchant)

When importing transactions, populate `merchant` from the normalized merchant name. The OFX NAME field is the merchant. For CSV imports, the description column serves as merchant.

In `execute_import`, when building `CreateTransactionParams`, set `merchant` from the transaction's description (or NAME field for OFX):

```rust
merchant: Some(tx.description.clone()),
```

This gives every imported transaction a merchant value that rules can also match against.

**Step 1:** Add `merchant` to CreateTransactionParams in pipeline mapping.
**Step 2:** Update tests.
**Step 3:** Commit.

---

## Task 8: Frontend — Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

### Category interface:

```typescript
export interface Category {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  direction: "income" | "expense" | "transfer" | "adjustment";
  sort_order: number;
  created_at: string;
}

export interface CreateCategoryParams {
  slug: string;
  name: string;
  parent_id?: string | null;
  direction: string;
  sort_order?: number;
}

export interface UpdateCategoryParams {
  slug?: string;
  name?: string;
  parent_id?: string | null;
  direction?: string;
  sort_order?: number;
}
```

### Transaction interface:

```typescript
// Add:
merchant: string | null;
is_recurring: boolean;

// Remove:
// is_business: boolean;
```

### TransactionFilters:

```typescript
// Remove:
// is_business?: boolean;

// Add:
direction?: string;
is_recurring?: boolean;
```

### New Tag types:

```typescript
export interface Tag {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}
```

**Step 1:** Update all interfaces.
**Step 2:** `npx tsc --noEmit` — will show every frontend file that breaks (expected — fix in subsequent tasks).
**Step 3:** Commit.

---

## Task 9: Frontend — Update tauri.ts API layer

**Files:**
- Modify: `src/lib/tauri.ts`

Add new imports/exports for Tag type. Add tag API functions:

```typescript
// Tags
export async function listTags(): Promise<Tag[]> {
  return invoke("list_tags");
}

export async function createTag(name: string): Promise<Tag> {
  return invoke("create_tag", { name });
}

export async function deleteTag(id: string): Promise<void> {
  return invoke("delete_tag", { id });
}

export async function setTransactionTags(transactionId: string, tagIds: string[]): Promise<void> {
  return invoke("set_transaction_tags", { transaction_id: transactionId, tag_ids: tagIds });
}

export async function getTransactionTags(transactionId: string): Promise<Tag[]> {
  return invoke("get_transaction_tags", { transaction_id: transactionId });
}
```

**Step 1:** Add tag type imports/exports and API functions.
**Step 2:** Commit.

---

## Task 10: Frontend — Rewrite CategoryForm and CategoryList

**Files:**
- Modify: `src/components/categories/CategoryForm.tsx`
- Modify: `src/components/categories/CategoryList.tsx`

### CategoryForm changes:

- Replace `categoryType` state with `direction` state (income|expense|transfer|adjustment)
- Remove `isBusinessDefault` state and checkbox
- Add `slug` field (auto-generated from name, editable)
- Direction dropdown: Income, Expense, Transfer, Adjustment
- Parent dropdown: filter by same direction

### CategoryList changes:

- Group by `direction` instead of `category_type`
- Display direction as section headers: Income, Expense, Transfer, Adjustment
- Remove business default badge
- Show slug in smaller text under name
- Keep parent-child tree rendering

**Step 1:** Rewrite CategoryForm.
**Step 2:** Rewrite CategoryList.
**Step 3:** Verify compiles.
**Step 4:** Commit.

---

## Task 11: Frontend — Rewrite CategorySelect and TransactionFilters

**Files:**
- Modify: `src/components/transactions/CategorySelect.tsx`
- Modify: `src/components/transactions/TransactionFilters.tsx`

### CategorySelect changes:

- Group options by direction (Income, Expense, Transfer, Adjustment) using optgroups
- Within each direction, show parent categories as optgroup labels, children as options
- Remove diamond indicator for business_default

### TransactionFilters changes:

- Replace `is_business` checkbox with `direction` dropdown (All, Income, Expense, Transfer, Adjustment)
- Add `is_recurring` checkbox filter
- Keep existing account, category, date range, search, uncategorized filters

**Step 1:** Rewrite CategorySelect with direction-based grouping.
**Step 2:** Update TransactionFilters.
**Step 3:** Commit.

---

## Task 12: Frontend — Update TransactionTable

**Files:**
- Modify: `src/components/transactions/TransactionTable.tsx`

### Changes:

- Remove `is_business` toggle/display
- Add `merchant` column (if available, shown as secondary text under description)
- Show `is_recurring` indicator (small badge or icon)
- Category display: show "Parent > Child" format for subcategories
- Keep bulk category assignment

**Step 1:** Update table columns.
**Step 2:** Verify compiles.
**Step 3:** Commit.

---

## Task 13: Frontend — Update Dashboard components

**Files:**
- Modify: `src/components/dashboard/MonthlySummary.tsx`
- Modify: `src/components/dashboard/CategoryBreakdown.tsx`

### MonthlySummary changes:

- Replace `is_business` split with direction-based grouping
- Show: Total Income, Total Expenses, Transfers (separate), Net (income - expenses)
- Transfers shown but excluded from spending total

### CategoryBreakdown changes:

- Group by direction first, then by parent category
- Default view: expense categories only
- Direction tabs or dropdown to switch views

**Step 1:** Rewrite MonthlySummary with direction-based totals.
**Step 2:** Rewrite CategoryBreakdown with direction grouping.
**Step 3:** Commit.

---

## Task 14: Frontend — Update Categorize and Rules pages

**Files:**
- Modify: `src/components/categorize/GroupCategorizeDialog.tsx`
- Modify: `src/pages/RulesPage.tsx`

### GroupCategorizeDialog changes:

- Category dropdown grouped by direction → parent category → subcategory
- Remove business default indicator

### RulesPage changes:

- Category dropdown in rule form: same direction-based grouping
- Category display in rules table: show "Parent > Child" format

**Step 1:** Update GroupCategorizeDialog.
**Step 2:** Update RulesPage.
**Step 3:** Commit.

---

## Task 15: Frontend — Add Tags management to CategoriesPage

**Files:**
- Modify: `src/pages/CategoriesPage.tsx`

Add a tags section below the category list:
- List all tags with delete button
- "Add Tag" input + button
- Simple flat list (no hierarchy)

Tags are managed here since they're part of the taxonomy system. Transaction tag assignment happens in the TransactionTable (future enhancement — not this task).

**Step 1:** Add tags section to CategoriesPage.
**Step 2:** Commit.

---

## Task 16: Integration Testing & Polish

**Step 1:** `cd src-tauri && cargo test --lib` — all Rust tests pass.
**Step 2:** `npx tsc --noEmit` — zero TypeScript errors.
**Step 3:** `make format` or equivalent (cargo fmt + eslint --fix).
**Step 4:** `make dev-release` — app launches, unlock database.
**Step 5:** Verify categories page shows new taxonomy with all groups.
**Step 6:** Import CIBC QFX file — verify merchant populated, rules still work.
**Step 7:** Categorize page — verify groups, create rule, verify re-apply.
**Step 8:** Dashboard — verify income/expense/transfer separation.
**Step 9:** Tags page — create tag, verify in list.
**Step 10:** Final commit if any fixes needed.

---

## Summary of All Files Changed/Created

**New files:**
- `src-tauri/src/models/tag.rs` — Tag model with CRUD and junction table ops
- `src-tauri/src/commands/tags.rs` — Tauri commands for tags

**Modified files (Rust — 9):**
- `src-tauri/src/schema.sql` — categories redesign, tags tables, transaction columns
- `src-tauri/src/db.rs` — migration logic
- `src-tauri/src/models/mod.rs` — add tag module
- `src-tauri/src/models/category.rs` — complete rewrite (struct, seed, CRUD)
- `src-tauri/src/models/transaction.rs` — add merchant/is_recurring, drop is_business, direction filter
- `src-tauri/src/models/categorization_rule.rs` — test fixture updates
- `src-tauri/src/categorize.rs` — test fixture updates
- `src-tauri/src/commands/mod.rs` — add tags module
- `src-tauri/src/lib.rs` — register tag commands
- `src-tauri/src/import/pipeline.rs` — populate merchant on import

**Modified files (Frontend — 12):**
- `src/lib/types.ts` — Category, Transaction, TransactionFilters, Tag interfaces
- `src/lib/tauri.ts` — Tag API functions
- `src/components/categories/CategoryForm.tsx` — direction, slug, remove is_business_default
- `src/components/categories/CategoryList.tsx` — direction-based grouping
- `src/components/transactions/CategorySelect.tsx` — direction-based optgroups
- `src/components/transactions/TransactionFilters.tsx` — direction filter, remove is_business
- `src/components/transactions/TransactionTable.tsx` — merchant, is_recurring, remove is_business
- `src/components/dashboard/MonthlySummary.tsx` — direction-based totals
- `src/components/dashboard/CategoryBreakdown.tsx` — direction-based grouping
- `src/components/categorize/GroupCategorizeDialog.tsx` — direction-based category select
- `src/pages/RulesPage.tsx` — direction-based category select
- `src/pages/CategoriesPage.tsx` — add tags section
