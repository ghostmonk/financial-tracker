import { useState } from "react";
import type {
  UncategorizedGroup,
  Category,
  CreateRuleParams,
} from "../../lib/types";

interface GroupCategorizeDialogProps {
  group: UncategorizedGroup;
  categories: Category[];
  onConfirm: (params: CreateRuleParams) => void;
  onCancel: () => void;
}

export default function GroupCategorizeDialog({
  group,
  categories,
  onConfirm,
  onCancel,
}: GroupCategorizeDialogProps) {
  const [categoryId, setCategoryId] = useState("");
  const [matchType, setMatchType] = useState("contains");

  const incomeCategories = categories.filter(
    (c) => c.category_type === "income",
  );
  const expenseCategories = categories.filter(
    (c) => c.category_type !== "income",
  );

  function handleSubmit(e: React.FormEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    if (!categoryId) return;
    onConfirm({
      pattern: group.normalized_name,
      match_field: "description",
      match_type: matchType,
      category_id: categoryId,
      auto_apply: true,
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
        <div>
          <h2 className="text-lg font-semibold">Categorize Group</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            &quot;{group.normalized_name}&quot; &mdash;{" "}
            {group.transaction_count} transaction
            {group.transaction_count !== 1 ? "s" : ""}
          </p>
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
            {incomeCategories.length > 0 && (
              <optgroup label="Income">
                {incomeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.is_business_default ? "\u25C6 " : ""}
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {expenseCategories.length > 0 && (
              <optgroup label="Expense">
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.is_business_default ? "\u25C6 " : ""}
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
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
            Create Rule &amp; Categorize
          </button>
        </div>
      </form>
    </div>
  );
}
