import { useMemo } from "react";
import type { Category } from "../../lib/types";
import Modal from "./Modal";
import { useKeyboardNav } from "../../lib/useKeyboardNav";
import { focusedRowClass } from "../../lib/styles";

interface CategoryPickerModalProps {
  open: boolean;
  parentCategory: Category | null;
  childCategories: Category[];
  onSelect: (categoryId: string) => void;
  onClose: () => void;
}

export default function CategoryPickerModal({
  open,
  parentCategory,
  childCategories,
  onSelect,
  onClose,
}: CategoryPickerModalProps) {
  const items = useMemo(() => {
    if (!parentCategory) return [];
    const sorted = [...childCategories].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    return [parentCategory, ...sorted];
  }, [parentCategory, childCategories]);

  const { focusedIndex } = useKeyboardNav({
    itemCount: items.length,
    enabled: open,
    onEnter: (index) => {
      onSelect(items[index].id);
    },
    onEscape: onClose,
  });

  if (!parentCategory) return null;

  return (
    <Modal open={open} onClose={onClose} title={parentCategory.name} width="sm">
      <div className="space-y-1">
        {items.map((cat, index) => {
          const isParent = cat.id === parentCategory.id;
          const isFocused = index === focusedIndex;
          return (
            <button
              key={cat.id}
              data-nav-index={index}
              onClick={() => onSelect(cat.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                isParent ? "font-semibold" : "pl-6"
              } ${
                isFocused
                  ? focusedRowClass
                  : "hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {cat.name}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
