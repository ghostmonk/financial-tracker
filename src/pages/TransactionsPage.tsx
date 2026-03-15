import { useState, useEffect, useCallback } from "react";
import {
  listTransactions,
  listAccounts,
} from "../lib/tauri";
import type {
  Transaction,
  TransactionFilters as Filters,
  Account,
} from "../lib/types";
import { useCategoryMap } from "../lib/hooks";
import TransactionFiltersBar from "../components/transactions/TransactionFilters";
import TransactionTable from "../components/transactions/TransactionTable";

const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const { categories } = useCategoryMap();
  const [filters, setFilters] = useState<Filters>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalLoaded, setTotalLoaded] = useState(0);

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

  useEffect(() => {
    fetchTransactions(filters);
  }, [filters, fetchTransactions]);

  function handleFiltersChange(newFilters: Filters) {
    setFilters({ ...newFilters, limit: PAGE_SIZE, offset: 0 });
  }

  function handleLoadMore() {
    const newOffset = (filters.offset ?? 0) + PAGE_SIZE;
    const newFilters = { ...filters, offset: newOffset };
    setFilters(newFilters);
    fetchTransactions(newFilters, true);
  }

  function handleRefresh() {
    // Refetch all currently loaded pages
    const refreshFilters = { ...filters, limit: totalLoaded || PAGE_SIZE, offset: 0 };
    fetchTransactions(refreshFilters);
  }

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
        transactions={transactions}
      />

      <TransactionTable
        transactions={transactions}
        accounts={accounts}
        categories={categories}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        onRefresh={handleRefresh}
        loading={loading}
        sortField={(filters.sort_field as "date" | "description" | "merchant" | "payee" | "amount" | "category" | "account") ?? "date"}
        sortDir={(filters.sort_dir as "asc" | "desc") ?? "desc"}
        onSortChange={(field, dir) => {
          setFilters((prev) => ({ ...prev, sort_field: field, sort_dir: dir, offset: 0 }));
        }}
      />
    </div>
  );
}
