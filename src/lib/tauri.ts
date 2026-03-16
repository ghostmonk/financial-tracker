import { invoke } from "@tauri-apps/api/core";
import type {
  Account,
  CreateAccountParams,
  UpdateAccountParams,
  Category,
  CreateCategoryParams,
  UpdateCategoryParams,
  Transaction,
  TransactionFilters,
  TransactionSummary,
  UpdateTransactionParams,
  CsvColumnMapping,
  CsvPreview,
  ParsedTransaction,
  ImportPreview,
  ImportResult,
  CategorizationRule,
  CreateRuleParams,
  UpdateRuleParams,
  UncategorizedGroup,
  Tag,
  CategoryHotkey,
  SetHotkeyParams,
  TaxRules,
  TaxLineItem,
  CreateTaxLineItemParams,
  UpdateTaxLineItemParams,
  FiscalYearSettings,
  UpsertFiscalYearSettingsParams,
  TaxRateConfig,
  TaxWorkspaceItem,
} from "./types";

export type {
  Account,
  CreateAccountParams,
  UpdateAccountParams,
  Category,
  CreateCategoryParams,
  UpdateCategoryParams,
  Transaction,
  TransactionFilters,
  TransactionSummary,
  UpdateTransactionParams,
  CsvColumnMapping,
  CsvPreview,
  ParsedTransaction,
  ImportPreview,
  ImportResult,
  CategorizationRule,
  CreateRuleParams,
  UpdateRuleParams,
  UncategorizedGroup,
  Tag,
  CategoryHotkey,
  SetHotkeyParams,
  TaxRules,
  TaxLineItem,
  CreateTaxLineItemParams,
  UpdateTaxLineItemParams,
  FiscalYearSettings,
  UpsertFiscalYearSettingsParams,
  TaxRateConfig,
  TaxWorkspaceItem,
};

// Database

export async function unlockDatabase(password: string): Promise<void> {
  return invoke("unlock_database", { password });
}

export async function isDatabaseInitialized(): Promise<boolean> {
  return invoke("is_database_initialized");
}

// Accounts

export async function listAccounts(): Promise<Account[]> {
  return invoke("list_accounts");
}

export async function createAccount(
  params: CreateAccountParams,
): Promise<Account> {
  return invoke("create_account", { params });
}

export async function updateAccount(
  id: string,
  params: UpdateAccountParams,
): Promise<Account> {
  return invoke("update_account", { id, params });
}

export async function deleteAccount(id: string): Promise<void> {
  return invoke("delete_account", { id });
}

// Categories

export async function listCategories(): Promise<Category[]> {
  return invoke("list_categories");
}

export async function createCategory(
  params: CreateCategoryParams,
): Promise<Category> {
  return invoke("create_category", { params });
}

export async function updateCategory(
  id: string,
  params: UpdateCategoryParams,
): Promise<Category> {
  return invoke("update_category", { id, params });
}

export async function deleteCategory(id: string): Promise<void> {
  return invoke("delete_category", { id });
}

// Transactions

export async function listTransactions(
  filters: TransactionFilters,
): Promise<Transaction[]> {
  return invoke("list_transactions", { filters });
}

export async function getTransactionSummary(
  filters: TransactionFilters,
): Promise<TransactionSummary> {
  return invoke("get_transaction_summary", { filters });
}

export async function updateTransaction(
  id: string,
  params: UpdateTransactionParams,
): Promise<Transaction> {
  return invoke("update_transaction", { id, params });
}

export async function updateTransactionsCategory(
  ids: string[],
  categoryId: string | null,
): Promise<void> {
  return invoke("update_transactions_category", {
    ids,
    category_id: categoryId,
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  return invoke("delete_transaction", { id });
}

export async function listUsedCategoryIds(): Promise<string[]> {
  return invoke("list_used_category_ids");
}

// Import

export async function previewCsvFile(fileContent: string): Promise<CsvPreview> {
  return invoke("preview_csv_file", { file_content: fileContent });
}

export async function parseAndPreviewCsv(
  fileContent: string,
  mapping: CsvColumnMapping,
  accountId: string,
): Promise<ImportPreview> {
  return invoke("parse_and_preview_csv", {
    file_content: fileContent,
    mapping,
    account_id: accountId,
  });
}

export async function parseAndPreviewOfx(
  fileContent: string,
  accountId: string,
): Promise<ImportPreview> {
  return invoke("parse_and_preview_ofx", {
    file_content: fileContent,
    account_id: accountId,
  });
}

export async function executeImport(
  accountId: string,
  filename: string,
  fileType: string,
  transactions: ParsedTransaction[],
  skipDuplicateFitids: string[],
  skipDuplicateHashes: string[],
): Promise<ImportResult> {
  return invoke("execute_import_command", {
    account_id: accountId,
    filename,
    file_type: fileType,
    transactions,
    skip_duplicate_fitids: skipDuplicateFitids,
    skip_duplicate_hashes: skipDuplicateHashes,
  });
}

// Categorization Rules

export async function listCategorizationRules(): Promise<CategorizationRule[]> {
  return invoke("list_categorization_rules");
}

export async function createCategorizationRule(
  params: CreateRuleParams,
): Promise<CategorizationRule> {
  return invoke("create_categorization_rule", { params });
}

export async function updateCategorizationRule(
  id: string,
  params: UpdateRuleParams,
): Promise<CategorizationRule> {
  return invoke("update_categorization_rule", { id, params });
}

export async function deleteCategorizationRule(id: string): Promise<void> {
  return invoke("delete_categorization_rule", { id });
}

export async function getUncategorizedGroups(
  accountId?: string,
): Promise<UncategorizedGroup[]> {
  return invoke("get_uncategorized_groups", {
    account_id: accountId ?? null,
  });
}

export async function getGroupTransactions(
  normalizedName: string,
  accountId?: string,
): Promise<Transaction[]> {
  return invoke("get_group_transactions", {
    normalized_name: normalizedName,
    account_id: accountId ?? null,
  });
}

export async function countUncategorizedGroups(): Promise<number> {
  return invoke("count_uncategorized_groups");
}

export async function applyRulesToTransactionIds(
  transactionIds: string[],
): Promise<number> {
  return invoke("apply_rules_to_transaction_ids", {
    transaction_ids: transactionIds,
  });
}

export async function applySingleRule(ruleId: string): Promise<number> {
  return invoke("apply_single_rule", { rule_id: ruleId });
}

export async function reapplyAllRules(): Promise<number> {
  return invoke("reapply_all_rules");
}

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

export async function setTransactionTags(
  transactionId: string,
  tagIds: string[],
): Promise<void> {
  return invoke("set_transaction_tags", {
    transaction_id: transactionId,
    tag_ids: tagIds,
  });
}

export async function getTransactionTags(
  transactionId: string,
): Promise<Tag[]> {
  return invoke("get_transaction_tags", {
    transaction_id: transactionId,
  });
}

// Hotkeys

export async function listHotkeys(): Promise<CategoryHotkey[]> {
  return invoke("list_hotkeys");
}

export async function setHotkey(
  params: SetHotkeyParams,
): Promise<CategoryHotkey> {
  return invoke("set_hotkey", { params });
}

export async function removeHotkey(key: string): Promise<void> {
  return invoke("remove_hotkey", { key });
}

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

export async function getTaxRates(
  fiscalYear: number,
): Promise<TaxRateConfig> {
  return invoke("get_tax_rates", { fiscal_year: fiscalYear });
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
