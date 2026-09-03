use super::{
    control_center::OperationsService, launches::LaunchIntelligenceService,
    nasa::NasaIntelligenceService, noaa::NoaaSpaceWeatherService,
    satellites::SatelliteCatalogService,
};
use crate::domain::runtime::RuntimeInfo;
use crate::services::news_service::NewsService;
use tauri::{AppHandle, Manager};

static PREVIOUS_SYNC: std::sync::Mutex<Option<bool>> = std::sync::Mutex::new(None);

pub(crate) fn update_preparing() -> bool {
    PREVIOUS_SYNC.lock().map_or(true, |state| state.is_some())
}

#[tauri::command]
pub async fn prepare_app_update(app: AppHandle) -> Result<(), &'static str> {
    let operations = app.state::<OperationsService>();
    {
        let mut previous = PREVIOUS_SYNC.lock().map_err(|_| "update_busy")?;
        if previous.is_some() {
            return Err("update_busy");
        }
        *previous = Some(operations.background_sync_enabled());
    }
    operations.set_background_sync(false);
    let satellites = app.state::<SatelliteCatalogService>();
    let launches = app.state::<LaunchIntelligenceService>();
    let nasa = app.state::<NasaIntelligenceService>();
    let noaa = app.state::<NoaaSpaceWeatherService>();
    let news = app.state::<NewsService>();
    // Finish in-flight atomic cache/translation writes; a busy provider aborts installation.
    let drained = tokio::time::timeout(std::time::Duration::from_secs(30), async {
        let _satellites = satellites.request_gate.lock().await;
        let _launches = launches.request_gate.lock().await;
        let _weather = launches.weather_gate.lock().await;
        let _nasa = nasa.request_gate.lock().await;
        let _noaa = noaa.request_gate.lock().await;
        news.drain_background_writes().await;
    })
    .await;
    if drained.is_err() {
        resume_after_failed_update(app);
        return Err("update_writes_busy");
    }
    Ok(())
}

#[tauri::command]
pub fn resume_after_failed_update(app: AppHandle) {
    if let Ok(mut previous) = PREVIOUS_SYNC.lock()
        && let Some(enabled) = previous.take()
    {
        app.state::<OperationsService>()
            .set_background_sync(enabled);
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCapability {
    automatic: bool,
    package_kind: &'static str,
    architecture: &'static str,
    target: String,
}

#[tauri::command]
pub fn app_update_capability() -> UpdateCapability {
    update_capability(
        std::env::consts::OS,
        std::env::consts::ARCH,
        option_env!("ORBITAL_PACKAGE_KIND").unwrap_or("unknown"),
        std::env::var_os("APPIMAGE").is_some(),
    )
}

fn update_capability(
    os: &'static str,
    arch: &'static str,
    kind: &'static str,
    appimage: bool,
) -> UpdateCapability {
    let supported_arch = matches!(arch, "x86_64" | "aarch64");
    let automatic = supported_arch
        && match os {
            "windows" => arch == "x86_64" && matches!(kind, "nsis" | "msi"),
            "macos" => kind == "dmg",
            "linux" => kind == "appimage" && appimage,
            _ => false,
        };
    let target = match os {
        "windows" => format!("windows-{arch}-{kind}"),
        "macos" => format!("darwin-{arch}"),
        _ => format!("{os}-{arch}"),
    };
    UpdateCapability {
        automatic,
        package_kind: kind,
        architecture: arch,
        target,
    }
}

#[tauri::command]
pub fn runtime_info() -> RuntimeInfo {
    RuntimeInfo::current()
}

#[cfg(test)]
mod tests {
    use super::runtime_info;

    #[test]
    fn runtime_info_reports_the_compiled_application_version() {
        let info = runtime_info();
        assert_eq!(info.app_version, env!("CARGO_PKG_VERSION"));
        assert!(!info.architecture.is_empty());
        assert!(!info.operating_system.is_empty());
    }

    #[test]
    fn updates_preserve_installer_kind_and_architecture() {
        let msi = super::update_capability("windows", "x86_64", "msi", false);
        assert!(msi.automatic);
        assert_eq!(msi.target, "windows-x86_64-msi");
        assert!(!super::update_capability("windows", "x86_64", "unknown", false).automatic);
        assert!(super::update_capability("linux", "aarch64", "appimage", true).automatic);
        assert!(!super::update_capability("linux", "x86_64", "deb", false).automatic);
        assert!(!super::update_capability("linux", "aarch64", "rpm", false).automatic);
        assert!(!super::update_capability("linux", "x86_64", "appimage", false).automatic);
    }
}
