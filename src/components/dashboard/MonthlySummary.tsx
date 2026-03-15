import type { Category, Transaction } from "../../lib/types";
import { formatAmount } from "../../lib/utils";

interface MonthlySummaryProps {
  transactions: Transaction[];
  categories: Category[];
}

interface CardProps {
  label: string;
  value: number;
  colorClass: string;
}

function SummaryCard({ label, value, colorClass }: CardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${colorClass}`}>
        {formatAmount(value)}
      </p>
    </div>
  );
}

type Direction = Category["direction"];

function getDirection(
  tx: Transaction,
  categoryMap: Map<string, Category>,
): Direction | null {
  if (!tx.category_id) return null;
  return categoryMap.get(tx.category_id)?.direction ?? null;
}

export default function MonthlySummary({
  transactions,
  categories,
}: MonthlySummaryProps) {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  let income = 0;
  let expenses = 0;
  let transfers = 0;
  let adjustments = 0;

  for (const tx of transactions) {
    const dir = getDirection(tx, categoryMap);
    switch (dir) {
      case "income":
        income += tx.amount;
        break;
      case "expense":
        expenses += tx.amount;
        break;
      case "transfer":
        transfers += tx.amount;
        break;
      case "adjustment":
        adjustments += tx.amount;
        break;
      default:
        // uncategorized: fall back to sign-based grouping
        if (tx.amount > 0) income += tx.amount;
        else expenses += tx.amount;
        break;
    }
  }

  const net = income + expenses;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <SummaryCard
        label="Income"
        value={income}
        colorClass="text-green-600 dark:text-green-400"
      />
      <SummaryCard
        label="Expenses"
        value={expenses}
        colorClass="text-red-600 dark:text-red-400"
      />
      <SummaryCard
        label="Net"
        value={net}
        colorClass={
          net >= 0
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
        }
      />
      <SummaryCard
        label="Transfers"
        value={transfers}
        colorClass="text-blue-600 dark:text-blue-400"
      />
      <SummaryCard
        label="Adjustments"
        value={adjustments}
        colorClass="text-orange-600 dark:text-orange-400"
      />
    </div>
  );
}
