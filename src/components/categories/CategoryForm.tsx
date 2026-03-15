import { useState, useEffect } from "react";
import type { Category, CreateCategoryParams } from "../../lib/types";
import { inputClass, btnClass, btnPrimaryClass } from "../../lib/styles";
import Modal from "../shared/Modal";
import FormField from "../shared/FormField";

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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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

  return (
    <Modal open={true} onClose={onCancel} title={editingCategory ? "Edit Category" : "Add Category"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name">
          <input
            data-testid="category-form-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className={inputClass}
            autoFocus
            required
          />
        </FormField>

        <FormField label="Slug" hint="Auto-generated from name. Edit to customize.">
          <input
            data-testid="category-form-slug"
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            className={inputClass}
            required
          />
        </FormField>

        <FormField label="Direction">
          <select
            data-testid="category-form-direction"
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
        </FormField>

        <FormField label="Parent Category">
          <select
            data-testid="category-form-parent"
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
        </FormField>

        <FormField label="Sort Order">
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
            className={inputClass}
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className={btnClass}
          >
            Cancel
          </button>
          <button
            data-testid="category-form-submit"
            type="submit"
            className={btnPrimaryClass}
          >
            {editingCategory ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
