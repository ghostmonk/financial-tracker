# Categorize Enhancements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add category search filtering, price range filters, amount conditions on rules, and a group drill-down view for granular transaction categorization.

**Architecture:** CategorySelect gets an inline search input. TransactionFilters gains amount_min/amount_max inputs and limits its category dropdown to used categories. Categorization rules gain optional amount_min/amount_max columns. The Categorize page gains a drill-down view that shows individual transactions within a group with search/price filters and bulk assign.

**Tech Stack:** Rust (rusqlite, serde), React + TypeScript + Tailwind, Tauri IPC, SQLite/SQLCipher

---

## Context: Current State

**Working directory:** `/Users/ghostmonk/Documents/code/financial-tracker/.worktrees/category-redesign`
**Branch:** `ghostmonk/category-redesign`

**Existing:**
- `CategorySelect.tsx` — direction-based optgroups, no search filter
- `TransactionFilters.tsx` — has search, date range, account, category, direction, is_recurring, uncategorized_only. No price range.
- `categorization_rules` table — pattern, match_field, match_type, category_id, priority, auto_apply. No amount conditions.
- `CategorizePage.tsx` — shows uncategorized groups, clicking opens `GroupCategorizeDialog` modal that assigns one category to the whole group
- `categorize.rs` — `rule_matches()` checks pattern against description/payee only. `get_uncategorized_groups()` returns grouped uncategorized transactions.

---

## Task 1: Schema — Add amount conditions to categorization_rules

**Files:**
- Modify: `src-tauri/src/schema.sql`
- Modify: `src-tauri/src/db.rs` (migration)

### Schema change:

```sql
-- Add to categorization_rules table:
amount_min REAL,
amount_max REAL
```

### Migration in db.rs:

Add after the existing ALTER TABLE migrations in `initialize_schema()`:

```rust
conn.execute_batch("ALTER TABLE categorization_rules ADD COLUMN amount_min REAL;").ok();
conn.execute_batch("ALTER TABLE categorization_rules ADD COLUMN amount_max REAL;").ok();
```

**Step 1:** Add `amount_min REAL` and `amount_max REAL` to the `categorization_rules` CREATE TABLE in `schema.sql`.
**Step 2:** Add ALTER TABLE migrations in `db.rs`.
**Step 3:** `cargo check` — verify compiles.
**Step 4:** Commit.

---

## Task 2: Rust — Update CategorizationRule model with amount conditions

**Files:**
- Modify: `src-tauri/src/models/categorization_rule.rs`

### Struct changes:

```rust
// Add to CategorizationRule:
pub amount_min: Option<f64>,
pub amount_max: Option<f64>,

// Add to CreateRuleParams:
pub amount_min: Option<f64>,
pub amount_max: Option<f64>,

// Add to UpdateRuleParams:
pub amount_min: Option<Option<f64>>,
pub amount_max: Option<Option<f64>>,
```

### SQL changes:

- `SELECT_COLS`: add `amount_min, amount_max`
- `row_to_rule`: update indices, read amount_min and amount_max as `Option<f64>`
- `create_rule`: add amount_min, amount_max to INSERT
- `update_rule`: add amount_min, amount_max to SET clause handling

### Tests:

Update existing tests to include `amount_min: None, amount_max: None` in CreateRuleParams. Add a test for creating a rule with amount conditions.

**Step 1:** Update structs with new fields.
**Step 2:** Update SELECT_COLS, row_to_rule indices.
**Step 3:** Update create_rule and update_rule.
**Step 4:** Fix existing tests, add new test.
**Step 5:** `cargo test --lib categorization_rule` — all pass.
**Step 6:** Commit.

---

## Task 3: Rust — Update rule matching engine for amount conditions

**Files:**
- Modify: `src-tauri/src/categorize.rs`

### Change `rule_matches` signature:

```rust
fn rule_matches(
    rule: &CategorizationRule,
    description: &str,
    payee: Option<&str>,
    amount: f64,
) -> bool
```

After the existing pattern match logic, add amount checks:

```rust
// After pattern match succeeds, check amount conditions
if let Some(min) = rule.amount_min {
    if amount.abs() < min {
        return false;
    }
}
if let Some(max) = rule.amount_max {
    if amount.abs() > max {
        return false;
    }
}
```

Use `amount.abs()` so the filter works regardless of sign convention.

### Update callers:

In `apply_rules_to_transactions` and `reapply_all_rules`, the transaction amount must be read and passed to `rule_matches`. Currently those functions SELECT `id, description, payee` — add `amount` to the query.

### Tests:

Update all existing `rule_matches` call sites in tests to pass an `amount` parameter (use `0.0` for tests that don't care about amount). Add tests for:
- Rule with amount_min only — matches amounts >= min, rejects below
- Rule with amount_max only — matches amounts <= max, rejects above
- Rule with both — matches within range, rejects outside
- Rule with no amount conditions — matches any amount (existing behavior)

**Step 1:** Update `rule_matches` signature and logic.
**Step 2:** Update `apply_rules_to_transactions` to read and pass amount.
**Step 3:** Update `reapply_all_rules` to read and pass amount.
**Step 4:** Fix existing tests, add amount condition tests.
**Step 5:** `cargo test --lib categorize` — all pass.
**Step 6:** Commit.

---

## Task 4: Rust — Add get_group_transactions command

**Files:**
- Modify: `src-tauri/src/categorize.rs`
- Modify: `src-tauri/src/commands/transactions.rs` (or create new command)
- Modify: `src-tauri/src/lib.rs`

### New function in categorize.rs:

```rust
pub fn get_group_transactions(
    conn: &Connection,
    normalized_name: &str,
    account_id: Option<&str>,
) -> Result<Vec<Transaction>, DbError>
```

This queries transactions where `category_id IS NULL` and the normalized merchant name matches the group's `normalized_name`. Since normalization happens in Rust (not SQL), query all uncategorized transactions for the account, normalize each description, and filter to matching ones. Return full `Transaction` structs.

### Tauri command:

```rust
#[tauri::command]
pub fn get_group_transactions(
    state: State<'_, AppState>,
    normalized_name: String,
    account_id: Option<String>,
) -> Result<Vec<Transaction>, String>
```

Register in `lib.rs` invoke_handler.

**Step 1:** Add `get_group_transactions` to `categorize.rs`.
**Step 2:** Add Tauri command.
**Step 3:** Register in `lib.rs`.
**Step 4:** Add test for `get_group_transactions`.
**Step 5:** `cargo test --lib` — all pass.
**Step 6:** Commit.

---

## Task 5: Rust — Add amount filters to TransactionFilters / list_transactions

**Files:**
- Modify: `src-tauri/src/models/transaction.rs`

### Add to TransactionFilters:

```rust
pub amount_min: Option<f64>,
pub amount_max: Option<f64>,
```

### Update list_transactions:

Add filter conditions in the WHERE clause builder:

```rust
if let Some(amount_min) = filters.amount_min {
    conditions.push(format!("ABS(t.amount) >= ?{}", param_idx));
    values.push(Box::new(amount_min));
    param_idx += 1;
}
if let Some(amount_max) = filters.amount_max {
    conditions.push(format!("ABS(t.amount) <= ?{}", param_idx));
    values.push(Box::new(amount_max));
    param_idx += 1;
}
```

**Step 1:** Add fields to `TransactionFilters`.
**Step 2:** Add conditions to `list_transactions`.
**Step 3:** `cargo check` — verify compiles.
**Step 4:** Commit.

---

## Task 6: Frontend — Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

### Changes:

```typescript
// Add to CategorizationRule:
amount_min: number | null;
amount_max: number | null;

// Add to CreateRuleParams:
amount_min?: number | null;
amount_max?: number | null;

// Add to UpdateRuleParams:
amount_min?: number | null;
amount_max?: number | null;

// Add to TransactionFilters:
amount_min?: number;
amount_max?: number;
```

**Step 1:** Update interfaces.
**Step 2:** Commit.

---

## Task 7: Frontend — Update tauri.ts API layer

**Files:**
- Modify: `src/lib/tauri.ts`

### Add:

```typescript
export async function getGroupTransactions(
  normalizedName: string,
  accountId?: string
): Promise<Transaction[]> {
  return invoke("get_group_transactions", {
    normalized_name: normalizedName,
    account_id: accountId ?? null,
  });
}
```

**Step 1:** Add `getGroupTransactions` function.
**Step 2:** Commit.

---

## Task 8: Frontend — Add search filter to CategorySelect

**Files:**
- Modify: `src/components/transactions/CategorySelect.tsx`

### Changes:

Add a text input at the top of the select/dropdown. As the user types, filter the category list by case-insensitive substring match on `name`. Preserve direction optgroup structure — hide empty groups. Clear input restores full list.

Implementation:
- Add `searchTerm` state
- Filter `parents` and `children` arrays by search match before grouping
- A parent passes if its name matches OR any of its children match
- A child passes if its name matches
- Text input with placeholder "Search categories..." above the select options
- Auto-focus the search input when the component mounts

For the `<select>` element approach: replace the native `<select>` with a custom dropdown div containing the search input and scrollable option list. Native `<select>` doesn't support embedded inputs.

Structure:
```
<div className="relative">
  <button onClick={toggle}>Selected category name</button>  {/* trigger */}
  {open && (
    <div className="absolute ...">  {/* dropdown panel */}
      <input placeholder="Search categories..." />  {/* search */}
      <div className="max-h-60 overflow-y-auto">  {/* scrollable list */}
        {/* direction groups → parent/child options as buttons/divs */}
      </div>
    </div>
  )}
</div>
```

When an option is clicked, call `onChange(categoryId)` and close the dropdown.

Keep the `inline` prop behavior — when `inline={true}`, the dropdown is shown immediately without the trigger button (used for TransactionTable inline editing).

**Step 1:** Rewrite CategorySelect with custom dropdown and search filter.
**Step 2:** Verify it works in all existing usage contexts (TransactionTable, GroupCategorizeDialog, RuleForm, CategoryForm parent dropdown, TransactionFilters).
**Step 3:** Commit.

---

## Task 9: Frontend — Add price range to TransactionFilters and used-categories-only

**Files:**
- Modify: `src/components/transactions/TransactionFilters.tsx`

### Price range inputs:

Add min/max amount inputs to the filter bar:

```tsx
<input
  type="number"
  placeholder="Min $"
  value={filters.amount_min ?? ""}
  onChange={(e) => onFiltersChange({
    ...filters,
    amount_min: e.target.value ? parseFloat(e.target.value) : undefined,
  })}
/>
<input
  type="number"
  placeholder="Max $"
  ...same pattern...
/>
```

### Used-categories-only:

The category dropdown should only show categories that appear in the current transaction set. Pass transactions as a prop:

```typescript
interface TransactionFiltersProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];  // NEW — for used-categories-only filtering
}
```

Compute used category IDs:

```typescript
const usedCategoryIds = new Set(
  transactions
    .map((t) => t.category_id)
    .filter((id): id is string => id !== null)
);
const usedCategories = categories.filter((c) => usedCategoryIds.has(c.id));
```

Pass `usedCategories` to the CategorySelect for the filter dropdown. Also include parent categories of any used child category so the hierarchy renders correctly.

Update the caller (`TransactionsPage.tsx`) to pass `transactions` to `TransactionFilters`.

**Step 1:** Add amount_min/amount_max inputs.
**Step 2:** Add used-categories-only filtering.
**Step 3:** Update `TransactionsPage.tsx` to pass transactions prop.
**Step 4:** Commit.

---

## Task 10: Frontend — Add amount fields to RulesPage form

**Files:**
- Modify: `src/pages/RulesPage.tsx`

### RuleForm changes:

Add amount_min and amount_max inputs to the rule form:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div>
    <label>Min Amount</label>
    <input type="number" step="0.01" placeholder="Any" ... />
  </div>
  <div>
    <label>Max Amount</label>
    <input type="number" step="0.01" placeholder="Any" ... />
  </div>
</div>
```

State: `amountMin` and `amountMax` as `string` (for input control), convert to `number | undefined` on submit.

When editing a rule, populate from `editingRule.amount_min` / `editingRule.amount_max`.

### Rules table changes:

Add an "Amount" column showing the range when set (e.g., "$1.00 - $5.00", ">= $10.00", "<= $50.00", or blank).

**Step 1:** Add state and inputs to RuleForm.
**Step 2:** Add Amount column to rules table.
**Step 3:** Commit.

---

## Task 11: Frontend — Build GroupDrillDown component

**Files:**
- Create: `src/components/categorize/GroupDrillDown.tsx`

### Props:

```typescript
interface GroupDrillDownProps {
  group: UncategorizedGroup;
  categories: Category[];
  onBack: () => void;
  onRefresh: () => void;
}
```

### Layout:

```
<div>
  <button onClick={onBack}>← Back to groups</button>
  <h2>{group.normalized_name} — {group.transaction_count} transactions</h2>

  {/* Filters */}
  <div className="flex gap-3">
    <input placeholder="Search descriptions..." />
    <input type="number" placeholder="Min $" />
    <input type="number" placeholder="Max $" />
  </div>

  {/* Bulk assign bar (when selection > 0) */}
  <div>
    {selectedIds.size} selected
    <CategorySelect ... />
    <label><input type="checkbox" /> Create rule</label>
    {createRule && (
      <>
        <select>match type</select>
        <input placeholder="Min $" /> <input placeholder="Max $" />
      </>
    )}
    <button>Assign</button>
  </div>

  {/* Transaction table */}
  <table>
    <tr><th>☐</th><th>Date</th><th>Description</th><th>Amount</th><th>Category</th></tr>
    {filteredTransactions.map(tx => ...)}
  </table>
</div>
```

### Behavior:

1. On mount, call `getGroupTransactions(group.normalized_name, accountId)` to fetch all transactions in this group.
2. Client-side filter by description search and amount range.
3. Checkbox selection. Select all selects only filtered/visible transactions.
4. Bulk assign: pick category, optionally create a rule (with match_type, optional amount_min/amount_max).
5. On assign:
   - Call `updateTransactionsCategory(selectedIds, categoryId)`
   - If creating rule: call `createCategorizationRule(params)` with amount conditions
   - Remove assigned transactions from local list
   - If no transactions remain, call `onBack()`
6. Transactions that get assigned stay visible but show their new category and become unselectable (visual feedback before navigating away).

### Account context:

The drill-down needs to know which account filter was active on the CategorizePage. Pass `accountId` as an optional prop.

**Step 1:** Create GroupDrillDown component with transaction fetching and display.
**Step 2:** Add filter inputs (search, price range).
**Step 3:** Add selection and bulk assign with category selector.
**Step 4:** Add optional rule creation with amount conditions.
**Step 5:** Commit.

---

## Task 12: Frontend — Integrate GroupDrillDown into CategorizePage

**Files:**
- Modify: `src/pages/CategorizePage.tsx`

### Changes:

Add a `drillDownGroup` state:

```typescript
const [drillDownGroup, setDrillDownGroup] = useState<UncategorizedGroup | null>(null);
```

When `drillDownGroup` is set, render `<GroupDrillDown>` instead of the group list. The group list gets two actions per row:

1. **Click group name** → opens drill-down (`setDrillDownGroup(group)`)
2. **"Categorize All" button** → opens existing `GroupCategorizeDialog` for quick single-category assignment

### Layout:

```tsx
{drillDownGroup ? (
  <GroupDrillDown
    group={drillDownGroup}
    categories={categories}
    accountId={selectedAccountId || undefined}
    onBack={() => {
      setDrillDownGroup(null);
      fetchGroups();
    }}
    onRefresh={fetchGroups}
  />
) : (
  // existing group list with added drill-down click handler
)}
```

### Group list row changes:

Each group row shows:
- Group name (clickable → drill-down)
- Transaction count
- Total amount
- "Categorize All" button (opens existing dialog)

**Step 1:** Add drillDownGroup state and conditional rendering.
**Step 2:** Add click handler on group name for drill-down.
**Step 3:** Add "Categorize All" button for quick assign.
**Step 4:** Verify existing GroupCategorizeDialog still works.
**Step 5:** Commit.

---

## Task 13: Integration Testing & Polish

**Step 1:** `cd src-tauri && cargo test --lib` — all Rust tests pass.
**Step 2:** `npx tsc --noEmit` — zero TypeScript errors.
**Step 3:** Format: `cargo fmt` + `npx eslint src/ --fix`.
**Step 4:** `make dev-release` — app launches.
**Step 5:** Transactions page — verify price range filters work, category dropdown shows only used categories.
**Step 6:** CategorySelect — verify type-to-filter search works everywhere (TransactionTable, RuleForm, CategoryForm).
**Step 7:** Categorize page — click group name → drill-down view with transactions.
**Step 8:** Drill-down — filter by description, filter by price, select subset, assign category with rule including amount range.
**Step 9:** Rules page — verify amount columns display, rule form has amount fields.
**Step 10:** Final commit if any fixes needed.

---

## Summary of All Files Changed/Created

**New files:**
- `src/components/categorize/GroupDrillDown.tsx` — drill-down view for categorize groups

**Modified files (Rust — 6):**
- `src-tauri/src/schema.sql` — amount_min/amount_max on categorization_rules
- `src-tauri/src/db.rs` — ALTER TABLE migrations
- `src-tauri/src/models/categorization_rule.rs` — amount fields in structs and CRUD
- `src-tauri/src/models/transaction.rs` — amount_min/amount_max in TransactionFilters
- `src-tauri/src/categorize.rs` — amount matching in rule_matches, get_group_transactions
- `src-tauri/src/lib.rs` — register get_group_transactions command

**Modified files (Frontend — 7):**
- `src/lib/types.ts` — amount fields on rule types, TransactionFilters
- `src/lib/tauri.ts` — getGroupTransactions API function
- `src/components/transactions/CategorySelect.tsx` — search filter, custom dropdown
- `src/components/transactions/TransactionFilters.tsx` — price range, used-categories-only
- `src/pages/TransactionsPage.tsx` — pass transactions to TransactionFilters
- `src/pages/RulesPage.tsx` — amount fields in form and table
- `src/pages/CategorizePage.tsx` — drill-down integration
