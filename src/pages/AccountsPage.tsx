import { useState, useEffect, useCallback } from "react";
import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from "../lib/tauri";
import type { Account, CreateAccountParams } from "../lib/types";
import { parseError } from "../lib/utils";
import { btnClass, btnPrimaryClass, btnDangerClass } from "../lib/styles";
import Modal from "../components/shared/Modal";
import AccountList from "../components/accounts/AccountList";
import AccountForm from "../components/accounts/AccountForm";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAccounts();
      setAccounts(result);
    } catch (err) {
      console.error("Failed to fetch accounts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  async function handleSubmit(params: CreateAccountParams) {
    setError(null);
    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, {
          name: params.name,
          institution: params.institution,
          account_type: params.account_type,
          currency: params.currency || undefined,
        });
      } else {
        await createAccount(params);
      }
      setShowForm(false);
      setEditingAccount(null);
      fetchAccounts();
    } catch (err) {
      setError(parseError(err));
    }
  }

  function handleEdit(account: Account) {
    setEditingAccount(account);
    setShowForm(true);
    setError(null);
  }

  async function handleConfirmDelete() {
    if (!deletingAccount) return;
    setError(null);
    try {
      await deleteAccount(deletingAccount.id);
      setDeletingAccount(null);
      fetchAccounts();
    } catch (err) {
      setError(parseError(err));
      setDeletingAccount(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Accounts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingAccount(null);
            setShowForm(true);
            setError(null);
          }}
          className={btnPrimaryClass}
        >
          Add Account
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      ) : (
        <AccountList
          accounts={accounts}
          onEdit={handleEdit}
          onDelete={setDeletingAccount}
        />
      )}

      {showForm && (
        <AccountForm
          editingAccount={editingAccount}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingAccount(null);
          }}
        />
      )}

      <Modal
        open={!!deletingAccount}
        onClose={() => setDeletingAccount(null)}
        title="Delete Account"
        width="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Delete &quot;{deletingAccount?.name}&quot;? All transactions
          associated with this account will also be deleted.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => setDeletingAccount(null)}
            className={btnClass}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmDelete}
            className={btnDangerClass}
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
