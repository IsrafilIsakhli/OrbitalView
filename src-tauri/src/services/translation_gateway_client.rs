use std::{path::PathBuf, time::Duration};

use reqwest::{Client, StatusCode, Url};

use crate::domain::{
    news::NewsError,
    translation::{TranslationGatewayRequest, TranslationGatewayResponse},
};

#[derive(Clone)]
pub struct TranslationGatewayClient {
    client: Client,
    endpoint: Option<Url>,
    installation_id: String,
}

impl TranslationGatewayClient {
    pub fn new(installation_id_path: PathBuf) -> Self {
        let endpoint = std::env::var("ORBITAL_VISION_TRANSLATION_GATEWAY_URL")
            .ok()
            .or_else(|| option_env!("ORBITAL_VISION_TRANSLATION_GATEWAY_URL").map(str::to_owned))
            .and_then(|value| validate_endpoint(&value).ok());
        let client = Client::builder()
            .timeout(Duration::from_secs(45))
            .user_agent(concat!("OrbitalVision/", env!("CARGO_PKG_VERSION")))
            .build()
            .unwrap_or_else(|_| Client::new());
        let installation_id = installation_id(&installation_id_path)
            .unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());
        Self {
            client,
            endpoint,
            installation_id,
        }
    }

    pub fn configured(&self) -> bool {
        self.endpoint.is_some()
    }

    pub async fn translate(
        &self,
        request: &TranslationGatewayRequest,
    ) -> Result<TranslationGatewayResponse, TranslationGatewayError> {
        let endpoint = self
            .endpoint
            .as_ref()
            .ok_or_else(|| TranslationGatewayError {
                code: "translation_unconfigured",
                message: "Translation gateway is not configured".to_owned(),
                retry_after_ms: 15 * 60 * 1_000,
            })?;
        let url = endpoint
            .join("v1/translations")
            .map_err(|error| TranslationGatewayError::request(error.to_string()))?;
        let response = self
            .client
            .post(url)
            .header("x-orbital-installation-id", &self.installation_id)
            .json(request)
            .send()
            .await
            .map_err(|error| TranslationGatewayError::request(error.to_string()))?;
        let status = response.status();
        if !status.is_success() {
            let retry_after_ms = response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<u64>().ok())
                .map(|seconds| seconds.saturating_mul(1_000))
                .unwrap_or_else(|| {
                    if status == StatusCode::TOO_MANY_REQUESTS {
                        5 * 60_000
                    } else {
                        60_000
                    }
                });
            return Err(TranslationGatewayError {
                code: if status == StatusCode::TOO_MANY_REQUESTS {
                    "translation_rate_limited"
                } else {
                    "translation_unavailable"
                },
                message: format!("Translation gateway returned HTTP {status}"),
                retry_after_ms,
            });
        }
        response
            .json::<TranslationGatewayResponse>()
            .await
            .map_err(|error| TranslationGatewayError::request(error.to_string()))
    }
}

pub struct TranslationGatewayError {
    pub code: &'static str,
    pub message: String,
    pub retry_after_ms: u64,
}

impl TranslationGatewayError {
    fn request(message: String) -> Self {
        Self {
            code: "translation_network",
            message,
            retry_after_ms: 60_000,
        }
    }

    pub fn as_news_error(&self) -> NewsError {
        NewsError::new(self.code, self.message.clone())
    }
}

fn validate_endpoint(value: &str) -> Result<Url, String> {
    let mut url = Url::parse(value).map_err(|error| error.to_string())?;
    let local_development =
        url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "localhost"));
    if url.scheme() != "https" && !local_development {
        return Err("Translation gateway must use HTTPS".to_owned());
    }
    if !url.path().ends_with('/') {
        url.set_path(&format!("{}/", url.path()));
    }
    Ok(url)
}

fn installation_id(path: &PathBuf) -> Result<String, String> {
    if let Ok(existing) = std::fs::read_to_string(path) {
        let existing = existing.trim();
        if uuid::Uuid::parse_str(existing).is_ok() {
            return Ok(existing.to_owned());
        }
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let value = uuid::Uuid::new_v4().to_string();
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, value.as_bytes()).map_err(|error| error.to_string())?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    std::fs::rename(&temporary, path).map_err(|error| error.to_string())?;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::validate_endpoint;

    #[test]
    fn only_https_or_local_development_gateways_are_allowed() {
        assert!(validate_endpoint("https://translate.example.com/").is_ok());
        assert!(validate_endpoint("http://127.0.0.1:8080/").is_ok());
        assert!(validate_endpoint("http://translate.example.com/").is_err());
    }
}
