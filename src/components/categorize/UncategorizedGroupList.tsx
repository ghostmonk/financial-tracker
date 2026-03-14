import type { UncategorizedGroup, Account } from "../../lib/types";

interface UncategorizedGroupListProps {
  groups: UncategorizedGroup[];
  accounts: Account[];
  onCategorize: (group: UncategorizedGroup) => void;
}

function formatAmount(amount: number): string {
  const abs = Math.abs(amount).toFixed(2);
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

export default function UncategorizedGroupList({
  groups,
  accounts,
  onCategorize,
}: UncategorizedGroupListProps) {
  if (groups.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400 py-12 text-sm">
        All transactions are categorized.
      </p>
    );
  }

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3 text-right">Count</th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3">Accounts</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {groups.map((group) => (
            <tr
              key={group.normalized_name}
              className="hover:bg-blue-50 dark:hover:bg-gray-700/50"
            >
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {group.normalized_name}
                </div>
                {group.sample_description !== group.normalized_name && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {group.sample_description}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {group.transaction_count}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatAmount(group.total_amount)}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {group.account_ids.map((id) => (
                    <span
                      key={id}
                      className="inline-block px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded"
                    >
                      {accountMap.get(id) ?? id.slice(0, 8)}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onCategorize(group)}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
                >
                  Categorize
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
