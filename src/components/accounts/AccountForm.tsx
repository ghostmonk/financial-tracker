import { useState, useEffect } from "react";
import type { Account, CreateAccountParams } from "../../lib/types";
import { inputClass, btnClass, btnPrimaryClass } from "../../lib/styles";
import Modal from "../shared/Modal";
import FormField from "../shared/FormField";

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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      institution: institution.trim() || null,
      account_type: accountType,
      currency,
    });
  }

  return (
    <Modal open={true} onClose={onCancel} title={editingAccount ? "Edit Account" : "Add Account"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            autoFocus
            required
          />
        </FormField>

        <FormField label="Institution">
          <input
            type="text"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="e.g. TD Bank, Desjardins"
            className={inputClass}
          />
        </FormField>

        <FormField label="Type">
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
        </FormField>

        <FormField label="Currency">
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
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className={btnClass}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={btnPrimaryClass}
          >
            {editingAccount ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
