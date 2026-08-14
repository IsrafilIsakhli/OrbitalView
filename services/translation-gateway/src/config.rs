use std::{env, net::SocketAddr};

use url::Url;

#[derive(Clone)]
pub struct Config {
    pub api_key: Option<String>,
    pub bind_address: SocketAddr,
    pub libre_translate_url: Url,
    pub max_requests_per_minute: usize,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let raw_url = env::var("LIBRETRANSLATE_URL")
            .map_err(|_| "LIBRETRANSLATE_URL is required".to_owned())?;
        let libre_translate_url = Url::parse(&raw_url).map_err(|error| error.to_string())?;
        let host = libre_translate_url.host_str().unwrap_or_default();
        if libre_translate_url.scheme() != "https"
            && host != "localhost"
            && host != "127.0.0.1"
            && host != "::1"
        {
            return Err("LIBRETRANSLATE_URL must use HTTPS outside local development".to_owned());
        }
        let bind_address = env::var("BIND_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:8088".to_owned())
            .parse()
            .map_err(|error| format!("Invalid BIND_ADDR: {error}"))?;
        let max_requests_per_minute = env::var("RATE_LIMIT_PER_MINUTE")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(30)
            .clamp(1, 600);
        Ok(Self {
            api_key: env::var("LIBRETRANSLATE_API_KEY")
                .ok()
                .filter(|value| !value.is_empty()),
            bind_address,
            libre_translate_url,
            max_requests_per_minute,
        })
    }
}
