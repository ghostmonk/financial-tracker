import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getUncategorizedGroups,
  listAccounts,
  listCategories,
  listHotkeys,
  createCategorizationRule,
  reapplyAllRules,
  getGroupTransactions,
} from "../lib/tauri";
import type {
  UncategorizedGroup,
  Account,
  Category,
  CreateRuleParams,
  CategoryHotkey,
} from "../lib/types";
import { parseError } from "../lib/utils";
import { selectClass } from "../lib/styles";
import { useKeyboardNav } from "../lib/useKeyboardNav";
import { useUndoStack } from "../lib/useUndoStack";
import UncategorizedGroupList from "../components/categorize/UncategorizedGroupList";
import type { GroupSortField, GroupSortDir } from "../components/categorize/UncategorizedGroupList";
import GroupCategorizeDialog from "../components/categorize/GroupCategorizeDialog";
import GroupDrillDown from "../components/categorize/GroupDrillDown";
import CategoryPickerModal from "../components/shared/CategoryPickerModal";

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

  // Picker modal state
  const [pickerGroup, setPickerGroup] = useState<UncategorizedGroup | null>(null);
  const [pickerParentCategory, setPickerParentCategory] = useState<Category | null>(null);
  const [pickerChildCategories, setPickerChildCategories] = useState<Category[]>([]);

  // Lifted sort state
  const [sortField, setSortField] = useState<GroupSortField>("count");
  const [sortDir, setSortDir] = useState<GroupSortDir>("desc");

  // Hotkey map
  const [hotkeyMap, setHotkeyMap] = useState<Map<string, string>>(new Map());

  const totalTransactions = groups.reduce(
    (sum, g) => sum + g.transaction_count,
    0,
  );

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

  function toggleSort(field: GroupSortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

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
    listHotkeys()
      .then((hotkeys: CategoryHotkey[]) => {
        const map = new Map<string, string>();
        for (const h of hotkeys) {
          map.set(h.key, h.category_id);
        }
        setHotkeyMap(map);
      })
      .catch(console.error);
  }, []);

  const { push: pushUndo } = useUndoStack(fetchGroups);

  const handleHotkeyPress = useCallback(
    (key: string, shiftKey: boolean, index: number) => {
      const hotkeyKey = shiftKey ? key.toUpperCase() : key.toLowerCase();
      const categoryId = hotkeyMap.get(hotkeyKey);
      if (!categoryId) return;

      const parentCat = categories.find((c) => c.id === categoryId);
      if (!parentCat) return;

      const children = categories.filter((c) => c.parent_id === categoryId);
      const group = sortedGroups[index];
      if (!group) return;

      setPickerGroup(group);
      setPickerParentCategory(parentCat);
      setPickerChildCategories(children);
    },
    [hotkeyMap, sortedGroups, categories],
  );

  const handlePickerSelect = useCallback(
    async (selectedCategoryId: string) => {
      if (!pickerGroup) return;

      setPickerGroup(null);
      setPickerParentCategory(null);
      setPickerChildCategories([]);

      try {
        const txs = await getGroupTransactions(
          pickerGroup.normalized_name,
          selectedAccountId || undefined,
        );
        const txIds = txs.map((t) => t.id);
        const prevCategoryIds = txs.map((t) => t.category_id);
        const prevByRule = txs.map((t) => t.categorized_by_rule);

        const rule = await createCategorizationRule({
          pattern: pickerGroup.normalized_name,
          match_field: "description",
          match_type: "contains",
          category_id: selectedCategoryId,
          auto_apply: true,
        });
        await reapplyAllRules();

        pushUndo({
          transactionIds: txIds,
          previousCategoryIds: prevCategoryIds,
          previousCategorizedByRule: prevByRule,
          ruleId: rule.id,
          label: `Categorized "${pickerGroup.normalized_name}"`,
        });

        window.dispatchEvent(new Event("categorization-changed"));
        fetchGroups();
      } catch (err) {
        console.error("Hotkey categorization failed:", err);
      }
    },
    [pickerGroup, selectedAccountId, pushUndo, fetchGroups],
  );

  const { focusedIndex } = useKeyboardNav({
    itemCount: sortedGroups.length,
    enabled: !categorizingGroup && !drillDownGroup && !pickerGroup && !loading,
    onEnter: (index: number) => setCategorizingGroup(sortedGroups[index]),
    onRight: (index: number) => setDrillDownGroup(sortedGroups[index]),
    onKeyPress: handleHotkeyPress,
  });

  async function handleConfirm(params: CreateRuleParams) {
    setError(null);
    try {
      await createCategorizationRule(params);
      await reapplyAllRules();
      setCategorizingGroup(null);
      window.dispatchEvent(new Event("categorization-changed"));
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
          data-testid="categorize-account-filter"
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
        <p data-testid="categorize-loading" className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      ) : (
        <UncategorizedGroupList
          sortedGroups={sortedGroups}
          accounts={accounts}
          sortField={sortField}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          onCategorize={setCategorizingGroup}
          onDrillDown={setDrillDownGroup}
          focusedIndex={focusedIndex}
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

      <CategoryPickerModal
        open={!!pickerGroup}
        parentCategory={pickerParentCategory}
        childCategories={pickerChildCategories}
        onSelect={handlePickerSelect}
        onClose={() => {
          setPickerGroup(null);
          setPickerParentCategory(null);
          setPickerChildCategories([]);
        }}
      />
    </div>
  );
}
