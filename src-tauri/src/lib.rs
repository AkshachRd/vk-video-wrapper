mod saved_words;
mod vk;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let db_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;
            std::fs::create_dir_all(&db_dir)?;
            let db_path = db_dir.join("saved-words.sqlite3");
            let saved_words = saved_words::SavedWordsState::new(&db_path)
                .map_err(|error| Box::<dyn std::error::Error>::from(error.kind().to_string()))?;
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
