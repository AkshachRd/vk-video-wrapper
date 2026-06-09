# Recent Videos History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automatic "recently watched" list on the start screen so the user can reopen a VK video by clicking a card instead of pasting a URL.

**Architecture:** Mirror the existing `saved_words` SQLite pattern with a new `recent_videos` Rust module + Tauri commands (`list_/record_/remove_`), backed by its own `recent-videos.sqlite3`. Best-effort `title`/`thumbnailUrl` are parsed from the already-fetched embed HTML and threaded through `LoadedVideo`. The frontend records history after a successful load and renders a `RecentVideosList` on the start screen.

**Tech Stack:** Rust (Tauri 2, rusqlite, serde, regex), React 19 + TypeScript, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-09-recent-videos-history-design.md`

---

## File Structure

Backend (Rust, `src-tauri/`):
- `src/vk/embed.rs` (modify): extend `VkEmbedMetadata` with `title`/`thumbnail_url`; add `extract_title`/`extract_thumbnail`/`extract_meta_content`/`extract_md_title`/`decode_html_entities`.
- `src/vk/command.rs` (modify): thread `title`/`thumbnail_url` through `LoadedVideo`.
- `src/recent_videos.rs` (create): SQLite store + Tauri commands, by analogy to `src/saved_words.rs`.
- `src/lib.rs` (modify): open `recent-videos.sqlite3`, manage `RecentVideosState`, register 3 commands.

Frontend (`src/`):
- `lib/recent-videos/types.ts` (create): `RecentVideo`, `RecordRecentVideoRequest`.
- `lib/recent-videos/format-relative-date.ts` (create) + test: pure relative-date helper.
- `lib/subtitles/types.ts` (modify): add `title?`/`thumbnailUrl?` to `LoadedVideo`.
- `components/recent-videos-list.tsx` (create) + test: start-screen grid of cards.
- `App.tsx` (modify): load on mount, render list on start screen, shared `loadFromUrl`, record on load, back-to-list, remove.
- `App.test.tsx` (modify): make existing mocks aware of the two new commands; add recent-videos behavior tests.

Docs:
- `docs/llm/current-behavior.md`, `docs/llm/product-context.md`, `AGENTS.md` (modify): document the feature.

---

## Task 1: Embed title & thumbnail extraction

**Files:**
- Modify: `src-tauri/src/vk/embed.rs`

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `#[cfg(test)] mod tests { ... }` block in `src-tauri/src/vk/embed.rs` (after the last test, before the closing `}`):

```rust
    #[test]
    fn extracts_title_and_thumbnail_from_og_meta() {
        let html = r#"<html><head>
            <meta property="og:title" content="Deutsch lernen &amp; mehr">
            <meta property="og:image" content="https://img.example/preview.jpg">
            </head></html>"#;

        assert_eq!(extract_title(html).as_deref(), Some("Deutsch lernen & mehr"));
        assert_eq!(
            extract_thumbnail(html).as_deref(),
            Some("https://img.example/preview.jpg")
        );
    }

    #[test]
    fn falls_back_to_md_title_when_og_title_absent() {
        let html =
            r#"<html><body>var playerParams = {"md_title":"Easy German 142","subtitles":[]};</body></html>"#;

        assert_eq!(extract_title(html).as_deref(), Some("Easy German 142"));
    }

    #[test]
    fn returns_none_when_no_title_or_thumbnail() {
        let html = r#"<html><head></head><body></body></html>"#;

        assert_eq!(extract_title(html), None);
        assert_eq!(extract_thumbnail(html), None);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri; cargo test --lib vk::embed`
Expected: FAIL to compile — `extract_title` / `extract_thumbnail` not found.

- [ ] **Step 3: Add the extraction functions**

Add these private functions to `src-tauri/src/vk/embed.rs` (place them just above `fn extract_subtitle_array`):

```rust
fn extract_title(html: &str) -> Option<String> {
    extract_meta_content(html, "og:title").or_else(|| extract_md_title(html))
}

fn extract_thumbnail(html: &str) -> Option<String> {
    extract_meta_content(html, "og:image")
}

fn extract_meta_content(html: &str, property: &str) -> Option<String> {
    let tag_pattern = format!(
        r#"(?is)<meta\b[^>]*\b(?:property|name)\s*=\s*["']{}["'][^>]*>"#,
        regex::escape(property)
    );
    let tag_re = Regex::new(&tag_pattern).ok()?;
    let content_re = Regex::new(r#"(?is)\bcontent\s*=\s*["']([^"']*)["']"#).ok()?;

    let tag = tag_re.find(html)?.as_str();
    let content = content_re.captures(tag)?.get(1)?.as_str();
    let decoded = decode_html_entities(content);
    let trimmed = decoded.trim();

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn extract_md_title(html: &str) -> Option<String> {
    let re = Regex::new(r#""md_title"\s*:\s*"((?:\\.|[^"\\])*)""#).ok()?;
    let raw = re.captures(html)?.get(1)?.as_str();
    let decoded = decode_json_string(raw)?;
    let trimmed = decoded.trim();

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri; cargo test --lib vk::embed`
Expected: PASS (new tests green; existing embed tests still green).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vk/embed.rs
git commit -m @'
feat: извлечение заголовка и превью из embed VK

Достаём og:title/og:image (с фолбэком на md_title) из уже скачиваемого embed-HTML, best-effort: отсутствие тегов не ломает загрузку. Нужно для карточек истории недавних видео.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 2: Thread title/thumbnail into VkEmbedMetadata and LoadedVideo

**Files:**
- Modify: `src-tauri/src/vk/embed.rs`
- Modify: `src-tauri/src/vk/command.rs`

- [ ] **Step 1: Update existing tests to expect the new fields (failing)**

In `src-tauri/src/vk/command.rs`, update the three affected tests.

In `loaded_video_serializes_as_camel_case`, add the two fields to the `LoadedVideo { ... }` literal (after `secondary_subtitle_text: ...`):

```rust
            title: Some("Nicos Weg".to_string()),
            thumbnail_url: Some("https://img.example/preview.jpg".to_string()),
```

and add these assertions before the closing `}`:

```rust
        assert_eq!(value["title"], "Nicos Weg");
        assert_eq!(value["thumbnailUrl"], "https://img.example/preview.jpg");
```

In `loaded_video_serializes_absent_secondary_as_null`, add to the `LoadedVideo { ... }` literal:

```rust
            title: None,
            thumbnail_url: None,
```

In `assembles_loaded_video_from_supplied_metadata_and_subtitle_text`, add the two fields to the `VkEmbedMetadata { ... }` literal (after `tracks: vec![selected_track.clone()],`):

```rust
            title: Some("Nicos Weg".to_string()),
            thumbnail_url: Some("https://img.example/preview.jpg".to_string()),
```

and add this assertion before the closing `}`:

```rust
        assert_eq!(video.title.as_deref(), Some("Nicos Weg"));
        assert_eq!(
            video.thumbnail_url.as_deref(),
            Some("https://img.example/preview.jpg")
        );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri; cargo test --lib vk::command`
Expected: FAIL to compile — `LoadedVideo`/`VkEmbedMetadata` have no `title`/`thumbnail_url` fields.

- [ ] **Step 3: Add the fields and pass them through**

In `src-tauri/src/vk/embed.rs`, extend the struct:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VkEmbedMetadata {
    pub embed_url: String,
    pub tracks: Vec<VkSubtitleTrack>,
    pub title: Option<String>,
    pub thumbnail_url: Option<String>,
}
```

In `src-tauri/src/vk/embed.rs`, update the `#[cfg(test)] fn extract_embed_metadata` helper to populate them:

```rust
#[cfg(test)]
fn extract_embed_metadata(html: &str) -> Result<VkEmbedMetadata, VkLoadError> {
    let tracks = extract_tracks(html)?;
    Ok(VkEmbedMetadata {
        embed_url: String::new(),
        tracks,
        title: extract_title(html),
        thumbnail_url: extract_thumbnail(html),
    })
}
```

In `src-tauri/src/vk/embed.rs`, update `fetch_embed_metadata` where it builds `metadata` (replace the `let mut metadata = VkEmbedMetadata { ... }` block):

```rust
    let title = extract_title(&html);
    let thumbnail_url = extract_thumbnail(&html);
    let mut metadata = VkEmbedMetadata {
        embed_url: String::new(),
        tracks,
        title,
        thumbnail_url,
    };
    metadata.embed_url = embed_url;
    Ok(metadata)
```

In `src-tauri/src/vk/command.rs`, extend `LoadedVideo`:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedVideo {
    pub video_id: VkVideoId,
    pub embed_url: String,
    pub tracks: Vec<VkSubtitleTrack>,
    pub selected_track_id: String,
    pub subtitle_text: String,
    pub secondary_track_id: Option<String>,
    pub secondary_subtitle_text: Option<String>,
    pub title: Option<String>,
    pub thumbnail_url: Option<String>,
}
```

In `src-tauri/src/vk/command.rs`, update `assemble_loaded_video` to set them from `metadata` (the `LoadedVideo { ... }` returned at the end):

```rust
    LoadedVideo {
        video_id,
        embed_url: metadata.embed_url,
        tracks: metadata.tracks,
        selected_track_id: selected_track.id,
        subtitle_text,
        secondary_track_id,
        secondary_subtitle_text,
        title: metadata.title,
        thumbnail_url: metadata.thumbnail_url,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri; cargo test --lib vk`
Expected: PASS (embed + command suites green).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vk/embed.rs src-tauri/src/vk/command.rs
git commit -m @'
feat: проброс заголовка и превью в LoadedVideo

VkEmbedMetadata и LoadedVideo получают title/thumbnailUrl (Option), заполняются из embed-HTML и отдаются фронтенду для записи в историю.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 3: recent_videos SQLite module

**Files:**
- Create: `src-tauri/src/recent_videos.rs`

- [ ] **Step 1: Create the module with its tests (failing build)**

Create `src-tauri/src/recent_videos.rs` with the full content below:

```rust
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
        let connection = Connection::open_in_memory().map_err(|_| RecentVideosError::Unavailable)?;
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
```

- [ ] **Step 2: Register the module so it compiles**

In `src-tauri/src/lib.rs`, add the module declaration at the top (keep alphabetical with the existing `mod saved_words; mod vk;`):

```rust
mod recent_videos;
mod saved_words;
mod vk;
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd src-tauri; cargo test --lib recent_videos`
Expected: PASS — all 7 `recent_videos::tests::*` green.

- [ ] **Step 4: Check formatting**

Run: `cd src-tauri; cargo fmt --check`
Expected: no output (clean). If it reports diffs, run `cargo fmt` and re-run the check.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/recent_videos.rs src-tauri/src/lib.rs
git commit -m @'
feat: SQLite-хранилище истории недавних видео

Модуль recent_videos по образцу saved_words: таблица recent_videos, upsert по id с сохранением created_at, эвикция сверх лимита 24, list по last_watched DESC, remove по id, состояние unavailable. Команды пока не зарегистрированы в invoke_handler.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 4: Wire RecentVideosState and commands into the app

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Manage the state and register the commands**

In `src-tauri/src/lib.rs`, inside `.setup(|app| { ... })`, after the existing `app.manage(saved_words);` line, add:

```rust
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
```

Then extend the `tauri::generate_handler![ ... ]` list to include the three new commands (add after `saved_words::remove_saved_word`):

```rust
            saved_words::remove_saved_word,
            recent_videos::list_recent_videos,
            recent_videos::record_recent_video,
            recent_videos::remove_recent_video
        ])
```

- [ ] **Step 2: Verify the backend compiles**

Run: `cd src-tauri; cargo test --lib`
Expected: PASS — entire backend test suite green (no behavior tests for wiring; this confirms compilation and registration).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m @'
feat: регистрация команд истории недавних видео

Поднимаем RecentVideosState из recent-videos.sqlite3 в app data dir (фолбэк unavailable при сбое) и регистрируем list/record/remove_recent_video в invoke_handler.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 5: Frontend types

**Files:**
- Create: `src/lib/recent-videos/types.ts`
- Modify: `src/lib/subtitles/types.ts`

- [ ] **Step 1: Create the recent-videos types**

Create `src/lib/recent-videos/types.ts`:

```ts
export interface RecentVideo {
  id: string;
  url: string;
  ownerId: number;
  videoId: number;
  title: string | null;
  thumbnailUrl: string | null;
  createdAtMs: number;
  lastWatchedAtMs: number;
}

export interface RecordRecentVideoRequest {
  url: string;
  ownerId: number;
  videoId: number;
  title: string | null;
  thumbnailUrl: string | null;
}
```

- [ ] **Step 2: Extend LoadedVideo**

In `src/lib/subtitles/types.ts`, add two optional fields to the `LoadedVideo` interface (after `secondarySubtitleText?: string;`):

```ts
  title?: string;
  thumbnailUrl?: string;
```

- [ ] **Step 3: Verify the type-check passes**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/recent-videos/types.ts src/lib/subtitles/types.ts
git commit -m @'
feat: типы истории недавних видео

RecentVideo/RecordRecentVideoRequest и поля title/thumbnailUrl в LoadedVideo для фронтенда.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 6: Relative-date helper

**Files:**
- Create: `src/lib/recent-videos/format-relative-date.ts`
- Test: `src/lib/recent-videos/format-relative-date.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/recent-videos/format-relative-date.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatRelativeDate } from "./format-relative-date";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeDate", () => {
  it("returns 'только что' for very recent times", () => {
    expect(formatRelativeDate(1000, 1000 + 30_000)).toBe("только что");
  });

  it("returns minutes", () => {
    expect(formatRelativeDate(0, 5 * MINUTE)).toBe("5 мин. назад");
  });

  it("returns hours", () => {
    expect(formatRelativeDate(0, 3 * HOUR)).toBe("3 ч. назад");
  });

  it("returns 'вчера' within the previous day", () => {
    expect(formatRelativeDate(0, 30 * HOUR)).toBe("вчера");
  });

  it("returns days", () => {
    expect(formatRelativeDate(0, 3 * DAY)).toBe("3 дн. назад");
  });

  it("formats an absolute date past a week", () => {
    const ms = Date.UTC(2026, 0, 15);
    const result = formatRelativeDate(ms, ms + 30 * DAY);

    expect(result).toContain("2026");
    expect(result).not.toContain("назад");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/recent-videos/format-relative-date.test.ts`
Expected: FAIL — cannot resolve `./format-relative-date`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/recent-videos/format-relative-date.ts`:

```ts
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeDate(ms: number, nowMs: number): string {
  const diff = nowMs - ms;

  if (diff < MINUTE) {
    return "только что";
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)} мин. назад`;
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)} ч. назад`;
  }
  if (diff < 2 * DAY) {
    return "вчера";
  }
  if (diff < 7 * DAY) {
    return `${Math.floor(diff / DAY)} дн. назад`;
  }

  return new Intl.DateTimeFormat("ru-RU").format(new Date(ms));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/recent-videos/format-relative-date.test.ts`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recent-videos/format-relative-date.ts src/lib/recent-videos/format-relative-date.test.ts
git commit -m @'
feat: относительная дата для карточек истории

Чистая функция formatRelativeDate (только что / N мин./ч. назад / вчера / N дн. назад / абсолютная дата за неделей), детерминированно тестируется через переданный nowMs.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 7: RecentVideosList component

**Files:**
- Create: `src/components/recent-videos-list.tsx`
- Test: `src/components/recent-videos-list.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/recent-videos-list.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RecentVideo } from "@/lib/recent-videos/types";

import { RecentVideosList } from "./recent-videos-list";

function recentVideo(overrides: Partial<RecentVideo> = {}): RecentVideo {
  return {
    id: "-1_2",
    url: "https://vkvideo.ru/video-1_2",
    ownerId: -1,
    videoId: 2,
    title: "Deutsch lernen",
    thumbnailUrl: "https://img.example/preview.jpg",
    createdAtMs: 1000,
    lastWatchedAtMs: 2000,
    ...overrides,
  };
}

describe("RecentVideosList", () => {
  it("renders recent videos with a clickable title", () => {
    render(<RecentVideosList videos={[recentVideo()]} onSelect={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Недавние видео" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deutsch lernen" })).toBeInTheDocument();
  });

  it("renders a quiet empty state", () => {
    render(<RecentVideosList videos={[]} onSelect={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText("История пуста")).toBeInTheDocument();
  });

  it("renders the unavailable state", () => {
    render(<RecentVideosList videos={[]} isUnavailable onSelect={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText("История недоступна")).toBeInTheDocument();
  });

  it("calls onSelect when a card is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RecentVideosList videos={[recentVideo()]} onSelect={onSelect} onRemove={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Deutsch lernen" }));

    expect(onSelect).toHaveBeenCalledWith(recentVideo());
  });

  it("calls onRemove when the remove control is clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<RecentVideosList videos={[recentVideo()]} onSelect={vi.fn()} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "Удалить из истории: Deutsch lernen" }));

    expect(onRemove).toHaveBeenCalledWith(recentVideo());
  });

  it("falls back to a placeholder when the thumbnail fails to load", () => {
    render(<RecentVideosList videos={[recentVideo()]} onSelect={vi.fn()} onRemove={vi.fn()} />);

    fireEvent.error(screen.getByTestId("recent-thumb"));

    expect(screen.getByTestId("recent-thumb-placeholder")).toBeInTheDocument();
  });

  it("uses a fallback label when the title is missing", () => {
    render(
      <RecentVideosList videos={[recentVideo({ title: null })]} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "video-1_2" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/recent-videos-list.test.tsx`
Expected: FAIL — cannot resolve `./recent-videos-list`.

- [ ] **Step 3: Implement the component**

Create `src/components/recent-videos-list.tsx`:

```tsx
import { useState } from "react";
import { X } from "lucide-react";

import { formatRelativeDate } from "@/lib/recent-videos/format-relative-date";
import type { RecentVideo } from "@/lib/recent-videos/types";

type RecentVideosListProps = {
  videos: RecentVideo[];
  isLoading?: boolean;
  isUnavailable?: boolean;
  error?: string;
  onSelect: (video: RecentVideo) => void;
  onRemove: (video: RecentVideo) => void;
};

export function RecentVideosList({
  videos,
  isLoading,
  isUnavailable,
  error,
  onSelect,
  onRemove,
}: RecentVideosListProps) {
  return (
    <section
      aria-label="Недавние видео"
      className="rounded-md border border-slate-800 bg-slate-950/60 p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-slate-200">Недавние</h2>

      {error ? <div className="mb-3 text-xs text-red-300">{error}</div> : null}

      {isUnavailable ? (
        <div className="text-sm text-slate-400">История недоступна</div>
      ) : isLoading ? (
        <div className="text-sm text-slate-400">Загружаю историю...</div>
      ) : videos.length === 0 ? (
        <div className="text-sm text-slate-500">История пуста</div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {videos.map((video) => {
            const title = video.title?.trim() || `video${video.ownerId}_${video.videoId}`;

            return (
              <li key={video.id} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(video)}
                  aria-label={title}
                  className="block w-full overflow-hidden rounded-md border border-slate-800 bg-slate-900/70 text-left transition-colors hover:border-slate-600"
                >
                  <RecentThumbnail url={video.thumbnailUrl} />
                  <div className="p-2">
                    <div className="line-clamp-2 break-words text-sm font-medium text-white">{title}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {formatRelativeDate(video.lastWatchedAtMs, Date.now())}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(video)}
                  aria-label={`Удалить из истории: ${title}`}
                  className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white/90 transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RecentThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        data-testid="recent-thumb-placeholder"
        className="aspect-video w-full bg-slate-800"
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      data-testid="recent-thumb"
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="aspect-video w-full object-cover"
    />
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/recent-videos-list.test.tsx`
Expected: PASS — all 7 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/components/recent-videos-list.tsx src/components/recent-videos-list.test.tsx
git commit -m @'
feat: компонент списка недавних видео

Сетка карточек с превью (плейсхолдер при ошибке загрузки), заголовком (фолбэк на video{owner}_{id}), относительной датой и кнопкой удаления. Состояния загрузки/пусто/недоступно в духе панели слов.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 8: App integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Make existing App tests aware of the new commands**

This step keeps the whole existing suite green once the mount/load calls are added. Do it BEFORE the App code change so the diff is reviewable, but commit it together with the App change in Step 7.

In `src/App.test.tsx`, add the `RecentVideo` import next to the other type imports near the top:

```ts
import type { RecentVideo } from "@/lib/recent-videos/types";
```

Add a `recentVideo()` helper right after the `loadedVideo()` helper (around line 107):

```ts
function recentVideo(overrides: Partial<RecentVideo> = {}): RecentVideo {
  return {
    id: "-1_2",
    url: "https://vkvideo.ru/video-1_2",
    ownerId: -1,
    videoId: 2,
    title: "Deutsch lernen",
    thumbnailUrl: "https://img.example/p.jpg",
    createdAtMs: 1000,
    lastWatchedAtMs: 2000,
    ...overrides,
  };
}
```

In the `describe("App")` `beforeEach`, update the default `mocks.invoke.mockImplementation` (the one ending in `return Promise.resolve(loadedVideo());`) to:

```ts
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") {
        return Promise.resolve([]);
      }
      if (command === "list_recent_videos") {
        return Promise.resolve([]);
      }
      if (command === "record_recent_video") {
        return Promise.resolve(recentVideo());
      }

      return Promise.resolve(loadedVideo());
    });
```

In the shared `setupInvoke` helper (around line 1585), add two cases to the `switch` before `default:`:

```ts
      case "list_recent_videos":
        return Promise.resolve([]);
      case "record_recent_video":
        return Promise.resolve(recentVideo());
```

- [ ] **Step 2: Run the existing suite to confirm it stays green after wiring**

(You cannot fully verify until the App code exists; this is a checkpoint to return to.) Proceed to Step 3.

- [ ] **Step 3: Write the failing behavior tests**

In `src/App.test.tsx`, add a new suite at the end of the file (after the `describe("App player chrome")` block):

```ts
describe("App recent videos", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.parseWebVtt.mockReset();
    mocks.playerProps.current = undefined;
    mocks.parseMap.clear();
    mocks.parseWebVtt.mockImplementation(() => [
      {
        id: "c1",
        startMs: 0,
        endMs: 1000,
        text: "Hello",
        words: [{ id: "c1:0", text: "Hello", cleanText: "Hello" }],
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists recent videos on the start screen", async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_recent_videos") {
        return Promise.resolve([recentVideo({ title: "Deutsch lernen" })]);
      }
      if (command === "list_saved_words") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    expect(await screen.findByRole("button", { name: "Deutsch lernen" })).toBeInTheDocument();
  });

  it("loads a video when a recent card is clicked and records it", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_recent_videos") {
        return Promise.resolve([
          recentVideo({ title: "Deutsch lernen", url: "https://vkvideo.ru/video-1_2" }),
        ]);
      }
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({ title: "Deutsch lernen", thumbnailUrl: "https://img.example/p.jpg" }),
        );
      }
      if (command === "record_recent_video") {
        return Promise.resolve(recentVideo());
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Deutsch lernen" }));

    expect(await screen.findByText(/video_ext\.php/)).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith("load_video_from_url", {
      url: "https://vkvideo.ru/video-1_2",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("record_recent_video", {
      payload: {
        url: "https://vkvideo.ru/video-1_2",
        ownerId: -1,
        videoId: 2,
        title: "Deutsch lernen",
        thumbnailUrl: "https://img.example/p.jpg",
      },
    });
  });

  it("returns to the start screen with the back control", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_recent_videos") {
        return Promise.resolve([recentVideo({ title: "Deutsch lernen" })]);
      }
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") return Promise.resolve(loadedVideo());
      if (command === "record_recent_video") return Promise.resolve(recentVideo());
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await screen.findByText(/video_ext\.php/);

    await user.click(screen.getByRole("button", { name: "← К списку" }));

    expect(await screen.findByRole("button", { name: "Deutsch lernen" })).toBeInTheDocument();
    expect(screen.queryByText(/video_ext\.php/)).not.toBeInTheDocument();
  });

  it("removes a recent video from the start screen", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_recent_videos") {
        return Promise.resolve([recentVideo({ title: "Deutsch lernen" })]);
      }
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "remove_recent_video") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Удалить из истории: Deutsch lernen" }),
    );

    expect(mocks.invoke).toHaveBeenCalledWith("remove_recent_video", { id: "-1_2" });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Deutsch lernen" })).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run: `npx vitest run src/App.test.tsx -t "App recent videos"`
Expected: FAIL — no recent list / back control rendered yet.

- [ ] **Step 5: Add imports and state to App.tsx**

In `src/App.tsx`, add imports (next to the other component/lib imports):

```ts
import { RecentVideosList } from "@/components/recent-videos-list";
import type { RecentVideo, RecordRecentVideoRequest } from "@/lib/recent-videos/types";
```

Add state near the other `useState` declarations (e.g. after the `savedWords` block around line 72-77):

```ts
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [areRecentVideosLoading, setAreRecentVideosLoading] = useState(true);
  const [recentVideosUnavailable, setRecentVideosUnavailable] = useState(false);
  const [recentVideosError, setRecentVideosError] = useState<string | undefined>();
```

Add a mount effect right after the existing saved-words mount effect (the `useEffect(() => { ... void invoke<SavedWord[]>("list_saved_words") ... }, [])` block, around line 120):

```ts
  useEffect(() => {
    let cancelled = false;

    void invoke<RecentVideo[]>("list_recent_videos")
      .then((videos) => {
        if (!cancelled) setRecentVideos(videos);
      })
      .catch(() => {
        if (!cancelled) setRecentVideosUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setAreRecentVideosLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);
```

- [ ] **Step 6: Refactor handleSubmit into loadFromUrl and add recording + handlers**

In `src/App.tsx`, replace the entire `handleSubmit` `useCallback` (currently lines ~347-438) with the following three callbacks (`recordRecentVideo`, `loadFromUrl`, `handleSubmit`). `recordRecentVideo` must be declared before `loadFromUrl` because it is a dependency:

```ts
  const recordRecentVideo = useCallback((loadedVideo: LoadedVideo, sourceUrl: string) => {
    const payload: RecordRecentVideoRequest = {
      url: sourceUrl,
      ownerId: loadedVideo.videoId.ownerId,
      videoId: loadedVideo.videoId.videoId,
      title: loadedVideo.title ?? null,
      thumbnailUrl: loadedVideo.thumbnailUrl ?? null,
    };

    void invoke<RecentVideo>("record_recent_video", { payload })
      .then((saved) => {
        setRecentVideos((list) => [saved, ...list.filter((item) => item.id !== saved.id)]);
      })
      .catch(() => {
        // Recording history is best-effort; never disturb playback.
      });
  }, []);

  const loadFromUrl = useCallback(
    async (rawUrl: string) => {
      const trimmedUrl = rawUrl.trim();
      if (isLoading || !trimmedUrl) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      trackRequestIdRef.current += 1;

      resetWordLookup();
      setIsLoading(true);
      setIsTrackLoading(false);
      setError(undefined);
      setVideo(undefined);
      setLane(undefined);
      setTimeMs(0);
      setHeldSubtitleTimeMs(undefined);
      setSelectedTrackId("");
      setSecondaryLane(undefined);
      setSelectedSecondaryTrackId("");
      setIsSecondaryTrackLoading(false);
      setSecondaryError(undefined);
      secondaryTrackRequestIdRef.current += 1;
      pendingSubtitlePauseRef.current = undefined;

      let loadedVideo: LoadedVideo;

      try {
        loadedVideo = await invoke<LoadedVideo>("load_video_from_url", {
          url: trimmedUrl,
        });
      } catch (loadError) {
        if (requestIdRef.current === requestId) {
          setError(mapLoadError(loadError));
        }
        return;
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }

      if (requestIdRef.current !== requestId) {
        return;
      }

      let cues: SubtitleLane["cues"];

      try {
        cues = parseWebVtt(loadedVideo.subtitleText);
      } catch {
        setError(SUBTITLE_PARSE_ERROR);
        return;
      }

      if (cues.length === 0) {
        setError(SUBTITLE_PARSE_ERROR);
        return;
      }

      setVideo(loadedVideo);
      setSelectedTrackId(loadedVideo.selectedTrackId);
      setLane({
        role: "primary",
        source: "vk-track",
        trackId: loadedVideo.selectedTrackId,
        cues,
      });

      if (loadedVideo.secondaryTrackId && loadedVideo.secondarySubtitleText) {
        try {
          const secondaryCues = parseWebVtt(loadedVideo.secondarySubtitleText);
          if (secondaryCues.length > 0) {
            setSecondaryLane({
              role: "secondary",
              source: "vk-track",
              trackId: loadedVideo.secondaryTrackId,
              cues: secondaryCues,
            });
            setSelectedSecondaryTrackId(loadedVideo.secondaryTrackId);
          }
        } catch {
          // Opora is optional; ignore a parse failure silently.
        }
      }

      recordRecentVideo(loadedVideo, trimmedUrl);
    },
    [isLoading, recordRecentVideo, resetWordLookup],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void loadFromUrl(url);
    },
    [loadFromUrl, url],
  );

  const handleSelectRecentVideo = useCallback(
    (video: RecentVideo) => {
      setUrl(video.url);
      void loadFromUrl(video.url);
    },
    [loadFromUrl],
  );

  const handleRemoveRecentVideo = useCallback(async (video: RecentVideo) => {
    setRecentVideosError(undefined);

    try {
      await invoke("remove_recent_video", { id: video.id });
      setRecentVideos((list) => list.filter((item) => item.id !== video.id));
    } catch {
      setRecentVideosError("Не удалось удалить из истории");
    }
  }, []);

  const handleBackToList = useCallback(() => {
    requestIdRef.current += 1;
    trackRequestIdRef.current += 1;
    secondaryTrackRequestIdRef.current += 1;
    resetWordLookup();
    pendingSubtitlePauseRef.current = undefined;
    playerControlsRef.current = undefined;
    setVideo(undefined);
    setLane(undefined);
    setSecondaryLane(undefined);
    setSelectedTrackId("");
    setSelectedSecondaryTrackId("");
    setSecondaryError(undefined);
    setError(undefined);
    setHeldSubtitleTimeMs(undefined);
    setIsPlaying(false);
  }, [resetWordLookup]);
```

Note: `FormEvent` is already imported in `App.tsx`. The `ChangeEvent` import stays. The old `handleSubmit` used `url` and `isLoading`; that logic now lives in `loadFromUrl`.

- [ ] **Step 7: Render the list on the start screen and the back control**

In `src/App.tsx`, find the `<section className="mx-auto mt-6 max-w-7xl">` block. Replace its body so the loaded-video branch gets a back control and the empty branch renders the list. Change:

```tsx
        {error ? <Alert>{error}</Alert> : null}

        {video && lane ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
```

to:

```tsx
        {error ? <Alert>{error}</Alert> : null}

        {!video || !lane ? (
          <RecentVideosList
            videos={recentVideos}
            isLoading={areRecentVideosLoading}
            isUnavailable={recentVideosUnavailable}
            error={recentVideosError}
            onSelect={handleSelectRecentVideo}
            onRemove={handleRemoveRecentVideo}
          />
        ) : null}

        {video && lane ? (
          <>
            <button
              type="button"
              onClick={handleBackToList}
              className="mb-3 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              ← К списку
            </button>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
```

Then find the matching close of that grid `</div>` and its `) : null}` at the end of the section (currently around lines 861-862):

```tsx
            />
          </div>
        ) : null}
      </section>
```

and change the closing to also close the new fragment:

```tsx
            />
            </div>
          </>
        ) : null}
      </section>
```

(The inner content of the grid — the player column and `<SavedWordsPanel ... />` — is unchanged; only the wrapping `<>...</>` and indentation around it change.)

- [ ] **Step 8: Run the full frontend suite**

Run: `npm test`
Expected: PASS — the new `App recent videos` suite is green and all previously-passing tests remain green.

- [ ] **Step 9: Type-check and build**

Run: `npx tsc -b; npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m @'
feat: история недавних видео на стартовом экране

Список недавних под формой при отсутствии загруженного видео; общий loadFromUrl для формы и клика по карточке; запись в историю после успешной загрузки (best-effort); кнопка "← К списку" сбрасывает плеер; удаление карточки.

Существующие App-тесты научены командам list_recent_videos/record_recent_video в дефолтных моках, иначе дефолт возвращал loadedVideo() на list_recent_videos и список падал на .map стартового экрана.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 9: Documentation and full verification

**Files:**
- Modify: `docs/llm/current-behavior.md`
- Modify: `docs/llm/product-context.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Document the feature in current-behavior.md**

In `docs/llm/current-behavior.md`, add a new section after `## Main User Flow` (before `## Subtitle Track Dropdown`):

```markdown
## Recently Watched

The start screen (when no video is loaded) shows a "Недавние" grid of recently watched videos under the URL form.

Each card shows a best-effort thumbnail and title (parsed from embed `og:image`/`og:title`, falling back to `md_title` and a `video{owner}_{id}` label) plus a relative "last watched" date. Clicking a card reloads that video through the same load path as the URL form. A per-card "×" removes one entry. A "← К списку" control returns from a loaded video to the start screen.

History is automatic: every successful load is recorded via `record_recent_video` (best-effort; a failure never disturbs playback). Entries are deduplicated by `{ownerId}_{videoId}`, ordered by last watched, and capped at the newest 24. Storage is SQLite (`recent-videos.sqlite3`), mirroring saved words; an unavailable store shows "История недоступна" and never blocks video loading.
```

- [ ] **Step 2: Update product-context.md**

In `docs/llm/product-context.md`, under `## Current MVP Capabilities`, add a bullet at the end of the list:

```markdown
- Record an automatic "recently watched" list (SQLite) and reopen a video by clicking a start-screen card instead of pasting a URL.
```

Under `## Non-Goals For Now`, replace the line `- Saved vocabulary/history.` with:

```markdown
- Cloud-synced or cross-device history (local recently-watched history is now in scope; resume position and favorites/pinning are not).
```

- [ ] **Step 3: Update AGENTS.md codebase map**

In `AGENTS.md`, under `## Codebase Map`, add to the Frontend list:

```markdown
- `src/components/recent-videos-list.tsx`: start-screen grid of recently watched videos (thumbnail, title, relative date, remove control).
- `src/lib/recent-videos/types.ts`: recent-video contracts.
- `src/lib/recent-videos/format-relative-date.ts`: relative "last watched" date formatting.
```

and to the Backend list:

```markdown
- `src-tauri/src/recent_videos.rs`: SQLite store and Tauri commands for recently watched videos.
```

- [ ] **Step 4: Run the complete verification suite**

Run:

```powershell
npm test
npm run build
git diff --check
Set-Location src-tauri
cargo test
cargo fmt --check
```

Expected: all green; no whitespace errors; Rust suite and fmt clean. Then return to the repo root (`Set-Location ..`).

- [ ] **Step 5: Run the Tauri production smoke build**

Backend startup wiring and a new SQLite store changed app initialization, so smoke-build it:

Run: `npm run tauri build -- --no-bundle`
Expected: completes and produces `src-tauri/target/release/vk-video-wrapper.exe` (a Node-version warning from the nested `beforeBuildCommand` is a known, harmless caveat).

- [ ] **Step 6: Commit**

```bash
git add docs/llm/current-behavior.md docs/llm/product-context.md AGENTS.md
git commit -m @'
docs: задокументировать историю недавних видео

Раздел "Recently Watched" в current-behavior, capability и уточнение non-goal в product-context, новые файлы в карте кода AGENTS.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Self-Review Notes

- **Spec coverage:** automatic recording (Task 3/8), title+thumbnail (Tasks 1-2, 7), start-screen grid (Tasks 7-8), click-to-load + shared `loadFromUrl` (Task 8), per-card remove (Tasks 7-8), back-to-list (Task 8), dedup by `{ownerId}_{videoId}` + 24-cap eviction (Task 3), `recent-videos-unavailable` (Task 3), best-effort recording that never blocks playback (Task 8), `recent-videos.sqlite3` wiring (Task 4). All present.
- **Type consistency:** Rust `RecentVideo`/`RecordRecentVideoRequest` (snake_case fields, camelCase serde) match the TS `RecentVideo`/`RecordRecentVideoRequest` (camelCase). The `record_recent_video` payload wrapper `{ payload }` matches the `save_word` convention. The `remove_recent_video` `{ id }` arg matches the Tauri command signature. `id` format `{ownerId}_{videoId}` is identical in Rust (`recent_video_id`) and in the frontend fallback label uses `video{ownerId}_{videoId}` (display only, not the id).
- **Out-of-scope kept out:** no resume position, no favorites/pinning, no "clear all", no search.
