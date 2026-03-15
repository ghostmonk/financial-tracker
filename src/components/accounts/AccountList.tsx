import type { Account } from "../../lib/types";
import { Th, Td } from "../shared/Table";

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

  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
      <table className="min-w-full">
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Institution</Th>
            <Th>Type</Th>
            <Th>Currency</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr
              key={account.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <Td className="text-gray-900 dark:text-gray-100 font-medium">
                {account.name}
              </Td>
              <Td className="text-gray-600 dark:text-gray-400">
                {account.institution ?? "--"}
              </Td>
              <Td className="text-gray-600 dark:text-gray-400">
                {formatType(account.account_type)}
              </Td>
              <Td className="text-gray-600 dark:text-gray-400">
                {account.currency}
              </Td>
              <Td align="right">
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
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
