import { useState, useEffect, useCallback } from "react";
import { listTransactions } from "../lib/tauri";
import type { Transaction } from "../lib/types";
import { btnClass } from "../lib/styles";
import { useCategoryMap } from "../lib/hooks";
import MonthlySummary from "../components/dashboard/MonthlySummary";
import CategoryBreakdown from "../components/dashboard/CategoryBreakdown";

function formatMonthLabel(year: number, month: number): string {
  const date = new Date(year, month - 1);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

function getYearMonth(d: Date): { year: number; month: number } {
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function padMonth(m: number): string {
  return m.toString().padStart(2, "0");
}

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { categories } = useCategoryMap();

  const fetchMonth = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const dateFrom = `${y}-${padMonth(m)}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const dateTo = `${y}-${padMonth(m)}-${padMonth(lastDay)}`;
      const result = await listTransactions({
        date_from: dateFrom,
        date_to: dateTo,
        limit: 10000,
      });
      setTransactions(result);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonth(year, month);
  }, [year, month, fetchMonth]);

  function prevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    const { year: curY, month: curM } = getYearMonth(new Date());
    if (year > curY || (year === curY && month >= curM)) return;
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  const { year: curY, month: curM } = getYearMonth(new Date());
  const atCurrentMonth = year === curY && month === curM;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={prevMonth}
          className={btnClass}
        >
          &larr;
        </button>
        <h1 className="text-2xl font-semibold min-w-[14rem] text-center">
          {formatMonthLabel(year, month)}
        </h1>
        <button
          onClick={nextMonth}
          disabled={atCurrentMonth}
          className={`${btnClass} disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          &rarr;
        </button>
        {loading && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Loading...
          </span>
        )}
      </div>

      <MonthlySummary
        transactions={transactions}
        categories={categories}
      />

      <CategoryBreakdown
        transactions={transactions}
        categories={categories}
      />
    </div>
  );
}
