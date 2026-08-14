use crate::domain::runtime::RuntimeInfo;

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
}
