import { useState } from "react";
import type {
  UncategorizedGroup,
  Category,
  CreateRuleParams,
} from "../../lib/types";
import { inputClass, btnClass, btnPrimaryClass } from "../../lib/styles";
import Modal from "../shared/Modal";
import FormField from "../shared/FormField";
import CategorySelect from "../transactions/CategorySelect";

interface GroupCategorizeDialogProps {
  group: UncategorizedGroup;
  categories: Category[];
  accountId?: string;
  onConfirm: (params: CreateRuleParams) => void;
  onCancel: () => void;
}

export default function GroupCategorizeDialog({
  group,
  categories,
  accountId,
  onConfirm,
  onCancel,
}: GroupCategorizeDialogProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [matchType, setMatchType] = useState("contains");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!categoryId) return;
    onConfirm({
      pattern: group.normalized_name,
      match_field: "description",
      match_type: matchType,
      category_id: categoryId,
      account_id: accountId || null,
      auto_apply: true,
    });
  }

  return (
    <Modal open={true} onClose={onCancel} title="Categorize Group">
      <div data-testid="group-dialog">
        <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2 mb-4">
          &quot;{group.normalized_name}&quot; &mdash;{" "}
          {group.transaction_count} transaction
          {group.transaction_count !== 1 ? "s" : ""}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Category">
            <CategorySelect
              categories={categories}
              value={categoryId}
              onChange={(catId) => setCategoryId(catId)}
            />
          </FormField>

          <FormField label="Match Type">
            <select
              data-testid="group-dialog-match-type"
              value={matchType}
              onChange={(e) => setMatchType(e.target.value)}
              className={inputClass}
            >
              <option value="contains">Contains</option>
              <option value="starts_with">Starts with</option>
              <option value="exact">Exact match</option>
            </select>
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
              data-testid="group-dialog-confirm"
              type="submit"
              disabled={!categoryId}
              className={btnPrimaryClass}
            >
              Create Rule &amp; Categorize
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
