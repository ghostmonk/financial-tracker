use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbError;
use crate::db_utils::UpdateBuilder;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub direction: String,
    pub sort_order: i32,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryParams {
    pub slug: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub direction: String,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryParams {
    pub slug: Option<String>,
    pub name: Option<String>,
    pub parent_id: Option<Option<String>>,
    pub direction: Option<String>,
    pub sort_order: Option<i32>,
}

const SELECT_COLS: &str = "id, slug, name, parent_id, direction, sort_order, created_at";

fn row_to_category(row: &rusqlite::Row) -> rusqlite::Result<Category> {
    Ok(Category {
        id: row.get(0)?,
        slug: row.get(1)?,
        name: row.get(2)?,
        parent_id: row.get(3)?,
        direction: row.get(4)?,
        sort_order: row.get(5)?,
        created_at: row.get(6)?,
    })
}

struct SeedCategory {
    slug: &'static str,
    name: &'static str,
    direction: &'static str,
    children: &'static [(&'static str, &'static str)],
}

static SEED_CATEGORIES: &[SeedCategory] = &[
    SeedCategory {
        slug: "income",
        name: "Income",
        direction: "income",
        children: &[
            ("salary", "Salary"),
            ("bonus", "Bonus"),
            ("freelance", "Freelance"),
            ("interest_income", "Interest Income"),
            ("dividend_income", "Dividend Income"),
            ("refund_reimbursement", "Refund & Reimbursement"),
            ("other_income", "Other Income"),
        ],
    },
    SeedCategory {
        slug: "housing",
        name: "Housing",
        direction: "expense",
        children: &[
            ("rent", "Rent"),
            ("mortgage", "Mortgage"),
            ("property_tax", "Property Tax"),
            ("home_insurance", "Home Insurance"),
            ("maintenance_repairs", "Maintenance & Repairs"),
            ("furniture", "Furniture"),
            ("household_supplies", "Household Supplies"),
            ("other_housing", "Other Housing"),
        ],
    },
    SeedCategory {
        slug: "utilities",
        name: "Utilities",
        direction: "expense",
        children: &[
            ("electricity", "Electricity"),
            ("gas_heating", "Gas & Heating"),
            ("water_sewer", "Water & Sewer"),
            ("internet", "Internet"),
            ("mobile_phone", "Mobile Phone"),
            ("streaming", "Streaming"),
            ("other_utilities", "Other Utilities"),
        ],
    },
    SeedCategory {
        slug: "food_dining",
        name: "Food & Dining",
        direction: "expense",
        children: &[
            ("groceries", "Groceries"),
            ("restaurants", "Restaurants"),
            ("fast_food", "Fast Food"),
            ("coffee", "Coffee"),
            ("takeout_delivery", "Takeout & Delivery"),
            ("alcohol", "Alcohol"),
            ("other_food", "Other Food"),
        ],
    },
    SeedCategory {
        slug: "transportation",
        name: "Transportation",
        direction: "expense",
        children: &[
            ("fuel", "Fuel"),
            ("public_transit", "Public Transit"),
            ("taxi_rideshare", "Taxi & Rideshare"),
            ("parking", "Parking"),
            ("vehicle_payment", "Vehicle Payment"),
            ("vehicle_insurance", "Vehicle Insurance"),
            ("vehicle_maintenance", "Vehicle Maintenance"),
            ("other_transportation", "Other Transportation"),
        ],
    },
    SeedCategory {
        slug: "health_medical",
        name: "Health & Medical",
        direction: "expense",
        children: &[
            ("health_insurance", "Health Insurance"),
            ("doctor", "Doctor"),
            ("dentist", "Dentist"),
            ("pharmacy", "Pharmacy"),
            ("fitness_gym", "Fitness & Gym"),
            ("other_health", "Other Health"),
        ],
    },
    SeedCategory {
        slug: "personal_care",
        name: "Personal Care",
        direction: "expense",
        children: &[
            ("haircuts", "Haircuts"),
            ("skincare", "Skincare"),
            ("spa", "Spa"),
            ("other_personal_care", "Other Personal Care"),
        ],
    },
    SeedCategory {
        slug: "shopping",
        name: "Shopping",
        direction: "expense",
        children: &[
            ("clothing", "Clothing"),
            ("shoes", "Shoes"),
            ("electronics", "Electronics"),
            ("software_apps", "Software & Apps"),
            ("books", "Books"),
            ("home_decor", "Home Decor"),
            ("general_merchandise", "General Merchandise"),
            ("other_shopping", "Other Shopping"),
        ],
    },
    SeedCategory {
        slug: "entertainment",
        name: "Entertainment",
        direction: "expense",
        children: &[
            ("movies", "Movies"),
            ("music", "Music"),
            ("games", "Games"),
            ("events_tickets", "Events & Tickets"),
            ("subscriptions", "Subscriptions"),
            ("hobbies", "Hobbies"),
            ("sports_recreation", "Sports & Recreation"),
            ("other_entertainment", "Other Entertainment"),
        ],
    },
    SeedCategory {
        slug: "travel",
        name: "Travel",
        direction: "expense",
        children: &[
            ("flights", "Flights"),
            ("hotels", "Hotels"),
            ("vacation_rentals", "Vacation Rentals"),
            ("car_rental", "Car Rental"),
            ("dining_travel", "Dining (Travel)"),
            ("transit_travel", "Transit (Travel)"),
            ("other_travel", "Other Travel"),
        ],
    },
    SeedCategory {
        slug: "family_childcare",
        name: "Family & Childcare",
        direction: "expense",
        children: &[
            ("childcare", "Childcare"),
            ("school_tuition", "School Tuition"),
            ("kids_activities", "Kids Activities"),
            ("child_support", "Child Support"),
            ("other_family", "Other Family"),
        ],
    },
    SeedCategory {
        slug: "education",
        name: "Education",
        direction: "expense",
        children: &[
            ("tuition", "Tuition"),
            ("courses", "Courses"),
            ("certifications", "Certifications"),
            ("books_materials", "Books & Materials"),
            ("student_loan_payment", "Student Loan Payment"),
            ("other_education", "Other Education"),
        ],
    },
    SeedCategory {
        slug: "pets",
        name: "Pets",
        direction: "expense",
        children: &[
            ("pet_food", "Pet Food"),
            ("vet", "Vet"),
            ("pet_grooming", "Pet Grooming"),
            ("pet_insurance", "Pet Insurance"),
            ("other_pets", "Other Pets"),
        ],
    },
    SeedCategory {
        slug: "financial",
        name: "Financial",
        direction: "expense",
        children: &[
            ("bank_fees", "Bank Fees"),
            ("atm_fees", "ATM Fees"),
            ("credit_card_interest", "Credit Card Interest"),
            ("loan_interest", "Loan Interest"),
            ("loan_principal", "Loan Principal"),
            ("investment_fees", "Investment Fees"),
            ("currency_exchange", "Currency Exchange"),
            ("other_financial", "Other Financial"),
        ],
    },
    SeedCategory {
        slug: "savings_investments",
        name: "Savings & Investments",
        direction: "expense",
        children: &[
            ("savings_contribution", "Savings Contribution"),
            ("retirement_contribution", "Retirement Contribution"),
            ("brokerage_contribution", "Brokerage Contribution"),
            ("tfsa_savings", "TFSA Savings"),
            ("other_investing", "Other Investing"),
        ],
    },
    SeedCategory {
        slug: "taxes",
        name: "Taxes",
        direction: "expense",
        children: &[
            ("income_tax", "Income Tax"),
            ("sales_tax", "Sales Tax"),
            ("property_tax_payment", "Property Tax Payment"),
            ("tax_preparation", "Tax Preparation"),
            ("other_taxes", "Other Taxes"),
        ],
    },
    SeedCategory {
        slug: "insurance",
        name: "Insurance",
        direction: "expense",
        children: &[
            ("life_insurance", "Life Insurance"),
            ("disability_insurance", "Disability Insurance"),
            ("umbrella_insurance", "Umbrella Insurance"),
            ("other_insurance", "Other Insurance"),
        ],
    },
    SeedCategory {
        slug: "gifts_donations",
        name: "Gifts & Donations",
        direction: "expense",
        children: &[
            ("gifts_given", "Gifts Given"),
            ("charity", "Charity"),
            ("religious_giving", "Religious Giving"),
            ("other_giving", "Other Giving"),
        ],
    },
    SeedCategory {
        slug: "business_expenses",
        name: "Business Expenses",
        direction: "expense",
        children: &[
            ("office_supplies", "Office Supplies"),
            ("software_saas", "Software & SaaS"),
            ("hosting_cloud", "Hosting & Cloud"),
            ("advertising", "Advertising"),
            ("contractors", "Contractors"),
            ("professional_services", "Professional Services"),
            ("travel_business", "Travel (Business)"),
            ("meals_business", "Meals (Business)"),
            ("shipping", "Shipping"),
            ("equipment", "Equipment"),
            ("rent_coworking", "Rent & Coworking"),
            ("telecom", "Telecom"),
            ("other_business", "Other Business"),
        ],
    },
    SeedCategory {
        slug: "government_fees",
        name: "Government & Fees",
        direction: "expense",
        children: &[
            ("license_permit", "License & Permit"),
            ("registration_fees", "Registration Fees"),
            ("legal_fees", "Legal Fees"),
            ("fines", "Fines"),
            ("other_government", "Other Government"),
        ],
    },
    SeedCategory {
        slug: "transfer",
        name: "Transfer",
        direction: "transfer",
        children: &[
            ("account_transfer", "Account Transfer"),
            ("credit_card_payment", "Credit Card Payment"),
            ("cash_withdrawal", "Cash Withdrawal"),
            ("cash_deposit", "Cash Deposit"),
            ("brokerage_transfer", "Brokerage Transfer"),
            ("savings_transfer", "Savings Transfer"),
            ("loan_payment_transfer", "Loan Payment Transfer"),
        ],
    },
    SeedCategory {
        slug: "adjustment",
        name: "Adjustment",
        direction: "adjustment",
        children: &[
            ("refund_reversal", "Refund & Reversal"),
            ("chargeback", "Chargeback"),
            ("correction", "Correction"),
            ("balance_adjustment", "Balance Adjustment"),
            ("opening_balance", "Opening Balance"),
            ("write_off", "Write-off"),
            ("other_adjustment", "Other Adjustment"),
        ],
    },
    SeedCategory {
        slug: "uncategorized",
        name: "Uncategorized",
        direction: "expense",
        children: &[
            ("needs_review", "Needs Review"),
            ("unknown_merchant", "Unknown Merchant"),
            ("other", "Other"),
        ],
    },
];

pub fn seed_default_categories(conn: &Connection) -> Result<(), DbError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let mut sort = 0i32;

    for seed in SEED_CATEGORIES {
        let parent_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO categories (id, slug, name, parent_id, direction, sort_order) VALUES (?1, ?2, ?3, NULL, ?4, ?5)",
            params![parent_id, seed.slug, seed.name, seed.direction, sort],
        )?;
        sort += 1;

        for (child_slug, child_name) in seed.children {
            conn.execute(
                "INSERT INTO categories (id, slug, name, parent_id, direction, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    Uuid::new_v4().to_string(),
                    child_slug,
                    child_name,
                    parent_id,
                    seed.direction,
                    sort,
                ],
            )?;
            sort += 1;
        }
    }

    Ok(())
}

pub fn list_categories(conn: &Connection) -> Result<Vec<Category>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM categories ORDER BY sort_order",
        SELECT_COLS
    ))?;
    let categories = stmt
        .query_map([], row_to_category)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(categories)
}

pub fn create_category(
    conn: &Connection,
    params: CreateCategoryParams,
) -> Result<Category, DbError> {
    let id = Uuid::new_v4().to_string();
    let sort_order = params.sort_order.unwrap_or(0);
    conn.execute(
        "INSERT INTO categories (id, slug, name, parent_id, direction, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            id,
            params.slug,
            params.name,
            params.parent_id,
            params.direction,
            sort_order,
        ],
    )?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM categories WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(rusqlite::params![id], row_to_category)?)
}

pub fn update_category(
    conn: &Connection,
    id: &str,
    params: UpdateCategoryParams,
) -> Result<Category, DbError> {
    let mut builder = UpdateBuilder::new();
    builder
        .set_if("slug", &params.slug)
        .set_if("name", &params.name)
        .set_nullable("parent_id", &params.parent_id)
        .set_if("direction", &params.direction)
        .set_if("sort_order", &params.sort_order);
    builder.execute(conn, "categories", id, false)?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM categories WHERE id = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(rusqlite::params![id], row_to_category)?)
}

pub fn delete_category(conn: &Connection, id: &str) -> Result<(), DbError> {
    conn.execute(
        "DELETE FROM categories WHERE id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}
