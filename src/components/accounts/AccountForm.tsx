import { useState, useEffect } from "react";
import type { Account, CreateAccountParams } from "../../lib/types";

interface AccountFormProps {
  editingAccount?: Account | null;
  onSubmit: (params: CreateAccountParams) => void;
  onCancel: () => void;
}

const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit Card" },
  { value: "investment", label: "Investment" },
];

const CURRENCIES = ["CAD", "USD", "EUR", "GBP"];

export default function AccountForm({
  editingAccount,
  onSubmit,
  onCancel,
}: AccountFormProps) {
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [accountType, setAccountType] = useState("checking");
  const [currency, setCurrency] = useState("CAD");

  useEffect(() => {
    if (editingAccount) {
      setName(editingAccount.name);
      setInstitution(editingAccount.institution ?? "");
      setAccountType(editingAccount.account_type);
      setCurrency(editingAccount.currency);
    } else {
      setName("");
      setInstitution("");
      setAccountType("checking");
      setCurrency("CAD");
    }
  }, [editingAccount]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      institution: institution.trim() || null,
      account_type: accountType,
      currency,
    });
  }

  const inputClass =
    "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4"
      >
        <h2 className="text-lg font-semibold">
          {editingAccount ? "Edit Account" : "Add Account"}
        </h2>

        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            autoFocus
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Institution</label>
          <input
            type="text"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="e.g. TD Bank, Desjardins"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            className={inputClass}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            {editingAccount ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
