use chrono::{Days, Utc};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use super::control_center::{OperationsService, ProviderId};
use crate::{
    domain::credentials::{NasaCredentialSource, NasaCredentialStatus},
    providers::nasa::{NasaComponentPayload, NasaProvider, NasaRequest},
};

pub struct NasaIntelligenceService {
    provider: NasaProvider,
    pub(crate) request_gate: Mutex<()>,
}

impl NasaIntelligenceService {
    pub fn new(initial_credential: Option<(String, NasaCredentialSource)>) -> Result<Self, String> {
        Ok(Self {
            provider: NasaProvider::new(initial_credential)?,
            request_gate: Mutex::new(()),
        })
    }

    pub fn credential_status(&self) -> NasaCredentialStatus {
        self.provider.credential_status()
    }

    pub fn set_credential(&self, api_key: Option<String>, source: NasaCredentialSource) {
        self.provider.set_credential(api_key, source);
    }

    pub fn set_credential_verified(&self, verified: bool) {
        self.provider.set_credential_verified(verified);
    }

    pub async fn verify_credential(&self) -> bool {
        self.provider.verify_credential().await
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NasaIntelligencePayload {
    pub apod: NasaComponentPayload,
    pub api_key_configured: bool,
    pub cmes: NasaComponentPayload,
    pub flares: NasaComponentPayload,
    pub neo: NasaComponentPayload,
    pub retrieved_at_unix_ms: u64,
    pub storms: NasaComponentPayload,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NasaIntelligenceError {
    code: &'static str,
    message: &'static str,
}

#[tauri::command]
pub async fn nasa_intelligence(
    app: AppHandle,
    service: State<'_, NasaIntelligenceService>,
    operations: State<'_, OperationsService>,
) -> Result<NasaIntelligencePayload, NasaIntelligenceError> {
    let started = std::time::Instant::now();
    let payload = resolve_nasa_intelligence(app, &service, false).await?;
    let components = [
        &payload.apod,
        &payload.neo,
        &payload.cmes,
        &payload.flares,
        &payload.storms,
    ];
    let item_count = components
        .iter()
        .map(|component| {
            component
                .data
                .as_array()
                .map(Vec::len)
                .unwrap_or_else(|| usize::from(!component.data.is_null()))
        })
        .sum();
    let fetched_at = components
        .iter()
        .map(|component| component.fetched_at_unix_ms)
        .max()
        .unwrap_or_default();
    let stale = components.iter().any(|component| {
        component.stale
            || matches!(
                component.status,
                crate::providers::nasa::ProviderStatus::Unavailable
            )
    });
    operations.observe(
        ProviderId::Nasa,
        item_count,
        fetched_at,
        stale,
        started.elapsed().as_millis() as u64,
    );
    Ok(payload)
}

pub(crate) async fn resolve_nasa_intelligence(
    app: AppHandle,
    service: &NasaIntelligenceService,
    force_refresh: bool,
) -> Result<NasaIntelligencePayload, NasaIntelligenceError> {
    let _request_guard = service.request_gate.lock().await;
    if super::system::update_preparing() {
        return Err(NasaIntelligenceError {
            code: "update_in_progress",
            message: "Update handoff",
        });
    }
    let cache_directory = app
        .path()
        .app_cache_dir()
        .map_err(|_| NasaIntelligenceError {
            code: "cache_path",
            message: "NASA cache path is unavailable",
        })?
        .join("nasa-open-apis-v1");
    tokio::fs::create_dir_all(&cache_directory)
        .await
        .map_err(|_| NasaIntelligenceError {
            code: "cache_write",
            message: "NASA cache directory could not be prepared",
        })?;

    let today = Utc::now().date_naive();
    let neo_end = today.checked_add_days(Days::new(7)).unwrap_or(today);
    let donki_start = today.checked_sub_days(Days::new(7)).unwrap_or(today);
    let now = unix_time_ms();
    let apod_request = NasaRequest::apod(today);
    let neo_request = NasaRequest::neo_feed(today, neo_end);
    let cme_request = NasaRequest::donki("cme", "/DONKI/CME", donki_start, today);
    let flare_request = NasaRequest::donki("flare", "/DONKI/FLR", donki_start, today);
    let storm_request = NasaRequest::donki("storm", "/DONKI/GST", donki_start, today);
    let apod_cache = cache_directory.join(&apod_request.cache_file);
    let neo_cache = cache_directory.join(&neo_request.cache_file);
    let cme_cache = cache_directory.join(&cme_request.cache_file);
    let flare_cache = cache_directory.join(&flare_request.cache_file);
    let storm_cache = cache_directory.join(&storm_request.cache_file);

    let resolve = |request, path| async move {
        if force_refresh {
            service.provider.resolve_force(request, path, now).await
        } else {
            service.provider.resolve(request, path, now).await
        }
    };
    let (apod, neo, cmes, flares, storms) = tokio::join!(
        resolve(&apod_request, &apod_cache),
        resolve(&neo_request, &neo_cache),
        resolve(&cme_request, &cme_cache),
        resolve(&flare_request, &flare_cache),
        resolve(&storm_request, &storm_cache),
    );

    let payload = NasaIntelligencePayload {
        apod,
        api_key_configured: service.provider.is_configured(),
        cmes,
        flares,
        neo,
        retrieved_at_unix_ms: now,
        storms,
    };
    crate::services::local_snapshots::publish("nasa", &payload);
    Ok(payload)
}

fn unix_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
