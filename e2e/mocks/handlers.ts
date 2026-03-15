import type { MockResponseMap } from "./tauri-ipc";
import { factories } from "./factories";

function ok(data: unknown): { data: unknown } {
  return { data };
}

const defaultResponses: MockResponseMap = {
  // Database
  is_database_initialized: ok(true),
  unlock_database: ok(null),

  // Accounts
  list_accounts: ok(factories.accounts.list()),
  create_account: ok(factories.accounts.single()),
  update_account: ok(factories.accounts.single()),
  delete_account: ok(null),

  // Categories
  list_categories: ok(factories.categories.list()),
  create_category: ok(factories.categories.single()),
  update_category: ok(factories.categories.single()),
  delete_category: ok(null),

  // Hotkeys
  list_hotkeys: ok(factories.hotkeys.list()),
  set_hotkey: ok(factories.hotkeys.single()),
  remove_hotkey: ok(null),

  // Transactions
  list_transactions: ok(factories.transactions.list()),
  update_transaction: ok(factories.transactions.single()),
  update_transactions_category: ok(null),
  delete_transaction: ok(null),
  list_used_category_ids: ok(factories.transactions.usedCategoryIds()),
  get_transaction_summary: ok(factories.transactions.summary()),

  // Import
  preview_csv_file: ok(factories.csv.preview()),
  parse_and_preview_csv: ok(factories.import.preview()),
  parse_and_preview_ofx: ok(factories.import.preview()),
  execute_import_command: ok(factories.import.result()),

  // Categorization Rules
  list_categorization_rules: ok(factories.rules.list()),
  create_categorization_rule: ok(factories.rules.single()),
  update_categorization_rule: ok(factories.rules.single()),
  delete_categorization_rule: ok(null),
  get_uncategorized_groups: ok(factories.uncategorizedGroups.list()),
  get_group_transactions: ok(factories.transactions.list()),
  count_uncategorized_groups: ok(factories.uncategorizedGroups.list().length),
  apply_rules_to_transaction_ids: ok(0),
  reapply_all_rules: ok(0),

  // Tags
  list_tags: ok(factories.tags.list()),
  create_tag: ok(factories.tags.single()),
  delete_tag: ok(null),
  set_transaction_tags: ok(null),
  get_transaction_tags: ok(factories.tags.list()),

  // Tax
  get_tax_rules: ok(factories.tax.rules()),
  list_tax_line_items: ok(factories.tax.lineItems()),
  create_tax_line_item_cmd: ok(factories.tax.singleLineItem()),
  update_tax_line_item_cmd: ok(factories.tax.singleLineItem()),
  delete_tax_line_item_cmd: ok(null),
  get_fiscal_year_settings_cmd: ok(factories.tax.fiscalYearSettings()),
  upsert_fiscal_year_settings_cmd: ok(factories.tax.fiscalYearSettings()),
  get_tax_workspace_items: ok(factories.tax.workspaceItems()),
  update_transaction_receipt: ok(null),

  // Plugin commands
  "plugin:dialog|open": ok("/mock/selected/file.csv"),
  "plugin:fs|read_text_file": ok("mock,csv,content\n1,2,3"),
};

/**
 * Returns a complete response map with all Tauri commands covered.
 * Pass `overrides` to replace individual responses for specific test scenarios.
 */
export function createDefaultHandlers(
  overrides?: MockResponseMap,
): MockResponseMap {
  if (!overrides) return { ...defaultResponses };
  return { ...defaultResponses, ...overrides };
}
