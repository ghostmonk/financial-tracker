import { useState, useEffect } from "react";
import type { TaxRules, FiscalYearSettings } from "../../lib/types";
import { upsertFiscalYearSettings } from "../../lib/tauri";
import { inputClass, btnClass, btnPrimaryClass } from "../../lib/styles";
import Modal from "../shared/Modal";
import FormField from "../shared/FormField";

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

  return (
    <Modal open={open} onClose={onClose} title={`Proration Settings \u2014 ${fiscalYear}`} width="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
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
              <FormField label="Total km">
                <input
                  data-testid="proration-vehicle-total"
                  type="number"
                  step="1"
                  min="0"
                  value={vehicleTotalKm}
                  onChange={(e) => setVehicleTotalKm(e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Business km">
                <input
                  data-testid="proration-vehicle-business"
                  type="number"
                  step="1"
                  min="0"
                  value={vehicleBusinessKm}
                  onChange={(e) => setVehicleBusinessKm(e.target.value)}
                  className={inputClass}
                />
              </FormField>
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
              <FormField label="Total sq ft">
                <input
                  data-testid="proration-home-total"
                  type="number"
                  step="1"
                  min="0"
                  value={homeTotalSqft}
                  onChange={(e) => setHomeTotalSqft(e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Office sq ft">
                <input
                  data-testid="proration-home-office"
                  type="number"
                  step="1"
                  min="0"
                  value={homeOfficeSqft}
                  onChange={(e) => setHomeOfficeSqft(e.target.value)}
                  className={inputClass}
                />
              </FormField>
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
            className={btnClass}
          >
            Cancel
          </button>
          <button
            data-testid="proration-save"
            type="submit"
            disabled={saving}
            className={btnPrimaryClass}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
