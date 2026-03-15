import type { UncategorizedGroup, Account } from "../../lib/types";
import { formatAmount } from "../../lib/utils";
import { focusedRowClass } from "../../lib/styles";

export type GroupSortField = "name" | "count" | "total";
export type GroupSortDir = "asc" | "desc";

interface UncategorizedGroupListProps {
  sortedGroups: UncategorizedGroup[];
  accounts: Account[];
  sortField: GroupSortField;
  sortDir: GroupSortDir;
  onToggleSort: (field: GroupSortField) => void;
  onCategorize: (group: UncategorizedGroup) => void;
  onDrillDown: (group: UncategorizedGroup) => void;
  focusedIndex: number;
}

export default function UncategorizedGroupList({
  sortedGroups,
  accounts,
  sortField,
  sortDir,
  onToggleSort,
  onCategorize,
  onDrillDown,
  focusedIndex,
}: UncategorizedGroupListProps) {
  function sortIndicator(field: GroupSortField) {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  }

  if (sortedGroups.length === 0) {
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
            <th data-testid="group-sort-name" className="px-4 py-3 cursor-pointer select-none" onClick={() => onToggleSort("name")}>Description{sortIndicator("name")}</th>
            <th data-testid="group-sort-count" className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => onToggleSort("count")}>Count{sortIndicator("count")}</th>
            <th data-testid="group-sort-total" className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => onToggleSort("total")}>Total{sortIndicator("total")}</th>
            <th className="px-4 py-3">Accounts</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {sortedGroups.map((group, index) => (
            <tr
              key={group.normalized_name}
              data-testid={`group-row-${group.normalized_name.replace(/\s+/g, '-')}`}
              data-nav-index={index}
              className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${index === focusedIndex ? focusedRowClass : ""}`}
            >
              <td className="px-4 py-3">
                <button
                  data-testid={`group-drilldown-${group.normalized_name.replace(/\s+/g, '-')}`}
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
                  data-testid={`group-categorize-${group.normalized_name.replace(/\s+/g, '-')}`}
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
