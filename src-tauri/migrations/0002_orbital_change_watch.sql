CREATE TABLE IF NOT EXISTS analysis_orbital_snapshots (
  norad_id TEXT NOT NULL,
  source_epoch INTEGER NOT NULL,
  captured_at INTEGER NOT NULL,
  mean_motion REAL NOT NULL,
  eccentricity REAL NOT NULL,
  inclination_degrees REAL NOT NULL,
  raan_degrees REAL NOT NULL,
  argument_perigee_degrees REAL NOT NULL,
  mean_anomaly_degrees REAL NOT NULL,
  bstar REAL,
  perigee_km REAL,
  apogee_km REAL,
  PRIMARY KEY (norad_id, source_epoch)
);

CREATE INDEX IF NOT EXISTS idx_analysis_orbital_snapshots_history
ON analysis_orbital_snapshots(norad_id, source_epoch DESC);

INSERT OR IGNORE INTO analysis_schema_migrations(version, applied_at)
VALUES (2, unixepoch() * 1000);
