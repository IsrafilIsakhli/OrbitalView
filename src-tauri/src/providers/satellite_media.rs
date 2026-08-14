use std::{
    collections::{BTreeMap, HashSet},
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, SystemTime},
};

use reqwest::{Client, StatusCode, Url, header::RETRY_AFTER, redirect::Policy};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, Semaphore};

use super::{http_client::read_bounded_bytes, news_image::NewsImageProvider};
use crate::{
    commands::cache::write_atomic,
    domain::{
        news::NewsError,
        satellite_media::{SatelliteMediaState, SatelliteMediaUpdated, SatelliteObjectMedia},
    },
};

const WIKIDATA_ENDPOINT: &str = "https://query.wikidata.org/sparql";
const COMMONS_ENDPOINT: &str = "https://commons.wikimedia.org/w/api.php";
const MAX_METADATA_BYTES: usize = 2 * 1024 * 1024;
const POSITIVE_TTL_MS: u64 = 30 * 24 * 60 * 60 * 1_000;
const NEGATIVE_TTL_MS: u64 = 7 * 24 * 60 * 60 * 1_000;
const FAILURE_TTL_MS: u64 = 15 * 60 * 1_000;

#[derive(Clone)]
pub struct SatelliteMediaProvider {
    inner: Arc<SatelliteMediaProviderInner>,
}

struct SatelliteMediaProviderInner {
    client: Client,
    contact: Option<String>,
    image: NewsImageProvider,
    in_flight: Mutex<HashSet<String>>,
    queue: Arc<Semaphore>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SatelliteMediaCacheRecord {
    expires_at_unix_ms: u64,
    media: SatelliteObjectMedia,
}

#[derive(Clone, Debug)]
struct ImageStatement {
    entity: String,
    image_url: String,
    preferred: bool,
}

#[derive(Debug)]
struct CommonsImageInfo {
    creator: Option<String>,
    license_name: Option<String>,
    license_url: Option<String>,
    page_url: String,
    thumbnail_url: String,
}

impl SatelliteMediaProvider {
    pub fn new() -> Result<Self, String> {
        let contact = option_env!("WIKIMEDIA_CONTACT")
            .map(str::trim)
            .filter(|value| !value.is_empty() && value.len() <= 240)
            .map(ToOwned::to_owned);
        let user_agent = contact.as_ref().map(|contact| {
            format!(
                "OrbitalVision/{} satellite-media ({contact})",
                env!("CARGO_PKG_VERSION")
            )
        });
        let client = Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(20))
            .user_agent(user_agent.unwrap_or_else(|| {
                format!(
                    "OrbitalVision/{} satellite-media-disabled",
                    env!("CARGO_PKG_VERSION")
                )
            }))
            .build()
            .map_err(|_| "Unable to initialize the satellite media client".to_owned())?;
        Ok(Self {
            inner: Arc::new(SatelliteMediaProviderInner {
                client,
                contact,
                image: NewsImageProvider::new()?,
                in_flight: Mutex::new(HashSet::new()),
                queue: Arc::new(Semaphore::new(1)),
            }),
        })
    }

    pub async fn request(
        &self,
        app: AppHandle,
        cache_root: PathBuf,
        norad_id: &str,
    ) -> Result<SatelliteObjectMedia, NewsError> {
        let norad_id = normalize_norad_id(norad_id)?;
        let directory = cache_root.join("satellite-object-media-v1");
        tokio::fs::create_dir_all(directory.join("images"))
            .await
            .map_err(|_| {
                NewsError::new("image_cache_write", "satellite media cache unavailable")
            })?;
        let cache_path = directory.join(format!("{norad_id}.json"));
        let cached = read_cache(&cache_path).await;
        let now = unix_time_ms();

        if let Some(record) = cached.as_ref() {
            let image_exists = match record.media.cached_path.as_deref() {
                Some(path) => tokio::fs::metadata(path).await.is_ok(),
                None => true,
            };
            if record.expires_at_unix_ms > now && image_exists {
                return Ok(record.media.clone());
            }
        }

        if self.inner.contact.is_none() {
            return Ok(cached
                .filter(|record| record.media.state == SatelliteMediaState::Available)
                .map(|record| record.media)
                .unwrap_or_else(|| SatelliteObjectMedia::disabled(norad_id)));
        }

        self.enqueue(app, directory, norad_id.clone()).await;
        Ok(cached
            .filter(|record| record.media.state == SatelliteMediaState::Available)
            .map(|record| record.media)
            .unwrap_or_else(|| SatelliteObjectMedia::pending(norad_id)))
    }

    async fn enqueue(&self, app: AppHandle, directory: PathBuf, norad_id: String) {
        let mut in_flight = self.inner.in_flight.lock().await;
        if !in_flight.insert(norad_id.clone()) {
            return;
        }
        drop(in_flight);

        let provider = self.clone();
        tokio::spawn(async move {
            let permit = provider.inner.queue.clone().acquire_owned().await;
            if permit.is_ok() {
                let now = unix_time_ms();
                let resolved = provider.resolve(&directory, &norad_id).await;
                let record = match resolved {
                    Ok(Some(media)) => SatelliteMediaCacheRecord {
                        expires_at_unix_ms: now.saturating_add(POSITIVE_TTL_MS),
                        media,
                    },
                    Ok(None) => SatelliteMediaCacheRecord {
                        expires_at_unix_ms: now.saturating_add(NEGATIVE_TTL_MS),
                        media: SatelliteObjectMedia::unavailable(norad_id.clone(), now),
                    },
                    Err(_) => SatelliteMediaCacheRecord {
                        expires_at_unix_ms: now.saturating_add(FAILURE_TTL_MS),
                        media: SatelliteObjectMedia::unavailable(norad_id.clone(), now),
                    },
                };
                if let Ok(bytes) = serde_json::to_vec(&record) {
                    let _ = write_atomic(&directory.join(format!("{norad_id}.json")), &bytes).await;
                }
            }
            provider.inner.in_flight.lock().await.remove(&norad_id);
            let _ = app.emit(
                "satellite-object-media-updated",
                SatelliteMediaUpdated { norad_id },
            );
        });
    }

    async fn resolve(
        &self,
        directory: &Path,
        norad_id: &str,
    ) -> Result<Option<SatelliteObjectMedia>, NewsError> {
        let statements = self.wikidata_statements(norad_id).await?;
        let Some(statement) = select_exact_entity(statements) else {
            return Ok(None);
        };
        let file_name = commons_file_name(&statement.image_url)
            .ok_or_else(|| NewsError::new("invalid_image", "Wikidata image title unavailable"))?;
        let info = self.commons_image_info(&file_name).await?;
        let image_path = directory.join("images").join(format!("{norad_id}.webp"));
        self.inner
            .image
            .cache_image_scoped(&info.thumbnail_url, &image_path, accepts_commons_image_host)
            .await?;
        Ok(Some(SatelliteObjectMedia {
            norad_id: norad_id.to_owned(),
            state: SatelliteMediaState::Available,
            cached_path: Some(image_path.to_string_lossy().into_owned()),
            commons_page_url: Some(info.page_url),
            creator: info.creator,
            license_name: info.license_name,
            license_url: info.license_url,
            fetched_at_unix_ms: Some(unix_time_ms()),
        }))
    }

    async fn wikidata_statements(&self, norad_id: &str) -> Result<Vec<ImageStatement>, NewsError> {
        let query = format!(
            "SELECT ?item ?image ?rank WHERE {{ ?item wdt:P377 \"{norad_id}\"; p:P18 ?statement. ?statement ps:P18 ?image; wikibase:rank ?rank. FILTER(?rank != wikibase:DeprecatedRank) }}"
        );
        let mut url = Url::parse(WIKIDATA_ENDPOINT)
            .map_err(|_| NewsError::new("invalid_request", "Wikidata endpoint unavailable"))?;
        url.query_pairs_mut()
            .append_pair("format", "json")
            .append_pair("query", &query);
        let payload = self.request_json(url).await?;
        let bindings = payload
            .pointer("/results/bindings")
            .and_then(Value::as_array)
            .ok_or_else(|| NewsError::new("invalid_json", "Wikidata bindings unavailable"))?;
        Ok(bindings
            .iter()
            .filter_map(|binding| {
                let entity = binding.pointer("/item/value")?.as_str()?.to_owned();
                let image_url = binding.pointer("/image/value")?.as_str()?.to_owned();
                let rank = binding.pointer("/rank/value")?.as_str()?;
                Some(ImageStatement {
                    entity,
                    image_url,
                    preferred: rank.ends_with("PreferredRank"),
                })
            })
            .collect())
    }

    async fn commons_image_info(&self, file_name: &str) -> Result<CommonsImageInfo, NewsError> {
        let mut url = Url::parse(COMMONS_ENDPOINT)
            .map_err(|_| NewsError::new("invalid_request", "Commons endpoint unavailable"))?;
        url.query_pairs_mut()
            .append_pair("action", "query")
            .append_pair("format", "json")
            .append_pair("formatversion", "2")
            .append_pair("prop", "imageinfo")
            .append_pair("iiprop", "url|mime|size|extmetadata")
            .append_pair("iiurlwidth", "960")
            .append_pair("titles", &format!("File:{file_name}"));
        parse_commons_image_info(&self.request_json(url).await?)
    }

    async fn request_json(&self, url: Url) -> Result<Value, NewsError> {
        for attempt in 0..=1 {
            let response = self
                .inner
                .client
                .get(url.clone())
                .header(
                    "Accept",
                    "application/sparql-results+json, application/json",
                )
                .send()
                .await
                .map_err(|error| {
                    NewsError::new(
                        if error.is_timeout() {
                            "timeout"
                        } else {
                            "network"
                        },
                        "satellite media request failed",
                    )
                })?;
            if response.status() == StatusCode::TOO_MANY_REQUESTS && attempt == 0 {
                let retry_seconds = response
                    .headers()
                    .get(RETRY_AFTER)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(5)
                    .min(120);
                tokio::time::sleep(Duration::from_secs(retry_seconds)).await;
                continue;
            }
            if !response.status().is_success() {
                return Err(NewsError::new(
                    if response.status() == StatusCode::TOO_MANY_REQUESTS {
                        "rate_limited"
                    } else {
                        "provider_unavailable"
                    },
                    "satellite media provider unavailable",
                ));
            }
            let bytes = read_bounded_bytes(response, MAX_METADATA_BYTES)
                .await
                .map_err(|_| NewsError::new("invalid_json", "metadata response rejected"))?;
            return serde_json::from_slice(&bytes)
                .map_err(|_| NewsError::new("invalid_json", "metadata response invalid"));
        }
        Err(NewsError::new(
            "rate_limited",
            "satellite media provider rate limited",
        ))
    }
}

pub fn normalize_norad_id(value: &str) -> Result<String, NewsError> {
    let value = value.trim();
    if value.is_empty() || value.len() > 6 || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(NewsError::new(
            "invalid_request",
            "invalid NORAD identifier",
        ));
    }
    if value.len() <= 5 {
        Ok(format!("{value:0>5}"))
    } else {
        Ok(value.to_owned())
    }
}

fn select_exact_entity(statements: Vec<ImageStatement>) -> Option<ImageStatement> {
    let mut by_entity = BTreeMap::<String, Vec<ImageStatement>>::new();
    for statement in statements {
        by_entity
            .entry(statement.entity.clone())
            .or_default()
            .push(statement);
    }
    if by_entity.len() != 1 {
        return None;
    }
    let mut candidates = by_entity.into_values().next()?;
    candidates.sort_by(|left, right| {
        right
            .preferred
            .cmp(&left.preferred)
            .then_with(|| left.image_url.cmp(&right.image_url))
    });
    candidates.into_iter().next()
}

fn commons_file_name(image_url: &str) -> Option<String> {
    let parsed = Url::parse(image_url).ok()?;
    let segment = parsed.path_segments()?.next_back()?;
    let decoded = percent_decode(segment)?;
    (!decoded.is_empty()).then_some(decoded)
}

fn parse_commons_image_info(payload: &Value) -> Result<CommonsImageInfo, NewsError> {
    let info = payload
        .pointer("/query/pages/0/imageinfo/0")
        .ok_or_else(|| NewsError::new("invalid_image", "Commons image metadata unavailable"))?;
    let thumbnail_url = info
        .get("thumburl")
        .and_then(Value::as_str)
        .filter(|value| is_exact_https_host(value, "upload.wikimedia.org"))
        .ok_or_else(|| NewsError::new("invalid_image", "Commons thumbnail rejected"))?;
    let mime = info.get("mime").and_then(Value::as_str).unwrap_or_default();
    if !matches!(mime, "image/jpeg" | "image/png" | "image/webp") {
        return Err(NewsError::new(
            "invalid_image",
            "Commons image MIME rejected",
        ));
    }
    let page_url = info
        .get("descriptionurl")
        .and_then(Value::as_str)
        .filter(|value| is_exact_https_host(value, "commons.wikimedia.org"))
        .ok_or_else(|| NewsError::new("invalid_image", "Commons page URL rejected"))?;
    let metadata = info.get("extmetadata").unwrap_or(&Value::Null);
    let creator = metadata_value(metadata, "Artist")
        .map(plain_text)
        .filter(|value| !value.is_empty());
    let license_name = metadata_value(metadata, "LicenseShortName")
        .map(plain_text)
        .filter(|value| !value.is_empty());
    let license_url = metadata_value(metadata, "LicenseUrl")
        .filter(|value| is_safe_https_url(value))
        .map(ToOwned::to_owned);
    Ok(CommonsImageInfo {
        creator,
        license_name,
        license_url,
        page_url: page_url.to_owned(),
        thumbnail_url: thumbnail_url.to_owned(),
    })
}

fn metadata_value<'a>(metadata: &'a Value, key: &str) -> Option<&'a str> {
    metadata.get(key)?.get("value")?.as_str()
}

fn plain_text(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut inside_tag = false;
    for character in value.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => output.push(character),
            _ => {}
        }
    }
    output
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .trim()
        .to_owned()
}

fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = hex_value(*bytes.get(index + 1)?)?;
            let low = hex_value(*bytes.get(index + 2)?)?;
            output.push((high << 4) | low);
            index += 3;
        } else {
            output.push(if bytes[index] == b'+' {
                b' '
            } else {
                bytes[index]
            });
            index += 1;
        }
    }
    String::from_utf8(output).ok()
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn accepts_commons_image_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("upload.wikimedia.org")
}

fn is_exact_https_host(value: &str, expected_host: &str) -> bool {
    Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.port_or_known_default() == Some(443)
            && url
                .host_str()
                .is_some_and(|host| host.eq_ignore_ascii_case(expected_host))
            && url.username().is_empty()
            && url.password().is_none()
    })
}

fn is_safe_https_url(value: &str) -> bool {
    Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.port_or_known_default() == Some(443)
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
    })
}

async fn read_cache(path: &Path) -> Option<SatelliteMediaCacheRecord> {
    let bytes = tokio::fs::read(path).await.ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        ImageStatement, commons_file_name, normalize_norad_id, parse_commons_image_info,
        select_exact_entity,
    };

    #[test]
    fn normalizes_only_five_and_six_digit_norad_identifiers() {
        assert_eq!(normalize_norad_id("5").unwrap(), "00005");
        assert_eq!(normalize_norad_id("25544").unwrap(), "25544");
        assert_eq!(normalize_norad_id("123456").unwrap(), "123456");
        assert!(normalize_norad_id("12A45").is_err());
        assert!(normalize_norad_id("1234567").is_err());
    }

    #[test]
    fn rejects_ambiguous_entities_and_prefers_preferred_rank() {
        let statement = |entity: &str, image: &str, preferred: bool| ImageStatement {
            entity: entity.to_owned(),
            image_url: image.to_owned(),
            preferred,
        };
        let selected = select_exact_entity(vec![
            statement(
                "Q1",
                "https://commons.wikimedia.org/wiki/Special:FilePath/Normal.jpg",
                false,
            ),
            statement(
                "Q1",
                "https://commons.wikimedia.org/wiki/Special:FilePath/Preferred.jpg",
                true,
            ),
        ])
        .unwrap();
        assert!(selected.image_url.ends_with("Preferred.jpg"));
        assert!(
            select_exact_entity(vec![
                statement("Q1", "https://example.com/a.jpg", true),
                statement("Q2", "https://example.com/b.jpg", true),
            ])
            .is_none()
        );
    }

    #[test]
    fn parses_scoped_commons_metadata_and_plain_text_attribution() {
        let payload = json!({
            "query": { "pages": [{ "imageinfo": [{
                "descriptionurl": "https://commons.wikimedia.org/wiki/File:ISS.jpg",
                "extmetadata": {
                    "Artist": { "value": "<b>NASA</b>" },
                    "LicenseShortName": { "value": "CC BY-SA 4.0" },
                    "LicenseUrl": { "value": "https://creativecommons.org/licenses/by-sa/4.0/" }
                },
                "mime": "image/jpeg",
                "thumburl": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/ISS.jpg/960px-ISS.jpg"
            }] }] }
        });
        let info = parse_commons_image_info(&payload).unwrap();
        assert_eq!(info.creator.as_deref(), Some("NASA"));
        assert_eq!(info.license_name.as_deref(), Some("CC BY-SA 4.0"));
        assert!(
            commons_file_name(
                "https://commons.wikimedia.org/wiki/Special:FilePath/ISS%20photo.jpg"
            )
            .is_some_and(|value| value == "ISS photo.jpg")
        );
    }
}
