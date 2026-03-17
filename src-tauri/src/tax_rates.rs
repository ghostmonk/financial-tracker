use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct TaxBurdenEstimate {
    pub gross_income: f64,
    pub total_deductions: f64,
    pub net_income: f64,
    pub cpp_qpp: f64,
    pub cpp_qpp2: f64,
    pub qpip: f64,
    pub cpp_qpp_deduction: f64,
    pub taxable_income: f64,
    pub federal_tax: f64,
    pub provincial_tax: f64,
    pub total_burden: f64,
    pub effective_rate: f64,
}

fn apply_brackets(income: f64, brackets: &[TaxBracket]) -> f64 {
    let mut tax = 0.0;
    for bracket in brackets {
        if income <= bracket.min {
            break;
        }
        let upper = bracket.max.unwrap_or(f64::MAX).min(income);
        tax += (upper - bracket.min) * bracket.rate;
    }
    tax
}

pub fn calculate_tax_burden(
    gross_income: f64,
    total_deductions: f64,
    rates: &TaxRateConfig,
) -> TaxBurdenEstimate {
    // 1. Net income
    let net_income = (gross_income - total_deductions).max(0.0);

    // 2. CPP/QPP (self-employed pays both portions)
    let pensionable =
        (net_income.min(rates.cpp_qpp.max_pensionable) - rates.cpp_qpp.basic_exemption).max(0.0);
    let cpp_qpp = pensionable * rates.cpp_qpp.rate;

    // 3. QPP2 (second ceiling)
    let cpp_qpp2 = if net_income > rates.cpp_qpp.max_pensionable {
        let qpp2_earnings =
            (net_income.min(rates.cpp_qpp2.second_ceiling) - rates.cpp_qpp.max_pensionable)
                .max(0.0);
        qpp2_earnings * rates.cpp_qpp2.rate
    } else {
        0.0
    };

    // 4. QPIP
    let qpip = net_income.min(rates.qpip.max_insurable) * rates.qpip.self_employed_rate;

    // 5. CPP/QPP deduction (half is deductible)
    let cpp_qpp_deduction = cpp_qpp / 2.0;

    // 6. Taxable income
    let taxable_income = (net_income - cpp_qpp_deduction).max(0.0);

    // 7. Federal tax
    let federal_gross = apply_brackets(taxable_income, &rates.federal.brackets);
    let federal_credit =
        rates.federal.basic_personal_amount * rates.federal.brackets[0].rate;
    let federal_tax =
        ((federal_gross - federal_credit).max(0.0)) * (1.0 - rates.federal.quebec_abatement);

    // 8. Provincial tax
    let provincial_gross = apply_brackets(taxable_income, &rates.provincial.brackets);
    let provincial_credit =
        rates.provincial.basic_personal_amount * rates.provincial.brackets[0].rate;
    let provincial_tax = (provincial_gross - provincial_credit).max(0.0);

    // 9. Total burden
    let total_burden = federal_tax + provincial_tax + cpp_qpp + cpp_qpp2 + qpip;

    // 10. Effective rate
    let effective_rate = if gross_income > 0.0 {
        total_burden / gross_income
    } else {
        0.0
    };

    TaxBurdenEstimate {
        gross_income,
        total_deductions,
        net_income,
        cpp_qpp,
        cpp_qpp2,
        qpip,
        cpp_qpp_deduction,
        taxable_income,
        federal_tax,
        provincial_tax,
        total_burden,
        effective_rate,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxBracket {
    pub min: f64,
    pub max: Option<f64>,
    pub rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FederalRates {
    pub brackets: Vec<TaxBracket>,
    pub basic_personal_amount: f64,
    pub quebec_abatement: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvincialRates {
    pub brackets: Vec<TaxBracket>,
    pub basic_personal_amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CppQppRates {
    pub rate: f64,
    pub max_pensionable: f64,
    pub basic_exemption: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CppQpp2Rates {
    pub rate: f64,
    pub second_ceiling: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QpipRates {
    pub self_employed_rate: f64,
    pub max_insurable: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxRateConfig {
    pub year: i32,
    pub jurisdiction: String,
    pub federal: FederalRates,
    pub provincial: ProvincialRates,
    pub cpp_qpp: CppQppRates,
    pub cpp_qpp2: CppQpp2Rates,
    pub qpip: QpipRates,
}

static RATE_FILES: &[(i32, &str, &str)] = &[
    (2025, "CA-QC", include_str!("tax-rates/2025-CA-QC.json")),
    (2026, "CA-QC", include_str!("tax-rates/2026-CA-QC.json")),
];

pub fn load_tax_rates(year: i32, jurisdiction: &str) -> Result<TaxRateConfig, String> {
    // Try exact year match first
    if let Some((_, _, json)) = RATE_FILES
        .iter()
        .find(|(y, j, _)| *y == year && *j == jurisdiction)
    {
        return serde_json::from_str(json)
            .map_err(|e| format!("Failed to parse tax rates for {year} {jurisdiction}: {e}"));
    }

    // Fall back to nearest prior year for this jurisdiction
    let fallback = RATE_FILES
        .iter()
        .filter(|(y, j, _)| *j == jurisdiction && *y < year)
        .max_by_key(|(y, _, _)| *y);

    match fallback {
        Some((_, _, json)) => serde_json::from_str(json)
            .map_err(|e| format!("Failed to parse tax rates for {jurisdiction}: {e}")),
        None => Err(format!(
            "No tax rates found for jurisdiction {jurisdiction}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_exact_year() {
        let config = load_tax_rates(2025, "CA-QC").unwrap();
        assert_eq!(config.year, 2025);
        assert_eq!(config.jurisdiction, "CA-QC");
        assert_eq!(config.federal.brackets.len(), 5);
        assert_eq!(config.provincial.brackets.len(), 4);
        assert_eq!(config.federal.basic_personal_amount, 16129.0);
        assert_eq!(config.federal.quebec_abatement, 0.165);
        assert_eq!(config.cpp_qpp.rate, 0.1190);
        assert_eq!(config.qpip.self_employed_rate, 0.00878);
    }

    #[test]
    fn test_load_fallback_year() {
        let config = load_tax_rates(2027, "CA-QC").unwrap();
        // Should fall back to 2026 (nearest prior year)
        assert_eq!(config.year, 2026);
        assert_eq!(config.jurisdiction, "CA-QC");
        assert_eq!(config.federal.brackets.len(), 5);
    }

    #[test]
    fn test_load_unknown_jurisdiction() {
        let result = load_tax_rates(2025, "CA-ON");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("No tax rates found for jurisdiction CA-ON"));
    }

    #[test]
    fn test_apply_brackets_simple() {
        let brackets = vec![TaxBracket {
            min: 0.0,
            max: Some(50000.0),
            rate: 0.15,
        }];
        let tax = apply_brackets(30000.0, &brackets);
        assert!((tax - 4500.0).abs() < 0.01);
    }

    #[test]
    fn test_apply_brackets_multiple() {
        let brackets = vec![
            TaxBracket {
                min: 0.0,
                max: Some(50000.0),
                rate: 0.10,
            },
            TaxBracket {
                min: 50000.0,
                max: Some(100000.0),
                rate: 0.20,
            },
            TaxBracket {
                min: 100000.0,
                max: None,
                rate: 0.30,
            },
        ];
        // 50000*0.10 + 50000*0.20 + 20000*0.30 = 5000 + 10000 + 6000 = 21000
        let tax = apply_brackets(120000.0, &brackets);
        assert!((tax - 21000.0).abs() < 0.01);
    }

    #[test]
    fn test_calculate_burden_400k() {
        let rates = load_tax_rates(2025, "CA-QC").unwrap();
        let result = calculate_tax_burden(400000.0, 0.0, &rates);

        assert_eq!(result.net_income, 400000.0);

        // CPP/QPP: (71300 - 3500) * 0.119 = 8068.20
        assert!(
            (result.cpp_qpp - 8068.20).abs() < 100.0,
            "cpp_qpp {} not near 8068",
            result.cpp_qpp
        );

        // QPP2: (81200 - 71300) * 0.08 = 792.00
        assert!(
            (result.cpp_qpp2 - 792.0).abs() < 100.0,
            "cpp_qpp2 {} not near 792",
            result.cpp_qpp2
        );

        // QPIP: 94000 * 0.00878 = 825.32
        assert!(
            (result.qpip - 825.32).abs() < 100.0,
            "qpip {} not near 825",
            result.qpip
        );

        // Federal tax ~89000 (after abatement)
        assert!(
            (result.federal_tax - 89000.0).abs() < 2000.0,
            "federal_tax {} not near 89000",
            result.federal_tax
        );

        // Provincial tax ~90500
        assert!(
            (result.provincial_tax - 90500.0).abs() < 2000.0,
            "provincial_tax {} not near 90500",
            result.provincial_tax
        );

        // Total burden ~189000
        assert!(
            (result.total_burden - 189000.0).abs() < 5000.0,
            "total_burden {} not near 189000",
            result.total_burden
        );

        // Effective rate ~0.47
        assert!(
            (result.effective_rate - 0.47).abs() < 0.02,
            "effective_rate {} not near 0.47",
            result.effective_rate
        );
    }

    #[test]
    fn test_calculate_burden_zero_income() {
        let rates = load_tax_rates(2025, "CA-QC").unwrap();
        let result = calculate_tax_burden(0.0, 0.0, &rates);

        assert_eq!(result.gross_income, 0.0);
        assert_eq!(result.net_income, 0.0);
        assert_eq!(result.cpp_qpp, 0.0);
        assert_eq!(result.cpp_qpp2, 0.0);
        assert_eq!(result.qpip, 0.0);
        assert_eq!(result.federal_tax, 0.0);
        assert_eq!(result.provincial_tax, 0.0);
        assert_eq!(result.total_burden, 0.0);
        assert_eq!(result.effective_rate, 0.0);
    }

    #[test]
    fn test_calculate_burden_with_deductions() {
        let rates = load_tax_rates(2025, "CA-QC").unwrap();
        let result = calculate_tax_burden(200000.0, 50000.0, &rates);

        assert_eq!(result.gross_income, 200000.0);
        assert_eq!(result.total_deductions, 50000.0);
        assert_eq!(result.net_income, 150000.0);

        // Tax should be computed on 150K net, not 200K gross
        let result_150k = calculate_tax_burden(150000.0, 0.0, &rates);
        assert!(
            (result.federal_tax - result_150k.federal_tax).abs() < 0.01,
            "federal tax should match 150K direct calculation"
        );
        assert!(
            (result.provincial_tax - result_150k.provincial_tax).abs() < 0.01,
            "provincial tax should match 150K direct calculation"
        );
    }

    #[test]
    fn test_calculate_burden_below_exemption() {
        let rates = load_tax_rates(2025, "CA-QC").unwrap();
        // Income below both basic personal amounts (~16K federal, ~18K provincial)
        let result = calculate_tax_burden(10000.0, 0.0, &rates);

        assert_eq!(result.net_income, 10000.0);
        assert_eq!(result.federal_tax, 0.0);
        assert_eq!(result.provincial_tax, 0.0);
        // Should still have CPP/QPP and QPIP
        assert!(result.cpp_qpp > 0.0);
        assert!(result.qpip > 0.0);
    }
}
