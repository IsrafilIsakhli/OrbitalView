use rusqlite::{OptionalExtension, params};

use crate::domain::{
    news::{NewsError, NewsLocale},
    translation::TranslationJob,
};

use super::database::NewsDatabase;

#[derive(Clone)]
pub struct TranslationRepository {
    database: NewsDatabase,
}

impl TranslationRepository {
    pub fn new(database: NewsDatabase) -> Self {
        Self { database }
    }

    pub async fn next_batch(&self, limit: usize) -> Result<Vec<TranslationJob>, NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let mut connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let transaction = connection
                .transaction()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            let now = to_i64(unix_time_ms());
            let selected_language: Option<String> = transaction
                .query_row(
                    "SELECT language FROM translation_jobs
                     WHERE state IN ('queued', 'retry') AND not_before <= ?1
                     ORDER BY priority DESC, created_at ASC LIMIT 1",
                    [now],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| NewsError::new("database_read", error.to_string()))?;
            let Some(language) = selected_language else {
                return Ok(Vec::new());
            };
            let locale = parse_locale(&language)?;
            let jobs = {
                let mut statement = transaction
                    .prepare(
                        "SELECT j.news_id, j.source_hash, j.attempt_count,
                                n.title_original, n.summary_original
                         FROM translation_jobs j
                         JOIN news_items n ON n.id = j.news_id AND n.content_hash = j.source_hash
                         WHERE j.language = ?1
                           AND j.state IN ('queued', 'retry')
                           AND j.not_before <= ?2
                         ORDER BY j.priority DESC, j.created_at ASC
                         LIMIT ?3",
                    )
                    .map_err(|error| NewsError::new("database_read", error.to_string()))?;
                statement
                    .query_map(params![language, now, limit.clamp(1, 10)], |row| {
                        Ok(TranslationJob {
                            attempt_count: row.get(2)?,
                            language: locale,
                            news_id: row.get(0)?,
                            source_hash: row.get(1)?,
                            title: row.get(3)?,
                            summary: row.get(4)?,
                        })
                    })
                    .map_err(|error| NewsError::new("database_read", error.to_string()))?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|error| NewsError::new("database_read", error.to_string()))?
            };
            for job in &jobs {
                transaction
                    .execute(
                        "UPDATE translation_jobs SET state = 'running', updated_at = ?3
                         WHERE news_id = ?1 AND language = ?2",
                        params![job.news_id, job.language.as_str(), now],
                    )
                    .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            }
            transaction
                .commit()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            Ok(jobs)
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn save(
        &self,
        news_id: String,
        language: NewsLocale,
        source_hash: String,
        title: String,
        summary: String,
        provider: String,
    ) -> Result<(), NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let mut connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let transaction = connection
                .transaction()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            let now = to_i64(unix_time_ms());
            transaction
                .execute(
                    "INSERT INTO news_translations(
                       news_id, language, translated_title, translated_summary,
                       provider, source_hash, translated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                     ON CONFLICT(news_id, language) DO UPDATE SET
                       translated_title = excluded.translated_title,
                       translated_summary = excluded.translated_summary,
                       provider = excluded.provider,
                       source_hash = excluded.source_hash,
                       translated_at = excluded.translated_at",
                    params![
                        news_id,
                        language.as_str(),
                        title,
                        summary,
                        provider,
                        source_hash,
                        now,
                    ],
                )
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            transaction
                .execute(
                    "DELETE FROM news_fts WHERE news_id = ?1 AND language = ?2",
                    params![news_id, language.as_str()],
                )
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            transaction
                .execute(
                    "INSERT INTO news_fts(news_id, language, title, summary) VALUES (?1, ?2, ?3, ?4)",
                    params![news_id, language.as_str(), title, summary],
                )
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            transaction
                .execute(
                    "DELETE FROM translation_jobs WHERE news_id = ?1 AND language = ?2",
                    params![news_id, language.as_str()],
                )
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            transaction
                .commit()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn fail_batch(
        &self,
        jobs: Vec<TranslationJob>,
        code: &'static str,
        retry_after_ms: u64,
    ) -> Result<(), NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let mut connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let transaction = connection
                .transaction()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            let now = unix_time_ms();
            for job in jobs {
                let attempts = job.attempt_count.saturating_add(1);
                let state = if attempts >= 5 { "failed" } else { "retry" };
                transaction
                    .execute(
                        "UPDATE translation_jobs
                         SET state = ?3, attempt_count = ?4, not_before = ?5,
                             last_error_code = ?6, updated_at = ?7
                         WHERE news_id = ?1 AND language = ?2",
                        params![
                            job.news_id,
                            job.language.as_str(),
                            state,
                            attempts,
                            to_i64(now.saturating_add(retry_after_ms)),
                            code,
                            to_i64(now),
                        ],
                    )
                    .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            }
            transaction
                .commit()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn reprioritize(&self, locale: NewsLocale) -> Result<(), NewsError> {
        if locale == NewsLocale::En {
            return Ok(());
        }
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            connection
                .execute(
                    "UPDATE translation_jobs SET priority = CASE WHEN language = ?1 THEN MAX(priority, 600) ELSE MIN(priority, 100) END
                     WHERE state IN ('queued', 'retry')",
                    [locale.as_str()],
                )
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn reprioritize_items(
        &self,
        locale: NewsLocale,
        news_ids: Vec<String>,
    ) -> Result<(), NewsError> {
        if locale == NewsLocale::En || news_ids.is_empty() {
            return Ok(());
        }
        self.reprioritize(locale).await?;
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let mut connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let transaction = connection
                .transaction()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            for news_id in news_ids {
                transaction
                    .execute(
                        "UPDATE translation_jobs SET priority = 1200
                         WHERE news_id = ?1 AND language = ?2 AND state IN ('queued', 'retry')",
                        params![news_id, locale.as_str()],
                    )
                    .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            }
            transaction
                .commit()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }

    pub async fn clear_and_requeue(&self) -> Result<(), NewsError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let mut connection = database
                .connection()
                .map_err(|error| NewsError::new("database_open", error.to_string()))?;
            let transaction = connection
                .transaction()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            transaction
                .execute("DELETE FROM news_translations", [])
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            transaction
                .execute("DELETE FROM news_fts WHERE language <> 'en'", [])
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            let now = to_i64(unix_time_ms());
            for locale in NewsLocale::TRANSLATED {
                transaction
                    .execute(
                        "INSERT INTO translation_jobs(
                           news_id, language, source_hash, state, priority, attempt_count,
                           not_before, created_at, updated_at
                         ) SELECT id, ?1, content_hash, 'queued', 100, 0, 0, ?2, ?2 FROM news_items
                         ON CONFLICT(news_id, language) DO UPDATE SET
                           source_hash = excluded.source_hash, state = 'queued', priority = 100,
                           attempt_count = 0, not_before = 0, last_error_code = NULL,
                           updated_at = excluded.updated_at",
                        params![locale.as_str(), now],
                    )
                    .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            }
            transaction
                .commit()
                .map_err(|error| NewsError::new("database_write", error.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|error| NewsError::new("database_task", error.to_string()))?
    }
}

fn parse_locale(value: &str) -> Result<NewsLocale, NewsError> {
    match value {
        "az" => Ok(NewsLocale::Az),
        "tr" => Ok(NewsLocale::Tr),
        "ru" => Ok(NewsLocale::Ru),
        "es" => Ok(NewsLocale::Es),
        _ => Err(NewsError::new(
            "invalid_locale",
            "Unsupported translation locale",
        )),
    }
}

fn to_i64(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn unix_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
