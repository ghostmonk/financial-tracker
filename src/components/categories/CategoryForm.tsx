import { useState, useEffect } from "react";
import type { Category, CreateCategoryParams } from "../../lib/types";

interface CategoryFormProps {
  categories: Category[];
  editingCategory?: Category | null;
  onSubmit: (params: CreateCategoryParams) => void;
  onCancel: () => void;
}

export default function CategoryForm({
  categories,
  editingCategory,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const [name, setName] = useState("");
  const [categoryType, setCategoryType] = useState("expense");
  const [parentId, setParentId] = useState<string | null>(null);
  const [isBusinessDefault, setIsBusinessDefault] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (editingCategory) {
      setName(editingCategory.name);
      setCategoryType(editingCategory.category_type);
      setParentId(editingCategory.parent_id);
      setIsBusinessDefault(editingCategory.is_business_default);
      setSortOrder(editingCategory.sort_order);
    } else {
      setName("");
      setCategoryType("expense");
      setParentId(null);
      setIsBusinessDefault(false);
      setSortOrder(0);
    }
  }, [editingCategory]);

  const parentOptions = categories.filter(
    (c) =>
      c.category_type === categoryType &&
      c.parent_id === null &&
      c.id !== editingCategory?.id,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      category_type: categoryType,
      parent_id: parentId || null,
      is_business_default: isBusinessDefault,
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
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            autoFocus
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            value={categoryType}
            onChange={(e) => {
              setCategoryType(e.target.value);
              setParentId(null);
            }}
            className={inputClass}
          >
            <option value="income">Income</option>
            <option value="expense">Personal Expense</option>
            <option value="business_expense">Business Expense</option>
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

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isBusinessDefault}
            onChange={(e) => setIsBusinessDefault(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Default business category
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
            {editingCategory ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
