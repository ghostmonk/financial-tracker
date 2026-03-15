use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxRules {
    pub jurisdiction: String,
    pub fiscal_year_type: String,
    pub rates: TaxRates,
    pub proration_types: HashMap<String, ProrationType>,
    pub line_mappings: Vec<LineMapping>,
    pub reminders: Vec<Reminder>,
    pub info_sections: Vec<InfoSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxRates {
    pub gst: f64,
    pub qst: f64,
    pub meals_deduction_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProrationType {
    pub label: String,
    pub fields: Vec<ProrationField>,
    pub hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProrationField {
    pub key: String,
    pub label: String,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineMapping {
    pub category_slug: String,
    pub direction: String,
    pub t2125_line: String,
    pub t2125_label: String,
    pub tp80_line: String,
    pub tp80_label: String,
    pub gst_eligible: bool,
    pub qst_eligible: bool,
    pub proration: Option<String>,
    pub hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reminder {
    pub id: String,
    pub context: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InfoSection {
    pub id: String,
    pub title: String,
    pub body: String,
}

static TAX_RULES: OnceLock<TaxRules> = OnceLock::new();

pub fn load_tax_rules() -> &'static TaxRules {
    TAX_RULES.get_or_init(|| {
        let json = include_str!("tax-rules.json");
        serde_json::from_str(json).expect("Failed to parse tax-rules.json")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_tax_rules_parses_json_returns_valid_struct() {
        // Arrange & Act
        let rules = load_tax_rules();

        // Assert
        assert_eq!(rules.jurisdiction, "CA-QC");
        assert_eq!(rules.fiscal_year_type, "calendar");
    }

    #[test]
    fn load_tax_rules_rates_correct_values() {
        // Arrange & Act
        let rules = load_tax_rules();

        // Assert
        assert_eq!(rules.rates.gst, 0.05);
        assert_eq!(rules.rates.qst, 0.09975);
        assert_eq!(rules.rates.meals_deduction_pct, 0.50);
    }

    #[test]
    fn load_tax_rules_proration_types_has_vehicle_and_home_office() {
        // Arrange & Act
        let rules = load_tax_rules();

        // Assert
        assert!(rules.proration_types.contains_key("vehicle"));
        assert!(rules.proration_types.contains_key("home_office"));
        assert_eq!(rules.proration_types.len(), 2);
    }

    #[test]
    fn load_tax_rules_vehicle_proration_has_km_fields() {
        // Arrange & Act
        let rules = load_tax_rules();
        let vehicle = &rules.proration_types["vehicle"];

        // Assert
        assert_eq!(vehicle.fields.len(), 2);
        assert_eq!(vehicle.fields[0].key, "vehicle_total_km");
        assert_eq!(vehicle.fields[1].key, "vehicle_business_km");
    }

    #[test]
    fn load_tax_rules_line_mappings_includes_income_and_expense() {
        // Arrange & Act
        let rules = load_tax_rules();

        // Assert
        let income_count = rules.line_mappings.iter().filter(|m| m.direction == "income").count();
        let expense_count = rules.line_mappings.iter().filter(|m| m.direction == "expense").count();
        assert!(income_count >= 1, "Expected at least 1 income mapping");
        assert!(expense_count >= 10, "Expected at least 10 expense mappings");
    }

    #[test]
    fn load_tax_rules_freelance_mapping_zero_rated() {
        // Arrange & Act
        let rules = load_tax_rules();
        let freelance = rules.line_mappings.iter().find(|m| m.category_slug == "freelance").unwrap();

        // Assert
        assert_eq!(freelance.direction, "income");
        assert_eq!(freelance.t2125_line, "8000");
        assert!(!freelance.gst_eligible);
        assert!(!freelance.qst_eligible);
    }

    #[test]
    fn load_tax_rules_vehicle_expenses_have_vehicle_proration() {
        // Arrange & Act
        let rules = load_tax_rules();
        let vehicle_items: Vec<&LineMapping> = rules
            .line_mappings
            .iter()
            .filter(|m| m.proration.as_deref() == Some("vehicle"))
            .collect();

        // Assert
        assert!(vehicle_items.len() >= 4, "Expected at least 4 vehicle-prorated items");
        for item in &vehicle_items {
            assert_eq!(item.t2125_line, "9281");
        }
    }

    #[test]
    fn load_tax_rules_home_office_expenses_have_home_proration() {
        // Arrange & Act
        let rules = load_tax_rules();
        let home_items: Vec<&LineMapping> = rules
            .line_mappings
            .iter()
            .filter(|m| m.proration.as_deref() == Some("home_office"))
            .collect();

        // Assert
        assert!(home_items.len() >= 5, "Expected at least 5 home-office-prorated items");
        for item in &home_items {
            assert_eq!(item.t2125_line, "9945");
        }
    }

    #[test]
    fn load_tax_rules_reminders_non_empty() {
        // Arrange & Act
        let rules = load_tax_rules();

        // Assert
        assert!(rules.reminders.len() >= 5);
        let ids: Vec<&str> = rules.reminders.iter().map(|r| r.id.as_str()).collect();
        assert!(ids.contains(&"receipt_retention"));
        assert!(ids.contains(&"vehicle_logbook"));
        assert!(ids.contains(&"meals_50pct"));
    }

    #[test]
    fn load_tax_rules_info_sections_has_t2125_and_tp80() {
        // Arrange & Act
        let rules = load_tax_rules();

        // Assert
        let ids: Vec<&str> = rules.info_sections.iter().map(|s| s.id.as_str()).collect();
        assert!(ids.contains(&"t2125_overview"));
        assert!(ids.contains(&"tp80_overview"));
        assert!(ids.contains(&"gst_qst_overview"));
    }

    #[test]
    fn load_tax_rules_insurance_not_gst_eligible() {
        // Arrange & Act
        let rules = load_tax_rules();
        let vehicle_insurance = rules.line_mappings.iter().find(|m| m.category_slug == "vehicle_insurance").unwrap();

        // Assert
        assert!(!vehicle_insurance.gst_eligible);
        assert!(!vehicle_insurance.qst_eligible);
    }

    #[test]
    fn load_tax_rules_mortgage_not_gst_eligible() {
        // Arrange & Act
        let rules = load_tax_rules();
        let mortgage = rules.line_mappings.iter().find(|m| m.category_slug == "mortgage").unwrap();

        // Assert
        assert!(!mortgage.gst_eligible);
        assert!(!mortgage.qst_eligible);
        assert_eq!(mortgage.proration.as_deref(), Some("home_office"));
    }
}
