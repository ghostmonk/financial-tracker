import { useState, useEffect, useCallback } from "react";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listTags,
  createTag,
  deleteTag,
} from "../lib/tauri";
import type { Category, CreateCategoryParams, Tag } from "../lib/types";
import CategoryList from "../components/categories/CategoryList";
import CategoryForm from "../components/categories/CategoryForm";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    try {
      const result = await listTags();
      setTags(result);
    } catch (err) {
      console.error("Failed to fetch tags:", err);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listCategories();
      setCategories(result);
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchTags();
  }, [fetchCategories, fetchTags]);

  async function handleSubmit(params: CreateCategoryParams) {
    setError(null);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, params);
      } else {
        await createCategory(params);
      }
      setShowForm(false);
      setEditingCategory(null);
      fetchCategories();
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to save category.");
    }
  }

  function handleEdit(category: Category) {
    setEditingCategory(category);
    setShowForm(true);
    setError(null);
  }

  async function handleConfirmDelete() {
    if (!deletingCategory) return;
    setError(null);
    try {
      await deleteCategory(deletingCategory.id);
      setDeletingCategory(null);
      fetchCategories();
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to delete category.");
      setDeletingCategory(null);
    }
  }

  async function handleAddTag() {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    setTagError(null);
    try {
      await createTag(trimmed);
      setNewTagName("");
      fetchTags();
    } catch (err) {
      setTagError(typeof err === "string" ? err : "Failed to create tag.");
    }
  }

  async function handleDeleteTag(id: string) {
    setTagError(null);
    try {
      await deleteTag(id);
      fetchTags();
    } catch (err) {
      setTagError(typeof err === "string" ? err : "Failed to delete tag.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Categories</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingCategory(null);
            setShowForm(true);
            setError(null);
          }}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
        >
          Add Category
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      ) : (
        <CategoryList
          categories={categories}
          onEdit={handleEdit}
          onDelete={setDeletingCategory}
        />
      )}

      {showForm && (
        <CategoryForm
          categories={categories}
          editingCategory={editingCategory}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingCategory(null);
          }}
        />
      )}

      {deletingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold">Delete Category</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Delete &quot;{deletingCategory.name}&quot;? Transactions using
              this category will become uncategorized.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingCategory(null)}
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

      <hr className="border-gray-200 dark:border-gray-700" />

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-1">Tags</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {tags.length} tag{tags.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddTag();
            }}
            placeholder="New tag name"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAddTag}
            disabled={!newTagName.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Tag
          </button>
        </div>

        {tagError && (
          <p className="text-sm text-red-600 dark:text-red-400">{tagError}</p>
        )}

        {tags.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No tags yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-full"
              >
                {tag.name}
                <button
                  onClick={() => handleDeleteTag(tag.id)}
                  className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                  title={`Delete tag "${tag.name}"`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
