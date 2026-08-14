use async_trait::async_trait;
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{config::Config, error::GatewayError};

use super::{TranslatedItem, TranslationBatch, TranslationBatchResult, TranslationProvider};

pub struct LibreTranslateProvider {
    api_key: Option<String>,
    base_url: Url,
    client: Client,
}

impl LibreTranslateProvider {
    pub fn new(config: &Config) -> Result<Self, String> {
        let client = Client::builder()
            .connect_timeout(std::time::Duration::from_secs(5))
            .timeout(std::time::Duration::from_secs(30))
            .user_agent("OrbitalVision-TranslationGateway/0.1")
            .build()
            .map_err(|error| error.to_string())?;
        Ok(Self {
            api_key: config.api_key.clone(),
            base_url: config.libre_translate_url.clone(),
            client,
        })
    }

    fn endpoint(&self, path: &str) -> Result<Url, GatewayError> {
        self.base_url
            .join(path)
            .map_err(|error| GatewayError::upstream("provider_url", error.to_string(), None))
    }
}

#[derive(Deserialize)]
struct LanguageResponse {
    code: String,
}

#[derive(Serialize)]
struct LibreRequest<'a> {
    q: Vec<&'a str>,
    source: &'a str,
    target: &'a str,
    format: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_key: Option<&'a str>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibreResponse {
    translated_text: TranslatedText,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum TranslatedText {
    One(String),
    Many(Vec<String>),
}

#[async_trait]
impl TranslationProvider for LibreTranslateProvider {
    fn name(&self) -> &'static str {
        "libretranslate"
    }

    async fn supported_languages(&self) -> Result<Vec<String>, GatewayError> {
        let response = self
            .client
            .get(self.endpoint("languages")?)
            .send()
            .await
            .map_err(|error| {
                GatewayError::upstream("provider_unreachable", error.to_string(), Some(60_000))
            })?;
        if !response.status().is_success() {
            return Err(GatewayError::upstream(
                "provider_languages",
                format!("Provider returned {}", response.status()),
                Some(60_000),
            ));
        }
        response
            .json::<Vec<LanguageResponse>>()
            .await
            .map(|items| items.into_iter().map(|item| item.code).collect())
            .map_err(|error| GatewayError::upstream("provider_schema", error.to_string(), None))
    }

    async fn translate_batch(
        &self,
        request: TranslationBatch,
    ) -> Result<TranslationBatchResult, GatewayError> {
        let mut texts = Vec::with_capacity(request.items.len() * 2);
        for item in &request.items {
            texts.push(item.title.as_str());
            texts.push(item.summary.as_str());
        }
        let response = self
            .client
            .post(self.endpoint("translate")?)
            .json(&LibreRequest {
                q: texts,
                source: &request.source,
                target: &request.target,
                format: "text",
                api_key: self.api_key.as_deref(),
            })
            .send()
            .await
            .map_err(|error| {
                GatewayError::upstream("provider_unreachable", error.to_string(), Some(60_000))
            })?;
        let status = response.status();
        if !status.is_success() {
            let retry = if status == StatusCode::TOO_MANY_REQUESTS
                || status == StatusCode::SERVICE_UNAVAILABLE
            {
                Some(300_000)
            } else {
                None
            };
            return Err(GatewayError::upstream(
                "provider_rejected",
                format!("Provider returned {status}"),
                retry,
            ));
        }
        let translated = response
            .json::<LibreResponse>()
            .await
            .map_err(|error| GatewayError::upstream("provider_schema", error.to_string(), None))?
            .translated_text;
        let texts = match translated {
            TranslatedText::One(value) => vec![value],
            TranslatedText::Many(values) => values,
        };
        let results = correlate(request.items, texts)?;
        Ok(TranslationBatchResult {
            provider: self.name().to_owned(),
            results,
        })
    }
}

fn correlate(
    items: Vec<super::TranslationItem>,
    texts: Vec<String>,
) -> Result<Vec<TranslatedItem>, GatewayError> {
    if texts.len() != items.len() * 2 {
        return Err(GatewayError::upstream(
            "provider_incomplete",
            "Provider returned an incomplete batch",
            Some(60_000),
        ));
    }
    Ok(items
        .into_iter()
        .zip(texts.chunks_exact(2))
        .map(|(item, pair)| TranslatedItem {
            id: item.id,
            translated_title: pair[0].clone(),
            translated_summary: pair[1].clone(),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::correlate;
    use crate::providers::TranslationItem;

    #[test]
    fn preserves_item_order_and_title_summary_pairs() {
        let results = correlate(
            vec![
                TranslationItem {
                    id: "one".into(),
                    title: "A".into(),
                    summary: "B".into(),
                },
                TranslationItem {
                    id: "two".into(),
                    title: "C".into(),
                    summary: "D".into(),
                },
            ],
            ["TA", "TB", "TC", "TD"]
                .into_iter()
                .map(str::to_owned)
                .collect(),
        )
        .unwrap();
        assert_eq!(results[0].id, "one");
        assert_eq!(results[0].translated_summary, "TB");
        assert_eq!(results[1].translated_title, "TC");
    }

    #[test]
    fn rejects_incomplete_provider_batches() {
        let result = correlate(
            vec![TranslationItem {
                id: "one".into(),
                title: "A".into(),
                summary: "B".into(),
            }],
            vec!["only-title".into()],
        );
        assert!(result.is_err());
    }
}
