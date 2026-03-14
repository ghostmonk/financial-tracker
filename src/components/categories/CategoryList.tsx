import type { Category } from "../../lib/types";

interface CategoryListProps {
  categories: Category[];
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

type GroupLabel = "Income" | "Personal Expense" | "Business Expense";

const TYPE_ORDER: { type: string; label: GroupLabel }[] = [
  { type: "income", label: "Income" },
  { type: "expense", label: "Personal Expense" },
  { type: "business_expense", label: "Business Expense" },
];

export default function CategoryList({
  categories,
  onEdit,
  onDelete,
}: CategoryListProps) {
  if (categories.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium">No categories</p>
        <p className="text-sm mt-1">Create a category to get started.</p>
      </div>
    );
  }

  const grouped = new Map<string, Category[]>();
  for (const cat of categories) {
    const list = grouped.get(cat.category_type) ?? [];
    list.push(cat);
    grouped.set(cat.category_type, list);
  }

  function buildTree(cats: Category[]) {
    const topLevel = cats
      .filter((c) => !c.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const children = new Map<string, Category[]>();
    for (const c of cats) {
      if (c.parent_id) {
        const list = children.get(c.parent_id) ?? [];
        list.push(c);
        children.set(c.parent_id, list);
      }
    }
    return { topLevel, children };
  }

  const thClass =
    "px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800";
  const tdClass =
    "px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-800";

  function renderRow(cat: Category, indent: boolean) {
    return (
      <tr
        key={cat.id}
        className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        <td className={`${tdClass} text-gray-900 dark:text-gray-100`}>
          {indent && (
            <span className="text-gray-400 dark:text-gray-600 mr-2">
              └
            </span>
          )}
          {cat.name}
        </td>
        <td className={`${tdClass} text-gray-600 dark:text-gray-400`}>
          {cat.category_type === "income"
            ? "Income"
            : cat.category_type === "business_expense"
              ? "Business Expense"
              : "Expense"}
        </td>
        <td className={`${tdClass} text-center`}>
          {cat.is_business_default && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              Biz Default
            </span>
          )}
        </td>
        <td className={`${tdClass} text-right`}>
          <button
            onClick={() => onEdit(cat)}
            className="text-xs px-2 py-1 text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(cat)}
            className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:underline ml-2"
          >
            Delete
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      {TYPE_ORDER.map(({ type, label }) => {
        const cats = grouped.get(type);
        if (!cats || cats.length === 0) return null;
        const { topLevel, children } = buildTree(cats);

        return (
          <div key={type}>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {label}
            </h3>
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className={thClass}>Name</th>
                    <th className={thClass}>Type</th>
                    <th className={`${thClass} text-center`}>Flags</th>
                    <th className={`${thClass} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {topLevel.map((parent) => {
                    const subs = (children.get(parent.id) ?? []).sort(
                      (a, b) => a.sort_order - b.sort_order,
                    );
                    return [
                      renderRow(parent, false),
                      ...subs.map((sub) => renderRow(sub, true)),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
