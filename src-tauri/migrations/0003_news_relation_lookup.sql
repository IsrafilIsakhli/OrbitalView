CREATE INDEX IF NOT EXISTS idx_news_relations_lookup
ON news_relations(relation_type, external_id, news_id);

PRAGMA user_version = 3;
