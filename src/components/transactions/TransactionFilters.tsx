import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type {
  TransactionFilters as Filters,
  Account,
  Category,
  Transaction,
} from "../../lib/types";

interface TransactionFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
}

export default function TransactionFilters({
  filters,
  onFiltersChange,
  accounts,
  categories,
  transactions,
}: TransactionFiltersProps) {
  const [searchText, setSearchText] = useState(filters.search ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateFilters = useCallback(
    (patch: Partial<Filters>) => {
      onFiltersChange({ ...filters, ...patch, offset: 0 });
    },
    [filters, onFiltersChange],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilters({ search: searchText || undefined });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // Only fire on searchText changes, not on updateFilters identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  function clearFilters() {
    setSearchText("");
    onFiltersChange({ limit: 50, offset: 0 });
  }

  const usedCategories = useMemo(() => {
    const usedCategoryIds = new Set(
      transactions
        .map((t) => t.category_id)
        .filter((id): id is string => id !== null),
    );
    return categories.filter((c) => {
      if (usedCategoryIds.has(c.id)) return true;
      return categories.some(
        (child) => child.parent_id === c.id && usedCategoryIds.has(child.id),
      );
    });
  }, [transactions, categories]);

  const hasFilters =
    !!filters.search ||
    !!filters.account_id ||
    !!filters.category_id ||
    !!filters.direction ||
    !!filters.date_from ||
    !!filters.date_to ||
    filters.amount_min != null ||
    filters.amount_max != null ||
    filters.is_recurring === true ||
    filters.uncategorized_only === true;

  const inputClass =
    "px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const selectClass = inputClass;

  return (
    <div className="flex flex-wrap items-end gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
      <div className="flex flex-col">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Search
        </label>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Description or payee..."
          className={`${inputClass} w-52`}
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          From
        </label>
        <input
          type="date"
          value={filters.date_from ?? ""}
          onChange={(e) =>
            updateFilters({ date_from: e.target.value || undefined })
          }
          className={inputClass}
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          To
        </label>
        <input
          type="date"
          value={filters.date_to ?? ""}
          onChange={(e) =>
            updateFilters({ date_to: e.target.value || undefined })
          }
          className={inputClass}
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Min $
        </label>
        <input
          type="number"
          placeholder="Min $"
          value={filters.amount_min ?? ""}
          onChange={(e) =>
            updateFilters({
              amount_min: e.target.value
                ? parseFloat(e.target.value)
                : undefined,
            })
          }
          step="0.01"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Max $
        </label>
        <input
          type="number"
          placeholder="Max $"
          value={filters.amount_max ?? ""}
          onChange={(e) =>
            updateFilters({
              amount_max: e.target.value
                ? parseFloat(e.target.value)
                : undefined,
            })
          }
          step="0.01"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Account
        </label>
        <select
          value={filters.account_id ?? ""}
          onChange={(e) =>
            updateFilters({ account_id: e.target.value || undefined })
          }
          className={selectClass}
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Direction
        </label>
        <select
          value={filters.direction ?? ""}
          onChange={(e) =>
            updateFilters({ direction: e.target.value || undefined })
          }
          className={selectClass}
        >
          <option value="">All</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="transfer">Transfer</option>
          <option value="adjustment">Adjustment</option>
        </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Category
        </label>
        <select
          value={filters.category_id ?? ""}
          onChange={(e) =>
            updateFilters({ category_id: e.target.value || undefined })
          }
          className={selectClass}
        >
          <option value="">All categories</option>
          {usedCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-1.5 text-sm cursor-pointer pb-1">
        <input
          type="checkbox"
          checked={filters.is_recurring === true}
          onChange={(e) =>
            updateFilters({ is_recurring: e.target.checked || undefined })
          }
          className="rounded border-gray-300 dark:border-gray-600"
        />
        Recurring
      </label>

      <label className="flex items-center gap-1.5 text-sm cursor-pointer pb-1">
        <input
          type="checkbox"
          checked={filters.uncategorized_only === true}
          onChange={(e) =>
            updateFilters({
              uncategorized_only: e.target.checked || undefined,
            })
          }
          className="rounded border-gray-300 dark:border-gray-600"
        />
        Uncategorized
      </label>

      {hasFilters && (
        <button
          onClick={clearFilters}
          className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-0"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
