use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderErrorCategory {
    Authentication,
    Network,
    RateLimit,
    Upstream,
    Validation,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderError {
    pub category: ProviderErrorCategory,
    pub code: String,
    pub correlation_id: String,
    pub retry_after_unix_ms: Option<u64>,
    pub retryable: bool,
}

impl ProviderError {
    pub fn new(code: impl Into<String>, category: ProviderErrorCategory, retryable: bool) -> Self {
        Self {
            category,
            code: code.into(),
            correlation_id: uuid::Uuid::new_v4().to_string(),
            retry_after_unix_ms: None,
            retryable,
        }
    }

    pub fn with_retry_after(mut self, retry_after_unix_ms: Option<u64>) -> Self {
        self.retry_after_unix_ms = retry_after_unix_ms;
        self
    }
}
