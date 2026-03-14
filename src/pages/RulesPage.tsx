import { useState, useEffect, useCallback, useMemo } from "react";
import {
  listCategorizationRules,
  createCategorizationRule,
  updateCategorizationRule,
  deleteCategorizationRule,
  reapplyAllRules,
  listCategories,
} from "../lib/tauri";
import type {
  CategorizationRule,
  CreateRuleParams,
  UpdateRuleParams,
  Category,
} from "../lib/types";

export default function RulesPage() {
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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
  }, [fetchRules]);

  const categoryMap = new Map(
    categories.map((c) => {
      if (c.parent_id) {
        const parent = categories.find((p) => p.id === c.parent_id);
        return [c.id, parent ? `${parent.name} > ${c.name}` : c.name];
      }
      return [c.id, c.name];
    }),
  );

  const sortedRules = useMemo(() => {
    const sorted = [...rules].sort((a, b) => {
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
  }, [rules, sortField, sortDir, categoryMap]);

  async function handleReapply() {
    setBanner(null);
    setError(null);
    try {
      const count = await reapplyAllRules();
      setBanner(`Re-applied rules: ${count} transaction${count !== 1 ? "s" : ""} categorized.`);
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to re-apply rules.");
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
      setError(typeof err === "string" ? err : "Failed to save rule.");
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
      setError(typeof err === "string" ? err : "Failed to delete rule.");
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
            onClick={handleReapply}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Re-apply All Rules
          </button>
          <button
            onClick={() => {
              setEditingRule(null);
              setShowForm(true);
              setError(null);
            }}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            Add Rule
          </button>
        </div>
      </div>

      {banner && (
        <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-4 py-2 rounded-md">
          {banner}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      ) : rules.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-12 text-sm">
          No rules yet. Create one from the Categorize page or add one manually.
        </p>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("pattern")}>Pattern{sortIndicator("pattern")}</th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("match_field")}>Field{sortIndicator("match_field")}</th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("match_type")}>Match{sortIndicator("match_type")}</th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("category")}>Category{sortIndicator("category")}</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort("priority")}>Priority{sortIndicator("priority")}</th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("auto_apply")}>Auto{sortIndicator("auto_apply")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {sortedRules.map((rule) => (
                <tr
                  key={rule.id}
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
                        onClick={() => handleEdit(rule)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Edit
                      </button>
                      <button
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
          editingRule={editingRule}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingRule(null);
          }}
        />
      )}

      {deletingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold">Delete Rule</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Delete rule for pattern &quot;{deletingRule.pattern}&quot;?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingRule(null)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md font-medium hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Rule Form (inline component) ---- */

interface RuleFormProps {
  categories: Category[];
  editingRule: CategorizationRule | null;
  onSubmit: (params: CreateRuleParams) => void;
  onCancel: () => void;
}

function RuleForm({
  categories,
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
  const [categoryId, setCategoryId] = useState(
    editingRule?.category_id ?? "",
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

  const directionOrder = ["income", "expense", "transfer", "adjustment"] as const;
  const directionLabels: Record<string, string> = {
    income: "Income",
    expense: "Expense",
    transfer: "Transfer",
    adjustment: "Adjustment",
  };
  const parents = categories.filter((c) => c.parent_id === null);
  const children = categories.filter((c) => c.parent_id !== null);

  const byDirection = directionOrder
    .map((dir) => {
      const dirParents = parents
        .filter((c) => c.direction === dir)
        .sort((a, b) => a.sort_order - b.sort_order);
      const groups = dirParents.map((parent) => {
        const kids = children
          .filter((c) => c.parent_id === parent.id)
          .sort((a, b) => a.sort_order - b.sort_order);
        return { parent, children: kids };
      });
      return { direction: dir, label: directionLabels[dir], groups };
    })
    .filter((d) => d.groups.length > 0);

  function handleSubmit(e: React.FormEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    if (!pattern.trim() || !categoryId) return;
    onSubmit({
      pattern: pattern.trim(),
      match_field: matchField,
      match_type: matchType,
      category_id: categoryId,
      amount_min: amountMin ? parseFloat(amountMin) : undefined,
      amount_max: amountMax ? parseFloat(amountMax) : undefined,
      priority,
      auto_apply: autoApply,
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
          {editingRule ? "Edit Rule" : "Add Rule"}
        </h2>

        <div>
          <label className="block text-sm font-medium mb-1">Pattern</label>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className={inputClass}
            autoFocus
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Field</label>
          <select
            value={matchField}
            onChange={(e) => setMatchField(e.target.value)}
            className={inputClass}
          >
            <option value="description">Description</option>
            <option value="payee">Payee</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Match Type</label>
          <select
            value={matchType}
            onChange={(e) => setMatchType(e.target.value)}
            className={inputClass}
          >
            <option value="contains">Contains</option>
            <option value="starts_with">Starts with</option>
            <option value="exact">Exact match</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Select a category</option>
            {byDirection.map((dirGroup) => (
              <optgroup
                key={dirGroup.direction}
                label={`--- ${dirGroup.label} ---`}
              >
                {dirGroup.groups.flatMap((g) =>
                  g.children.length === 0
                    ? [
                        <option key={g.parent.id} value={g.parent.id}>
                          {g.parent.name}
                        </option>,
                      ]
                    : [
                        <option key={g.parent.id} value={g.parent.id}>
                          {g.parent.name}
                        </option>,
                        ...g.children.map((child) => (
                          <option key={child.id} value={child.id}>
                            {"  \u2514 " + child.name}
                          </option>
                        )),
                      ],
                )}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Min Amount</label>
            <input
              type="number"
              step="0.01"
              placeholder="Any"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Amount</label>
            <input
              type="number"
              step="0.01"
              placeholder="Any"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Priority</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
            className={inputClass}
          />
        </div>

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
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            {editingRule ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
