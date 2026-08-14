use std::{fs, path::PathBuf, sync::Arc, time::Duration};

use r2d2::{Pool, PooledConnection};
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::OpenFlags;

use super::migrations;

#[derive(Clone)]
pub struct NewsDatabase {
    path: PathBuf,
    pool: Arc<Pool<SqliteConnectionManager>>,
}

impl NewsDatabase {
    pub fn initialize(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let manager = SqliteConnectionManager::file(&path)
            .with_flags(
                OpenFlags::SQLITE_OPEN_READ_WRITE
                    | OpenFlags::SQLITE_OPEN_CREATE
                    | OpenFlags::SQLITE_OPEN_NO_MUTEX,
            )
            .with_init(|connection| {
                connection.busy_timeout(Duration::from_secs(3))?;
                connection.pragma_update(None, "foreign_keys", "ON")?;
                connection.pragma_update(None, "journal_mode", "WAL")?;
                connection.pragma_update(None, "synchronous", "NORMAL")?;
                Ok(())
            });
        let pool = Pool::builder()
            .max_size(4)
            .min_idle(Some(1))
            .connection_timeout(Duration::from_secs(3))
            .build(manager)
            .map_err(|error| error.to_string())?;
        let database = Self {
            path,
            pool: Arc::new(pool),
        };
        let connection = database.connection().map_err(|error| error.to_string())?;
        migrations::run(&connection).map_err(|error| error.to_string())?;
        Ok(database)
    }

    pub(crate) fn connection(
        &self,
    ) -> Result<PooledConnection<SqliteConnectionManager>, r2d2::Error> {
        self.pool.get()
    }

    pub fn path(&self) -> PathBuf {
        self.path.clone()
    }
}
