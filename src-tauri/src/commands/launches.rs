use std::{path::Path, time::Duration};

use chrono::{SecondsFormat, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use super::cache::write_atomic;
use super::control_center::{OperationsService, ProviderId};
use crate::providers::http_client::{read_bounded_bytes, safe_transport_code};

const UPCOMING_LAUNCHES_URL: &str = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/";
const PREVIOUS_LAUNCHES_URL: &str = "https://ll.thespacedevs.com/2.3.0/launches/previous/";
const LAUNCH_DETAIL_URL: &str = "https://ll.thespacedevs.com/2.3.0/launches/";
const LAUNCHER_CONFIGURATIONS_URL: &str =
    "https://ll.thespacedevs.com/2.3.0/launcher_configurations/";
const EVENTS_URL: &str = "https://ll.thespacedevs.com/2.3.0/events/";
const WEATHER_URL: &str = "https://api.open-meteo.com/v1/forecast";
const SPACE_CACHE_TTL_MS: u64 = 30 * 60 * 1_000;
const WEATHER_CACHE_TTL_MS: u64 = 15 * 60 * 1_000;
const ROCKET_CACHE_TTL_MS: u64 = 24 * 60 * 60 * 1_000;
const MAX_SPACE_RESPONSE_BYTES: usize = 32 * 1024 * 1024;
const MAX_WEATHER_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

pub struct LaunchIntelligenceService {
    client: Client,
    request_gate: Mutex<()>,
    weather_gate: Mutex<()>,
}

impl LaunchIntelligenceService {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(45))
            .user_agent(concat!("OrbitalVision/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|error| format!("Unable to initialize launch intelligence: {error}"))?;

        Ok(Self {
            client,
            request_gate: Mutex::new(()),
            weather_gate: Mutex::new(()),
        })
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceIntelligencePayload {
    pub event_count: usize,
    pub events_data: Value,
    pub expires_at_unix_ms: u64,
    pub fetched_at_unix_ms: u64,
    pub launch_count: usize,
    pub launch_provider_count: usize,
    pub launches_data: Value,
    pub source: String,
    pub stale: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchWeatherPayload {
    pub data: Value,
    pub expires_at_unix_ms: u64,
    pub fetched_at_unix_ms: u64,
    pub source: String,
    pub stale: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RocketConfigurationPayload {
    pub data: Value,
    pub expires_at_unix_ms: u64,
    pub fetched_at_unix_ms: u64,
    pub source: String,
    pub stale: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedComponent {
    data: Value,
    expires_at_unix_ms: u64,
    fetched_at_unix_ms: u64,
    object_count: usize,
    #[serde(default)]
    provider_count: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchListPayload {
    pub expires_at_unix_ms: u64,
    pub fetched_at_unix_ms: u64,
    pub launches_data: Value,
    pub loaded_count: usize,
    pub provider_count: usize,
    pub source: String,
    pub stale: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchDetailPayload {
    pub data: Value,
    pub expires_at_unix_ms: u64,
    pub fetched_at_unix_ms: u64,
    pub source: String,
    pub stale: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchIntelligenceError {
    code: &'static str,
    message: String,
    category: &'static str,
    retryable: bool,
    correlation_id: String,
}

impl LaunchIntelligenceError {
    fn new(code: &'static str, _detail: impl Into<String>) -> Self {
        Self {
            code,
            message: "Launch intelligence operation failed".to_owned(),
            category: error_category(code),
            retryable: matches!(code, "network" | "upstream_status" | "timeout"),
            correlation_id: uuid::Uuid::new_v4().to_string(),
        }
    }
}

fn error_category(code: &str) -> &'static str {
    match code {
        "network" | "timeout" => "network",
        "upstream_status" => "upstream",
        "response_too_large" | "invalid_json" | "invalid_payload" => "validation",
        _ => "storage",
    }
}

#[tauri::command]
pub async fn space_intelligence(
    app: AppHandle,
    service: State<'_, LaunchIntelligenceService>,
    operations: State<'_, OperationsService>,
) -> Result<SpaceIntelligencePayload, LaunchIntelligenceError> {
    let started = std::time::Instant::now();
    let payload = resolve_space_intelligence(app, &service, false).await?;
    operations.observe(
        ProviderId::LaunchLibrary,
        payload.launch_count + payload.event_count,
        payload.fetched_at_unix_ms,
        payload.stale,
        started.elapsed().as_millis() as u64,
    );
    Ok(payload)
}

pub(crate) async fn resolve_space_intelligence(
    app: AppHandle,
    service: &LaunchIntelligenceService,
    force_refresh: bool,
) -> Result<SpaceIntelligencePayload, LaunchIntelligenceError> {
    let _request_guard = service.request_gate.lock().await;
    let cache_directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| LaunchIntelligenceError::new("cache_path", error.to_string()))?
        .join("launch-intelligence-v1");
    tokio::fs::create_dir_all(&cache_directory)
        .await
        .map_err(|error| LaunchIntelligenceError::new("cache_write", error.to_string()))?;

    let now = unix_time_ms();
    let launch_query = vec![
        ("format", "json".to_owned()),
        ("limit", "100".to_owned()),
        ("ordering", "net".to_owned()),
        ("mode", "normal".to_owned()),
    ];
    let (launches, launches_stale) = resolve_paginated_component(
        &service.client,
        UPCOMING_LAUNCHES_URL,
        &launch_query,
        &cache_directory.join("launches.json"),
        now,
        force_refresh,
    )
    .await?;

    // Keep launches safely cached before spending the second anonymous LL2 call.
    let event_query = vec![
        ("format", "json".to_owned()),
        ("limit", "50".to_owned()),
        ("ordering", "date".to_owned()),
        ("mode", "normal".to_owned()),
        (
            "date__gte",
            Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        ),
    ];
    let (events, events_stale) = resolve_paginated_component(
        &service.client,
        EVENTS_URL,
        &event_query,
        &cache_directory.join("events.json"),
        now,
        force_refresh,
    )
    .await?;

    let stale = launches_stale || events_stale;
    Ok(SpaceIntelligencePayload {
        event_count: events.object_count,
        events_data: events.data,
        expires_at_unix_ms: launches.expires_at_unix_ms.min(events.expires_at_unix_ms),
        fetched_at_unix_ms: launches.fetched_at_unix_ms.min(events.fetched_at_unix_ms),
        launch_count: launches.object_count,
        launch_provider_count: normalized_provider_count(&launches),
        launches_data: launches.data,
        source: if stale {
            "Launch Library 2.3 cached fallback".to_owned()
        } else {
            "Launch Library 2.3 live".to_owned()
        },
        stale,
    })
}

#[tauri::command]
pub async fn completed_launches(
    app: AppHandle,
    limit: Option<usize>,
    offset: Option<usize>,
    service: State<'_, LaunchIntelligenceService>,
) -> Result<LaunchListPayload, LaunchIntelligenceError> {
    let limit = limit.unwrap_or(50).clamp(1, 100);
    let offset = offset.unwrap_or(0).min(100_000);
    let _request_guard = service.request_gate.lock().await;
    let cache_directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| LaunchIntelligenceError::new("cache_path", error.to_string()))?
        .join("launch-intelligence-v1");
    tokio::fs::create_dir_all(&cache_directory)
        .await
        .map_err(|error| LaunchIntelligenceError::new("cache_write", error.to_string()))?;
    let now = unix_time_ms();
    let query = vec![
        ("format", "json".to_owned()),
        ("limit", limit.to_string()),
        ("offset", offset.to_string()),
        ("ordering", "-net".to_owned()),
        ("mode", "normal".to_owned()),
    ];
    let cache_path = cache_directory.join(format!("previous-{limit}-{offset}.json"));
    let (component, stale) = resolve_paginated_component(
        &service.client,
        PREVIOUS_LAUNCHES_URL,
        &query,
        &cache_path,
        now,
        false,
    )
    .await?;
    let provider_count = normalized_provider_count(&component);
    Ok(LaunchListPayload {
        expires_at_unix_ms: component.expires_at_unix_ms,
        fetched_at_unix_ms: component.fetched_at_unix_ms,
        launches_data: component.data,
        loaded_count: component.object_count,
        provider_count,
        source: if stale {
            "Launch Library 2.3 previous cached fallback".to_owned()
        } else {
            "Launch Library 2.3 previous live".to_owned()
        },
        stale,
    })
}

#[tauri::command]
pub async fn launch_detail(
    app: AppHandle,
    launch_id: String,
    service: State<'_, LaunchIntelligenceService>,
) -> Result<LaunchDetailPayload, LaunchIntelligenceError> {
    validate_launch_id(&launch_id)?;
    let _request_guard = service.request_gate.lock().await;
    let cache_directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| LaunchIntelligenceError::new("cache_path", error.to_string()))?
        .join("launch-detail-v1");
    tokio::fs::create_dir_all(&cache_directory)
        .await
        .map_err(|error| LaunchIntelligenceError::new("cache_write", error.to_string()))?;
    let now = unix_time_ms();
    let cache_path = cache_directory.join(format!("{launch_id}.json"));
    let cached = read_component(&cache_path).await;
    if let Some(component) = cached.as_ref().filter(|item| item.expires_at_unix_ms > now) {
        return Ok(detail_payload(component.clone(), false));
    }
    let url = format!("{LAUNCH_DETAIL_URL}{launch_id}/");
    let query = vec![
        ("format", "json".to_owned()),
        ("mode", "detailed".to_owned()),
    ];
    match fetch_raw_component(
        &service.client,
        &url,
        &query,
        now,
        SPACE_CACHE_TTL_MS,
        MAX_SPACE_RESPONSE_BYTES,
        false,
    )
    .await
    {
        Ok(component) => {
            write_component(&cache_path, &component).await?;
            Ok(detail_payload(component, false))
        }
        Err(error) => cached
            .map(|component| detail_payload(component, true))
            .ok_or(error),
    }
}

#[tauri::command]
pub async fn launch_weather(
    app: AppHandle,
    latitude: f64,
    longitude: f64,
    service: State<'_, LaunchIntelligenceService>,
    operations: State<'_, OperationsService>,
) -> Result<LaunchWeatherPayload, LaunchIntelligenceError> {
    let started = std::time::Instant::now();
    validate_coordinates(latitude, longitude)?;
    let _weather_guard = service.weather_gate.lock().await;
    let cache_directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| LaunchIntelligenceError::new("cache_path", error.to_string()))?
        .join("launch-weather-v1");
    tokio::fs::create_dir_all(&cache_directory)
        .await
        .map_err(|error| LaunchIntelligenceError::new("cache_write", error.to_string()))?;

    let now = unix_time_ms();
    let cache_path = cache_directory.join(weather_cache_key(latitude, longitude));
    let cached = read_component(&cache_path).await;
    if let Some(component) = cached.as_ref().filter(|item| item.expires_at_unix_ms > now) {
        let payload = weather_payload(component.clone(), false);
        operations.observe(
            ProviderId::OpenMeteo,
            1,
            payload.fetched_at_unix_ms,
            payload.stale,
            started.elapsed().as_millis() as u64,
        );
        return Ok(payload);
    }

    let query = vec![
        ("latitude", format!("{latitude:.5}")),
        ("longitude", format!("{longitude:.5}")),
        ("timezone", "UTC".to_owned()),
        ("forecast_days", "16".to_owned()),
        ("wind_speed_unit", "kmh".to_owned()),
        (
            "current",
            "temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m".to_owned(),
        ),
        (
            "hourly",
            "temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m".to_owned(),
        ),
    ];

    match fetch_raw_component(
        &service.client,
        WEATHER_URL,
        &query,
        now,
        WEATHER_CACHE_TTL_MS,
        MAX_WEATHER_RESPONSE_BYTES,
        false,
    )
    .await
    {
        Ok(component) => {
            write_component(&cache_path, &component).await?;
            let payload = weather_payload(component, false);
            operations.observe(
                ProviderId::OpenMeteo,
                1,
                payload.fetched_at_unix_ms,
                payload.stale,
                started.elapsed().as_millis() as u64,
            );
            Ok(payload)
        }
        Err(error) => cached
            .map(|component| {
                let payload = weather_payload(component, true);
                operations.observe(
                    ProviderId::OpenMeteo,
                    1,
                    payload.fetched_at_unix_ms,
                    true,
                    started.elapsed().as_millis() as u64,
                );
                payload
            })
            .ok_or(error),
    }
}

#[tauri::command]
pub async fn rocket_configuration(
    app: AppHandle,
    configuration_id: u64,
    service: State<'_, LaunchIntelligenceService>,
) -> Result<RocketConfigurationPayload, LaunchIntelligenceError> {
    if configuration_id == 0 {
        return Err(LaunchIntelligenceError::new(
            "invalid_configuration",
            "Rocket configuration ID must be positive",
        ));
    }
    let _request_guard = service.request_gate.lock().await;
    let cache_directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| LaunchIntelligenceError::new("cache_path", error.to_string()))?
        .join("launch-rocket-v1");
    tokio::fs::create_dir_all(&cache_directory)
        .await
        .map_err(|error| LaunchIntelligenceError::new("cache_write", error.to_string()))?;

    let now = unix_time_ms();
    let cache_path = cache_directory.join(format!("rocket_{configuration_id}.json"));
    let cached = read_component(&cache_path).await;
    if let Some(component) = cached.as_ref().filter(|item| item.expires_at_unix_ms > now) {
        return Ok(rocket_payload(component.clone(), false));
    }

    let url = format!("{LAUNCHER_CONFIGURATIONS_URL}{configuration_id}/");
    let query = vec![
        ("format", "json".to_owned()),
        ("mode", "detailed".to_owned()),
    ];
    match fetch_raw_component(
        &service.client,
        &url,
        &query,
        now,
        ROCKET_CACHE_TTL_MS,
        MAX_WEATHER_RESPONSE_BYTES,
        false,
    )
    .await
    {
        Ok(component) => {
            write_component(&cache_path, &component).await?;
            Ok(rocket_payload(component, false))
        }
        Err(error) => cached
            .map(|component| rocket_payload(component, true))
            .ok_or(error),
    }
}

fn rocket_payload(component: CachedComponent, stale: bool) -> RocketConfigurationPayload {
    RocketConfigurationPayload {
        data: component.data,
        expires_at_unix_ms: component.expires_at_unix_ms,
        fetched_at_unix_ms: component.fetched_at_unix_ms,
        source: if stale {
            "Launch Library 2.3 rocket cached fallback".to_owned()
        } else {
            "Launch Library 2.3 rocket live".to_owned()
        },
        stale,
    }
}

fn weather_payload(component: CachedComponent, stale: bool) -> LaunchWeatherPayload {
    LaunchWeatherPayload {
        data: component.data,
        expires_at_unix_ms: component.expires_at_unix_ms,
        fetched_at_unix_ms: component.fetched_at_unix_ms,
        source: if stale {
            "Open-Meteo cached fallback".to_owned()
        } else {
            "Open-Meteo live".to_owned()
        },
        stale,
    }
}

fn detail_payload(component: CachedComponent, stale: bool) -> LaunchDetailPayload {
    LaunchDetailPayload {
        data: component.data,
        expires_at_unix_ms: component.expires_at_unix_ms,
        fetched_at_unix_ms: component.fetched_at_unix_ms,
        source: if stale {
            "Launch Library 2.3 detail cached fallback".to_owned()
        } else {
            "Launch Library 2.3 detail live".to_owned()
        },
        stale,
    }
}

fn normalized_provider_count(component: &CachedComponent) -> usize {
    component.provider_count.max(component.object_count)
}

async fn resolve_paginated_component(
    client: &Client,
    url: &str,
    query: &[(&str, String)],
    cache_path: &Path,
    now: u64,
    force_refresh: bool,
) -> Result<(CachedComponent, bool), LaunchIntelligenceError> {
    let cached = read_component(cache_path).await;
    if !force_refresh
        && let Some(component) = cached.as_ref().filter(|item| item.expires_at_unix_ms > now)
    {
        return Ok((component.clone(), false));
    }

    match fetch_raw_component(
        client,
        url,
        query,
        now,
        SPACE_CACHE_TTL_MS,
        MAX_SPACE_RESPONSE_BYTES,
        true,
    )
    .await
    {
        Ok(component) => {
            write_component(cache_path, &component).await?;
            Ok((component, false))
        }
        Err(error) => cached.map(|component| (component, true)).ok_or(error),
    }
}

async fn fetch_raw_component(
    client: &Client,
    url: &str,
    query: &[(&str, String)],
    now: u64,
    ttl_ms: u64,
    max_response_bytes: usize,
    paginated: bool,
) -> Result<CachedComponent, LaunchIntelligenceError> {
    let response = client
        .get(url)
        .query(query)
        .send()
        .await
        .map_err(|error| LaunchIntelligenceError::new("network", error.to_string()))?
        .error_for_status()
        .map_err(|error| LaunchIntelligenceError::new("upstream_status", error.to_string()))?;

    if response
        .content_length()
        .is_some_and(|length| length > max_response_bytes as u64)
    {
        return Err(LaunchIntelligenceError::new(
            "response_too_large",
            "Upstream response exceeded the configured safety limit",
        ));
    }

    let bytes = read_bounded_bytes(response, max_response_bytes)
        .await
        .map_err(|error| {
            LaunchIntelligenceError::new(safe_transport_code(&error), "provider transport")
        })?;

    let value = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| LaunchIntelligenceError::new("invalid_json", error.to_string()))?;
    let (data, object_count, provider_count) = if paginated {
        pagination_results(value)?
    } else {
        (value, 1, 1)
    };

    Ok(CachedComponent {
        data,
        expires_at_unix_ms: now + ttl_ms,
        fetched_at_unix_ms: now,
        object_count,
        provider_count,
    })
}

fn pagination_results(value: Value) -> Result<(Value, usize, usize), LaunchIntelligenceError> {
    let provider_count = value
        .get("count")
        .and_then(Value::as_u64)
        .and_then(|count| usize::try_from(count).ok());
    let results = value
        .get("results")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            LaunchIntelligenceError::new(
                "invalid_payload",
                "Launch Library returned a response without a results array",
            )
        })?;
    if results.is_empty() {
        return Err(LaunchIntelligenceError::new(
            "invalid_payload",
            "Launch Library returned an empty results array",
        ));
    }
    let count = results.len();
    Ok((
        Value::Array(results.clone()),
        count,
        provider_count.unwrap_or(count).max(count),
    ))
}

fn validate_launch_id(value: &str) -> Result<(), LaunchIntelligenceError> {
    if (1..=64).contains(&value.len())
        && value
            .bytes()
            .all(|character| character.is_ascii_alphanumeric() || character == b'-')
    {
        Ok(())
    } else {
        Err(LaunchIntelligenceError::new(
            "invalid_launch_id",
            "Launch ID contains unsupported characters",
        ))
    }
}

fn validate_coordinates(latitude: f64, longitude: f64) -> Result<(), LaunchIntelligenceError> {
    if !latitude.is_finite()
        || !longitude.is_finite()
        || !(-90.0..=90.0).contains(&latitude)
        || !(-180.0..=180.0).contains(&longitude)
    {
        return Err(LaunchIntelligenceError::new(
            "invalid_coordinates",
            "Launch-site coordinates are outside the valid geographic range",
        ));
    }
    Ok(())
}

fn weather_cache_key(latitude: f64, longitude: f64) -> String {
    format!(
        "weather_{:+06}_{:+07}.json",
        (latitude * 1_000.0).round() as i32,
        (longitude * 1_000.0).round() as i32,
    )
}

async fn read_component(path: &Path) -> Option<CachedComponent> {
    let bytes = tokio::fs::read(path).await.ok()?;
    serde_json::from_slice(&bytes).ok()
}

async fn write_component(
    path: &Path,
    component: &CachedComponent,
) -> Result<(), LaunchIntelligenceError> {
    let bytes = serde_json::to_vec(component)
        .map_err(|error| LaunchIntelligenceError::new("cache_encode", error.to_string()))?;
    write_atomic(path, &bytes)
        .await
        .map_err(|error| LaunchIntelligenceError::new("cache_write", error.to_string()))
}

fn unix_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{pagination_results, validate_coordinates, validate_launch_id, weather_cache_key};

    #[test]
    fn extracts_non_empty_paginated_results() {
        let (results, count, provider_count) = pagination_results(json!({
            "count": 27,
            "results": [{"id": "launch-1"}]
        }))
        .unwrap();
        assert_eq!(count, 1);
        assert_eq!(provider_count, 27);
        assert_eq!(results.as_array().unwrap()[0]["id"], "launch-1");
    }

    #[test]
    fn rejects_invalid_paginated_payloads() {
        assert!(pagination_results(json!({"results": []})).is_err());
        assert!(pagination_results(json!({"detail": "rate limited"})).is_err());
    }

    #[test]
    fn validates_geographic_coordinates() {
        assert!(validate_coordinates(28.5729, -80.6490).is_ok());
        assert!(validate_coordinates(91.0, 0.0).is_err());
        assert!(validate_coordinates(0.0, f64::NAN).is_err());
    }

    #[test]
    fn validates_launch_ids_before_building_provider_or_cache_paths() {
        assert!(validate_launch_id("ffe1ba5c-ef04-4cc3-8746-f9abd7da2211").is_ok());
        assert!(validate_launch_id("../launches").is_err());
        assert!(validate_launch_id("https://example.com").is_err());
    }

    #[test]
    fn weather_cache_keys_are_stable_and_site_specific() {
        assert_eq!(
            weather_cache_key(28.5729, -80.6490),
            "weather_+28573_-080649.json"
        );
        assert_ne!(
            weather_cache_key(28.5729, -80.6490),
            weather_cache_key(34.6320, -120.6110)
        );
    }
}
