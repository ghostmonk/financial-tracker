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
  name: string;
  parent_id: string | null;
  category_type: string;
  is_business_default: boolean;
  sort_order: number;
}

export interface CreateCategoryParams {
  name: string;
  parent_id?: string | null;
  category_type: string;
  is_business_default: boolean;
  sort_order: number;
}

export interface UpdateCategoryParams {
  name?: string;
  parent_id?: string | null;
  category_type?: string;
  is_business_default?: boolean;
  sort_order?: number;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  payee: string | null;
  account_id: string;
  category_id: string | null;
  is_business: boolean;
  tax_deductible: boolean;
  gst_amount: number | null;
  qst_amount: number | null;
  notes: string | null;
  import_hash: string | null;
  fitid: string | null;
  transaction_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionFilters {
  account_id?: string;
  category_id?: string;
  is_business?: boolean;
  date_from?: string;
  date_to?: string;
  search?: string;
  uncategorized_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface UpdateTransactionParams {
  date?: string;
  amount?: number;
  description?: string;
  payee?: string | null;
  category_id?: string | null;
  is_business?: boolean;
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
}
