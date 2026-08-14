use std::net::IpAddr;

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalUrlError {
    code: &'static str,
}

#[tauri::command]
pub fn open_external_url(app: AppHandle, url: String) -> Result<(), ExternalUrlError> {
    let normalized = validate_external_url(&url)?;
    app.opener()
        .open_url(normalized, None::<String>)
        .map_err(|_| ExternalUrlError {
            code: "open_failed",
        })
}

fn validate_external_url(value: &str) -> Result<String, ExternalUrlError> {
    let value = value.trim();
    if value.is_empty() || value.len() > 2_048 {
        return Err(ExternalUrlError {
            code: "invalid_url",
        });
    }
    let parsed = reqwest::Url::parse(value).map_err(|_| ExternalUrlError {
        code: "invalid_url",
    })?;
    if parsed.scheme() != "https" || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(ExternalUrlError { code: "unsafe_url" });
    }
    let host = parsed
        .host_str()
        .ok_or(ExternalUrlError { code: "unsafe_url" })?
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return Err(ExternalUrlError { code: "unsafe_url" });
    }
    if host
        .parse::<IpAddr>()
        .ok()
        .is_some_and(|address| !is_public_ip(address))
    {
        return Err(ExternalUrlError { code: "unsafe_url" });
    }
    Ok(parsed.to_string())
}

fn is_public_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => {
            !(address.is_private()
                || address.is_loopback()
                || address.is_link_local()
                || address.is_broadcast()
                || address.is_documentation()
                || address.is_unspecified())
        }
        IpAddr::V6(address) => {
            !(address.is_loopback()
                || address.is_unspecified()
                || address.is_unique_local()
                || address.is_unicast_link_local())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::validate_external_url;

    #[test]
    fn accepts_public_https_and_rejects_unsafe_targets() {
        assert!(validate_external_url("https://www.nasa.gov/mission").is_ok());
        assert!(validate_external_url("http://www.nasa.gov").is_err());
        assert!(validate_external_url("https://127.0.0.1/private").is_err());
        assert!(validate_external_url("https://user:secret@example.com").is_err());
    }
}
