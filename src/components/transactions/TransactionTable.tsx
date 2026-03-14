import { useState } from "react";
import type { Transaction, Account, Category } from "../../lib/types";
import { updateTransaction, updateTransactionsCategory } from "../../lib/tauri";
import CategorySelect from "./CategorySelect";

interface TransactionTableProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  hasMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  loading: boolean;
}

type SortField = "date" | "amount";
type SortDir = "asc" | "desc";

function formatAmount(amount: number): string {
  const abs = Math.abs(amount).toFixed(2);
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

export default function TransactionTable({
  transactions,
  accounts,
  categories,
  hasMore,
  onLoadMore,
  onRefresh,
  loading,
}: TransactionTableProps) {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const sorted = [...transactions].sort((a, b) => {
    let cmp: number;
    if (sortField === "date") {
      cmp = a.date.localeCompare(b.date);
    } else {
      cmp = a.amount - b.amount;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "desc");
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

  async function handleBusinessToggle(tx: Transaction) {
    try {
      await updateTransaction(tx.id, { is_business: !tx.is_business });
      onRefresh();
    } catch (err) {
      console.error("Failed to update business flag:", err);
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

  async function handleBulkToggleBusiness() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      for (const id of ids) {
        const tx = transactions.find((t) => t.id === id);
        if (tx) {
          await updateTransaction(id, { is_business: !tx.is_business });
        }
      }
      setSelectedIds(new Set());
      onRefresh();
    } catch (err) {
      console.error("Failed to bulk toggle business:", err);
    }
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

  const thClass =
    "px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800";
  const tdClass =
    "px-3 py-1.5 text-sm border-b border-gray-100 dark:border-gray-800";

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
            onClick={handleBulkToggleBusiness}
            className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            Toggle Business
          </button>
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
              <th className={`${thClass} w-8`}>
                <input
                  type="checkbox"
                  checked={
                    sorted.length > 0 && selectedIds.size === sorted.length
                  }
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
              </th>
              <th
                className={`${thClass} cursor-pointer select-none`}
                onClick={() => toggleSort("date")}
              >
                Date{sortIndicator("date")}
              </th>
              <th className={thClass}>Description</th>
              <th className={thClass}>Payee</th>
              <th
                className={`${thClass} text-right cursor-pointer select-none`}
                onClick={() => toggleSort("amount")}
              >
                Amount{sortIndicator("amount")}
              </th>
              <th className={thClass}>Category</th>
              <th className={`${thClass} text-center`}>Biz</th>
              <th className={thClass}>Account</th>
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
                  className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                    selectedIds.has(tx.id)
                      ? "bg-blue-50/50 dark:bg-blue-900/20"
                      : ""
                  }`}
                >
                  <td className={tdClass}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(tx.id)}
                      onChange={() => toggleSelect(tx.id)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                  </td>
                  <td
                    className={`${tdClass} whitespace-nowrap text-gray-700 dark:text-gray-300`}
                  >
                    {tx.date}
                  </td>
                  <td
                    className={`${tdClass} max-w-xs truncate text-gray-900 dark:text-gray-100`}
                    title={tx.description}
                  >
                    {tx.description}
                  </td>
                  <td
                    className={`${tdClass} max-w-[10rem] truncate text-gray-600 dark:text-gray-400`}
                    title={tx.payee ?? ""}
                  >
                    {tx.payee ?? "--"}
                  </td>
                  <td
                    className={`${tdClass} text-right whitespace-nowrap font-mono tabular-nums ${
                      tx.amount < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-green-600 dark:text-green-400"
                    }`}
                  >
                    {formatAmount(tx.amount)}
                  </td>
                  <td className={`${tdClass} relative`}>
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
                        {cat ? cat.name : "Uncategorized"}
                      </button>
                    )}
                  </td>
                  <td className={`${tdClass} text-center`}>
                    <input
                      type="checkbox"
                      checked={tx.is_business}
                      onChange={() => handleBusinessToggle(tx)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                  </td>
                  <td
                    className={`${tdClass} text-gray-600 dark:text-gray-400 whitespace-nowrap`}
                  >
                    {accountMap.get(tx.account_id) ?? "Unknown"}
                  </td>
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
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
