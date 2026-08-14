use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NasaCredentialSource {
    CredentialStore,
    Environment,
    Development,
    Unconfigured,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NasaCredentialStatus {
    pub configured: bool,
    pub source: NasaCredentialSource,
    pub verified: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialError {
    pub code: &'static str,
}

impl CredentialError {
    pub const fn new(code: &'static str) -> Self {
        Self { code }
    }
}
