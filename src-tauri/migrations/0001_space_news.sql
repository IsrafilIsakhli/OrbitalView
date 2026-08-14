PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  provider_id INTEGER NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('article', 'blog', 'report')),
  source TEXT NOT NULL,
  authors_json TEXT NOT NULL,
  title_original TEXT NOT NULL,
  summary_original TEXT NOT NULL,
  image_url_original TEXT,
  image_cache_key TEXT,
  article_url TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  source_updated_at INTEGER NOT NULL,
  featured INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS news_translations (
  news_id TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('az', 'tr', 'ru', 'es')),
  translated_title TEXT NOT NULL,
  translated_summary TEXT NOT NULL,
  provider TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  translated_at INTEGER NOT NULL,
  PRIMARY KEY (news_id, language),
  FOREIGN KEY (news_id) REFERENCES news_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS news_relations (
  news_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('launch', 'event')),
  external_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  PRIMARY KEY (news_id, relation_type, external_id),
  FOREIGN KEY (news_id) REFERENCES news_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS translation_jobs (
  news_id TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('az', 'tr', 'ru', 'es')),
  source_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'retry', 'failed')),
  priority INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  not_before INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (news_id, language),
  FOREIGN KEY (news_id) REFERENCES news_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS news_sync_state (
  feed_type TEXT PRIMARY KEY,
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  last_provider_updated_at INTEGER,
  backoff_until INTEGER,
  last_error_code TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS news_fts USING fts5(
  news_id UNINDEXED,
  language UNINDEXED,
  title,
  summary,
  tokenize = 'unicode61'
);

CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_source_published ON news_items(source, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_type_published ON news_items(content_type, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_featured_published ON news_items(featured, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_translation_hash ON news_translations(language, source_hash);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_state ON translation_jobs(state, not_before, priority DESC);

PRAGMA user_version = 1;
