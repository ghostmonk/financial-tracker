import { useState, useEffect } from "react";
import type { Category, CreateCategoryParams } from "../../lib/types";

interface CategoryFormProps {
  categories: Category[];
  editingCategory?: Category | null;
  onSubmit: (params: CreateCategoryParams) => void;
  onCancel: () => void;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function CategoryForm({
  categories,
  editingCategory,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [direction, setDirection] = useState<Category["direction"]>("expense");
  const [parentId, setParentId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (editingCategory) {
      setName(editingCategory.name);
      setSlug(editingCategory.slug);
      setSlugTouched(true);
      setDirection(editingCategory.direction);
      setParentId(editingCategory.parent_id);
      setSortOrder(editingCategory.sort_order);
    } else {
      setName("");
      setSlug("");
      setSlugTouched(false);
      setDirection("expense");
      setParentId(null);
      setSortOrder(0);
    }
  }, [editingCategory]);

  const parentOptions = categories.filter(
    (c) =>
      c.direction === direction &&
      c.parent_id === null &&
      c.id !== editingCategory?.id,
  );

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(toSlug(value));
    }
  }

  function handleSubmit(e: React.FormEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    onSubmit({
      name: name.trim(),
      slug: slug.trim(),
      direction,
      parent_id: parentId || null,
      sort_order: sortOrder,
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
          {editingCategory ? "Edit Category" : "Add Category"}
        </h2>

        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className={inputClass}
            autoFocus
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            className={inputClass}
            required
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Auto-generated from name. Edit to customize.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Direction</label>
          <select
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as Category["direction"]);
              setParentId(null);
            }}
            className={inputClass}
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfer</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Parent Category
          </label>
          <select
            value={parentId ?? ""}
            onChange={(e) => setParentId(e.target.value || null)}
            className={inputClass}
          >
            <option value="">None (top-level)</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Sort Order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
            className={inputClass}
          />
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
            {editingCategory ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
