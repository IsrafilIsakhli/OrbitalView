use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SpaceWeatherStatus {
    Fresh,
    Stale,
    Unavailable,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NoaaScaleType {
    RadioBlackout,
    SolarRadiation,
    GeomagneticStorm,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoaaScaleReading {
    pub forecast_day: i8,
    pub level: Option<u8>,
    pub major_probability_percent: Option<u8>,
    pub minor_probability_percent: Option<u8>,
    pub probability_percent: Option<u8>,
    pub scale_type: NoaaScaleType,
    pub text: Option<String>,
    pub valid_at_unix_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KpIndexSample {
    pub a_running: u16,
    pub kp: f64,
    pub observed_at_unix_ms: u64,
    pub station_count: u16,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NoaaAlertKind {
    Alert,
    Warning,
    Watch,
    Summary,
    Cancellation,
    Message,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoaaAlert {
    pub alert_kind: NoaaAlertKind,
    pub headline: String,
    pub issued_at_unix_ms: u64,
    pub message: String,
    pub product_id: String,
    pub scale_level: Option<u8>,
    pub scale_type: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolarWindSample {
    pub observed_at_unix_ms: u64,
    pub speed_kilometers_per_second: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoaaSpaceWeatherPayload {
    pub alerts: Vec<NoaaAlert>,
    pub duration_ms: u64,
    pub error_code: Option<String>,
    pub expires_at_unix_ms: u64,
    pub fetched_at_unix_ms: u64,
    pub kp_samples: Vec<KpIndexSample>,
    pub retry_count: u8,
    pub scales: Vec<NoaaScaleReading>,
    pub solar_wind: Option<SolarWindSample>,
    pub source: String,
    pub source_url: String,
    pub stale: bool,
    pub status: SpaceWeatherStatus,
}

impl NoaaSpaceWeatherPayload {
    pub fn unavailable(error_code: impl Into<String>) -> Self {
        Self {
            alerts: Vec::new(),
            duration_ms: 0,
            error_code: Some(error_code.into()),
            expires_at_unix_ms: 0,
            fetched_at_unix_ms: 0,
            kp_samples: Vec::new(),
            retry_count: 0,
            scales: Vec::new(),
            solar_wind: None,
            source: "NOAA Space Weather Prediction Center".to_owned(),
            source_url: "https://www.swpc.noaa.gov".to_owned(),
            stale: false,
            status: SpaceWeatherStatus::Unavailable,
        }
    }
}
