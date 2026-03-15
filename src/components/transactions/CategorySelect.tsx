import { useRef, useState, useMemo, useCallback } from "react";
import type { Category } from "../../lib/types";
import { useClickOutside } from "../../lib/hooks";

interface CategorySelectProps {
  categories: Category[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  onClose?: () => void;
  inline?: boolean;
}

type Direction = Category["direction"];

const DIRECTION_LABELS: Record<Direction, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

const DIRECTION_ORDER: Direction[] = [
  "income",
  "expense",
  "transfer",
  "adjustment",
];

export default function CategorySelect({
  categories,
  value,
  onChange,
  onClose,
  inline = false,
}: CategorySelectProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const handleClickOutside = useCallback(() => {
    if (inline) {
      onClose?.();
    } else {
      setOpen(false);
    }
  }, [inline, onClose]);

  useClickOutside(ref, handleClickOutside);

  function handleSelect(categoryId: string | null) {
    onChange(categoryId);
    setOpen(false);
    setSearchTerm("");
    onClose?.();
  }

  function toggleOpen() {
    setOpen((prev) => !prev);
    if (open) {
      setSearchTerm("");
    }
  }

  const matchesSearch = (name: string) =>
    !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase());

  const selectedCategory = categories.find((c) => c.id === value) ?? null;

  const parents = categories.filter((c) => c.parent_id === null);
  const children = categories.filter((c) => c.parent_id !== null);

  const filteredByDirection = useMemo(() => {
    return DIRECTION_ORDER.map((dir) => {
      const dirParents = parents
        .filter((c) => c.direction === dir)
        .sort((a, b) => a.sort_order - b.sort_order);

      const groups = dirParents
        .map((parent) => {
          const kids = children
            .filter((c) => c.parent_id === parent.id)
            .sort((a, b) => a.sort_order - b.sort_order);

          const parentMatches = matchesSearch(parent.name);
          const matchingKids = kids.filter((c) => matchesSearch(c.name));

          if (!parentMatches && matchingKids.length === 0) return null;

          return {
            parent,
            children: parentMatches ? kids : matchingKids,
          };
        })
        .filter(
          (g): g is { parent: Category; children: Category[] } => g !== null
        );

      return { direction: dir, label: DIRECTION_LABELS[dir], groups };
    }).filter((d) => d.groups.length > 0);
  }, [categories, searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  const showDropdown = open || inline;

  const optionBase =
    "w-full text-left px-2 py-1.5 text-sm rounded cursor-pointer";
  const optionIdle =
    "text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700";
  const optionSelected =
    "bg-blue-100 dark:bg-blue-900 text-gray-900 dark:text-gray-100 hover:bg-blue-200 dark:hover:bg-blue-800";

  return (
    <div ref={ref} className="relative">
      {!inline && (
        <button
          type="button"
          onClick={toggleOpen}
          className="w-full px-3 py-2 text-left border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          {selectedCategory?.name ?? "Select category"}
        </button>
      )}

      {showDropdown && (
        <div
          className={`${inline ? "absolute z-20 mt-1" : "absolute z-50 mt-1"} w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg`}
        >
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              placeholder="Search categories..."
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`${optionBase} ${value === null ? optionSelected : optionIdle}`}
            >
              Uncategorized
            </button>

            {filteredByDirection.map((dirGroup) => (
              <div key={dirGroup.direction}>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase px-2 py-1 mt-1">
                  {dirGroup.label}
                </div>
                {dirGroup.groups.map((g) => (
                  <div key={g.parent.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(g.parent.id)}
                      className={`${optionBase} font-medium ${value === g.parent.id ? optionSelected : optionIdle}`}
                    >
                      {g.parent.name}
                    </button>
                    {g.children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => handleSelect(child.id)}
                        className={`${optionBase} pl-5 ${value === child.id ? optionSelected : optionIdle}`}
                      >
                        <span className="text-gray-400 dark:text-gray-500 mr-1">
                          └
                        </span>
                        {child.name}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
