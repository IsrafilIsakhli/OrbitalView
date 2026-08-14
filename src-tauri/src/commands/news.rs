use serde::Serialize;
use tauri::{AppHandle, State};

use crate::{
    commands::control_center::{OperationsService, ProviderId},
    domain::news::{
        LocalizedNewsItem, NewsError, NewsFeedPayload, NewsFeedRequest, NewsLocale,
        NewsRelationType, NewsSourceCatalog,
    },
    services::news_service::NewsService,
};

#[tauri::command]
pub async fn space_news_feed(
    app: AppHandle,
    request: NewsFeedRequest,
    operations: State<'_, OperationsService>,
    service: State<'_, NewsService>,
) -> Result<NewsFeedPayload, NewsError> {
    let started = std::time::Instant::now();
    let _ = service.ensure_initial_sync(&app).await?;
    let payload = service.feed(request).await?;
    operations.observe(
        ProviderId::SpaceflightNews,
        payload.total_count,
        payload.fetched_at_unix_ms.unwrap_or_default(),
        payload.stale,
        started.elapsed().as_millis() as u64,
    );
    Ok(payload)
}

#[tauri::command]
pub async fn space_news_detail(
    app: AppHandle,
    news_id: String,
    locale: NewsLocale,
    service: State<'_, NewsService>,
) -> Result<LocalizedNewsItem, NewsError> {
    let _ = service.ensure_initial_sync(&app).await?;
    service.detail(news_id, locale).await
}

#[tauri::command]
pub async fn search_space_news(
    app: AppHandle,
    query: String,
    locale: NewsLocale,
    limit: Option<usize>,
    operations: State<'_, OperationsService>,
    service: State<'_, NewsService>,
) -> Result<NewsFeedPayload, NewsError> {
    if query.trim().len() < 2 {
        return Err(NewsError::new(
            "search_too_short",
            "Search requires at least two characters",
        ));
    }
    let _ = service.ensure_initial_sync(&app).await?;
    let started = std::time::Instant::now();
    let payload = service
        .feed(NewsFeedRequest {
            content_types: None,
            featured: None,
            limit: Some(limit.unwrap_or(20).clamp(1, 20)),
            locale,
            offset: Some(0),
            search: Some(query),
            sources: None,
        })
        .await?;
    operations.observe(
        ProviderId::SpaceflightNews,
        payload.total_count,
        payload.fetched_at_unix_ms.unwrap_or_default(),
        payload.stale,
        started.elapsed().as_millis() as u64,
    );
    Ok(payload)
}

#[tauri::command]
pub async fn space_news_for_relation(
    app: AppHandle,
    relation_type: NewsRelationType,
    external_id: String,
    locale: NewsLocale,
    limit: Option<usize>,
    service: State<'_, NewsService>,
) -> Result<NewsFeedPayload, NewsError> {
    let external_id = external_id.trim();
    if external_id.is_empty() || external_id.len() > 128 {
        return Err(NewsError::new(
            "invalid_relation_id",
            "The provider relation identifier is invalid",
        ));
    }
    let _ = service.ensure_initial_sync(&app).await?;
    service
        .for_relation(
            relation_type,
            external_id.to_owned(),
            locale,
            limit.unwrap_or(6).clamp(1, 20),
        )
        .await
}

#[tauri::command]
pub async fn space_news_source_catalog(
    service: State<'_, NewsService>,
) -> Result<NewsSourceCatalog, NewsError> {
    Ok(NewsSourceCatalog {
        sources: service.source_catalog().await?,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsImagePayload {
    cached_path: String,
}

#[tauri::command]
pub async fn space_news_image(
    news_id: String,
    service: State<'_, NewsService>,
) -> Result<NewsImagePayload, NewsError> {
    Ok(NewsImagePayload {
        cached_path: service.cache_image(news_id).await?,
    })
}

#[tauri::command]
pub async fn clear_space_news_translations(
    service: State<'_, NewsService>,
) -> Result<(), NewsError> {
    service.clear_translations().await
}
