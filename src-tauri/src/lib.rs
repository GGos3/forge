use log::info;
use tauri::Manager;

mod commands;
mod session;
mod shell;
mod types;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    info!("Forge Terminal starting...");

    tauri::Builder::default()
        .manage(commands::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::write_to_session,
            commands::resize_session,
            commands::close_session,
            commands::has_running_processes,
            commands::list_available_shells,
            commands::get_default_shell
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<commands::AppState>();
                if let Ok(mut manager) = state.session_manager.lock() {
                    manager.close_all_sessions();
                };
            }
        });
}

#[cfg(test)]
mod tests {
    use super::session::SessionManager;

    #[test]
    fn session_manager_default_is_empty() {
        let manager = SessionManager::new();
        assert_eq!(manager.session_count(), 0);
    }
}
