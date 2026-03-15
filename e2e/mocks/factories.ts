import type {
  Account,
  Category,
  Transaction,
  TransactionSummary,
  CategorizationRule,
  Tag,
  CategoryHotkey,
  UncategorizedGroup,
  CsvPreview,
  ImportPreview,
  ImportResult,
  TaxRules,
  TaxLineItem,
  FiscalYearSettings,
  TaxWorkspaceItem,
} from "../../src/lib/types";

// ---------------------------------------------------------------------------
// Stable IDs
// ---------------------------------------------------------------------------

const IDS = {
  accounts: {
    checking: "acc-checking-001",
    creditCard: "acc-cc-001",
  },
  categories: {
    income: "cat-income-001",
    salary: "cat-salary-001",
    expenses: "cat-expenses-001",
    groceries: "cat-groceries-001",
    rent: "cat-rent-001",
    transfers: "cat-transfers-001",
    officeSupplies: "cat-office-supplies-001",
  },
  transactions: {
    groceryExpense: "txn-001",
    salaryIncome: "txn-002",
    rentExpense: "txn-003",
    uncategorized: "txn-004",
  },
  rules: {
    loblaws: "rule-001",
    rent: "rule-002",
  },
  tags: {
    business: "tag-001",
    personal: "tag-002",
  },
  taxLineItems: {
    officeSupplies: "tli-001",
  },
  taxWorkspace: {
    fromTransaction: "tws-txn-001",
    fromLineItem: "tws-tli-001",
  },
} as const;

// ---------------------------------------------------------------------------
// Default data
// ---------------------------------------------------------------------------

const now = "2026-01-15T12:00:00Z";

const defaultAccounts: Account[] = [
  {
    id: IDS.accounts.checking,
    name: "TD Chequing",
    institution: "TD Bank",
    account_type: "checking",
    currency: "CAD",
    credit_limit: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: IDS.accounts.creditCard,
    name: "TD Visa",
    institution: "TD Bank",
    account_type: "credit_card",
    currency: "CAD",
    credit_limit: 5000,
    created_at: now,
    updated_at: now,
  },
];

const defaultCategories: Category[] = [
  {
    id: IDS.categories.income,
    slug: "income",
    name: "Income",
    parent_id: null,
    direction: "income",
    sort_order: 0,
    created_at: now,
  },
  {
    id: IDS.categories.salary,
    slug: "salary",
    name: "Salary",
    parent_id: IDS.categories.income,
    direction: "income",
    sort_order: 1,
    created_at: now,
  },
  {
    id: IDS.categories.expenses,
    slug: "expenses",
    name: "Expenses",
    parent_id: null,
    direction: "expense",
    sort_order: 2,
    created_at: now,
  },
  {
    id: IDS.categories.groceries,
    slug: "groceries",
    name: "Groceries",
    parent_id: IDS.categories.expenses,
    direction: "expense",
    sort_order: 3,
    created_at: now,
  },
  {
    id: IDS.categories.rent,
    slug: "rent",
    name: "Rent",
    parent_id: IDS.categories.expenses,
    direction: "expense",
    sort_order: 4,
    created_at: now,
  },
  {
    id: IDS.categories.officeSupplies,
    slug: "office-supplies",
    name: "Office Supplies",
    parent_id: IDS.categories.expenses,
    direction: "expense",
    sort_order: 5,
    created_at: now,
  },
  {
    id: IDS.categories.transfers,
    slug: "transfers",
    name: "Transfers",
    parent_id: null,
    direction: "transfer",
    sort_order: 6,
    created_at: now,
  },
];

const defaultTransactions: Transaction[] = [
  {
    id: IDS.transactions.groceryExpense,
    date: "2026-01-10",
    amount: -85.42,
    description: "LOBLAWS #1234",
    payee: null,
    merchant: "Loblaws",
    account_id: IDS.accounts.creditCard,
    category_id: IDS.categories.groceries,
    is_recurring: false,
    tax_deductible: false,
    gst_amount: null,
    qst_amount: null,
    notes: null,
    import_hash: "hash-001",
    fitid: null,
    transaction_type: null,
    categorized_by_rule: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: IDS.transactions.salaryIncome,
    date: "2026-01-15",
    amount: 3200.0,
    description: "EMPLOYER DIRECT DEPOSIT",
    payee: "Employer Inc.",
    merchant: null,
    account_id: IDS.accounts.checking,
    category_id: IDS.categories.salary,
    is_recurring: true,
    tax_deductible: false,
    gst_amount: null,
    qst_amount: null,
    notes: null,
    import_hash: "hash-002",
    fitid: "fitid-002",
    transaction_type: "credit",
    categorized_by_rule: false,
    created_at: now,
    updated_at: now,
  },
  {
    id: IDS.transactions.rentExpense,
    date: "2026-01-01",
    amount: -1500.0,
    description: "RENT PAYMENT",
    payee: null,
    merchant: null,
    account_id: IDS.accounts.checking,
    category_id: IDS.categories.rent,
    is_recurring: true,
    tax_deductible: false,
    gst_amount: null,
    qst_amount: null,
    notes: "Monthly rent",
    import_hash: "hash-003",
    fitid: "fitid-003",
    transaction_type: "debit",
    categorized_by_rule: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: IDS.transactions.uncategorized,
    date: "2026-01-12",
    amount: -23.99,
    description: "UNKNOWN MERCHANT 42",
    payee: null,
    merchant: null,
    account_id: IDS.accounts.creditCard,
    category_id: null,
    is_recurring: false,
    tax_deductible: false,
    gst_amount: null,
    qst_amount: null,
    notes: null,
    import_hash: "hash-004",
    fitid: null,
    transaction_type: null,
    categorized_by_rule: false,
    created_at: now,
    updated_at: now,
  },
];

const defaultRules: CategorizationRule[] = [
  {
    id: IDS.rules.loblaws,
    pattern: "LOBLAWS",
    match_field: "description",
    match_type: "contains",
    category_id: IDS.categories.groceries,
    priority: 10,
    account_id: null,
    amount_min: null,
    amount_max: null,
    auto_apply: true,
    created_at: now,
  },
  {
    id: IDS.rules.rent,
    pattern: "RENT PAYMENT",
    match_field: "description",
    match_type: "exact",
    category_id: IDS.categories.rent,
    priority: 20,
    account_id: null,
    amount_min: null,
    amount_max: null,
    auto_apply: true,
    created_at: now,
  },
];

const defaultTags: Tag[] = [
  {
    id: IDS.tags.business,
    name: "Business",
    slug: "business",
    created_at: now,
  },
  {
    id: IDS.tags.personal,
    name: "Personal",
    slug: "personal",
    created_at: now,
  },
];

const defaultUncategorizedGroups: UncategorizedGroup[] = [
  {
    normalized_name: "unknown merchant 42",
    transaction_count: 3,
    total_amount: -71.97,
    sample_description: "UNKNOWN MERCHANT 42",
    account_ids: [IDS.accounts.creditCard],
  },
  {
    normalized_name: "coffee shop",
    transaction_count: 7,
    total_amount: -42.0,
    sample_description: "COFFEE SHOP #99",
    account_ids: [IDS.accounts.creditCard],
  },
  {
    normalized_name: "gas station",
    transaction_count: 2,
    total_amount: -110.5,
    sample_description: "GAS STATION PETRO",
    account_ids: [IDS.accounts.checking, IDS.accounts.creditCard],
  },
];

const defaultCsvPreview: CsvPreview = {
  columns: ["Date", "Amount", "Description"],
  rows: [
    ["2026-01-10", "-85.42", "LOBLAWS #1234"],
    ["2026-01-12", "-23.99", "UNKNOWN MERCHANT 42"],
    ["2026-01-15", "3200.00", "EMPLOYER DIRECT DEPOSIT"],
  ],
};

const defaultImportPreview: ImportPreview = {
  parsed: {
    account_id_hint: null,
    institution_hint: null,
    currency: "CAD",
    transactions: [
      {
        date: "2026-01-10",
        amount: -85.42,
        description: "LOBLAWS #1234",
        payee: null,
        fitid: null,
        transaction_type: null,
        import_hash: "preview-hash-001",
      },
      {
        date: "2026-01-12",
        amount: -23.99,
        description: "UNKNOWN MERCHANT 42",
        payee: null,
        fitid: null,
        transaction_type: null,
        import_hash: "preview-hash-002",
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

const defaultTaxRules: TaxRules = {
  jurisdiction: "CA-QC",
  fiscal_year_type: "calendar",
  rates: {
    gst: 5.0,
    qst: 9.975,
    meals_deduction_pct: 50.0,
  },
  proration_types: {
    vehicle: {
      label: "Vehicle (km)",
      fields: [
        { key: "vehicle_total_km", label: "Total km driven", unit: "km" },
        {
          key: "vehicle_business_km",
          label: "Business km driven",
          unit: "km",
        },
      ],
      hint: "Business-use percentage based on kilometres driven",
    },
    home_office: {
      label: "Home Office (sqft)",
      fields: [
        { key: "home_total_sqft", label: "Total home area", unit: "sqft" },
        { key: "home_office_sqft", label: "Office area", unit: "sqft" },
      ],
      hint: "Business-use percentage based on dedicated office space",
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
      hint: "Stationery, postage, small supplies",
    },
  ],
  reminders: [
    {
      id: "reminder-001",
      context: "quarterly",
      text: "File GST/QST return by month-end",
    },
  ],
  info_sections: [
    {
      id: "info-001",
      title: "Home Office Deduction",
      body: "Calculate based on square footage used exclusively for business.",
    },
  ],
};

const defaultTaxLineItems: TaxLineItem[] = [
  {
    id: IDS.taxLineItems.officeSupplies,
    date: "2026-01-05",
    description: "Staples - office supplies",
    amount: -45.99,
    category_id: IDS.categories.expenses,
    has_receipt: true,
    receipt_path: "/receipts/staples-jan.pdf",
    notes: "Printer paper and toner",
    fiscal_year: 2026,
    created_at: now,
    updated_at: now,
  },
];

const defaultFiscalYearSettings: FiscalYearSettings = {
  fiscal_year: 2026,
  vehicle_total_km: 20000,
  vehicle_business_km: 8000,
  home_total_sqft: 1200,
  home_office_sqft: 150,
  created_at: now,
  updated_at: now,
};

const defaultTaxWorkspaceItems: TaxWorkspaceItem[] = [
  {
    id: IDS.taxWorkspace.fromTransaction,
    source: "transaction",
    date: "2026-01-10",
    description: "LOBLAWS #1234",
    amount: -85.42,
    category_id: IDS.categories.groceries,
    has_receipt: false,
    receipt_path: null,
    notes: null,
  },
  {
    id: IDS.taxWorkspace.fromLineItem,
    source: "tax_line_item",
    date: "2026-01-05",
    description: "Staples - office supplies",
    amount: -45.99,
    category_id: IDS.categories.expenses,
    has_receipt: true,
    receipt_path: "/receipts/staples-jan.pdf",
    notes: "Printer paper and toner",
  },
];

const defaultHotkeys: CategoryHotkey[] = [
  {
    id: "hk-001",
    key: "e",
    category_id: IDS.categories.expenses,
    created_at: now,
  },
  {
    id: "hk-002",
    key: "i",
    category_id: IDS.categories.income,
    created_at: now,
  },
];

const defaultTransactionSummary: TransactionSummary = {
  total_count: 4,
  total_debit: -1609.41,
  total_credit: 3200.0,
  parent_category_count: 2,
  child_category_count: 3,
};

// ---------------------------------------------------------------------------
// Factory API
// ---------------------------------------------------------------------------

function withOverrides<T>(base: T, overrides?: Partial<T>): T {
  if (!overrides) return structuredClone(base);
  return { ...structuredClone(base), ...overrides };
}

export const factories = {
  accounts: {
    list: (): Account[] => structuredClone(defaultAccounts),
    single: (overrides?: Partial<Account>): Account =>
      withOverrides(defaultAccounts[0], overrides),
  },

  categories: {
    list: (): Category[] => structuredClone(defaultCategories),
    single: (overrides?: Partial<Category>): Category =>
      withOverrides(defaultCategories[0], overrides),
  },

  transactions: {
    list: (): Transaction[] => structuredClone(defaultTransactions),
    single: (overrides?: Partial<Transaction>): Transaction =>
      withOverrides(defaultTransactions[0], overrides),
    summary: (): TransactionSummary =>
      structuredClone(defaultTransactionSummary),
    usedCategoryIds: (): string[] => [
      IDS.categories.groceries,
      IDS.categories.salary,
      IDS.categories.rent,
    ],
  },

  hotkeys: {
    list: (): CategoryHotkey[] => structuredClone(defaultHotkeys),
    single: (overrides?: Partial<CategoryHotkey>): CategoryHotkey =>
      withOverrides(defaultHotkeys[0], overrides),
  },

  rules: {
    list: (): CategorizationRule[] => structuredClone(defaultRules),
    single: (overrides?: Partial<CategorizationRule>): CategorizationRule =>
      withOverrides(defaultRules[0], overrides),
  },

  tags: {
    list: (): Tag[] => structuredClone(defaultTags),
    single: (overrides?: Partial<Tag>): Tag =>
      withOverrides(defaultTags[0], overrides),
  },

  uncategorizedGroups: {
    list: (): UncategorizedGroup[] =>
      structuredClone(defaultUncategorizedGroups),
    single: (overrides?: Partial<UncategorizedGroup>): UncategorizedGroup =>
      withOverrides(defaultUncategorizedGroups[0], overrides),
  },

  csv: {
    preview: (): CsvPreview => structuredClone(defaultCsvPreview),
  },

  import: {
    preview: (): ImportPreview => structuredClone(defaultImportPreview),
    result: (): ImportResult => structuredClone(defaultImportResult),
  },

  tax: {
    rules: (): TaxRules => structuredClone(defaultTaxRules),
    lineItems: (): TaxLineItem[] => structuredClone(defaultTaxLineItems),
    singleLineItem: (overrides?: Partial<TaxLineItem>): TaxLineItem =>
      withOverrides(defaultTaxLineItems[0], overrides),
    fiscalYearSettings: (): FiscalYearSettings =>
      structuredClone(defaultFiscalYearSettings),
    workspaceItems: (): TaxWorkspaceItem[] =>
      structuredClone(defaultTaxWorkspaceItems),
  },
};

export { IDS };
