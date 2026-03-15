import { useState, useEffect, useCallback } from "react";
import {
  getUncategorizedGroups,
  listAccounts,
  listCategories,
  createCategorizationRule,
  reapplyAllRules,
} from "../lib/tauri";
import type {
  UncategorizedGroup,
  Account,
  Category,
  CreateRuleParams,
} from "../lib/types";
import { parseError } from "../lib/utils";
import { selectClass } from "../lib/styles";
import UncategorizedGroupList from "../components/categorize/UncategorizedGroupList";
import GroupCategorizeDialog from "../components/categorize/GroupCategorizeDialog";
import GroupDrillDown from "../components/categorize/GroupDrillDown";

export default function CategorizePage() {
  const [groups, setGroups] = useState<UncategorizedGroup[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [categorizingGroup, setCategorizingGroup] =
    useState<UncategorizedGroup | null>(null);
  const [drillDownGroup, setDrillDownGroup] =
    useState<UncategorizedGroup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalTransactions = groups.reduce(
    (sum, g) => sum + g.transaction_count,
    0,
  );

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getUncategorizedGroups(
        selectedAccountId || undefined,
      );
      setGroups(result);
    } catch (err) {
      console.error("Failed to fetch uncategorized groups:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    listAccounts().then(setAccounts).catch(console.error);
    listCategories().then(setCategories).catch(console.error);
  }, []);

  async function handleConfirm(params: CreateRuleParams) {
    setError(null);
    try {
      await createCategorizationRule(params);
      await reapplyAllRules();
      setCategorizingGroup(null);
      fetchGroups();
    } catch (err) {
      setError(parseError(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Categorize</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {groups.length} group{groups.length !== 1 ? "s" : ""} &mdash;{" "}
            {totalTransactions} transaction{totalTransactions !== 1 ? "s" : ""}
          </p>
        </div>
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className={selectClass}
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {drillDownGroup ? (
        <GroupDrillDown
          group={drillDownGroup}
          categories={categories}
          accountId={selectedAccountId || undefined}
          onBack={() => {
            setDrillDownGroup(null);
            fetchGroups();
          }}
          onRefresh={fetchGroups}
        />
      ) : loading ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      ) : (
        <UncategorizedGroupList
          groups={groups}
          accounts={accounts}
          onCategorize={setCategorizingGroup}
          onDrillDown={setDrillDownGroup}
        />
      )}

      {categorizingGroup && (
        <GroupCategorizeDialog
          group={categorizingGroup}
          categories={categories}
          onConfirm={handleConfirm}
          onCancel={() => setCategorizingGroup(null)}
        />
      )}
    </div>
  );
}
