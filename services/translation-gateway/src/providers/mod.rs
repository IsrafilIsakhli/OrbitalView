mod libre_translate;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::GatewayError;

pub use libre_translate::LibreTranslateProvider;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationBatch {
    pub items: Vec<TranslationItem>,
    pub source: String,
    pub target: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationItem {
    pub id: String,
    pub summary: String,
    pub title: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationBatchResult {
    pub provider: String,
    pub results: Vec<TranslatedItem>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslatedItem {
    pub id: String,
    pub translated_summary: String,
    pub translated_title: String,
}

#[async_trait]
pub trait TranslationProvider: Send + Sync {
    fn name(&self) -> &'static str;
    async fn supported_languages(&self) -> Result<Vec<String>, GatewayError>;
    async fn translate_batch(
        &self,
        request: TranslationBatch,
    ) -> Result<TranslationBatchResult, GatewayError>;
}
