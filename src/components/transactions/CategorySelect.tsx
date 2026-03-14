import { useRef, useEffect } from "react";
import type { Category } from "../../lib/types";

interface CategorySelectProps {
  categories: Category[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  onClose?: () => void;
  inline?: boolean;
}

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

  const incomeCategories = categories.filter(
    (c) => c.category_type === "income",
  );
  const expenseCategories = categories.filter(
    (c) => c.category_type === "expense",
  );

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    onChange(val === "" ? null : val);
    onClose?.();
  }

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
        {incomeCategories.length > 0 && (
          <optgroup label="Income">
            {incomeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.is_business_default ? "\u25C6 " : ""}
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
        {expenseCategories.length > 0 && (
          <optgroup label="Expense">
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.is_business_default ? "\u25C6 " : ""}
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
