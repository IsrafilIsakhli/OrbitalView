use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    time::Duration,
};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use super::cache::write_atomic;
use super::control_center::{OperationsService, ProviderId};
use crate::providers::http_client::{read_bounded_bytes, safe_transport_code};

const ACTIVE_OMM_URL: &str = "https://celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=JSON";
const ACTIVE_SATCAT_URL: &str = "https://celestrak.org/satcat/records.php?GROUP=ACTIVE&FORMAT=JSON";
const RECENT_OMM_URL: &str =
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=LAST-30-DAYS&FORMAT=JSON";
const RECENT_SATCAT_URL: &str =
    "https://celestrak.org/satcat/records.php?GROUP=LAST-30-DAYS&FORMAT=JSON";
const CACHE_TTL_MS: u64 = 2 * 60 * 60 * 1_000;
const MAX_RESPONSE_BYTES: usize = 64 * 1024 * 1024;

pub struct SatelliteCatalogService {
    client: Client,
    request_gate: Mutex<()>,
}

impl SatelliteCatalogService {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(90))
            .user_agent(concat!("OrbitalVision/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|error| format!("Unable to initialize the satellite data client: {error}"))?;

        Ok(Self {
            client,
            request_gate: Mutex::new(()),
        })
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SatelliteCatalogPayload {
    pub catalog_data: Value,
    pub catalog_object_count: usize,
    pub expires_at_unix_ms: u64,
    pub fetched_at_unix_ms: u64,
    pub orbital_data: Value,
    pub orbital_object_count: usize,
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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SatelliteCatalogError {
    code: &'static str,
    message: String,
    category: &'static str,
    retryable: bool,
    correlation_id: String,
}

impl SatelliteCatalogError {
    fn new(code: &'static str, _detail: impl Into<String>) -> Self {
        Self {
            code,
            message: "Satellite catalog operation failed".to_owned(),
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
pub async fn active_satellite_catalog(
    app: AppHandle,
    service: State<'_, SatelliteCatalogService>,
    operations: State<'_, OperationsService>,
) -> Result<SatelliteCatalogPayload, SatelliteCatalogError> {
    let started = std::time::Instant::now();
    let payload = resolve_active_satellite_catalog(app, &service, false).await?;
    operations.observe(
        ProviderId::Celestrak,
        payload.orbital_object_count,
        payload.fetched_at_unix_ms,
        payload.stale,
        started.elapsed().as_millis() as u64,
    );
    Ok(payload)
}

pub(crate) async fn resolve_active_satellite_catalog(
    app: AppHandle,
    service: &SatelliteCatalogService,
    force_refresh: bool,
) -> Result<SatelliteCatalogPayload, SatelliteCatalogError> {
    let _request_guard = service.request_gate.lock().await;
    let cache_directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| SatelliteCatalogError::new("cache_path", error.to_string()))?
        .join("satellite-catalog-v1");
    tokio::fs::create_dir_all(&cache_directory)
        .await
        .map_err(|error| SatelliteCatalogError::new("cache_write", error.to_string()))?;

    let now = unix_time_ms();
    let (orbital, orbital_stale) = resolve_component(
        &service.client,
        ACTIVE_OMM_URL,
        &cache_directory.join("orbital.json"),
        now,
        force_refresh,
    )
    .await?;

    // Fetch metadata only after OMM is safely cached. A slow metadata request can
    // never discard a successful, rate-limited orbital response.
    let (catalog, catalog_stale) = resolve_component(
        &service.client,
        ACTIVE_SATCAT_URL,
        &cache_directory.join("catalog.json"),
        now,
        force_refresh,
    )
    .await?;

    // Recent launches add real payloads, rocket bodies, and catalogued debris.
    // They are an enhancement: a temporary failure must never hide the active
    // catalog that was already fetched and cached successfully.
    let recent_orbital = resolve_component(
        &service.client,
        RECENT_OMM_URL,
        &cache_directory.join("recent-orbital.json"),
        now,
        force_refresh,
    )
    .await
    .ok();
    let recent_catalog = resolve_component(
        &service.client,
        RECENT_SATCAT_URL,
        &cache_directory.join("recent-catalog.json"),
        now,
        force_refresh,
    )
    .await
    .ok();

    let recent_available = recent_orbital.is_some();
    let recent_stale = recent_orbital.as_ref().is_some_and(|(_, stale)| *stale)
        || recent_catalog.as_ref().is_some_and(|(_, stale)| *stale);
    let orbital_data = merge_catalog_arrays(
        orbital.data,
        recent_orbital
            .as_ref()
            .map(|(component, _)| &component.data),
    )?;
    let catalog_data = merge_catalog_arrays(
        catalog.data,
        recent_catalog
            .as_ref()
            .map(|(component, _)| &component.data),
    )?;
    let orbital_object_count = array_length(&orbital_data)?;
    let catalog_object_count = array_length(&catalog_data)?;
    let stale = orbital_stale || catalog_stale || recent_stale;
    Ok(SatelliteCatalogPayload {
        catalog_data,
        catalog_object_count,
        expires_at_unix_ms: orbital.expires_at_unix_ms.min(catalog.expires_at_unix_ms),
        fetched_at_unix_ms: orbital.fetched_at_unix_ms.min(catalog.fetched_at_unix_ms),
        orbital_data,
        orbital_object_count,
        source: if stale && recent_available {
            "CelesTrak cached active + recent objects".to_owned()
        } else if stale {
            "CelesTrak cached active objects".to_owned()
        } else if recent_available {
            "CelesTrak live active + recent objects".to_owned()
        } else {
            "CelesTrak live active objects".to_owned()
        },
        stale,
    })
}

fn merge_catalog_arrays(
    primary: Value,
    additional: Option<&Value>,
) -> Result<Value, SatelliteCatalogError> {
    let mut records = primary.as_array().cloned().ok_or_else(|| {
        SatelliteCatalogError::new("invalid_payload", "CelesTrak returned a non-array response")
    })?;
    let mut ids = records.iter().filter_map(norad_id).collect::<HashSet<_>>();

    if let Some(additional_records) = additional.and_then(Value::as_array) {
        for record in additional_records {
            let Some(id) = norad_id(record) else {
                continue;
            };
            if ids.insert(id) {
                records.push(record.clone());
            }
        }
    }

    Ok(Value::Array(records))
}

fn norad_id(value: &Value) -> Option<String> {
    let id = value.get("NORAD_CAT_ID")?;
    id.as_str()
        .map(ToOwned::to_owned)
        .or_else(|| id.as_u64().map(|number| number.to_string()))
        .or_else(|| id.as_i64().map(|number| number.to_string()))
}

async fn resolve_component(
    client: &Client,
    url: &str,
    cache_path: &Path,
    now: u64,
    force_refresh: bool,
) -> Result<(CachedComponent, bool), SatelliteCatalogError> {
    let cached = read_component(cache_path).await;
    if !force_refresh
        && let Some(component) = cached.as_ref().filter(|item| item.expires_at_unix_ms > now)
    {
        return Ok((component.clone(), false));
    }

    // Expired data remains scientifically useful for an immediate startup.
    // Refresh it in the background so a slow or rate-limited upstream can never
    // hold the renderer on an empty catalog.
    if !force_refresh && let Some(component) = cached.clone() {
        refresh_component_in_background(client.clone(), url.to_owned(), cache_path.to_path_buf());
        return Ok((component, true));
    }

    match fetch_component(client, url, now).await {
        Ok(component) => {
            write_component(cache_path, &component).await?;
            Ok((component, false))
        }
        Err(error) => cached.map(|component| (component, true)).ok_or(error),
    }
}

fn refresh_component_in_background(client: Client, url: String, cache_path: PathBuf) {
    tauri::async_runtime::spawn(async move {
        let now = unix_time_ms();
        if let Ok(component) = fetch_component(&client, &url, now).await {
            let _ = write_component(&cache_path, &component).await;
        }
    });
}

async fn fetch_component(
    client: &Client,
    url: &str,
    now: u64,
) -> Result<CachedComponent, SatelliteCatalogError> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| SatelliteCatalogError::new("network", error.to_string()))?
        .error_for_status()
        .map_err(|error| SatelliteCatalogError::new("upstream_status", error.to_string()))?;

    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(SatelliteCatalogError::new(
            "response_too_large",
            "CelesTrak response exceeded the configured safety limit",
        ));
    }

    let bytes = read_bounded_bytes(response, MAX_RESPONSE_BYTES)
        .await
        .map_err(|error| {
            SatelliteCatalogError::new(safe_transport_code(&error), "provider transport")
        })?;

    let data = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| SatelliteCatalogError::new("invalid_json", error.to_string()))?;
    let object_count = array_length(&data)?;
    Ok(CachedComponent {
        data,
        expires_at_unix_ms: now + CACHE_TTL_MS,
        fetched_at_unix_ms: now,
        object_count,
    })
}

fn array_length(value: &Value) -> Result<usize, SatelliteCatalogError> {
    value
        .as_array()
        .map(Vec::len)
        .filter(|length| *length > 0)
        .ok_or_else(|| {
            SatelliteCatalogError::new(
                "invalid_payload",
                "CelesTrak returned an empty or non-array response",
            )
        })
}

async fn read_component(path: &Path) -> Option<CachedComponent> {
    let bytes = tokio::fs::read(path).await.ok()?;
    serde_json::from_slice(&bytes).ok()
}

async fn write_component(
    path: &Path,
    component: &CachedComponent,
) -> Result<(), SatelliteCatalogError> {
    let bytes = serde_json::to_vec(component)
        .map_err(|error| SatelliteCatalogError::new("cache_encode", error.to_string()))?;
    write_atomic(path, &bytes)
        .await
        .map_err(|error| SatelliteCatalogError::new("cache_write", error.to_string()))
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

    use super::{array_length, merge_catalog_arrays};

    #[test]
    fn accepts_non_empty_json_arrays() {
        assert_eq!(array_length(&json!([{"NORAD_CAT_ID": 25544}])).unwrap(), 1);
    }

    #[test]
    fn rejects_empty_or_non_array_payloads() {
        assert!(array_length(&json!([])).is_err());
        assert!(array_length(&json!({"error": "rate limited"})).is_err());
    }

    #[test]
    fn merges_recent_objects_without_duplicate_norad_ids() {
        let merged = merge_catalog_arrays(
            json!([{ "NORAD_CAT_ID": 1, "OBJECT_NAME": "ACTIVE" }]),
            Some(&json!([
                { "NORAD_CAT_ID": 1, "OBJECT_NAME": "DUPLICATE" },
                { "NORAD_CAT_ID": 2, "OBJECT_NAME": "STAGE R/B" }
            ])),
        )
        .unwrap();
        assert_eq!(array_length(&merged).unwrap(), 2);
        assert_eq!(merged[1]["OBJECT_NAME"], "STAGE R/B");
    }
}
