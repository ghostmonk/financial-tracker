import { useState, useEffect, useCallback } from "react";
import type { Transaction, Account, Category, CategoryHotkey } from "../../lib/types";
import { updateTransaction, updateTransactionsCategory, listHotkeys } from "../../lib/tauri";
import { formatAmount } from "../../lib/utils";
import { focusedRowClass } from "../../lib/styles";
import { Th, Td } from "../shared/Table";
import CategorySelect from "./CategorySelect";
import { useKeyboardNav } from "../../lib/useKeyboardNav";
import { useUndoStack } from "../../lib/useUndoStack";
import CategoryPickerModal from "../shared/CategoryPickerModal";
import { searchGoogle } from "../../lib/search";

type SortField = "date" | "description" | "merchant" | "payee" | "amount" | "category" | "account";
type SortDir = "asc" | "desc";

interface TransactionTableProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  onRefresh: () => void;
  loading: boolean;
  sortField?: SortField;
  sortDir?: SortDir;
  onSortChange?: (field: string, dir: string) => void;
}

export default function TransactionTable({
  transactions,
  accounts,
  categories,
  onRefresh,
  loading,
  sortField: propSortField,
  sortDir: propSortDir,
  onSortChange,
}: TransactionTableProps) {
  const [localSortField, setLocalSortField] = useState<SortField>("date");
  const [localSortDir, setLocalSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [hotkeys, setHotkeys] = useState<CategoryHotkey[]>([]);

  // Picker modal state
  const [pickerParentCategory, setPickerParentCategory] = useState<Category | null>(null);
  const [pickerChildCategories, setPickerChildCategories] = useState<Category[]>([]);
  const [pickerTargetIds, setPickerTargetIds] = useState<string[]>([]);

  const sortField = propSortField ?? localSortField;
  const sortDir = propSortDir ?? localSortDir;
  const serverSorted = !!onSortChange;

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  useEffect(() => {
    listHotkeys().then(setHotkeys).catch(console.error);
  }, []);

  const hotkeyMap = new Map(hotkeys.map((h) => [h.key, h.category_id]));

  const { push: pushUndo } = useUndoStack(onRefresh);

  // When server-side sorting, transactions arrive pre-sorted
  const sorted = serverSorted ? transactions : [...transactions].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "date":
        cmp = a.date.localeCompare(b.date);
        break;
      case "description":
        cmp = a.description.localeCompare(b.description);
        break;
      case "merchant":
        cmp = (a.merchant ?? "").localeCompare(b.merchant ?? "");
        break;
      case "payee":
        cmp = (a.payee ?? "").localeCompare(b.payee ?? "");
        break;
      case "amount":
        cmp = a.amount - b.amount;
        break;
      case "category": {
        const catA = a.category_id ? categoryMap.get(a.category_id)?.name ?? "" : "";
        const catB = b.category_id ? categoryMap.get(b.category_id)?.name ?? "" : "";
        cmp = catA.localeCompare(catB);
        break;
      }
      case "account":
        cmp = (accountMap.get(a.account_id) ?? "").localeCompare(accountMap.get(b.account_id) ?? "");
        break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  function toggleSort(field: SortField) {
    const newDir = sortField === field ? (sortDir === "asc" ? "desc" : "asc") : "desc";
    if (onSortChange) {
      onSortChange(field, newDir);
    } else {
      setLocalSortField(field);
      setLocalSortDir(newDir as SortDir);
    }
  }

  function sortIndicator(field: SortField) {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((t) => t.id)));
    }
  }

  const handleSelectionChange = useCallback(
    (indices: Set<number>) => {
      const ids = new Set<string>();
      for (const idx of indices) {
        if (idx >= 0 && idx < sorted.length) {
          ids.add(sorted[idx].id);
        }
      }
      setSelectedIds(ids);
    },
    [sorted],
  );

  const handleHotkeyPress = useCallback(
    (key: string, shiftKey: boolean, index: number) => {
      const hotkeyKey = shiftKey ? key.toUpperCase() : key.toLowerCase();
      const categoryId = hotkeyMap.get(hotkeyKey);
      if (!categoryId) return;

      const parentCat = categories.find((c) => c.id === categoryId);
      if (!parentCat) return;

      const children = categories.filter((c) => c.parent_id === categoryId);
      const targetIds =
        selectedIds.size > 0
          ? Array.from(selectedIds)
          : [sorted[index].id];

      setPickerTargetIds(targetIds);
      setPickerParentCategory(parentCat);
      setPickerChildCategories(children);
    },
    [hotkeyMap, categories, selectedIds, sorted],
  );

  const handlePickerSelect = useCallback(
    async (selectedCategoryId: string) => {
      const targetIds = pickerTargetIds;
      setPickerParentCategory(null);
      setPickerChildCategories([]);
      setPickerTargetIds([]);

      if (targetIds.length === 0) return;

      const targetTxs = sorted.filter((t) => targetIds.includes(t.id));

      pushUndo({
        transactionIds: targetIds,
        previousCategoryIds: targetTxs.map((t) => t.category_id),
        previousCategorizedByRule: targetTxs.map((t) => t.categorized_by_rule),
        ruleId: null,
        label: `Categorized ${targetIds.length} transaction(s)`,
      });

      await updateTransactionsCategory(targetIds, selectedCategoryId);
      setSelectedIds(new Set());
      window.dispatchEvent(new Event("categorization-changed"));
      onRefresh();
    },
    [pickerTargetIds, sorted, pushUndo, onRefresh],
  );

  const { focusedIndex } = useKeyboardNav({
    itemCount: sorted.length,
    enabled: !editingCategoryId && !bulkCategoryOpen && !pickerParentCategory,
    multiSelect: true,
    onSelectionChange: handleSelectionChange,
    onKeyPress: handleHotkeyPress,
  });

  async function handleCategoryChange(txId: string, categoryId: string | null) {
    setEditingCategoryId(null);
    try {
      await updateTransaction(txId, { category_id: categoryId });
      window.dispatchEvent(new Event("categorization-changed"));
      onRefresh();
    } catch (err) {
      console.error("Failed to update category:", err);
    }
  }

  async function handleBulkCategory(categoryId: string | null) {
    setBulkCategoryOpen(false);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await updateTransactionsCategory(ids, categoryId);
      setSelectedIds(new Set());
      window.dispatchEvent(new Event("categorization-changed"));
      onRefresh();
    } catch (err) {
      console.error("Failed to bulk update categories:", err);
    }
  }

  function categoryDisplay(cat: Category | null | undefined): string {
    if (!cat) return "Uncategorized";
    if (cat.parent_id) {
      const parent = categoryMap.get(cat.parent_id);
      if (parent) return `${parent.name} > ${cat.name}`;
    }
    return cat.name;
  }

  if (transactions.length === 0 && !loading) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium">No transactions found</p>
        <p className="text-sm mt-1">
          Try adjusting your filters or import some transactions.
        </p>
      </div>
    );
  }

  return (
    <div>
      {selectedIds.size > 0 && (
        <div data-testid="txn-bulk-bar" className="flex items-center gap-3 p-2 mb-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md text-sm">
          <span className="font-medium">
            {selectedIds.size} selected
          </span>
          <div className="relative">
            <button
              onClick={() => setBulkCategoryOpen(!bulkCategoryOpen)}
              className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Set Category
            </button>
            {bulkCategoryOpen && (
              <CategorySelect
                categories={categories}
                value={null}
                onChange={handleBulkCategory}
                onClose={() => setBulkCategoryOpen(false)}
                inline
              />
            )}
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs"
          >
            Deselect all
          </button>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
        <table className="min-w-full">
          <thead>
            <tr>
              <Th className="w-8">
                <input
                  data-testid="txn-select-all"
                  type="checkbox"
                  checked={
                    sorted.length > 0 && selectedIds.size === sorted.length
                  }
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
              </Th>
              <Th data-testid="txn-sort-date" className="cursor-pointer select-none" onClick={() => toggleSort("date")}>
                Date{sortIndicator("date")}
              </Th>
              <Th data-testid="txn-sort-description" className="cursor-pointer select-none" onClick={() => toggleSort("description")}>
                Description{sortIndicator("description")}
              </Th>
              <Th data-testid="txn-sort-merchant" className="cursor-pointer select-none" onClick={() => toggleSort("merchant")}>
                Merchant{sortIndicator("merchant")}
              </Th>
              <Th data-testid="txn-sort-payee" className="cursor-pointer select-none" onClick={() => toggleSort("payee")}>
                Payee{sortIndicator("payee")}
              </Th>
              <Th data-testid="txn-sort-amount" align="right" className="cursor-pointer select-none" onClick={() => toggleSort("amount")}>
                Amount{sortIndicator("amount")}
              </Th>
              <Th data-testid="txn-sort-category" className="cursor-pointer select-none" onClick={() => toggleSort("category")}>
                Category{sortIndicator("category")}
              </Th>
              <Th data-testid="txn-sort-account" className="cursor-pointer select-none" onClick={() => toggleSort("account")}>
                Account{sortIndicator("account")}
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx, index) => {
              const cat = tx.category_id
                ? categoryMap.get(tx.category_id)
                : null;
              return (
                <tr
                  key={tx.id}
                  data-testid={`txn-row-${tx.id}`}
                  data-nav-index={index}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                    index === focusedIndex ? focusedRowClass : ""
                  } ${
                    selectedIds.has(tx.id)
                      ? "bg-blue-50/50 dark:bg-blue-900/20"
                      : ""
                  }`}
                >
                  <Td>
                    <input
                      data-testid={`txn-select-${tx.id}`}
                      type="checkbox"
                      checked={selectedIds.has(tx.id)}
                      onChange={() => toggleSelect(tx.id)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                  </Td>
                  <Td className="whitespace-nowrap text-gray-700 dark:text-gray-300">
                    {tx.date}
                  </Td>
                  <Td className="max-w-xs text-gray-900 dark:text-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate" title={tx.description}>
                        {tx.description}
                      </span>
                      <button
                        onClick={() => searchGoogle(tx.description)}
                        className="shrink-0 text-gray-300 dark:text-gray-600 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                        title="Search Google"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {tx.is_recurring && (
                        <span
                          className="shrink-0 text-[10px] px-1.5 py-0 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
                          title="Recurring"
                        >
                          recurring
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td truncate className="text-gray-600 dark:text-gray-400" title={tx.merchant ?? ""}>
                    {tx.merchant ?? "--"}
                  </Td>
                  <Td truncate className="text-gray-600 dark:text-gray-400" title={tx.payee ?? ""}>
                    {tx.payee ?? "--"}
                  </Td>
                  <Td
                    align="right"
                    mono
                    className={`whitespace-nowrap tabular-nums ${
                      tx.amount < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-green-600 dark:text-green-400"
                    }`}
                  >
                    {formatAmount(tx.amount)}
                  </Td>
                  <Td className="relative">
                    {editingCategoryId === tx.id ? (
                      <CategorySelect
                        categories={categories}
                        value={tx.category_id}
                        onChange={(catId) =>
                          handleCategoryChange(tx.id, catId)
                        }
                        onClose={() => setEditingCategoryId(null)}
                        inline
                      />
                    ) : (
                      <button
                        onClick={() => setEditingCategoryId(tx.id)}
                        className={`text-xs px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                          cat
                            ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        {categoryDisplay(cat)}
                      </button>
                    )}
                  </Td>
                  <Td className="text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {accountMap.get(tx.account_id) ?? "Unknown"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CategoryPickerModal
        open={!!pickerParentCategory}
        parentCategory={pickerParentCategory}
        childCategories={pickerChildCategories}
        onSelect={handlePickerSelect}
        onClose={() => {
          setPickerParentCategory(null);
          setPickerChildCategories([]);
          setPickerTargetIds([]);
        }}
      />
    </div>
  );
}
