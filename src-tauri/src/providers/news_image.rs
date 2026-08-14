use std::{
    io::Cursor,
    net::IpAddr,
    path::Path,
    time::{Duration, SystemTime},
};

use image::{ImageFormat, ImageReader, Limits};
use reqwest::{Client, StatusCode, Url, redirect::Policy};
use sha2::{Digest, Sha256};

use crate::{commands::cache::write_atomic, domain::news::NewsError};

const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_REDIRECTS: usize = 3;
const MAX_CACHE_BYTES: u64 = 300 * 1024 * 1024;
const MAX_CACHE_AGE_SECS: u64 = 30 * 24 * 60 * 60;

#[derive(Clone)]
pub struct NewsImageProvider {
    client: Client,
}

impl NewsImageProvider {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(20))
            .user_agent(concat!("OrbitalVision/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|error| format!("Unable to initialize news image client: {error}"))?;
        Ok(Self { client })
    }

    pub async fn cache_image(&self, url: &str, path: &Path) -> Result<(), NewsError> {
        let bytes = self.download(url, None).await?;
        self.write_thumbnail(bytes, path).await
    }

    pub async fn cache_image_scoped(
        &self,
        url: &str,
        path: &Path,
        accepts_host: fn(&str) -> bool,
    ) -> Result<(), NewsError> {
        let bytes = self.download(url, Some(accepts_host)).await?;
        self.write_thumbnail(bytes, path).await
    }

    async fn write_thumbnail(&self, bytes: Vec<u8>, path: &Path) -> Result<(), NewsError> {
        let webp = tokio::task::spawn_blocking(move || encode_thumbnail(&bytes))
            .await
            .map_err(|error| NewsError::new("image_task", error.to_string()))??;
        write_atomic(path, &webp)
            .await
            .map_err(|error| NewsError::new("image_cache_write", error.to_string()))
    }

    async fn download(
        &self,
        candidate: &str,
        accepts_host: Option<fn(&str) -> bool>,
    ) -> Result<Vec<u8>, NewsError> {
        let mut url = validate_url(candidate).await?;
        validate_host_scope(&url, accepts_host)?;
        for redirect_index in 0..=MAX_REDIRECTS {
            let response = self
                .client
                .get(url.clone())
                .send()
                .await
                .map_err(|error| NewsError::new("image_network", error.to_string()))?;
            if response.status().is_redirection() {
                if redirect_index == MAX_REDIRECTS {
                    return Err(NewsError::new("image_redirect", "Too many image redirects"));
                }
                let location = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|value| value.to_str().ok())
                    .ok_or_else(|| {
                        NewsError::new("image_redirect", "Image redirect has no location")
                    })?;
                let next = url
                    .join(location)
                    .map_err(|error| NewsError::new("image_redirect", error.to_string()))?;
                url = validate_url(next.as_str()).await?;
                validate_host_scope(&url, accepts_host)?;
                continue;
            }
            if response.status() != StatusCode::OK {
                return Err(NewsError::new(
                    "image_status",
                    format!("Image server returned HTTP {}", response.status()),
                ));
            }
            let content_type = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default()
                .split(';')
                .next()
                .unwrap_or_default();
            if !matches!(content_type, "image/jpeg" | "image/png" | "image/webp") {
                return Err(NewsError::new(
                    "image_mime",
                    "Unsupported image content type",
                ));
            }
            if response
                .content_length()
                .is_some_and(|length| length > MAX_IMAGE_BYTES as u64)
            {
                return Err(NewsError::new(
                    "image_too_large",
                    "Image exceeded the safety limit",
                ));
            }
            return read_limited(response, MAX_IMAGE_BYTES).await;
        }
        Err(NewsError::new(
            "image_redirect",
            "Unable to resolve image URL",
        ))
    }
}

fn validate_host_scope(url: &Url, accepts_host: Option<fn(&str) -> bool>) -> Result<(), NewsError> {
    let Some(accepts_host) = accepts_host else {
        return Ok(());
    };
    let host = url
        .host_str()
        .ok_or_else(|| NewsError::new("image_url", "Image URL has no host"))?;
    if accepts_host(host) {
        Ok(())
    } else {
        Err(NewsError::new(
            "image_url",
            "Image redirect left its provider scope",
        ))
    }
}

async fn read_limited(
    mut response: reqwest::Response,
    maximum: usize,
) -> Result<Vec<u8>, NewsError> {
    let mut body = Vec::with_capacity(
        response
            .content_length()
            .and_then(|length| usize::try_from(length).ok())
            .unwrap_or_default()
            .min(maximum),
    );
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| NewsError::new("image_network", error.to_string()))?
    {
        if body.len().saturating_add(chunk.len()) > maximum {
            return Err(NewsError::new(
                "image_too_large",
                "Image exceeded the safety limit",
            ));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

pub fn cache_key(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    format!("{}.webp", hex::encode(hasher.finalize()))
}

pub async fn prune_image_cache(path: &Path) -> Result<(), NewsError> {
    let mut entries = tokio::fs::read_dir(path)
        .await
        .map_err(|error| NewsError::new("image_cache_read", error.to_string()))?;
    let now = SystemTime::now();
    let mut files = Vec::new();
    let mut total = 0_u64;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|error| NewsError::new("image_cache_read", error.to_string()))?
    {
        let metadata = match entry.metadata().await {
            Ok(metadata) if metadata.is_file() => metadata,
            _ => continue,
        };
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let age = now.duration_since(modified).unwrap_or_default().as_secs();
        if age > MAX_CACHE_AGE_SECS {
            let _ = tokio::fs::remove_file(entry.path()).await;
            continue;
        }
        total = total.saturating_add(metadata.len());
        files.push((modified, metadata.len(), entry.path()));
    }
    if total > MAX_CACHE_BYTES {
        files.sort_by_key(|(modified, _, _)| *modified);
        for (_, size, file) in files {
            if total <= MAX_CACHE_BYTES {
                break;
            }
            if tokio::fs::remove_file(file).await.is_ok() {
                total = total.saturating_sub(size);
            }
        }
    }
    Ok(())
}

async fn validate_url(candidate: &str) -> Result<Url, NewsError> {
    let url =
        Url::parse(candidate).map_err(|error| NewsError::new("image_url", error.to_string()))?;
    if url.scheme() != "https" || url.port_or_known_default() != Some(443) {
        return Err(NewsError::new(
            "image_url",
            "Only HTTPS image URLs are allowed",
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| NewsError::new("image_url", "Image URL has no host"))?;
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".local") {
        return Err(NewsError::new(
            "image_url",
            "Local image hosts are not allowed",
        ));
    }
    let addresses = tokio::net::lookup_host((host, 443))
        .await
        .map_err(|error| NewsError::new("image_dns", error.to_string()))?;
    let mut resolved = false;
    for address in addresses {
        resolved = true;
        if !is_public_ip(address.ip()) {
            return Err(NewsError::new(
                "image_url",
                "Private image hosts are not allowed",
            ));
        }
    }
    if !resolved {
        return Err(NewsError::new("image_dns", "Image host did not resolve"));
    }
    Ok(url)
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let octets = ip.octets();
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_multicast()
                && !ip.is_unspecified()
                && octets[0] != 0
                && octets[0] != 100
                && octets[0] != 127
                && !(octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
                && !(octets[0] == 198 && matches!(octets[1], 18 | 19))
                && !(octets[0] >= 224)
        }
        IpAddr::V6(ip) => {
            !ip.is_loopback()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && (ip.segments()[0] & 0xfe00) != 0xfc00
                && (ip.segments()[0] & 0xffc0) != 0xfe80
        }
    }
}

fn encode_thumbnail(bytes: &[u8]) -> Result<Vec<u8>, NewsError> {
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| NewsError::new("image_decode", error.to_string()))?;
    let mut limits = Limits::default();
    limits.max_image_height = Some(12_000);
    limits.max_image_width = Some(12_000);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|error| NewsError::new("image_decode", error.to_string()))?;
    let thumbnail = image.thumbnail(720, 720);
    let mut output = Cursor::new(Vec::new());
    thumbnail
        .write_to(&mut output, ImageFormat::WebP)
        .map_err(|error| NewsError::new("image_encode", error.to_string()))?;
    Ok(output.into_inner())
}

#[cfg(test)]
mod tests {
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    use super::is_public_ip;

    #[test]
    fn blocks_private_and_loopback_addresses() {
        assert!(!is_public_ip(IpAddr::V4(Ipv4Addr::LOCALHOST)));
        assert!(!is_public_ip(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1))));
        assert!(!is_public_ip(IpAddr::V6(Ipv6Addr::LOCALHOST)));
        assert!(is_public_ip(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))));
    }
}
