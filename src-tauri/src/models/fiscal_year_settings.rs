use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::db::DbError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FiscalYearSettings {
    pub fiscal_year: i32,
    pub vehicle_total_km: Option<f64>,
    pub vehicle_business_km: Option<f64>,
    pub home_total_sqft: Option<f64>,
    pub home_office_sqft: Option<f64>,
    pub gst_collected: Option<f64>,
    pub qst_collected: Option<f64>,
    pub gst_remitted: Option<f64>,
    pub qst_remitted: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpsertFiscalYearSettingsParams {
    pub fiscal_year: i32,
    pub vehicle_total_km: Option<f64>,
    pub vehicle_business_km: Option<f64>,
    pub home_total_sqft: Option<f64>,
    pub home_office_sqft: Option<f64>,
    pub gst_collected: Option<f64>,
    pub qst_collected: Option<f64>,
    pub gst_remitted: Option<f64>,
    pub qst_remitted: Option<f64>,
}

const SELECT_COLS: &str =
    "fiscal_year, vehicle_total_km, vehicle_business_km, home_total_sqft, home_office_sqft, \
     gst_collected, qst_collected, gst_remitted, qst_remitted, created_at, updated_at";

fn row_to_fiscal_year_settings(row: &rusqlite::Row) -> rusqlite::Result<FiscalYearSettings> {
    Ok(FiscalYearSettings {
        fiscal_year: row.get(0)?,
        vehicle_total_km: row.get(1)?,
        vehicle_business_km: row.get(2)?,
        home_total_sqft: row.get(3)?,
        home_office_sqft: row.get(4)?,
        gst_collected: row.get(5)?,
        qst_collected: row.get(6)?,
        gst_remitted: row.get(7)?,
        qst_remitted: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub fn upsert_fiscal_year_settings(
    conn: &Connection,
    params: UpsertFiscalYearSettingsParams,
) -> Result<FiscalYearSettings, DbError> {
    conn.execute(
        "INSERT INTO fiscal_year_settings (fiscal_year, vehicle_total_km, vehicle_business_km, \
         home_total_sqft, home_office_sqft, gst_collected, qst_collected, gst_remitted, qst_remitted) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
         ON CONFLICT(fiscal_year) DO UPDATE SET \
         vehicle_total_km = excluded.vehicle_total_km, \
         vehicle_business_km = excluded.vehicle_business_km, \
         home_total_sqft = excluded.home_total_sqft, \
         home_office_sqft = excluded.home_office_sqft, \
         gst_collected = excluded.gst_collected, \
         qst_collected = excluded.qst_collected, \
         gst_remitted = excluded.gst_remitted, \
         qst_remitted = excluded.qst_remitted, \
         updated_at = datetime('now')",
        rusqlite::params![
            params.fiscal_year,
            params.vehicle_total_km,
            params.vehicle_business_km,
            params.home_total_sqft,
            params.home_office_sqft,
            params.gst_collected,
            params.qst_collected,
            params.gst_remitted,
            params.qst_remitted,
        ],
    )?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM fiscal_year_settings WHERE fiscal_year = ?1",
        SELECT_COLS
    ))?;
    Ok(stmt.query_row(
        rusqlite::params![params.fiscal_year],
        row_to_fiscal_year_settings,
    )?)
}

pub fn get_fiscal_year_settings(
    conn: &Connection,
    fiscal_year: i32,
) -> Result<Option<FiscalYearSettings>, DbError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM fiscal_year_settings WHERE fiscal_year = ?1",
        SELECT_COLS
    ))?;
    let result = stmt.query_row(rusqlite::params![fiscal_year], row_to_fiscal_year_settings);
    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(DbError::from(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::fixtures::setup_db;

    #[test]
    fn upsert_fiscal_year_settings_new_year_creates_record() {
        // Arrange
        let conn = setup_db();
        let params = UpsertFiscalYearSettingsParams {
            fiscal_year: 2025,
            vehicle_total_km: Some(20000.0),
            vehicle_business_km: Some(6000.0),
            home_total_sqft: Some(1200.0),
            home_office_sqft: Some(150.0),
            gst_collected: None,
            qst_collected: None,
            gst_remitted: None,
            qst_remitted: None,
        };

        // Act
        let settings = upsert_fiscal_year_settings(&conn, params).unwrap();

        // Assert
        assert_eq!(settings.fiscal_year, 2025);
        assert_eq!(settings.vehicle_total_km, Some(20000.0));
        assert_eq!(settings.vehicle_business_km, Some(6000.0));
        assert_eq!(settings.home_total_sqft, Some(1200.0));
        assert_eq!(settings.home_office_sqft, Some(150.0));
    }

    #[test]
    fn upsert_fiscal_year_settings_existing_year_updates_record() {
        // Arrange
        let conn = setup_db();
        let params1 = UpsertFiscalYearSettingsParams {
            fiscal_year: 2025,
            vehicle_total_km: Some(20000.0),
            vehicle_business_km: Some(6000.0),
            home_total_sqft: Some(1200.0),
            home_office_sqft: Some(150.0),
            gst_collected: None,
            qst_collected: None,
            gst_remitted: None,
            qst_remitted: None,
        };
        upsert_fiscal_year_settings(&conn, params1).unwrap();

        let params2 = UpsertFiscalYearSettingsParams {
            fiscal_year: 2025,
            vehicle_total_km: Some(25000.0),
            vehicle_business_km: Some(8000.0),
            home_total_sqft: Some(1200.0),
            home_office_sqft: Some(200.0),
            gst_collected: None,
            qst_collected: None,
            gst_remitted: None,
            qst_remitted: None,
        };

        // Act
        let settings = upsert_fiscal_year_settings(&conn, params2).unwrap();

        // Assert
        assert_eq!(settings.vehicle_total_km, Some(25000.0));
        assert_eq!(settings.vehicle_business_km, Some(8000.0));
        assert_eq!(settings.home_office_sqft, Some(200.0));
    }

    #[test]
    fn upsert_fiscal_year_settings_null_fields_stores_null() {
        // Arrange
        let conn = setup_db();
        let params = UpsertFiscalYearSettingsParams {
            fiscal_year: 2025,
            vehicle_total_km: None,
            vehicle_business_km: None,
            home_total_sqft: None,
            home_office_sqft: None,
            gst_collected: None,
            qst_collected: None,
            gst_remitted: None,
            qst_remitted: None,
        };

        // Act
        let settings = upsert_fiscal_year_settings(&conn, params).unwrap();

        // Assert
        assert!(settings.vehicle_total_km.is_none());
        assert!(settings.vehicle_business_km.is_none());
        assert!(settings.home_total_sqft.is_none());
        assert!(settings.home_office_sqft.is_none());
    }

    #[test]
    fn get_fiscal_year_settings_existing_year_returns_some() {
        // Arrange
        let conn = setup_db();
        let params = UpsertFiscalYearSettingsParams {
            fiscal_year: 2025,
            vehicle_total_km: Some(15000.0),
            vehicle_business_km: Some(5000.0),
            home_total_sqft: None,
            home_office_sqft: None,
            gst_collected: None,
            qst_collected: None,
            gst_remitted: None,
            qst_remitted: None,
        };
        upsert_fiscal_year_settings(&conn, params).unwrap();

        // Act
        let result = get_fiscal_year_settings(&conn, 2025).unwrap();

        // Assert
        assert!(result.is_some());
        let settings = result.unwrap();
        assert_eq!(settings.fiscal_year, 2025);
        assert_eq!(settings.vehicle_total_km, Some(15000.0));
    }

    #[test]
    fn get_fiscal_year_settings_nonexistent_year_returns_none() {
        // Arrange
        let conn = setup_db();

        // Act
        let result = get_fiscal_year_settings(&conn, 2099).unwrap();

        // Assert
        assert!(result.is_none());
    }

    #[test]
    fn upsert_fiscal_year_settings_different_years_independent() {
        // Arrange
        let conn = setup_db();
        let p2024 = UpsertFiscalYearSettingsParams {
            fiscal_year: 2024,
            vehicle_total_km: Some(10000.0),
            vehicle_business_km: Some(3000.0),
            home_total_sqft: None,
            home_office_sqft: None,
            gst_collected: None,
            qst_collected: None,
            gst_remitted: None,
            qst_remitted: None,
        };
        let p2025 = UpsertFiscalYearSettingsParams {
            fiscal_year: 2025,
            vehicle_total_km: Some(20000.0),
            vehicle_business_km: Some(6000.0),
            home_total_sqft: None,
            home_office_sqft: None,
            gst_collected: None,
            qst_collected: None,
            gst_remitted: None,
            qst_remitted: None,
        };
        upsert_fiscal_year_settings(&conn, p2024).unwrap();
        upsert_fiscal_year_settings(&conn, p2025).unwrap();

        // Act
        let s2024 = get_fiscal_year_settings(&conn, 2024).unwrap().unwrap();
        let s2025 = get_fiscal_year_settings(&conn, 2025).unwrap().unwrap();

        // Assert
        assert_eq!(s2024.vehicle_total_km, Some(10000.0));
        assert_eq!(s2025.vehicle_total_km, Some(20000.0));
    }
}
