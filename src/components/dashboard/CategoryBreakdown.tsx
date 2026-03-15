import { useState } from "react";
import type { Category, Transaction } from "../../lib/types";
import { formatAmount } from "../../lib/utils";
import { Th, Td } from "../shared/Table";

type Direction = Category["direction"];

interface CategoryBreakdownProps {
  transactions: Transaction[];
  categories: Category[];
}

interface CategoryTotal {
  categoryId: string | null;
  name: string;
  total: number;
  percentage: number;
}

const DIRECTION_LABELS: Record<Direction, string> = {
  expense: "Expenses",
  income: "Income",
  transfer: "Transfers",
  adjustment: "Adjustments",
};

const DIRECTION_ORDER: Direction[] = [
  "expense",
  "income",
  "transfer",
  "adjustment",
];

function computeTotals(
  transactions: Transaction[],
  categories: Category[],
  categoryMap: Map<string, Category>,
  direction: Direction,
): CategoryTotal[] {
  const directionCategoryIds = new Set(
    categories.filter((c) => c.direction === direction).map((c) => c.id),
  );

  const filtered = transactions.filter((tx) => {
    if (!tx.category_id) return false;
    return directionCategoryIds.has(tx.category_id);
  });

  const totalAbs = filtered.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Group by parent category (or self if no parent)
  const byParent = new Map<string, number>();
  for (const tx of filtered) {
    const cat = categoryMap.get(tx.category_id!);
    if (!cat) continue;
    const parentId = cat.parent_id ?? cat.id;
    byParent.set(parentId, (byParent.get(parentId) ?? 0) + Math.abs(tx.amount));
  }

  const result: CategoryTotal[] = [];
  for (const [parentId, total] of byParent) {
    const parentCat = categoryMap.get(parentId);
    result.push({
      categoryId: parentId,
      name: parentCat?.name ?? "Unknown",
      total,
      percentage: totalAbs > 0 ? (total / totalAbs) * 100 : 0,
    });
  }

  return result.sort((a, b) => b.total - a.total);
}

export default function CategoryBreakdown({
  transactions,
  categories,
}: CategoryBreakdownProps) {
  const [activeDirection, setActiveDirection] = useState<Direction>("expense");
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
        No transactions for this month.
      </div>
    );
  }

  // Determine which direction tabs have data
  const directionHasData = new Map<Direction, boolean>();
  for (const dir of DIRECTION_ORDER) {
    const dirCatIds = new Set(
      categories.filter((c) => c.direction === dir).map((c) => c.id),
    );
    directionHasData.set(
      dir,
      transactions.some((tx) => tx.category_id && dirCatIds.has(tx.category_id)),
    );
  }

  const rows = computeTotals(
    transactions,
    categories,
    categoryMap,
    activeDirection,
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {DIRECTION_ORDER.map((dir) => {
          const hasData = directionHasData.get(dir);
          if (!hasData) return null;
          const active = dir === activeDirection;
          return (
            <button
              key={dir}
              data-testid={`breakdown-tab-${dir}`}
              onClick={() => setActiveDirection(dir)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {DIRECTION_LABELS[dir]}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
          No {DIRECTION_LABELS[activeDirection].toLowerCase()} this month.
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
          <table className="min-w-full">
            <thead>
              <tr>
                <Th>Category</Th>
                <Th align="right">Amount</Th>
                <Th align="right">%</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.categoryId ?? "__none__"}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <Td className="text-gray-900 dark:text-gray-100">
                    {row.name}
                  </Td>
                  <Td align="right" mono className="tabular-nums text-gray-900 dark:text-gray-100">
                    {formatAmount(row.total)}
                  </Td>
                  <Td align="right" className="text-gray-500 dark:text-gray-400">
                    {row.percentage.toFixed(1)}%
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
