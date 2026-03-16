import { useState, useEffect, useCallback, useMemo } from "react";
import {
  listCategorizationRules,
  createCategorizationRule,
  updateCategorizationRule,
  deleteCategorizationRule,
  reapplyAllRules,
  listCategories,
  listAccounts,
} from "../lib/tauri";
import type {
  CategorizationRule,
  CreateRuleParams,
  UpdateRuleParams,
  Category,
  Account,
} from "../lib/types";
import { parseError } from "../lib/utils";
import { inputClass, inputSmClass, btnClass, btnPrimaryClass, btnDangerClass } from "../lib/styles";
import Modal from "../components/shared/Modal";
import FormField from "../components/shared/FormField";
import CategorySelect from "../components/transactions/CategorySelect";

export default function RulesPage() {
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<CategorizationRule | null>(
    null,
  );
  const [deletingRule, setDeletingRule] = useState<CategorizationRule | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Filter state
  const [filterSearch, setFilterSearch] = useState("");
  const [filterAccountId, setFilterAccountId] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [filterMatchField, setFilterMatchField] = useState("");
  const [filterAutoApply, setFilterAutoApply] = useState("");

  type SortField = "pattern" | "match_field" | "match_type" | "category" | "priority" | "auto_apply";
  type SortDir = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("priority");
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

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listCategorizationRules();
      setRules(result);
    } catch (err) {
      console.error("Failed to fetch rules:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
    listCategories().then(setCategories).catch(console.error);
    listAccounts().then(setAccounts).catch(console.error);
  }, [fetchRules]);

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  const categoryMap = new Map(
    categories.map((c) => {
      if (c.parent_id) {
        const parent = categories.find((p) => p.id === c.parent_id);
        return [c.id, parent ? `${parent.name} > ${c.name}` : c.name];
      }
      return [c.id, c.name];
    }),
  );

  const filteredRules = useMemo(() => {
    let result = rules;
    if (filterSearch) {
      const term = filterSearch.toLowerCase();
      result = result.filter((r) => r.pattern.toLowerCase().includes(term));
    }
    if (filterAccountId) {
      result = result.filter(
        (r) => r.account_ids.length === 0 || r.account_ids.includes(filterAccountId),
      );
    }
    if (filterCategoryId) {
      result = result.filter((r) => r.category_id === filterCategoryId);
    }
    if (filterMatchField) {
      result = result.filter((r) => r.match_field === filterMatchField);
    }
    if (filterAutoApply === "yes") {
      result = result.filter((r) => r.auto_apply);
    } else if (filterAutoApply === "no") {
      result = result.filter((r) => !r.auto_apply);
    }
    return result;
  }, [rules, filterSearch, filterAccountId, filterCategoryId, filterMatchField, filterAutoApply]);

  const sortedRules = useMemo(() => {
    const sorted = [...filteredRules].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "pattern":
          cmp = a.pattern.localeCompare(b.pattern);
          break;
        case "match_field":
          cmp = a.match_field.localeCompare(b.match_field);
          break;
        case "match_type":
          cmp = a.match_type.localeCompare(b.match_type);
          break;
        case "category":
          cmp = (categoryMap.get(a.category_id) ?? "").localeCompare(
            categoryMap.get(b.category_id) ?? "",
          );
          break;
        case "priority":
          cmp = a.priority - b.priority;
          break;
        case "auto_apply":
          cmp = Number(a.auto_apply) - Number(b.auto_apply);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredRules, sortField, sortDir, categoryMap]);

  async function handleReapply() {
    setBanner(null);
    setError(null);
    try {
      const count = await reapplyAllRules();
      setBanner(`Re-applied rules: ${count} transaction${count !== 1 ? "s" : ""} categorized.`);
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function handleSubmit(params: CreateRuleParams) {
    setError(null);
    try {
      if (editingRule) {
        const updateParams: UpdateRuleParams = { ...params };
        await updateCategorizationRule(editingRule.id, updateParams);
      } else {
        await createCategorizationRule(params);
      }
      setShowForm(false);
      setEditingRule(null);
      fetchRules();
    } catch (err) {
      setError(parseError(err));
    }
  }

  function handleEdit(rule: CategorizationRule) {
    setEditingRule(rule);
    setShowForm(true);
    setError(null);
  }

  async function handleConfirmDelete() {
    if (!deletingRule) return;
    setError(null);
    try {
      await deleteCategorizationRule(deletingRule.id);
      setDeletingRule(null);
      fetchRules();
    } catch (err) {
      setError(parseError(err));
      setDeletingRule(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Rules</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {rules.length} rule{rules.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            data-testid="rules-reapply-btn"
            onClick={handleReapply}
            className={btnClass}
          >
            Re-apply All Rules
          </button>
          <button
            data-testid="rules-add-btn"
            onClick={() => {
              setEditingRule(null);
              setShowForm(true);
              setError(null);
            }}
            className={btnPrimaryClass}
          >
            Add Rule
          </button>
        </div>
      </div>

      {banner && (
        <p data-testid="rules-reapply-success" className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-4 py-2 rounded-md">
          {banner}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex flex-wrap items-end gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Search</label>
          <input
            data-testid="rules-filter-search"
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Pattern..."
            className={`${inputSmClass} w-52`}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Account</label>
          <select
            data-testid="rules-filter-account"
            value={filterAccountId}
            onChange={(e) => setFilterAccountId(e.target.value)}
            className={inputSmClass}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Category</label>
          <CategorySelect
            categories={categories}
            value={filterCategoryId}
            onChange={(catId) => setFilterCategoryId(catId)}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Match field</label>
          <select
            data-testid="rules-filter-match-field"
            value={filterMatchField}
            onChange={(e) => setFilterMatchField(e.target.value)}
            className={inputSmClass}
          >
            <option value="">All</option>
            <option value="description">Description</option>
            <option value="payee">Payee</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Auto-apply</label>
          <select
            data-testid="rules-filter-auto-apply"
            value={filterAutoApply}
            onChange={(e) => setFilterAutoApply(e.target.value)}
            className={inputSmClass}
          >
            <option value="">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        {(filterSearch || filterAccountId || filterCategoryId || filterMatchField || filterAutoApply) && (
          <button
            data-testid="rules-filter-clear"
            onClick={() => {
              setFilterSearch("");
              setFilterAccountId("");
              setFilterCategoryId(null);
              setFilterMatchField("");
              setFilterAutoApply("");
            }}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <p data-testid="rules-loading" className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      ) : rules.length === 0 ? (
        <p data-testid="rules-empty" className="text-center text-gray-500 dark:text-gray-400 py-12 text-sm">
          No rules yet. Create one from the Categorize page or add one manually.
        </p>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th data-testid="rule-sort-pattern" className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("pattern")}>Pattern{sortIndicator("pattern")}</th>
                <th data-testid="rule-sort-field" className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("match_field")}>Field{sortIndicator("match_field")}</th>
                <th data-testid="rule-sort-type" className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("match_type")}>Match{sortIndicator("match_type")}</th>
                <th data-testid="rule-sort-category" className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("category")}>Category{sortIndicator("category")}</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Amount</th>
                <th data-testid="rule-sort-priority" className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort("priority")}>Priority{sortIndicator("priority")}</th>
                <th data-testid="rule-sort-auto_apply" className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("auto_apply")}>Auto{sortIndicator("auto_apply")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {sortedRules.map((rule) => (
                <tr
                  key={rule.id}
                  data-testid={`rule-row-${rule.id}`}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {rule.pattern}
                  </td>
                  <td className="px-4 py-3">{rule.match_field}</td>
                  <td className="px-4 py-3">{rule.match_type}</td>
                  <td className="px-4 py-3">
                    {categoryMap.get(rule.category_id) ?? "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {rule.account_ids.length === 0
                      ? "All"
                      : rule.account_ids
                          .map((id) => accountMap.get(id) ?? "Unknown")
                          .join(", ")}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {rule.amount_min != null && rule.amount_max != null
                      ? `$${rule.amount_min.toFixed(2)} - $${rule.amount_max.toFixed(2)}`
                      : rule.amount_min != null
                        ? `>= $${rule.amount_min.toFixed(2)}`
                        : rule.amount_max != null
                          ? `<= $${rule.amount_max.toFixed(2)}`
                          : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {rule.priority}
                  </td>
                  <td className="px-4 py-3">
                    {rule.auto_apply ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        data-testid={`rule-edit-${rule.id}`}
                        onClick={() => handleEdit(rule)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        data-testid={`rule-delete-${rule.id}`}
                        onClick={() => setDeletingRule(rule)}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <RuleForm
          categories={categories}
          accounts={accounts}
          editingRule={editingRule}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingRule(null);
          }}
        />
      )}

      <Modal
        open={!!deletingRule}
        onClose={() => setDeletingRule(null)}
        title="Delete Rule"
        width="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Delete rule for pattern &quot;{deletingRule?.pattern}&quot;?
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => setDeletingRule(null)}
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

/* ---- Rule Form (inline component) ---- */

interface RuleFormProps {
  categories: Category[];
  accounts: Account[];
  editingRule: CategorizationRule | null;
  onSubmit: (params: CreateRuleParams) => void;
  onCancel: () => void;
}

function RuleForm({
  categories,
  accounts,
  editingRule,
  onSubmit,
  onCancel,
}: RuleFormProps) {
  const [pattern, setPattern] = useState(editingRule?.pattern ?? "");
  const [matchField, setMatchField] = useState(
    editingRule?.match_field ?? "description",
  );
  const [matchType, setMatchType] = useState(
    editingRule?.match_type ?? "contains",
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    editingRule?.category_id ?? null,
  );
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(
    editingRule?.account_ids ?? [],
  );
  const [amountMin, setAmountMin] = useState(
    editingRule?.amount_min?.toString() ?? "",
  );
  const [amountMax, setAmountMax] = useState(
    editingRule?.amount_max?.toString() ?? "",
  );
  const [priority, setPriority] = useState(editingRule?.priority ?? 0);
  const [autoApply, setAutoApply] = useState(
    editingRule?.auto_apply ?? true,
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pattern.trim() || !categoryId) return;
    onSubmit({
      pattern: pattern.trim(),
      match_field: matchField,
      match_type: matchType,
      category_id: categoryId,
      account_ids: selectedAccountIds.length === accounts.length ? [] : selectedAccountIds,
      amount_min: amountMin ? parseFloat(amountMin) : undefined,
      amount_max: amountMax ? parseFloat(amountMax) : undefined,
      priority,
      auto_apply: autoApply,
    });
  }

  return (
    <Modal open={true} onClose={onCancel} title={editingRule ? "Edit Rule" : "Add Rule"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Pattern">
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className={inputClass}
            autoFocus
            required
          />
        </FormField>

        <FormField label="Field">
          <select
            value={matchField}
            onChange={(e) => setMatchField(e.target.value)}
            className={inputClass}
          >
            <option value="description">Description</option>
            <option value="payee">Payee</option>
          </select>
        </FormField>

        <FormField label="Match Type">
          <select
            value={matchType}
            onChange={(e) => setMatchType(e.target.value)}
            className={inputClass}
          >
            <option value="contains">Contains</option>
            <option value="starts_with">Starts with</option>
            <option value="exact">Exact match</option>
          </select>
        </FormField>

        <FormField label="Category">
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={(catId) => setCategoryId(catId)}
          />
        </FormField>

        <FormField label="Accounts">
          <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-2">
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedAccountIds.includes(a.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedAccountIds([...selectedAccountIds, a.id]);
                    } else {
                      setSelectedAccountIds(selectedAccountIds.filter(id => id !== a.id));
                    }
                  }}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                {a.name}
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={() => setSelectedAccountIds(accounts.map(a => a.id))} className="text-xs text-blue-600 dark:text-blue-400">
              Select all
            </button>
            <button type="button" onClick={() => setSelectedAccountIds([])} className="text-xs text-gray-500 dark:text-gray-400">
              Clear
            </button>
          </div>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Min Amount">
            <input
              type="number"
              step="0.01"
              placeholder="Any"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Max Amount">
            <input
              type="number"
              step="0.01"
              placeholder="Any"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>

        <FormField label="Priority">
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
            className={inputClass}
          />
        </FormField>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoApply}
            onChange={(e) => setAutoApply(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Auto-apply on import
        </label>

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
            {editingRule ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
