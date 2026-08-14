use std::{fs, path::PathBuf};

use serde::{Serialize, de::DeserializeOwned};

pub struct ProviderHealthStore {
    path: PathBuf,
}

impl ProviderHealthStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load<T>(&self) -> Option<T>
    where
        T: DeserializeOwned,
    {
        serde_json::from_slice(&fs::read(&self.path).ok()?).ok()
    }

    pub fn save<T>(&self, value: &T)
    where
        T: Serialize,
    {
        let Ok(bytes) = serde_json::to_vec(value) else {
            return;
        };
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let temporary = self.path.with_extension("json.tmp");
        let backup = self.path.with_extension("json.backup");
        if fs::write(&temporary, bytes).is_err() {
            return;
        }
        let had_existing = self.path.is_file();
        if had_existing {
            let _ = fs::remove_file(&backup);
            if fs::rename(&self.path, &backup).is_err() {
                let _ = fs::remove_file(&temporary);
                return;
            }
        }
        if fs::rename(&temporary, &self.path).is_ok() {
            let _ = fs::remove_file(backup);
        } else {
            let _ = fs::remove_file(temporary);
            if had_existing {
                let _ = fs::rename(backup, &self.path);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::ProviderHealthStore;

    #[test]
    fn persists_and_reloads_small_operational_snapshots() {
        let path = std::env::temp_dir().join(format!(
            "orbital-vision-health-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let store = ProviderHealthStore::new(path.clone());
        let expected = BTreeMap::from([("nasa", 42_u64)]);
        store.save(&expected);
        assert_eq!(
            store.load::<BTreeMap<String, u64>>(),
            Some(BTreeMap::from([("nasa".to_owned(), 42)]))
        );
        let _ = std::fs::remove_file(path);
    }
}
