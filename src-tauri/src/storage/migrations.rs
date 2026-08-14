use rusqlite::Connection;

const MIGRATION_0001: &str = include_str!("../../migrations/0001_space_news.sql");
const MIGRATION_0002: &str = include_str!("../../migrations/0002_space_news_retry.sql");
const MIGRATION_0003: &str = include_str!("../../migrations/0003_news_relation_lookup.sql");

pub fn run(connection: &Connection) -> Result<(), rusqlite::Error> {
    let version: u32 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version < 1 {
        connection.execute_batch(MIGRATION_0001)?;
    }
    if version < 2 {
        connection.execute_batch(MIGRATION_0002)?;
    }
    if version < 3 {
        connection.execute_batch(MIGRATION_0003)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::run;

    #[test]
    fn migrations_are_idempotent() {
        let connection = Connection::open_in_memory().unwrap();
        run(&connection).unwrap();
        run(&connection).unwrap();
        let version: u32 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 3);
    }
}
