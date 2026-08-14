use serde::{Deserialize, Serialize};

use super::news::NewsLocale;

#[derive(Clone, Debug)]
pub struct TranslationJob {
    pub attempt_count: u32,
    pub language: NewsLocale,
    pub news_id: String,
    pub source_hash: String,
    pub summary: String,
    pub title: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationGatewayItem {
    pub id: String,
    pub summary: String,
    pub title: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationGatewayRequest {
    pub items: Vec<TranslationGatewayItem>,
    pub source: &'static str,
    pub target: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationGatewayResult {
    pub id: String,
    pub translated_summary: String,
    pub translated_title: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationGatewayResponse {
    pub provider: String,
    pub results: Vec<TranslationGatewayResult>,
}
