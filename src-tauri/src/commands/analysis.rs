use std::{fs, path::PathBuf};

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::{
    domain::analysis::{
        AnalysisError, AnalysisExportRequest, AnalysisExportResult, GroundStationProfile,
        SaveGroundStationRequest,
    },
    services::analysis_service::AnalysisService,
};

const MAX_EXPORT_BYTES: usize = 16 * 1024 * 1024;

#[tauri::command]
pub async fn analysis_ground_stations(
    service: State<'_, AnalysisService>,
) -> Result<Vec<GroundStationProfile>, AnalysisError> {
    service.ground_stations().await
}

#[tauri::command]
pub async fn save_analysis_ground_station(
    request: SaveGroundStationRequest,
    service: State<'_, AnalysisService>,
) -> Result<GroundStationProfile, AnalysisError> {
    service.save_ground_station(request).await
}

#[tauri::command]
pub async fn delete_analysis_ground_station(
    id: String,
    service: State<'_, AnalysisService>,
) -> Result<bool, AnalysisError> {
    service.delete_ground_station(id).await
}

#[tauri::command]
pub async fn export_orbital_analysis(
    app: AppHandle,
    request: AnalysisExportRequest,
) -> Result<AnalysisExportResult, AnalysisError> {
    if request.content.len() > MAX_EXPORT_BYTES {
        return Err(AnalysisError::new(
            "analysis_export_too_large",
            "Analysis export exceeds the 16 MB limit",
        ));
    }
    if matches!(
        request.format,
        crate::domain::analysis::AnalysisExportFormat::Json
    ) && serde_json::from_str::<serde_json::Value>(&request.content).is_err()
    {
        return Err(AnalysisError::new(
            "invalid_analysis_export",
            "Analysis JSON export is malformed",
        ));
    }

    let extension = request.format.extension();
    let suggested_name = sanitize_file_name(&request.suggested_name, extension);
    let content = request.content;
    let filter_name = request.format.filter_name();
    tokio::task::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Export Orbital Analysis")
            .set_file_name(suggested_name)
            .add_filter(filter_name, &[extension])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(AnalysisExportResult {
                saved: false,
                path: None,
            });
        };
        let path = selected.into_path().map_err(|_| {
            AnalysisError::new("invalid_export_path", "The selected export path is invalid")
        })?;
        write_export(&path, content.as_bytes())?;
        Ok(AnalysisExportResult {
            saved: true,
            path: Some(path.to_string_lossy().into_owned()),
        })
    })
    .await
    .map_err(|_| AnalysisError::new("analysis_task_failed", "Analysis export task failed"))?
}

fn sanitize_file_name(value: &str, extension: &str) -> String {
    let stem = value
        .trim()
        .chars()
        .filter(|character| {
            !character.is_control()
                && !matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
        })
        .take(96)
        .collect::<String>()
        .trim_matches([' ', '.'])
        .to_owned();
    let stem = if stem.is_empty() {
        "orbital-analysis".to_owned()
    } else {
        stem.trim_end_matches(&format!(".{extension}")).to_owned()
    };
    format!("{stem}.{extension}")
}

fn write_export(path: &PathBuf, content: &[u8]) -> Result<(), AnalysisError> {
    if let Some(parent) = path.parent()
        && !parent.exists()
    {
        return Err(AnalysisError::new(
            "invalid_export_path",
            "The selected export directory does not exist",
        ));
    }
    fs::write(path, content).map_err(|_| {
        AnalysisError::new(
            "analysis_export_failed",
            "Analysis export could not be written",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::sanitize_file_name;

    #[test]
    fn export_file_name_is_sanitized_and_extended() {
        assert_eq!(
            sanitize_file_name("ISS: dynamics?.csv", "csv"),
            "ISS dynamics.csv"
        );
        assert_eq!(sanitize_file_name("", "json"), "orbital-analysis.json");
    }
}
