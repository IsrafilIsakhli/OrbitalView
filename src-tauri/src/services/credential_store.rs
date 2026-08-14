use keyring::Entry;
use tokio::sync::Mutex;

use crate::domain::credentials::CredentialError;

const CREDENTIAL_SERVICE: &str = "com.orbitalvision.desktop";
const NASA_CREDENTIAL_USER: &str = "NASA_API_KEY";

pub struct CredentialStore {
    gate: Mutex<()>,
}

impl Default for CredentialStore {
    fn default() -> Self {
        Self {
            gate: Mutex::new(()),
        }
    }
}

impl CredentialStore {
    pub fn read_initial_nasa_key() -> Option<String> {
        read_nasa_key_sync().ok().flatten()
    }

    pub async fn set_nasa_key(&self, api_key: String) -> Result<(), CredentialError> {
        let _guard = self.gate.lock().await;
        tokio::task::spawn_blocking(move || {
            Entry::new(CREDENTIAL_SERVICE, NASA_CREDENTIAL_USER)
                .map_err(|_| CredentialError::new("credential_store_unavailable"))?
                .set_password(&api_key)
                .map_err(|_| CredentialError::new("credential_store_write"))
        })
        .await
        .map_err(|_| CredentialError::new("credential_store_task"))?
    }

    pub async fn delete_nasa_key(&self) -> Result<(), CredentialError> {
        let _guard = self.gate.lock().await;
        tokio::task::spawn_blocking(move || {
            let entry = Entry::new(CREDENTIAL_SERVICE, NASA_CREDENTIAL_USER)
                .map_err(|_| CredentialError::new("credential_store_unavailable"))?;
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(_) => Err(CredentialError::new("credential_store_delete")),
            }
        })
        .await
        .map_err(|_| CredentialError::new("credential_store_task"))?
    }
}

fn read_nasa_key_sync() -> Result<Option<String>, CredentialError> {
    let entry = Entry::new(CREDENTIAL_SERVICE, NASA_CREDENTIAL_USER)
        .map_err(|_| CredentialError::new("credential_store_unavailable"))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(CredentialError::new("credential_store_read")),
    }
}

#[cfg(test)]
mod tests {
    use super::{CREDENTIAL_SERVICE, NASA_CREDENTIAL_USER};

    #[test]
    fn credential_identifiers_are_fixed_and_non_secret() {
        assert_eq!(CREDENTIAL_SERVICE, "com.orbitalvision.desktop");
        assert_eq!(NASA_CREDENTIAL_USER, "NASA_API_KEY");
    }
}
