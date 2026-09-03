use tauri::State;

use crate::{
    domain::credentials::{CredentialError, NasaCredentialSource, NasaCredentialStatus},
    providers::nasa::{load_fallback_api_key, normalize_api_key},
    services::credential_store::CredentialStore,
};

use super::nasa::NasaIntelligenceService;

#[tauri::command]
pub fn nasa_credential_status(service: State<'_, NasaIntelligenceService>) -> NasaCredentialStatus {
    service.credential_status()
}

#[tauri::command]
pub async fn set_nasa_credential(
    api_key: String,
    credentials: State<'_, CredentialStore>,
    service: State<'_, NasaIntelligenceService>,
) -> Result<NasaCredentialStatus, CredentialError> {
    let api_key =
        normalize_api_key(&api_key).ok_or_else(|| CredentialError::new("invalid_api_key"))?;
    credentials.set_nasa_key(api_key.clone()).await?;
    service.set_credential(Some(api_key), NasaCredentialSource::CredentialStore);
    crate::services::local_snapshots::clear("nasa");
    Ok(service.credential_status())
}

#[tauri::command]
pub async fn delete_nasa_credential(
    credentials: State<'_, CredentialStore>,
    service: State<'_, NasaIntelligenceService>,
) -> Result<NasaCredentialStatus, CredentialError> {
    credentials.delete_nasa_key().await?;
    if let Some((api_key, source)) = load_fallback_api_key() {
        service.set_credential(Some(api_key), source);
    } else {
        service.set_credential(None, NasaCredentialSource::Unconfigured);
    }
    crate::services::local_snapshots::clear("nasa");
    Ok(service.credential_status())
}

#[tauri::command]
pub async fn verify_nasa_credential(
    service: State<'_, NasaIntelligenceService>,
) -> Result<NasaCredentialStatus, CredentialError> {
    let verified = service.verify_credential().await;
    service.set_credential_verified(verified);
    if verified {
        Ok(service.credential_status())
    } else {
        Err(CredentialError::new("credential_verification_failed"))
    }
}
