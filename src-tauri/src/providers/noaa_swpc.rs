use std::{path::Path, time::Duration};

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    commands::cache::write_atomic,
    domain::{
        provider::{ProviderError, ProviderErrorCategory},
        space_weather::{
            KpIndexSample, NoaaAlert, NoaaAlertKind, NoaaScaleReading, NoaaScaleType,
            NoaaSpaceWeatherPayload, SolarWindSample, SpaceWeatherStatus,
        },
    },
    providers::http_client::{HttpJsonClient, HttpJsonResponse, HttpPolicy},
};

const ALERTS_URL: &str = "https://services.swpc.noaa.gov/products/alerts.json";
const KP_URL: &str = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const SCALES_URL: &str = "https://services.swpc.noaa.gov/products/noaa-scales.json";
const SOLAR_WIND_URL: &str =
    "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json";
const MAX_ALERTS: usize = 40;
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const TTL_MS: u64 = 5 * 60 * 1_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedNoaaSnapshot {
    payload: NoaaSpaceWeatherPayload,
}

pub struct NoaaSwpcProvider {
    http: HttpJsonClient,
}

impl NoaaSwpcProvider {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            http: HttpJsonClient::new(Duration::from_secs(15))?,
        })
    }

    pub async fn resolve(
        &self,
        cache_path: &Path,
        now: u64,
        force_refresh: bool,
    ) -> NoaaSpaceWeatherPayload {
        let cached = read_cache(cache_path).await;
        if !force_refresh
            && let Some(snapshot) = cached
                .as_ref()
                .filter(|snapshot| snapshot.payload.expires_at_unix_ms > now)
        {
            return snapshot.payload.clone();
        }

        let policy = HttpPolicy {
            max_response_bytes: MAX_RESPONSE_BYTES,
            max_retries: 1,
        };
        let (scales, kp, alerts, solar_wind) = tokio::join!(
            self.http.get_json::<Value>(SCALES_URL, policy),
            self.http.get_json::<Value>(KP_URL, policy),
            self.http.get_json::<Value>(ALERTS_URL, policy),
            self.http.get_json::<Value>(SOLAR_WIND_URL, policy),
        );

        match (scales, kp, alerts, solar_wind) {
            (Ok(scales), Ok(kp), Ok(alerts), Ok(solar_wind)) => {
                match normalize_snapshot(scales, kp, alerts, solar_wind, now) {
                    Ok(mut payload) => {
                        if write_cache(cache_path, &payload).await.is_err() {
                            payload.error_code = Some("cache_write".to_owned());
                        }
                        payload
                    }
                    Err(error) => stale_or_unavailable(cached, error.code),
                }
            }
            (scales, kp, alerts, solar_wind) => {
                let error_code = [&scales, &kp, &alerts, &solar_wind]
                    .into_iter()
                    .find_map(|result| result.as_ref().err().map(|error| error.code.clone()))
                    .unwrap_or_else(|| "upstream_unavailable".to_owned());
                stale_or_unavailable(cached, error_code)
            }
        }
    }
}

fn normalize_snapshot(
    scales: HttpJsonResponse<Value>,
    kp: HttpJsonResponse<Value>,
    alerts: HttpJsonResponse<Value>,
    solar_wind: HttpJsonResponse<Value>,
    now: u64,
) -> Result<NoaaSpaceWeatherPayload, ProviderError> {
    let scale_readings = parse_scales(&scales.data)?;
    let kp_samples = parse_kp_samples(&kp.data)?;
    let alert_items = parse_alerts(&alerts.data)?;
    let solar_wind_sample = parse_solar_wind(&solar_wind.data);
    let retry_count = [
        scales.retry_count,
        kp.retry_count,
        alerts.retry_count,
        solar_wind.retry_count,
    ]
    .into_iter()
    .max()
    .unwrap_or_default();
    let duration_ms = [
        scales.duration_ms,
        kp.duration_ms,
        alerts.duration_ms,
        solar_wind.duration_ms,
    ]
    .into_iter()
    .max()
    .unwrap_or_default();

    Ok(NoaaSpaceWeatherPayload {
        alerts: alert_items,
        duration_ms,
        error_code: None,
        expires_at_unix_ms: now.saturating_add(TTL_MS),
        fetched_at_unix_ms: now,
        kp_samples,
        retry_count,
        scales: scale_readings,
        solar_wind: solar_wind_sample,
        source: "NOAA Space Weather Prediction Center".to_owned(),
        source_url: "https://www.swpc.noaa.gov".to_owned(),
        stale: false,
        status: SpaceWeatherStatus::Fresh,
    })
}

fn parse_scales(value: &Value) -> Result<Vec<NoaaScaleReading>, ProviderError> {
    let object = value.as_object().ok_or_else(invalid_payload)?;
    let mut readings = Vec::new();
    for forecast_day in [0_i8, 1, 2, 3] {
        let key = forecast_day.to_string();
        let Some(entry) = object.get(&key) else {
            continue;
        };
        let valid_at_unix_ms = parse_noaa_datetime(
            entry.get("DateStamp").and_then(Value::as_str),
            entry.get("TimeStamp").and_then(Value::as_str),
        )
        .ok_or_else(invalid_payload)?;
        for (provider_key, scale_type) in [
            ("R", NoaaScaleType::RadioBlackout),
            ("S", NoaaScaleType::SolarRadiation),
            ("G", NoaaScaleType::GeomagneticStorm),
        ] {
            let Some(scale) = entry.get(provider_key) else {
                continue;
            };
            readings.push(NoaaScaleReading {
                forecast_day,
                level: string_number(scale.get("Scale")),
                major_probability_percent: string_number(scale.get("MajorProb")),
                minor_probability_percent: string_number(scale.get("MinorProb")),
                probability_percent: string_number(scale.get("Prob")),
                scale_type,
                text: scale
                    .get("Text")
                    .and_then(Value::as_str)
                    .filter(|text| !text.trim().is_empty())
                    .map(str::to_owned),
                valid_at_unix_ms,
            });
        }
    }
    if readings.is_empty() {
        Err(invalid_payload())
    } else {
        Ok(readings)
    }
}

fn parse_kp_samples(value: &Value) -> Result<Vec<KpIndexSample>, ProviderError> {
    let rows = value.as_array().ok_or_else(invalid_payload)?;
    let samples = rows
        .iter()
        .filter_map(|row| {
            Some(KpIndexSample {
                a_running: u16::try_from(row.get("a_running")?.as_u64()?).ok()?,
                kp: row.get("Kp")?.as_f64()?,
                observed_at_unix_ms: parse_iso_without_zone(row.get("time_tag")?.as_str()?)?,
                station_count: u16::try_from(row.get("station_count")?.as_u64()?).ok()?,
            })
        })
        .collect::<Vec<_>>();
    if samples.is_empty() {
        Err(invalid_payload())
    } else {
        Ok(samples)
    }
}

fn parse_alerts(value: &Value) -> Result<Vec<NoaaAlert>, ProviderError> {
    let rows = value.as_array().ok_or_else(invalid_payload)?;
    Ok(rows
        .iter()
        .take(MAX_ALERTS)
        .filter_map(|row| {
            let product_id = row.get("product_id")?.as_str()?.trim();
            let message = row.get("message")?.as_str()?.trim();
            let issued_at_unix_ms =
                parse_fractional_datetime(row.get("issue_datetime")?.as_str()?)?;
            let (headline, alert_kind) = alert_headline(message);
            let (scale_type, scale_level) = alert_scale(message);
            Some(NoaaAlert {
                alert_kind,
                headline,
                issued_at_unix_ms,
                message: message.to_owned(),
                product_id: product_id.to_owned(),
                scale_level,
                scale_type,
            })
        })
        .collect())
}

fn parse_solar_wind(value: &Value) -> Option<SolarWindSample> {
    let row = value.as_array()?.first()?;
    Some(SolarWindSample {
        observed_at_unix_ms: chrono::DateTime::parse_from_rfc3339(row.get("time_tag")?.as_str()?)
            .ok()?
            .timestamp_millis()
            .try_into()
            .ok()?,
        speed_kilometers_per_second: row.get("proton_speed")?.as_f64()?,
    })
}

fn alert_headline(message: &str) -> (String, NoaaAlertKind) {
    for line in message
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        let upper = line.to_ascii_uppercase();
        let kind = if upper.starts_with("ALERT:") {
            Some(NoaaAlertKind::Alert)
        } else if upper.starts_with("WARNING:") {
            Some(NoaaAlertKind::Warning)
        } else if upper.starts_with("WATCH:") {
            Some(NoaaAlertKind::Watch)
        } else if upper.starts_with("SUMMARY:") {
            Some(NoaaAlertKind::Summary)
        } else if upper.starts_with("CANCEL") {
            Some(NoaaAlertKind::Cancellation)
        } else {
            None
        };
        if let Some(kind) = kind {
            return (line.to_owned(), kind);
        }
    }
    let fallback = message
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("NOAA space weather message")
        .to_owned();
    (fallback, NoaaAlertKind::Message)
}

fn alert_scale(message: &str) -> (Option<String>, Option<u8>) {
    for line in message.lines().map(str::trim) {
        let Some((_, value)) = line.split_once("NOAA Scale:") else {
            continue;
        };
        let token = value.split_whitespace().next().unwrap_or_default();
        let mut characters = token.chars();
        let scale_type = characters
            .next()
            .filter(|value| matches!(value, 'R' | 'S' | 'G'));
        let level = characters.next().and_then(|value| value.to_digit(10));
        if let Some(scale_type) = scale_type {
            return (
                Some(scale_type.to_string()),
                level.and_then(|value| u8::try_from(value).ok()),
            );
        }
    }
    (None, None)
}

fn parse_noaa_datetime(date: Option<&str>, time: Option<&str>) -> Option<u64> {
    parse_fractional_datetime(&format!("{} {}", date?, time?))
}

fn parse_fractional_datetime(value: &str) -> Option<u64> {
    NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f")
        .ok()?
        .and_utc()
        .timestamp_millis()
        .try_into()
        .ok()
}

fn parse_iso_without_zone(value: &str) -> Option<u64> {
    NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S")
        .ok()?
        .and_utc()
        .timestamp_millis()
        .try_into()
        .ok()
}

fn string_number<T>(value: Option<&Value>) -> Option<T>
where
    T: std::str::FromStr,
{
    value?.as_str()?.parse().ok()
}

fn invalid_payload() -> ProviderError {
    ProviderError::new("invalid_payload", ProviderErrorCategory::Validation, false)
}

fn stale_or_unavailable(
    cached: Option<CachedNoaaSnapshot>,
    error_code: impl Into<String>,
) -> NoaaSpaceWeatherPayload {
    let error_code = error_code.into();
    if let Some(mut cached) = cached {
        cached.payload.error_code = Some(error_code);
        cached.payload.stale = true;
        cached.payload.status = SpaceWeatherStatus::Stale;
        cached.payload
    } else {
        NoaaSpaceWeatherPayload::unavailable(error_code)
    }
}

async fn read_cache(path: &Path) -> Option<CachedNoaaSnapshot> {
    serde_json::from_slice(&tokio::fs::read(path).await.ok()?).ok()
}

async fn write_cache(path: &Path, payload: &NoaaSpaceWeatherPayload) -> Result<(), ()> {
    let bytes = serde_json::to_vec(&CachedNoaaSnapshot {
        payload: payload.clone(),
    })
    .map_err(|_| ())?;
    write_atomic(path, &bytes).await.map_err(|_| ())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{alert_headline, alert_scale, parse_kp_samples, parse_scales};
    use crate::domain::space_weather::{NoaaAlertKind, NoaaScaleType};

    #[test]
    fn parses_real_noaa_scale_shape() {
        let readings = parse_scales(&json!({
            "0": {
                "DateStamp": "2026-08-09",
                "TimeStamp": "01:27:00",
                "R": { "Scale": "0", "Text": "none", "MinorProb": null, "MajorProb": null },
                "S": { "Scale": "0", "Text": "none", "Prob": null },
                "G": { "Scale": "2", "Text": "moderate" }
            }
        }))
        .unwrap();
        assert_eq!(readings.len(), 3);
        assert!(readings.iter().any(|reading| {
            reading.scale_type == NoaaScaleType::GeomagneticStorm && reading.level == Some(2)
        }));
    }

    #[test]
    fn parses_real_noaa_kp_shape() {
        let samples = parse_kp_samples(&json!([{
            "time_tag": "2026-08-08T21:00:00",
            "Kp": 5.67,
            "a_running": 67,
            "station_count": 8
        }]))
        .unwrap();
        assert_eq!(samples[0].station_count, 8);
        assert!((samples[0].kp - 5.67).abs() < f64::EPSILON);
    }

    #[test]
    fn maps_alert_kind_and_official_scale() {
        let message = "Space Weather Message Code: ALTK06\nALERT: Geomagnetic K-index of 6\nNOAA Scale: G2 - Moderate";
        let (headline, kind) = alert_headline(message);
        let (scale, level) = alert_scale(message);
        assert_eq!(kind, NoaaAlertKind::Alert);
        assert!(headline.starts_with("ALERT:"));
        assert_eq!(scale.as_deref(), Some("G"));
        assert_eq!(level, Some(2));
    }
}
