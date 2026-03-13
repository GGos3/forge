use std::sync::Mutex;

use tauri::{AppHandle, Emitter, State};

use crate::session::SessionManager;
use crate::shell::ShellInfo;
use crate::types::{ResizePayload, SessionConfig, SessionExitEvent, SessionId, SessionOutputEvent, ShellType};

pub struct AppState {
    pub session_manager: Mutex<SessionManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            session_manager: Mutex::new(SessionManager::new()),
        }
    }
}

#[tauri::command]
pub fn create_session(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    config: SessionConfig,
) -> Result<SessionId, String> {
    let output_handle = app_handle.clone();
    let output_callback = std::sync::Arc::new(move |event: SessionOutputEvent| {
        let _ = output_handle.emit("session-output", event);
    });

    let exit_handle = app_handle.clone();
    let exit_callback = std::sync::Arc::new(move |event: SessionExitEvent| {
        let _ = exit_handle.emit("session-exit", event);
    });

    let mut manager = state
        .session_manager
        .lock()
        .map_err(|_| "session manager lock poisoned".to_string())?;

    manager.create_session(config, Some(output_callback), Some(exit_callback))
}

#[tauri::command]
pub fn write_to_session(
    state: State<'_, AppState>,
    session_id: SessionId,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut manager = state
        .session_manager
        .lock()
        .map_err(|_| "session manager lock poisoned".to_string())?;

    manager.write_to_session(&session_id, &data)
}

#[tauri::command]
pub fn resize_session(state: State<'_, AppState>, payload: ResizePayload) -> Result<(), String> {
    let mut manager = state
        .session_manager
        .lock()
        .map_err(|_| "session manager lock poisoned".to_string())?;

    manager.resize_session(&payload.session_id, payload.cols, payload.rows)
}

#[tauri::command]
pub fn close_session(state: State<'_, AppState>, session_id: SessionId) -> Result<(), String> {
    let mut manager = state
        .session_manager
        .lock()
        .map_err(|_| "session manager lock poisoned".to_string())?;

    manager.close_session(&session_id)
}

#[tauri::command]
pub fn has_running_processes(state: State<'_, AppState>) -> Result<bool, String> {
    let mut manager = state
        .session_manager
        .lock()
        .map_err(|_| "session manager lock poisoned".to_string())?;

    Ok(manager.has_running_processes())
}

#[tauri::command]
pub fn list_available_shells() -> Vec<ShellInfo> {
    crate::shell::list_available_shells()
}

#[tauri::command]
pub fn get_default_shell() -> ShellType {
    crate::shell::get_default_shell()
}
