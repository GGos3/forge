use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::types::SshConnectionProfile;

const STORE_FILE_NAME: &str = "connections.json";
const APP_CONFIG_DIR_NAME: &str = "forge";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct StorePayload {
    profiles: Vec<SshConnectionProfile>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConnectionStoreError {
    ConfigDirUnavailable,
    Io(String),
    Serde(String),
    ProfileNotFound(String),
}

impl std::fmt::Display for ConnectionStoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ConfigDirUnavailable => write!(f, "config directory is unavailable"),
            Self::Io(err) => write!(f, "io error: {err}"),
            Self::Serde(err) => write!(f, "serialization error: {err}"),
            Self::ProfileNotFound(id) => write!(f, "connection profile not found: {id}"),
        }
    }
}

impl std::error::Error for ConnectionStoreError {}

pub struct ConnectionStore {
    path: PathBuf,
}

impl ConnectionStore {
    pub fn new() -> Result<Self, ConnectionStoreError> {
        let config_dir = dirs::config_dir().ok_or(ConnectionStoreError::ConfigDirUnavailable)?;
        Ok(Self::with_path(
            config_dir.join(APP_CONFIG_DIR_NAME).join(STORE_FILE_NAME),
        ))
    }

    pub fn with_path(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn list_profiles(&self) -> Result<Vec<SshConnectionProfile>, ConnectionStoreError> {
        self.read_payload().map(|payload| payload.profiles)
    }

    #[allow(dead_code)]
    pub fn get_profile(
        &self,
        id: &str,
    ) -> Result<Option<SshConnectionProfile>, ConnectionStoreError> {
        let profiles = self.list_profiles()?;
        Ok(profiles.into_iter().find(|profile| profile.id == id))
    }

    pub fn upsert_profile(
        &self,
        profile: SshConnectionProfile,
    ) -> Result<(), ConnectionStoreError> {
        let mut payload = self.read_payload()?;
        if let Some(existing) = payload
            .profiles
            .iter_mut()
            .find(|existing| existing.id == profile.id)
        {
            *existing = profile;
        } else {
            payload.profiles.push(profile);
        }

        self.write_payload(&payload)
    }

    pub fn delete_profile(&self, id: &str) -> Result<(), ConnectionStoreError> {
        let mut payload = self.read_payload()?;
        let initial_len = payload.profiles.len();
        payload.profiles.retain(|profile| profile.id != id);

        if payload.profiles.len() == initial_len {
            return Err(ConnectionStoreError::ProfileNotFound(id.to_string()));
        }

        self.write_payload(&payload)
    }

    fn read_payload(&self) -> Result<StorePayload, ConnectionStoreError> {
        if !self.path.exists() {
            return Ok(StorePayload {
                profiles: Vec::new(),
            });
        }

        let raw =
            fs::read_to_string(&self.path).map_err(|e| ConnectionStoreError::Io(e.to_string()))?;
        serde_json::from_str(&raw).map_err(|e| ConnectionStoreError::Serde(e.to_string()))
    }

    fn write_payload(&self, payload: &StorePayload) -> Result<(), ConnectionStoreError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| ConnectionStoreError::Io(e.to_string()))?;
        }

        let serialized = serde_json::to_string_pretty(payload)
            .map_err(|e| ConnectionStoreError::Serde(e.to_string()))?;
        fs::write(&self.path, serialized).map_err(|e| ConnectionStoreError::Io(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::SshAuthMethod;
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
            let path =
                std::env::temp_dir().join(format!("forge-connection-store-{prefix}-{unique}"));
            fs::create_dir_all(&path).expect("test dir should be created");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn sample_profile(id: &str, host: &str) -> SshConnectionProfile {
        SshConnectionProfile {
            id: id.to_string(),
            name: format!("Profile {id}"),
            host: host.to_string(),
            port: 22,
            username: "forge".to_string(),
            auth_method: SshAuthMethod::Password,
            key_path: None,
            group: None,
            color: None,
        }
    }

    #[test]
    fn list_profiles_returns_empty_when_store_file_absent() {
        let dir = TestDir::new("empty");
        let store = ConnectionStore::with_path(dir.path.join("ssh-connections.json"));

        let profiles = store.list_profiles().expect("list should succeed");
        assert!(profiles.is_empty());
    }

    #[test]
    fn upsert_and_get_profile_roundtrip() {
        let dir = TestDir::new("upsert-get");
        let store = ConnectionStore::with_path(dir.path.join("ssh-connections.json"));
        let profile = sample_profile("profile-1", "example.com");

        store
            .upsert_profile(profile.clone())
            .expect("upsert should succeed");

        let fetched = store
            .get_profile("profile-1")
            .expect("get should succeed")
            .expect("profile should exist");
        assert_eq!(fetched, profile);
    }

    #[test]
    fn upsert_replaces_existing_profile_with_same_id() {
        let dir = TestDir::new("replace");
        let store = ConnectionStore::with_path(dir.path.join("ssh-connections.json"));

        store
            .upsert_profile(sample_profile("profile-1", "old-host"))
            .expect("first upsert should succeed");
        store
            .upsert_profile(sample_profile("profile-1", "new-host"))
            .expect("second upsert should succeed");

        let profiles = store.list_profiles().expect("list should succeed");
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].host, "new-host");
    }

    #[test]
    fn delete_profile_removes_entry() {
        let dir = TestDir::new("delete");
        let store = ConnectionStore::with_path(dir.path.join("ssh-connections.json"));

        store
            .upsert_profile(sample_profile("profile-1", "example.com"))
            .expect("upsert should succeed");
        store
            .delete_profile("profile-1")
            .expect("delete should succeed");

        let profiles = store.list_profiles().expect("list should succeed");
        assert!(profiles.is_empty());
    }

    #[test]
    fn delete_profile_returns_not_found_for_unknown_id() {
        let dir = TestDir::new("not-found");
        let store = ConnectionStore::with_path(dir.path.join("ssh-connections.json"));

        let error = store
            .delete_profile("missing")
            .expect_err("delete should fail for unknown id");
        assert_eq!(
            error,
            ConnectionStoreError::ProfileNotFound("missing".to_string())
        );
    }
}
