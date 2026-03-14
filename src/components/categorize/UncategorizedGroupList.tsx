import { useState, useMemo } from "react";
import type { UncategorizedGroup, Account } from "../../lib/types";

interface UncategorizedGroupListProps {
  groups: UncategorizedGroup[];
  accounts: Account[];
  onCategorize: (group: UncategorizedGroup) => void;
  onDrillDown: (group: UncategorizedGroup) => void;
}

function formatAmount(amount: number): string {
  const abs = Math.abs(amount).toFixed(2);
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

export default function UncategorizedGroupList({
  groups,
  accounts,
  onCategorize,
  onDrillDown,
}: UncategorizedGroupListProps) {
  type SortField = "name" | "count" | "total";
  type SortDir = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function sortIndicator(field: SortField) {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  const sortedGroups = useMemo(() => {
    const sorted = [...groups].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.normalized_name.localeCompare(b.normalized_name);
          break;
        case "count":
          cmp = a.transaction_count - b.transaction_count;
          break;
        case "total":
          cmp = a.total_amount - b.total_amount;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [groups, sortField, sortDir]);

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
            <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("name")}>Description{sortIndicator("name")}</th>
            <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort("count")}>Count{sortIndicator("count")}</th>
            <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort("total")}>Total{sortIndicator("total")}</th>
            <th className="px-4 py-3">Accounts</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {sortedGroups.map((group) => (
            <tr
              key={group.normalized_name}
              className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <td className="px-4 py-3">
                <button
                  onClick={() => onDrillDown(group)}
                  className="text-left font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {group.normalized_name}
                </button>
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
                  Categorize All
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
