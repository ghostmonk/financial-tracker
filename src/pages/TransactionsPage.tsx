import { useState, useEffect, useCallback, useRef } from "react";
import {
  listTransactions,
  listAccounts,
  getTransactionSummary,
} from "../lib/tauri";
import type {
  Transaction,
  TransactionFilters as Filters,
  TransactionSummary,
  Account,
} from "../lib/types";
import { useCategoryMap } from "../lib/hooks";
import { formatAmount } from "../lib/utils";
import TransactionFiltersBar from "../components/transactions/TransactionFilters";
import TransactionTable from "../components/transactions/TransactionTable";

const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const { categories } = useCategoryMap();
  const [filters, setFilters] = useState<Filters>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Use a ref for offset to avoid dependency churn in the observer callback
  const offsetRef = useRef(0);

  useEffect(() => {
    listAccounts().then(setAccounts).catch(console.error);
  }, []);

  // Fetch a page of transactions (append mode for infinite scroll)
  const fetchPage = useCallback(
    async (baseFilters: Filters, offset: number, append: boolean) => {
      setLoading(true);
      try {
        const f = { ...baseFilters, limit: PAGE_SIZE, offset };
        const result = await listTransactions(f);
        if (append) {
          setTransactions((prev) => [...prev, ...result]);
        } else {
          setTransactions(result);
        }
        setHasMore(result.length === PAGE_SIZE);
        offsetRef.current = offset + result.length;
      } catch (err) {
        console.error("Failed to fetch transactions:", err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchSummary = useCallback(async (f: Filters) => {
    try {
      const { limit: _, offset: __, ...summaryFilters } = f;
      const result = await getTransactionSummary(summaryFilters as Filters);
      setSummary(result);
    } catch (err) {
      console.error("Failed to fetch summary:", err);
    }
  }, []);

  // Initial load and filter changes — reset to page 0
  useEffect(() => {
    offsetRef.current = 0;
    setTransactions([]);
    setHasMore(true);
    fetchPage(filters, 0, false);
    fetchSummary(filters);
  }, [filters, fetchPage, fetchSummary]);

  function handleFiltersChange(newFilters: Filters) {
    setFilters({ ...newFilters, limit: PAGE_SIZE, offset: 0 });
  }

  function handleRefresh() {
    offsetRef.current = 0;
    setTransactions([]);
    setHasMore(true);
    fetchPage(filters, 0, false);
    fetchSummary(filters);
  }

  // Stable ref to filters for the observer callback
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const loadingRef = useRef(false);
  loadingRef.current = loading;

  const hasMoreRef = useRef(true);
  hasMoreRef.current = hasMore;

  // IntersectionObserver — set up once, uses refs to avoid dependency churn
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMoreRef.current &&
          !loadingRef.current
        ) {
          fetchPage(filtersRef.current, offsetRef.current, true);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Transactions</h1>
          <p
            data-testid="transactions-count"
            className="text-sm text-gray-500 dark:text-gray-400"
          >
            {transactions.length} loaded
            {summary ? ` of ${summary.total_count}` : ""}
          </p>
        </div>
      </div>

      <TransactionFiltersBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        accounts={accounts}
        categories={categories}
      />

      {summary && (
        <div className="flex flex-wrap gap-4 px-3 py-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {summary.total_count}
            </span>{" "}
            transactions
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {summary.parent_category_count}
            </span>{" "}
            parent categories
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {summary.child_category_count}
            </span>{" "}
            child categories
          </span>
          <span className="text-red-600 dark:text-red-400 font-mono">
            {formatAmount(summary.total_debit)}
          </span>
          <span className="text-green-600 dark:text-green-400 font-mono">
            {formatAmount(summary.total_credit)}
          </span>
        </div>
      )}

      <TransactionTable
        transactions={transactions}
        accounts={accounts}
        categories={categories}
        onRefresh={handleRefresh}
        loading={loading}
        sortField={
          (filters.sort_field as
            | "date"
            | "description"
            | "merchant"
            | "payee"
            | "amount"
            | "category"
            | "account") ?? "date"
        }
        sortDir={(filters.sort_dir as "asc" | "desc") ?? "desc"}
        onSortChange={(field, dir) => {
          setFilters((prev) => ({
            ...prev,
            sort_field: field,
            sort_dir: dir,
            offset: 0,
          }));
        }}
      />
      <div
        ref={sentinelRef}
        className="h-8 flex items-center justify-center text-sm text-gray-400"
      >
        {loading ? "Loading..." : hasMore ? "" : ""}
      </div>
    </div>
  );
}
