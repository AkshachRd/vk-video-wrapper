mod saved_words;
mod vk;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let saved_words = app
                .path()
                .app_data_dir()
                .ok()
                .and_then(|db_dir| {
                    std::fs::create_dir_all(&db_dir).ok()?;
                    let db_path = db_dir.join("saved-words.sqlite3");
                    saved_words::SavedWordsState::new(&db_path).ok()
                })
                .unwrap_or_else(saved_words::SavedWordsState::unavailable);
            app.manage(saved_words);
            Ok(())
        })
        .manage(vk::dictionary::DictionaryState::default())
        .invoke_handler(tauri::generate_handler![
            vk::command::load_video_from_url,
            vk::command::load_subtitle_track,
            vk::dictionary::lookup_word,
            saved_words::list_saved_words,
            saved_words::save_word,
            saved_words::remove_saved_word
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
