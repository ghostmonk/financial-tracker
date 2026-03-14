import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { listAccounts, createAccount } from "../../lib/tauri";
import type { Account } from "../../lib/types";

interface FileSelectorProps {
  onFileSelected: (
    fileContent: string,
    fileType: "csv" | "ofx" | "qfx",
    fileName: string,
    accountId: string,
  ) => void;
}

export default function FileSelector({ onFileSelected }: FileSelectorProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("checking");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    listAccounts().then((accts) => {
      setAccounts(accts);
      if (accts.length > 0) {
        setSelectedAccountId(accts[0].id);
      }
    });
  }, []);

  async function handleSelectFile() {
    setError(null);
    const path = await open({
      multiple: false,
      filters: [
        {
          name: "Financial Files",
          extensions: ["csv", "ofx", "qfx"],
        },
      ],
    });

    if (!path) return;

    const ext = path.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "ofx" && ext !== "qfx") {
      setError("Unsupported file type. Use .csv, .ofx, or .qfx files.");
      return;
    }

    const name = path.split(/[/\\]/).pop() ?? path;
    setFileName(name);

    setLoading(true);
    try {
      const content = await readTextFile(path);
      const accountId = creatingAccount
        ? await handleCreateAccount()
        : selectedAccountId;

      if (!accountId) {
        setError("Select or create an account first.");
        setLoading(false);
        return;
      }

      onFileSelected(content, ext as "csv" | "ofx" | "qfx", name, accountId);
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to read file.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAccount(): Promise<string | null> {
    if (!newAccountName.trim()) {
      setError("Account name is required.");
      return null;
    }
    try {
      const account = await createAccount({
        name: newAccountName.trim(),
        account_type: newAccountType,
      });
      setAccounts((prev) => [...prev, account]);
      setSelectedAccountId(account.id);
      setCreatingAccount(false);
      setNewAccountName("");
      return account.id;
    } catch (err) {
      setError(
        typeof err === "string" ? err : "Failed to create account.",
      );
      return null;
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1">Account</label>
        {!creatingAccount ? (
          <div className="space-y-2">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {accounts.length === 0 && (
                <option value="">No accounts</option>
              )}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.institution ? ` (${a.institution})` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCreatingAccount(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              + Create new account
            </button>
          </div>
        ) : (
          <div className="space-y-2 p-3 border border-gray-300 dark:border-gray-600 rounded-md">
            <input
              type="text"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder="Account name"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <select
              value={newAccountType}
              onChange={(e) => setNewAccountType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit_card">Credit Card</option>
              <option value="investment">Investment</option>
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreatingAccount(false)}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={handleSelectFile}
          disabled={loading || (!selectedAccountId && !creatingAccount)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Reading file..." : "Select File"}
        </button>
        {fileName && (
          <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
            {fileName}
          </span>
        )}
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Supported formats: .csv, .ofx, .qfx
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
