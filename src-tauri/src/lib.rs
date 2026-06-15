mod commands;
pub mod snapshot;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::ports::list_ports,
            commands::ports::kill_port,
            commands::conversations::list_sessions,
            commands::conversations::read_session,
            commands::usage::read_usage_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
