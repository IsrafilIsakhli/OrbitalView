use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{OnceLock, RwLock},
};

static SNAPSHOTS: OnceLock<RwLock<HashMap<String, Value>>> = OnceLock::new();

pub fn publish(provider: &str, payload: &impl Serialize) {
    if let Ok(value) = serde_json::to_value(payload)
        && let Ok(mut snapshots) = SNAPSHOTS.get_or_init(Default::default).write()
    {
        snapshots.insert(provider.to_owned(), value);
    }
}

#[tauri::command]
pub fn provider_cached_snapshot(provider: String) -> Option<Value> {
    SNAPSHOTS
        .get_or_init(Default::default)
        .read()
        .ok()?
        .get(&provider)
        .cloned()
}

pub fn clear(provider: &str) {
    if let Ok(mut snapshots) = SNAPSHOTS.get_or_init(Default::default).write() {
        snapshots.remove(provider);
        if provider == "openMeteo" {
            snapshots.retain(|key, _| !key.starts_with("weather:"));
        }
    }
}
