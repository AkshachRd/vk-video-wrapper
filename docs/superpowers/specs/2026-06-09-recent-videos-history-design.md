# Recent Videos History Design

Date: 2026-06-09

## Goal

Add a persistent "recently watched" list so the user no longer has to paste a VK
Video URL every time. On the start screen (no video loaded), show recently watched
videos as clickable cards with a thumbnail and title. Clicking a card reloads that
video.

This is automatic history: every successfully loaded video is recorded. There is no
manual "save/favorite" action and no pinning in this iteration.

This intentionally extends the previously listed non-goal "Saved vocabulary/history"
in `docs/llm/product-context.md`, because the user explicitly requested watch history.

## Product Scope

In scope:
- Record every successfully loaded video automatically.
- Persist recent videos locally in SQLite, mirroring the `saved_words` pattern.
- Show a recent-videos grid on the start screen (only while no video is loaded).
- Each card shows a best-effort thumbnail and title, plus a relative "last watched" date.
- Clicking a card reloads that video through the existing load flow.
- A per-card "×" control removes a single entry.
- A "← К списку" control returns from a loaded video to the start screen.
- Deduplicate by video identity (`ownerId` + `videoId`); reloading moves the entry to
  the top and refreshes its metadata.
- Cap the list at the newest 24 entries; older entries are evicted automatically.
- Extract best-effort `title` and `thumbnailUrl` from the embed HTML the backend
  already fetches.

Out of scope (YAGNI):
- Manual save/favorite or pinning (history is automatic only).
- Playback position / "continue watching" / resume.
- Search, filters, or sorting controls.
- "Clear all" button (only per-card "×" was requested).
- Accounts, sync, export/import.
- Extra network requests for metadata (title/thumbnail come from the already-fetched
  embed HTML only).

## Chosen Approach

Mirror the proven `saved_words` persistence pattern: a dedicated Rust module backed by
SQLite and exposed through Tauri commands, with a parallel React component and state
boundary in `App`.

History is written **from the frontend after a successful load**, not inside
`load_video_from_url`. Rationale:
- Keeps loading decoupled from persistence, exactly as `saved_words` is decoupled from
  `lookup_word`.
- Avoids recording half-broken loads (e.g. metadata fetched but subtitles unparseable).
- Each side is independently testable (backend with an in-memory DB, frontend with a
  mocked `invoke`).

Rejected alternatives:
- Writing history inside the Rust load command — couples loading and storage, and would
  record videos whose subtitles later fail to parse on the frontend.
- Frontend-only storage (localStorage/IndexedDB) — diverges from the established SQLite
  pattern and still needs backend embed parsing for title/thumbnail anyway.

Storage lives in a dedicated `recent-videos.sqlite3` file with its own `RecentVideosState`,
parallel to `saved-words.sqlite3` / `SavedWordsState`. This keeps each concern's wiring,
migration, and in-memory test variant independent and low-risk. A shared single-file DB
was considered but rejected to avoid refactoring the existing saved-words wiring.

## Data Model

Create a `recent_videos` table during app startup:

```sql
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
```

Field meanings:
- `id`: stable identity in the form `{owner_id}_{video_id}`. Identity ignores `list` and
  `access_key`, so the same video opened from different playlists is one entry.
- `url`: the original loadable URL (the trimmed string the user submitted), reused when a
  card is clicked. It may carry `list`/`access_key`; the latest successful load overwrites it.
- `owner_id`, `video_id`: numeric identity, also enough to reconstruct a URL if needed.
- `title`: best-effort video title; nullable.
- `thumbnail_url`: best-effort preview image URL; nullable.
- `created_at_ms`: first watch time (kept stable across reloads).
- `last_watched_at_ms`: most recent watch time; drives ordering (newest first).

Reloading the same video upserts on `id`: it updates `url`, `title`, `thumbnail_url`, and
`last_watched_at_ms`, preserves `created_at_ms`, and moves the entry to the top.

After each upsert, evict to the newest 24 by `last_watched_at_ms` (delete rows not in the
top 24).

## Backend Architecture

### Embed metadata extraction (`src-tauri/src/vk/embed.rs`)

Extend `VkEmbedMetadata` with:

```rust
pub title: Option<String>,
pub thumbnail_url: Option<String>,
```

Add `extract_title(html)` and `extract_thumbnail(html)`:
- Prefer Open Graph meta tags (`og:title`, `og:image`).
- Fall back to `md_title` (and any equivalent thumbnail field) inside `playerParams`.
- Both are best-effort: a missing value yields `None` and must not fail the load.

`fetch_embed_metadata` populates these from the HTML it already downloads. No new network
requests.

### Load command (`src-tauri/src/vk/command.rs`)

`LoadedVideo` gains:

```rust
pub title: Option<String>,
pub thumbnail_url: Option<String>,
```

passed straight through from `VkEmbedMetadata`. Serialized camelCase as `title` /
`thumbnailUrl`.

### Recent videos module (`src-tauri/src/recent_videos.rs`, new)

Built by analogy to `saved_words.rs`:

```text
pub struct RecentVideo { id, url, ownerId, videoId, title?, thumbnailUrl?, createdAtMs, lastWatchedAtMs }
pub struct RecordRecentVideoRequest { url, ownerId, videoId, title?, thumbnailUrl? }
pub struct RecentVideosState { connection: Option<Mutex<Connection>> }  // + unavailable() + in_memory_for_tests()
```

Functions and commands:

```text
list_recent_videos() -> Vec<RecentVideo>            // ORDER BY last_watched_at_ms DESC, id ASC
record_recent_video(payload: RecordRecentVideoRequest) -> RecentVideo   // upsert on id + evict to 24
remove_recent_video(id: String) -> ()
```

`record_recent_video` upserts on `id` (preserving `created_at_ms`), then evicts beyond the
24-entry cap. The cap is a backend constant so the limit is enforced regardless of caller.

Error categories serialize to a stable shape, mirroring `saved_words`:

```text
recent-videos-unavailable
```

Storage failures must not affect video loading, subtitle parsing, player control, dictionary
lookup, or saved words.

### Startup wiring (`src-tauri/src/lib.rs`)

In `setup()`, resolve the app data dir, open `recent-videos.sqlite3`, migrate, and
`app.manage(RecentVideosState)` (falling back to `unavailable()` on failure, like saved
words). Register `list_recent_videos`, `record_recent_video`, `remove_recent_video` in the
invoke handler.

## Frontend Architecture

### Types (`src/lib/recent-videos/types.ts`, new)

```ts
interface RecentVideo {
  id: string;
  url: string;
  ownerId: number;
  videoId: number;
  title: string | null;
  thumbnailUrl: string | null;
  createdAtMs: number;
  lastWatchedAtMs: number;
}

interface RecordRecentVideoRequest {
  url: string;
  ownerId: number;
  videoId: number;
  title: string | null;
  thumbnailUrl: string | null;
}
```

`LoadedVideo` in `src/lib/subtitles/types.ts` gains `title?: string` and `thumbnailUrl?: string`.

### Component (`src/components/recent-videos-list.tsx`, new)

- Renders a grid of cards: thumbnail, title, relative "last watched" date.
- Thumbnail is an `<img>` whose `onError` swaps to a neutral placeholder box (the VK CDN
  URL may expire, and some videos have no image).
- Title falls back to a `video-{ownerId}_{videoId}` label when null.
- Clicking a card calls `onSelect(url)`.
- A small "×" control per card calls `onRemove(id)` without triggering the card click.
- States: loading, empty (quiet utility copy), unavailable (storage error).
- Quiet, utility-focused styling matching the existing slate/black palette — no hero or
  decorative treatment.

### App state and flow (`src/App.tsx`)

- Load recent videos once on mount via `list_recent_videos` (mirroring the saved-words
  effect); keep `recentVideos` and a `recentVideosUnavailable` flag in state.
- Render `RecentVideosList` under the URL form **only when no video is loaded** (`!video`).
- Extract a shared `loadFromUrl(targetUrl)` used by both the form submit handler and a card
  click, so they share one load path. The form's `handleSubmit` delegates to it.
- After a successful load (video set and primary lane parsed), call `record_recent_video`
  with `{ url, ownerId, videoId, title, thumbnailUrl }` and optimistically move/insert the
  entry at the top of `recentVideos`.
- Add a "← К списку" control, visible while a video is loaded, that resets
  `video`/`lane`/secondary/player state back to the start screen so the list reappears.
- `handleRemoveRecentVideo(id)` calls `remove_recent_video` and removes the entry from
  local state on success.

## Data Flow

1. App starts and asks the backend for `list_recent_videos`.
2. Start screen shows the URL form and, when no video is loaded, the recent-videos grid.
3. User either pastes a URL and submits, or clicks a card. Both call `loadFromUrl(url)`.
4. `load_video_from_url` returns the loaded video including best-effort `title`/`thumbnailUrl`.
5. Frontend parses subtitles and shows the player (existing behavior).
6. On success, frontend calls `record_recent_video` and updates local recent state.
7. Backend upserts the row on identity, preserves `created_at_ms`, refreshes
   `last_watched_at_ms`/metadata, and evicts beyond 24.
8. User clicks "← К списку" to return to the start screen and see the updated grid.
9. Clicking "×" on a card calls `remove_recent_video` and drops it from local state.

Loading a new URL or switching subtitle tracks must not corrupt or clear recent history
beyond the normal record-on-success update.

## Error Behavior

Initial `list_recent_videos` failure:
- show the grid area with a compact unavailable state;
- keep video loading, subtitles, saved words, and dictionary fully usable.

`record_recent_video` failure:
- do not block or fail the load; the video plays normally;
- the entry simply does not appear/refresh in the list (best-effort recording).

`remove_recent_video` failure:
- keep the entry in the list and show a quiet inline note; do not optimistically remove
  unless the backend confirms.

Missing title/thumbnail:
- card shows the `video-{ownerId}_{videoId}` label and/or the placeholder box.

Reloading a card whose video is now unavailable:
- the existing load-error path shows the normal error; the history entry stays.

## Testing

Backend tests (`cargo test`):
- `embed.rs`: extract `title` and `thumbnail_url` from a fixture with og tags; fall back to
  `md_title` when og is absent; both `None` when neither is present, without failing the load.
- `recent_videos.rs`:
  - migration creates the `recent_videos` table;
  - `record_recent_video` inserts a row;
  - reloading the same identity upserts without a duplicate, preserves `created_at_ms`,
    refreshes `last_watched_at_ms` and metadata, and moves it to the top;
  - eviction keeps only the newest 24 by `last_watched_at_ms`;
  - `list_recent_videos` returns newest first;
  - `remove_recent_video` deletes only the matching id;
  - SQLite open/migration/query/insert/delete failures map to `recent-videos-unavailable`.

Frontend tests (`npm test`, RTL with mocked `invoke`):
- `App` loads recent videos on mount.
- Start screen renders the recent-videos grid when no video is loaded.
- Empty state is visible when the list is empty.
- Clicking a card calls the load flow with the card's URL.
- A successful load calls `record_recent_video` and shows the entry at the top.
- "← К списку" returns from a loaded video to the start screen and re-shows the grid.
- Clicking "×" calls `remove_recent_video` and removes the card.
- Thumbnail `onError` falls back to the placeholder.
- Existing subtitle, popover, pause-at-cue-boundary, and saved-words tests continue passing.

Recommended verification:

```powershell
npm test
npm run build
git diff --check
Set-Location src-tauri
cargo test
cargo fmt --check
```

Run the Tauri production smoke build because backend startup wiring and a new SQLite store
change app initialization:

```powershell
npm run tauri build -- --no-bundle
```

## Future Extensions

Potential follow-ups, explicitly deferred:
- "Continue watching" with stored playback position.
- Manual favorites/pinning that survive eviction.
- "Clear all" history control.
- Search and language filters over history.
- Sharing one SQLite file across saved words and recent videos behind a small app-db module.
