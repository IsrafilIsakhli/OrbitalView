use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use crate::{
    domain::provider::ProviderError,
    domain::space_weather::{NoaaSpaceWeatherPayload, SpaceWeatherStatus},
    providers::noaa_swpc::NoaaSwpcProvider,
};

use super::control_center::{OperationsService, ProviderId};

pub struct NoaaSpaceWeatherService {
    provider: NoaaSwpcProvider,
    pub(crate) request_gate: Mutex<()>,
}

impl NoaaSpaceWeatherService {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            provider: NoaaSwpcProvider::new()?,
            request_gate: Mutex::new(()),
        })
    }
}

#[tauri::command]
pub async fn noaa_space_weather(
    app: AppHandle,
    service: State<'_, NoaaSpaceWeatherService>,
    operations: State<'_, OperationsService>,
) -> Result<NoaaSpaceWeatherPayload, ProviderError> {
    let started = std::time::Instant::now();
    let payload = resolve_noaa_space_weather(app, &service, false).await;
    operations.observe(
        ProviderId::NoaaSwpc,
        noaa_item_count(&payload),
        payload.fetched_at_unix_ms,
        payload.stale || payload.status == SpaceWeatherStatus::Unavailable,
        started.elapsed().as_millis() as u64,
    );
    Ok(payload)
}

pub(crate) async fn resolve_noaa_space_weather(
    app: AppHandle,
    service: &NoaaSpaceWeatherService,
    force_refresh: bool,
) -> NoaaSpaceWeatherPayload {
    let _guard = service.request_gate.lock().await;
    if super::system::update_preparing() {
        return NoaaSpaceWeatherPayload::unavailable("update_in_progress");
    }
    let cache_directory = match app.path().app_cache_dir() {
        Ok(path) => path.join("noaa-swpc-v1"),
        Err(_) => return NoaaSpaceWeatherPayload::unavailable("cache_path"),
    };
    if tokio::fs::create_dir_all(&cache_directory).await.is_err() {
        return NoaaSpaceWeatherPayload::unavailable("cache_write");
    }
    let payload = service
        .provider
        .resolve(
            &cache_directory.join("space-weather.json"),
            unix_time_ms(),
            force_refresh,
        )
        .await;
    if payload.status != SpaceWeatherStatus::Unavailable {
        crate::services::local_snapshots::publish("noaaSwpc", &payload);
    }
    payload
}

pub(crate) fn noaa_item_count(payload: &NoaaSpaceWeatherPayload) -> usize {
    payload.alerts.len()
        + payload.kp_samples.len()
        + payload.scales.len()
        + usize::from(payload.solar_wind.is_some())
}

fn unix_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
