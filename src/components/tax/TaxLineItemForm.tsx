import { useState, useEffect, useMemo } from "react";
import type {
  Category,
  TaxRules,
  TaxLineItem,
} from "../../lib/types";
import { createTaxLineItem, updateTaxLineItem } from "../../lib/tauri";

interface TaxLineItemFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  categories: Category[];
  taxRules: TaxRules;
  fiscalYear: number;
  editItem?: TaxLineItem | null;
}

export default function TaxLineItemForm({
  open,
  onClose,
  onSaved,
  categories,
  taxRules,
  fiscalYear,
  editItem,
}: TaxLineItemFormProps) {
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Filter categories to only those with line mappings
  const taxCategories = useMemo(() => {
    const mappedSlugs = new Set(
      taxRules.line_mappings.map((lm) => lm.category_slug),
    );
    return categories.filter((c) => mappedSlugs.has(c.slug));
  }, [categories, taxRules]);

  // Reset form when opening or editItem changes
  useEffect(() => {
    if (!open) return;
    if (editItem) {
      setDate(editItem.date);
      setDescription(editItem.description);
      setAmount(Math.abs(editItem.amount).toFixed(2));
      setCategoryId(editItem.category_id);
      setNotes(editItem.notes || "");
    } else {
      setDate(`${fiscalYear}-01-01`);
      setDescription("");
      setAmount("");
      setCategoryId(null);
      setNotes("");
    }
  }, [open, editItem, fiscalYear]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!description || !amount || !categoryId) return;
    setSaving(true);
    try {
      const amountNum = parseFloat(amount);
      if (editItem) {
        await updateTaxLineItem(editItem.id, {
          date,
          description,
          amount: amountNum,
          category_id: categoryId,
          notes: notes || null,
        });
      } else {
        await createTaxLineItem({
          date,
          description,
          amount: amountNum,
          category_id: categoryId,
          notes: notes || null,
          fiscal_year: fiscalYear,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to save tax line item:", err);
    } finally {
      setSaving(false);
    }
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
          {editItem ? "Edit Line Item" : "Add Line Item"}
        </h2>

        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Amount</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <select
            value={categoryId || ""}
            onChange={(e) => setCategoryId(e.target.value || null)}
            required
            className={inputClass}
          >
            <option value="">Select category</option>
            {taxCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {categoryId && (() => {
            const selectedCat = taxCategories.find((c) => c.id === categoryId);
            const mapping = selectedCat
              ? taxRules.line_mappings.find((lm) => lm.category_slug === selectedCat.slug)
              : null;
            return mapping?.hint ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {mapping.hint}
              </p>
            ) : null;
          })()}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !description || !amount || !categoryId}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : editItem ? "Update" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
