import { useNavigate } from "react-router-dom";
import type { ImportResult } from "../../lib/types";
import { btnClass, btnPrimaryClass } from "../../lib/styles";

interface ImportResultStepProps {
  result: ImportResult;
  onReset: () => void;
}

export default function ImportResultStep({
  result,
  onReset,
}: ImportResultStepProps) {
  const navigate = useNavigate();

  return (
    <div className="max-w-lg space-y-6">
      <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
        <h3 className="text-lg font-medium text-green-800 dark:text-green-200 mb-2">
          Import Complete
        </h3>
        <p className="text-sm text-green-700 dark:text-green-300">
          Imported <span data-testid="result-imported-count">{result.imported_count}</span> transaction
          {result.imported_count !== 1 ? "s" : ""}.
          {result.skipped_count > 0 && (
            <span>
              {" "}
              {result.skipped_count} duplicate
              {result.skipped_count !== 1 ? "s" : ""} skipped.
            </span>
          )}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          data-testid="result-import-another"
          onClick={onReset}
          className={btnPrimaryClass}
        >
          Import Another File
        </button>
        <button
          data-testid="result-view-transactions"
          onClick={() => navigate("/transactions")}
          className={btnClass}
        >
          View Transactions
        </button>
      </div>
    </div>
  );
}
