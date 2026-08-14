use std::{collections::HashSet, path::PathBuf, time::Instant};

use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::{
    domain::{
        news::{
            LocalizedNewsItem, NewsContentType, NewsError, NewsFeedPayload, NewsFeedRequest,
            NewsLocale, NewsOperationsSnapshot, NewsRelationType,
        },
        translation::{TranslationGatewayItem, TranslationGatewayRequest},
    },
    providers::{
        news_image::{NewsImageProvider, cache_key, prune_image_cache},
        spaceflight_news::SpaceflightNewsProvider,
    },
    storage::{
        database::NewsDatabase, news_repository::NewsRepository,
        translation_repository::TranslationRepository,
    },
};

use super::translation_gateway_client::TranslationGatewayClient;

pub struct NewsService {
    initialization_error: Option<String>,
    runtime: Option<NewsServiceRuntime>,
}

struct NewsServiceRuntime {
    image_provider: NewsImageProvider,
    image_root: PathBuf,
    provider: SpaceflightNewsProvider,
    repository: NewsRepository,
    request_gate: Mutex<()>,
    translation_gateway: TranslationGatewayClient,
    translation_gate: Mutex<()>,
    translations: TranslationRepository,
}

impl NewsService {
    pub fn new(database_path: PathBuf, image_root: PathBuf) -> Self {
        match NewsServiceRuntime::initialize(database_path, image_root) {
            Ok(runtime) => Self {
                initialization_error: None,
                runtime: Some(runtime),
            },
            Err(error) => Self {
                initialization_error: Some(error),
                runtime: None,
            },
        }
    }

    fn runtime(&self) -> Result<&NewsServiceRuntime, NewsError> {
        self.runtime.as_ref().ok_or_else(|| {
            NewsError::new(
                "news_storage_unavailable",
                self.initialization_error
                    .as_deref()
                    .unwrap_or("Space News storage is unavailable"),
            )
        })
    }

    pub async fn ensure_initial_sync(
        &self,
        app: &AppHandle,
    ) -> Result<Option<NewsSyncResult>, NewsError> {
        self.runtime()?.ensure_initial_sync(app).await
    }

    pub async fn sync(&self, app: &AppHandle, force: bool) -> Result<NewsSyncResult, NewsError> {
        self.runtime()?.sync(app, force).await
    }

    pub async fn feed(&self, request: NewsFeedRequest) -> Result<NewsFeedPayload, NewsError> {
        self.runtime()?.feed(request).await
    }

    pub async fn detail(
        &self,
        news_id: String,
        locale: NewsLocale,
    ) -> Result<LocalizedNewsItem, NewsError> {
        self.runtime()?.detail(news_id, locale).await
    }

    pub async fn source_catalog(&self) -> Result<Vec<String>, NewsError> {
        self.runtime()?.source_catalog().await
    }

    pub async fn for_relation(
        &self,
        relation_type: NewsRelationType,
        external_id: String,
        locale: NewsLocale,
        limit: usize,
    ) -> Result<NewsFeedPayload, NewsError> {
        self.runtime()?
            .for_relation(relation_type, external_id, locale, limit)
            .await
    }

    pub async fn cache_image(&self, news_id: String) -> Result<String, NewsError> {
        self.runtime()?.cache_image(news_id).await
    }

    pub async fn process_translation_batch(&self, app: &AppHandle) -> Result<usize, NewsError> {
        self.runtime()?.process_translation_batch(app).await
    }

    pub async fn clear_translations(&self) -> Result<(), NewsError> {
        self.runtime()?.clear_translations().await
    }

    pub async fn operations_snapshot(&self) -> Result<NewsOperationsSnapshot, NewsError> {
        self.runtime()?.operations_snapshot().await
    }
}

impl NewsServiceRuntime {
    fn initialize(database_path: PathBuf, image_root: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&image_root).map_err(|error| error.to_string())?;
        let installation_id_path = database_path.with_file_name("translation-installation-id-v1");
        let database = NewsDatabase::initialize(database_path)?;
        let translation_gateway = TranslationGatewayClient::new(installation_id_path);
        Ok(Self {
            image_provider: NewsImageProvider::new()?,
            image_root: image_root.clone(),
            provider: SpaceflightNewsProvider::new()?,
            repository: NewsRepository::new(
                database.clone(),
                image_root,
                translation_gateway.configured(),
            ),
            request_gate: Mutex::new(()),
            translation_gateway,
            translation_gate: Mutex::new(()),
            translations: TranslationRepository::new(database),
        })
    }

    pub async fn ensure_initial_sync(
        &self,
        app: &AppHandle,
    ) -> Result<Option<NewsSyncResult>, NewsError> {
        if self.repository.item_count().await? > 0 {
            return Ok(None);
        }
        self.sync(app, false).await.map(Some)
    }

    pub async fn sync(&self, app: &AppHandle, force: bool) -> Result<NewsSyncResult, NewsError> {
        let _guard = self.request_gate.lock().await;
        if !force && self.repository.item_count().await? > 0 {
            let latest = self.repository.watermark(NewsContentType::Article).await?;
            if latest.is_some_and(|value| unix_time_ms().saturating_sub(value) < 10 * 60 * 1_000) {
                return Ok(NewsSyncResult {
                    fetched_at_unix_ms: unix_time_ms(),
                    item_count: self.repository.item_count().await?,
                    stale: false,
                });
            }
        }
        let started = Instant::now();
        let fetched_at = unix_time_ms();
        let mut changed_ids = Vec::new();
        let mut succeeded = 0_usize;
        let mut first_error: Option<NewsError> = None;
        for content_type in [
            NewsContentType::Article,
            NewsContentType::Blog,
            NewsContentType::Report,
        ] {
            let (backoff_until, failure_count) =
                self.repository.sync_retry_state(content_type).await?;
            if backoff_until.is_some_and(|until| until > fetched_at) {
                if first_error.is_none() {
                    first_error = Some(NewsError::new(
                        "provider_backoff",
                        "Spaceflight News refresh is waiting for its retry window",
                    ));
                }
                continue;
            }
            let watermark = self.repository.watermark(content_type).await?;
            match self
                .provider
                .fetch(content_type, watermark, fetched_at)
                .await
            {
                Ok(batch) => {
                    let _provider_count = batch.provider_count;
                    let _rejected_count = batch.rejected_count;
                    changed_ids.extend(self.repository.upsert_items(batch.items).await?);
                    self.repository
                        .update_sync_success(content_type, batch.latest_update_unix_ms)
                        .await?;
                    succeeded += 1;
                }
                Err(error) => {
                    let retry_after = retry_delay_ms(
                        failure_count.saturating_add(1),
                        error.retry_after_ms,
                        content_type,
                        fetched_at,
                    );
                    let _ = self
                        .repository
                        .update_sync_error(
                            content_type,
                            error.code,
                            fetched_at.saturating_add(retry_after),
                        )
                        .await;
                    if first_error.is_none() {
                        first_error = Some(NewsError::new(error.code, error.message));
                    }
                }
            }
        }
        if succeeded == 0 && self.repository.item_count().await? == 0 {
            return Err(first_error.unwrap_or_else(|| {
                NewsError::new("provider_unavailable", "Spaceflight News is unavailable")
            }));
        }
        self.repository.prune().await?;
        let _ = prune_image_cache(&self.image_root).await;
        if !changed_ids.is_empty() {
            let _ = app.emit("space-news-updated", &changed_ids);
        }
        let item_count = self.repository.item_count().await?;
        let _duration_ms = started.elapsed().as_millis() as u64;
        Ok(NewsSyncResult {
            fetched_at_unix_ms: fetched_at,
            item_count,
            stale: succeeded < 3,
        })
    }

    pub async fn feed(&self, request: NewsFeedRequest) -> Result<NewsFeedPayload, NewsError> {
        let locale = request.locale;
        let payload = self.repository.feed(request).await?;
        self.translations
            .reprioritize_items(
                locale,
                payload.items.iter().map(|item| item.id.clone()).collect(),
            )
            .await?;
        Ok(payload)
    }

    pub async fn detail(
        &self,
        news_id: String,
        locale: NewsLocale,
    ) -> Result<LocalizedNewsItem, NewsError> {
        let item = self.repository.detail(news_id, locale).await?;
        self.translations
            .reprioritize_items(locale, vec![item.id.clone()])
            .await?;
        Ok(item)
    }

    pub async fn source_catalog(&self) -> Result<Vec<String>, NewsError> {
        self.repository.source_catalog().await
    }

    pub async fn for_relation(
        &self,
        relation_type: NewsRelationType,
        external_id: String,
        locale: NewsLocale,
        limit: usize,
    ) -> Result<NewsFeedPayload, NewsError> {
        let payload = self
            .repository
            .for_relation(relation_type, external_id, locale, limit)
            .await?;
        self.translations
            .reprioritize_items(
                locale,
                payload.items.iter().map(|item| item.id.clone()).collect(),
            )
            .await?;
        Ok(payload)
    }

    pub async fn cache_image(&self, news_id: String) -> Result<String, NewsError> {
        let (url, existing_key) = self.repository.image_source(news_id.clone()).await?;
        if let Some(key) = existing_key {
            let path = self.image_root.join(key);
            if path.is_file() {
                return Ok(path.to_string_lossy().into_owned());
            }
        }
        let key = cache_key(&url);
        let path = self.image_root.join(&key);
        self.image_provider.cache_image(&url, &path).await?;
        self.repository.set_image_cache_key(news_id, key).await?;
        Ok(path.to_string_lossy().into_owned())
    }

    pub async fn process_translation_batch(&self, app: &AppHandle) -> Result<usize, NewsError> {
        if !self.translation_gateway.configured() {
            return Ok(0);
        }
        let _guard = self.translation_gate.lock().await;
        let jobs = self.translations.next_batch(10).await?;
        if jobs.is_empty() {
            return Ok(0);
        }
        let language = jobs[0].language;
        let request = TranslationGatewayRequest {
            items: jobs
                .iter()
                .map(|job| TranslationGatewayItem {
                    id: job.news_id.clone(),
                    summary: job.summary.clone(),
                    title: job.title.clone(),
                })
                .collect(),
            source: "en",
            target: language.as_str().to_owned(),
        };
        let response = match self.translation_gateway.translate(&request).await {
            Ok(response) => response,
            Err(error) => {
                self.translations
                    .fail_batch(jobs, error.code, error.retry_after_ms)
                    .await?;
                return Err(error.as_news_error());
            }
        };
        let provider = response.provider;
        let returned_ids = response
            .results
            .iter()
            .map(|result| result.id.clone())
            .collect::<HashSet<_>>();
        let mut saved = 0_usize;
        for result in response.results {
            let Some(job) = jobs.iter().find(|job| job.news_id == result.id) else {
                continue;
            };
            self.translations
                .save(
                    job.news_id.clone(),
                    job.language,
                    job.source_hash.clone(),
                    result.translated_title,
                    result.translated_summary,
                    provider.clone(),
                )
                .await?;
            saved += 1;
        }
        if saved < jobs.len() {
            let missing = jobs
                .into_iter()
                .filter(|job| !returned_ids.contains(&job.news_id))
                .collect::<Vec<_>>();
            if !missing.is_empty() {
                self.translations
                    .fail_batch(missing, "translation_incomplete", 60_000)
                    .await?;
            }
        }
        if saved > 0 {
            let _ = app.emit("space-news-translation-updated", language.as_str());
        }
        Ok(saved)
    }

    pub async fn clear_translations(&self) -> Result<(), NewsError> {
        self.translations.clear_and_requeue().await
    }

    pub async fn operations_snapshot(&self) -> Result<NewsOperationsSnapshot, NewsError> {
        self.repository.operations_snapshot().await
    }
}

pub struct NewsSyncResult {
    pub fetched_at_unix_ms: u64,
    pub item_count: usize,
    pub stale: bool,
}

fn unix_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn retry_delay_ms(
    attempt: u32,
    provider_retry_after_ms: Option<u64>,
    content_type: NewsContentType,
    now_unix_ms: u64,
) -> u64 {
    let base: u64 = match attempt {
        0 | 1 => 60_000,
        2 => 5 * 60_000,
        _ => 15 * 60_000,
    };
    let salt = match content_type {
        NewsContentType::Article => 17_u64,
        NewsContentType::Blog => 43,
        NewsContentType::Report => 79,
    };
    let jitter = (now_unix_ms.wrapping_mul(salt) % 20_001).saturating_sub(10_000);
    provider_retry_after_ms
        .unwrap_or_default()
        .max(base.saturating_add(jitter))
}

#[cfg(test)]
mod tests {
    use crate::domain::news::NewsContentType;

    use super::retry_delay_ms;

    #[test]
    fn retry_schedule_grows_and_honors_provider_backoff() {
        let first = retry_delay_ms(1, None, NewsContentType::Article, 1_000);
        let second = retry_delay_ms(2, None, NewsContentType::Article, 1_000);
        let third = retry_delay_ms(3, None, NewsContentType::Article, 1_000);
        assert!(first < second && second < third);
        assert!(retry_delay_ms(1, Some(900_000), NewsContentType::Blog, 1_000) >= 900_000);
    }
}
