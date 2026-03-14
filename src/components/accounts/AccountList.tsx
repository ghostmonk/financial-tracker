import type { Account } from "../../lib/types";

interface AccountListProps {
  accounts: Account[];
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
}

function formatType(t: string): string {
  return t
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AccountList({
  accounts,
  onEdit,
  onDelete,
}: AccountListProps) {
  if (accounts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium">No accounts</p>
        <p className="text-sm mt-1">Create an account to get started.</p>
      </div>
    );
  }

  const thClass =
    "px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800";
  const tdClass =
    "px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-800";

  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
      <table className="min-w-full">
        <thead>
          <tr>
            <th className={thClass}>Name</th>
            <th className={thClass}>Institution</th>
            <th className={thClass}>Type</th>
            <th className={thClass}>Currency</th>
            <th className={`${thClass} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr
              key={account.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <td
                className={`${tdClass} text-gray-900 dark:text-gray-100 font-medium`}
              >
                {account.name}
              </td>
              <td className={`${tdClass} text-gray-600 dark:text-gray-400`}>
                {account.institution ?? "--"}
              </td>
              <td className={`${tdClass} text-gray-600 dark:text-gray-400`}>
                {formatType(account.account_type)}
              </td>
              <td className={`${tdClass} text-gray-600 dark:text-gray-400`}>
                {account.currency}
              </td>
              <td className={`${tdClass} text-right`}>
                <button
                  onClick={() => onEdit(account)}
                  className="text-xs px-2 py-1 text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(account)}
                  className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:underline ml-2"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
