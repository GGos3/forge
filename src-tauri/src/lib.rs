mod known_hosts;
use log::info;
use tauri::Manager;

mod commands;
mod connection_store;
mod credentials;
mod explorer;
mod git_status;
mod session;
mod shell;
mod ssh;
mod types;
mod watcher;

#[cfg(target_os = "macos")]
const MACOS_SAFARI_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    info!("Forge Terminal starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            credentials::ensure_default_storage_dir()?;

            #[cfg(target_os = "macos")]
            {
                let main_window = app.get_webview_window("main").unwrap();
                main_window.with_webview(|webview| unsafe {
                    use objc2_foundation::NSString;
                    use objc2_web_kit::WKWebView;

                    let view: &WKWebView = &*webview.inner().cast();
                    let user_agent = NSString::from_str(MACOS_SAFARI_USER_AGENT);
                    view.setCustomUserAgent(Some(&user_agent));
                })?;
            }

            let salt_path = credentials::stronghold_salt_path();
            app.handle().plugin(
                tauri_plugin_stronghold::Builder::new(move |password| {
                    tauri_plugin_stronghold::kdf::KeyDerivation::argon2(password, &salt_path)
                })
                .build(),
            )?;

            app.manage(ssh::SshState::new(app.handle().clone()));
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

            Ok(())
        })
        .manage(commands::AppState::default())
        .manage(explorer::ExplorerState::default())
        .manage(watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::write_to_session,
            commands::resize_session,
            commands::close_session,
            commands::has_running_processes,
            commands::list_available_shells,
            commands::get_default_shell,
            commands::list_directory,
            commands::read_file,
            commands::write_file,
            commands::check_for_updates,
            commands::install_update,
            ssh::connect_ssh,
            ssh::disconnect_ssh,
            ssh::open_remote_sftp,
            ssh::close_remote_sftp,
            ssh::open_remote_file,
            ssh::list_remote_directory,
            ssh::read_remote_file,
            ssh::write_remote_file,
            ssh::test_connection,
            ssh::verify_host_key_response,
            ssh::list_connections,
            ssh::save_connection,
            ssh::delete_connection,
            git_status::get_git_status,
            credentials::store_credential,
            credentials::retrieve_credential,
            credentials::delete_credential,
            watcher::start_local_watcher,
            watcher::stop_local_watcher
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<commands::AppState>();
                if let Ok(mut manager) = state.session_manager.lock() {
                    manager.close_all_sessions();
                };

                let watcher_state = app_handle.state::<watcher::WatcherState>();
                if let Ok(mut manager) = watcher_state.manager.lock() {
                    manager.close_all();
                };

                let ssh_state = app_handle.state::<ssh::SshState>();
                tauri::async_runtime::block_on(async move {
                    ssh_state.close_all_connections().await;
                });
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
