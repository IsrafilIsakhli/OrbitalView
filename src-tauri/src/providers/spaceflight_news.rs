use std::time::Duration;

use chrono::{SecondsFormat, TimeZone, Utc};
use reqwest::{Client, StatusCode, Url};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::domain::news::{NewsContentType, NewsItemRecord, NewsRelation, NewsRelationType};

const API_ROOT: &str = "https://api.spaceflightnewsapi.net/v4";
const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone)]
pub struct SpaceflightNewsProvider {
    client: Client,
}

impl SpaceflightNewsProvider {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent(concat!("OrbitalVision/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|error| format!("Unable to initialize Spaceflight News client: {error}"))?;
        Ok(Self { client })
    }

    pub async fn fetch(
        &self,
        content_type: NewsContentType,
        watermark_unix_ms: Option<u64>,
        fetched_at_unix_ms: u64,
    ) -> Result<SpaceflightNewsBatch, SpaceflightNewsProviderError> {
        let endpoint = match content_type {
            NewsContentType::Article => "articles",
            NewsContentType::Blog => "blogs",
            NewsContentType::Report => "reports",
        };
        let url = format!("{API_ROOT}/{endpoint}/");
        let mut query = vec![("limit", "100".to_owned())];
        if let Some(watermark) = watermark_unix_ms {
            let overlap = watermark.saturating_sub(5 * 60 * 1_000);
            if let Some(date) = Utc.timestamp_millis_opt(overlap as i64).single() {
                query.push((
                    "updated_at_gte",
                    date.to_rfc3339_opts(SecondsFormat::Secs, true),
                ));
                query.push(("ordering", "-updated_at".to_owned()));
            }
        } else {
            query.push(("ordering", "-published_at".to_owned()));
        }
        let response = self
            .client
            .get(url)
            .query(&query)
            .send()
            .await
            .map_err(|error| SpaceflightNewsProviderError::network(error.to_string()))?;
        let status = response.status();
        let retry_after_ms = retry_after_ms(response.headers());
        if !status.is_success() {
            return Err(SpaceflightNewsProviderError::status(status, retry_after_ms));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(SpaceflightNewsProviderError::new(
                "response_too_large",
                "Spaceflight News response exceeded the safety limit",
                None,
            ));
        }
        let bytes = read_limited(response, MAX_RESPONSE_BYTES).await?;
        let payload = serde_json::from_slice::<SfnPage>(&bytes).map_err(|error| {
            SpaceflightNewsProviderError::new("invalid_json", error.to_string(), None)
        })?;
        let mut items = Vec::new();
        let mut rejected_count = 0_usize;
        let mut latest_update = watermark_unix_ms.unwrap_or_default();
        for candidate in payload.results {
            match normalize(candidate, content_type, fetched_at_unix_ms) {
                Ok(item) => {
                    latest_update = latest_update.max(item.source_updated_at_unix_ms);
                    items.push(item);
                }
                Err(_) => rejected_count += 1,
            }
        }
        Ok(SpaceflightNewsBatch {
            items,
            latest_update_unix_ms: latest_update,
            provider_count: payload.count,
            rejected_count,
        })
    }
}

async fn read_limited(
    mut response: reqwest::Response,
    maximum: usize,
) -> Result<Vec<u8>, SpaceflightNewsProviderError> {
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
        .map_err(|error| SpaceflightNewsProviderError::network(error.to_string()))?
    {
        if body.len().saturating_add(chunk.len()) > maximum {
            return Err(SpaceflightNewsProviderError::new(
                "response_too_large",
                "Spaceflight News response exceeded the safety limit",
                None,
            ));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

pub struct SpaceflightNewsBatch {
    pub items: Vec<NewsItemRecord>,
    pub latest_update_unix_ms: u64,
    pub provider_count: usize,
    pub rejected_count: usize,
}

#[derive(Debug)]
pub struct SpaceflightNewsProviderError {
    pub code: &'static str,
    pub message: String,
    pub retry_after_ms: Option<u64>,
}

impl SpaceflightNewsProviderError {
    fn new(code: &'static str, message: impl Into<String>, retry_after_ms: Option<u64>) -> Self {
        Self {
            code,
            message: message.into(),
            retry_after_ms,
        }
    }

    fn network(message: String) -> Self {
        Self::new("network", message, None)
    }

    fn status(status: StatusCode, retry_after_ms: Option<u64>) -> Self {
        let code = if status == StatusCode::TOO_MANY_REQUESTS {
            "rate_limited"
        } else if status.is_server_error() {
            "upstream_unavailable"
        } else {
            "upstream_status"
        };
        Self::new(
            code,
            format!("Spaceflight News returned HTTP {status}"),
            retry_after_ms,
        )
    }
}

#[derive(Deserialize)]
struct SfnPage {
    #[serde(default)]
    count: usize,
    #[serde(default)]
    results: Vec<SfnItem>,
}

#[derive(Deserialize)]
struct SfnItem {
    #[serde(default)]
    authors: Vec<SfnAuthor>,
    #[serde(default)]
    events: Vec<Value>,
    #[serde(default)]
    featured: bool,
    id: u64,
    image_url: Option<String>,
    #[serde(default)]
    launches: Vec<Value>,
    news_site: String,
    published_at: String,
    #[serde(default)]
    summary: String,
    title: String,
    updated_at: String,
    url: String,
}

#[derive(Deserialize)]
struct SfnAuthor {
    name: String,
}

fn normalize(
    item: SfnItem,
    content_type: NewsContentType,
    fetched_at_unix_ms: u64,
) -> Result<NewsItemRecord, &'static str> {
    let title = clean_text(&item.title).ok_or("missing_title")?;
    let source = clean_text(&item.news_site).ok_or("missing_source")?;
    let article_url = safe_https_url(&item.url).ok_or("invalid_article_url")?;
    let published_at_unix_ms = parse_time(&item.published_at).ok_or("invalid_published_at")?;
    let source_updated_at_unix_ms = parse_time(&item.updated_at).ok_or("invalid_updated_at")?;
    let summary = item.summary.trim().to_owned();
    let image_url_original = item.image_url.as_deref().and_then(safe_https_url);
    let relations = relations(&item.launches, &item.events);
    let content_hash = content_hash(&title, &summary, source_updated_at_unix_ms);
    Ok(NewsItemRecord {
        article_url,
        authors: item
            .authors
            .into_iter()
            .filter_map(|author| clean_text(&author.name))
            .collect(),
        content_hash,
        content_type,
        featured: item.featured,
        fetched_at_unix_ms,
        id: format!("sfn:{}:{}", content_type.as_str(), item.id),
        image_url_original,
        provider_id: item.id,
        published_at_unix_ms,
        relations,
        source,
        source_updated_at_unix_ms,
        summary_original: summary,
        title_original: title,
    })
}

fn relations(launches: &[Value], events: &[Value]) -> Vec<NewsRelation> {
    launches
        .iter()
        .filter_map(|value| relation(value, NewsRelationType::Launch, &["launch_id", "id"]))
        .chain(
            events
                .iter()
                .filter_map(|value| relation(value, NewsRelationType::Event, &["event_id", "id"])),
        )
        .collect()
}

fn relation(value: &Value, relation_type: NewsRelationType, keys: &[&str]) -> Option<NewsRelation> {
    let external_id = keys.iter().find_map(|key| {
        value.get(*key).and_then(|candidate| {
            candidate
                .as_str()
                .map(str::to_owned)
                .or_else(|| candidate.as_u64().map(|id| id.to_string()))
        })
    })?;
    if external_id.trim().is_empty() || external_id.len() > 80 {
        return None;
    }
    let provider = value
        .get("provider")
        .and_then(Value::as_str)
        .unwrap_or("Launch Library 2")
        .trim()
        .to_owned();
    Some(NewsRelation {
        external_id,
        provider,
        relation_type,
    })
}

fn clean_text(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

fn safe_https_url(value: &str) -> Option<String> {
    let url = Url::parse(value).ok()?;
    (url.scheme() == "https" && url.host_str().is_some()).then(|| url.to_string())
}

fn parse_time(value: &str) -> Option<u64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .and_then(|date| u64::try_from(date.timestamp_millis()).ok())
}

fn content_hash(title: &str, summary: &str, updated_at: u64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(title.as_bytes());
    hasher.update([0]);
    hasher.update(summary.as_bytes());
    hasher.update([0]);
    hasher.update(updated_at.to_le_bytes());
    hex::encode(hasher.finalize())
}

fn retry_after_ms(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    headers
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            value
                .parse::<u64>()
                .ok()
                .map(|seconds| seconds.saturating_mul(1_000))
                .or_else(|| {
                    chrono::DateTime::parse_from_rfc2822(value)
                        .ok()
                        .and_then(|date| {
                            u64::try_from(
                                date.timestamp_millis()
                                    .saturating_sub(Utc::now().timestamp_millis()),
                            )
                            .ok()
                        })
                })
        })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{SfnItem, content_hash, normalize, relation};
    use crate::domain::news::{NewsContentType, NewsRelationType};

    #[test]
    fn relation_uses_real_provider_identifier() {
        let relation = relation(
            &json!({"launch_id": "ffe1ba5c", "provider": "Launch Library 2"}),
            NewsRelationType::Launch,
            &["launch_id", "id"],
        )
        .unwrap();
        assert_eq!(relation.external_id, "ffe1ba5c");
    }

    #[test]
    fn source_hash_changes_with_original_content() {
        assert_ne!(content_hash("A", "B", 1), content_hash("A", "C", 1));
    }

    #[test]
    fn normalizes_every_feed_type_with_a_stable_composite_id() {
        for content_type in [
            NewsContentType::Article,
            NewsContentType::Blog,
            NewsContentType::Report,
        ] {
            let item = normalize(
                SfnItem {
                    authors: Vec::new(),
                    events: Vec::new(),
                    featured: true,
                    id: 42,
                    image_url: Some("https://example.com/image.jpg".to_owned()),
                    launches: vec![json!({"launch_id": "launch-42"})],
                    news_site: "Example Space".to_owned(),
                    published_at: "2026-08-09T00:00:00Z".to_owned(),
                    summary: "Verified summary".to_owned(),
                    title: "Verified title".to_owned(),
                    updated_at: "2026-08-09T01:00:00Z".to_owned(),
                    url: "https://example.com/story".to_owned(),
                },
                content_type,
                1,
            )
            .unwrap();
            assert_eq!(item.id, format!("sfn:{}:42", content_type.as_str()));
            assert_eq!(item.relations.len(), 1);
        }
    }

    #[tokio::test]
    #[ignore = "requires the live Spaceflight News API"]
    async fn live_provider_contract_accepts_all_three_feeds() {
        let provider = super::SpaceflightNewsProvider::new().unwrap();
        for content_type in [
            NewsContentType::Article,
            NewsContentType::Blog,
            NewsContentType::Report,
        ] {
            let batch = provider.fetch(content_type, None, 1).await.unwrap();
            assert!(batch.provider_count >= batch.items.len());
            assert!(batch.items.iter().all(|item| item.id.starts_with("sfn:")));
        }
    }
}
