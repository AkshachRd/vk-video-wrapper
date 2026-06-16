use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

const MIGRATION: &str = r#"
CREATE TABLE IF NOT EXISTS saved_words (
  id TEXT PRIMARY KEY,
  normalized_word TEXT NOT NULL,
  display_word TEXT NOT NULL,
  language TEXT NOT NULL,
  language_name TEXT,
  first_meaning TEXT,
  source TEXT,
  source_url TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE(language, normalized_word)
);

CREATE TABLE IF NOT EXISTS word_tags (
  word_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  tag_display TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(word_id, tag)
);
"#;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedWord {
    pub id: String,
    pub normalized_word: String,
    pub display_word: String,
    pub language: String,
    pub language_name: Option<String>,
    pub first_meaning: Option<String>,
    pub source: Option<String>,
    pub source_url: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWordRequest {
    pub display_word: String,
    pub language: String,
    pub language_name: Option<String>,
    pub first_meaning: Option<String>,
    pub source: Option<String>,
    pub source_url: Option<String>,
}

pub struct SavedWordsState {
    connection: Option<Mutex<Connection>>,
}

impl SavedWordsState {
    pub fn new(path: &Path) -> Result<Self, SavedWordsError> {
        let connection = Connection::open(path).map_err(|_| SavedWordsError::Unavailable)?;
        migrate(&connection)?;

        Ok(Self {
            connection: Some(Mutex::new(connection)),
        })
    }

    pub fn unavailable() -> Self {
        Self { connection: None }
    }

    #[cfg(test)]
    pub fn in_memory_for_tests() -> Result<Self, SavedWordsError> {
        let connection = Connection::open_in_memory().map_err(|_| SavedWordsError::Unavailable)?;
        migrate(&connection)?;

        Ok(Self {
            connection: Some(Mutex::new(connection)),
        })
    }

    fn connection(&self) -> Result<MutexGuard<'_, Connection>, SavedWordsError> {
        self.connection
            .as_ref()
            .ok_or(SavedWordsError::Unavailable)?
            .lock()
            .map_err(|_| SavedWordsError::Unavailable)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SavedWordsError {
    Unavailable,
    InvalidSavedWord,
    InvalidTag,
}

impl SavedWordsError {
    pub fn kind(self) -> &'static str {
        match self {
            SavedWordsError::Unavailable => "saved-words-unavailable",
            SavedWordsError::InvalidSavedWord => "invalid-saved-word",
            SavedWordsError::InvalidTag => "invalid-tag",
        }
    }
}

impl From<SavedWordsError> for String {
    fn from(value: SavedWordsError) -> Self {
        let message = value.kind();
        serde_json::json!({ "kind": message, "message": message }).to_string()
    }
}

fn migrate(connection: &Connection) -> Result<(), SavedWordsError> {
    connection
        .execute_batch(MIGRATION)
        .map_err(|_| SavedWordsError::Unavailable)
}

const MAX_TAG_LEN: usize = 40;

fn normalize_tag(value: &str) -> Option<String> {
    let normalized = value.trim().to_lowercase();

    if normalized.is_empty() || normalized.chars().count() > MAX_TAG_LEN {
        return None;
    }

    if normalized.chars().any(char::is_alphanumeric) {
        Some(normalized)
    } else {
        None
    }
}

fn parse_json_array(raw: &str) -> Option<Vec<String>> {
    let start = raw.find('[')?;
    let end = raw.rfind(']')?;
    if end <= start {
        return None;
    }
    serde_json::from_str::<Vec<String>>(&raw[start..=end]).ok()
}

fn parse_theme_tags(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();

    let candidates: Vec<String> = match parse_json_array(trimmed) {
        Some(values) => values,
        None => trimmed
            .trim_start_matches('[')
            .trim_end_matches(']')
            .split(['\n', ','])
            .map(|piece| piece.trim().trim_matches('"').to_string())
            .collect(),
    };

    let mut out: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for candidate in candidates {
        if let Some(normalized) = normalize_tag(&candidate) {
            if seen.insert(normalized.clone()) {
                out.push(normalized);
                if out.len() == 2 {
                    break;
                }
            }
        }
    }

    out
}

fn normalize_word(value: &str) -> Option<String> {
    let normalized = value.trim().to_lowercase();

    if normalized.chars().any(char::is_alphanumeric) {
        Some(normalized)
    } else {
        None
    }
}

fn normalize_language(value: &str) -> String {
    let normalized = value.trim().to_lowercase();

    if normalized.is_empty() {
        "unknown".to_string()
    } else {
        normalized
    }
}

fn saved_word_id(language: &str, normalized_word: &str) -> String {
    format!("{language}:{normalized_word}")
}

pub fn list_saved_words_in_state(
    state: &SavedWordsState,
) -> Result<Vec<SavedWord>, SavedWordsError> {
    let connection = state.connection()?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              id,
              normalized_word,
              display_word,
              language,
              language_name,
              first_meaning,
              source,
              source_url,
              created_at_ms,
              updated_at_ms
            FROM saved_words
            ORDER BY created_at_ms DESC, id ASC
            "#,
        )
        .map_err(|_| SavedWordsError::Unavailable)?;

    let mut words = statement
        .query_map([], row_to_saved_word)
        .map_err(|_| SavedWordsError::Unavailable)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| SavedWordsError::Unavailable)?;

    for word in &mut words {
        word.tags = list_word_tags_in(&connection, &word.id)?;
    }

    Ok(words)
}

pub fn save_word_in_state(
    state: &SavedWordsState,
    payload: SaveWordRequest,
    now_ms: i64,
) -> Result<SavedWord, SavedWordsError> {
    let connection = state.connection()?;
    let normalized_word =
        normalize_word(&payload.display_word).ok_or(SavedWordsError::InvalidSavedWord)?;
    let language = normalize_language(&payload.language);
    let id = saved_word_id(&language, &normalized_word);
    let display_word = payload.display_word.trim();

    connection
        .execute(
            r#"
            INSERT INTO saved_words (
              id,
              normalized_word,
              display_word,
              language,
              language_name,
              first_meaning,
              source,
              source_url,
              created_at_ms,
              updated_at_ms
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(language, normalized_word) DO UPDATE SET
              display_word = excluded.display_word,
              language_name = excluded.language_name,
              first_meaning = excluded.first_meaning,
              source = excluded.source,
              source_url = excluded.source_url,
              updated_at_ms = excluded.updated_at_ms
            "#,
            params![
                id,
                normalized_word,
                display_word,
                language,
                payload.language_name,
                payload.first_meaning,
                payload.source,
                payload.source_url,
                now_ms,
                now_ms
            ],
        )
        .map_err(|_| SavedWordsError::Unavailable)?;

    find_saved_word(&connection, &id)?.ok_or(SavedWordsError::Unavailable)
}

pub fn remove_saved_word_in_state(
    state: &SavedWordsState,
    language: &str,
    normalized_word: &str,
) -> Result<(), SavedWordsError> {
    let connection = state.connection()?;
    let normalized_word =
        normalize_word(normalized_word).ok_or(SavedWordsError::InvalidSavedWord)?;
    let language = normalize_language(language);
    let id = saved_word_id(&language, &normalized_word);

    connection
        .execute(
            r#"
            DELETE FROM word_tags
            WHERE word_id = ?1
            "#,
            params![id],
        )
        .map_err(|_| SavedWordsError::Unavailable)?;

    connection
        .execute(
            r#"
            DELETE FROM saved_words
            WHERE language = ?1 AND normalized_word = ?2
            "#,
            params![language, normalized_word],
        )
        .map_err(|_| SavedWordsError::Unavailable)?;

    Ok(())
}

fn list_word_tags_in(
    connection: &Connection,
    word_id: &str,
) -> Result<Vec<String>, SavedWordsError> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT tag_display
            FROM word_tags
            WHERE word_id = ?1
            ORDER BY created_at_ms ASC, tag ASC
            "#,
        )
        .map_err(|_| SavedWordsError::Unavailable)?;

    let tags = statement
        .query_map(params![word_id], |row| row.get::<_, String>(0))
        .map_err(|_| SavedWordsError::Unavailable)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| SavedWordsError::Unavailable)?;

    Ok(tags)
}

pub fn add_word_tag_in_state(
    state: &SavedWordsState,
    word_id: &str,
    tag: &str,
    now_ms: i64,
) -> Result<Vec<String>, SavedWordsError> {
    let connection = state.connection()?;
    let normalized = normalize_tag(tag).ok_or(SavedWordsError::InvalidTag)?;
    let display = tag.trim();

    let word_exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM saved_words WHERE id = ?1)",
            params![word_id],
            |row| row.get(0),
        )
        .map_err(|_| SavedWordsError::Unavailable)?;

    if !word_exists {
        return Err(SavedWordsError::InvalidSavedWord);
    }

    connection
        .execute(
            r#"
            INSERT INTO word_tags (word_id, tag, tag_display, created_at_ms)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(word_id, tag) DO NOTHING
            "#,
            params![word_id, normalized, display, now_ms],
        )
        .map_err(|_| SavedWordsError::Unavailable)?;

    list_word_tags_in(&connection, word_id)
}

pub fn remove_word_tag_in_state(
    state: &SavedWordsState,
    word_id: &str,
    tag: &str,
) -> Result<Vec<String>, SavedWordsError> {
    let connection = state.connection()?;
    let normalized = normalize_tag(tag).ok_or(SavedWordsError::InvalidTag)?;

    connection
        .execute(
            r#"
            DELETE FROM word_tags
            WHERE word_id = ?1 AND tag = ?2
            "#,
            params![word_id, normalized],
        )
        .map_err(|_| SavedWordsError::Unavailable)?;

    list_word_tags_in(&connection, word_id)
}

#[tauri::command]
pub fn list_saved_words(
    state: tauri::State<'_, SavedWordsState>,
) -> Result<Vec<SavedWord>, String> {
    list_saved_words_in_state(&state).map_err(String::from)
}

#[tauri::command]
pub fn save_word(
    state: tauri::State<'_, SavedWordsState>,
    payload: SaveWordRequest,
) -> Result<SavedWord, String> {
    save_word_in_state(&state, payload, now_ms()).map_err(String::from)
}

#[tauri::command(rename_all = "camelCase")]
pub fn remove_saved_word(
    state: tauri::State<'_, SavedWordsState>,
    language: String,
    normalized_word: String,
) -> Result<(), String> {
    remove_saved_word_in_state(&state, &language, &normalized_word).map_err(String::from)
}

#[tauri::command(rename_all = "camelCase")]
pub fn add_word_tag(
    state: tauri::State<'_, SavedWordsState>,
    word_id: String,
    tag: String,
) -> Result<Vec<String>, String> {
    add_word_tag_in_state(&state, &word_id, &tag, now_ms()).map_err(String::from)
}

#[tauri::command(rename_all = "camelCase")]
pub fn remove_word_tag(
    state: tauri::State<'_, SavedWordsState>,
    word_id: String,
    tag: String,
) -> Result<Vec<String>, String> {
    remove_word_tag_in_state(&state, &word_id, &tag).map_err(String::from)
}

fn find_saved_word(
    connection: &Connection,
    id: &str,
) -> Result<Option<SavedWord>, SavedWordsError> {
    let word = connection
        .query_row(
            r#"
            SELECT
              id,
              normalized_word,
              display_word,
              language,
              language_name,
              first_meaning,
              source,
              source_url,
              created_at_ms,
              updated_at_ms
            FROM saved_words
            WHERE id = ?1
            "#,
            params![id],
            row_to_saved_word,
        )
        .optional()
        .map_err(|_| SavedWordsError::Unavailable)?;

    match word {
        Some(mut word) => {
            word.tags = list_word_tags_in(connection, id)?;
            Ok(Some(word))
        }
        None => Ok(None),
    }
}

fn row_to_saved_word(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedWord> {
    Ok(SavedWord {
        id: row.get(0)?,
        normalized_word: row.get(1)?,
        display_word: row.get(2)?,
        language: row.get(3)?,
        language_name: row.get(4)?,
        first_meaning: row.get(5)?,
        source: row.get(6)?,
        source_url: row.get(7)?,
        created_at_ms: row.get(8)?,
        updated_at_ms: row.get(9)?,
        tags: Vec::new(),
    })
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(word: &str, language: &str) -> SaveWordRequest {
        SaveWordRequest {
            display_word: word.to_string(),
            language: language.to_string(),
            language_name: Some("Немецкий".to_string()),
            first_meaning: Some("мир".to_string()),
            source: Some("ruwiktionary-kaikki".to_string()),
            source_url: Some("https://kaikki.org/example".to_string()),
        }
    }

    #[test]
    fn saves_and_lists_newest_first() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();

        let first = save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();
        let second = save_word_in_state(&state, request("house", "en"), 2000).unwrap();
        let words = list_saved_words_in_state(&state).unwrap();

        assert_eq!(words, vec![second, first]);
    }

    #[test]
    fn upserts_without_duplicate_and_preserves_created_at() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();

        let inserted = save_word_in_state(&state, request("House", "en"), 1000).unwrap();
        let mut changed = request("house", "en");
        changed.first_meaning = Some("дом".to_string());
        let updated = save_word_in_state(&state, changed, 2000).unwrap();
        let words = list_saved_words_in_state(&state).unwrap();

        assert_eq!(words.len(), 1);
        assert_eq!(inserted.id, "en:house");
        assert_eq!(updated.id, "en:house");
        assert_eq!(updated.created_at_ms, 1000);
        assert_eq!(updated.updated_at_ms, 2000);
        assert_eq!(updated.first_meaning.as_deref(), Some("дом"));
    }

    #[test]
    fn removes_by_language_and_normalized_word() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();

        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();
        save_word_in_state(&state, request("Haus", "en"), 2000).unwrap();
        remove_saved_word_in_state(&state, "de", "haus").unwrap();
        let words = list_saved_words_in_state(&state).unwrap();

        assert_eq!(words.len(), 1);
        assert_eq!(words[0].id, "en:haus");
    }

    #[test]
    fn rejects_empty_or_punctuation_only_words() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();

        let empty_error = save_word_in_state(&state, request("", "de"), 1000).unwrap_err();
        let punctuation_error = save_word_in_state(&state, request("...", "de"), 1000).unwrap_err();

        assert_eq!(empty_error.kind(), "invalid-saved-word");
        assert_eq!(punctuation_error.kind(), "invalid-saved-word");
    }

    #[test]
    fn unavailable_state_returns_unavailable_errors() {
        let state = SavedWordsState::unavailable();

        let list_error = list_saved_words_in_state(&state).unwrap_err();
        let save_error = save_word_in_state(&state, request("Haus", "de"), 1000).unwrap_err();
        let remove_error = remove_saved_word_in_state(&state, "de", "haus").unwrap_err();

        assert_eq!(list_error, SavedWordsError::Unavailable);
        assert_eq!(save_error, SavedWordsError::Unavailable);
        assert_eq!(remove_error, SavedWordsError::Unavailable);
    }

    #[test]
    fn migration_creates_saved_words_table() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        let connection = state.connection().unwrap();

        let table_name: String = connection
            .query_row(
                r#"
                SELECT name
                FROM sqlite_master
                WHERE type = 'table' AND name = 'saved_words'
                "#,
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(table_name, "saved_words");
    }

    #[test]
    fn list_includes_tags_in_insertion_order() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();
        add_word_tag_in_state(&state, "de:haus", "существительные", 2000).unwrap();
        add_word_tag_in_state(&state, "de:haus", "B1", 3000).unwrap();

        let words = list_saved_words_in_state(&state).unwrap();

        assert_eq!(
            words[0].tags,
            vec!["существительные".to_string(), "B1".to_string()]
        );
    }

    #[test]
    fn removing_word_cascades_its_tags() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();
        add_word_tag_in_state(&state, "de:haus", "дом", 2000).unwrap();

        remove_saved_word_in_state(&state, "de", "haus").unwrap();

        assert!(tag_keys(&state).is_empty());
    }

    fn tag_keys(state: &SavedWordsState) -> Vec<String> {
        let connection = state.connection().unwrap();
        let mut statement = connection
            .prepare("SELECT DISTINCT tag FROM word_tags ORDER BY tag ASC")
            .unwrap();
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    }

    #[test]
    fn adds_tag_and_lists_it() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();

        let tags = add_word_tag_in_state(&state, "de:haus", "Глаголы", 2000).unwrap();

        assert_eq!(tags, vec!["Глаголы".to_string()]);
        assert_eq!(tag_keys(&state), vec!["глаголы".to_string()]);
    }

    #[test]
    fn adding_same_tag_twice_is_idempotent() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();

        add_word_tag_in_state(&state, "de:haus", "глаголы", 2000).unwrap();
        let tags = add_word_tag_in_state(&state, "de:haus", "Глаголы", 3000).unwrap();

        assert_eq!(tags, vec!["глаголы".to_string()]);
    }

    #[test]
    fn removing_last_tag_drops_it_from_global_set() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();
        add_word_tag_in_state(&state, "de:haus", "спорт", 2000).unwrap();

        let tags = remove_word_tag_in_state(&state, "de:haus", "Спорт").unwrap();

        assert!(tags.is_empty());
        assert!(tag_keys(&state).is_empty());
    }

    #[test]
    fn rejects_empty_punctuation_or_too_long_tags() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();

        let empty = add_word_tag_in_state(&state, "de:haus", "   ", 2000).unwrap_err();
        let punctuation = add_word_tag_in_state(&state, "de:haus", "...", 2000).unwrap_err();
        let too_long = add_word_tag_in_state(&state, "de:haus", &"a".repeat(41), 2000).unwrap_err();

        assert_eq!(empty, SavedWordsError::InvalidTag);
        assert_eq!(punctuation, SavedWordsError::InvalidTag);
        assert_eq!(too_long, SavedWordsError::InvalidTag);
    }

    #[test]
    fn tag_commands_unavailable_when_store_missing() {
        let state = SavedWordsState::unavailable();

        let add_error = add_word_tag_in_state(&state, "de:haus", "спорт", 2000).unwrap_err();
        let remove_error = remove_word_tag_in_state(&state, "de:haus", "спорт").unwrap_err();

        assert_eq!(add_error, SavedWordsError::Unavailable);
        assert_eq!(remove_error, SavedWordsError::Unavailable);
    }

    #[test]
    fn rejects_tag_on_missing_word() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();

        let error = add_word_tag_in_state(&state, "de:ghost", "спорт", 1000).unwrap_err();

        assert_eq!(error, SavedWordsError::InvalidSavedWord);
    }

    #[test]
    fn migration_creates_word_tags_table() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        let connection = state.connection().unwrap();

        let table_name: String = connection
            .query_row(
                r#"
                SELECT name
                FROM sqlite_master
                WHERE type = 'table' AND name = 'word_tags'
                "#,
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(table_name, "word_tags");
    }

    #[test]
    fn parse_theme_tags_reads_json_array_lowercased() {
        assert_eq!(parse_theme_tags(r#"["Еда","СПОРТ"]"#), vec!["еда", "спорт"]);
    }

    #[test]
    fn parse_theme_tags_extracts_json_embedded_in_text() {
        let raw = "Вот категории: [ \"Еда\", \"кухня\" ] — готово";
        assert_eq!(parse_theme_tags(raw), vec!["еда", "кухня"]);
    }

    #[test]
    fn parse_theme_tags_falls_back_to_comma_split() {
        assert_eq!(parse_theme_tags("Еда, спорт"), vec!["еда", "спорт"]);
    }

    #[test]
    fn parse_theme_tags_drops_empty_and_punctuation_and_dedups() {
        assert_eq!(
            parse_theme_tags(r#"["", "...", "Еда", "еда"]"#),
            vec!["еда"]
        );
    }

    #[test]
    fn parse_theme_tags_caps_at_two() {
        assert_eq!(
            parse_theme_tags(r#"["еда","спорт","право"]"#),
            vec!["еда", "спорт"]
        );
    }

    #[test]
    fn parse_theme_tags_drops_too_long() {
        let long = "а".repeat(41);
        let raw = format!(r#"["{long}", "еда"]"#);
        assert_eq!(parse_theme_tags(&raw), vec!["еда"]);
    }

    #[test]
    fn parse_theme_tags_splits_on_newlines() {
        assert_eq!(parse_theme_tags("Еда\nспорт"), vec!["еда", "спорт"]);
    }

    #[test]
    fn parse_theme_tags_returns_empty_for_blank_input() {
        assert_eq!(parse_theme_tags(""), Vec::<String>::new());
    }
}
