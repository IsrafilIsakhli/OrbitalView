use tauri::{AppHandle, Manager, State};

use crate::{
    domain::{news::NewsError, satellite_media::SatelliteObjectMedia},
    providers::satellite_media::SatelliteMediaProvider,
};

#[tauri::command]
pub async fn satellite_object_media(
    app: AppHandle,
    norad_id: String,
    provider: State<'_, SatelliteMediaProvider>,
) -> Result<SatelliteObjectMedia, NewsError> {
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| NewsError::new("image_cache_write", "media cache path unavailable"))?;
    provider.request(app.clone(), cache_root, &norad_id).await
}
