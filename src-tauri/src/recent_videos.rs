use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

const HISTORY_LIMIT: i64 = 24;

const MIGRATION: &str = r#"
CREATE TABLE IF NOT EXISTS recent_videos (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  video_id INTEGER NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  created_at_ms INTEGER NOT NULL,
  last_watched_at_ms INTEGER NOT NULL
);
"#;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentVideo {
    pub id: String,
    pub url: String,
    pub owner_id: i64,
    pub video_id: i64,
    pub title: Option<String>,
    pub thumbnail_url: Option<String>,
    pub created_at_ms: i64,
    pub last_watched_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordRecentVideoRequest {
    pub url: String,
    pub owner_id: i64,
    pub video_id: i64,
    pub title: Option<String>,
    pub thumbnail_url: Option<String>,
}

pub struct RecentVideosState {
    connection: Option<Mutex<Connection>>,
}

impl RecentVideosState {
    pub fn new(path: &Path) -> Result<Self, RecentVideosError> {
        let connection = Connection::open(path).map_err(|_| RecentVideosError::Unavailable)?;
        migrate(&connection)?;

        Ok(Self {
            connection: Some(Mutex::new(connection)),
        })
    }

    pub fn unavailable() -> Self {
        Self { connection: None }
    }

    #[cfg(test)]
    pub fn in_memory_for_tests() -> Result<Self, RecentVideosError> {
        let connection =
            Connection::open_in_memory().map_err(|_| RecentVideosError::Unavailable)?;
        migrate(&connection)?;

        Ok(Self {
            connection: Some(Mutex::new(connection)),
        })
    }

    fn connection(&self) -> Result<MutexGuard<'_, Connection>, RecentVideosError> {
        self.connection
            .as_ref()
            .ok_or(RecentVideosError::Unavailable)?
            .lock()
            .map_err(|_| RecentVideosError::Unavailable)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecentVideosError {
    Unavailable,
}

impl RecentVideosError {
    pub fn kind(self) -> &'static str {
        match self {
            RecentVideosError::Unavailable => "recent-videos-unavailable",
        }
    }
}

impl From<RecentVideosError> for String {
    fn from(value: RecentVideosError) -> Self {
        let message = value.kind();
        serde_json::json!({ "kind": message, "message": message }).to_string()
    }
}

fn migrate(connection: &Connection) -> Result<(), RecentVideosError> {
    connection
        .execute_batch(MIGRATION)
        .map_err(|_| RecentVideosError::Unavailable)
}

fn recent_video_id(owner_id: i64, video_id: i64) -> String {
    format!("{owner_id}_{video_id}")
}

pub fn list_recent_videos_in_state(
    state: &RecentVideosState,
) -> Result<Vec<RecentVideo>, RecentVideosError> {
    let connection = state.connection()?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              id,
              url,
              owner_id,
              video_id,
              title,
              thumbnail_url,
              created_at_ms,
              last_watched_at_ms
            FROM recent_videos
            ORDER BY last_watched_at_ms DESC, id ASC
            "#,
        )
        .map_err(|_| RecentVideosError::Unavailable)?;

    let videos = statement
        .query_map([], row_to_recent_video)
        .map_err(|_| RecentVideosError::Unavailable)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| RecentVideosError::Unavailable)?;

    Ok(videos)
}

pub fn record_recent_video_in_state(
    state: &RecentVideosState,
    payload: RecordRecentVideoRequest,
    now_ms: i64,
) -> Result<RecentVideo, RecentVideosError> {
    let connection = state.connection()?;
    let id = recent_video_id(payload.owner_id, payload.video_id);

    connection
        .execute(
            r#"
            INSERT INTO recent_videos (
              id,
              url,
              owner_id,
              video_id,
              title,
              thumbnail_url,
              created_at_ms,
              last_watched_at_ms
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            ON CONFLICT(id) DO UPDATE SET
              url = excluded.url,
              title = excluded.title,
              thumbnail_url = excluded.thumbnail_url,
              last_watched_at_ms = excluded.last_watched_at_ms
            "#,
            params![
                id,
                payload.url,
                payload.owner_id,
                payload.video_id,
                payload.title,
                payload.thumbnail_url,
                now_ms
            ],
        )
        .map_err(|_| RecentVideosError::Unavailable)?;

    connection
        .execute(
            r#"
            DELETE FROM recent_videos
            WHERE id NOT IN (
              SELECT id
              FROM recent_videos
              ORDER BY last_watched_at_ms DESC, id ASC
              LIMIT ?1
            )
            "#,
            params![HISTORY_LIMIT],
        )
        .map_err(|_| RecentVideosError::Unavailable)?;

    find_recent_video(&connection, &id)?.ok_or(RecentVideosError::Unavailable)
}

pub fn remove_recent_video_in_state(
    state: &RecentVideosState,
    id: &str,
) -> Result<(), RecentVideosError> {
    let connection = state.connection()?;

    connection
        .execute("DELETE FROM recent_videos WHERE id = ?1", params![id])
        .map_err(|_| RecentVideosError::Unavailable)?;

    Ok(())
}

#[tauri::command]
pub fn list_recent_videos(
    state: tauri::State<'_, RecentVideosState>,
) -> Result<Vec<RecentVideo>, String> {
    list_recent_videos_in_state(&state).map_err(String::from)
}

#[tauri::command]
pub fn record_recent_video(
    state: tauri::State<'_, RecentVideosState>,
    payload: RecordRecentVideoRequest,
) -> Result<RecentVideo, String> {
    record_recent_video_in_state(&state, payload, now_ms()).map_err(String::from)
}

#[tauri::command]
pub fn remove_recent_video(
    state: tauri::State<'_, RecentVideosState>,
    id: String,
) -> Result<(), String> {
    remove_recent_video_in_state(&state, &id).map_err(String::from)
}

fn find_recent_video(
    connection: &Connection,
    id: &str,
) -> Result<Option<RecentVideo>, RecentVideosError> {
    connection
        .query_row(
            r#"
            SELECT
              id,
              url,
              owner_id,
              video_id,
              title,
              thumbnail_url,
              created_at_ms,
              last_watched_at_ms
            FROM recent_videos
            WHERE id = ?1
            "#,
            params![id],
            row_to_recent_video,
        )
        .optional()
        .map_err(|_| RecentVideosError::Unavailable)
}

fn row_to_recent_video(row: &rusqlite::Row<'_>) -> rusqlite::Result<RecentVideo> {
    Ok(RecentVideo {
        id: row.get(0)?,
        url: row.get(1)?,
        owner_id: row.get(2)?,
        video_id: row.get(3)?,
        title: row.get(4)?,
        thumbnail_url: row.get(5)?,
        created_at_ms: row.get(6)?,
        last_watched_at_ms: row.get(7)?,
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

    fn request(owner_id: i64, video_id: i64, url: &str) -> RecordRecentVideoRequest {
        RecordRecentVideoRequest {
            url: url.to_string(),
            owner_id,
            video_id,
            title: Some("Title".to_string()),
            thumbnail_url: Some("https://img.example/preview.jpg".to_string()),
        }
    }

    #[test]
    fn records_and_lists_newest_first() {
        let state = RecentVideosState::in_memory_for_tests().unwrap();

        let first = record_recent_video_in_state(&state, request(-1, 2, "u1"), 1000).unwrap();
        let second = record_recent_video_in_state(&state, request(-3, 4, "u2"), 2000).unwrap();
        let videos = list_recent_videos_in_state(&state).unwrap();

        assert_eq!(videos, vec![second, first]);
    }

    #[test]
    fn upserts_same_video_without_duplicate_and_preserves_created_at() {
        let state = RecentVideosState::in_memory_for_tests().unwrap();

        let inserted = record_recent_video_in_state(&state, request(-1, 2, "u1"), 1000).unwrap();
        let mut changed = request(-1, 2, "u1-updated");
        changed.title = Some("New".to_string());
        let updated = record_recent_video_in_state(&state, changed, 2000).unwrap();
        let videos = list_recent_videos_in_state(&state).unwrap();

        assert_eq!(videos.len(), 1);
        assert_eq!(inserted.id, "-1_2");
        assert_eq!(updated.created_at_ms, 1000);
        assert_eq!(updated.last_watched_at_ms, 2000);
        assert_eq!(updated.url, "u1-updated");
        assert_eq!(updated.title.as_deref(), Some("New"));
    }

    #[test]
    fn evicts_videos_beyond_the_limit() {
        let state = RecentVideosState::in_memory_for_tests().unwrap();

        for index in 0..30i64 {
            record_recent_video_in_state(
                &state,
                request(-1, index, &format!("u{index}")),
                1000 + index,
            )
            .unwrap();
        }

        let videos = list_recent_videos_in_state(&state).unwrap();

        assert_eq!(videos.len(), 24);
        assert_eq!(videos.first().unwrap().video_id, 29);
        assert_eq!(videos.last().unwrap().video_id, 6);
    }

    #[test]
    fn removes_by_id() {
        let state = RecentVideosState::in_memory_for_tests().unwrap();

        record_recent_video_in_state(&state, request(-1, 2, "u1"), 1000).unwrap();
        record_recent_video_in_state(&state, request(-3, 4, "u2"), 2000).unwrap();
        remove_recent_video_in_state(&state, "-1_2").unwrap();
        let videos = list_recent_videos_in_state(&state).unwrap();

        assert_eq!(videos.len(), 1);
        assert_eq!(videos[0].id, "-3_4");
    }

    #[test]
    fn unavailable_state_returns_unavailable_errors() {
        let state = RecentVideosState::unavailable();

        assert_eq!(
            list_recent_videos_in_state(&state).unwrap_err(),
            RecentVideosError::Unavailable
        );
        assert_eq!(
            record_recent_video_in_state(&state, request(-1, 2, "u"), 1000).unwrap_err(),
            RecentVideosError::Unavailable
        );
        assert_eq!(
            remove_recent_video_in_state(&state, "-1_2").unwrap_err(),
            RecentVideosError::Unavailable
        );
    }

    #[test]
    fn migration_creates_recent_videos_table() {
        let state = RecentVideosState::in_memory_for_tests().unwrap();
        let connection = state.connection().unwrap();

        let table_name: String = connection
            .query_row(
                r#"
                SELECT name
                FROM sqlite_master
                WHERE type = 'table' AND name = 'recent_videos'
                "#,
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(table_name, "recent_videos");
    }

    #[test]
    fn serializes_recent_video_as_camel_case() {
        let value = serde_json::to_value(RecentVideo {
            id: "-1_2".to_string(),
            url: "https://vkvideo.ru/video-1_2".to_string(),
            owner_id: -1,
            video_id: 2,
            title: Some("T".to_string()),
            thumbnail_url: Some("https://img.example/p.jpg".to_string()),
            created_at_ms: 1000,
            last_watched_at_ms: 2000,
        })
        .unwrap();

        assert_eq!(value["ownerId"], -1);
        assert_eq!(value["videoId"], 2);
        assert_eq!(value["thumbnailUrl"], "https://img.example/p.jpg");
        assert_eq!(value["lastWatchedAtMs"], 2000);
    }
}
