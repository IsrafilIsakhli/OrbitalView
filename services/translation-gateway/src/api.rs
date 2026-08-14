use std::{net::SocketAddr, sync::Arc};

use axum::{
    Json, Router,
    extract::{ConnectInfo, State},
    http::HeaderMap,
    routing::{get, post},
};
use serde::Serialize;

use crate::{
    error::GatewayError,
    providers::{TranslationBatch, TranslationBatchResult, TranslationProvider},
    rate_limit::RateLimiter,
};

#[derive(Clone)]
pub struct AppState {
    pub languages: Vec<String>,
    pub provider: Arc<dyn TranslationProvider>,
    pub rate_limiter: Arc<RateLimiter>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthPayload {
    languages: Vec<String>,
    provider: String,
    status: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LanguagesPayload {
    languages: Vec<String>,
}

pub fn routes(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/languages", get(languages))
        .route("/v1/translations", post(translate))
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> Json<HealthPayload> {
    Json(HealthPayload {
        languages: state.languages.clone(),
        provider: state.provider.name().to_owned(),
        status: "healthy",
    })
}

async fn languages(State(state): State<AppState>) -> Json<LanguagesPayload> {
    Json(LanguagesPayload {
        languages: state.languages.clone(),
    })
}

async fn translate(
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TranslationBatch>,
) -> Result<Json<TranslationBatchResult>, GatewayError> {
    let installation_id = headers
        .get("x-orbital-installation-id")
        .and_then(|value| value.to_str().ok())
        .filter(|value| {
            (16..=64).contains(&value.len())
                && value
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '-')
        })
        .ok_or_else(|| {
            GatewayError::bad_request(
                "installation_id",
                "A valid installation identifier is required",
            )
        })?;
    state
        .rate_limiter
        .check(format!("{}:{installation_id}", address.ip()))
        .await
        .map_err(GatewayError::rate_limited)?;
    validate(&request)?;
    state.provider.translate_batch(request).await.map(Json)
}

fn validate(request: &TranslationBatch) -> Result<(), GatewayError> {
    if request.source != "en" {
        return Err(GatewayError::bad_request(
            "unsupported_source",
            "Only English source content is accepted",
        ));
    }
    if !matches!(request.target.as_str(), "az" | "tr" | "ru" | "es") {
        return Err(GatewayError::bad_request(
            "unsupported_target",
            "Target locale is not enabled",
        ));
    }
    if request.items.is_empty() || request.items.len() > 10 {
        return Err(GatewayError::bad_request(
            "invalid_batch",
            "A batch must contain between 1 and 10 news items",
        ));
    }
    let characters = request
        .items
        .iter()
        .map(|item| item.title.chars().count() + item.summary.chars().count())
        .sum::<usize>();
    if characters == 0 || characters > 12_000 {
        return Err(GatewayError::bad_request(
            "character_limit",
            "Translation batch exceeds the character budget",
        ));
    }
    if request
        .items
        .iter()
        .any(|item| item.id.trim().is_empty() || item.title.trim().is_empty())
    {
        return Err(GatewayError::bad_request(
            "invalid_item",
            "Every item needs a stable id and title",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::providers::{TranslationBatch, TranslationItem};

    use super::validate;

    fn request(target: &str) -> TranslationBatch {
        TranslationBatch {
            items: vec![TranslationItem {
                id: "sfn:article:1".into(),
                summary: "Summary".into(),
                title: "Title".into(),
            }],
            source: "en".into(),
            target: target.into(),
        }
    }

    #[test]
    fn accepts_supported_targets() {
        for target in ["az", "tr", "ru", "es"] {
            assert!(validate(&request(target)).is_ok());
        }
    }

    #[test]
    fn rejects_unbounded_or_unknown_requests() {
        assert!(validate(&request("fr")).is_err());
        let mut batch = request("az");
        batch.items.clear();
        assert!(validate(&batch).is_err());
    }
}
