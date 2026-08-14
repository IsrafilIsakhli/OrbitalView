CREATE TABLE IF NOT EXISTS analysis_schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_ground_stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude_degrees REAL NOT NULL,
  longitude_degrees REAL NOT NULL,
  altitude_meters REAL NOT NULL,
  minimum_elevation_degrees REAL NOT NULL,
  downlink_frequency_hz REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_preferences (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO analysis_schema_migrations(version, applied_at)
VALUES (1, unixepoch() * 1000);
