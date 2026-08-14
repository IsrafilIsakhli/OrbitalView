use std::{
    path::Path,
    sync::RwLock,
    time::{Duration, Instant},
};

#[cfg(debug_assertions)]
use std::path::PathBuf;

use chrono::{NaiveDate, Utc};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    commands::cache::write_atomic,
    domain::credentials::{NasaCredentialSource, NasaCredentialStatus},
    providers::http_client::{read_bounded_bytes, safe_transport_code},
};

const NASA_API_BASE: &str = "https://api.nasa.gov";
const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_RETRIES: u8 = 1;

#[derive(Clone, Copy, Debug)]
pub enum ExpectedPayload {
    Apod,
    Donki,
    NeoFeed,
}

#[derive(Clone, Debug)]
pub struct NasaRequest {
    pub cache_file: String,
    pub expected: ExpectedPayload,
    pub label: &'static str,
    pub path: &'static str,
    pub query: Vec<(&'static str, String)>,
    pub ttl_ms: u64,
}

impl NasaRequest {
    pub fn apod(date: NaiveDate) -> Self {
        Self {
            cache_file: format!("apod-{date}.json"),
            expected: ExpectedPayload::Apod,
            label: "apod",
            path: "/planetary/apod",
            query: vec![("date", date.to_string()), ("thumbs", "true".to_owned())],
            ttl_ms: 24 * 60 * 60 * 1_000,
        }
    }

    pub fn neo_feed(start: NaiveDate, end: NaiveDate) -> Self {
        Self {
            cache_file: format!("neo-{start}-{end}.json"),
            expected: ExpectedPayload::NeoFeed,
            label: "neo-feed",
            path: "/neo/rest/v1/feed",
            query: vec![
                ("start_date", start.to_string()),
                ("end_date", end.to_string()),
            ],
            ttl_ms: 3 * 60 * 60 * 1_000,
        }
    }

    pub fn donki(
        label: &'static str,
        path: &'static str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Self {
        Self {
            cache_file: format!("donki-{label}-{start}-{end}.json"),
            expected: ExpectedPayload::Donki,
            label,
            path,
            query: vec![
                ("startDate", start.to_string()),
                ("endDate", end.to_string()),
            ],
            ttl_ms: 60 * 60 * 1_000,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderStatus {
    Fresh,
    Stale,
    Unavailable,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDiagnostics {
    pub cache_hit: bool,
    pub duration_ms: u64,
    pub error_type: Option<String>,
    pub provider: &'static str,
    pub request: &'static str,
    pub retry_count: u8,
    pub status: ProviderStatus,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NasaComponentPayload {
    pub data: Value,
    pub diagnostics: ProviderDiagnostics,
    pub expires_at_unix_ms: u64,
    pub fetched_at_unix_ms: u64,
    pub rate_limit_remaining: Option<u64>,
    pub source: &'static str,
    pub stale: bool,
    pub status: ProviderStatus,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedComponent {
    data: Value,
    expires_at_unix_ms: u64,
    fetched_at_unix_ms: u64,
}

pub struct NasaProvider {
    base_url: String,
    client: Client,
    credential: RwLock<NasaCredentialRuntime>,
    max_retries: u8,
}

struct NasaCredentialRuntime {
    api_key: Option<String>,
    source: NasaCredentialSource,
    verified: Option<bool>,
}

impl NasaProvider {
    pub fn new(initial_credential: Option<(String, NasaCredentialSource)>) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .user_agent(concat!("OrbitalVision/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|_| "Unable to initialize the NASA data client".to_owned())?;

        let (api_key, source) = initial_credential
            .map(|(api_key, source)| (Some(api_key), source))
            .unwrap_or((None, NasaCredentialSource::Unconfigured));
        Ok(Self {
            base_url: NASA_API_BASE.to_owned(),
            client,
            credential: RwLock::new(NasaCredentialRuntime {
                api_key,
                source,
                verified: None,
            }),
            max_retries: MAX_RETRIES,
        })
    }

    pub fn is_configured(&self) -> bool {
        self.credential
            .read()
            .unwrap_or_else(|error| error.into_inner())
            .api_key
            .is_some()
    }

    pub fn credential_status(&self) -> NasaCredentialStatus {
        let credential = self
            .credential
            .read()
            .unwrap_or_else(|error| error.into_inner());
        NasaCredentialStatus {
            configured: credential.api_key.is_some(),
            source: credential.source,
            verified: credential.verified,
        }
    }

    pub fn set_credential(&self, api_key: Option<String>, source: NasaCredentialSource) {
        let mut credential = self
            .credential
            .write()
            .unwrap_or_else(|error| error.into_inner());
        credential.api_key = api_key;
        credential.source = source;
        credential.verified = None;
    }

    pub fn set_credential_verified(&self, verified: bool) {
        self.credential
            .write()
            .unwrap_or_else(|error| error.into_inner())
            .verified = Some(verified);
    }

    pub async fn verify_credential(&self) -> bool {
        self.fetch(&NasaRequest::apod(Utc::now().date_naive()))
            .await
            .is_ok()
    }

    #[cfg(test)]
    fn for_test(base_url: String, timeout: Duration, max_retries: u8) -> Self {
        Self {
            base_url,
            client: Client::builder().timeout(timeout).build().unwrap(),
            credential: RwLock::new(NasaCredentialRuntime {
                api_key: Some("abcdefghijklmnopqrstuvwxyz1234567890".to_owned()),
                source: NasaCredentialSource::Development,
                verified: None,
            }),
            max_retries,
        }
    }

    pub async fn resolve(
        &self,
        request: &NasaRequest,
        cache_path: &Path,
        now: u64,
    ) -> NasaComponentPayload {
        self.resolve_with_policy(request, cache_path, now, false)
            .await
    }

    pub async fn resolve_force(
        &self,
        request: &NasaRequest,
        cache_path: &Path,
        now: u64,
    ) -> NasaComponentPayload {
        self.resolve_with_policy(request, cache_path, now, true)
            .await
    }

    async fn resolve_with_policy(
        &self,
        request: &NasaRequest,
        cache_path: &Path,
        now: u64,
        force_refresh: bool,
    ) -> NasaComponentPayload {
        let cached = read_component(cache_path).await;
        if !force_refresh
            && let Some(component) = cached
                .as_ref()
                .filter(|component| component.expires_at_unix_ms > now)
        {
            return component_payload(
                component.clone(),
                request,
                ResolutionMetadata {
                    cache_hit: true,
                    duration_ms: 0,
                    error_type: None,
                    rate_limit_remaining: None,
                    retry_count: 0,
                    status: ProviderStatus::Fresh,
                },
            );
        }

        let started = Instant::now();
        match self.fetch(request).await {
            Ok(result) => {
                let component = CachedComponent {
                    data: result.data,
                    expires_at_unix_ms: now + request.ttl_ms,
                    fetched_at_unix_ms: now,
                };
                let cache_error = write_component(cache_path, &component)
                    .await
                    .err()
                    .map(|_| "cache_write".to_owned());
                component_payload(
                    component,
                    request,
                    ResolutionMetadata {
                        cache_hit: false,
                        duration_ms: started.elapsed().as_millis() as u64,
                        error_type: cache_error,
                        rate_limit_remaining: result.rate_limit_remaining,
                        retry_count: result.retry_count,
                        status: ProviderStatus::Fresh,
                    },
                )
            }
            Err(error) => {
                if let Some(component) = cached {
                    component_payload(
                        component,
                        request,
                        ResolutionMetadata {
                            cache_hit: true,
                            duration_ms: started.elapsed().as_millis() as u64,
                            error_type: Some(error.code.to_owned()),
                            rate_limit_remaining: error.rate_limit_remaining,
                            retry_count: error.retry_count,
                            status: ProviderStatus::Stale,
                        },
                    )
                } else {
                    unavailable_payload(
                        request,
                        started.elapsed().as_millis() as u64,
                        error.retry_count,
                        error.code,
                        error.rate_limit_remaining,
                    )
                }
            }
        }
    }

    async fn fetch(&self, request: &NasaRequest) -> Result<FetchResult, FetchError> {
        let api_key = self
            .credential
            .read()
            .unwrap_or_else(|error| error.into_inner())
            .api_key
            .clone()
            .ok_or(FetchError {
                code: "missing_api_key",
                rate_limit_remaining: None,
                retry_count: 0,
                retryable: false,
            })?;

        let mut retry_count = 0;
        loop {
            match self.fetch_once(request, &api_key).await {
                Ok(mut result) => {
                    result.retry_count = retry_count;
                    return Ok(result);
                }
                Err(error) if error.retryable && retry_count < self.max_retries => {
                    retry_count += 1;
                    tokio::time::sleep(Duration::from_millis(250 + u64::from(retry_count) * 125))
                        .await;
                }
                Err(mut error) => {
                    error.retry_count = retry_count;
                    return Err(error);
                }
            }
        }
    }

    async fn fetch_once(
        &self,
        request: &NasaRequest,
        api_key: &str,
    ) -> Result<FetchResult, FetchError> {
        let mut query = request.query.clone();
        query.push(("api_key", api_key.to_owned()));
        let response = self
            .client
            .get(format!("{}{}", self.base_url, request.path))
            .query(&query)
            .send()
            .await
            .map_err(|error| FetchError {
                code: if error.is_timeout() {
                    "timeout"
                } else {
                    "network"
                },
                rate_limit_remaining: None,
                retry_count: 0,
                retryable: true,
            })?;
        let status = response.status();
        let rate_limit_remaining = response
            .headers()
            .get("x-ratelimit-remaining")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());

        if !status.is_success() {
            return Err(FetchError {
                code: status_error_code(status),
                rate_limit_remaining,
                retry_count: 0,
                retryable: status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error(),
            });
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(FetchError {
                code: "response_too_large",
                rate_limit_remaining,
                retry_count: 0,
                retryable: false,
            });
        }

        let bytes = read_bounded_bytes(response, MAX_RESPONSE_BYTES)
            .await
            .map_err(|error| FetchError {
                code: safe_transport_code(&error),
                rate_limit_remaining,
                retry_count: 0,
                retryable: error.retryable,
            })?;
        let data = serde_json::from_slice::<Value>(&bytes).map_err(|_| FetchError {
            code: "invalid_json",
            rate_limit_remaining,
            retry_count: 0,
            retryable: false,
        })?;
        validate_payload(&data, request.expected).map_err(|code| FetchError {
            code,
            rate_limit_remaining,
            retry_count: 0,
            retryable: false,
        })?;

        Ok(FetchResult {
            data,
            rate_limit_remaining,
            retry_count: 0,
        })
    }
}

#[derive(Debug)]
struct FetchResult {
    data: Value,
    rate_limit_remaining: Option<u64>,
    retry_count: u8,
}

#[derive(Debug)]
struct FetchError {
    code: &'static str,
    rate_limit_remaining: Option<u64>,
    retry_count: u8,
    retryable: bool,
}

struct ResolutionMetadata {
    cache_hit: bool,
    duration_ms: u64,
    error_type: Option<String>,
    rate_limit_remaining: Option<u64>,
    retry_count: u8,
    status: ProviderStatus,
}

fn component_payload(
    component: CachedComponent,
    request: &NasaRequest,
    resolution: ResolutionMetadata,
) -> NasaComponentPayload {
    NasaComponentPayload {
        data: component.data,
        diagnostics: ProviderDiagnostics {
            cache_hit: resolution.cache_hit,
            duration_ms: resolution.duration_ms,
            error_type: resolution.error_type,
            provider: "NASA Open APIs",
            request: request.label,
            retry_count: resolution.retry_count,
            status: resolution.status,
        },
        expires_at_unix_ms: component.expires_at_unix_ms,
        fetched_at_unix_ms: component.fetched_at_unix_ms,
        rate_limit_remaining: resolution.rate_limit_remaining,
        source: "NASA Open APIs",
        stale: matches!(resolution.status, ProviderStatus::Stale),
        status: resolution.status,
    }
}

fn unavailable_payload(
    request: &NasaRequest,
    duration_ms: u64,
    retry_count: u8,
    error_type: &'static str,
    rate_limit_remaining: Option<u64>,
) -> NasaComponentPayload {
    NasaComponentPayload {
        data: Value::Null,
        diagnostics: ProviderDiagnostics {
            cache_hit: false,
            duration_ms,
            error_type: Some(error_type.to_owned()),
            provider: "NASA Open APIs",
            request: request.label,
            retry_count,
            status: ProviderStatus::Unavailable,
        },
        expires_at_unix_ms: 0,
        fetched_at_unix_ms: 0,
        rate_limit_remaining,
        source: "NASA Open APIs",
        stale: false,
        status: ProviderStatus::Unavailable,
    }
}

fn validate_payload(value: &Value, expected: ExpectedPayload) -> Result<(), &'static str> {
    match expected {
        ExpectedPayload::Apod => {
            let object = value.as_object().ok_or("invalid_payload")?;
            for field in ["date", "explanation", "media_type", "title", "url"] {
                if !object.get(field).is_some_and(Value::is_string) {
                    return Err("invalid_payload");
                }
            }
            Ok(())
        }
        ExpectedPayload::Donki => value.as_array().map(|_| ()).ok_or("invalid_payload"),
        ExpectedPayload::NeoFeed => value
            .get("near_earth_objects")
            .and_then(Value::as_object)
            .map(|_| ())
            .ok_or("invalid_payload"),
    }
}

fn status_error_code(status: StatusCode) -> &'static str {
    if status == StatusCode::TOO_MANY_REQUESTS {
        "rate_limited"
    } else if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        "authentication"
    } else if status.is_server_error() {
        "upstream_unavailable"
    } else {
        "upstream_request"
    }
}

async fn read_component(path: &Path) -> Option<CachedComponent> {
    let bytes = tokio::fs::read(path).await.ok()?;
    serde_json::from_slice(&bytes).ok()
}

async fn write_component(path: &Path, component: &CachedComponent) -> Result<(), ()> {
    let bytes = serde_json::to_vec(component).map_err(|_| ())?;
    write_atomic(path, &bytes).await.map_err(|_| ())
}

pub(crate) fn load_fallback_api_key() -> Option<(String, NasaCredentialSource)> {
    std::env::var("NASA_API_KEY")
        .ok()
        .and_then(|value| normalize_api_key(&value))
        .map(|api_key| (api_key, NasaCredentialSource::Environment))
        .or_else(|| {
            load_development_api_key().map(|api_key| (api_key, NasaCredentialSource::Development))
        })
}

#[cfg(debug_assertions)]
fn load_development_api_key() -> Option<String> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.env.local");
    let contents = std::fs::read_to_string(path).ok()?;
    extract_env_value(&contents, "NASA_API_KEY").and_then(|value| normalize_api_key(&value))
}

#[cfg(not(debug_assertions))]
fn load_development_api_key() -> Option<String> {
    None
}

#[cfg(any(debug_assertions, test))]
fn extract_env_value(contents: &str, key: &str) -> Option<String> {
    contents.lines().find_map(|line| {
        let line = line.trim().trim_start_matches('\u{feff}');
        if line.is_empty() || line.starts_with('#') {
            return None;
        }
        let (candidate, value) = line.split_once('=')?;
        if candidate.trim() != key {
            return None;
        }
        Some(value.trim().trim_matches(['\'', '"']).to_owned())
    })
}

pub(crate) fn normalize_api_key(value: &str) -> Option<String> {
    let value = value.trim();
    if (20..=128).contains(&value.len())
        && value
            .bytes()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, b'_' | b'-'))
    {
        Some(value.to_owned())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        path::PathBuf,
        thread,
        time::Duration,
    };

    use serde_json::json;

    use super::{
        CachedComponent, ExpectedPayload, NasaProvider, NasaRequest, ProviderStatus,
        extract_env_value, normalize_api_key, status_error_code, validate_payload,
    };

    #[test]
    fn validates_supported_payload_shapes() {
        assert!(
            validate_payload(
                &json!({
                    "date": "2026-08-07",
                    "explanation": "A galaxy",
                    "media_type": "image",
                    "title": "Galaxy",
                    "url": "https://apod.nasa.gov/image.jpg"
                }),
                ExpectedPayload::Apod
            )
            .is_ok()
        );
        assert!(
            validate_payload(&json!({"near_earth_objects": {}}), ExpectedPayload::NeoFeed).is_ok()
        );
        assert!(validate_payload(&json!([]), ExpectedPayload::Donki).is_ok());
    }

    #[test]
    fn rejects_malformed_or_empty_required_payloads() {
        assert!(validate_payload(&json!({}), ExpectedPayload::Apod).is_err());
        assert!(validate_payload(&json!([]), ExpectedPayload::NeoFeed).is_err());
        assert!(validate_payload(&json!({}), ExpectedPayload::Donki).is_err());
    }

    #[test]
    fn accepts_only_plausible_api_keys() {
        assert!(normalize_api_key("abcdefghijklmnopqrstuvwxyz1234567890").is_some());
        assert!(normalize_api_key("short").is_none());
        assert!(normalize_api_key("invalid key with spaces").is_none());
    }

    #[test]
    fn reads_only_the_requested_environment_entry() {
        let contents = "OTHER=value\nNASA_API_KEY='abcdefghijklmnopqrstuvwxyz1234567890'\n";
        assert_eq!(
            extract_env_value(contents, "NASA_API_KEY").as_deref(),
            Some("abcdefghijklmnopqrstuvwxyz1234567890")
        );
    }

    #[test]
    fn classifies_http_failures_without_urls_or_credentials() {
        assert_eq!(
            status_error_code(reqwest::StatusCode::TOO_MANY_REQUESTS),
            "rate_limited"
        );
        assert_eq!(
            status_error_code(reqwest::StatusCode::UNAUTHORIZED),
            "authentication"
        );
        assert_eq!(
            status_error_code(reqwest::StatusCode::BAD_GATEWAY),
            "upstream_unavailable"
        );
        assert_eq!(
            status_error_code(reqwest::StatusCode::BAD_REQUEST),
            "upstream_request"
        );
    }

    #[tokio::test]
    async fn accepts_a_successful_provider_response() {
        let base_url = spawn_http_server(
            "200 OK",
            r#"{"date":"2026-08-07","explanation":"A galaxy","media_type":"image","title":"Galaxy","url":"https://apod.nasa.gov/image.jpg"}"#,
            Duration::ZERO,
        );
        let provider = NasaProvider::for_test(base_url, Duration::from_secs(1), 0);
        let result = provider
            .fetch(&NasaRequest::apod(
                chrono::NaiveDate::from_ymd_opt(2026, 8, 7).unwrap(),
            ))
            .await
            .unwrap();

        assert_eq!(result.data["title"], "Galaxy");
        assert_eq!(result.retry_count, 0);
    }

    #[tokio::test]
    async fn rejects_malformed_provider_json() {
        let base_url = spawn_http_server("200 OK", "{broken", Duration::ZERO);
        let provider = NasaProvider::for_test(base_url, Duration::from_secs(1), 0);
        let error = provider
            .fetch(&NasaRequest::apod(
                chrono::NaiveDate::from_ymd_opt(2026, 8, 7).unwrap(),
            ))
            .await
            .unwrap_err();

        assert_eq!(error.code, "invalid_json");
    }

    #[tokio::test]
    async fn classifies_provider_timeouts() {
        let base_url = spawn_http_server(
            "200 OK",
            r#"{"date":"2026-08-07","explanation":"A galaxy","media_type":"image","title":"Galaxy","url":"https://apod.nasa.gov/image.jpg"}"#,
            Duration::from_millis(150),
        );
        let provider = NasaProvider::for_test(base_url, Duration::from_millis(25), 0);
        let error = provider
            .fetch(&NasaRequest::apod(
                chrono::NaiveDate::from_ymd_opt(2026, 8, 7).unwrap(),
            ))
            .await
            .unwrap_err();

        assert_eq!(error.code, "timeout");
    }

    #[tokio::test]
    async fn classifies_http_errors() {
        let base_url = spawn_http_server("503 Service Unavailable", "{}", Duration::ZERO);
        let provider = NasaProvider::for_test(base_url, Duration::from_secs(1), 0);
        let error = provider
            .fetch(&NasaRequest::apod(
                chrono::NaiveDate::from_ymd_opt(2026, 8, 7).unwrap(),
            ))
            .await
            .unwrap_err();

        assert_eq!(error.code, "upstream_unavailable");
    }

    #[tokio::test]
    async fn returns_stale_cache_when_refresh_fails() {
        let base_url = spawn_http_server("503 Service Unavailable", "{}", Duration::ZERO);
        let provider = NasaProvider::for_test(base_url, Duration::from_secs(1), 0);
        let request = NasaRequest::apod(chrono::NaiveDate::from_ymd_opt(2026, 8, 7).unwrap());
        let cache_path = unique_test_cache_path();
        let cached = CachedComponent {
            data: json!({
                "date": "2026-08-06",
                "explanation": "Cached astronomy",
                "media_type": "image",
                "title": "Cached APOD",
                "url": "https://apod.nasa.gov/cached.jpg"
            }),
            expires_at_unix_ms: 1,
            fetched_at_unix_ms: 1,
        };
        std::fs::write(&cache_path, serde_json::to_vec(&cached).unwrap()).unwrap();

        let result = provider.resolve(&request, &cache_path, 2).await;
        let _ = std::fs::remove_file(&cache_path);

        assert_eq!(result.status, ProviderStatus::Stale);
        assert!(result.stale);
        assert!(result.diagnostics.cache_hit);
        assert_eq!(result.data["title"], "Cached APOD");
        assert_eq!(
            result.diagnostics.error_type.as_deref(),
            Some("upstream_unavailable")
        );
    }

    fn spawn_http_server(status: &'static str, body: &'static str, delay: Duration) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 2_048];
            let _ = stream.read(&mut request);
            thread::sleep(delay);
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(response.as_bytes());
        });
        format!("http://{address}")
    }

    fn unique_test_cache_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "orbital-vision-nasa-cache-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
}
