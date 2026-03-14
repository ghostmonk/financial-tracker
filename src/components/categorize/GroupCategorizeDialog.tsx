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
