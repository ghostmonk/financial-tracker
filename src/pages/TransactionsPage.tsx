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
  const [hasMore, setHasMore] = useState(false);
  const [totalLoaded, setTotalLoaded] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listAccounts().then(setAccounts).catch(console.error);
  }, []);

  const fetchTransactions = useCallback(
    async (f: Filters, append = false) => {
      setLoading(true);
      try {
        const result = await listTransactions(f);
        if (append) {
          setTransactions((prev) => [...prev, ...result]);
          setTotalLoaded((prev) => prev + result.length);
        } else {
          setTransactions(result);
          setTotalLoaded(result.length);
        }
        setHasMore(result.length === (f.limit ?? PAGE_SIZE));
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
      // Strip limit/offset for summary
      const { limit: _, offset: __, ...summaryFilters } = f;
      const result = await getTransactionSummary(summaryFilters as Filters);
      setSummary(result);
    } catch (err) {
      console.error("Failed to fetch summary:", err);
    }
  }, []);

  useEffect(() => {
    fetchTransactions(filters);
    fetchSummary(filters);
  }, [filters, fetchTransactions, fetchSummary]);

  function handleFiltersChange(newFilters: Filters) {
    setFilters({ ...newFilters, limit: PAGE_SIZE, offset: 0 });
  }

  const handleLoadMore = useCallback(() => {
    const newOffset = (filters.offset ?? 0) + PAGE_SIZE;
    const newFilters = { ...filters, offset: newOffset };
    setFilters(newFilters);
    fetchTransactions(newFilters, true);
  }, [filters, fetchTransactions]);

  function handleRefresh() {
    // Refetch all currently loaded pages
    const refreshFilters = { ...filters, limit: totalLoaded || PAGE_SIZE, offset: 0 };
    fetchTransactions(refreshFilters);
    fetchSummary(refreshFilters);
  }

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, handleLoadMore]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Transactions</h1>
          <p data-testid="transactions-count" className="text-sm text-gray-500 dark:text-gray-400">
            {totalLoaded} transaction{totalLoaded !== 1 ? "s" : ""} loaded
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
            <span className="font-medium text-gray-900 dark:text-gray-100">{summary.total_count}</span> transactions
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-gray-100">{summary.parent_category_count}</span> parent categories
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-gray-100">{summary.child_category_count}</span> child categories
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
        sortField={(filters.sort_field as "date" | "description" | "merchant" | "payee" | "amount" | "category" | "account") ?? "date"}
        sortDir={(filters.sort_dir as "asc" | "desc") ?? "desc"}
        onSortChange={(field, dir) => {
          setFilters((prev) => ({ ...prev, sort_field: field, sort_dir: dir, offset: 0 }));
        }}
      />
      {hasMore && (
        <div ref={sentinelRef} className="h-8 flex items-center justify-center text-sm text-gray-400">
          {loading ? "Loading..." : ""}
        </div>
      )}
    </div>
  );
}
