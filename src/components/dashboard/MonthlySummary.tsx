interface MonthlySummaryProps {
  totalIncome: number;
  totalExpenses: number;
  businessIncome: number;
  businessExpenses: number;
}

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount).toFixed(2);
  return amount < 0 ? `-$${abs}` : `$${abs}`;
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
        {formatCurrency(value)}
      </p>
    </div>
  );
}

export default function MonthlySummary({
  totalIncome,
  totalExpenses,
  businessIncome,
  businessExpenses,
}: MonthlySummaryProps) {
  const net = totalIncome + totalExpenses;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <SummaryCard
        label="Total Income"
        value={totalIncome}
        colorClass="text-green-600 dark:text-green-400"
      />
      <SummaryCard
        label="Total Expenses"
        value={totalExpenses}
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
        label="Business Income"
        value={businessIncome}
        colorClass="text-blue-600 dark:text-blue-400"
      />
      <SummaryCard
        label="Business Expenses"
        value={businessExpenses}
        colorClass="text-orange-600 dark:text-orange-400"
      />
    </div>
  );
}
