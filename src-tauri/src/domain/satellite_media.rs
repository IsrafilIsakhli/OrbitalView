use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SatelliteMediaState {
    Available,
    Pending,
    Unavailable,
    Disabled,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SatelliteObjectMedia {
    pub norad_id: String,
    pub state: SatelliteMediaState,
    pub cached_path: Option<String>,
    pub commons_page_url: Option<String>,
    pub creator: Option<String>,
    pub license_name: Option<String>,
    pub license_url: Option<String>,
    pub fetched_at_unix_ms: Option<u64>,
}

impl SatelliteObjectMedia {
    pub fn pending(norad_id: String) -> Self {
        Self {
            norad_id,
            state: SatelliteMediaState::Pending,
            cached_path: None,
            commons_page_url: None,
            creator: None,
            license_name: None,
            license_url: None,
            fetched_at_unix_ms: None,
        }
    }

    pub fn disabled(norad_id: String) -> Self {
        Self {
            state: SatelliteMediaState::Disabled,
            ..Self::pending(norad_id)
        }
    }

    pub fn unavailable(norad_id: String, fetched_at_unix_ms: u64) -> Self {
        Self {
            fetched_at_unix_ms: Some(fetched_at_unix_ms),
            state: SatelliteMediaState::Unavailable,
            ..Self::pending(norad_id)
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SatelliteMediaUpdated {
    pub norad_id: String,
}
