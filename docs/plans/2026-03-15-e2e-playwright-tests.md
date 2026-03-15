# E2E Playwright Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Playwright e2e test coverage for all 9 pages of the financial tracker Tauri app, with a type-safe Tauri IPC mock layer.

**Architecture:** Run Vite dev server standalone (no Tauri shell). Mock `window.__TAURI_INTERNALS__` via Playwright's `addInitScript()` to intercept all `invoke()` calls. A central mock registry maps Tauri command names to handler functions that return typed test data. Each page gets its own spec file. Components get `data-testid` attributes for reliable element selection.

**Tech Stack:** Playwright, Vite 7, React 19, TypeScript 5.8, Tailwind CSS v4

---

### Task 1: Install Playwright and Configure

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `e2e/tsconfig.json`
- Modify: `Makefile`

**Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

**Step 2: Create Playwright config**

Create `playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/specs",
  outputDir: "./e2e/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { outputFolder: "e2e/playwright-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
```

**Step 3: Create e2e tsconfig**

Create `e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["../src/*"]
    }
  },
  "include": ["**/*.ts"]
}
```

**Step 4: Add Makefile targets**

Add to `Makefile`:

```makefile
# E2E tests (headless)
test-e2e:
	npx playwright test

# E2E tests (interactive UI)
test-e2e-ui:
	npx playwright test --ui

# All tests including e2e
test-all: test test-e2e
```

**Step 5: Add to .gitignore**

Append to `.gitignore`:

```
e2e/test-results/
e2e/playwright-report/
```

**Step 6: Commit**

```bash
git add playwright.config.ts e2e/tsconfig.json package.json package-lock.json Makefile .gitignore
git commit -m "chore: install Playwright and configure e2e test infrastructure"
```

---

### Task 2: Create Tauri IPC Mock Layer

**Files:**
- Create: `e2e/mocks/tauri-ipc.ts`
- Create: `e2e/mocks/handlers.ts`

**Step 1: Create the IPC mock injector**

The core idea: Playwright's `addInitScript` runs before any page JS. We inject a fake `window.__TAURI_INTERNALS__` that intercepts all `invoke()` calls. The mock also covers Tauri plugin commands (prefixed `plugin:dialog|*`, `plugin:fs|*`).

Create `e2e/mocks/tauri-ipc.ts`:

```typescript
import type { Page } from "@playwright/test";

export type MockHandler = (args: Record<string, unknown>) => unknown;
export type MockHandlerMap = Record<string, MockHandler>;

/**
 * Injects a mock Tauri IPC layer into the page.
 * All invoke() calls from @tauri-apps/api/core and plugins are intercepted.
 * The handlerMap keys are Tauri command names (e.g. "list_accounts", "unlock_database").
 * Plugin commands use their prefixed form (e.g. "plugin:dialog|open").
 */
export async function injectTauriMock(
  page: Page,
  handlerMap: MockHandlerMap,
): Promise<void> {
  const serializedHandlers = JSON.stringify(
    Object.keys(handlerMap).reduce(
      (acc, key) => {
        acc[key] = handlerMap[key].toString();
        return acc;
      },
      {} as Record<string, string>,
    ),
  );

  await page.addInitScript(`
    (() => {
      const handlerSources = ${serializedHandlers};
      const handlers = {};
      for (const [key, src] of Object.entries(handlerSources)) {
        handlers[key] = new Function('return (' + src + ')')();
      }

      window.__TAURI_INTERNALS__ = {
        invoke: (cmd, args) => {
          const handler = handlers[cmd];
          if (!handler) {
            console.warn('[tauri-mock] Unhandled command:', cmd, args);
            return Promise.reject(new Error('Unhandled mock command: ' + cmd));
          }
          try {
            const result = handler(args || {});
            return Promise.resolve(result);
          } catch (err) {
            return Promise.reject(err);
          }
        },
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        convertFileSrc: (path) => 'asset://localhost/' + encodeURIComponent(path),
      };

      // Tauri plugins check for __TAURI_INTERNALS__ and use invoke internally.
      // The plugin:* prefix commands are already handled by the invoke mock above.
      // Patch postMessage for any event-based plugins.
      window.__TAURI_INTERNALS__.postMessage = () => {};
    })();
  `);
}
```

**Step 2: Create default handlers**

Create `e2e/mocks/handlers.ts`. This file maps every Tauri command to a default response using test data factories (Task 3). Start with the structure, factories come next.

```typescript
import type { MockHandlerMap } from "./tauri-ipc";
import { factories } from "./factories";

export function createDefaultHandlers(
  overrides?: Partial<MockHandlerMap>,
): MockHandlerMap {
  const defaults: MockHandlerMap = {
    // Database
    is_database_initialized: () => true,
    unlock_database: () => null,

    // Accounts
    list_accounts: () => factories.accounts.list(),
    create_account: (args) => factories.accounts.single(args.params as Record<string, unknown>),
    update_account: (args) => factories.accounts.single(args.params as Record<string, unknown>),
    delete_account: () => null,

    // Categories
    list_categories: () => factories.categories.list(),
    create_category: (args) => factories.categories.single(args.params as Record<string, unknown>),
    update_category: (args) => factories.categories.single(args.params as Record<string, unknown>),
    delete_category: () => null,

    // Transactions
    list_transactions: () => factories.transactions.list(),
    update_transaction: (args) => factories.transactions.single(args.params as Record<string, unknown>),
    update_transactions_category: () => null,
    delete_transaction: () => null,

    // Import
    preview_csv_file: () => factories.import.csvPreview(),
    parse_and_preview_csv: () => factories.import.importPreview(),
    parse_and_preview_ofx: () => factories.import.importPreview(),
    execute_import_command: () => factories.import.importResult(),

    // Categorization Rules
    list_categorization_rules: () => factories.rules.list(),
    create_categorization_rule: (args) => factories.rules.single(args.params as Record<string, unknown>),
    update_categorization_rule: (args) => factories.rules.single(args.params as Record<string, unknown>),
    delete_categorization_rule: () => null,
    get_uncategorized_groups: () => factories.categorize.groups(),
    get_group_transactions: () => factories.transactions.list(),
    count_uncategorized_groups: () => 3,
    apply_rules_to_transaction_ids: () => 0,
    reapply_all_rules: () => 0,

    // Tags
    list_tags: () => factories.tags.list(),
    create_tag: (args) => factories.tags.single({ name: args.name as string }),
    delete_tag: () => null,
    set_transaction_tags: () => null,
    get_transaction_tags: () => [],

    // Tax
    get_tax_rules: () => factories.tax.rules(),
    list_tax_line_items: () => factories.tax.lineItems(),
    create_tax_line_item_cmd: (args) => factories.tax.lineItem(args.params as Record<string, unknown>),
    update_tax_line_item_cmd: (args) => factories.tax.lineItem(args.params as Record<string, unknown>),
    delete_tax_line_item_cmd: () => null,
    get_fiscal_year_settings_cmd: () => factories.tax.fiscalYearSettings(),
    upsert_fiscal_year_settings_cmd: (args) => factories.tax.fiscalYearSettings(args.params as Record<string, unknown>),
    get_tax_workspace_items: () => factories.tax.workspaceItems(),
    update_transaction_receipt: () => null,

    // Tauri plugin commands
    "plugin:dialog|open": () => "/mock/path/to/file.csv",
    "plugin:fs|read_text_file": () => "date,amount,description\n2025-01-01,-50.00,Test Transaction",
  };

  return { ...defaults, ...overrides };
}
```

**Step 3: Commit**

```bash
git add e2e/mocks/
git commit -m "feat(e2e): add Tauri IPC mock layer for Playwright tests"
```

---

### Task 3: Create Type-Safe Test Data Factories

**Files:**
- Create: `e2e/mocks/factories.ts`

This is the sync point between Rust backend types and test data. Every factory returns data matching the TypeScript interfaces in `src/lib/types.ts`. If a Rust struct changes, the TS type changes, and the factory fails to compile.

**Step 1: Create factories**

Create `e2e/mocks/factories.ts`:

```typescript
import type {
  Account,
  Category,
  Transaction,
  CsvPreview,
  ImportPreview,
  ImportResult,
  CategorizationRule,
  UncategorizedGroup,
  Tag,
  TaxRules,
  TaxLineItem,
  FiscalYearSettings,
  TaxWorkspaceItem,
} from "../../src/lib/types";

const now = "2025-06-15T12:00:00Z";

// ---- Accounts ----

const defaultAccounts: Account[] = [
  {
    id: "acct-1",
    name: "Chequing",
    institution: "TD Bank",
    account_type: "checking",
    currency: "CAD",
    credit_limit: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "acct-2",
    name: "Visa",
    institution: "TD Bank",
    account_type: "credit_card",
    currency: "CAD",
    credit_limit: 5000,
    created_at: now,
    updated_at: now,
  },
];

// ---- Categories ----

const defaultCategories: Category[] = [
  {
    id: "cat-income",
    slug: "income",
    name: "Income",
    parent_id: null,
    direction: "income",
    sort_order: 0,
    created_at: now,
  },
  {
    id: "cat-salary",
    slug: "salary",
    name: "Salary",
    parent_id: "cat-income",
    direction: "income",
    sort_order: 1,
    created_at: now,
  },
  {
    id: "cat-expense",
    slug: "expenses",
    name: "Expenses",
    parent_id: null,
    direction: "expense",
    sort_order: 0,
    created_at: now,
  },
  {
    id: "cat-groceries",
    slug: "groceries",
    name: "Groceries",
    parent_id: "cat-expense",
    direction: "expense",
    sort_order: 1,
    created_at: now,
  },
  {
    id: "cat-rent",
    slug: "rent",
    name: "Rent",
    parent_id: "cat-expense",
    direction: "expense",
    sort_order: 2,
    created_at: now,
  },
  {
    id: "cat-transfer",
    slug: "transfers",
    name: "Transfers",
    parent_id: null,
    direction: "transfer",
    sort_order: 0,
    created_at: now,
  },
];

// ---- Transactions ----

const defaultTransactions: Transaction[] = [
  {
    id: "txn-1",
    date: "2025-06-01",
    amount: -85.50,
    description: "LOBLAWS #1234",
    payee: "Loblaws",
    merchant: "Loblaws",
    account_id: "acct-1",
    category_id: "cat-groceries",
    is_recurring: false,
    tax_deductible: false,
    gst_amount: null,
    qst_amount: null,
    notes: null,
    import_hash: "hash1",
    fitid: null,
    transaction_type: null,
    categorized_by_rule: false,
    created_at: now,
    updated_at: now,
  },
  {
    id: "txn-2",
    date: "2025-06-01",
    amount: 3500.00,
    description: "EMPLOYER DIRECT DEPOSIT",
    payee: "Employer Inc",
    merchant: null,
    account_id: "acct-1",
    category_id: "cat-salary",
    is_recurring: true,
    tax_deductible: false,
    gst_amount: null,
    qst_amount: null,
    notes: null,
    import_hash: "hash2",
    fitid: null,
    transaction_type: null,
    categorized_by_rule: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: "txn-3",
    date: "2025-06-05",
    amount: -1800.00,
    description: "RENT PAYMENT",
    payee: null,
    merchant: null,
    account_id: "acct-1",
    category_id: "cat-rent",
    is_recurring: true,
    tax_deductible: false,
    gst_amount: null,
    qst_amount: null,
    notes: "Monthly rent",
    import_hash: "hash3",
    fitid: null,
    transaction_type: null,
    categorized_by_rule: false,
    created_at: now,
    updated_at: now,
  },
  {
    id: "txn-4",
    date: "2025-06-10",
    amount: -42.00,
    description: "UNCATEGORIZED STORE",
    payee: null,
    merchant: null,
    account_id: "acct-2",
    category_id: null,
    is_recurring: false,
    tax_deductible: false,
    gst_amount: null,
    qst_amount: null,
    notes: null,
    import_hash: "hash4",
    fitid: null,
    transaction_type: null,
    categorized_by_rule: false,
    created_at: now,
    updated_at: now,
  },
];

// ---- Rules ----

const defaultRules: CategorizationRule[] = [
  {
    id: "rule-1",
    pattern: "LOBLAWS",
    match_field: "description",
    match_type: "contains",
    category_id: "cat-groceries",
    priority: 10,
    amount_min: null,
    amount_max: null,
    auto_apply: true,
    created_at: now,
  },
  {
    id: "rule-2",
    pattern: "RENT PAYMENT",
    match_field: "description",
    match_type: "exact",
    category_id: "cat-rent",
    priority: 20,
    amount_min: null,
    amount_max: null,
    auto_apply: true,
    created_at: now,
  },
];

// ---- Tags ----

const defaultTags: Tag[] = [
  { id: "tag-1", name: "business", slug: "business", created_at: now },
  { id: "tag-2", name: "personal", slug: "personal", created_at: now },
];

// ---- Uncategorized Groups ----

const defaultUncategorizedGroups: UncategorizedGroup[] = [
  {
    normalized_name: "uncategorized store",
    transaction_count: 5,
    total_amount: -210.00,
    sample_description: "UNCATEGORIZED STORE",
    account_ids: ["acct-1", "acct-2"],
  },
  {
    normalized_name: "coffee shop",
    transaction_count: 12,
    total_amount: -72.00,
    sample_description: "COFFEE SHOP #55",
    account_ids: ["acct-2"],
  },
  {
    normalized_name: "online purchase",
    transaction_count: 3,
    total_amount: -156.50,
    sample_description: "ONLINE PURCHASE - AMAZON",
    account_ids: ["acct-1"],
  },
];

// ---- Tax ----

const defaultTaxRules: TaxRules = {
  jurisdiction: "CA-QC",
  fiscal_year_type: "calendar",
  rates: { gst: 5.0, qst: 9.975, meals_deduction_pct: 50.0 },
  proration_types: {
    vehicle: {
      label: "Vehicle",
      fields: [
        { key: "vehicle_total_km", label: "Total KM", unit: "km" },
        { key: "vehicle_business_km", label: "Business KM", unit: "km" },
      ],
      hint: "Track total and business kilometres driven.",
    },
    home_office: {
      label: "Home Office",
      fields: [
        { key: "home_total_sqft", label: "Total Sq Ft", unit: "sqft" },
        { key: "home_office_sqft", label: "Office Sq Ft", unit: "sqft" },
      ],
      hint: "Measure your dedicated office space.",
    },
  },
  line_mappings: [
    {
      category_slug: "office-supplies",
      direction: "expense",
      t2125_line: "8810",
      t2125_label: "Office expenses",
      tp80_line: "175",
      tp80_label: "Fournitures de bureau",
      gst_eligible: true,
      qst_eligible: true,
      proration: null,
      hint: "Stationery, printer ink, software subscriptions",
    },
  ],
  reminders: [
    { id: "r1", context: "filing", text: "File by June 15 if self-employed." },
  ],
  info_sections: [
    { id: "s1", title: "GST/QST", body: "Claim input tax credits on eligible business expenses." },
  ],
};

const defaultTaxLineItems: TaxLineItem[] = [
  {
    id: "tli-1",
    date: "2025-03-15",
    description: "Office supplies",
    amount: -89.99,
    category_id: "cat-expense",
    has_receipt: true,
    receipt_path: "/receipts/office.pdf",
    notes: null,
    fiscal_year: 2025,
    created_at: now,
    updated_at: now,
  },
];

const defaultFiscalYearSettings: FiscalYearSettings = {
  fiscal_year: 2025,
  vehicle_total_km: 20000,
  vehicle_business_km: 8000,
  home_total_sqft: 1200,
  home_office_sqft: 150,
  created_at: now,
  updated_at: now,
};

const defaultTaxWorkspaceItems: TaxWorkspaceItem[] = [
  {
    id: "twi-1",
    source: "transaction",
    date: "2025-03-01",
    description: "Office supplies from Staples",
    amount: -89.99,
    category_id: "cat-expense",
    has_receipt: true,
    receipt_path: "/receipts/staples.pdf",
    notes: null,
  },
  {
    id: "twi-2",
    source: "tax_line_item",
    date: "2025-04-10",
    description: "Printer cartridge",
    amount: -45.00,
    category_id: "cat-expense",
    has_receipt: false,
    receipt_path: null,
    notes: "Bought at Best Buy",
  },
];

// ---- Import ----

const defaultCsvPreview: CsvPreview = {
  columns: ["Date", "Amount", "Description"],
  rows: [
    ["2025-01-01", "-50.00", "GROCERY STORE"],
    ["2025-01-02", "-25.00", "GAS STATION"],
    ["2025-01-03", "3500.00", "SALARY DEPOSIT"],
  ],
};

const defaultImportPreview: ImportPreview = {
  parsed: {
    account_id_hint: null,
    institution_hint: "TD Bank",
    currency: "CAD",
    transactions: [
      {
        date: "2025-01-01",
        amount: -50.00,
        description: "GROCERY STORE",
        payee: null,
        fitid: null,
        transaction_type: null,
        import_hash: "preview-hash-1",
      },
      {
        date: "2025-01-02",
        amount: -25.00,
        description: "GAS STATION",
        payee: null,
        fitid: null,
        transaction_type: null,
        import_hash: "preview-hash-2",
      },
    ],
  },
  duplicate_fitids: [],
  duplicate_hashes: [],
  new_count: 2,
  duplicate_count: 0,
};

const defaultImportResult: ImportResult = {
  imported_count: 2,
  skipped_count: 0,
  categorized_count: 1,
};

// ---- Factory API ----

export const factories = {
  accounts: {
    list: (): Account[] => structuredClone(defaultAccounts),
    single: (overrides?: Record<string, unknown>): Account => ({
      ...structuredClone(defaultAccounts[0]),
      ...overrides,
    }),
  },
  categories: {
    list: (): Category[] => structuredClone(defaultCategories),
    single: (overrides?: Record<string, unknown>): Category => ({
      ...structuredClone(defaultCategories[0]),
      ...overrides,
    }),
  },
  transactions: {
    list: (): Transaction[] => structuredClone(defaultTransactions),
    single: (overrides?: Record<string, unknown>): Transaction => ({
      ...structuredClone(defaultTransactions[0]),
      ...overrides,
    }),
  },
  rules: {
    list: (): CategorizationRule[] => structuredClone(defaultRules),
    single: (overrides?: Record<string, unknown>): CategorizationRule => ({
      ...structuredClone(defaultRules[0]),
      ...overrides,
    }),
  },
  tags: {
    list: (): Tag[] => structuredClone(defaultTags),
    single: (overrides?: Partial<Tag>): Tag => ({
      ...structuredClone(defaultTags[0]),
      ...overrides,
    }),
  },
  categorize: {
    groups: (): UncategorizedGroup[] => structuredClone(defaultUncategorizedGroups),
  },
  tax: {
    rules: (): TaxRules => structuredClone(defaultTaxRules),
    lineItems: (): TaxLineItem[] => structuredClone(defaultTaxLineItems),
    lineItem: (overrides?: Record<string, unknown>): TaxLineItem => ({
      ...structuredClone(defaultTaxLineItems[0]),
      ...overrides,
    }),
    fiscalYearSettings: (overrides?: Record<string, unknown>): FiscalYearSettings => ({
      ...structuredClone(defaultFiscalYearSettings),
      ...overrides,
    }),
    workspaceItems: (): TaxWorkspaceItem[] => structuredClone(defaultTaxWorkspaceItems),
  },
  import: {
    csvPreview: (): CsvPreview => structuredClone(defaultCsvPreview),
    importPreview: (): ImportPreview => structuredClone(defaultImportPreview),
    importResult: (): ImportResult => structuredClone(defaultImportResult),
  },
};
```

**Step 2: Commit**

```bash
git add e2e/mocks/factories.ts
git commit -m "feat(e2e): add type-safe test data factories"
```

---

### Task 4: Create Playwright Fixtures

**Files:**
- Create: `e2e/fixtures.ts`

This creates a custom Playwright `test` object that automatically injects the Tauri mock. Tests import `test` and `expect` from here instead of `@playwright/test`.

**Step 1: Create fixtures file**

Create `e2e/fixtures.ts`:

```typescript
import { test as base, expect } from "@playwright/test";
import { injectTauriMock, type MockHandlerMap } from "./mocks/tauri-ipc";
import { createDefaultHandlers } from "./mocks/handlers";

type TestFixtures = {
  /** Navigate to a page with default mock handlers. Override specific commands as needed. */
  mockPage: (
    path: string,
    overrides?: Partial<MockHandlerMap>,
  ) => Promise<void>;
};

export const test = base.extend<TestFixtures>({
  mockPage: async ({ page }, use) => {
    const navigate = async (
      path: string,
      overrides?: Partial<MockHandlerMap>,
    ) => {
      const handlers = createDefaultHandlers(overrides);
      await injectTauriMock(page, handlers);
      await page.goto(path);
    };
    await use(navigate);
  },
});

export { expect };
```

**Step 2: Commit**

```bash
git add e2e/fixtures.ts
git commit -m "feat(e2e): add Playwright fixtures with Tauri mock injection"
```

---

### Task 5: Add data-testid Attributes to Components

**Files:**
- Modify: `src/components/Layout.tsx` — nav links, sidebar
- Modify: `src/pages/UnlockPage.tsx` — password input, submit button, heading
- Modify: `src/pages/DashboardPage.tsx` — month nav, month label
- Modify: `src/pages/AccountsPage.tsx` — add button, loading/error states
- Modify: `src/pages/CategoriesPage.tsx` — add button, tag input
- Modify: `src/pages/TransactionsPage.tsx` — filter bar, load more, count
- Modify: `src/pages/ImportPage.tsx` — step indicator
- Modify: `src/pages/CategorizePage.tsx` — account filter, drill-down back button
- Modify: `src/pages/RulesPage.tsx` — add button, reapply button
- Modify: `src/pages/TaxPage.tsx` — year selector, tab buttons, add item button
- Modify: `src/components/shared/Modal.tsx` — modal container, close button
- Modify: `src/components/accounts/AccountForm.tsx` — form fields, submit button
- Modify: `src/components/accounts/AccountList.tsx` — table rows, edit/delete buttons
- Modify: `src/components/categories/CategoryForm.tsx` — form fields, submit button
- Modify: `src/components/categories/CategoryList.tsx` — category rows, edit/delete buttons
- Modify: `src/components/transactions/TransactionTable.tsx` — rows, select-all, bulk bar
- Modify: `src/components/transactions/TransactionFilters.tsx` — search, filter inputs
- Modify: `src/components/categorize/UncategorizedGroupList.tsx` — group rows, action buttons
- Modify: `src/components/categorize/GroupCategorizeDialog.tsx` — category select, confirm button
- Modify: `src/components/categorize/GroupDrillDown.tsx` — back button, select-all, assign button
- Modify: `src/components/import/FileSelector.tsx` — account select, file button
- Modify: `src/components/import/CsvMappingStep.tsx` — column selects, submit button
- Modify: `src/components/import/ImportPreviewStep.tsx` — import button, skip duplicates
- Modify: `src/components/import/ImportResultStep.tsx` — success message, action buttons
- Modify: `src/components/dashboard/MonthlySummary.tsx` — summary cards
- Modify: `src/components/dashboard/CategoryBreakdown.tsx` — tab buttons, category rows
- Modify: `src/components/tax/TaxLineItemForm.tsx` — form fields, submit button
- Modify: `src/components/tax/ProrationSettingsModal.tsx` — input fields, save button
- Modify: `src/components/tax/ReceiptCell.tsx` — receipt indicator
- Modify: `src/components/categorize/GroupDrillDown.tsx` — transaction rows

**Naming convention:** `data-testid="<component>-<element>"`, e.g. `data-testid="account-form-name"`, `data-testid="nav-transactions"`, `data-testid="unlock-submit"`.

This is a large task. Add `data-testid` to every interactive element and key content element that tests will need to locate. Reference the spec files (Tasks 6-14) for which testids are used. Each page's spec defines the exact testids it depends on.

**Step 1: Add testids to Layout and shared components**

Layout nav links: `data-testid="nav-dashboard"`, `nav-transactions`, `nav-categorize`, `nav-import`, `nav-accounts`, `nav-categories`, `nav-rules`, `nav-tax`. Sidebar container: `data-testid="sidebar"`. Uncategorized badge: `data-testid="nav-categorize-badge"`.

Modal: `data-testid="modal"` on the card, `data-testid="modal-close"` on close/cancel if present.

**Step 2: Add testids to each page and its components**

Add testids as described. Full list per page is defined in the corresponding spec task below.

**Step 3: Run format and type check**

```bash
make format
make test-ts
```

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: add data-testid attributes to all components for e2e testing"
```

---

### Task 6: Unlock Page Tests

**Files:**
- Create: `e2e/specs/unlock.spec.ts`

**Required testids on UnlockPage.tsx:**
- `data-testid="unlock-heading"` — the h1
- `data-testid="unlock-password"` — password input
- `data-testid="unlock-submit"` — submit button
- `data-testid="unlock-error"` — error message span

**Step 1: Write specs**

Create `e2e/specs/unlock.spec.ts`:

```typescript
import { test, expect } from "../fixtures";

test.describe("Unlock Page", () => {
  test("shows 'Create Password' on first launch", async ({ page, mockPage }) => {
    await mockPage("/unlock", {
      is_database_initialized: () => false,
    });
    await expect(page.getByTestId("unlock-heading")).toHaveText("Create Password");
  });

  test("shows 'Enter Password' when database exists", async ({ page, mockPage }) => {
    await mockPage("/unlock", {
      is_database_initialized: () => true,
    });
    await expect(page.getByTestId("unlock-heading")).toHaveText("Enter Password");
  });

  test("submit button is disabled when password is empty", async ({ page, mockPage }) => {
    await mockPage("/unlock");
    await expect(page.getByTestId("unlock-submit")).toBeDisabled();
  });

  test("unlocks and navigates to transactions on success", async ({ page, mockPage }) => {
    await mockPage("/unlock", {
      unlock_database: () => null,
      list_transactions: () => [],
      list_accounts: () => [],
    });
    await page.getByTestId("unlock-password").fill("test-password");
    await page.getByTestId("unlock-submit").click();
    await expect(page).toHaveURL(/\/transactions/);
  });

  test("shows error on wrong password", async ({ page, mockPage }) => {
    await mockPage("/unlock", {
      unlock_database: () => {
        throw new Error("Invalid password");
      },
    });
    await page.getByTestId("unlock-password").fill("wrong");
    await page.getByTestId("unlock-submit").click();
    await expect(page.getByTestId("unlock-error")).toBeVisible();
  });
});
```

**Step 2: Run tests**

```bash
npx playwright test e2e/specs/unlock.spec.ts
```

**Step 3: Commit**

```bash
git add e2e/specs/unlock.spec.ts
git commit -m "test(e2e): add Unlock page tests"
```

---

### Task 7: Dashboard Page Tests

**Files:**
- Create: `e2e/specs/dashboard.spec.ts`

**Required testids on DashboardPage.tsx:**
- `data-testid="dashboard-month-label"` — current month display
- `data-testid="dashboard-prev-month"` — previous month button
- `data-testid="dashboard-next-month"` — next month button
- `data-testid="dashboard-loading"` — loading indicator

**Required testids on MonthlySummary.tsx:**
- `data-testid="summary-income"` — income card
- `data-testid="summary-expenses"` — expenses card
- `data-testid="summary-net"` — net card

**Required testids on CategoryBreakdown.tsx:**
- `data-testid="breakdown-tab-expense"` — expense tab
- `data-testid="breakdown-tab-income"` — income tab

**Step 1: Write specs**

Create `e2e/specs/dashboard.spec.ts`:

```typescript
import { test, expect } from "../fixtures";

test.describe("Dashboard Page", () => {
  test.beforeEach(async ({ page, mockPage }) => {
    // Must unlock first — Layout redirects to /unlock if not unlocked
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);
    await page.getByTestId("nav-dashboard").click();
    await page.waitForURL(/\/dashboard/);
  });

  test("displays current month label", async ({ page }) => {
    await expect(page.getByTestId("dashboard-month-label")).toBeVisible();
  });

  test("shows monthly summary cards", async ({ page }) => {
    await expect(page.getByTestId("summary-income")).toBeVisible();
    await expect(page.getByTestId("summary-expenses")).toBeVisible();
    await expect(page.getByTestId("summary-net")).toBeVisible();
  });

  test("navigates to previous month", async ({ page }) => {
    const currentLabel = await page.getByTestId("dashboard-month-label").textContent();
    await page.getByTestId("dashboard-prev-month").click();
    await expect(page.getByTestId("dashboard-month-label")).not.toHaveText(currentLabel!);
  });

  test("next month button disabled at current month", async ({ page }) => {
    await expect(page.getByTestId("dashboard-next-month")).toBeDisabled();
  });

  test("shows category breakdown tabs", async ({ page }) => {
    await expect(page.getByTestId("breakdown-tab-expense")).toBeVisible();
  });
});
```

**Step 2: Run and commit**

```bash
npx playwright test e2e/specs/dashboard.spec.ts
git add e2e/specs/dashboard.spec.ts
git commit -m "test(e2e): add Dashboard page tests"
```

---

### Task 8: Accounts Page Tests

**Files:**
- Create: `e2e/specs/accounts.spec.ts`

**Required testids on AccountsPage.tsx:**
- `data-testid="accounts-add-btn"` — add account button
- `data-testid="accounts-loading"` — loading state
- `data-testid="accounts-error"` — error message

**Required testids on AccountList.tsx:**
- `data-testid="account-row-{id}"` — each account row
- `data-testid="account-edit-{id}"` — edit button per row
- `data-testid="account-delete-{id}"` — delete button per row

**Required testids on AccountForm.tsx:**
- `data-testid="account-form-name"` — name input
- `data-testid="account-form-institution"` — institution input
- `data-testid="account-form-type"` — type select
- `data-testid="account-form-currency"` — currency select
- `data-testid="account-form-submit"` — submit button

**Step 1: Write specs**

Create `e2e/specs/accounts.spec.ts`:

```typescript
import { test, expect } from "../fixtures";

test.describe("Accounts Page", () => {
  test.beforeEach(async ({ page, mockPage }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);
    await page.getByTestId("nav-accounts").click();
    await page.waitForURL(/\/accounts/);
  });

  test("displays account list", async ({ page }) => {
    await expect(page.getByTestId("account-row-acct-1")).toBeVisible();
    await expect(page.getByTestId("account-row-acct-2")).toBeVisible();
  });

  test("shows account details in table", async ({ page }) => {
    const row = page.getByTestId("account-row-acct-1");
    await expect(row).toContainText("Chequing");
    await expect(row).toContainText("TD Bank");
  });

  test("opens add account form", async ({ page }) => {
    await page.getByTestId("accounts-add-btn").click();
    await expect(page.getByTestId("account-form-name")).toBeVisible();
  });

  test("creates a new account", async ({ page }) => {
    await page.getByTestId("accounts-add-btn").click();
    await page.getByTestId("account-form-name").fill("Savings");
    await page.getByTestId("account-form-institution").fill("RBC");
    await page.getByTestId("account-form-type").selectOption("savings");
    await page.getByTestId("account-form-submit").click();
    // Modal should close after submit
    await expect(page.getByTestId("account-form-name")).not.toBeVisible();
  });

  test("opens edit form with existing data", async ({ page }) => {
    await page.getByTestId("account-edit-acct-1").click();
    await expect(page.getByTestId("account-form-name")).toHaveValue("Chequing");
  });

  test("shows delete confirmation and deletes", async ({ page }) => {
    await page.getByTestId("account-delete-acct-1").click();
    await expect(page.getByTestId("modal")).toBeVisible();
    // Confirm deletion
    await page.getByRole("button", { name: /delete|confirm|yes/i }).click();
    await expect(page.getByTestId("modal")).not.toBeVisible();
  });
});
```

**Step 2: Run and commit**

```bash
npx playwright test e2e/specs/accounts.spec.ts
git add e2e/specs/accounts.spec.ts
git commit -m "test(e2e): add Accounts page tests"
```

---

### Task 9: Categories Page Tests

**Files:**
- Create: `e2e/specs/categories.spec.ts`

**Required testids on CategoriesPage.tsx:**
- `data-testid="categories-add-btn"` — add category button
- `data-testid="categories-loading"` — loading state
- `data-testid="tag-input"` — tag name input
- `data-testid="tag-add-btn"` — add tag button
- `data-testid="tag-badge-{id}"` — each tag badge
- `data-testid="tag-delete-{id}"` — delete button on tag

**Required testids on CategoryList.tsx:**
- `data-testid="category-row-{id}"` — each category row
- `data-testid="category-edit-{id}"` — edit button
- `data-testid="category-delete-{id}"` — delete button

**Required testids on CategoryForm.tsx:**
- `data-testid="category-form-name"` — name input
- `data-testid="category-form-slug"` — slug input
- `data-testid="category-form-direction"` — direction select
- `data-testid="category-form-parent"` — parent select
- `data-testid="category-form-submit"` — submit button

**Step 1: Write specs**

Create `e2e/specs/categories.spec.ts`:

```typescript
import { test, expect } from "../fixtures";

test.describe("Categories Page", () => {
  test.beforeEach(async ({ page, mockPage }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);
    await page.getByTestId("nav-categories").click();
    await page.waitForURL(/\/categories/);
  });

  test("displays categories grouped by direction", async ({ page }) => {
    await expect(page.getByTestId("category-row-cat-income")).toBeVisible();
    await expect(page.getByTestId("category-row-cat-expense")).toBeVisible();
    await expect(page.getByTestId("category-row-cat-groceries")).toBeVisible();
  });

  test("shows child categories indented under parents", async ({ page }) => {
    const groceriesRow = page.getByTestId("category-row-cat-groceries");
    // Child categories show the └ indicator
    await expect(groceriesRow).toContainText("Groceries");
  });

  test("opens add category form", async ({ page }) => {
    await page.getByTestId("categories-add-btn").click();
    await expect(page.getByTestId("category-form-name")).toBeVisible();
  });

  test("auto-generates slug from name", async ({ page }) => {
    await page.getByTestId("categories-add-btn").click();
    await page.getByTestId("category-form-name").fill("Office Supplies");
    await expect(page.getByTestId("category-form-slug")).toHaveValue("office-supplies");
  });

  test("creates a new category", async ({ page }) => {
    await page.getByTestId("categories-add-btn").click();
    await page.getByTestId("category-form-name").fill("Utilities");
    await page.getByTestId("category-form-direction").selectOption("expense");
    await page.getByTestId("category-form-submit").click();
    await expect(page.getByTestId("category-form-name")).not.toBeVisible();
  });

  test("displays tags section", async ({ page }) => {
    await expect(page.getByTestId("tag-badge-tag-1")).toContainText("business");
    await expect(page.getByTestId("tag-badge-tag-2")).toContainText("personal");
  });

  test("adds a new tag", async ({ page }) => {
    await page.getByTestId("tag-input").fill("tax-related");
    await page.getByTestId("tag-add-btn").click();
    // Input should clear after adding
    await expect(page.getByTestId("tag-input")).toHaveValue("");
  });

  test("deletes a tag", async ({ page }) => {
    await page.getByTestId("tag-delete-tag-1").click();
    // Tag should be removed (mock re-fetches, so list refreshes)
  });
});
```

**Step 2: Run and commit**

```bash
npx playwright test e2e/specs/categories.spec.ts
git add e2e/specs/categories.spec.ts
git commit -m "test(e2e): add Categories page tests"
```

---

### Task 10: Transactions Page Tests

**Files:**
- Create: `e2e/specs/transactions.spec.ts`

**Required testids on TransactionsPage.tsx:**
- `data-testid="transactions-count"` — transaction count display
- `data-testid="transactions-load-more"` — load more button
- `data-testid="transactions-loading"` — loading indicator

**Required testids on TransactionFilters.tsx:**
- `data-testid="filter-search"` — search input
- `data-testid="filter-date-from"` — date from input
- `data-testid="filter-date-to"` — date to input
- `data-testid="filter-account"` — account select
- `data-testid="filter-direction"` — direction select
- `data-testid="filter-clear"` — clear filters button

**Required testids on TransactionTable.tsx:**
- `data-testid="txn-row-{id}"` — each transaction row
- `data-testid="txn-select-all"` — select all checkbox
- `data-testid="txn-select-{id}"` — individual checkbox
- `data-testid="txn-bulk-bar"` — bulk action bar
- `data-testid="txn-sort-{field}"` — sortable column headers

**Step 1: Write specs**

Create `e2e/specs/transactions.spec.ts`:

```typescript
import { test, expect } from "../fixtures";

test.describe("Transactions Page", () => {
  test.beforeEach(async ({ page, mockPage }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);
  });

  test("displays transaction list", async ({ page }) => {
    await expect(page.getByTestId("txn-row-txn-1")).toBeVisible();
    await expect(page.getByTestId("txn-row-txn-2")).toBeVisible();
  });

  test("shows transaction details", async ({ page }) => {
    const row = page.getByTestId("txn-row-txn-1");
    await expect(row).toContainText("LOBLAWS #1234");
    await expect(row).toContainText("85.50");
  });

  test("shows transaction count", async ({ page }) => {
    await expect(page.getByTestId("transactions-count")).toContainText("4");
  });

  test("filters by search text", async ({ page }) => {
    await page.getByTestId("filter-search").fill("LOBLAWS");
    // After debounce, list_transactions is re-called with search filter
    // (mock returns same data but the search input should be populated)
    await expect(page.getByTestId("filter-search")).toHaveValue("LOBLAWS");
  });

  test("filters by account", async ({ page }) => {
    await page.getByTestId("filter-account").selectOption("acct-1");
    await expect(page.getByTestId("filter-account")).toHaveValue("acct-1");
  });

  test("clears filters", async ({ page }) => {
    await page.getByTestId("filter-search").fill("test");
    await page.getByTestId("filter-clear").click();
    await expect(page.getByTestId("filter-search")).toHaveValue("");
  });

  test("select all checkbox enables bulk bar", async ({ page }) => {
    await page.getByTestId("txn-select-all").check();
    await expect(page.getByTestId("txn-bulk-bar")).toBeVisible();
  });

  test("individual checkbox selection", async ({ page }) => {
    await page.getByTestId("txn-select-txn-1").check();
    await expect(page.getByTestId("txn-bulk-bar")).toBeVisible();
  });

  test("sort by date column", async ({ page }) => {
    await page.getByTestId("txn-sort-date").click();
    // Sort indicator should change
    await expect(page.getByTestId("txn-sort-date")).toBeVisible();
  });

  test("sort by amount column", async ({ page }) => {
    await page.getByTestId("txn-sort-amount").click();
    await expect(page.getByTestId("txn-sort-amount")).toBeVisible();
  });
});
```

**Step 2: Run and commit**

```bash
npx playwright test e2e/specs/transactions.spec.ts
git add e2e/specs/transactions.spec.ts
git commit -m "test(e2e): add Transactions page tests"
```

---

### Task 11: Import Page Tests

**Files:**
- Create: `e2e/specs/import.spec.ts`

**Required testids on ImportPage.tsx:**
- `data-testid="import-step-indicator"` — step display
- `data-testid="import-error"` — error message

**Required testids on FileSelector.tsx:**
- `data-testid="import-account-select"` — account dropdown
- `data-testid="import-file-btn"` — choose file button

**Required testids on CsvMappingStep.tsx:**
- `data-testid="csv-preview-table"` — preview table
- `data-testid="csv-date-col"` — date column select
- `data-testid="csv-amount-col"` — amount column select
- `data-testid="csv-desc-col"` — description column select
- `data-testid="csv-date-format"` — date format select
- `data-testid="csv-submit"` — continue button

**Required testids on ImportPreviewStep.tsx:**
- `data-testid="preview-new-count"` — new transaction count
- `data-testid="preview-dup-count"` — duplicate count
- `data-testid="preview-import-btn"` — import button
- `data-testid="preview-cancel-btn"` — cancel button

**Required testids on ImportResultStep.tsx:**
- `data-testid="result-imported-count"` — imported count
- `data-testid="result-import-another"` — import another button
- `data-testid="result-view-transactions"` — view transactions link

**Step 1: Write specs**

Create `e2e/specs/import.spec.ts`:

```typescript
import { test, expect } from "../fixtures";

test.describe("Import Page", () => {
  test.beforeEach(async ({ page, mockPage }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);
    await page.getByTestId("nav-import").click();
    await page.waitForURL(/\/import/);
  });

  test("shows file selector with account dropdown", async ({ page }) => {
    await expect(page.getByTestId("import-account-select")).toBeVisible();
    await expect(page.getByTestId("import-file-btn")).toBeVisible();
  });

  test("account dropdown lists available accounts", async ({ page }) => {
    const select = page.getByTestId("import-account-select");
    await expect(select).toContainText("Chequing");
    await expect(select).toContainText("Visa");
  });

  test("CSV mapping step shows after file selection", async ({ page, mockPage: _ }) => {
    // Simulate file selection by mocking the dialog plugin to return a path
    // and fs plugin to return CSV content. The FileSelector calls these internally.
    // Since we pre-mocked these in default handlers, we trigger via the file button.
    await page.getByTestId("import-account-select").selectOption("acct-1");
    await page.getByTestId("import-file-btn").click();

    // After file is "selected" via mock dialog, CSV mapping step should appear
    await expect(page.getByTestId("csv-preview-table")).toBeVisible();
  });

  test("CSV mapping step shows column dropdowns", async ({ page }) => {
    await page.getByTestId("import-account-select").selectOption("acct-1");
    await page.getByTestId("import-file-btn").click();
    await page.waitForSelector('[data-testid="csv-date-col"]');

    await expect(page.getByTestId("csv-date-col")).toBeVisible();
    await expect(page.getByTestId("csv-amount-col")).toBeVisible();
    await expect(page.getByTestId("csv-desc-col")).toBeVisible();
    await expect(page.getByTestId("csv-date-format")).toBeVisible();
  });

  test("preview step shows transaction count", async ({ page }) => {
    // Fast-forward to preview step
    await page.getByTestId("import-account-select").selectOption("acct-1");
    await page.getByTestId("import-file-btn").click();
    await page.waitForSelector('[data-testid="csv-date-col"]');

    await page.getByTestId("csv-date-col").selectOption("Date");
    await page.getByTestId("csv-amount-col").selectOption("Amount");
    await page.getByTestId("csv-desc-col").selectOption("Description");
    await page.getByTestId("csv-submit").click();

    await expect(page.getByTestId("preview-new-count")).toContainText("2");
  });

  test("import result shows success", async ({ page }) => {
    // Fast-forward through all steps
    await page.getByTestId("import-account-select").selectOption("acct-1");
    await page.getByTestId("import-file-btn").click();
    await page.waitForSelector('[data-testid="csv-date-col"]');

    await page.getByTestId("csv-date-col").selectOption("Date");
    await page.getByTestId("csv-amount-col").selectOption("Amount");
    await page.getByTestId("csv-desc-col").selectOption("Description");
    await page.getByTestId("csv-submit").click();
    await page.waitForSelector('[data-testid="preview-import-btn"]');

    await page.getByTestId("preview-import-btn").click();

    await expect(page.getByTestId("result-imported-count")).toContainText("2");
    await expect(page.getByTestId("result-import-another")).toBeVisible();
    await expect(page.getByTestId("result-view-transactions")).toBeVisible();
  });
});
```

**Step 2: Run and commit**

```bash
npx playwright test e2e/specs/import.spec.ts
git add e2e/specs/import.spec.ts
git commit -m "test(e2e): add Import page tests"
```

---

### Task 12: Categorize Page Tests

**Files:**
- Create: `e2e/specs/categorize.spec.ts`

**Required testids on CategorizePage.tsx:**
- `data-testid="categorize-account-filter"` — account filter dropdown
- `data-testid="categorize-loading"` — loading state

**Required testids on UncategorizedGroupList.tsx:**
- `data-testid="group-row-{normalizedName}"` — each group row (use slugified normalized_name)
- `data-testid="group-categorize-{normalizedName}"` — categorize button
- `data-testid="group-drilldown-{normalizedName}"` — drill down button
- `data-testid="group-sort-name"` — sort by name header
- `data-testid="group-sort-count"` — sort by count header
- `data-testid="group-sort-total"` — sort by total header

**Required testids on GroupCategorizeDialog.tsx:**
- `data-testid="group-dialog"` — dialog container
- `data-testid="group-dialog-confirm"` — confirm button
- `data-testid="group-dialog-match-type"` — match type select

**Required testids on GroupDrillDown.tsx:**
- `data-testid="drilldown-back"` — back button
- `data-testid="drilldown-select-all"` — select all checkbox
- `data-testid="drilldown-assign-btn"` — assign category button
- `data-testid="drilldown-create-rule"` — create rule checkbox

**Step 1: Write specs**

Create `e2e/specs/categorize.spec.ts`:

```typescript
import { test, expect } from "../fixtures";

test.describe("Categorize Page", () => {
  test.beforeEach(async ({ page, mockPage }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);
    await page.getByTestId("nav-categorize").click();
    await page.waitForURL(/\/categorize/);
  });

  test("displays uncategorized groups", async ({ page }) => {
    await expect(page.getByTestId("group-row-uncategorized-store")).toBeVisible();
    await expect(page.getByTestId("group-row-coffee-shop")).toBeVisible();
    await expect(page.getByTestId("group-row-online-purchase")).toBeVisible();
  });

  test("shows group details", async ({ page }) => {
    const row = page.getByTestId("group-row-uncategorized-store");
    await expect(row).toContainText("UNCATEGORIZED STORE");
    await expect(row).toContainText("5"); // transaction_count
  });

  test("filters by account", async ({ page }) => {
    await page.getByTestId("categorize-account-filter").selectOption("acct-1");
    await expect(page.getByTestId("categorize-account-filter")).toHaveValue("acct-1");
  });

  test("opens categorize dialog", async ({ page }) => {
    await page.getByTestId("group-categorize-uncategorized-store").click();
    await expect(page.getByTestId("group-dialog")).toBeVisible();
  });

  test("drill down shows individual transactions", async ({ page }) => {
    await page.getByTestId("group-drilldown-uncategorized-store").click();
    await expect(page.getByTestId("drilldown-back")).toBeVisible();
    await expect(page.getByTestId("drilldown-select-all")).toBeVisible();
  });

  test("drill down back button returns to group list", async ({ page }) => {
    await page.getByTestId("group-drilldown-uncategorized-store").click();
    await page.getByTestId("drilldown-back").click();
    await expect(page.getByTestId("group-row-uncategorized-store")).toBeVisible();
  });

  test("sort groups by count", async ({ page }) => {
    await page.getByTestId("group-sort-count").click();
    // Sort should toggle
    await expect(page.getByTestId("group-sort-count")).toBeVisible();
  });

  test("categorize badge shows count in nav", async ({ page }) => {
    await expect(page.getByTestId("nav-categorize-badge")).toContainText("3");
  });
});
```

**Step 2: Run and commit**

```bash
npx playwright test e2e/specs/categorize.spec.ts
git add e2e/specs/categorize.spec.ts
git commit -m "test(e2e): add Categorize page tests"
```

---

### Task 13: Rules Page Tests

**Files:**
- Create: `e2e/specs/rules.spec.ts`

**Required testids on RulesPage.tsx:**
- `data-testid="rules-add-btn"` — add rule button
- `data-testid="rules-reapply-btn"` — reapply all rules button
- `data-testid="rules-loading"` — loading state
- `data-testid="rules-empty"` — empty state message
- `data-testid="rules-reapply-success"` — success message after reapply
- `data-testid="rule-row-{id}"` — each rule row
- `data-testid="rule-edit-{id}"` — edit button
- `data-testid="rule-delete-{id}"` — delete button
- `data-testid="rule-sort-{field}"` — sortable column headers

**Required testids on RuleForm (inline in RulesPage or separate component):**
- `data-testid="rule-form-pattern"` — pattern input
- `data-testid="rule-form-field"` — match field select
- `data-testid="rule-form-type"` — match type select
- `data-testid="rule-form-priority"` — priority input
- `data-testid="rule-form-auto-apply"` — auto-apply checkbox
- `data-testid="rule-form-submit"` — submit button

**Step 1: Write specs**

Create `e2e/specs/rules.spec.ts`:

```typescript
import { test, expect } from "../fixtures";

test.describe("Rules Page", () => {
  test.beforeEach(async ({ page, mockPage }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);
    await page.getByTestId("nav-rules").click();
    await page.waitForURL(/\/rules/);
  });

  test("displays rules list", async ({ page }) => {
    await expect(page.getByTestId("rule-row-rule-1")).toBeVisible();
    await expect(page.getByTestId("rule-row-rule-2")).toBeVisible();
  });

  test("shows rule details", async ({ page }) => {
    const row = page.getByTestId("rule-row-rule-1");
    await expect(row).toContainText("LOBLAWS");
    await expect(row).toContainText("contains");
  });

  test("opens add rule form", async ({ page }) => {
    await page.getByTestId("rules-add-btn").click();
    await expect(page.getByTestId("rule-form-pattern")).toBeVisible();
  });

  test("creates a new rule", async ({ page }) => {
    await page.getByTestId("rules-add-btn").click();
    await page.getByTestId("rule-form-pattern").fill("STARBUCKS");
    await page.getByTestId("rule-form-field").selectOption("description");
    await page.getByTestId("rule-form-type").selectOption("contains");
    await page.getByTestId("rule-form-submit").click();
    await expect(page.getByTestId("rule-form-pattern")).not.toBeVisible();
  });

  test("edits existing rule", async ({ page }) => {
    await page.getByTestId("rule-edit-rule-1").click();
    await expect(page.getByTestId("rule-form-pattern")).toHaveValue("LOBLAWS");
  });

  test("deletes a rule with confirmation", async ({ page }) => {
    await page.getByTestId("rule-delete-rule-1").click();
    await expect(page.getByTestId("modal")).toBeVisible();
    await page.getByRole("button", { name: /delete|confirm|yes/i }).click();
    await expect(page.getByTestId("modal")).not.toBeVisible();
  });

  test("reapply all rules shows success", async ({ page }) => {
    await page.getByTestId("rules-reapply-btn").click();
    await expect(page.getByTestId("rules-reapply-success")).toBeVisible();
  });

  test("sort by priority", async ({ page }) => {
    await page.getByTestId("rule-sort-priority").click();
    await expect(page.getByTestId("rule-sort-priority")).toBeVisible();
  });

  test("shows empty state when no rules", async ({ page, mockPage }) => {
    // Re-navigate with empty rules
    await mockPage("/unlock", {
      list_categorization_rules: () => [],
    });
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);
    await page.getByTestId("nav-rules").click();
    await page.waitForURL(/\/rules/);
    await expect(page.getByTestId("rules-empty")).toBeVisible();
  });
});
```

**Step 2: Run and commit**

```bash
npx playwright test e2e/specs/rules.spec.ts
git add e2e/specs/rules.spec.ts
git commit -m "test(e2e): add Rules page tests"
```

---

### Task 14: Tax Page Tests

**Files:**
- Create: `e2e/specs/tax.spec.ts`

**Required testids on TaxPage.tsx:**
- `data-testid="tax-year-select"` — fiscal year dropdown
- `data-testid="tax-tab-expense"` — expense tab
- `data-testid="tax-tab-income"` — income tab
- `data-testid="tax-add-item-btn"` — add item button
- `data-testid="tax-proration-btn"` — proration settings button
- `data-testid="tax-info-btn"` — tax info button
- `data-testid="tax-item-count"` — item count display
- `data-testid="tax-empty"` — empty state
- `data-testid="tax-annual-summary"` — annual summary table

**Required testids on TaxLineItemForm.tsx:**
- `data-testid="tax-form-date"` — date input
- `data-testid="tax-form-description"` — description input
- `data-testid="tax-form-amount"` — amount input
- `data-testid="tax-form-notes"` — notes textarea
- `data-testid="tax-form-submit"` — submit button

**Required testids on ProrationSettingsModal.tsx:**
- `data-testid="proration-vehicle-total"` — vehicle total km input
- `data-testid="proration-vehicle-business"` — vehicle business km input
- `data-testid="proration-home-total"` — home total sqft input
- `data-testid="proration-home-office"` — home office sqft input
- `data-testid="proration-save"` — save button

**Required testids on TaxInfoPanel.tsx:**
- `data-testid="tax-info-panel"` — panel container

**Step 1: Write specs**

Create `e2e/specs/tax.spec.ts`:

```typescript
import { test, expect } from "../fixtures";

test.describe("Tax Page", () => {
  test.beforeEach(async ({ page, mockPage }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);
    await page.getByTestId("nav-tax").click();
    await page.waitForURL(/\/tax/);
  });

  test("displays fiscal year selector", async ({ page }) => {
    await expect(page.getByTestId("tax-year-select")).toBeVisible();
  });

  test("shows expense and income tabs", async ({ page }) => {
    await expect(page.getByTestId("tax-tab-expense")).toBeVisible();
    await expect(page.getByTestId("tax-tab-income")).toBeVisible();
  });

  test("displays workspace items", async ({ page }) => {
    await expect(page.getByTestId("tax-item-count")).toBeVisible();
  });

  test("switches between expense and income tabs", async ({ page }) => {
    await page.getByTestId("tax-tab-income").click();
    // Tab should be active
    await expect(page.getByTestId("tax-tab-income")).toBeVisible();
  });

  test("opens add item form", async ({ page }) => {
    await page.getByTestId("tax-add-item-btn").click();
    await expect(page.getByTestId("tax-form-date")).toBeVisible();
    await expect(page.getByTestId("tax-form-description")).toBeVisible();
    await expect(page.getByTestId("tax-form-amount")).toBeVisible();
  });

  test("creates a new tax line item", async ({ page }) => {
    await page.getByTestId("tax-add-item-btn").click();
    await page.getByTestId("tax-form-date").fill("2025-07-01");
    await page.getByTestId("tax-form-description").fill("Business lunch");
    await page.getByTestId("tax-form-amount").fill("35.00");
    await page.getByTestId("tax-form-submit").click();
    await expect(page.getByTestId("tax-form-date")).not.toBeVisible();
  });

  test("opens proration settings", async ({ page }) => {
    await page.getByTestId("tax-proration-btn").click();
    await expect(page.getByTestId("proration-vehicle-total")).toBeVisible();
    await expect(page.getByTestId("proration-home-total")).toBeVisible();
  });

  test("proration settings show existing values", async ({ page }) => {
    await page.getByTestId("tax-proration-btn").click();
    await expect(page.getByTestId("proration-vehicle-total")).toHaveValue("20000");
    await expect(page.getByTestId("proration-vehicle-business")).toHaveValue("8000");
    await expect(page.getByTestId("proration-home-total")).toHaveValue("1200");
    await expect(page.getByTestId("proration-home-office")).toHaveValue("150");
  });

  test("saves proration settings", async ({ page }) => {
    await page.getByTestId("tax-proration-btn").click();
    await page.getByTestId("proration-vehicle-total").fill("25000");
    await page.getByTestId("proration-save").click();
    await expect(page.getByTestId("proration-vehicle-total")).not.toBeVisible();
  });

  test("opens tax info panel", async ({ page }) => {
    await page.getByTestId("tax-info-btn").click();
    await expect(page.getByTestId("tax-info-panel")).toBeVisible();
  });

  test("shows empty state when no items", async ({ page, mockPage }) => {
    await mockPage("/unlock", {
      get_tax_workspace_items: () => [],
    });
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);
    await page.getByTestId("nav-tax").click();
    await page.waitForURL(/\/tax/);
    await expect(page.getByTestId("tax-empty")).toBeVisible();
  });
});
```

**Step 2: Run and commit**

```bash
npx playwright test e2e/specs/tax.spec.ts
git add e2e/specs/tax.spec.ts
git commit -m "test(e2e): add Tax page tests"
```

---

### Task 15: Navigation Smoke Tests

**Files:**
- Create: `e2e/specs/navigation.spec.ts`

Tests that every nav link works and the Layout guards unauthenticated access.

**Step 1: Write specs**

Create `e2e/specs/navigation.spec.ts`:

```typescript
import { test, expect } from "../fixtures";

test.describe("Navigation", () => {
  test("redirects to /unlock when database is locked", async ({ page, mockPage }) => {
    await mockPage("/transactions");
    // Layout checks isUnlocked and redirects
    await expect(page).toHaveURL(/\/unlock/);
  });

  test("all nav links navigate correctly", async ({ page, mockPage }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);

    const navLinks = [
      { testid: "nav-dashboard", url: /\/dashboard/ },
      { testid: "nav-transactions", url: /\/transactions/ },
      { testid: "nav-categorize", url: /\/categorize/ },
      { testid: "nav-import", url: /\/import/ },
      { testid: "nav-accounts", url: /\/accounts/ },
      { testid: "nav-categories", url: /\/categories/ },
      { testid: "nav-rules", url: /\/rules/ },
      { testid: "nav-tax", url: /\/tax/ },
    ];

    for (const { testid, url } of navLinks) {
      await page.getByTestId(testid).click();
      await expect(page).toHaveURL(url);
    }
  });

  test("sidebar is visible on all pages", async ({ page, mockPage }) => {
    await mockPage("/unlock");
    await page.getByTestId("unlock-password").fill("pass");
    await page.getByTestId("unlock-submit").click();
    await page.waitForURL(/\/transactions/);
    await expect(page.getByTestId("sidebar")).toBeVisible();
  });
});
```

**Step 2: Run and commit**

```bash
npx playwright test e2e/specs/navigation.spec.ts
git add e2e/specs/navigation.spec.ts
git commit -m "test(e2e): add navigation smoke tests"
```

---

### Task 16: Final Integration — Run All Tests

**Step 1: Run full suite**

```bash
make format
make test-ts
npx playwright test
```

**Step 2: Fix any failures**

Iterate on failing tests. Common issues:
- Testid typos — verify the attribute in the component matches the spec
- Mock handler returning wrong shape — TypeScript compilation should catch most of these
- Timing — add `waitForSelector` or `waitForURL` as needed

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore(e2e): finalize Playwright test suite"
```
