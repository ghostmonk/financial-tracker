import { useState } from "react";
import type { Transaction, Account, Category } from "../../lib/types";
import { updateTransaction, updateTransactionsCategory } from "../../lib/tauri";
import { formatAmount } from "../../lib/utils";
import { btnClass } from "../../lib/styles";
import { Th, Td } from "../shared/Table";
import CategorySelect from "./CategorySelect";

type SortField = "date" | "description" | "merchant" | "payee" | "amount" | "category" | "account";
type SortDir = "asc" | "desc";

interface TransactionTableProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  hasMore: boolean;
  onLoadMore: () => void;
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
  hasMore,
  onLoadMore,
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

  const sortField = propSortField ?? localSortField;
  const sortDir = propSortDir ?? localSortDir;
  const serverSorted = !!onSortChange;

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

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

  async function handleCategoryChange(txId: string, categoryId: string | null) {
    setEditingCategoryId(null);
    try {
      await updateTransaction(txId, { category_id: categoryId });
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
        <div className="flex items-center gap-3 p-2 mb-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md text-sm">
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
                  type="checkbox"
                  checked={
                    sorted.length > 0 && selectedIds.size === sorted.length
                  }
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
              </Th>
              <Th className="cursor-pointer select-none" onClick={() => toggleSort("date")}>
                Date{sortIndicator("date")}
              </Th>
              <Th className="cursor-pointer select-none" onClick={() => toggleSort("description")}>
                Description{sortIndicator("description")}
              </Th>
              <Th className="cursor-pointer select-none" onClick={() => toggleSort("merchant")}>
                Merchant{sortIndicator("merchant")}
              </Th>
              <Th className="cursor-pointer select-none" onClick={() => toggleSort("payee")}>
                Payee{sortIndicator("payee")}
              </Th>
              <Th align="right" className="cursor-pointer select-none" onClick={() => toggleSort("amount")}>
                Amount{sortIndicator("amount")}
              </Th>
              <Th className="cursor-pointer select-none" onClick={() => toggleSort("category")}>
                Category{sortIndicator("category")}
              </Th>
              <Th className="cursor-pointer select-none" onClick={() => toggleSort("account")}>
                Account{sortIndicator("account")}
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx) => {
              const cat = tx.category_id
                ? categoryMap.get(tx.category_id)
                : null;
              return (
                <tr
                  key={tx.id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                    selectedIds.has(tx.id)
                      ? "bg-blue-50/50 dark:bg-blue-900/20"
                      : ""
                  }`}
                >
                  <Td>
                    <input
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

      {hasMore && (
        <div className="mt-3 text-center">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className={btnClass}
          >
            {loading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
