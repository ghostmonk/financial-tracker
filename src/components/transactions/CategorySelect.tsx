import { useRef, useEffect } from "react";
import type { Category } from "../../lib/types";

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

  useEffect(() => {
    if (!inline) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose?.();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inline, onClose]);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    onChange(val === "" ? null : val);
    onClose?.();
  }

  const parents = categories.filter((c) => c.parent_id === null);
  const children = categories.filter((c) => c.parent_id !== null);

  const byDirection = DIRECTION_ORDER.map((dir) => {
    const dirParents = parents
      .filter((c) => c.direction === dir)
      .sort((a, b) => a.sort_order - b.sort_order);

    const groups = dirParents.map((parent) => {
      const kids = children
        .filter((c) => c.parent_id === parent.id)
        .sort((a, b) => a.sort_order - b.sort_order);
      return { parent, children: kids };
    });

    // Standalone categories in this direction (no children)
    const standalone = groups.filter((g) => g.children.length === 0);
    const nested = groups.filter((g) => g.children.length > 0);

    return { direction: dir, label: DIRECTION_LABELS[dir], standalone, nested };
  }).filter((d) => d.standalone.length > 0 || d.nested.length > 0);

  const selectClasses = inline
    ? "w-48 px-2 py-1 text-xs border border-blue-400 dark:border-blue-500 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
    : "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div ref={ref} className={inline ? "absolute z-20 mt-1" : ""}>
      <select
        value={value ?? ""}
        onChange={handleChange}
        className={selectClasses}
        autoFocus={inline}
      >
        <option value="">None</option>
        {byDirection.map((dirGroup) => (
          <optgroup
            key={dirGroup.direction}
            label={`--- ${dirGroup.label} ---`}
          >
            {dirGroup.standalone.map((g) => (
              <option key={g.parent.id} value={g.parent.id}>
                {g.parent.name}
              </option>
            ))}
            {dirGroup.nested.flatMap((g) => [
              <option key={g.parent.id} value={g.parent.id} className="font-semibold">
                {g.parent.name}
              </option>,
              ...g.children.map((child) => (
                <option key={child.id} value={child.id}>
                  {"  \u2514 " + child.name}
                </option>
              )),
            ])}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
