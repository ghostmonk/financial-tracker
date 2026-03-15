import { useState, useEffect, useMemo } from "react";
import type {
  Category,
  TaxRules,
  TaxLineItem,
} from "../../lib/types";
import { createTaxLineItem, updateTaxLineItem } from "../../lib/tauri";
import { inputClass, btnClass, btnPrimaryClass } from "../../lib/styles";
import Modal from "../shared/Modal";
import FormField from "../shared/FormField";

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

  return (
    <Modal open={open} onClose={onClose} title={editItem ? "Edit Line Item" : "Add Line Item"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Date">
          <input
            data-testid="tax-form-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={inputClass}
          />
        </FormField>

        <FormField label="Description">
          <input
            data-testid="tax-form-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className={inputClass}
          />
        </FormField>

        <FormField label="Amount">
          <input
            data-testid="tax-form-amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className={inputClass}
          />
        </FormField>

        <FormField label="Category">
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
        </FormField>

        <FormField label="Notes (optional)">
          <textarea
            data-testid="tax-form-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className={btnClass}
          >
            Cancel
          </button>
          <button
            data-testid="tax-form-submit"
            type="submit"
            disabled={saving || !description || !amount || !categoryId}
            className={btnPrimaryClass}
          >
            {saving ? "Saving..." : editItem ? "Update" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
