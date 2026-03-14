use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const KNOWN_HOSTS_FILE: &str = "known_hosts";
const APP_CONFIG_DIR_NAME: &str = "forge";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct KnownHostsPayload {
    hosts: HashMap<String, String>, // "host:port" -> "fingerprint"
}

#[derive(Debug, Clone)]
pub struct KnownHostsStore {
    path: PathBuf,
}

impl KnownHostsStore {
    pub fn new() -> Result<Self, String> {
        let config_dir = dirs::config_dir().ok_or("config directory is unavailable")?;
        Ok(Self::with_path(
            config_dir.join(APP_CONFIG_DIR_NAME).join(KNOWN_HOSTS_FILE),
        ))
    }

    pub fn with_path(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn get_fingerprint(&self, host_port: &str) -> Result<Option<String>, String> {
        let payload = self.read_payload()?;
        Ok(payload.hosts.get(host_port).cloned())
    }

    pub fn save_fingerprint(&self, host_port: &str, fingerprint: &str) -> Result<(), String> {
        let mut payload = self.read_payload()?;
        payload
            .hosts
            .insert(host_port.to_string(), fingerprint.to_string());
        self.write_payload(&payload)
    }

    fn read_payload(&self) -> Result<KnownHostsPayload, String> {
        if !self.path.exists() {
            return Ok(KnownHostsPayload {
                hosts: HashMap::new(),
            });
        }
        let raw = fs::read_to_string(&self.path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    }

    fn write_payload(&self, payload: &KnownHostsPayload) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let serialized = serde_json::to_string_pretty(payload).map_err(|e| e.to_string())?;
        fs::write(&self.path, serialized).map_err(|e| e.to_string())
    }
}
