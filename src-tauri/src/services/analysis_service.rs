use crate::{
    domain::analysis::{AnalysisError, GroundStationProfile, SaveGroundStationRequest},
    storage::{analysis_database::AnalysisDatabase, analysis_repository::AnalysisRepository},
};
use std::{path::PathBuf, sync::Arc};

#[derive(Clone)]
pub struct AnalysisService {
    state: Arc<AnalysisServiceState>,
}

enum AnalysisServiceState {
    Available(AnalysisRepository),
    Unavailable,
}

impl AnalysisService {
    pub fn new(path: PathBuf) -> Self {
        let state = match AnalysisDatabase::initialize(path) {
            Ok(database) => AnalysisServiceState::Available(AnalysisRepository::new(database)),
            Err(_) => AnalysisServiceState::Unavailable,
        };
        Self {
            state: Arc::new(state),
        }
    }

    pub async fn ground_stations(&self) -> Result<Vec<GroundStationProfile>, AnalysisError> {
        self.repository()?.list_ground_stations().await
    }

    pub async fn save_ground_station(
        &self,
        request: SaveGroundStationRequest,
    ) -> Result<GroundStationProfile, AnalysisError> {
        self.repository()?.save_ground_station(request).await
    }

    pub async fn delete_ground_station(&self, id: String) -> Result<bool, AnalysisError> {
        self.repository()?.delete_ground_station(id).await
    }

    fn repository(&self) -> Result<&AnalysisRepository, AnalysisError> {
        match self.state.as_ref() {
            AnalysisServiceState::Available(repository) => Ok(repository),
            AnalysisServiceState::Unavailable => Err(AnalysisError::new(
                "analysis_database_unavailable",
                "Orbital analysis storage is unavailable",
            )),
        }
    }
}
