use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{
    domain::news::NewsError,
    providers::remote_media::{RemoteMediaProvider, RemoteMediaScope},
};

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RemoteMediaProviderId {
    LaunchLibrary,
    Nasa,
}

impl From<RemoteMediaProviderId> for RemoteMediaScope {
    fn from(value: RemoteMediaProviderId) -> Self {
        match value {
            RemoteMediaProviderId::LaunchLibrary => Self::LaunchLibrary,
            RemoteMediaProviderId::Nasa => Self::Nasa,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMediaPayload {
    pub cached_path: String,
}

#[tauri::command]
pub async fn cache_remote_media(
    app: AppHandle,
    provider: RemoteMediaProviderId,
    url: String,
    media: State<'_, RemoteMediaProvider>,
) -> Result<RemoteMediaPayload, NewsError> {
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| NewsError::new("image_cache_write", "media cache path unavailable"))?;
    Ok(RemoteMediaPayload {
        cached_path: media.cache(&url, provider.into(), &cache_root).await?,
    })
}
