use serde::{Deserialize, Serialize};

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
}
