import { useState, useEffect } from "react";
import { previewCsvFile } from "../../lib/tauri";
import type { CsvPreview, CsvColumnMapping } from "../../lib/types";

interface CsvMappingStepProps {
  fileContent: string;
  onMappingComplete: (mapping: CsvColumnMapping) => void;
  onCancel: () => void;
}

const DATE_FORMATS = [
  { label: "YYYY-MM-DD", value: "%Y-%m-%d" },
  { label: "MM/DD/YYYY", value: "%m/%d/%Y" },
  { label: "DD/MM/YYYY", value: "%d/%m/%Y" },
  { label: "M/D/YYYY", value: "%-m/%-d/%Y" },
  { label: "YYYY/MM/DD", value: "%Y/%m/%d" },
  { label: "DD-MM-YYYY", value: "%d-%m-%Y" },
  { label: "MM-DD-YYYY", value: "%m-%d-%Y" },
  { label: "YYYYMMDD", value: "%Y%m%d" },
];

export default function CsvMappingStep({
  fileContent,
  onMappingComplete,
  onCancel,
}: CsvMappingStepProps) {
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateColumn, setDateColumn] = useState("");
  const [amountColumn, setAmountColumn] = useState("");
  const [descriptionColumn, setDescriptionColumn] = useState("");
  const [payeeColumn, setPayeeColumn] = useState("");
  const [dateFormat, setDateFormat] = useState("%Y-%m-%d");

  useEffect(() => {
    previewCsvFile(fileContent)
      .then((p) => {
        setPreview(p);
        if (p.columns.length > 0) {
          const cols = p.columns.map((c) => c.toLowerCase());
          setDateColumn(
            p.columns[cols.findIndex((c) => c.includes("date"))] ??
              p.columns[0],
          );
          setAmountColumn(
            p.columns[cols.findIndex((c) => c.includes("amount"))] ?? "",
          );
          setDescriptionColumn(
            p.columns[
              cols.findIndex(
                (c) => c.includes("desc") || c.includes("memo"),
              )
            ] ?? "",
          );
          setPayeeColumn(
            p.columns[cols.findIndex((c) => c.includes("payee"))] ?? "",
          );
        }
      })
      .catch((err) => {
        setError(typeof err === "string" ? err : "Failed to parse CSV.");
      });
  }, [fileContent]);

  function handleSubmit() {
    if (!dateColumn || !amountColumn || !descriptionColumn) {
      setError("Date, amount, and description columns are required.");
      return;
    }
    const mapping: CsvColumnMapping = {
      date_column: dateColumn,
      amount_column: amountColumn,
      description_column: descriptionColumn,
      date_format: dateFormat,
    };
    if (payeeColumn) {
      mapping.payee_column = payeeColumn;
    }
    onMappingComplete(mapping);
  }

  if (error && !preview) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          Back
        </button>
      </div>
    );
  }

  if (!preview) {
    return <p className="text-sm text-gray-500">Parsing CSV...</p>;
  }

  const columnOptions = preview.columns.map((c) => (
    <option key={c} value={c}>
      {c}
    </option>
  ));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-3">CSV Preview (first 5 rows)</h3>
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                {preview.columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 5).map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-100 dark:border-gray-800"
                >
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="px-3 py-2 text-gray-900 dark:text-gray-100"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium mb-1">
            Date column <span className="text-red-500">*</span>
          </label>
          <select
            value={dateColumn}
            onChange={(e) => setDateColumn(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Select --</option>
            {columnOptions}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Amount column <span className="text-red-500">*</span>
          </label>
          <select
            value={amountColumn}
            onChange={(e) => setAmountColumn(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Select --</option>
            {columnOptions}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Description column <span className="text-red-500">*</span>
          </label>
          <select
            value={descriptionColumn}
            onChange={(e) => setDescriptionColumn(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Select --</option>
            {columnOptions}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Payee column
          </label>
          <select
            value={payeeColumn}
            onChange={(e) => setPayeeColumn(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- None --</option>
            {columnOptions}
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Date format</label>
          <select
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {DATE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
        >
          Preview Import
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          Back
        </button>
      </div>
    </div>
  );
}
