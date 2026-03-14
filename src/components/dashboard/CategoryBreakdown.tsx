import type { Category, Transaction } from "../../lib/types";

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

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount).toFixed(2);
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

function computeTotals(
  transactions: Transaction[],
  categoryMap: Map<string, Category>,
  filter: (tx: Transaction) => boolean,
): CategoryTotal[] {
  const filtered = transactions.filter(filter);
  const totalAbs = filtered.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const byCategory = new Map<string | null, number>();
  for (const tx of filtered) {
    const key = tx.category_id;
    byCategory.set(key, (byCategory.get(key) ?? 0) + Math.abs(tx.amount));
  }

  const result: CategoryTotal[] = [];
  for (const [catId, total] of byCategory) {
    result.push({
      categoryId: catId,
      name: catId ? (categoryMap.get(catId)?.name ?? "Unknown") : "Uncategorized",
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
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const incomeRows = computeTotals(
    transactions,
    categoryMap,
    (tx) => tx.amount > 0,
  );
  const expenseRows = computeTotals(
    transactions,
    categoryMap,
    (tx) => tx.amount < 0,
  );

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
        No transactions for this month.
      </div>
    );
  }

  const thClass =
    "px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800";
  const tdClass =
    "px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-800";

  function renderSection(label: string, rows: CategoryTotal[]) {
    if (rows.length === 0) return null;
    return (
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </h3>
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={thClass}>Category</th>
                <th className={`${thClass} text-right`}>Amount</th>
                <th className={`${thClass} text-right`}>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.categoryId ?? "__none__"}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td
                    className={`${tdClass} text-gray-900 dark:text-gray-100`}
                  >
                    {row.name}
                  </td>
                  <td
                    className={`${tdClass} text-right font-mono tabular-nums text-gray-900 dark:text-gray-100`}
                  >
                    {formatCurrency(row.total)}
                  </td>
                  <td
                    className={`${tdClass} text-right text-gray-500 dark:text-gray-400`}
                  >
                    {row.percentage.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {renderSection("Income by Category", incomeRows)}
      {renderSection("Expenses by Category", expenseRows)}
    </div>
  );
}
