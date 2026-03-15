import { useState, useEffect, useCallback, useMemo } from "react";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listTags,
  createTag,
  deleteTag,
  listHotkeys,
  setHotkey,
  removeHotkey,
} from "../lib/tauri";
import type {
  Category,
  CreateCategoryParams,
  Tag,
  CategoryHotkey,
} from "../lib/types";
import { parseError } from "../lib/utils";
import { btnClass, btnPrimaryClass, btnDangerClass } from "../lib/styles";
import { useKeyboardNav } from "../lib/useKeyboardNav";
import Modal from "../components/shared/Modal";
import CategoryList, {
  flattenCategories,
} from "../components/categories/CategoryList";
import CategoryForm from "../components/categories/CategoryForm";

interface ConflictInfo {
  key: string;
  existingCategoryName: string;
  newCategoryId: string;
}

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

  const [hotkeys, setHotkeys] = useState<CategoryHotkey[]>([]);
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(
    new Set(),
  );

  const flatCats = useMemo(
    () => flattenCategories(categories, collapsedParents),
    [categories, collapsedParents],
  );

  const hotkeyByKey = useMemo(() => {
    const map = new Map<string, CategoryHotkey>();
    for (const hk of hotkeys) {
      map.set(hk.key, hk);
    }
    return map;
  }, [hotkeys]);

  const hotkeyByCategoryId = useMemo(() => {
    const map = new Map<string, string>();
    for (const hk of hotkeys) {
      map.set(hk.category_id, hk.key);
    }
    return map;
  }, [hotkeys]);

  const handleHotkeyKeyPress = useCallback(
    async (key: string, shiftKey: boolean, focusedIdx: number) => {
      const cat = flatCats[focusedIdx];
      if (!cat) return;

      if (key === "Backspace") {
        const existingKey = hotkeyByCategoryId.get(cat.id);
        if (existingKey) {
          try {
            await removeHotkey(existingKey);
            const updated = await listHotkeys();
            setHotkeys(updated);
          } catch (err) {
            console.error("Failed to remove hotkey:", err);
          }
        }
        return;
      }

      // Only allow hotkey assignment on parent categories
      if (cat.parent_id !== null) return;

      const hotkeyKey = shiftKey ? key.toUpperCase() : key.toLowerCase();

      const existing = hotkeyByKey.get(hotkeyKey);
      if (existing && existing.category_id !== cat.id) {
        const existingCat = categories.find(
          (c) => c.id === existing.category_id,
        );
        setConflictInfo({
          key: hotkeyKey,
          existingCategoryName: existingCat?.name ?? "Unknown",
          newCategoryId: cat.id,
        });
        return;
      }

      try {
        await setHotkey({ key: hotkeyKey, category_id: cat.id });
        const updated = await listHotkeys();
        setHotkeys(updated);
      } catch (err) {
        console.error("Failed to set hotkey:", err);
      }
    },
    [flatCats, hotkeyByKey, hotkeyByCategoryId, categories],
  );

  const handleArrowRight = useCallback(
    (index: number) => {
      const cat = flatCats[index];
      if (!cat || cat.parent_id !== null) return;
      // Expand: remove from collapsed set
      setCollapsedParents((prev) => {
        const next = new Set(prev);
        next.delete(cat.id);
        return next;
      });
    },
    [flatCats],
  );

  const handleArrowLeft = useCallback(
    (index: number) => {
      const cat = flatCats[index];
      if (!cat) return;
      if (cat.parent_id !== null) {
        // On a child: collapse the parent
        setCollapsedParents((prev) => {
          const next = new Set(prev);
          next.add(cat.parent_id!);
          return next;
        });
      } else {
        // On a parent: collapse it
        setCollapsedParents((prev) => {
          const next = new Set(prev);
          next.add(cat.id);
          return next;
        });
      }
    },
    [flatCats],
  );

  const { focusedIndex } = useKeyboardNav({
    itemCount: flatCats.length,
    enabled: !showForm && !deletingCategory && !conflictInfo && !loading,
    onKeyPress: handleHotkeyKeyPress,
    onRight: handleArrowRight,
    onLeft: handleArrowLeft,
  });

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

  const fetchHotkeys = useCallback(async () => {
    try {
      const result = await listHotkeys();
      setHotkeys(result);
    } catch (err) {
      console.error("Failed to fetch hotkeys:", err);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchTags();
    fetchHotkeys();
  }, [fetchCategories, fetchTags, fetchHotkeys]);

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
      setError(parseError(err));
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
      setError(parseError(err));
      setDeletingCategory(null);
    }
  }

  async function handleConfirmReassign() {
    if (!conflictInfo) return;
    try {
      await setHotkey({
        key: conflictInfo.key,
        category_id: conflictInfo.newCategoryId,
      });
      const updated = await listHotkeys();
      setHotkeys(updated);
    } catch (err) {
      console.error("Failed to reassign hotkey:", err);
    } finally {
      setConflictInfo(null);
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
      setTagError(parseError(err));
    }
  }

  async function handleDeleteTag(id: string) {
    setTagError(null);
    try {
      await deleteTag(id);
      fetchTags();
    } catch (err) {
      setTagError(parseError(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Categories</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
            {" — "}
            <span className="text-gray-400 dark:text-gray-500">
              Use arrow keys to navigate, press a letter to assign a hotkey
            </span>
          </p>
        </div>
        <button
          data-testid="categories-add-btn"
          onClick={() => {
            setEditingCategory(null);
            setShowForm(true);
            setError(null);
          }}
          className={btnPrimaryClass}
        >
          Add Category
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {loading ? (
        <p
          data-testid="categories-loading"
          className="text-gray-500 dark:text-gray-400 text-sm"
        >
          Loading...
        </p>
      ) : (
        <CategoryList
          categories={categories}
          hotkeys={hotkeys}
          focusedIndex={focusedIndex}
          collapsedParents={collapsedParents}
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

      <Modal
        open={!!deletingCategory}
        onClose={() => setDeletingCategory(null)}
        title="Delete Category"
        width="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Delete &quot;{deletingCategory?.name}&quot;? Transactions using this
          category will become uncategorized.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => setDeletingCategory(null)}
            className={btnClass}
          >
            Cancel
          </button>
          <button onClick={handleConfirmDelete} className={btnDangerClass}>
            Delete
          </button>
        </div>
      </Modal>

      <Modal
        open={!!conflictInfo}
        onClose={() => setConflictInfo(null)}
        title="Reassign Hotkey"
        width="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Key{" "}
          <span className="font-mono font-bold">[{conflictInfo?.key}]</span> is
          already assigned to &quot;{conflictInfo?.existingCategoryName}&quot;.
          Reassign it?
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => setConflictInfo(null)}
            className={btnClass}
          >
            Cancel
          </button>
          <button onClick={handleConfirmReassign} className={btnPrimaryClass}>
            Reassign
          </button>
        </div>
      </Modal>

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
            data-testid="tag-input"
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
            data-testid="tag-add-btn"
            onClick={handleAddTag}
            disabled={!newTagName.trim()}
            className={btnPrimaryClass}
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
                data-testid={`tag-badge-${tag.id}`}
                className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-full"
              >
                {tag.name}
                <button
                  data-testid={`tag-delete-${tag.id}`}
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
