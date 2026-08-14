use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub app_version: String,
    pub architecture: String,
    pub debug_build: bool,
    pub operating_system: String,
}

impl RuntimeInfo {
    pub fn current() -> Self {
        Self {
            app_version: env!("CARGO_PKG_VERSION").to_owned(),
            architecture: std::env::consts::ARCH.to_owned(),
            debug_build: cfg!(debug_assertions),
            operating_system: std::env::consts::OS.to_owned(),
        }
    }
}
