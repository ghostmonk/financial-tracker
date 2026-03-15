import { useState } from "react";
import type { ImportPreview } from "../../lib/types";
import { formatAmount } from "../../lib/utils";
import { btnClass, btnPrimaryClass } from "../../lib/styles";

interface ImportPreviewStepProps {
  preview: ImportPreview;
  accountName: string;
  fileName: string;
  onImport: (skipDuplicates: boolean) => void;
  onCancel: () => void;
  importing: boolean;
}

export default function ImportPreviewStep({
  preview,
  accountName,
  fileName,
  onImport,
  onCancel,
  importing,
}: ImportPreviewStepProps) {
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const duplicateFitids = new Set(preview.duplicate_fitids);
  const duplicateHashes = new Set(preview.duplicate_hashes);

  function isDuplicate(tx: { fitid: string | null; import_hash: string }) {
    return (
      (tx.fitid !== null && duplicateFitids.has(tx.fitid)) ||
      duplicateHashes.has(tx.import_hash)
    );
  }

  const displayCount = Math.min(preview.parsed.transactions.length, 50);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4 max-w-lg">
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
          <p className="text-xs text-gray-500 dark:text-gray-400">File</p>
          <p className="text-sm font-medium truncate">{fileName}</p>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
          <p className="text-xs text-gray-500 dark:text-gray-400">Account</p>
          <p className="text-sm font-medium">{accountName}</p>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Transactions
          </p>
          <p className="text-sm font-medium">
            {preview.new_count} new, {preview.duplicate_count} duplicates
          </p>
        </div>
      </div>

      {preview.parsed.institution_hint && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Institution: {preview.parsed.institution_hint}
        </p>
      )}

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                Date
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                Description
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                Amount
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                Type
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.parsed.transactions.slice(0, displayCount).map((tx, i) => {
              const dup = isDuplicate(tx);
              return (
                <tr
                  key={i}
                  className={`border-b border-gray-100 dark:border-gray-800 ${
                    dup ? "bg-amber-50 dark:bg-amber-900/20" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {tx.date}
                  </td>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-xs truncate">
                    {tx.description}
                  </td>
                  <td
                    className={`px-3 py-2 text-right whitespace-nowrap ${
                      tx.amount < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-green-600 dark:text-green-400"
                    }`}
                  >
                    {formatAmount(tx.amount)}
                  </td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                    {tx.transaction_type ?? "--"}
                  </td>
                  <td className="px-3 py-2">
                    {dup ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-200">
                        Duplicate
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200">
                        New
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview.parsed.transactions.length > displayCount && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing {displayCount} of {preview.parsed.transactions.length}{" "}
          transactions.
        </p>
      )}

      {preview.duplicate_count > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => setSkipDuplicates(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Skip {preview.duplicate_count} duplicate
          {preview.duplicate_count !== 1 ? "s" : ""}
        </label>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => onImport(skipDuplicates)}
          disabled={importing}
          className={btnPrimaryClass}
        >
          {importing ? "Importing..." : "Import"}
        </button>
        <button
          onClick={onCancel}
          disabled={importing}
          className={btnClass}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
