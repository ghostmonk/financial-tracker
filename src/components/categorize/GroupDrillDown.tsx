import { useState, useEffect, useCallback } from "react";
import {
  getGroupTransactions,
  updateTransactionsCategory,
  createCategorizationRule,
} from "../../lib/tauri";
import type {
  Transaction,
  Category,
  UncategorizedGroup,
} from "../../lib/types";
import CategorySelect from "../transactions/CategorySelect";

interface GroupDrillDownProps {
  group: UncategorizedGroup;
  categories: Category[];
  accountId?: string;
  onBack: () => void;
  onRefresh: () => void;
}

function formatAmount(amount: number): string {
  const abs = Math.abs(amount).toFixed(2);
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

export default function GroupDrillDown({
  group,
  categories,
  accountId,
  onBack,
  onRefresh,
}: GroupDrillDownProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [categorySelectOpen, setCategorySelectOpen] = useState(false);
  const [createRule, setCreateRule] = useState(false);
  const [matchType, setMatchType] = useState("contains");
  const [ruleAmountMin, setRuleAmountMin] = useState("");
  const [ruleAmountMax, setRuleAmountMax] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const txs = await getGroupTransactions(group.normalized_name, accountId);
      setTransactions(txs);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load transactions",
      );
    } finally {
      setLoading(false);
    }
  }, [group.normalized_name, accountId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const filtered = transactions.filter((tx) => {
    if (
      searchTerm &&
      !tx.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
      return false;
    if (amountMin && Math.abs(tx.amount) < parseFloat(amountMin)) return false;
    if (amountMax && Math.abs(tx.amount) > parseFloat(amountMax)) return false;
    return true;
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (filtered.length > 0 && filtered.every((tx) => selectedIds.has(tx.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((tx) => tx.id)));
    }
  }

  async function handleAssign() {
    if (selectedIds.size === 0 || !selectedCategoryId) return;
    setAssigning(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      await updateTransactionsCategory(ids, selectedCategoryId);

      if (createRule) {
        await createCategorizationRule({
          pattern: group.normalized_name,
          match_field: "description",
          match_type: matchType,
          category_id: selectedCategoryId,
          auto_apply: true,
          amount_min: ruleAmountMin ? parseFloat(ruleAmountMin) : null,
          amount_max: ruleAmountMax ? parseFloat(ruleAmountMax) : null,
        });
      }

      const remaining = transactions.filter((tx) => !selectedIds.has(tx.id));
      setTransactions(remaining);
      setSelectedIds(new Set());
      setSelectedCategoryId(null);
      setCategorySelectOpen(false);
      setCreateRule(false);
      setMatchType("contains");
      setRuleAmountMin("");
      setRuleAmountMax("");
      onRefresh();

      if (remaining.length === 0) {
        onBack();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to assign category",
      );
    } finally {
      setAssigning(false);
    }
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((tx) => selectedIds.has(tx.id));

  const thClass =
    "px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800";
  const tdClass =
    "px-3 py-1.5 text-sm border-b border-gray-100 dark:border-gray-800";
  const inputClass =
    "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          Back
        </button>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {group.normalized_name}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {transactions.length} transaction
            {transactions.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search descriptions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`${inputClass} w-64`}
        />
        <input
          type="number"
          placeholder="Min $"
          value={amountMin}
          onChange={(e) => setAmountMin(e.target.value)}
          className={`${inputClass} w-24`}
          step="0.01"
          min="0"
        />
        <input
          type="number"
          placeholder="Max $"
          value={amountMax}
          onChange={(e) => setAmountMax(e.target.value)}
          className={`${inputClass} w-24`}
          step="0.01"
          min="0"
        />
      </div>

      {/* Bulk assign bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md text-sm">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {selectedIds.size} selected
          </span>
          <div className="relative">
            <button
              onClick={() => setCategorySelectOpen(!categorySelectOpen)}
              className="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
            >
              {selectedCategoryId
                ? (categories.find((c) => c.id === selectedCategoryId)?.name ??
                  "Select category")
                : "Select category"}
            </button>
            {categorySelectOpen && (
              <CategorySelect
                categories={categories}
                value={selectedCategoryId}
                onChange={(catId) => {
                  setSelectedCategoryId(catId);
                  setCategorySelectOpen(false);
                }}
                onClose={() => setCategorySelectOpen(false)}
                inline
              />
            )}
          </div>

          <label className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={createRule}
              onChange={(e) => setCreateRule(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Create rule
          </label>

          {createRule && (
            <>
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value)}
                className={inputClass}
              >
                <option value="contains">Contains</option>
                <option value="starts_with">Starts with</option>
                <option value="exact">Exact match</option>
              </select>
              <input
                type="number"
                placeholder="Rule min $"
                value={ruleAmountMin}
                onChange={(e) => setRuleAmountMin(e.target.value)}
                className={`${inputClass} w-28`}
                step="0.01"
                min="0"
              />
              <input
                type="number"
                placeholder="Rule max $"
                value={ruleAmountMax}
                onChange={(e) => setRuleAmountMax(e.target.value)}
                className={`${inputClass} w-28`}
                step="0.01"
                min="0"
              />
            </>
          )}

          <button
            onClick={handleAssign}
            disabled={!selectedCategoryId || assigning}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assigning ? "Assigning..." : "Assign"}
          </button>
        </div>
      )}

      {/* Transaction table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">
          Loading transactions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium">No transactions found</p>
          <p className="text-sm mt-1">
            {transactions.length > 0
              ? "Try adjusting your filters."
              : "This group has no transactions."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={`${thClass} w-8`}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                </th>
                <th className={thClass}>Date</th>
                <th className={thClass}>Description</th>
                <th className={`${thClass} text-right`}>Amount</th>
                <th className={thClass}>Category</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => {
                const cat = tx.category_id
                  ? categories.find((c) => c.id === tx.category_id)
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
                      className={`${tdClass} max-w-xs text-gray-900 dark:text-gray-100`}
                    >
                      <span className="truncate block" title={tx.description}>
                        {tx.description}
                      </span>
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
                    <td
                      className={`${tdClass} text-gray-500 dark:text-gray-400`}
                    >
                      {cat ? cat.name : "Uncategorized"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
