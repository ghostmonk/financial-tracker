export interface Account {
  id: string;
  name: string;
  institution: string | null;
  account_type: string;
  currency: string;
  credit_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAccountParams {
  name: string;
  institution?: string | null;
  account_type: string;
  currency?: string | null;
  credit_limit?: number | null;
}

export interface UpdateAccountParams {
  name?: string;
  institution?: string | null;
  account_type?: string;
  currency?: string;
  credit_limit?: number | null;
}

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

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  payee: string | null;
  merchant: string | null;
  account_id: string;
  category_id: string | null;
  is_recurring: boolean;
  tax_deductible: boolean;
  gst_amount: number | null;
  qst_amount: number | null;
  notes: string | null;
  import_hash: string | null;
  fitid: string | null;
  transaction_type: string | null;
  categorized_by_rule: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionSummary {
  total_count: number;
  total_debit: number;
  total_credit: number;
  parent_category_count: number;
  child_category_count: number;
}

export interface TransactionFilters {
  account_id?: string;
  category_id?: string;
  direction?: string;
  is_recurring?: boolean;
  date_from?: string;
  date_to?: string;
  search?: string;
  uncategorized_only?: boolean;
  amount_min?: number;
  amount_max?: number;
  sort_field?: string;
  sort_dir?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateTransactionParams {
  date?: string;
  amount?: number;
  description?: string;
  payee?: string | null;
  category_id?: string | null;
  is_recurring?: boolean;
  tax_deductible?: boolean;
  gst_amount?: number | null;
  qst_amount?: number | null;
  notes?: string | null;
  transaction_type?: string | null;
}

export interface CsvColumnMapping {
  date_column: string;
  amount_column: string;
  description_column: string;
  payee_column?: string;
  date_format: string;
}

export interface CsvPreview {
  columns: string[];
  rows: string[][];
}

export interface ParsedTransaction {
  date: string;
  amount: number;
  description: string;
  payee: string | null;
  fitid: string | null;
  transaction_type: string | null;
  import_hash: string;
}

export interface ParsedImport {
  account_id_hint: string | null;
  institution_hint: string | null;
  currency: string | null;
  transactions: ParsedTransaction[];
}

export interface ImportPreview {
  parsed: ParsedImport;
  duplicate_fitids: string[];
  duplicate_hashes: string[];
  new_count: number;
  duplicate_count: number;
}

export interface ImportResult {
  imported_count: number;
  skipped_count: number;
  categorized_count: number;
}

export interface CategorizationRule {
  id: string;
  pattern: string;
  match_field: string;
  match_type: string;
  category_id: string;
  account_id: string | null;
  priority: number;
  amount_min: number | null;
  amount_max: number | null;
  auto_apply: boolean;
  created_at: string;
}

export interface CreateRuleParams {
  pattern: string;
  match_field: string;
  match_type: string;
  category_id: string;
  account_id?: string | null;
  priority?: number;
  auto_apply?: boolean;
  amount_min?: number | null;
  amount_max?: number | null;
}

export interface UpdateRuleParams {
  pattern?: string;
  match_field?: string;
  match_type?: string;
  category_id?: string;
  account_id?: string | null;
  priority?: number;
  auto_apply?: boolean;
  amount_min?: number | null;
  amount_max?: number | null;
}

export interface UncategorizedGroup {
  normalized_name: string;
  transaction_count: number;
  total_amount: number;
  sample_description: string;
  account_ids: string[];
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface CategoryHotkey {
  id: string;
  key: string;
  category_id: string;
  created_at: string;
}

export interface SetHotkeyParams {
  key: string;
  category_id: string;
}

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
