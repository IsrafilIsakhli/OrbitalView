use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundStationProfile {
    pub id: String,
    pub name: String,
    pub latitude_degrees: f64,
    pub longitude_degrees: f64,
    pub altitude_meters: f64,
    pub minimum_elevation_degrees: f64,
    pub downlink_frequency_hz: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveGroundStationRequest {
    pub id: Option<String>,
    pub name: String,
    pub latitude_degrees: f64,
    pub longitude_degrees: f64,
    pub altitude_meters: f64,
    pub minimum_elevation_degrees: f64,
    pub downlink_frequency_hz: Option<f64>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisExportFormat {
    Csv,
    Json,
}

impl AnalysisExportFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Csv => "csv",
            Self::Json => "json",
        }
    }

    pub fn filter_name(self) -> &'static str {
        match self {
            Self::Csv => "CSV",
            Self::Json => "JSON",
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisExportRequest {
    pub format: AnalysisExportFormat,
    pub suggested_name: String,
    pub content: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisExportResult {
    pub saved: bool,
    pub path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisError {
    pub code: String,
    pub message: String,
}

impl AnalysisError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

pub fn validate_station(request: &SaveGroundStationRequest) -> Result<(), AnalysisError> {
    let name = request.name.trim();
    if name.is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control) {
        return Err(AnalysisError::new(
            "invalid_station_name",
            "Ground station name must contain 1 to 80 plain-text characters",
        ));
    }
    validate_finite_range(request.latitude_degrees, -90.0, 90.0, "invalid_latitude")?;
    validate_finite_range(
        request.longitude_degrees,
        -180.0,
        180.0,
        "invalid_longitude",
    )?;
    validate_finite_range(
        request.altitude_meters,
        -500.0,
        10_000.0,
        "invalid_altitude",
    )?;
    validate_finite_range(
        request.minimum_elevation_degrees,
        0.0,
        90.0,
        "invalid_elevation",
    )?;
    if let Some(frequency) = request.downlink_frequency_hz {
        validate_finite_range(frequency, 1.0, 1.0e12, "invalid_frequency")?;
    }
    if request
        .id
        .as_deref()
        .is_some_and(|id| id.len() > 64 || id.chars().any(char::is_control))
    {
        return Err(AnalysisError::new(
            "invalid_station_id",
            "Ground station identifier is invalid",
        ));
    }
    Ok(())
}

fn validate_finite_range(
    value: f64,
    minimum: f64,
    maximum: f64,
    code: &'static str,
) -> Result<(), AnalysisError> {
    if !value.is_finite() || !(minimum..=maximum).contains(&value) {
        return Err(AnalysisError::new(
            code,
            "Ground station value is outside its allowed range",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{SaveGroundStationRequest, validate_station};

    fn valid_request() -> SaveGroundStationRequest {
        SaveGroundStationRequest {
            id: None,
            name: "Baku Ground Station".to_owned(),
            latitude_degrees: 40.4093,
            longitude_degrees: 49.8671,
            altitude_meters: 28.0,
            minimum_elevation_degrees: 10.0,
            downlink_frequency_hz: Some(145_800_000.0),
        }
    }

    #[test]
    fn accepts_valid_station() {
        assert!(validate_station(&valid_request()).is_ok());
    }

    #[test]
    fn rejects_invalid_coordinates_and_frequency() {
        let mut request = valid_request();
        request.latitude_degrees = 91.0;
        assert_eq!(
            validate_station(&request).unwrap_err().code,
            "invalid_latitude"
        );
        request.latitude_degrees = 40.0;
        request.downlink_frequency_hz = Some(0.0);
        assert_eq!(
            validate_station(&request).unwrap_err().code,
            "invalid_frequency"
        );
    }
}
