use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NewsContentType {
    Article,
    Blog,
    Report,
}

impl NewsContentType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Article => "article",
            Self::Blog => "blog",
            Self::Report => "report",
        }
    }
}

impl TryFrom<&str> for NewsContentType {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "article" => Ok(Self::Article),
            "blog" => Ok(Self::Blog),
            "report" => Ok(Self::Report),
            _ => Err(format!("Unsupported news content type: {value}")),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NewsLocale {
    Az,
    Tr,
    En,
    Ru,
    Es,
}

impl NewsLocale {
    pub const TRANSLATED: [Self; 4] = [Self::Az, Self::Tr, Self::Ru, Self::Es];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Az => "az",
            Self::Tr => "tr",
            Self::En => "en",
            Self::Ru => "ru",
            Self::Es => "es",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TranslationState {
    Original,
    Cached,
    Pending,
    Failed,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NewsRelationType {
    Launch,
    Event,
}

impl NewsRelationType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Launch => "launch",
            Self::Event => "event",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsRelation {
    pub external_id: String,
    pub provider: String,
    pub relation_type: NewsRelationType,
}

#[derive(Clone, Debug)]
pub struct NewsItemRecord {
    pub article_url: String,
    pub authors: Vec<String>,
    pub content_hash: String,
    pub content_type: NewsContentType,
    pub featured: bool,
    pub fetched_at_unix_ms: u64,
    pub id: String,
    pub image_url_original: Option<String>,
    pub provider_id: u64,
    pub published_at_unix_ms: u64,
    pub relations: Vec<NewsRelation>,
    pub source: String,
    pub source_updated_at_unix_ms: u64,
    pub summary_original: String,
    pub title_original: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsFeedRequest {
    pub content_types: Option<Vec<NewsContentType>>,
    pub featured: Option<bool>,
    pub limit: Option<usize>,
    pub locale: NewsLocale,
    pub offset: Option<usize>,
    pub search: Option<String>,
    pub sources: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizedNewsItem {
    pub article_url: String,
    pub authors: Vec<String>,
    pub content_type: NewsContentType,
    pub featured: bool,
    pub id: String,
    pub image_cache_path: Option<String>,
    pub image_url_available: bool,
    pub published_at_unix_ms: u64,
    pub relations: Vec<NewsRelation>,
    pub source: String,
    pub source_updated_at_unix_ms: u64,
    pub summary: String,
    pub summary_original: String,
    pub title: String,
    pub title_original: String,
    pub translation_state: TranslationState,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsFeedPayload {
    pub available_sources: Vec<String>,
    pub fetched_at_unix_ms: Option<u64>,
    pub items: Vec<LocalizedNewsItem>,
    pub limit: usize,
    pub offset: usize,
    pub source: String,
    pub stale: bool,
    pub total_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsSourceCatalog {
    pub sources: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsOperationsSnapshot {
    pub database_bytes: u64,
    pub failed_translations: usize,
    pub image_cache_bytes: u64,
    pub item_count: usize,
    pub last_success_at_unix_ms: Option<u64>,
    pub pending_translations: usize,
    pub translated_items: usize,
    pub translation_gateway_configured: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsError {
    pub code: &'static str,
    pub message: String,
    pub category: &'static str,
    pub retryable: bool,
    pub correlation_id: String,
}

impl NewsError {
    pub fn new(code: &'static str, _detail: impl Into<String>) -> Self {
        Self {
            code,
            message: "Space News operation failed".to_owned(),
            category: match code {
                "network" | "timeout" | "provider_unavailable" => "network",
                "rate_limited" | "backoff" => "rateLimit",
                "invalid_json" | "invalid_request" | "invalid_image" => "validation",
                _ => "storage",
            },
            retryable: matches!(
                code,
                "network" | "timeout" | "provider_unavailable" | "rate_limited" | "backoff"
            ),
            correlation_id: uuid::Uuid::new_v4().to_string(),
        }
    }
}
