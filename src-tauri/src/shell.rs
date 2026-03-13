use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::types::ShellType;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShellInfo {
    pub name: String,
    pub path: PathBuf,
    pub shell_type: ShellType,
}

pub fn list_available_shells() -> Vec<ShellInfo> {
    shell_candidates()
        .into_iter()
        .filter_map(|(shell_type, paths)| {
            find_shell_path(&shell_type, &paths).map(|path| ShellInfo {
                name: shell_name(&shell_type),
                path,
                shell_type,
            })
        })
        .collect()
}

pub fn get_default_shell() -> ShellType {
    #[cfg(target_os = "macos")]
    {
        ShellType::Zsh
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(shell) = std::env::var("SHELL") {
            let shell_path = PathBuf::from(&shell);
            let shell_name = shell_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("bash");
            
            return match shell_name {
                "zsh" => ShellType::Zsh,
                "fish" => ShellType::Fish,
                "bash" => ShellType::Bash,
                _ => ShellType::Bash,
            };
        }
        ShellType::Bash
    }

    #[cfg(target_os = "windows")]
    {
        ShellType::PowerShell
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        ShellType::Bash
    }
}

pub fn resolve_shell_path(shell: &ShellType) -> Result<PathBuf, String> {
    let candidates = shell_candidates()
        .into_iter()
        .find_map(|(candidate_shell, paths)| {
            if candidate_shell == *shell {
                Some(paths)
            } else {
                None
            }
        })
        .ok_or_else(|| format!("shell is not supported on this platform: {shell:?}"))?;

    find_shell_path(shell, &candidates)
        .ok_or_else(|| format!("shell binary not found for {shell:?}"))
}

fn shell_name(shell: &ShellType) -> String {
    match shell {
        ShellType::Bash => "bash".to_string(),
        ShellType::Zsh => "zsh".to_string(),
        ShellType::Fish => "fish".to_string(),
        ShellType::PowerShell => "PowerShell".to_string(),
        ShellType::Cmd => "Command Prompt".to_string(),
    }
}

fn find_shell_path(_shell: &ShellType, candidates: &[PathBuf]) -> Option<PathBuf> {
    for candidate in candidates {
        if candidate.is_absolute() {
            if candidate.exists() {
                return Some(candidate.clone());
            }
        } else if let Some(found) = find_in_path(candidate.as_path()) {
            return Some(found);
        }
    }
    None
}

fn find_in_path(binary: &std::path::Path) -> Option<PathBuf> {
    let path_env = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_env) {
        let candidate = dir.join(binary);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn shell_candidates() -> Vec<(ShellType, Vec<PathBuf>)> {
    #[cfg(unix)]
    {
        vec![
            (
                ShellType::Bash,
                vec![
                    PathBuf::from("/bin/bash"),
                    PathBuf::from("/usr/bin/bash"),
                    PathBuf::from("bash"),
                ],
            ),
            (
                ShellType::Zsh,
                vec![
                    PathBuf::from("/bin/zsh"),
                    PathBuf::from("/usr/bin/zsh"),
                    PathBuf::from("zsh"),
                ],
            ),
            (
                ShellType::Fish,
                vec![
                    PathBuf::from("/usr/bin/fish"),
                    PathBuf::from("/bin/fish"),
                    PathBuf::from("fish"),
                ],
            ),
        ]
    }

    #[cfg(windows)]
    {
        vec![
            (
                ShellType::PowerShell,
                vec![PathBuf::from("powershell.exe"), PathBuf::from("pwsh.exe")],
            ),
            (ShellType::Cmd, vec![PathBuf::from("cmd.exe")]),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_available_shells_returns_at_least_one() {
        let shells = list_available_shells();
        assert!(
            !shells.is_empty(),
            "at least one shell must be available on the system"
        );
    }

    #[test]
    fn test_get_default_shell_returns_valid_shell() {
        let default = get_default_shell();
        match default {
            ShellType::Bash | ShellType::Zsh | ShellType::Fish | ShellType::PowerShell | ShellType::Cmd => {}
        }
    }

    #[test]
    fn test_resolve_shell_path_with_bash() {
        let result = resolve_shell_path(&ShellType::Bash);
        if result.is_ok() {
            assert!(result.unwrap().exists());
        }
    }

    #[test]
    fn test_shell_info_has_required_fields() {
        let shells = list_available_shells();
        if let Some(shell_info) = shells.first() {
            assert!(!shell_info.name.is_empty());
            assert!(!shell_info.path.to_string_lossy().is_empty());
        }
    }

    #[test]
    fn test_default_shell_is_available() {
        let default = get_default_shell();
        let shells = list_available_shells();
        let default_available = shells.iter().any(|s| s.shell_type == default);
        
        if !default_available {
            assert!(resolve_shell_path(&default).is_ok() || default_available);
        }
    }
}
