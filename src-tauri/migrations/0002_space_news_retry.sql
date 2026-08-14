ALTER TABLE news_sync_state ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;

PRAGMA user_version = 2;
