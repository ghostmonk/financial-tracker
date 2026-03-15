import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getGroupTransactions,
  updateTransactionsCategory,
  createCategorizationRule,
  listHotkeys,
} from "../../lib/tauri";
import type {
  Transaction,
  Category,
  UncategorizedGroup,
  CategoryHotkey,
} from "../../lib/types";
import { formatAmount } from "../../lib/utils";
import {
  inputSmClass,
  btnClass,
  btnPrimaryClass,
  focusedRowClass,
} from "../../lib/styles";
import { Th, Td } from "../shared/Table";
import CategorySelect from "../transactions/CategorySelect";
import { useKeyboardNav } from "../../lib/useKeyboardNav";
import { useUndoStack } from "../../lib/useUndoStack";
import CategoryPickerModal from "../shared/CategoryPickerModal";
import { searchGoogle } from "../../lib/search";

interface GroupDrillDownProps {
  group: UncategorizedGroup;
  categories: Category[];
  accountId?: string;
  onBack: () => void;
  onRefresh: () => void;
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

  type SortField = "date" | "description" | "amount";
  type SortDir = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Hotkey map
  const [hotkeyMap, setHotkeyMap] = useState<Map<string, string>>(new Map());

  // Picker modal state
  const [pickerParentCategory, setPickerParentCategory] = useState<Category | null>(null);
  const [pickerChildCategories, setPickerChildCategories] = useState<Category[]>([]);
  const [pickerTargetIds, setPickerTargetIds] = useState<string[]>([]);

  useEffect(() => {
    listHotkeys()
      .then((hotkeys: CategoryHotkey[]) => {
        const map = new Map<string, string>();
        for (const h of hotkeys) {
          map.set(h.key, h.category_id);
        }
        setHotkeyMap(map);
      })
      .catch(console.error);
  }, []);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function sortIndicator(field: SortField) {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  }

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

  const sortedFiltered = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = a.date.localeCompare(b.date);
          break;
        case "description":
          cmp = a.description.localeCompare(b.description);
          break;
        case "amount":
          cmp = a.amount - b.amount;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filtered, sortField, sortDir]);

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

  const { push: pushUndo } = useUndoStack(fetchTransactions);

  const handleSelectionChange = useCallback(
    (indices: Set<number>) => {
      const ids = new Set<string>();
      for (const idx of indices) {
        if (idx >= 0 && idx < sortedFiltered.length) {
          ids.add(sortedFiltered[idx].id);
        }
      }
      setSelectedIds(ids);
    },
    [sortedFiltered],
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
          : [sortedFiltered[index].id];

      setPickerTargetIds(targetIds);
      setPickerParentCategory(parentCat);
      setPickerChildCategories(children);
    },
    [hotkeyMap, categories, selectedIds, sortedFiltered],
  );

  const handlePickerSelect = useCallback(
    async (selectedCategoryId: string) => {
      const targetIds = pickerTargetIds;
      setPickerParentCategory(null);
      setPickerChildCategories([]);
      setPickerTargetIds([]);

      if (targetIds.length === 0) return;

      const targetTxs = transactions.filter((t) => targetIds.includes(t.id));

      pushUndo({
        transactionIds: targetIds,
        previousCategoryIds: targetTxs.map((t) => t.category_id),
        previousCategorizedByRule: targetTxs.map((t) => t.categorized_by_rule),
        ruleId: null,
        label: `Categorized ${targetIds.length} transaction(s)`,
      });

      await updateTransactionsCategory(targetIds, selectedCategoryId);

      const remaining = transactions.filter((tx) => !targetIds.includes(tx.id));
      setTransactions(remaining);
      setSelectedIds(new Set());
      window.dispatchEvent(new Event("categorization-changed"));
      onRefresh();

      if (remaining.length === 0) {
        onBack();
      }
    },
    [pickerTargetIds, transactions, pushUndo, onRefresh, onBack],
  );

  const { focusedIndex } = useKeyboardNav({
    itemCount: sortedFiltered.length,
    enabled: !categorySelectOpen && !assigning && !pickerParentCategory,
    multiSelect: true,
    onEscape: onBack,
    onSelectionChange: handleSelectionChange,
    onKeyPress: handleHotkeyPress,
  });

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
          account_id: accountId || null,
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
      window.dispatchEvent(new Event("categorization-changed"));
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          data-testid="drilldown-back"
          onClick={onBack}
          className={btnClass}
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
          className={`${inputSmClass} w-64`}
        />
        <input
          type="number"
          placeholder="Min $"
          value={amountMin}
          onChange={(e) => setAmountMin(e.target.value)}
          className={`${inputSmClass} w-24`}
          step="0.01"
          min="0"
        />
        <input
          type="number"
          placeholder="Max $"
          value={amountMax}
          onChange={(e) => setAmountMax(e.target.value)}
          className={`${inputSmClass} w-24`}
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
              data-testid="drilldown-create-rule"
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
                className={inputSmClass}
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
                className={`${inputSmClass} w-28`}
                step="0.01"
                min="0"
              />
              <input
                type="number"
                placeholder="Rule max $"
                value={ruleAmountMax}
                onChange={(e) => setRuleAmountMax(e.target.value)}
                className={`${inputSmClass} w-28`}
                step="0.01"
                min="0"
              />
            </>
          )}

          <button
            data-testid="drilldown-assign-btn"
            onClick={handleAssign}
            disabled={!selectedCategoryId || assigning}
            className={btnPrimaryClass}
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
                <Th className="w-8">
                  <input
                    data-testid="drilldown-select-all"
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                </Th>
                <Th className="cursor-pointer select-none" onClick={() => toggleSort("date")}>Date{sortIndicator("date")}</Th>
                <Th className="cursor-pointer select-none" onClick={() => toggleSort("description")}>Description{sortIndicator("description")}</Th>
                <Th align="right" className="cursor-pointer select-none" onClick={() => toggleSort("amount")}>Amount{sortIndicator("amount")}</Th>
                <Th>Category</Th>
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map((tx, index) => {
                const cat = tx.category_id
                  ? categories.find((c) => c.id === tx.category_id)
                  : null;
                return (
                  <tr
                    key={tx.id}
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
                      </div>
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
                    <Td className="text-gray-500 dark:text-gray-400">
                      {cat ? cat.name : "Uncategorized"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
