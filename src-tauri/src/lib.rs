mod recent_videos;
mod saved_words;
mod vk;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
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
            let recent_videos = app
                .path()
                .app_data_dir()
                .ok()
                .and_then(|db_dir| {
                    std::fs::create_dir_all(&db_dir).ok()?;
                    let db_path = db_dir.join("recent-videos.sqlite3");
                    recent_videos::RecentVideosState::new(&db_path).ok()
                })
                .unwrap_or_else(recent_videos::RecentVideosState::unavailable);
            app.manage(recent_videos);
            Ok(())
        })
        .manage(vk::dictionary::DictionaryState::default())
        .invoke_handler(tauri::generate_handler![
            vk::command::load_video_from_url,
            vk::command::load_subtitle_track,
            vk::dictionary::lookup_word,
            saved_words::list_saved_words,
            saved_words::save_word,
            saved_words::remove_saved_word,
            saved_words::add_word_tag,
            saved_words::remove_word_tag,
            saved_words::build_word_tag_prompt,
            saved_words::apply_generated_tags,
            recent_videos::list_recent_videos,
            recent_videos::record_recent_video,
            recent_videos::remove_recent_video
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
