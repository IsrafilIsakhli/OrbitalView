use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use rusqlite::{OptionalExtension, params, params_from_iter, types::Value as SqlValue};

use crate::domain::news::{
    LocalizedNewsItem, NewsContentType, NewsError, NewsFeedPayload, NewsFeedRequest,
    NewsItemRecord, NewsLocale, NewsOperationsSnapshot, NewsRelation, NewsRelationType,
    TranslationState,
};

use super::database::NewsDatabase;

#[derive(Clone)]
pub struct NewsRepository {
    database: NewsDatabase,
    image_root: Arc<PathBuf>,
    translation_gateway_configured: bool,
}

impl NewsRepository {
    pub fn new(
        database: NewsDatabase,
        image_root: PathBuf,
        translation_gateway_configured: bool,
    ) -> Self {
        Self {
            database,
            image_root: Arc::new(image_root),
            translation_gateway_configured,
        }
    }

    pub async fn upsert_items(&self, items: Vec<NewsItemRecord>) -> Result<Vec<String>, NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let mut connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let transaction = connection
                .transaction()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            let mut changed_ids = Vec::new();
            for item in items {
                let existing_hash: Option<String> = transaction
                    .query_row(
                        "SELECT content_hash FROM news_items WHERE id = ?1",
                        [&item.id],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|error| NewsError::new("database_read", error.to_string()))?;
                let changed = existing_hash.as_deref() != Some(item.content_hash.as_str());
                let now = to_i64(item.fetched_at_unix_ms);
                transaction
                    .execute(
                        "INSERT INTO news_items (
                           id, provider_id, content_type, source, authors_json, title_original,
                           summary_original, image_url_original, article_url, published_at,
                           source_updated_at, featured, content_hash, fetched_at, created_at, last_seen_at
                         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, ?14)
                         ON CONFLICT(id) DO UPDATE SET
                           source = excluded.source,
                           authors_json = excluded.authors_json,
                           title_original = excluded.title_original,
                           summary_original = excluded.summary_original,
                           image_url_original = excluded.image_url_original,
                           article_url = excluded.article_url,
                           published_at = excluded.published_at,
                           source_updated_at = excluded.source_updated_at,
                           featured = excluded.featured,
                           content_hash = excluded.content_hash,
                           fetched_at = excluded.fetched_at,
                           last_seen_at = excluded.last_seen_at",
                        params![
                            item.id,
                            to_i64(item.provider_id),
                            item.content_type.as_str(),
                            item.source,
                            serde_json::to_string(&item.authors).unwrap_or_else(|_| "[]".to_owned()),
                            item.title_original,
                            item.summary_original,
                            item.image_url_original,
                            item.article_url,
                            to_i64(item.published_at_unix_ms),
                            to_i64(item.source_updated_at_unix_ms),
                            item.featured,
                            item.content_hash,
                            now,
                        ],
                    )
                    .map_err(|error| NewsError::new("database_write", error.to_string()))?;

                transaction
                    .execute("DELETE FROM news_relations WHERE news_id = ?1", [&item.id])
                    .map_err(|error| NewsError::new("database_write", error.to_string()))?;
                for relation in item.relations {
                    transaction
                        .execute(
                            "INSERT OR IGNORE INTO news_relations(news_id, relation_type, external_id, provider)
                             VALUES (?1, ?2, ?3, ?4)",
                            params![
                                item.id,
                                relation.relation_type.as_str(),
                                relation.external_id,
                                relation.provider,
                            ],
                        )
                        .map_err(|error| NewsError::new("database_write", error.to_string()))?;
                }

                if changed {
                    changed_ids.push(item.id.clone());
                    transaction
                        .execute("DELETE FROM news_fts WHERE news_id = ?1", [&item.id])
                        .map_err(|error| NewsError::new("database_write", error.to_string()))?;
                    transaction
                        .execute(
                            "INSERT INTO news_fts(news_id, language, title, summary) VALUES (?1, 'en', ?2, ?3)",
                            params![item.id, item.title_original, item.summary_original],
                        )
                        .map_err(|error| NewsError::new("database_write", error.to_string()))?;
                    transaction
                        .execute(
                            "DELETE FROM news_translations WHERE news_id = ?1 AND source_hash <> ?2",
                            params![item.id, item.content_hash],
                        )
                        .map_err(|error| NewsError::new("database_write", error.to_string()))?;
                    for locale in NewsLocale::TRANSLATED {
                        transaction
                            .execute(
                                "INSERT INTO translation_jobs(
                                   news_id, language, source_hash, state, priority, attempt_count,
                                   not_before, created_at, updated_at
                                 ) VALUES (?1, ?2, ?3, 'queued', ?4, 0, 0, ?5, ?5)
                                 ON CONFLICT(news_id, language) DO UPDATE SET
                                   source_hash = excluded.source_hash,
                                   state = 'queued',
                                   priority = excluded.priority,
                                   attempt_count = 0,
                                   not_before = 0,
                                   last_error_code = NULL,
                                   updated_at = excluded.updated_at",
                                params![item.id, locale.as_str(), item.content_hash, 100, now],
                            )
                            .map_err(|error| NewsError::new("database_write", error.to_string()))?;
                    }
                }
            }
            transaction
                .commit()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            Ok(changed_ids)
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn feed(&self, request: NewsFeedRequest) -> Result<NewsFeedPayload, NewsError> {
        let database = self.database.clone();
        let image_root = Arc::clone(&self.image_root);
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let limit = request.limit.unwrap_or(30).clamp(1, 100);
            let offset = request.offset.unwrap_or_default().min(100_000);
            let (count_clauses, count_values) = feed_filters(&request, 1);
            let count_where_clause = if count_clauses.is_empty() {
                String::new()
            } else {
                format!(" WHERE {}", count_clauses.join(" AND "))
            };

            let count_sql = format!("SELECT COUNT(*) FROM news_items n{count_where_clause}");
            let total_count: usize = connection
                .query_row(&count_sql, params_from_iter(count_values.iter()), |row| {
                    row.get(0)
                })
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;

            let locale = request.locale.as_str().to_owned();
            let (clauses, filter_values) = feed_filters(&request, 2);
            let where_clause = if clauses.is_empty() {
                String::new()
            } else {
                format!(" WHERE {}", clauses.join(" AND "))
            };
            let mut values = vec![SqlValue::Text(locale.clone())];
            values.extend(filter_values);
            values.push(SqlValue::Integer(limit as i64));
            values.push(SqlValue::Integer(offset as i64));
            let limit_parameter = values.len() - 1;
            let offset_parameter = values.len();
            let sql = format!(
                "SELECT n.id, n.content_type, n.source, n.authors_json, n.title_original,
                        n.summary_original, n.image_url_original, n.image_cache_key, n.article_url,
                        n.published_at, n.source_updated_at, n.featured, n.content_hash,
                        t.translated_title, t.translated_summary,
                        COALESCE(j.state, '')
                 FROM news_items n
                 LEFT JOIN news_translations t
                   ON t.news_id = n.id AND t.language = ?1 AND t.source_hash = n.content_hash
                 LEFT JOIN translation_jobs j
                   ON j.news_id = n.id AND j.language = ?1 AND j.source_hash = n.content_hash
                 {where_clause}
                 ORDER BY n.published_at DESC
                 LIMIT ?{limit_parameter} OFFSET ?{offset_parameter}"
            );
            let mut statement = connection
                .prepare(&sql)
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;
            let mut rows = statement
                .query(params_from_iter(values.iter()))
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;
            let mut items = Vec::new();
            while let Some(row) = rows
                .next()
                .map_err(|error| NewsError::new("database_read", error.to_string()))?
            {
                items.push(map_item(&connection, row, request.locale, &image_root)?);
            }
            let available_sources = source_catalog_sync(&connection)?;
            let fetched_at_unix_ms: Option<i64> = connection
                .query_row(
                    "SELECT MAX(last_success_at) FROM news_sync_state",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;
            let now = unix_time_ms();
            let fetched_at_unix_ms = fetched_at_unix_ms.and_then(from_i64);
            Ok(NewsFeedPayload {
                available_sources,
                fetched_at_unix_ms,
                items,
                limit,
                offset,
                source: "Spaceflight News API v4".to_owned(),
                stale: fetched_at_unix_ms
                    .is_none_or(|fetched| now.saturating_sub(fetched) > 15 * 60 * 1_000),
                total_count,
            })
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn detail(
        &self,
        id: String,
        locale: NewsLocale,
    ) -> Result<LocalizedNewsItem, NewsError> {
        let database = self.database.clone();
        let image_root = Arc::clone(&self.image_root);
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let mut statement = connection
                .prepare(
                    "SELECT n.id, n.content_type, n.source, n.authors_json, n.title_original,
                            n.summary_original, n.image_url_original, n.image_cache_key, n.article_url,
                            n.published_at, n.source_updated_at, n.featured, n.content_hash,
                            t.translated_title, t.translated_summary, COALESCE(j.state, '')
                     FROM news_items n
                     LEFT JOIN news_translations t
                       ON t.news_id = n.id AND t.language = ?2 AND t.source_hash = n.content_hash
                     LEFT JOIN translation_jobs j
                       ON j.news_id = n.id AND j.language = ?2 AND j.source_hash = n.content_hash
                     WHERE n.id = ?1",
                )
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;
            statement
                .query_row(params![id, locale.as_str()], |row| {
                    map_item_row(&connection, row, locale, &image_root)
                })
                .map_err(|error| NewsError::new("news_not_found", error.to_string()))
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn for_relation(
        &self,
        relation_type: NewsRelationType,
        external_id: String,
        locale: NewsLocale,
        limit: usize,
    ) -> Result<NewsFeedPayload, NewsError> {
        let database = self.database.clone();
        let image_root = Arc::clone(&self.image_root);
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let limit = limit.clamp(1, 20);
            let total_count: usize = connection
                .query_row(
                    "SELECT COUNT(DISTINCT n.id)
                     FROM news_items n
                     INNER JOIN news_relations r ON r.news_id = n.id
                     WHERE r.relation_type = ?1 AND r.external_id = ?2",
                    params![relation_type.as_str(), external_id],
                    |row| row.get(0),
                )
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;
            let mut statement = connection
                .prepare(
                    "SELECT DISTINCT n.id, n.content_type, n.source, n.authors_json, n.title_original,
                            n.summary_original, n.image_url_original, n.image_cache_key, n.article_url,
                            n.published_at, n.source_updated_at, n.featured, n.content_hash,
                            t.translated_title, t.translated_summary, COALESCE(j.state, '')
                     FROM news_items n
                     INNER JOIN news_relations r ON r.news_id = n.id
                     LEFT JOIN news_translations t
                       ON t.news_id = n.id AND t.language = ?3 AND t.source_hash = n.content_hash
                     LEFT JOIN translation_jobs j
                       ON j.news_id = n.id AND j.language = ?3 AND j.source_hash = n.content_hash
                     WHERE r.relation_type = ?1 AND r.external_id = ?2
                     ORDER BY n.published_at DESC
                     LIMIT ?4",
                )
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;
            let mut rows = statement
                .query(params![
                    relation_type.as_str(),
                    external_id,
                    locale.as_str(),
                    limit
                ])
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;
            let mut items = Vec::new();
            while let Some(row) = rows
                .next()
                .map_err(|error| NewsError::new("database_read", error.to_string()))?
            {
                items.push(map_item(&connection, row, locale, &image_root)?);
            }
            let fetched_at_unix_ms: Option<i64> = connection
                .query_row(
                    "SELECT MAX(last_success_at) FROM news_sync_state",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;
            let fetched_at_unix_ms = fetched_at_unix_ms.and_then(from_i64);
            Ok(NewsFeedPayload {
                available_sources: source_catalog_sync(&connection)?,
                fetched_at_unix_ms,
                items,
                limit,
                offset: 0,
                source: "Spaceflight News API v4".to_owned(),
                stale: fetched_at_unix_ms
                    .is_none_or(|fetched| unix_time_ms().saturating_sub(fetched) > 15 * 60 * 1_000),
                total_count,
            })
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn source_catalog(&self) -> Result<Vec<String>, NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            source_catalog_sync(&connection)
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn update_sync_success(
        &self,
        feed_type: NewsContentType,
        latest_provider_update: u64,
    ) -> Result<(), NewsError> {
        self.update_sync_state(feed_type, Some(latest_provider_update), None)
            .await
    }

    pub async fn update_sync_error(
        &self,
        feed_type: NewsContentType,
        error_code: &'static str,
        backoff_until: u64,
    ) -> Result<(), NewsError> {
        self.update_sync_state(feed_type, None, Some((error_code, backoff_until)))
            .await
    }

    async fn update_sync_state(
        &self,
        feed_type: NewsContentType,
        success: Option<u64>,
        failure: Option<(&'static str, u64)>,
    ) -> Result<(), NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let now = to_i64(unix_time_ms());
            if let Some(provider_update) = success {
                connection.execute(
                    "INSERT INTO news_sync_state(feed_type, last_attempt_at, last_success_at, last_provider_updated_at, backoff_until, last_error_code, attempt_count)
                     VALUES (?1, ?2, ?2, ?3, NULL, NULL, 0)
                     ON CONFLICT(feed_type) DO UPDATE SET
                       last_attempt_at = excluded.last_attempt_at,
                       last_success_at = excluded.last_success_at,
                       last_provider_updated_at = MAX(COALESCE(news_sync_state.last_provider_updated_at, 0), excluded.last_provider_updated_at),
                       backoff_until = NULL,
                       last_error_code = NULL,
                       attempt_count = 0",
                    params![feed_type.as_str(), now, to_i64(provider_update)],
                )
            } else if let Some((code, backoff_until)) = failure {
                connection.execute(
                    "INSERT INTO news_sync_state(feed_type, last_attempt_at, backoff_until, last_error_code, attempt_count)
                     VALUES (?1, ?2, ?3, ?4, 1)
                     ON CONFLICT(feed_type) DO UPDATE SET
                       last_attempt_at = excluded.last_attempt_at,
                       backoff_until = excluded.backoff_until,
                       last_error_code = excluded.last_error_code,
                       attempt_count = news_sync_state.attempt_count + 1",
                    params![feed_type.as_str(), now, to_i64(backoff_until), code],
                )
            } else {
                Ok(0)
            }
            .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn watermark(&self, feed_type: NewsContentType) -> Result<Option<u64>, NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let value: Option<i64> = connection
                .query_row(
                    "SELECT last_provider_updated_at FROM news_sync_state WHERE feed_type = ?1",
                    [feed_type.as_str()],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| NewsError::new("database_read", error.to_string()))?
                .flatten();
            Ok(value.and_then(from_i64))
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn sync_retry_state(
        &self,
        feed_type: NewsContentType,
    ) -> Result<(Option<u64>, u32), NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let value: Option<(Option<i64>, u32)> = connection
                .query_row(
                    "SELECT backoff_until, attempt_count FROM news_sync_state WHERE feed_type = ?1",
                    [feed_type.as_str()],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;
            Ok(value
                .map(|(backoff, attempts)| (backoff.and_then(from_i64), attempts))
                .unwrap_or((None, 0)))
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn item_count(&self) -> Result<usize, NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            connection
                .query_row("SELECT COUNT(*) FROM news_items", [], |row| row.get(0))
                .map_err(|error| NewsError::new("database_read", error.to_string()))
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn image_source(&self, id: String) -> Result<(String, Option<String>), NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let (url, cache_key) = connection
                .query_row(
                    "SELECT image_url_original, image_cache_key FROM news_items WHERE id = ?1",
                    [id],
                    |row| Ok((row.get::<_, Option<String>>(0)?, row.get(1)?)),
                )
                .map_err(|error| NewsError::new("image_not_found", error.to_string()))?;
            url.map(|url| (url, cache_key))
                .ok_or_else(|| NewsError::new("image_unavailable", "The news item has no image"))
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn set_image_cache_key(&self, id: String, key: String) -> Result<(), NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            connection
                .execute(
                    "UPDATE news_items SET image_cache_key = ?2 WHERE id = ?1",
                    params![id, key],
                )
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn operations_snapshot(&self) -> Result<NewsOperationsSnapshot, NewsError> {
        let database = self.database.clone();
        let image_root = Arc::clone(&self.image_root);
        let configured = self.translation_gateway_configured;
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let item_count = count(&connection, "SELECT COUNT(*) FROM news_items")?;
            let translated_items = count(&connection, "SELECT COUNT(*) FROM news_translations")?;
            let pending_translations = count(
                &connection,
                "SELECT COUNT(*) FROM translation_jobs WHERE state IN ('queued', 'running', 'retry')",
            )?;
            let failed_translations = count(
                &connection,
                "SELECT COUNT(*) FROM translation_jobs WHERE state = 'failed'",
            )?;
            let last_success_at_unix_ms: Option<i64> = connection
                .query_row("SELECT MAX(last_success_at) FROM news_sync_state", [], |row| row.get(0))
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;
            let database_bytes = std::fs::metadata(database.path())
                .map(|metadata| metadata.len())
                .unwrap_or_default();
            let image_cache_bytes = directory_size(&image_root);
            Ok(NewsOperationsSnapshot {
                database_bytes,
                failed_translations,
                image_cache_bytes,
                item_count,
                last_success_at_unix_ms: last_success_at_unix_ms.and_then(from_i64),
                pending_translations,
                translated_items,
                translation_gateway_configured: configured,
            })
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn prune(&self) -> Result<(), NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let cutoff = to_i64(unix_time_ms().saturating_sub(180 * 24 * 60 * 60 * 1_000));
            connection
                .execute(
                    "DELETE FROM news_items WHERE id IN (
                       SELECT n.id FROM news_items n
                       LEFT JOIN news_relations r ON r.news_id = n.id
                       WHERE n.published_at < ?1 AND r.news_id IS NULL
                     )",
                    [cutoff],
                )
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            connection
                .execute(
                    "DELETE FROM news_items WHERE id IN (
                       SELECT id FROM news_items ORDER BY published_at DESC LIMIT -1 OFFSET 5000
                     )",
                    [],
                )
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }
}

fn feed_filters(request: &NewsFeedRequest, first_parameter: usize) -> (Vec<String>, Vec<SqlValue>) {
    let mut clauses = Vec::new();
    let mut values = Vec::new();
    if let Some(types) = request
        .content_types
        .as_ref()
        .filter(|types| !types.is_empty())
    {
        let placeholders = types
            .iter()
            .map(|content_type| {
                values.push(SqlValue::Text(content_type.as_str().to_owned()));
                format!("?{}", first_parameter + values.len() - 1)
            })
            .collect::<Vec<_>>()
            .join(",");
        clauses.push(format!("n.content_type IN ({placeholders})"));
    }
    if let Some(sources) = request
        .sources
        .as_ref()
        .filter(|sources| !sources.is_empty())
    {
        let placeholders = sources
            .iter()
            .filter(|source| !source.trim().is_empty())
            .map(|source| {
                values.push(SqlValue::Text(source.trim().to_owned()));
                format!("?{}", first_parameter + values.len() - 1)
            })
            .collect::<Vec<_>>();
        if !placeholders.is_empty() {
            clauses.push(format!("n.source IN ({})", placeholders.join(",")));
        }
    }
    if let Some(featured) = request.featured {
        values.push(SqlValue::Integer(i64::from(featured)));
        clauses.push(format!(
            "n.featured = ?{}",
            first_parameter + values.len() - 1
        ));
    }
    if let Some(search) = request.search.as_deref().and_then(fts_query) {
        values.push(SqlValue::Text(search));
        clauses.push(format!(
            "n.id IN (SELECT news_id FROM news_fts WHERE news_fts MATCH ?{})",
            first_parameter + values.len() - 1
        ));
    }
    (clauses, values)
}

fn fts_query(value: &str) -> Option<String> {
    let tokens = value
        .split_whitespace()
        .map(|token| {
            token
                .chars()
                .filter(|character| character.is_alphanumeric())
                .collect::<String>()
        })
        .filter(|token| token.len() >= 2)
        .map(|token| format!("\"{token}\"*"))
        .collect::<Vec<_>>();
    (!tokens.is_empty()).then(|| tokens.join(" AND "))
}

fn map_item(
    connection: &rusqlite::Connection,
    row: &rusqlite::Row<'_>,
    locale: NewsLocale,
    image_root: &Path,
) -> Result<LocalizedNewsItem, NewsError> {
    map_item_row(connection, row, locale, image_root)
        .map_err(|error| NewsError::new("database_decode", error.to_string()))
}

fn map_item_row(
    connection: &rusqlite::Connection,
    row: &rusqlite::Row<'_>,
    locale: NewsLocale,
    image_root: &Path,
) -> Result<LocalizedNewsItem, rusqlite::Error> {
    let id: String = row.get(0)?;
    let content_type_text: String = row.get(1)?;
    let content_type = NewsContentType::try_from(content_type_text.as_str()).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            1,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, error)),
        )
    })?;
    let authors_json: String = row.get(3)?;
    let title_original: String = row.get(4)?;
    let summary_original: String = row.get(5)?;
    let image_url_original: Option<String> = row.get(6)?;
    let image_cache_key: Option<String> = row.get(7)?;
    let translated_title: Option<String> = row.get(13)?;
    let translated_summary: Option<String> = row.get(14)?;
    let job_state: String = row.get(15)?;
    let translation_state = if locale == NewsLocale::En {
        TranslationState::Original
    } else if translated_title.is_some() && translated_summary.is_some() {
        TranslationState::Cached
    } else if job_state == "failed" {
        TranslationState::Failed
    } else {
        TranslationState::Pending
    };
    let relations = relations_for(connection, &id)?;
    let image_cache_path = image_cache_key
        .map(|key| image_root.join(key))
        .filter(|path| path.is_file())
        .map(|path| path.to_string_lossy().into_owned());
    Ok(LocalizedNewsItem {
        article_url: row.get(8)?,
        authors: serde_json::from_str(&authors_json).unwrap_or_default(),
        content_type,
        featured: row.get(11)?,
        id,
        image_cache_path,
        image_url_available: image_url_original.is_some(),
        published_at_unix_ms: from_i64(row.get(9)?).unwrap_or_default(),
        relations,
        source: row.get(2)?,
        source_updated_at_unix_ms: from_i64(row.get(10)?).unwrap_or_default(),
        summary: translated_summary.unwrap_or_else(|| summary_original.clone()),
        summary_original,
        title: translated_title.unwrap_or_else(|| title_original.clone()),
        title_original,
        translation_state,
    })
}

fn relations_for(
    connection: &rusqlite::Connection,
    news_id: &str,
) -> Result<Vec<NewsRelation>, rusqlite::Error> {
    let mut statement = connection.prepare(
        "SELECT relation_type, external_id, provider FROM news_relations WHERE news_id = ?1",
    )?;
    let rows = statement.query_map([news_id], |row| {
        let relation_type: String = row.get(0)?;
        Ok(NewsRelation {
            external_id: row.get(1)?,
            provider: row.get(2)?,
            relation_type: if relation_type == "launch" {
                NewsRelationType::Launch
            } else {
                NewsRelationType::Event
            },
        })
    })?;
    rows.collect()
}

fn source_catalog_sync(connection: &rusqlite::Connection) -> Result<Vec<String>, NewsError> {
    let mut statement = connection
        .prepare("SELECT DISTINCT source FROM news_items ORDER BY source COLLATE NOCASE")
        .map_err(|error| NewsError::new("database_read", error.to_string()))?;
    statement
        .query_map([], |row| row.get(0))
        .map_err(|error| NewsError::new("database_read", error.to_string()))?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|error| NewsError::new("database_read", error.to_string()))
}

fn count(connection: &rusqlite::Connection, sql: &str) -> Result<usize, NewsError> {
    connection
        .query_row(sql, [], |row| row.get(0))
        .map_err(|error| NewsError::new("database_read", error.to_string()))
}

fn directory_size(path: &Path) -> u64 {
    std::fs::read_dir(path)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok))
        .filter_map(|entry| entry.metadata().ok())
        .filter(|metadata| metadata.is_file())
        .map(|metadata| metadata.len())
        .sum()
}

fn to_i64(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn from_i64(value: i64) -> Option<u64> {
    u64::try_from(value).ok()
}

fn unix_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use crate::{
        domain::news::{
            NewsContentType, NewsFeedRequest, NewsItemRecord, NewsLocale, TranslationState,
        },
        storage::{database::NewsDatabase, translation_repository::TranslationRepository},
    };

    use super::{NewsRepository, fts_query};

    #[test]
    fn fts_query_rejects_punctuation_and_short_tokens() {
        assert_eq!(fts_query("a !"), None);
        assert_eq!(
            fts_query("NASA moon"),
            Some("\"NASA\"* AND \"moon\"*".to_owned())
        );
    }

    #[tokio::test]
    async fn persists_last_good_feed_and_invalidates_stale_translations() {
        let root = std::env::temp_dir().join(format!(
            "orbital-vision-news-repository-test-{}",
            uuid::Uuid::new_v4()
        ));
        let image_root = root.join("images");
        std::fs::create_dir_all(&image_root).unwrap();
        let database = NewsDatabase::initialize(root.join("news.sqlite3")).unwrap();
        let repository = NewsRepository::new(database.clone(), image_root, true);
        let translations = TranslationRepository::new(database.clone());

        let initial = test_record("hash-v1", "Original title");
        assert_eq!(
            repository
                .upsert_items(vec![initial.clone()])
                .await
                .unwrap(),
            vec![initial.id.clone()]
        );
        assert!(
            repository
                .upsert_items(vec![initial.clone()])
                .await
                .unwrap()
                .is_empty()
        );
        assert_eq!(repository.item_count().await.unwrap(), 1);

        let queued_count: usize = database
            .connection()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM translation_jobs", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(queued_count, NewsLocale::TRANSLATED.len());

        translations
            .save(
                initial.id.clone(),
                NewsLocale::Az,
                initial.content_hash.clone(),
                "Tərcümə edilmiş başlıq".to_owned(),
                "Tərcümə edilmiş xülasə".to_owned(),
                "test-provider".to_owned(),
            )
            .await
            .unwrap();
        let localized = repository.feed(test_request(NewsLocale::Az)).await.unwrap();
        assert_eq!(localized.items[0].title, "Tərcümə edilmiş başlıq");
        assert_eq!(
            localized.items[0].translation_state,
            TranslationState::Cached
        );

        let changed = test_record("hash-v2", "Updated original title");
        assert_eq!(
            repository
                .upsert_items(vec![changed.clone()])
                .await
                .unwrap(),
            vec![changed.id.clone()]
        );
        let refreshed = repository.feed(test_request(NewsLocale::Az)).await.unwrap();
        assert_eq!(refreshed.items[0].title, "Updated original title");
        assert_eq!(
            refreshed.items[0].translation_state,
            TranslationState::Pending
        );

        repository
            .update_sync_success(NewsContentType::Article, changed.source_updated_at_unix_ms)
            .await
            .unwrap();
        repository
            .update_sync_error(NewsContentType::Article, "offline", u64::MAX)
            .await
            .unwrap();
        let offline_fallback = repository.feed(test_request(NewsLocale::En)).await.unwrap();
        assert_eq!(offline_fallback.total_count, 1);
        assert_eq!(offline_fallback.items[0].title, "Updated original title");

        drop(translations);
        drop(repository);
        drop(database);
        let _ = std::fs::remove_dir_all(root);
    }

    fn test_record(content_hash: &str, title: &str) -> NewsItemRecord {
        NewsItemRecord {
            article_url: "https://example.com/story".to_owned(),
            authors: vec!["Orbital Reporter".to_owned()],
            content_hash: content_hash.to_owned(),
            content_type: NewsContentType::Article,
            featured: true,
            fetched_at_unix_ms: 1_800_000_000_000,
            id: "sfn:article:1".to_owned(),
            image_url_original: Some("https://example.com/image.jpg".to_owned()),
            provider_id: 1,
            published_at_unix_ms: 1_800_000_000_000,
            relations: Vec::new(),
            source: "Example Space".to_owned(),
            source_updated_at_unix_ms: 1_800_000_000_000,
            summary_original: "Original summary".to_owned(),
            title_original: title.to_owned(),
        }
    }

    fn test_request(locale: NewsLocale) -> NewsFeedRequest {
        NewsFeedRequest {
            content_types: None,
            featured: None,
            limit: Some(30),
            locale,
            offset: Some(0),
            search: None,
            sources: None,
        }
    }
}
