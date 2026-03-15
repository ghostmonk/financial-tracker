import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getTaxRules,
  getTaxWorkspaceItems,
  getFiscalYearSettings,
  updateTaxLineItem,
  updateTransaction,
  deleteTaxLineItem,
} from "../lib/tauri";
import type {
  TaxRules,
  Category,
  TaxWorkspaceItem,
  FiscalYearSettings,
  LineMapping,
} from "../lib/types";
import { btnClass } from "../lib/styles";
import { formatAmount } from "../lib/utils";
import { useCategoryMap } from "../lib/hooks";
import TaxLineItemForm from "../components/tax/TaxLineItemForm";
import ReceiptCell from "../components/tax/ReceiptCell";
import ProrationSettingsModal from "../components/tax/ProrationSettingsModal";
import TaxInfoPanel from "../components/tax/TaxInfoPanel";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

type TabDirection = "expense" | "income";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatMonthHeader(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

interface SummaryLine {
  t2125Line: string;
  t2125Label: string;
  gross: number;
  prorationPct: number;
  deductionPct: number;
  deductible: number;
  gstItc: number;
  qstItr: number;
}

export default function TaxPage() {
  const [fiscalYear, setFiscalYear] = useState(CURRENT_YEAR);
  const [activeTab, setActiveTab] = useState<TabDirection>("expense");
  const [taxRules, setTaxRules] = useState<TaxRules | null>(null);
  const { categories, categoryMap } = useCategoryMap();
  const [items, setItems] = useState<TaxWorkspaceItem[]>([]);
  const [settings, setSettings] = useState<FiscalYearSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showProration, setShowProration] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [editItem, setEditItem] = useState<TaxWorkspaceItem | null>(null);

  // Load tax rules once
  useEffect(() => {
    getTaxRules().then(setTaxRules).catch(console.error);
  }, []);

  // Load workspace items and settings when fiscal year changes
  const fetchYearData = useCallback(async (year: number) => {
    setLoading(true);
    try {
      const [ws, fy] = await Promise.all([
        getTaxWorkspaceItems(year),
        getFiscalYearSettings(year),
      ]);
      setItems(ws);
      setSettings(fy);
    } catch (err) {
      console.error("Failed to fetch tax workspace data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchYearData(fiscalYear);
  }, [fiscalYear, fetchYearData]);

  const lineMappingBySlug = useMemo(() => {
    if (!taxRules) return new Map<string, LineMapping>();
    const m = new Map<string, LineMapping>();
    for (const lm of taxRules.line_mappings) m.set(lm.category_slug, lm);
    return m;
  }, [taxRules]);

  // Filter items by direction
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const cat = item.category_id ? categoryMap.get(item.category_id) : null;
      if (!cat) return false;
      const mapping = lineMappingBySlug.get(cat.slug);
      if (!mapping) return false;
      return mapping.direction === activeTab;
    });
  }, [items, categoryMap, lineMappingBySlug, activeTab]);

  // Group by month
  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, TaxWorkspaceItem[]>();
    for (const item of filteredItems) {
      const ym = item.date.substring(0, 7);
      const list = groups.get(ym) || [];
      list.push(item);
      groups.set(ym, list);
    }
    // Sort by month key
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  // Annual summary computation
  const summaryLines = useMemo(() => {
    if (!taxRules || filteredItems.length === 0) return [];

    const rates = taxRules.rates;
    const byLine = new Map<
      string,
      { mapping: LineMapping; amounts: number[]; categorySlugs: Set<string> }
    >();

    for (const item of filteredItems) {
      const cat = item.category_id ? categoryMap.get(item.category_id) : null;
      if (!cat) continue;
      const mapping = lineMappingBySlug.get(cat.slug);
      if (!mapping) continue;

      const key = mapping.t2125_line;
      let entry = byLine.get(key);
      if (!entry) {
        entry = { mapping, amounts: [], categorySlugs: new Set() };
        byLine.set(key, entry);
      }
      entry.amounts.push(item.amount);
      entry.categorySlugs.add(cat.slug);
    }

    const result: SummaryLine[] = [];
    for (const [t2125Line, entry] of byLine) {
      const { mapping, amounts, categorySlugs } = entry;
      const gross = amounts.reduce((s, a) => s + a, 0);

      let prorationPct = 1.0;
      if (
        mapping.proration === "vehicle" &&
        settings?.vehicle_total_km &&
        settings?.vehicle_business_km
      ) {
        prorationPct =
          settings.vehicle_business_km / settings.vehicle_total_km;
      } else if (
        mapping.proration === "home_office" &&
        settings?.home_total_sqft &&
        settings?.home_office_sqft
      ) {
        prorationPct = settings.home_office_sqft / settings.home_total_sqft;
      }

      let deductionPct = 1.0;
      if (categorySlugs.has("meals_business")) {
        deductionPct = rates.meals_deduction_pct;
      }

      const deductible = gross * prorationPct * deductionPct;

      const taxBase = gross / (1 + rates.gst + rates.qst);
      const gstItc = mapping.gst_eligible
        ? taxBase * rates.gst * prorationPct * deductionPct
        : 0;
      const qstItr = mapping.qst_eligible
        ? taxBase * rates.qst * prorationPct * deductionPct
        : 0;

      result.push({
        t2125Line,
        t2125Label: mapping.t2125_label,
        gross,
        prorationPct,
        deductionPct,
        deductible,
        gstItc,
        qstItr,
      });
    }

    result.sort((a, b) => a.t2125Line.localeCompare(b.t2125Line));
    return result;
  }, [filteredItems, taxRules, categoryMap, lineMappingBySlug, settings]);

  const summaryTotals = useMemo(() => {
    return summaryLines.reduce(
      (acc, line) => ({
        gross: acc.gross + line.gross,
        deductible: acc.deductible + line.deductible,
        gstItc: acc.gstItc + line.gstItc,
        qstItr: acc.qstItr + line.qstItr,
      }),
      { gross: 0, deductible: 0, gstItc: 0, qstItr: 0 },
    );
  }, [summaryLines]);

  const receiptRetentionHint = useMemo(() => {
    if (!taxRules) return undefined;
    const r = taxRules.reminders.find((r) => r.id === "receipt_retention");
    return r?.text;
  }, [taxRules]);

  const isExpenseTab = activeTab === "expense";
  const tabLabel = isExpenseTab ? "expenses" : "income";

  const handleDataUpdated = useCallback(() => {
    fetchYearData(fiscalYear);
  }, [fiscalYear, fetchYearData]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Tax Workspace</h1>
          <p data-testid="tax-item-count" className="text-sm text-gray-500 dark:text-gray-400">
            {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
            {loading && " — Loading..."}
          </p>
        </div>
      </div>

      {/* Top bar controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          data-testid="tax-year-select"
          value={fiscalYear}
          onChange={(e) => setFiscalYear(Number(e.target.value))}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button data-testid="tax-proration-btn" onClick={() => setShowProration(true)} className={btnClass}>
          Proration Settings
        </button>
        <button data-testid="tax-info-btn" onClick={() => setShowInfo(true)} className={btnClass}>
          Tax Info
        </button>
        <button data-testid="tax-add-item-btn" onClick={() => setShowAddForm(true)} className={btnClass}>
          Add Item
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {(["expense", "income"] as TabDirection[]).map((tab) => (
          <button
            key={tab}
            data-testid={`tax-tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab === "expense" ? "Expenses" : "Income"}
          </button>
        ))}
      </div>

      {/* Monthly grouped table */}
      {groupedByMonth.length > 0 ? (
        <div className="space-y-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Category (T2125)</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th
                  className="px-3 py-2 text-center"
                  title={receiptRetentionHint}
                >
                  Receipt
                </th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2 w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupedByMonth.map(([ym, monthItems]) => {
                const subtotal = monthItems.reduce(
                  (s, i) => s + i.amount,
                  0,
                );
                return (
                  <MonthGroup
                    key={ym}
                    ym={ym}
                    items={monthItems}
                    subtotal={subtotal}
                    categoryMap={categoryMap}
                    lineMappingBySlug={lineMappingBySlug}
                    fiscalYear={fiscalYear}
                    onUpdated={handleDataUpdated}
                    onEditItem={(item) => {
                      setEditItem(item);
                      setShowAddForm(true);
                    }}
                  />
                );
              })}
            </tbody>
          </table>

          {/* Annual Summary */}
          {summaryLines.length > 0 && (
            <div className="mt-6 border-t border-gray-300 dark:border-gray-600 pt-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Annual Summary
              </h3>
              <table data-testid="tax-annual-summary" className="w-full text-xs bg-gray-50 dark:bg-gray-800 rounded">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <th className="px-3 py-2">T2125 Line</th>
                    <th className="px-3 py-2">Label</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2 text-right">Deductible</th>
                    {isExpenseTab && (
                      <>
                        <th className="px-3 py-2 text-right">GST ITC</th>
                        <th className="px-3 py-2 text-right">QST ITR</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {summaryLines.map((line) => (
                    <tr
                      key={line.t2125Line}
                      className="border-b border-gray-200 dark:border-gray-700"
                    >
                      <td className="px-3 py-1.5 font-mono">
                        {line.t2125Line}
                      </td>
                      <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">
                        {line.t2125Label}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        ${line.gross.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        ${line.deductible.toFixed(2)}
                        {line.prorationPct < 1 && (
                          <span className="text-gray-400 ml-1">
                            ({(line.prorationPct * 100).toFixed(1)}%)
                          </span>
                        )}
                      </td>
                      {isExpenseTab && (
                        <>
                          <td className="px-3 py-1.5 text-right font-mono">
                            ${line.gstItc.toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            ${line.qstItr.toFixed(2)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className="font-semibold border-t-2 border-gray-300 dark:border-gray-600">
                    <td className="px-3 py-1.5" colSpan={2}>
                      TOTAL
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      ${summaryTotals.gross.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      ${summaryTotals.deductible.toFixed(2)}
                    </td>
                    {isExpenseTab && (
                      <>
                        <td className="px-3 py-1.5 text-right font-mono">
                          ${summaryTotals.gstItc.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">
                          ${summaryTotals.qstItr.toFixed(2)}
                        </td>
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        !loading && (
          <p data-testid="tax-empty" className="text-gray-500 dark:text-gray-400 text-sm py-8 text-center">
            No {tabLabel} items for {fiscalYear}.
          </p>
        )
      )}

      {/* Modals and panels */}
      {taxRules && (
        <>
          <TaxLineItemForm
            open={showAddForm}
            onClose={() => {
              setShowAddForm(false);
              setEditItem(null);
            }}
            onSaved={handleDataUpdated}
            categories={categories}
            taxRules={taxRules}
            fiscalYear={fiscalYear}
            editItem={
              editItem
                ? {
                    id: editItem.id,
                    date: editItem.date,
                    description: editItem.description,
                    amount: editItem.amount,
                    category_id: editItem.category_id,
                    has_receipt: editItem.has_receipt,
                    receipt_path: editItem.receipt_path,
                    notes: editItem.notes,
                    fiscal_year: fiscalYear,
                    created_at: "",
                    updated_at: "",
                  }
                : null
            }
          />
          <ProrationSettingsModal
            open={showProration}
            onClose={() => setShowProration(false)}
            onSaved={handleDataUpdated}
            taxRules={taxRules}
            fiscalYear={fiscalYear}
            settings={settings}
          />
          <TaxInfoPanel
            open={showInfo}
            onClose={() => setShowInfo(false)}
            taxRules={taxRules}
          />
        </>
      )}
    </div>
  );
}

function MonthGroup({
  ym,
  items,
  subtotal,
  categoryMap,
  lineMappingBySlug,
  fiscalYear,
  onUpdated,
  onEditItem,
}: {
  ym: string;
  items: TaxWorkspaceItem[];
  subtotal: number;
  categoryMap: Map<string, Category>;
  lineMappingBySlug: Map<string, LineMapping>;
  fiscalYear: number;
  onUpdated: () => void;
  onEditItem: (item: TaxWorkspaceItem) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");

  function startEditNote(item: TaxWorkspaceItem) {
    setEditingNoteId(item.id);
    setEditingNoteValue(item.notes || "");
  }

  async function saveNote(item: TaxWorkspaceItem) {
    setEditingNoteId(null);
    const newNotes = editingNoteValue.trim() || null;
    if (newNotes === (item.notes || null)) return;

    try {
      if (item.source === "tax_line_item") {
        await updateTaxLineItem(item.id, { notes: newNotes });
      } else {
        await updateTransaction(item.id, { notes: newNotes });
      }
      onUpdated();
    } catch (err) {
      console.error("Failed to save note:", err);
    }
  }

  async function handleDelete(item: TaxWorkspaceItem) {
    if (!window.confirm(`Delete "${item.description}"?`)) return;
    try {
      await deleteTaxLineItem(item.id);
      onUpdated();
    } catch (err) {
      console.error("Failed to delete tax line item:", err);
    }
  }

  function handleNoteKeyDown(
    e: React.KeyboardEvent,
    item: TaxWorkspaceItem,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveNote(item);
    } else if (e.key === "Escape") {
      setEditingNoteId(null);
    }
  }

  return (
    <>
      <tr
        className="bg-gray-50 dark:bg-gray-800 cursor-pointer select-none"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <td
          colSpan={6}
          className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300"
        >
          <span className="text-gray-400 dark:text-gray-500 text-xs mr-2">
            {collapsed ? "\u25B6" : "\u25BC"}
          </span>
          {formatMonthHeader(ym)}
          <span className="text-gray-400 dark:text-gray-500 text-xs ml-2">
            ({items.length})
          </span>
        </td>
        <td className={`px-3 py-2 text-right font-mono ${
          subtotal < 0
            ? "text-red-600 dark:text-red-400"
            : "text-green-600 dark:text-green-400"
        }`}>
          {formatAmount(subtotal)}
        </td>
      </tr>
      {!collapsed && items.map((item) => {
        const cat = item.category_id
          ? categoryMap.get(item.category_id)
          : null;
        const mapping = cat ? lineMappingBySlug.get(cat.slug) : null;

        return (
          <tr
            key={item.id}
            className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <td className="px-3 py-1.5 whitespace-nowrap text-gray-600 dark:text-gray-400">
              {item.date}
            </td>
            <td className="px-3 py-1.5">
              {item.description}
              {item.source === "tax_line_item" && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-full">
                  manual
                </span>
              )}
            </td>
            <td
              className="px-3 py-1.5"
              title={
                mapping
                  ? `${mapping.t2125_label} | TP-80: ${mapping.tp80_line} ${mapping.tp80_label}${mapping.hint ? ` | ${mapping.hint}` : ""}`
                  : undefined
              }
            >
              {cat ? (
                <>
                  {cat.name}
                  {mapping && (
                    <span className="text-gray-400 dark:text-gray-500 ml-1">
                      (L{mapping.t2125_line})
                    </span>
                  )}
                </>
              ) : (
                <span className="text-gray-400">&mdash;</span>
              )}
            </td>
            <td
              className={`px-3 py-1.5 text-right font-mono ${
                item.amount < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
              }`}
              title={
                cat?.slug === "meals_business"
                  ? "Only 50% of meal/entertainment expenses are deductible"
                  : undefined
              }
            >
              {formatAmount(item.amount)}
              {cat?.slug === "meals_business" && (
                <span className="text-orange-500 dark:text-orange-400 text-xs ml-1">
                  (50%)
                </span>
              )}
            </td>
            <td className="px-3 py-1.5 text-center">
              <ReceiptCell
                item={item}
                fiscalYear={fiscalYear}
                onUpdated={onUpdated}
              />
            </td>
            <td className="px-3 py-1.5 max-w-[12rem]">
              {editingNoteId === item.id ? (
                <input
                  type="text"
                  value={editingNoteValue}
                  onChange={(e) => setEditingNoteValue(e.target.value)}
                  onBlur={() => saveNote(item)}
                  onKeyDown={(e) => handleNoteKeyDown(e, item)}
                  autoFocus
                  className="w-full px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <span
                  onClick={() => startEditNote(item)}
                  className="block truncate text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300"
                  title="Click to edit"
                >
                  {item.notes || "\u00A0"}
                </span>
              )}
            </td>
            <td className="px-3 py-1.5 whitespace-nowrap">
              {item.source === "tax_line_item" && (
                <span className="flex gap-2">
                  <button
                    onClick={() => onEditItem(item)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Delete
                  </button>
                </span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
