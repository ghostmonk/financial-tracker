import { useState, useEffect } from "react";
import FileSelector from "../components/import/FileSelector";
import CsvMappingStep from "../components/import/CsvMappingStep";
import ImportPreviewStep from "../components/import/ImportPreviewStep";
import ImportResultStep from "../components/import/ImportResultStep";
import {
  parseAndPreviewCsv,
  parseAndPreviewOfx,
  executeImport,
  listAccounts,
} from "../lib/tauri";
import type {
  CsvColumnMapping,
  ImportPreview,
  ImportResult,
  Account,
} from "../lib/types";

type ImportStep = "select" | "csv-mapping" | "preview" | "result";

export default function ImportPage() {
  const [step, setStep] = useState<ImportStep>("select");
  const [fileContent, setFileContent] = useState("");
  const [fileType, setFileType] = useState<"csv" | "ofx" | "qfx">("csv");
  const [fileName, setFileName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  const accountName =
    accounts.find((a) => a.id === accountId)?.name ?? "Unknown";

  function reset() {
    setStep("select");
    setFileContent("");
    setFileType("csv");
    setFileName("");
    setAccountId("");
    setPreview(null);
    setResult(null);
    setError(null);
    listAccounts().then(setAccounts).catch(() => {});
  }

  async function handleFileSelected(
    content: string,
    type: "csv" | "ofx" | "qfx",
    name: string,
    acctId: string,
  ) {
    setFileContent(content);
    setFileType(type);
    setFileName(name);
    setAccountId(acctId);
    setError(null);

    if (type === "csv") {
      setStep("csv-mapping");
    } else {
      setLoading(true);
      try {
        const p = await parseAndPreviewOfx(content, acctId);
        setPreview(p);
        setStep("preview");
      } catch (err) {
        setError(typeof err === "string" ? err : "Failed to parse OFX file.");
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleMappingComplete(mapping: CsvColumnMapping) {
    setError(null);
    setLoading(true);
    try {
      const p = await parseAndPreviewCsv(fileContent, mapping, accountId);
      setPreview(p);
      setStep("preview");
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to parse CSV.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(skipDuplicates: boolean) {
    if (!preview) return;
    setError(null);
    setImporting(true);
    try {
      const r = await executeImport(
        accountId,
        fileName,
        fileType,
        preview.parsed.transactions,
        skipDuplicates ? preview.duplicate_fitids : [],
        skipDuplicates ? preview.duplicate_hashes : [],
      );
      setResult(r);
      setStep("result");
    } catch (err) {
      setError(typeof err === "string" ? err : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const stepLabels: Record<ImportStep, string> = {
    select: "Select File",
    "csv-mapping": "Map Columns",
    preview: "Preview",
    result: "Done",
  };

  const stepOrder: ImportStep[] = ["select", "csv-mapping", "preview", "result"];
  const currentIndex = stepOrder.indexOf(step);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Import</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Import transactions from OFX, QFX, or CSV files.
      </p>

      <div className="flex gap-2 mb-8">
        {stepOrder.map((s, i) => {
          if (s === "csv-mapping" && fileType !== "csv" && step !== "csv-mapping") {
            return null;
          }
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && (
                <div className="w-8 h-px bg-gray-300 dark:bg-gray-600" />
              )}
              <div
                className={`px-3 py-1 text-xs rounded-full ${
                  i < currentIndex
                    ? "bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200"
                    : i === currentIndex
                      ? "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                }`}
              >
                {stepLabels[s]}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {loading && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Processing...
        </p>
      )}

      {step === "select" && (
        <FileSelector onFileSelected={handleFileSelected} />
      )}

      {step === "csv-mapping" && (
        <CsvMappingStep
          fileContent={fileContent}
          onMappingComplete={handleMappingComplete}
          onCancel={() => setStep("select")}
        />
      )}

      {step === "preview" && preview && (
        <ImportPreviewStep
          preview={preview}
          accountName={accountName}
          fileName={fileName}
          onImport={handleImport}
          onCancel={reset}
          importing={importing}
        />
      )}

      {step === "result" && result && (
        <ImportResultStep result={result} onReset={reset} />
      )}
    </div>
  );
}
