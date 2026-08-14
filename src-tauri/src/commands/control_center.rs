use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant, SystemTime},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use super::{
    launches::{LaunchIntelligenceService, resolve_space_intelligence},
    nasa::{NasaIntelligenceService, resolve_nasa_intelligence},
    noaa::{NoaaSpaceWeatherService, noaa_item_count, resolve_noaa_space_weather},
    satellites::{SatelliteCatalogService, resolve_active_satellite_catalog},
};
use crate::{
    domain::{
        credentials::NasaCredentialStatus, news::NewsOperationsSnapshot, runtime::RuntimeInfo,
    },
    providers::nasa::ProviderStatus,
    services::{news_service::NewsService, provider_health_store::ProviderHealthStore},
};

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderId {
    Celestrak,
    LaunchLibrary,
    Nasa,
    NoaaSwpc,
    OpenMeteo,
    SpaceflightNews,
}

impl ProviderId {
    pub const ALL: [Self; 6] = [
        Self::Celestrak,
        Self::LaunchLibrary,
        Self::Nasa,
        Self::NoaaSwpc,
        Self::OpenMeteo,
        Self::SpaceflightNews,
    ];

    fn cache_directories(self) -> &'static [&'static str] {
        match self {
            Self::Celestrak => &["satellite-catalog-v1"],
            Self::LaunchLibrary => &[
                "launch-intelligence-v1",
                "launch-detail-v1",
                "launch-rocket-v1",
                "remote-media-v1/launch-library",
            ],
            Self::Nasa => &["nasa-open-apis-v1", "remote-media-v1/nasa"],
            Self::NoaaSwpc => &["noaa-swpc-v1"],
            Self::OpenMeteo => &["launch-weather-v1"],
            Self::SpaceflightNews => &["space-news-images-v1"],
        }
    }

    fn expected_ttl(self) -> Duration {
        match self {
            Self::Celestrak => Duration::from_secs(2 * 60 * 60),
            Self::LaunchLibrary => Duration::from_secs(30 * 60),
            Self::Nasa => Duration::from_secs(3 * 60 * 60),
            Self::NoaaSwpc => Duration::from_secs(5 * 60),
            Self::OpenMeteo => Duration::from_secs(15 * 60),
            Self::SpaceflightNews => Duration::from_secs(15 * 60),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderHealthStatus {
    Healthy,
    Refreshing,
    Stale,
    Degraded,
    Unavailable,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
struct ProviderRuntimeState {
    #[serde(default)]
    backoff_until_unix_ms: Option<u64>,
    item_count: usize,
    last_attempt_at_unix_ms: Option<u64>,
    last_error_code: Option<String>,
    last_latency_ms: Option<u64>,
    last_success_at_unix_ms: Option<u64>,
    #[serde(default)]
    retry_count: u8,
    refreshing: bool,
}

pub struct OperationsService {
    background_sync: AtomicBool,
    health_store: Option<ProviderHealthStore>,
    providers: Mutex<HashMap<ProviderId, ProviderRuntimeState>>,
}

impl Default for OperationsService {
    fn default() -> Self {
        Self {
            background_sync: AtomicBool::new(true),
            health_store: None,
            providers: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Deserialize, Serialize)]
struct PersistedProviderHealth {
    providers: HashMap<ProviderId, ProviderRuntimeState>,
    version: u8,
}

impl OperationsService {
    pub fn with_persistence(path: PathBuf) -> Self {
        let store = ProviderHealthStore::new(path);
        let mut providers = store
            .load::<PersistedProviderHealth>()
            .filter(|snapshot| snapshot.version == 1)
            .map(|snapshot| snapshot.providers)
            .unwrap_or_default();
        for runtime in providers.values_mut() {
            runtime.refreshing = false;
        }
        Self {
            background_sync: AtomicBool::new(true),
            health_store: Some(store),
            providers: Mutex::new(providers),
        }
    }

    pub fn background_sync_enabled(&self) -> bool {
        self.background_sync.load(Ordering::Relaxed)
    }

    fn begin(&self, provider: ProviderId) {
        let mut providers = self
            .providers
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let state = providers.entry(provider).or_default();
        state.last_attempt_at_unix_ms = Some(unix_time_ms());
        state.refreshing = true;
        self.persist(&providers);
    }

    fn finish_success(&self, provider: ProviderId, item_count: usize, latency_ms: u64) {
        let mut providers = self
            .providers
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let state = providers.entry(provider).or_default();
        state.item_count = item_count;
        state.last_error_code = None;
        state.backoff_until_unix_ms = None;
        state.last_latency_ms = Some(latency_ms);
        state.last_success_at_unix_ms = Some(unix_time_ms());
        state.retry_count = 0;
        state.refreshing = false;
        self.persist(&providers);
    }

    fn finish_error(&self, provider: ProviderId, code: &str, latency_ms: u64) {
        let mut providers = self
            .providers
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let state = providers.entry(provider).or_default();
        state.last_error_code = Some(code.to_owned());
        state.last_latency_ms = Some(latency_ms);
        state.refreshing = false;
        self.persist(&providers);
    }

    pub(crate) fn schedule_retry(&self, provider: ProviderId, retry_count: u8, delay: Duration) {
        let mut providers = self
            .providers
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let state = providers.entry(provider).or_default();
        state.retry_count = retry_count;
        state.backoff_until_unix_ms =
            Some(unix_time_ms().saturating_add(delay.as_millis().min(u128::from(u64::MAX)) as u64));
        self.persist(&providers);
    }

    pub(crate) fn observe(
        &self,
        provider: ProviderId,
        item_count: usize,
        fetched_at_unix_ms: u64,
        stale: bool,
        latency_ms: u64,
    ) {
        let mut providers = self
            .providers
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let state = providers.entry(provider).or_default();
        state.item_count = item_count;
        state.last_attempt_at_unix_ms = Some(unix_time_ms());
        state.last_error_code = stale.then(|| "stale_fallback".to_owned());
        state.backoff_until_unix_ms = None;
        state.last_latency_ms = Some(latency_ms);
        state.last_success_at_unix_ms = Some(fetched_at_unix_ms);
        state.retry_count = 0;
        state.refreshing = false;
        self.persist(&providers);
    }

    fn persist(&self, providers: &HashMap<ProviderId, ProviderRuntimeState>) {
        if let Some(store) = &self.health_store {
            store.save(&PersistedProviderHealth {
                providers: providers.clone(),
                version: 1,
            });
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheInventory {
    pub bytes: u64,
    pub entry_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHealth {
    pub backoff_until_unix_ms: Option<u64>,
    pub cache: CacheInventory,
    pub expires_at_unix_ms: Option<u64>,
    pub item_count: usize,
    pub last_attempt_at_unix_ms: Option<u64>,
    pub last_error_code: Option<String>,
    pub last_latency_ms: Option<u64>,
    pub last_success_at_unix_ms: Option<u64>,
    pub provider: ProviderId,
    pub retry_count: u8,
    pub status: ProviderHealthStatus,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlCenterSnapshot {
    pub background_sync_enabled: bool,
    pub generated_at_unix_ms: u64,
    pub nasa_credential: NasaCredentialStatus,
    pub providers: Vec<ProviderHealth>,
    pub scheduler_state: &'static str,
    pub space_news: NewsOperationsSnapshot,
    pub runtime: RuntimeInfo,
    pub total_cache_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshProviderResult {
    pub fetched_at_unix_ms: u64,
    pub item_count: usize,
    pub provider: ProviderId,
    pub suggested_interval_ms: u64,
    pub stale: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationsError {
    pub(crate) code: &'static str,
    pub(crate) message: String,
}

impl OperationsError {
    fn new(code: &'static str, _detail: impl Into<String>) -> Self {
        Self {
            code,
            message: "Provider operation failed".to_owned(),
        }
    }
}

#[tauri::command]
pub async fn control_center_snapshot(
    app: AppHandle,
    operations: State<'_, OperationsService>,
    news: State<'_, NewsService>,
    nasa: State<'_, NasaIntelligenceService>,
) -> Result<ControlCenterSnapshot, OperationsError> {
    create_snapshot(&app, &operations, &news, &nasa).await
}

pub(crate) async fn create_snapshot(
    app: &AppHandle,
    operations: &OperationsService,
    news: &NewsService,
    nasa: &NasaIntelligenceService,
) -> Result<ControlCenterSnapshot, OperationsError> {
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| OperationsError::new("cache_path", error.to_string()))?;
    let now = unix_time_ms();
    let runtime_states = operations
        .providers
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone();
    let space_news = news.operations_snapshot().await.unwrap_or_default();
    let mut providers = Vec::with_capacity(ProviderId::ALL.len());
    for provider in ProviderId::ALL {
        let mut cache = scan_provider_cache(&cache_root, provider).await?;
        if provider == ProviderId::SpaceflightNews {
            cache.inventory.bytes = cache
                .inventory
                .bytes
                .saturating_add(space_news.database_bytes);
            cache.inventory.entry_count = cache
                .inventory
                .entry_count
                .saturating_add(space_news.item_count);
        }
        let mut runtime = runtime_states.get(&provider).cloned().unwrap_or_default();
        if provider == ProviderId::SpaceflightNews && runtime.item_count == 0 {
            runtime.item_count = space_news.item_count;
        }
        let inferred_success = if provider == ProviderId::SpaceflightNews {
            space_news
                .last_success_at_unix_ms
                .or(cache.last_modified_unix_ms)
        } else {
            cache.last_modified_unix_ms
        };
        let last_success = runtime.last_success_at_unix_ms.or(inferred_success);
        let expires_at = last_success
            .map(|value| value.saturating_add(provider.expected_ttl().as_millis() as u64));
        let status = if runtime.refreshing {
            ProviderHealthStatus::Refreshing
        } else if runtime.last_error_code.is_some() && cache.inventory.entry_count > 0 {
            ProviderHealthStatus::Degraded
        } else if expires_at.is_some_and(|expiry| expiry > now) {
            ProviderHealthStatus::Healthy
        } else if cache.inventory.entry_count > 0
            || (provider == ProviderId::SpaceflightNews && runtime.item_count > 0)
        {
            ProviderHealthStatus::Stale
        } else {
            ProviderHealthStatus::Unavailable
        };
        providers.push(ProviderHealth {
            backoff_until_unix_ms: runtime.backoff_until_unix_ms,
            cache: cache.inventory,
            expires_at_unix_ms: expires_at,
            item_count: runtime.item_count,
            last_attempt_at_unix_ms: runtime.last_attempt_at_unix_ms,
            last_error_code: runtime.last_error_code,
            last_latency_ms: runtime.last_latency_ms,
            last_success_at_unix_ms: last_success,
            provider,
            retry_count: runtime.retry_count,
            status,
        });
    }
    let total_cache_bytes = providers
        .iter()
        .map(|health| health.cache.bytes)
        .sum::<u64>();
    Ok(ControlCenterSnapshot {
        background_sync_enabled: operations.background_sync_enabled(),
        generated_at_unix_ms: now,
        nasa_credential: nasa.credential_status(),
        providers,
        scheduler_state: if operations.background_sync_enabled() {
            "running"
        } else {
            "paused"
        },
        space_news,
        runtime: RuntimeInfo::current(),
        total_cache_bytes,
    })
}

#[tauri::command]
pub async fn refresh_provider(
    app: AppHandle,
    provider: ProviderId,
) -> Result<RefreshProviderResult, OperationsError> {
    refresh_provider_from_app(&app, provider).await
}

struct ProviderRefreshServices<'a> {
    launches: &'a LaunchIntelligenceService,
    nasa: &'a NasaIntelligenceService,
    news: &'a NewsService,
    noaa: &'a NoaaSpaceWeatherService,
    operations: &'a OperationsService,
    satellites: &'a SatelliteCatalogService,
}

pub(crate) async fn refresh_provider_from_app(
    app: &AppHandle,
    provider: ProviderId,
) -> Result<RefreshProviderResult, OperationsError> {
    let operations = app.state::<OperationsService>();
    let satellites = app.state::<SatelliteCatalogService>();
    let launches = app.state::<LaunchIntelligenceService>();
    let nasa = app.state::<NasaIntelligenceService>();
    let noaa = app.state::<NoaaSpaceWeatherService>();
    let news = app.state::<NewsService>();
    refresh_provider_inner(
        app.clone(),
        provider,
        ProviderRefreshServices {
            launches: &launches,
            nasa: &nasa,
            news: &news,
            noaa: &noaa,
            operations: &operations,
            satellites: &satellites,
        },
    )
    .await
}

async fn refresh_provider_inner(
    app: AppHandle,
    provider: ProviderId,
    services: ProviderRefreshServices<'_>,
) -> Result<RefreshProviderResult, OperationsError> {
    services.operations.begin(provider);
    let started = Instant::now();
    let result = match provider {
        ProviderId::Celestrak => resolve_active_satellite_catalog(app, services.satellites, true)
            .await
            .map(|payload| RefreshProviderResult {
                fetched_at_unix_ms: payload.fetched_at_unix_ms,
                item_count: payload.orbital_object_count,
                provider,
                suggested_interval_ms: 2 * 60 * 60 * 1_000,
                stale: payload.stale,
            })
            .map_err(|_| OperationsError::new("provider_refresh", "CelesTrak refresh failed")),
        ProviderId::LaunchLibrary => resolve_space_intelligence(app, services.launches, true)
            .await
            .map(|payload| {
                let urgent = launch_refresh_is_urgent(&payload.launches_data, unix_time_ms());
                RefreshProviderResult {
                    fetched_at_unix_ms: payload.fetched_at_unix_ms,
                    item_count: payload.launch_count + payload.event_count,
                    provider,
                    suggested_interval_ms: if urgent {
                        2 * 60 * 1_000
                    } else {
                        10 * 60 * 1_000
                    },
                    stale: payload.stale,
                }
            })
            .map_err(|_| OperationsError::new("provider_refresh", "Launch Library refresh failed")),
        ProviderId::Nasa => resolve_nasa_intelligence(app, services.nasa, true)
            .await
            .map(|payload| {
                let components = [
                    &payload.apod,
                    &payload.neo,
                    &payload.cmes,
                    &payload.flares,
                    &payload.storms,
                ];
                let item_count = components
                    .iter()
                    .map(|component| value_item_count(&component.data))
                    .sum();
                let fetched_at_unix_ms = components
                    .iter()
                    .map(|component| component.fetched_at_unix_ms)
                    .max()
                    .unwrap_or_default();
                let stale = components.iter().any(|component| {
                    matches!(
                        component.status,
                        ProviderStatus::Stale | ProviderStatus::Unavailable
                    )
                });
                RefreshProviderResult {
                    fetched_at_unix_ms,
                    item_count,
                    provider,
                    suggested_interval_ms: 30 * 60 * 1_000,
                    stale,
                }
            })
            .map_err(|_| OperationsError::new("provider_refresh", "NASA refresh failed")),
        ProviderId::NoaaSwpc => {
            let payload = resolve_noaa_space_weather(app, services.noaa, true).await;
            Ok(RefreshProviderResult {
                fetched_at_unix_ms: payload.fetched_at_unix_ms,
                item_count: noaa_item_count(&payload),
                provider,
                suggested_interval_ms: 5 * 60 * 1_000,
                stale: payload.stale
                    || matches!(
                        payload.status,
                        crate::domain::space_weather::SpaceWeatherStatus::Unavailable
                    ),
            })
        }
        ProviderId::OpenMeteo => Err(OperationsError::new(
            "on_demand_provider",
            "Open-Meteo refresh requires a selected launch site",
        )),
        ProviderId::SpaceflightNews => services
            .news
            .sync(&app, true)
            .await
            .map(|payload| RefreshProviderResult {
                fetched_at_unix_ms: payload.fetched_at_unix_ms,
                item_count: payload.item_count,
                provider,
                suggested_interval_ms: 15 * 60 * 1_000,
                stale: payload.stale,
            })
            .map_err(|error| OperationsError::new(error.code, error.message)),
    };
    let latency = started.elapsed().as_millis() as u64;
    match &result {
        Ok(payload) => services
            .operations
            .finish_success(provider, payload.item_count, latency),
        Err(error) => services
            .operations
            .finish_error(provider, error.code, latency),
    }
    result
}

#[tauri::command]
pub async fn clear_provider_cache(
    app: AppHandle,
    provider: ProviderId,
    operations: State<'_, OperationsService>,
) -> Result<CacheInventory, OperationsError> {
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| OperationsError::new("cache_path", error.to_string()))?;
    for directory in provider.cache_directories() {
        let target = cache_root.join(directory);
        let metadata = match tokio::fs::symlink_metadata(&target).await {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(OperationsError::new("cache_inspect", error.to_string())),
        };
        if !metadata.is_dir() || is_reparse_point(&metadata) {
            return Err(OperationsError::new(
                "unsafe_cache_target",
                "Cache target is not a regular application directory",
            ));
        }
        tokio::fs::remove_dir_all(&target)
            .await
            .map_err(|error| OperationsError::new("cache_clear", error.to_string()))?;
    }
    let mut providers = operations
        .providers
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    providers.remove(&provider);
    operations.persist(&providers);
    Ok(CacheInventory {
        bytes: 0,
        entry_count: 0,
    })
}

#[tauri::command]
pub fn set_background_sync_enabled(enabled: bool, operations: State<'_, OperationsService>) {
    operations.background_sync.store(enabled, Ordering::Relaxed);
}

struct ScannedCache {
    inventory: CacheInventory,
    last_modified_unix_ms: Option<u64>,
}

async fn scan_provider_cache(
    root: &Path,
    provider: ProviderId,
) -> Result<ScannedCache, OperationsError> {
    let mut bytes = 0_u64;
    let mut entry_count = 0_usize;
    let mut last_modified: Option<u64> = None;
    for directory in provider.cache_directories() {
        let path = root.join(directory);
        let mut entries = match tokio::fs::read_dir(path).await {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(OperationsError::new("cache_read", error.to_string())),
        };
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|error| OperationsError::new("cache_read", error.to_string()))?
        {
            let metadata = entry
                .metadata()
                .await
                .map_err(|error| OperationsError::new("cache_read", error.to_string()))?;
            if !metadata.is_file() {
                continue;
            }
            bytes = bytes.saturating_add(metadata.len());
            entry_count += 1;
            let modified = metadata.modified().ok().and_then(system_time_ms);
            last_modified = match (last_modified, modified) {
                (Some(left), Some(right)) => Some(left.max(right)),
                (None, value) => value,
                (value, None) => value,
            };
        }
    }
    Ok(ScannedCache {
        inventory: CacheInventory { bytes, entry_count },
        last_modified_unix_ms: last_modified,
    })
}

fn value_item_count(value: &Value) -> usize {
    value
        .as_array()
        .map(Vec::len)
        .or_else(|| value.as_object().map(|_| 1))
        .unwrap_or_default()
}

fn launch_refresh_is_urgent(value: &Value, now_unix_ms: u64) -> bool {
    value.as_array().is_some_and(|launches| {
        launches.iter().any(|launch| {
            if launch
                .get("status")
                .and_then(|status| status.get("id"))
                .and_then(Value::as_u64)
                == Some(6)
            {
                return true;
            }
            launch
                .get("net")
                .and_then(Value::as_str)
                .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
                .and_then(|date| u64::try_from(date.timestamp_millis()).ok())
                .is_some_and(|net| net >= now_unix_ms && net - now_unix_ms <= 6 * 60 * 60 * 1_000)
        })
    })
}

fn system_time_ms(value: SystemTime) -> Option<u64> {
    value
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

#[cfg(windows)]
fn is_reparse_point(metadata: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & 0x400 != 0
}

#[cfg(not(windows))]
fn is_reparse_point(metadata: &std::fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::json;

    use super::{OperationsService, ProviderId, launch_refresh_is_urgent};

    #[test]
    fn provider_cache_paths_are_fixed_and_provider_scoped() {
        assert_eq!(
            ProviderId::Celestrak.cache_directories(),
            &["satellite-catalog-v1"]
        );
        assert!(
            ProviderId::LaunchLibrary
                .cache_directories()
                .contains(&"launch-detail-v1")
        );
    }

    #[test]
    fn provider_ttls_match_the_existing_cache_contracts() {
        assert_eq!(
            ProviderId::Celestrak.expected_ttl(),
            Duration::from_secs(7_200)
        );
        assert_eq!(
            ProviderId::OpenMeteo.expected_ttl(),
            Duration::from_secs(900)
        );
        assert_eq!(
            ProviderId::NoaaSwpc.expected_ttl(),
            Duration::from_secs(300)
        );
    }

    #[test]
    fn background_sync_setting_is_process_local_and_mutable() {
        let service = OperationsService::default();
        assert!(service.background_sync_enabled());
        service
            .background_sync
            .store(false, std::sync::atomic::Ordering::Relaxed);
        assert!(!service.background_sync_enabled());
    }

    #[test]
    fn launch_sync_accelerates_only_for_real_near_or_in_flight_records() {
        let now = 1_786_252_400_000_u64;
        assert!(launch_refresh_is_urgent(
            &json!([{ "net": "2026-08-09T08:00:00Z", "status": { "id": 1 } }]),
            now,
        ));
        assert!(launch_refresh_is_urgent(
            &json!([{ "net": "2027-08-09T08:00:00Z", "status": { "id": 6 } }]),
            now,
        ));
        assert!(!launch_refresh_is_urgent(
            &json!([{ "net": "2027-08-09T08:00:00Z", "status": { "id": 1 } }]),
            now,
        ));
    }
}
