mod api;
mod config;
mod error;
mod providers;
mod rate_limit;

use std::sync::Arc;

use config::Config;
use providers::{LibreTranslateProvider, TranslationProvider};
use rate_limit::RateLimiter;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    let config = Config::from_env()?;
    let provider: Arc<dyn TranslationProvider> = Arc::new(LibreTranslateProvider::new(&config)?);
    let languages = provider.supported_languages().await.map_err(|error| {
        format!(
            "Translation provider health check failed: {}",
            error.message
        )
    })?;
    for required in ["en", "az", "tr", "ru", "es"] {
        if !languages.iter().any(|language| language == required) {
            return Err(format!(
                "Translation provider does not support required language: {required}"
            )
            .into());
        }
    }
    let listener = tokio::net::TcpListener::bind(config.bind_address).await?;
    tracing::info!(address = %config.bind_address, provider = provider.name(), "translation gateway ready");
    let app = api::routes(api::AppState {
        languages,
        provider,
        rate_limiter: Arc::new(RateLimiter::new(config.max_requests_per_minute)),
    });
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}
