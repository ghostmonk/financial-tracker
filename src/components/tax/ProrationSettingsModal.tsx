import { useState, useEffect } from "react";
import type { TaxRules, FiscalYearSettings } from "../../lib/types";
import { upsertFiscalYearSettings } from "../../lib/tauri";

interface ProrationSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  taxRules: TaxRules;
  fiscalYear: number;
  settings: FiscalYearSettings | null;
}

export default function ProrationSettingsModal({
  open,
  onClose,
  onSaved,
  taxRules,
  fiscalYear,
  settings,
}: ProrationSettingsModalProps) {
  const [vehicleTotalKm, setVehicleTotalKm] = useState("");
  const [vehicleBusinessKm, setVehicleBusinessKm] = useState("");
  const [homeTotalSqft, setHomeTotalSqft] = useState("");
  const [homeOfficeSqft, setHomeOfficeSqft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVehicleTotalKm(settings?.vehicle_total_km?.toString() || "");
    setVehicleBusinessKm(settings?.vehicle_business_km?.toString() || "");
    setHomeTotalSqft(settings?.home_total_sqft?.toString() || "");
    setHomeOfficeSqft(settings?.home_office_sqft?.toString() || "");
  }, [open, settings]);

  if (!open) return null;

  const vehiclePct =
    vehicleTotalKm && vehicleBusinessKm
      ? ((parseFloat(vehicleBusinessKm) / parseFloat(vehicleTotalKm)) * 100)
      : null;

  const homePct =
    homeTotalSqft && homeOfficeSqft
      ? ((parseFloat(homeOfficeSqft) / parseFloat(homeTotalSqft)) * 100)
      : null;

  const vehicleConfig = taxRules.proration_types["vehicle"];
  const homeConfig = taxRules.proration_types["home_office"];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertFiscalYearSettings({
        fiscal_year: fiscalYear,
        vehicle_total_km: vehicleTotalKm ? parseFloat(vehicleTotalKm) : null,
        vehicle_business_km: vehicleBusinessKm
          ? parseFloat(vehicleBusinessKm)
          : null,
        home_total_sqft: homeTotalSqft ? parseFloat(homeTotalSqft) : null,
        home_office_sqft: homeOfficeSqft ? parseFloat(homeOfficeSqft) : null,
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to save proration settings:", err);
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
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg space-y-6"
      >
        <h2 className="text-lg font-semibold">
          Proration Settings &mdash; {fiscalYear}
        </h2>

        {/* Vehicle section */}
        {vehicleConfig && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {vehicleConfig.label}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {vehicleConfig.hint}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Total km
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={vehicleTotalKm}
                  onChange={(e) => setVehicleTotalKm(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Business km
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={vehicleBusinessKm}
                  onChange={(e) => setVehicleBusinessKm(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Business-use:{" "}
              <span className="font-mono font-medium">
                {vehiclePct !== null ? `${vehiclePct.toFixed(1)}%` : "--"}
              </span>
            </p>
          </div>
        )}

        {/* Home Office section */}
        {homeConfig && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {homeConfig.label}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {homeConfig.hint}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Total sq ft
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={homeTotalSqft}
                  onChange={(e) => setHomeTotalSqft(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Office sq ft
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={homeOfficeSqft}
                  onChange={(e) => setHomeOfficeSqft(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Office %:{" "}
              <span className="font-mono font-medium">
                {homePct !== null ? `${homePct.toFixed(1)}%` : "--"}
              </span>
            </p>
          </div>
        )}

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
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
