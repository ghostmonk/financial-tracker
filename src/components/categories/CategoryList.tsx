import type { Category, CategoryHotkey } from "../../lib/types";
import { Th, Td } from "../shared/Table";
import { focusedRowClass } from "../../lib/styles";

interface CategoryListProps {
  categories: Category[];
  hotkeys: CategoryHotkey[];
  focusedIndex: number;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

const DIRECTION_ORDER: { direction: Category["direction"]; label: string }[] = [
  { direction: "income", label: "Income" },
  { direction: "expense", label: "Expense" },
  { direction: "transfer", label: "Transfer" },
  { direction: "adjustment", label: "Adjustment" },
];

export function flattenCategories(categories: Category[]): Category[] {
  const grouped = new Map<string, Category[]>();
  for (const cat of categories) {
    const list = grouped.get(cat.direction) ?? [];
    list.push(cat);
    grouped.set(cat.direction, list);
  }

  const flat: Category[] = [];
  for (const { direction } of DIRECTION_ORDER) {
    const cats = grouped.get(direction);
    if (!cats || cats.length === 0) continue;

    const topLevel = cats
      .filter((c) => !c.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const childrenMap = new Map<string, Category[]>();
    for (const c of cats) {
      if (c.parent_id) {
        const list = childrenMap.get(c.parent_id) ?? [];
        list.push(c);
        childrenMap.set(c.parent_id, list);
      }
    }

    for (const parent of topLevel) {
      flat.push(parent);
      const subs = (childrenMap.get(parent.id) ?? []).sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      for (const sub of subs) {
        flat.push(sub);
      }
    }
  }

  return flat;
}

export default function CategoryList({
  categories,
  hotkeys,
  focusedIndex,
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

  const hotkeyMap = new Map<string, string>();
  for (const hk of hotkeys) {
    hotkeyMap.set(hk.category_id, hk.key);
  }

  const grouped = new Map<string, Category[]>();
  for (const cat of categories) {
    const list = grouped.get(cat.direction) ?? [];
    list.push(cat);
    grouped.set(cat.direction, list);
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

  let rowCounter = 0;

  function renderRow(cat: Category, indent: boolean) {
    const currentIndex = rowCounter++;
    const isFocused = currentIndex === focusedIndex;
    const hotkey = hotkeyMap.get(cat.id);

    return (
      <tr
        key={cat.id}
        data-testid={`category-row-${cat.id}`}
        data-nav-index={currentIndex}
        className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isFocused ? focusedRowClass : ""}`}
      >
        <Td className="text-gray-900 dark:text-gray-100">
          <div className="flex items-center gap-2">
            <div>
              {indent && (
                <span className="text-gray-400 dark:text-gray-600 mr-2">
                  └
                </span>
              )}
              {cat.name}
              <span className="block text-xs text-gray-500 dark:text-gray-400 ml-0">
                {indent && <span className="inline-block w-5" />}
                {cat.slug}
              </span>
            </div>
            {hotkey && (
              <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-mono font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded border border-blue-300 dark:border-blue-700">
                {hotkey}
              </span>
            )}
          </div>
        </Td>
        <Td align="right">
          <button
            data-testid={`category-edit-${cat.id}`}
            onClick={() => onEdit(cat)}
            className="text-xs px-2 py-1 text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
          <button
            data-testid={`category-delete-${cat.id}`}
            onClick={() => onDelete(cat)}
            className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:underline ml-2"
          >
            Delete
          </button>
        </Td>
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      {DIRECTION_ORDER.map(({ direction, label }) => {
        const cats = grouped.get(direction);
        if (!cats || cats.length === 0) return null;
        const { topLevel, children } = buildTree(cats);

        return (
          <div key={direction}>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {label}
            </h3>
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th align="right">Actions</Th>
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
