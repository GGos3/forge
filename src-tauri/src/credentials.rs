use std::{
    env, fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri_plugin_stronghold::{kdf::KeyDerivation, stronghold::Stronghold};

const CLIENT_NAME: &[u8] = b"forge-credentials";
const MISSING_CLIENT_ERROR: &str = "no data present";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum Credential {
    Password(String),
    KeyPassphrase(String),
    None,
}

#[derive(Debug, Clone)]
struct StrongholdPaths {
    vault_path: PathBuf,
    salt_path: PathBuf,
}

impl Default for StrongholdPaths {
    fn default() -> Self {
        Self::new(default_credentials_dir())
    }
}

impl StrongholdPaths {
    fn new(root: PathBuf) -> Self {
        Self {
            vault_path: root.join("vault.stronghold"),
            salt_path: root.join("vault.salt"),
        }
    }

    fn ensure_parent_dir(&self) -> Result<(), String> {
        if let Some(parent) = self.vault_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Default)]
struct CredentialStore {
    paths: StrongholdPaths,
}

impl CredentialStore {
    #[cfg(test)]
    fn new(paths: StrongholdPaths) -> Self {
        Self { paths }
    }

    fn store(&self, profile_id: &str, credential: Credential) -> Result<(), String> {
        if matches!(credential, Credential::None) {
            return self.delete(profile_id);
        }

        self.paths.ensure_parent_dir()?;

        let stronghold = self.open_stronghold()?;
        let client = match stronghold.load_client(CLIENT_NAME) {
            Ok(client) => client,
            Err(error) if is_missing_client_error(&error.to_string()) => stronghold
                .create_client(CLIENT_NAME)
                .map_err(|create_error| create_error.to_string())?,
            Err(error) => return Err(error.to_string()),
        };

        let payload = serde_json::to_vec(&credential).map_err(|error| error.to_string())?;
        client
            .store()
            .insert(profile_id.as_bytes().to_vec(), payload, None)
            .map_err(|error| error.to_string())?;
        stronghold.save().map_err(|error| error.to_string())
    }

    fn retrieve(&self, profile_id: &str) -> Result<Option<Credential>, String> {
        if !self.paths.vault_path.exists() {
            return Ok(None);
        }

        let stronghold = self.open_stronghold()?;
        let client = match stronghold.load_client(CLIENT_NAME) {
            Ok(client) => client,
            Err(error) if is_missing_client_error(&error.to_string()) => return Ok(None),
            Err(error) => return Err(error.to_string()),
        };

        let Some(payload) = client
            .store()
            .get(profile_id.as_bytes())
            .map_err(|error| error.to_string())?
        else {
            return Ok(None);
        };

        let credential =
            serde_json::from_slice::<Credential>(&payload).map_err(|error| error.to_string())?;

        if matches!(credential, Credential::None) {
            Ok(None)
        } else {
            Ok(Some(credential))
        }
    }

    fn delete(&self, profile_id: &str) -> Result<(), String> {
        if !self.paths.vault_path.exists() {
            return Ok(());
        }

        let stronghold = self.open_stronghold()?;
        let client = match stronghold.load_client(CLIENT_NAME) {
            Ok(client) => client,
            Err(error) if is_missing_client_error(&error.to_string()) => return Ok(()),
            Err(error) => return Err(error.to_string()),
        };

        client
            .store()
            .delete(profile_id.as_bytes())
            .map_err(|error| error.to_string())?;
        stronghold.save().map_err(|error| error.to_string())
    }

    fn open_stronghold(&self) -> Result<Stronghold, String> {
        self.paths.ensure_parent_dir()?;
        let key = derive_master_key(&self.paths.salt_path);
        Stronghold::new(&self.paths.vault_path, key).map_err(|error| error.to_string())
    }
}

fn default_credentials_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(env::temp_dir)
        .join("forge")
}

fn derive_master_key(salt_path: &Path) -> Vec<u8> {
    KeyDerivation::argon2(&default_master_password_seed(), salt_path)
}

fn default_master_password_seed() -> String {
    let user = env::var("USER")
        .or_else(|_| env::var("USERNAME"))
        .unwrap_or_else(|_| "unknown-user".to_string());
    let home = env::var("HOME").unwrap_or_else(|_| String::new());
    let host = env::var("HOSTNAME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            fs::read_to_string("/etc/hostname")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| "unknown-host".to_string());
    let uid = unsafe { libc::geteuid() };

    format!("forge::{user}::{uid}::{host}::{home}")
}

fn is_missing_client_error(message: &str) -> bool {
    message.contains(MISSING_CLIENT_ERROR)
}

pub(crate) fn stronghold_salt_path() -> PathBuf {
    StrongholdPaths::default().salt_path
}

pub(crate) fn ensure_default_storage_dir() -> Result<(), std::io::Error> {
    if let Some(parent) = stronghold_salt_path().parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

#[tauri::command]
pub fn store_credential(profile_id: String, credential: Credential) -> Result<(), String> {
    CredentialStore::default().store(&profile_id, credential)
}

#[tauri::command]
pub fn retrieve_credential(profile_id: String) -> Result<Option<Credential>, String> {
    CredentialStore::default().retrieve(&profile_id)
}

#[tauri::command]
pub fn delete_credential(profile_id: String) -> Result<(), String> {
    CredentialStore::default().delete(&profile_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(prefix: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos();
            let path = env::temp_dir().join(format!("forge-credentials-{prefix}-{unique}"));
            fs::create_dir_all(&path).expect("test dir should be created");
            Self { path }
        }

        fn store(&self) -> CredentialStore {
            CredentialStore::new(StrongholdPaths::new(self.path.clone()))
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn password_credentials_roundtrip_and_do_not_persist_as_plaintext() {
        let temp = TestDir::new("password");
        let store = temp.store();

        store
            .store(
                "profile-1",
                Credential::Password("correct horse battery staple".to_string()),
            )
            .expect("password credential should store");

        let retrieved = store
            .retrieve("profile-1")
            .expect("password credential should load");
        assert_eq!(
            retrieved,
            Some(Credential::Password(
                "correct horse battery staple".to_string()
            ))
        );

        let snapshot = fs::read(temp.path.join("vault.stronghold"))
            .expect("snapshot should be written after store");
        let snapshot_text = String::from_utf8_lossy(&snapshot);
        assert!(!snapshot_text.contains("correct horse battery staple"));
    }

    #[test]
    fn key_passphrase_credentials_roundtrip() {
        let temp = TestDir::new("key-passphrase");
        let store = temp.store();

        store
            .store(
                "profile-2",
                Credential::KeyPassphrase("top-secret-passphrase".to_string()),
            )
            .expect("key passphrase should store");

        let retrieved = store
            .retrieve("profile-2")
            .expect("key passphrase should load");
        assert_eq!(
            retrieved,
            Some(Credential::KeyPassphrase(
                "top-secret-passphrase".to_string()
            ))
        );
    }

    #[test]
    fn missing_credentials_return_none_and_store_initializes_on_first_write() {
        let temp = TestDir::new("missing");
        let store = temp.store();

        assert_eq!(
            store
                .retrieve("missing-profile")
                .expect("missing returns ok"),
            None
        );
        assert!(!temp.path.join("vault.stronghold").exists());

        store
            .store(
                "missing-profile",
                Credential::Password("secret".to_string()),
            )
            .expect("first write should initialize stronghold snapshot");

        assert!(temp.path.join("vault.stronghold").exists());
        assert!(temp.path.join("vault.salt").exists());
    }

    #[test]
    fn delete_removes_existing_credentials() {
        let temp = TestDir::new("delete");
        let store = temp.store();

        store
            .store("profile-3", Credential::Password("hunter2".to_string()))
            .expect("credential should store");
        store
            .delete("profile-3")
            .expect("delete should succeed for stored credential");

        assert_eq!(
            store
                .retrieve("profile-3")
                .expect("read after delete succeeds"),
            None
        );
    }
}
