mod vk;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(vk::dictionary::DictionaryState::default())
        .invoke_handler(tauri::generate_handler![
            vk::command::load_video_from_url,
            vk::command::load_subtitle_track,
            vk::dictionary::lookup_word
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
