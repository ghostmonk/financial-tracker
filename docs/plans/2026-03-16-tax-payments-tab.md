# Tax Payments Tab Design

## Overview

New "Payments" tab under the Tax Workspace that tracks tax payments (federal/provincial), calculates estimated tax burden from self-employment income, and shows GST/QST remittance status.

## Category Changes

Replace the `income_tax` child category under "Taxes" with:
- `federal_tax_payment` — "Federal Tax Payment"
- `provincial_tax_payment` — "Provincial Tax Payment"

Migration: detect existing `income_tax` slug, replace with new categories. Reassign any transactions from `income_tax` to `federal_tax_payment` as a conservative default.

## Tax Rate Files

New directory: `src-tauri/src/tax-rates/`

One file per year+jurisdiction: `tax-rates-{year}-{jurisdiction}.json`

Structure:
```json
{
  "year": 2025,
  "jurisdiction": "CA-QC",
  "federal": {
    "brackets": [
      { "min": 0, "max": 57375, "rate": 0.15 },
      { "min": 57375, "max": 114750, "rate": 0.205 },
      { "min": 114750, "max": 158468, "rate": 0.26 },
      { "min": 158468, "max": 220000, "rate": 0.29 },
      { "min": 220000, "max": null, "rate": 0.33 }
    ],
    "basic_personal_amount": 16129,
    "quebec_abatement": 0.165
  },
  "provincial": {
    "brackets": [
      { "min": 0, "max": 51780, "rate": 0.14 },
      { "min": 51780, "max": 103545, "rate": 0.19 },
      { "min": 103545, "max": 126000, "rate": 0.24 },
      { "min": 126000, "max": null, "rate": 0.2575 }
    ],
    "basic_personal_amount": 18056
  },
  "cpp_qpp": {
    "rate": 0.1190,
    "max_pensionable": 71300,
    "basic_exemption": 3500
  },
  "cpp_qpp2": {
    "rate": 0.08,
    "second_ceiling": 81200
  },
  "qpip": {
    "self_employed_rate": 0.00878,
    "max_insurable": 94000
  }
}
```

Backend loads matching file by fiscal year + jurisdiction (from `tax-rules.json`). Falls back to nearest prior year if exact year doesn't exist. Exposed via `get_tax_rates(fiscal_year)` Tauri command.

## Tax Calculation Engine

Rust function `calculate_tax_burden(net_income, tax_rates) -> TaxBurdenEstimate`:

1. CPP/QPP: `(min(net_income, max_pensionable) - basic_exemption) * rate`
2. QPP2: `(min(net_income, second_ceiling) - max_pensionable) * rate` (only if income exceeds first ceiling)
3. QPIP: `min(net_income, max_insurable) * self_employed_rate`
4. CPP/QPP deduction: half of CPP/QPP contribution is deductible
5. Taxable income: `net_income - cpp_qpp_deduction`
6. Federal tax: apply brackets to taxable income, subtract basic personal credit (at 15%), apply Quebec abatement (16.5% reduction)
7. Provincial tax: apply brackets to taxable income, subtract basic personal credit (at lowest bracket rate)

Returns:
```rust
struct TaxBurdenEstimate {
    gross_income: f64,
    total_deductions: f64,
    net_income: f64,
    cpp_qpp_deduction: f64,
    taxable_income: f64,
    federal_tax: f64,
    provincial_tax: f64,
    cpp_qpp: f64,
    cpp_qpp2: f64,
    qpip: f64,
    total_burden: f64,
    effective_rate: f64,
}
```

Frontend passes gross income + total deductions (already computed on existing tabs) to a new Tauri command. Backend loads rates and computes.

## Fiscal Year Settings Additions

Four new nullable columns on `fiscal_year_settings`:
- `gst_collected REAL`
- `qst_collected REAL`
- `gst_remitted REAL`
- `qst_remitted REAL`

Manual input fields on the Payments tab. Stored per fiscal year.

## Payments Tab UI

Third tab on TaxPage: "Payments" alongside "Expenses" and "Income".

### Tax Burden Estimate (computed, read-only)

| Line | Amount |
|---|---|
| Gross self-employment income | from Income tab |
| Total deductible expenses | from Expense tab |
| CPP/QPP deduction | half of contribution |
| **Taxable income** | |
| Federal tax (after QC abatement) | |
| Provincial tax | |
| CPP/QPP contribution | |
| QPP2 contribution | |
| QPIP contribution | |
| **Total estimated burden** | |
| Effective rate | % |

### Payments Made (transaction list)

Transactions categorized as `federal_tax_payment` or `provincial_tax_payment` in the fiscal year. Same collapsible month-grouped table as other tabs. Subtotals per category type.

### GST/QST Section (manual inputs)

| | Collected | Remitted | Net Owing |
|---|---|---|---|
| GST | input | input | computed |
| QST | input | input | computed |

### Summary Bar

- Total tax burden | Total paid (sum of federal + provincial payment transactions) | Delta
- GST net owing | QST net owing
- Red = owing, green = overpaid/square

## Implementation Phases

### Phase 1 — Backend foundation
- Tax rate JSON files (2025 + 2026)
- Rate file loader with year fallback
- Tax calculation engine (Rust)
- `get_tax_rates` and `calculate_tax_burden` Tauri commands

### Phase 2 — Category + schema changes
- Replace `income_tax` with `federal_tax_payment` / `provincial_tax_payment` in seed data
- Migration for existing databases
- Add GST/QST columns to `fiscal_year_settings`
- Update TypeScript types

### Phase 3 — Payments tab UI
- Third tab on TaxPage
- Tax burden estimate panel
- Payment transaction list (reuse MonthGroup pattern)
- GST/QST manual input section
- Summary bar with delta calculation
