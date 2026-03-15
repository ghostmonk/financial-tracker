# Codebase Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate ~1,500 lines of duplicated code across the full Tauri app by introducing shared utilities, macros, hooks, and components.

**Architecture:** Bottom-up refactoring in 5 layers: (1) shared utilities in both stacks, (2) Rust model layer with macros and builders, (3) React hooks for data fetching and form state, (4) shared React components (Modal, FormField, table elements), (5) command layer cleanup and dead code removal. Existing 106 Rust tests serve as regression guard throughout.

**Tech Stack:** Rust (rusqlite, serde, tauri), React 19 (TypeScript), Tailwind CSS

---

## Task 1: Rust Shared Test Utilities

**Files:**
- Create: `src-tauri/src/test_utils.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/models/tag.rs`
- Modify: `src-tauri/src/models/categorization_rule.rs`
- Modify: `src-tauri/src/models/tax_line_item.rs`
- Modify: `src-tauri/src/models/fiscal_year_settings.rs`
- Modify: `src-tauri/src/categorize.rs`
- Modify: `src-tauri/src/import/pipeline.rs`

**Step 1: Create test_utils module**

```rust
// src-tauri/src/test_utils.rs
#[cfg(test)]
pub mod test {
    use rusqlite::{params, Connection};

    pub fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let schema = include_str!("schema.sql");
        conn.execute_batch(schema).unwrap();
        conn
    }

    pub fn insert_test_account(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT OR IGNORE INTO accounts (id, name, institution, account_type) VALUES (?1, ?2, ?3, ?4)",
            params![id, "Test Account", "Test Bank", "checking"],
        ).ok();
    }

    pub fn insert_test_category(conn: &Connection, id: &str, slug: &str, direction: &str) {
        conn.execute(
            "INSERT OR IGNORE INTO categories (id, slug, name, direction, sort_order) VALUES (?1, ?2, ?3, ?4, 0)",
            params![id, slug, slug, direction],
        ).ok();
    }

    pub fn insert_test_transaction(conn: &Connection, id: &str, account_id: &str, category_id: &str) {
        insert_test_account(conn, account_id);
        insert_test_category(conn, category_id, "test", "expense");
        conn.execute(
            "INSERT INTO transactions (id, account_id, date, description, amount, category_id, transaction_type) \
             VALUES (?1, ?2, '2024-01-01', 'Test', 10.0, ?3, 'debit')",
            params![id, account_id, category_id],
        ).unwrap();
    }
}
```

**Step 2: Register module in lib.rs**

Add `mod test_utils;` to `src-tauri/src/lib.rs`.

**Step 3: Replace all duplicate setup_db and helpers**

In each test module that has its own `setup_db()`, replace with:
```rust
use crate::test_utils::test::setup_db;
```

Remove the local `setup_db()` function. Same for `insert_transaction` helpers — replace with `insert_test_transaction`.

Files to update: `tag.rs`, `categorization_rule.rs`, `tax_line_item.rs`, `fiscal_year_settings.rs`, `categorize.rs`, `import/pipeline.rs`.

**Step 4: Run tests**

Run: `cd src-tauri && cargo test --lib`
Expected: All 106 tests pass.

**Step 5: Commit**

```
refactor: extract shared test utilities from duplicated setup_db helpers
```

---

## Task 2: Rust UpdateBuilder

**Files:**
- Create: `src-tauri/src/db_utils.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create db_utils with UpdateBuilder**

```rust
// src-tauri/src/db_utils.rs
use rusqlite::Connection;
use crate::db::DbError;

pub struct UpdateBuilder {
    sets: Vec<String>,
    values: Vec<Box<dyn rusqlite::types::ToSql>>,
}

impl UpdateBuilder {
    pub fn new() -> Self {
        Self {
            sets: Vec::new(),
            values: Vec::new(),
        }
    }

    /// Add a SET clause if the value is Some
    pub fn set_if<T: rusqlite::types::ToSql + 'static>(
        &mut self,
        col: &str,
        val: Option<T>,
    ) -> &mut Self {
        if let Some(v) = val {
            self.sets.push(format!("{} = ?", col));
            self.values.push(Box::new(v));
        }
        self
    }

    /// Add a SET clause for Option<Option<T>> fields (nullable columns).
    /// Some(Some(v)) -> set to v, Some(None) -> set to NULL, None -> skip
    pub fn set_nullable<T: rusqlite::types::ToSql + 'static>(
        &mut self,
        col: &str,
        val: Option<Option<T>>,
    ) -> &mut Self {
        if let Some(inner) = val {
            self.sets.push(format!("{} = ?", col));
            self.values.push(Box::new(inner));
        }
        self
    }

    /// Returns true if any fields were set
    pub fn has_changes(&self) -> bool {
        !self.sets.is_empty()
    }

    /// Execute the UPDATE statement. Adds `updated_at = datetime('now')` automatically
    /// if the table has that column (caller controls by passing `auto_timestamp`).
    pub fn execute(
        mut self,
        conn: &Connection,
        table: &str,
        id: &str,
        auto_timestamp: bool,
    ) -> Result<(), DbError> {
        if self.sets.is_empty() {
            return Ok(());
        }
        if auto_timestamp {
            self.sets.push("updated_at = datetime('now')".to_string());
        }
        self.values.push(Box::new(id.to_string()));
        let sql = format!(
            "UPDATE {} SET {} WHERE id = ?",
            table,
            self.sets.join(", ")
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            self.values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())?;
        Ok(())
    }
}

/// Build a parameterized IN clause. Returns (placeholder_string, boxed_values).
/// Usage: `let (placeholders, values) = in_clause(&items);`
/// Then: `format!("WHERE col IN ({})", placeholders)`
pub fn in_clause<T: rusqlite::types::ToSql + Clone + 'static>(
    items: &[T],
) -> (String, Vec<Box<dyn rusqlite::types::ToSql>>) {
    let placeholders: Vec<String> = (0..items.len()).map(|i| format!("?{}", i + 1)).collect();
    let values: Vec<Box<dyn rusqlite::types::ToSql>> =
        items.iter().map(|v| Box::new(v.clone()) as Box<dyn rusqlite::types::ToSql>).collect();
    (placeholders.join(", "), values)
}
```

**Step 2: Register in lib.rs**

Add `mod db_utils;` to `src-tauri/src/lib.rs` (with `pub` so models can use it).

**Step 3: Run tests**

Run: `cd src-tauri && cargo test --lib`
Expected: All tests pass (no consumers yet).

**Step 4: Commit**

```
refactor: add UpdateBuilder and in_clause helpers to db_utils
```

---

## Task 3: Refactor All Rust Model Update Functions to Use UpdateBuilder

**Files:**
- Modify: `src-tauri/src/models/account.rs`
- Modify: `src-tauri/src/models/transaction.rs`
- Modify: `src-tauri/src/models/category.rs`
- Modify: `src-tauri/src/models/categorization_rule.rs`
- Modify: `src-tauri/src/models/tax_line_item.rs`

**Step 1: Refactor each update function**

For each model file, replace the manual SET/values/param_refs builder with UpdateBuilder. Example for account.rs:

Before (~40 lines):
```rust
pub fn update_account(conn: &Connection, id: &str, params: UpdateAccountParams) -> Result<Account, DbError> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(ref name) = params.name { sets.push("name = ?"); values.push(Box::new(name.clone())); }
    // ... 8 more fields ...
    // ... manual execute ...
}
```

After (~10 lines):
```rust
pub fn update_account(conn: &Connection, id: &str, params: UpdateAccountParams) -> Result<Account, DbError> {
    let mut u = crate::db_utils::UpdateBuilder::new();
    u.set_if("name", params.name)
     .set_if("institution", params.institution)
     .set_if("account_type", params.account_type)
     .set_if("currency", params.currency)
     .set_nullable("credit_limit", params.credit_limit);
    u.execute(conn, "accounts", id, true)?;
    // re-fetch and return
    let mut stmt = conn.prepare(&format!("SELECT {} FROM accounts WHERE id = ?1", SELECT_COLS))?;
    Ok(stmt.query_row(rusqlite::params![id], row_to_account)?)
}
```

Apply the same pattern to ALL update functions:
- `account.rs::update_account`
- `transaction.rs::update_transaction`
- `category.rs::update_category`
- `categorization_rule.rs::update_categorization_rule`
- `tax_line_item.rs::update_tax_line_item`

Note: `UpdateAccountParams` uses `Option<Option<T>>` for nullable fields like `credit_limit` — use `set_nullable` for those. `Option<T>` fields use `set_if`.

Also refactor `update_transactions_category` in transaction.rs to use `in_clause()` from db_utils.

**Step 2: Run tests after EACH model file change**

Run: `cd src-tauri && cargo test --lib`
Expected: All 106 tests pass after each file.

**Step 3: Commit**

```
refactor: replace manual update builders with UpdateBuilder across all models
```

---

## Task 4: Refactor Duplicate IN-Clause Builders in transaction.rs

**Files:**
- Modify: `src-tauri/src/models/transaction.rs`

**Step 1: Refactor these functions to use `in_clause()` from db_utils:**

- `update_transactions_category` (line ~382)
- `get_transaction_ids_by_hashes` (line ~410)
- `check_duplicates_by_fitid` (line ~434)
- `check_duplicates_by_hash` (line ~460)

Each currently has ~15 lines of manual placeholder/values construction. Replace with:
```rust
use crate::db_utils::in_clause;

let (placeholders, mut values) = in_clause(hashes);
let sql = format!("SELECT ... WHERE import_hash IN ({})", placeholders);
```

**Step 2: Run tests**

Run: `cd src-tauri && cargo test --lib`
Expected: All tests pass.

**Step 3: Commit**

```
refactor: use in_clause helper for parameterized IN queries in transaction model
```

---

## Task 5: OnceLock for Tax Rules + Source Enum

**Files:**
- Modify: `src-tauri/src/tax.rs`
- Modify: `src-tauri/src/commands/tax.rs`

**Step 1: Add OnceLock to load_tax_rules**

```rust
use std::sync::OnceLock;

pub fn load_tax_rules() -> &'static TaxRules {
    static RULES: OnceLock<TaxRules> = OnceLock::new();
    RULES.get_or_init(|| {
        let json = include_str!("tax-rules.json");
        serde_json::from_str(json).expect("Failed to parse tax-rules.json")
    })
}
```

**Step 2: Add TaxItemSource enum to commands/tax.rs**

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TaxItemSource {
    Transaction,
    TaxLineItem,
}
```

Change `TaxWorkspaceItem.source` from `String` to `TaxItemSource`. Update the two places that create items to use enum variants.

**Step 3: Move workspace query SQL from commands/tax.rs to model layer**

Move the `get_tax_workspace_items` SQL logic into `models/tax_line_item.rs` as a function. The command just calls the model.

**Step 4: Update callers for new `load_tax_rules()` return type**

`get_tax_rules` command needs to clone: `Ok(tax::load_tax_rules().clone())`

**Step 5: Run tests**

Run: `cd src-tauri && cargo test --lib`
Expected: All tests pass.

**Step 6: Commit**

```
refactor: cache tax rules with OnceLock, add TaxItemSource enum, move SQL to model layer
```

---

## Task 6: Dead Code Removal + db_command! Macro

**Files:**
- Modify: `src-tauri/src/models/account.rs` — remove `get_account_by_institution_number`
- Modify: `src-tauri/src/models/category.rs` — remove `get_category_by_slug`
- Modify: `src-tauri/src/models/tag.rs` — remove `remove_tags_from_transaction`, `list_transactions_by_tag`
- Modify: `src-tauri/src/models/transaction.rs` — remove `create_transaction`
- Modify: `src-tauri/src/db_utils.rs` — add `db_command!` macro
- Modify: `src-tauri/src/commands/accounts.rs` — use macro
- Modify: `src-tauri/src/commands/categories.rs` — use macro
- Modify: `src-tauri/src/commands/transactions.rs` — use macro
- Modify: `src-tauri/src/commands/tags.rs` — use macro
- Modify: `src-tauri/src/commands/rules.rs` — use macro
- Modify: `src-tauri/src/commands/tax.rs` — use macro

**Step 1: Remove 5 dead functions**

Delete the functions listed above. These produce the only compiler warnings.

**Step 2: Add db_command! macro to db_utils.rs**

```rust
#[macro_export]
macro_rules! db_command {
    ($name:ident($state:ident) -> $ret:ty $body:block) => {
        #[tauri::command(rename_all = "snake_case")]
        pub fn $name($state: tauri::State<'_, $crate::AppState>) -> Result<$ret, String> {
            $crate::commands::with_db_conn(&$state, |conn| {
                (|| -> Result<$ret, $crate::db::DbError> $body)(conn)
                    .map_err(|e| e.to_string())
            })
        }
    };
    ($name:ident($state:ident, $($arg:ident : $argty:ty),+) -> $ret:ty $body:block) => {
        #[tauri::command(rename_all = "snake_case")]
        pub fn $name(
            $state: tauri::State<'_, $crate::AppState>,
            $($arg: $argty),+
        ) -> Result<$ret, String> {
            $crate::commands::with_db_conn(&$state, |conn| {
                (|| -> Result<$ret, $crate::db::DbError> $body)(conn)
                    .map_err(|e| e.to_string())
            })
        }
    };
}
```

**Step 3: Refactor simple CRUD commands to use the macro**

Example — `list_accounts`:
```rust
// Before (7 lines):
#[tauri::command(rename_all = "snake_case")]
pub fn list_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    with_db_conn(&state, |conn| {
        account::list_accounts(conn).map_err(|e| e.to_string())
    })
}

// After (3 lines):
db_command!(list_accounts(state) -> Vec<Account> {
    account::list_accounts(conn)
});
```

Apply to all straightforward CRUD commands across all command files. Skip complex commands that have inline logic (like `get_tax_workspace_items`).

**Step 4: Run tests and cargo check**

Run: `cd src-tauri && cargo test --lib && cargo check`
Expected: All tests pass, zero warnings.

**Step 5: Commit**

```
refactor: remove dead code, add db_command macro for command boilerplate
```

---

## Task 7: Frontend Shared Utilities

**Files:**
- Create: `src/lib/utils.ts`
- Create: `src/lib/styles.ts`

**Step 1: Create utils.ts**

```typescript
export function formatAmount(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

export function parseError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred";
}
```

**Step 2: Create styles.ts**

```typescript
export const inputClass =
  "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

export const selectClass = inputClass;

export const inputSmClass =
  "px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500";

export const thClass =
  "px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400";

export const tdClass =
  "px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-800";

export const modalOverlayClass =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/40";

export const modalCardClass =
  "bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full";

export const btnClass =
  "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors";

export const btnPrimaryClass =
  "px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors";

export const btnDangerClass =
  "px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors";
```

**Step 3: Commit**

```
refactor: add shared utility functions and CSS class constants
```

---

## Task 8: Frontend Shared Hooks

**Files:**
- Create: `src/lib/hooks.ts`

**Step 1: Create hooks.ts**

```typescript
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { listCategories } from "./tauri";
import type { Category } from "./types";

export function useFetchData<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  initialValue: T,
): { data: T; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(typeof err === "string" ? err : "An error occurred");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refresh: load };
}

export function useCategoryMap() {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    listCategories().then(setCategories).catch(console.error);
  }, []);

  const categoryMap = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const parentMap = useMemo(() => {
    const m = new Map<string, Category[]>();
    for (const c of categories) {
      if (c.parent_id) {
        const children = m.get(c.parent_id) || [];
        children.push(c);
        m.set(c.parent_id, children);
      }
    }
    return m;
  }, [categories]);

  return { categories, categoryMap, parentMap };
}

export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
) {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ref, handler]);
}
```

**Step 2: Commit**

```
refactor: add shared hooks — useFetchData, useCategoryMap, useClickOutside
```

---

## Task 9: Shared Modal Component

**Files:**
- Create: `src/components/shared/Modal.tsx`

**Step 1: Create Modal.tsx**

```tsx
import { useEffect, useRef } from "react";
import { modalOverlayClass, modalCardClass } from "../../lib/styles";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg";
}

const widthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export default function Modal({ open, onClose, title, children, width = "md" }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={modalOverlayClass} onClick={(e) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    }}>
      <div ref={cardRef} className={`${modalCardClass} ${widthMap[width]}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```
refactor: add shared Modal component
```

---

## Task 10: Shared Table Elements

**Files:**
- Create: `src/components/shared/Table.tsx`

**Step 1: Create Table.tsx**

```tsx
import { thClass, tdClass } from "../../lib/styles";

interface ThProps {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  title?: string;
  className?: string;
}

export function Th({ children, align = "left", title, className = "" }: ThProps) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`${thClass} ${alignClass} ${className}`} title={title}>
      {children}
    </th>
  );
}

interface TdProps {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  truncate?: boolean;
  className?: string;
  title?: string;
  onClick?: () => void;
}

export function Td({ children, align = "left", mono, truncate, className = "", title, onClick }: TdProps) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "";
  const monoClass = mono ? "font-mono" : "";
  const truncClass = truncate ? "truncate max-w-[12rem]" : "";
  return (
    <td
      className={`${tdClass} ${alignClass} ${monoClass} ${truncClass} ${className}`}
      title={title}
      onClick={onClick}
    >
      {children}
    </td>
  );
}
```

**Step 2: Commit**

```
refactor: add shared Th and Td table components
```

---

## Task 11: Shared FormField Component

**Files:**
- Create: `src/components/shared/FormField.tsx`

**Step 1: Create FormField.tsx**

```tsx
interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}

export default function FormField({ label, required, hint, children }: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```
refactor: add shared FormField component
```

---

## Task 12: Apply Shared Utilities to All Frontend Components

**Files (all existing components and pages):**
- Modify: `src/components/accounts/AccountForm.tsx`
- Modify: `src/components/accounts/AccountList.tsx`
- Modify: `src/components/categories/CategoryForm.tsx`
- Modify: `src/components/categories/CategoryList.tsx`
- Modify: `src/components/transactions/TransactionTable.tsx`
- Modify: `src/components/transactions/TransactionFilters.tsx`
- Modify: `src/components/transactions/CategorySelect.tsx`
- Modify: `src/components/categorize/GroupCategorizeDialog.tsx`
- Modify: `src/components/categorize/GroupDrillDown.tsx`
- Modify: `src/components/categorize/UncategorizedGroupList.tsx`
- Modify: `src/components/import/CsvMappingStep.tsx`
- Modify: `src/components/import/ImportPreviewStep.tsx`
- Modify: `src/components/tax/TaxLineItemForm.tsx`
- Modify: `src/components/tax/ProrationSettingsModal.tsx`
- Modify: `src/components/tax/ReceiptCell.tsx`
- Modify: `src/components/tax/TaxInfoPanel.tsx`
- Modify: `src/pages/TaxPage.tsx`
- Modify: `src/pages/TransactionsPage.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/AccountsPage.tsx`
- Modify: `src/pages/CategoriesPage.tsx`
- Modify: `src/pages/CategorizePage.tsx`
- Modify: `src/pages/RulesPage.tsx`
- Modify: `src/pages/ImportPage.tsx`

**Step 1: Replace all hardcoded CSS class strings with imports from styles.ts**

Search for all instances of inline class definitions matching `inputClass`, `thClass`, `tdClass`, `modalOverlayClass` patterns. Replace with imports from `../../lib/styles` (or `../lib/styles` depending on depth).

**Step 2: Replace all inline modal wrappers with `<Modal>` component**

Every component that has `fixed inset-0 z-50` wrapper markup — replace with `<Modal open={...} onClose={...} title="...">`.

**Step 3: Replace inline `formatAmount` with import from utils.ts**

Search for `Math.abs(*.amount).toFixed(2)` patterns, replace with `formatAmount()`.

**Step 4: Replace inline error parsing with `parseError` from utils.ts**

Search for `typeof err === "string" ? err :` patterns, replace with `parseError(err)`.

**Step 5: Replace `listCategories().then(setCategories)` with `useCategoryMap` hook**

In pages that fetch categories independently (TransactionsPage, DashboardPage, TaxPage, CategorizePage, RulesPage), replace with the shared hook.

**Step 6: Replace click-outside patterns with `useClickOutside` hook**

In CategorySelect.tsx and ReceiptCell.tsx.

**Step 7: Replace `<div><label>...</label>{input}</div>` patterns with `<FormField>`**

In AccountForm, CategoryForm, TaxLineItemForm, ProrationSettingsModal.

**Step 8: Replace `<th className={thClass}>` with `<Th>` and `<td className={tdClass}>` with `<Td>`**

In AccountList, CategoryList, TransactionTable, TaxPage, RulesPage, and all table-rendering components.

**Step 9: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean.

**Step 10: Commit**

```
refactor: apply shared utilities, hooks, and components across entire frontend
```

---

## Task 13: Final Verification

**Step 1: Run full Rust test suite**

Run: `cd src-tauri && cargo test --lib`
Expected: All tests pass, zero warnings.

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean.

**Step 3: Run cargo check for zero warnings**

Run: `cd src-tauri && cargo check 2>&1 | grep warning`
Expected: No output (zero warnings).

**Step 4: Build the app**

Run: `make dev`
Expected: App builds and launches.

**Step 5: Commit any remaining fixes**

```
chore: final verification and cleanup
```
