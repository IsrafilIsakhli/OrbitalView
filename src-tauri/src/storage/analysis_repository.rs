use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::{OptionalExtension, params};
use uuid::Uuid;

use crate::domain::analysis::{
    AnalysisError, GroundStationProfile, OrbitalElementSnapshot, RecordOrbitalSnapshotRequest,
    SaveGroundStationRequest, validate_orbital_snapshot, validate_station,
};

use super::analysis_database::AnalysisDatabase;

const MAX_GROUND_STATIONS: i64 = 100;

#[derive(Clone)]
pub struct AnalysisRepository {
    database: AnalysisDatabase,
}

impl AnalysisRepository {
    pub fn new(database: AnalysisDatabase) -> Self {
        Self { database }
    }

    pub async fn list_ground_stations(&self) -> Result<Vec<GroundStationProfile>, AnalysisError> {
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database.connection().map_err(|_| {
                AnalysisError::new(
                    "analysis_database_unavailable",
                    "Analysis storage is unavailable",
                )
            })?;
            let mut statement = connection
                .prepare(
                    "SELECT id, name, latitude_degrees, longitude_degrees, altitude_meters,
                            minimum_elevation_degrees, downlink_frequency_hz, created_at, updated_at
                     FROM analysis_ground_stations ORDER BY name COLLATE NOCASE, created_at",
                )
                .map_err(database_error)?;
            let rows = statement
                .query_map([], station_from_row)
                .map_err(database_error)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
        })
        .await
        .map_err(|_| AnalysisError::new("analysis_task_failed", "Analysis storage task failed"))?
    }

    pub async fn save_ground_station(
        &self,
        request: SaveGroundStationRequest,
    ) -> Result<GroundStationProfile, AnalysisError> {
        validate_station(&request)?;
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database.connection().map_err(|_| {
                AnalysisError::new(
                    "analysis_database_unavailable",
                    "Analysis storage is unavailable",
                )
            })?;
            let id = request
                .id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let existing_created_at: Option<i64> = connection
                .query_row(
                    "SELECT created_at FROM analysis_ground_stations WHERE id = ?1",
                    [&id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(database_error)?;
            if existing_created_at.is_none() {
                let count: i64 = connection
                    .query_row("SELECT COUNT(*) FROM analysis_ground_stations", [], |row| {
                        row.get(0)
                    })
                    .map_err(database_error)?;
                if count >= MAX_GROUND_STATIONS {
                    return Err(AnalysisError::new(
                        "ground_station_limit_reached",
                        "A maximum of 100 ground station profiles is allowed",
                    ));
                }
            }
            let now = Utc::now().timestamp_millis();
            let created_at = existing_created_at.unwrap_or(now);
            connection
                .execute(
                    "INSERT INTO analysis_ground_stations(
                       id, name, latitude_degrees, longitude_degrees, altitude_meters,
                       minimum_elevation_degrees, downlink_frequency_hz, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                     ON CONFLICT(id) DO UPDATE SET
                       name = excluded.name,
                       latitude_degrees = excluded.latitude_degrees,
                       longitude_degrees = excluded.longitude_degrees,
                       altitude_meters = excluded.altitude_meters,
                       minimum_elevation_degrees = excluded.minimum_elevation_degrees,
                       downlink_frequency_hz = excluded.downlink_frequency_hz,
                       updated_at = excluded.updated_at",
                    params![
                        id,
                        request.name.trim(),
                        request.latitude_degrees,
                        request.longitude_degrees,
                        request.altitude_meters,
                        request.minimum_elevation_degrees,
                        request.downlink_frequency_hz,
                        created_at,
                        now,
                    ],
                )
                .map_err(database_error)?;
            Ok(GroundStationProfile {
                id,
                name: request.name.trim().to_owned(),
                latitude_degrees: request.latitude_degrees,
                longitude_degrees: request.longitude_degrees,
                altitude_meters: request.altitude_meters,
                minimum_elevation_degrees: request.minimum_elevation_degrees,
                downlink_frequency_hz: request.downlink_frequency_hz,
                created_at: format_timestamp(created_at),
                updated_at: format_timestamp(now),
            })
        })
        .await
        .map_err(|_| AnalysisError::new("analysis_task_failed", "Analysis storage task failed"))?
    }

    pub async fn delete_ground_station(&self, id: String) -> Result<bool, AnalysisError> {
        if id.trim().is_empty() || id.len() > 64 || id.chars().any(char::is_control) {
            return Err(AnalysisError::new(
                "invalid_station_id",
                "Ground station identifier is invalid",
            ));
        }
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database.connection().map_err(|_| {
                AnalysisError::new(
                    "analysis_database_unavailable",
                    "Analysis storage is unavailable",
                )
            })?;
            connection
                .execute(
                    "DELETE FROM analysis_ground_stations WHERE id = ?1",
                    [id.trim()],
                )
                .map(|changed| changed > 0)
                .map_err(database_error)
        })
        .await
        .map_err(|_| AnalysisError::new("analysis_task_failed", "Analysis storage task failed"))?
    }

    pub async fn record_orbital_snapshot(
        &self,
        request: RecordOrbitalSnapshotRequest,
    ) -> Result<OrbitalElementSnapshot, AnalysisError> {
        validate_orbital_snapshot(&request)?;
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database.connection().map_err(|_| {
                AnalysisError::new(
                    "analysis_database_unavailable",
                    "Analysis storage is unavailable",
                )
            })?;
            let captured_at = Utc::now().timestamp_millis();
            connection
                .execute(
                    "INSERT INTO analysis_orbital_snapshots(
                   norad_id, source_epoch, captured_at, mean_motion, eccentricity,
                   inclination_degrees, raan_degrees, argument_perigee_degrees,
                   mean_anomaly_degrees, bstar, perigee_km, apogee_km
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT(norad_id, source_epoch) DO UPDATE SET
                   mean_motion = excluded.mean_motion,
                   eccentricity = excluded.eccentricity,
                   inclination_degrees = excluded.inclination_degrees,
                   raan_degrees = excluded.raan_degrees,
                   argument_perigee_degrees = excluded.argument_perigee_degrees,
                   mean_anomaly_degrees = excluded.mean_anomaly_degrees,
                   bstar = excluded.bstar,
                   perigee_km = excluded.perigee_km,
                   apogee_km = excluded.apogee_km",
                    params![
                        request.norad_id,
                        request.source_epoch_unix_ms,
                        captured_at,
                        request.mean_motion,
                        request.eccentricity,
                        request.inclination_degrees,
                        request.raan_degrees,
                        request.argument_perigee_degrees,
                        request.mean_anomaly_degrees,
                        request.bstar,
                        request.perigee_km,
                        request.apogee_km,
                    ],
                )
                .map_err(database_error)?;
            connection
                .execute(
                    "DELETE FROM analysis_orbital_snapshots
                 WHERE captured_at < ?1 OR rowid IN (
                   SELECT rowid FROM analysis_orbital_snapshots
                   WHERE norad_id = ?2 ORDER BY source_epoch DESC LIMIT -1 OFFSET 2048
                 )",
                    params![captured_at - 365_i64 * 86_400_000, request.norad_id],
                )
                .map_err(database_error)?;
            Ok(snapshot_from_request(request, captured_at))
        })
        .await
        .map_err(|_| AnalysisError::new("analysis_task_failed", "Analysis storage task failed"))?
    }

    pub async fn orbital_history(
        &self,
        norad_id: String,
        limit: u16,
    ) -> Result<Vec<OrbitalElementSnapshot>, AnalysisError> {
        if norad_id.is_empty()
            || norad_id.len() > 6
            || !norad_id.chars().all(|character| character.is_ascii_digit())
        {
            return Err(AnalysisError::new(
                "invalid_norad_id",
                "NORAD identifier is invalid",
            ));
        }
        let limit = i64::from(limit.clamp(2, 1024));
        let database = self.database.clone();
        tokio::task::spawn_blocking(move || {
            let connection = database.connection().map_err(|_| {
                AnalysisError::new(
                    "analysis_database_unavailable",
                    "Analysis storage is unavailable",
                )
            })?;
            let mut statement = connection
                .prepare(
                    "SELECT norad_id, source_epoch, captured_at, mean_motion, eccentricity,
                            inclination_degrees, raan_degrees, argument_perigee_degrees,
                            mean_anomaly_degrees, bstar, perigee_km, apogee_km
                     FROM (
                       SELECT * FROM analysis_orbital_snapshots WHERE norad_id = ?1
                       ORDER BY source_epoch DESC LIMIT ?2
                     ) ORDER BY source_epoch ASC",
                )
                .map_err(database_error)?;
            let rows = statement
                .query_map(params![norad_id, limit], snapshot_from_row)
                .map_err(database_error)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
        })
        .await
        .map_err(|_| AnalysisError::new("analysis_task_failed", "Analysis storage task failed"))?
    }
}

fn snapshot_from_request(
    request: RecordOrbitalSnapshotRequest,
    captured_at_unix_ms: i64,
) -> OrbitalElementSnapshot {
    OrbitalElementSnapshot {
        norad_id: request.norad_id,
        source_epoch_unix_ms: request.source_epoch_unix_ms,
        captured_at_unix_ms,
        mean_motion: request.mean_motion,
        eccentricity: request.eccentricity,
        inclination_degrees: request.inclination_degrees,
        raan_degrees: request.raan_degrees,
        argument_perigee_degrees: request.argument_perigee_degrees,
        mean_anomaly_degrees: request.mean_anomaly_degrees,
        bstar: request.bstar,
        perigee_km: request.perigee_km,
        apogee_km: request.apogee_km,
    }
}

fn snapshot_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<OrbitalElementSnapshot> {
    Ok(OrbitalElementSnapshot {
        norad_id: row.get(0)?,
        source_epoch_unix_ms: row.get(1)?,
        captured_at_unix_ms: row.get(2)?,
        mean_motion: row.get(3)?,
        eccentricity: row.get(4)?,
        inclination_degrees: row.get(5)?,
        raan_degrees: row.get(6)?,
        argument_perigee_degrees: row.get(7)?,
        mean_anomaly_degrees: row.get(8)?,
        bstar: row.get(9)?,
        perigee_km: row.get(10)?,
        apogee_km: row.get(11)?,
    })
}

fn station_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GroundStationProfile> {
    let created_at: i64 = row.get(7)?;
    let updated_at: i64 = row.get(8)?;
    Ok(GroundStationProfile {
        id: row.get(0)?,
        name: row.get(1)?,
        latitude_degrees: row.get(2)?,
        longitude_degrees: row.get(3)?,
        altitude_meters: row.get(4)?,
        minimum_elevation_degrees: row.get(5)?,
        downlink_frequency_hz: row.get(6)?,
        created_at: format_timestamp(created_at),
        updated_at: format_timestamp(updated_at),
    })
}

fn format_timestamp(value: i64) -> String {
    DateTime::<Utc>::from_timestamp_millis(value)
        .unwrap_or(DateTime::<Utc>::UNIX_EPOCH)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn database_error(_error: rusqlite::Error) -> AnalysisError {
    AnalysisError::new(
        "analysis_database_error",
        "Analysis storage operation failed",
    )
}

#[cfg(test)]
mod tests {
    use super::AnalysisRepository;
    use crate::{
        domain::analysis::{RecordOrbitalSnapshotRequest, SaveGroundStationRequest},
        storage::analysis_database::AnalysisDatabase,
    };

    fn request(name: &str) -> SaveGroundStationRequest {
        SaveGroundStationRequest {
            id: None,
            name: name.to_owned(),
            latitude_degrees: 40.4093,
            longitude_degrees: 49.8671,
            altitude_meters: 28.0,
            minimum_elevation_degrees: 10.0,
            downlink_frequency_hz: Some(145_800_000.0),
        }
    }

    #[tokio::test]
    async fn migration_is_idempotent_and_crud_round_trips() {
        let root = std::env::temp_dir().join(format!("orbital-analysis-{}", uuid::Uuid::new_v4()));
        let path = root.join("analysis.sqlite3");
        let repository =
            AnalysisRepository::new(AnalysisDatabase::initialize(path.clone()).unwrap());
        let saved = repository
            .save_ground_station(request("Baku"))
            .await
            .unwrap();
        assert_eq!(repository.list_ground_stations().await.unwrap().len(), 1);
        drop(repository);
        let repository = AnalysisRepository::new(AnalysisDatabase::initialize(path).unwrap());
        assert!(repository.delete_ground_station(saved.id).await.unwrap());
        assert!(repository.list_ground_stations().await.unwrap().is_empty());
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn ground_station_limit_is_enforced() {
        let root = std::env::temp_dir().join(format!("orbital-analysis-{}", uuid::Uuid::new_v4()));
        let path = root.join("analysis.sqlite3");
        let repository = AnalysisRepository::new(AnalysisDatabase::initialize(path).unwrap());

        for index in 0..100 {
            repository
                .save_ground_station(request(&format!("Station {index}")))
                .await
                .unwrap();
        }

        let error = repository
            .save_ground_station(request("Station 101"))
            .await
            .unwrap_err();
        assert_eq!(error.code, "ground_station_limit_reached");
        assert_eq!(repository.list_ground_stations().await.unwrap().len(), 100);
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn orbital_history_deduplicates_source_epochs_and_stays_chronological() {
        let root = std::env::temp_dir().join(format!("orbital-analysis-{}", uuid::Uuid::new_v4()));
        let repository = AnalysisRepository::new(
            AnalysisDatabase::initialize(root.join("analysis.sqlite3")).unwrap(),
        );
        for epoch in [2_000_i64, 1_000, 2_000] {
            repository
                .record_orbital_snapshot(RecordOrbitalSnapshotRequest {
                    norad_id: "25544".to_owned(),
                    source_epoch_unix_ms: epoch,
                    mean_motion: 15.5,
                    eccentricity: 0.0002,
                    inclination_degrees: 51.64,
                    raan_degrees: 20.0,
                    argument_perigee_degrees: 30.0,
                    mean_anomaly_degrees: 40.0,
                    bstar: Some(0.0001),
                    perigee_km: Some(410.0),
                    apogee_km: Some(420.0),
                })
                .await
                .unwrap();
        }
        let history = repository
            .orbital_history("25544".to_owned(), 512)
            .await
            .unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].source_epoch_unix_ms, 1_000);
        assert_eq!(history[1].source_epoch_unix_ms, 2_000);
        let _ = std::fs::remove_dir_all(root);
    }
}
