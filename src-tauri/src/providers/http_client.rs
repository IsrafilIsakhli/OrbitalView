use std::time::{Duration, Instant, SystemTime};

use reqwest::{Client, Response, StatusCode, header::RETRY_AFTER};
use serde::de::DeserializeOwned;

use crate::domain::provider::{ProviderError, ProviderErrorCategory};

#[derive(Clone, Copy, Debug)]
pub struct HttpPolicy {
    pub max_response_bytes: usize,
    pub max_retries: u8,
}

pub struct HttpJsonResponse<T> {
    pub data: T,
    pub duration_ms: u64,
    pub retry_count: u8,
}

pub struct HttpJsonClient {
    client: Client,
}

impl HttpJsonClient {
    pub fn new(timeout: Duration) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(timeout)
            .user_agent(concat!("OrbitalVision/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|_| "Unable to initialize the provider HTTP client".to_owned())?;
        Ok(Self { client })
    }

    pub async fn get_json<T>(
        &self,
        url: &str,
        policy: HttpPolicy,
    ) -> Result<HttpJsonResponse<T>, ProviderError>
    where
        T: DeserializeOwned,
    {
        let started = Instant::now();
        let mut retry_count = 0_u8;
        loop {
            match self.get_json_once(url, policy.max_response_bytes).await {
                Ok(data) => {
                    return Ok(HttpJsonResponse {
                        data,
                        duration_ms: started.elapsed().as_millis() as u64,
                        retry_count,
                    });
                }
                Err(error) if error.retryable && retry_count < policy.max_retries => {
                    retry_count += 1;
                    let delay = error
                        .retry_after_unix_ms
                        .and_then(|target| target.checked_sub(unix_time_ms()))
                        .map(Duration::from_millis)
                        .unwrap_or_else(|| {
                            Duration::from_millis(250 * 2_u64.pow(u32::from(retry_count - 1)))
                        });
                    tokio::time::sleep(delay.min(Duration::from_secs(15))).await;
                }
                Err(error) => return Err(error),
            }
        }
    }

    async fn get_json_once<T>(
        &self,
        url: &str,
        max_response_bytes: usize,
    ) -> Result<T, ProviderError>
    where
        T: DeserializeOwned,
    {
        let response = self.client.get(url).send().await.map_err(|error| {
            ProviderError::new(
                if error.is_timeout() {
                    "timeout"
                } else {
                    "network"
                },
                ProviderErrorCategory::Network,
                true,
            )
        })?;
        let status = response.status();
        let retry_after = response
            .headers()
            .get(RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .map(|seconds| unix_time_ms().saturating_add(seconds.saturating_mul(1_000)));
        if !status.is_success() {
            return Err(classify_status(status).with_retry_after(retry_after));
        }
        let bytes = read_bounded_bytes(response, max_response_bytes).await?;
        serde_json::from_slice(&bytes).map_err(|_| {
            ProviderError::new("invalid_json", ProviderErrorCategory::Validation, false)
        })
    }
}

pub async fn read_bounded_bytes(
    mut response: Response,
    max_response_bytes: usize,
) -> Result<Vec<u8>, ProviderError> {
    if response
        .content_length()
        .is_some_and(|length| length > max_response_bytes as u64)
    {
        return Err(ProviderError::new(
            "response_too_large",
            ProviderErrorCategory::Validation,
            false,
        ));
    }
    let mut bytes = Vec::with_capacity(
        response
            .content_length()
            .unwrap_or_default()
            .min(max_response_bytes as u64) as usize,
    );
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| ProviderError::new("network", ProviderErrorCategory::Network, true))?
    {
        if bytes.len().saturating_add(chunk.len()) > max_response_bytes {
            return Err(ProviderError::new(
                "response_too_large",
                ProviderErrorCategory::Validation,
                false,
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub fn safe_transport_code(error: &ProviderError) -> &'static str {
    match error.code.as_str() {
        "timeout" => "timeout",
        "response_too_large" => "response_too_large",
        "invalid_json" => "invalid_json",
        "rate_limited" => "rate_limited",
        "authentication" => "authentication",
        "upstream_unavailable" | "upstream_request" => "upstream_status",
        _ => "network",
    }
}

fn classify_status(status: StatusCode) -> ProviderError {
    if status == StatusCode::TOO_MANY_REQUESTS {
        ProviderError::new("rate_limited", ProviderErrorCategory::RateLimit, true)
    } else if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        ProviderError::new(
            "authentication",
            ProviderErrorCategory::Authentication,
            false,
        )
    } else if status.is_server_error() {
        ProviderError::new(
            "upstream_unavailable",
            ProviderErrorCategory::Upstream,
            true,
        )
    } else {
        ProviderError::new("upstream_request", ProviderErrorCategory::Upstream, false)
    }
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::classify_status;
    use crate::domain::provider::ProviderErrorCategory;

    #[test]
    fn maps_statuses_without_exposing_request_urls() {
        let error = classify_status(reqwest::StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(error.code, "rate_limited");
        assert_eq!(error.category, ProviderErrorCategory::RateLimit);
        assert!(error.retryable);

        let error = classify_status(reqwest::StatusCode::UNAUTHORIZED);
        assert_eq!(error.code, "authentication");
        assert!(!error.retryable);
    }
}
