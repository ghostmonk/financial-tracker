import { useState, useEffect, useCallback, useMemo } from "react";
import {
  calculateTaxBurden,
  getTaxPaymentTransactions,
  upsertFiscalYearSettings,
} from "../../lib/tauri";
import type {
  TaxBurdenEstimate,
  TaxWorkspaceItem,
  FiscalYearSettings,
  UpsertFiscalYearSettingsParams,
} from "../../lib/types";
import { formatAmount } from "../../lib/utils";
import { useCategoryMap } from "../../lib/hooks";
import { inputSmClass } from "../../lib/styles";

interface TaxPaymentsPanelProps {
  fiscalYear: number;
  grossIncome: number;
  totalDeductions: number;
  settings: FiscalYearSettings | null;
  onSettingsUpdated: () => void;
}

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

export default function TaxPaymentsPanel({
  fiscalYear,
  grossIncome,
  totalDeductions,
  settings,
  onSettingsUpdated,
}: TaxPaymentsPanelProps) {
  const [burden, setBurden] = useState<TaxBurdenEstimate | null>(null);
  const [payments, setPayments] = useState<TaxWorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { categoryMap } = useCategoryMap();

  // GST/QST editing state
  const [gstCollected, setGstCollected] = useState("");
  const [gstRemitted, setGstRemitted] = useState("");
  const [qstCollected, setQstCollected] = useState("");
  const [qstRemitted, setQstRemitted] = useState("");
  const [savingGstQst, setSavingGstQst] = useState(false);

  // Sync GST/QST fields when settings change
  useEffect(() => {
    setGstCollected(settings?.gst_collected?.toString() ?? "");
    setGstRemitted(settings?.gst_remitted?.toString() ?? "");
    setQstCollected(settings?.qst_collected?.toString() ?? "");
    setQstRemitted(settings?.qst_remitted?.toString() ?? "");
  }, [settings]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [b, p] = await Promise.all([
        calculateTaxBurden(fiscalYear, grossIncome, totalDeductions),
        getTaxPaymentTransactions(fiscalYear),
      ]);
      setBurden(b);
      setPayments(p);
    } catch (err) {
      console.error("Failed to fetch payments data:", err);
    } finally {
      setLoading(false);
    }
  }, [fiscalYear, grossIncome, totalDeductions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group payments by month
  const groupedPayments = useMemo(() => {
    const groups = new Map<string, TaxWorkspaceItem[]>();
    for (const item of payments) {
      const ym = item.date.substring(0, 7);
      const list = groups.get(ym) || [];
      list.push(item);
      groups.set(ym, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [payments]);

  // Payment totals
  const paymentTotals = useMemo(() => {
    let federal = 0;
    let provincial = 0;
    for (const item of payments) {
      const cat = item.category_id ? categoryMap.get(item.category_id) : null;
      if (cat?.slug === "federal_tax_payment") {
        federal += Math.abs(item.amount);
      } else if (cat?.slug === "provincial_tax_payment") {
        provincial += Math.abs(item.amount);
      }
    }
    return { federal, provincial, total: federal + provincial };
  }, [payments, categoryMap]);

  // GST/QST computed values
  const gstCollectedNum = parseFloat(gstCollected) || 0;
  const gstRemittedNum = parseFloat(gstRemitted) || 0;
  const qstCollectedNum = parseFloat(qstCollected) || 0;
  const qstRemittedNum = parseFloat(qstRemitted) || 0;
  const netGst = gstCollectedNum - gstRemittedNum;
  const netQst = qstCollectedNum - qstRemittedNum;
  const gstQstNet = netGst + netQst;

  const totalPaid = paymentTotals.total;
  const totalBurden = burden?.total_burden ?? 0;
  const delta = totalBurden - totalPaid;

  async function saveGstQst() {
    setSavingGstQst(true);
    try {
      const params: UpsertFiscalYearSettingsParams = {
        fiscal_year: fiscalYear,
        vehicle_total_km: settings?.vehicle_total_km,
        vehicle_business_km: settings?.vehicle_business_km,
        home_total_sqft: settings?.home_total_sqft,
        home_office_sqft: settings?.home_office_sqft,
        gst_collected: parseFloat(gstCollected) || null,
        qst_collected: parseFloat(qstCollected) || null,
        gst_remitted: parseFloat(gstRemitted) || null,
        qst_remitted: parseFloat(qstRemitted) || null,
      };
      await upsertFiscalYearSettings(params);
      onSettingsUpdated();
    } catch (err) {
      console.error("Failed to save GST/QST settings:", err);
    } finally {
      setSavingGstQst(false);
    }
  }

  if (loading) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-sm py-8 text-center">
        Loading payments data...
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section A: Tax Burden Estimate */}
      {burden && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Tax Burden Estimate
          </h3>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-gray-600 dark:text-gray-400">
                  Gross self-employment income
                </td>
                <td className="py-1 text-right font-mono">
                  {formatAmount(burden.gross_income)}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600 dark:text-gray-400">
                  Total deductible expenses
                </td>
                <td className="py-1 text-right font-mono text-red-600 dark:text-red-400">
                  -{formatAmount(burden.total_deductions)}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600 dark:text-gray-400">
                  CPP/QPP deduction
                </td>
                <td className="py-1 text-right font-mono text-red-600 dark:text-red-400">
                  -{formatAmount(burden.cpp_qpp_deduction)}
                </td>
              </tr>
              <tr className="border-t border-gray-200 dark:border-gray-700 font-semibold">
                <td className="py-1 text-gray-700 dark:text-gray-300">
                  Taxable income
                </td>
                <td className="py-1 text-right font-mono">
                  {formatAmount(burden.taxable_income)}
                </td>
              </tr>
              <tr>
                <td className="pt-3 pb-1 text-gray-600 dark:text-gray-400">
                  Federal tax (after QC abatement)
                </td>
                <td className="pt-3 pb-1 text-right font-mono">
                  {formatAmount(burden.federal_tax)}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600 dark:text-gray-400">
                  Provincial tax
                </td>
                <td className="py-1 text-right font-mono">
                  {formatAmount(burden.provincial_tax)}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600 dark:text-gray-400">
                  CPP/QPP
                </td>
                <td className="py-1 text-right font-mono">
                  {formatAmount(burden.cpp_qpp)}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600 dark:text-gray-400">
                  QPP2
                </td>
                <td className="py-1 text-right font-mono">
                  {formatAmount(burden.cpp_qpp2)}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600 dark:text-gray-400">
                  QPIP
                </td>
                <td className="py-1 text-right font-mono">
                  {formatAmount(burden.qpip)}
                </td>
              </tr>
              <tr className="border-t border-gray-200 dark:border-gray-700 font-bold text-lg">
                <td className="py-1 text-gray-900 dark:text-gray-100">
                  Total estimated burden
                </td>
                <td className="py-1 text-right font-mono">
                  {formatAmount(burden.total_burden)}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600 dark:text-gray-400">
                  Effective rate
                </td>
                <td className="py-1 text-right font-mono">
                  {(burden.effective_rate * 100).toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Section B: Payments Made */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Payments Made
        </h3>
        {groupedPayments.length > 0 ? (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {groupedPayments.map(([ym, monthItems]) => {
                  const subtotal = monthItems.reduce(
                    (s, i) => s + Math.abs(i.amount),
                    0,
                  );
                  return (
                    <PaymentMonthGroup
                      key={ym}
                      ym={ym}
                      items={monthItems}
                      subtotal={subtotal}
                      categoryMap={categoryMap}
                    />
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">
                  Total federal paid
                </span>
                <span className="font-mono">
                  {formatAmount(paymentTotals.federal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">
                  Total provincial paid
                </span>
                <span className="font-mono">
                  {formatAmount(paymentTotals.provincial)}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-gray-700 dark:text-gray-300">
                  Total paid
                </span>
                <span className="font-mono">
                  {formatAmount(paymentTotals.total)}
                </span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-4">
            No tax payments recorded for {fiscalYear}.
          </p>
        )}
      </div>

      {/* Section C: GST/QST */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          GST/QST
        </h3>
        <div className="grid grid-cols-4 gap-3 text-sm items-end">
          {/* GST Row */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              GST Collected
            </label>
            <input
              type="number"
              step="0.01"
              value={gstCollected}
              onChange={(e) => setGstCollected(e.target.value)}
              className={inputSmClass}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              GST Remitted
            </label>
            <input
              type="number"
              step="0.01"
              value={gstRemitted}
              onChange={(e) => setGstRemitted(e.target.value)}
              className={inputSmClass}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Net GST
            </label>
            <span
              className={`block px-2 py-1.5 font-mono text-sm ${
                netGst > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              {formatAmount(netGst)}
            </span>
          </div>
          <div />

          {/* QST Row */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              QST Collected
            </label>
            <input
              type="number"
              step="0.01"
              value={qstCollected}
              onChange={(e) => setQstCollected(e.target.value)}
              className={inputSmClass}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              QST Remitted
            </label>
            <input
              type="number"
              step="0.01"
              value={qstRemitted}
              onChange={(e) => setQstRemitted(e.target.value)}
              className={inputSmClass}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Net QST
            </label>
            <span
              className={`block px-2 py-1.5 font-mono text-sm ${
                netQst > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              {formatAmount(netQst)}
            </span>
          </div>
          <div className="flex items-end">
            <button
              onClick={saveGstQst}
              disabled={savingGstQst}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {savingGstQst ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* Section D: Summary Bar */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">
              Total tax burden:
            </span>
            <span className="font-mono font-bold ml-2">
              {formatAmount(totalBurden)}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">
              Total paid:
            </span>
            <span className="font-mono font-bold ml-2">
              {formatAmount(totalPaid)}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">
              Remaining:
            </span>
            <span
              className={`font-mono font-bold ml-2 ${
                delta > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              {formatAmount(Math.abs(delta))}{" "}
              {delta > 0 ? "owing" : "overpaid"}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">
              GST/QST net:
            </span>
            <span
              className={`font-mono font-bold ml-2 ${
                gstQstNet > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              {formatAmount(Math.abs(gstQstNet))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentMonthGroup({
  ym,
  items,
  subtotal,
  categoryMap,
}: {
  ym: string;
  items: TaxWorkspaceItem[];
  subtotal: number;
  categoryMap: Map<string, { slug: string; name: string }>;
}) {
  return (
    <>
      <tr className="bg-gray-50 dark:bg-gray-800">
        <td
          colSpan={3}
          className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300"
        >
          {formatMonthHeader(ym)}
          <span className="text-gray-400 dark:text-gray-500 text-xs ml-2">
            ({items.length})
          </span>
        </td>
        <td className="px-3 py-2 text-right font-mono text-red-600 dark:text-red-400">
          {formatAmount(subtotal)}
        </td>
      </tr>
      {items.map((item) => {
        const cat = item.category_id
          ? categoryMap.get(item.category_id)
          : null;
        const label =
          cat?.slug === "federal_tax_payment"
            ? "Federal"
            : cat?.slug === "provincial_tax_payment"
              ? "Provincial"
              : (cat?.name ?? "--");

        return (
          <tr
            key={item.id}
            className="border-b border-gray-100 dark:border-gray-800"
          >
            <td className="px-3 py-1.5 whitespace-nowrap text-gray-600 dark:text-gray-400">
              {item.date}
            </td>
            <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">
              {item.description}
            </td>
            <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">
              {label}
            </td>
            <td className="px-3 py-1.5 text-right font-mono text-red-600 dark:text-red-400">
              {formatAmount(item.amount)}
            </td>
          </tr>
        );
      })}
    </>
  );
}
