use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
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
    connection: Mutex<Connection>,
}

impl SavedWordsState {
    pub fn new(path: &Path) -> Result<Self, SavedWordsError> {
        let connection = Connection::open(path).map_err(|_| SavedWordsError::Unavailable)?;
        migrate(&connection)?;

        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    #[cfg(test)]
    pub fn in_memory_for_tests() -> Result<Self, SavedWordsError> {
        let connection = Connection::open_in_memory().map_err(|_| SavedWordsError::Unavailable)?;
        migrate(&connection)?;

        Ok(Self {
            connection: Mutex::new(connection),
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SavedWordsError {
    Unavailable,
    InvalidSavedWord,
}

impl SavedWordsError {
    pub fn kind(self) -> &'static str {
        match self {
            SavedWordsError::Unavailable => "saved-words-unavailable",
            SavedWordsError::InvalidSavedWord => "invalid-saved-word",
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
    let connection = state
        .connection
        .lock()
        .map_err(|_| SavedWordsError::Unavailable)?;
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
            ORDER BY created_at_ms DESC
            "#,
        )
        .map_err(|_| SavedWordsError::Unavailable)?;

    let words = statement
        .query_map([], row_to_saved_word)
        .map_err(|_| SavedWordsError::Unavailable)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| SavedWordsError::Unavailable)?;

    Ok(words)
}

pub fn save_word_in_state(
    state: &SavedWordsState,
    payload: SaveWordRequest,
    now_ms: i64,
) -> Result<SavedWord, SavedWordsError> {
    let normalized_word =
        normalize_word(&payload.display_word).ok_or(SavedWordsError::InvalidSavedWord)?;
    let language = normalize_language(&payload.language);
    let id = saved_word_id(&language, &normalized_word);
    let display_word = payload.display_word.trim();

    let connection = state
        .connection
        .lock()
        .map_err(|_| SavedWordsError::Unavailable)?;
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
    let normalized_word =
        normalize_word(normalized_word).ok_or(SavedWordsError::InvalidSavedWord)?;
    let language = normalize_language(language);
    let connection = state
        .connection
        .lock()
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

fn find_saved_word(
    connection: &Connection,
    id: &str,
) -> Result<Option<SavedWord>, SavedWordsError> {
    connection
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
        .map_err(|_| SavedWordsError::Unavailable)
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
}
