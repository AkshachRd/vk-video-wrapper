# VK Video Subtitle Track Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dropdown that lets the user switch the app overlay to any VK-provided subtitle track for the loaded video.

**Architecture:** Keep subtitle file fetching in the Rust/Tauri backend. The frontend lists `LoadedVideo.tracks`, and when the user picks a track it calls a new backend command with `videoId + trackId`; the backend re-fetches embed metadata, finds the track, downloads subtitle text, and returns it for parsing into the existing primary lane.

**Tech Stack:** Tauri 2, Rust, serde, React, TypeScript, Vitest, Testing Library, Tailwind/shadcn-style primitives.

---

## File Structure

- Modify `src-tauri/src/vk/link_parser.rs`: derive `Deserialize` for `VkVideoId` so it can be passed from the frontend to a Tauri command.
- Modify `src-tauri/src/vk/command.rs`: add `LoadedSubtitleTrack`, a testable track-id selector, and `load_subtitle_track`.
- Modify `src-tauri/src/lib.rs`: register `load_subtitle_track`.
- Modify `src/lib/subtitles/types.ts`: add frontend `LoadedSubtitleTrack`.
- Modify `src/App.tsx`: render track dropdown and switch the primary subtitle lane on selection.
- Modify `src/App.test.tsx`: cover dropdown rendering, switching, error preservation, and parsing failure.

## Task 1: Backend Command For Loading A Specific Track

**Files:**
- Modify: `src-tauri/src/vk/link_parser.rs`
- Modify: `src-tauri/src/vk/command.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing backend tests**

Add these tests to `src-tauri/src/vk/command.rs`:

```rust
#[test]
fn loaded_subtitle_track_serializes_as_camel_case() {
    let value = serde_json::to_value(LoadedSubtitleTrack {
        selected_track_id: "de_1_de.vtt".to_string(),
        subtitle_text: "WEBVTT\n\nHallo".to_string(),
    })
    .unwrap();

    assert_eq!(value["selectedTrackId"], "de_1_de.vtt");
    assert_eq!(value["subtitleText"], "WEBVTT\n\nHallo");
}

#[test]
fn selects_requested_track_by_id() {
    let ru = track_with_id("ru_0_ru.vtt");
    let de = track_with_id("de_1_de.vtt");
    let selected = select_track_by_id(&[ru, de.clone()], "de_1_de.vtt").unwrap();

    assert_eq!(selected, de);
}

#[test]
fn returns_subtitles_not_found_for_missing_track_id() {
    let tracks = vec![track_with_id("ru_0_ru.vtt")];

    assert!(matches!(
        select_track_by_id(&tracks, "de_1_de.vtt"),
        Err(crate::vk::errors::VkLoadError::SubtitlesNotFound)
    ));
}

#[test]
fn assembles_loaded_subtitle_track() {
    let selected = track_with_id("de_1_de.vtt");
    let loaded = assemble_loaded_subtitle_track(selected, "WEBVTT\n\nHallo".to_string());

    assert_eq!(loaded.selected_track_id, "de_1_de.vtt");
    assert_eq!(loaded.subtitle_text, "WEBVTT\n\nHallo");
}
```

Also add this helper inside the existing `tests` module:

```rust
fn track_with_id(id: &str) -> VkSubtitleTrack {
    VkSubtitleTrack {
        id: id.to_string(),
        lang: id.split('_').next().unwrap_or("ru").to_string(),
        title: format!("{id}.vtt"),
        url: "https://vkvd737.okcdn.ru/subtitles/test.vtt".to_string(),
        manifest_name: id.to_string(),
        is_auto: false,
        storage_index: 0,
    }
}
```

- [ ] **Step 2: Run backend command tests and verify RED**

Run:

```powershell
cd src-tauri
cargo test vk::command -- --nocapture
cd ..
```

Expected: compile fails because `LoadedSubtitleTrack`, `select_track_by_id`, and `assemble_loaded_subtitle_track` do not exist.

- [ ] **Step 3: Implement backend DTO, selector, and command**

In `src-tauri/src/vk/link_parser.rs`, change the serde import and derive:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VkVideoId {
    pub owner_id: i64,
    pub video_id: i64,
    pub list: Option<String>,
    pub access_key: Option<String>,
}
```

In `src-tauri/src/vk/command.rs`, add:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedSubtitleTrack {
    pub selected_track_id: String,
    pub subtitle_text: String,
}

#[tauri::command]
pub async fn load_subtitle_track(
    video_id: VkVideoId,
    track_id: String,
) -> Result<LoadedSubtitleTrack, String> {
    let metadata = fetch_embed_metadata(&video_id)
        .await
        .map_err(String::from)?;
    let selected_track = select_track_by_id(&metadata.tracks, &track_id).map_err(String::from)?;
    let subtitle_text = fetch_subtitle_text(&selected_track)
        .await
        .map_err(String::from)?;

    Ok(assemble_loaded_subtitle_track(selected_track, subtitle_text))
}

fn select_track_by_id(
    tracks: &[VkSubtitleTrack],
    track_id: &str,
) -> Result<VkSubtitleTrack, super::errors::VkLoadError> {
    tracks
        .iter()
        .find(|track| track.id == track_id)
        .cloned()
        .ok_or(super::errors::VkLoadError::SubtitlesNotFound)
}

fn assemble_loaded_subtitle_track(
    selected_track: VkSubtitleTrack,
    subtitle_text: String,
) -> LoadedSubtitleTrack {
    LoadedSubtitleTrack {
        selected_track_id: selected_track.id,
        subtitle_text,
    }
}
```

In `src-tauri/src/lib.rs`, register both commands:

```rust
.invoke_handler(tauri::generate_handler![
    vk::command::load_video_from_url,
    vk::command::load_subtitle_track
])
```

- [ ] **Step 4: Run backend tests and verify GREEN**

Run:

```powershell
cd src-tauri
cargo test vk::command -- --nocapture
cargo test
cargo fmt --check
cd ..
```

Expected: command tests pass, all Rust tests pass, formatting is clean.

- [ ] **Step 5: Commit backend command**

Run:

```powershell
git add src-tauri/src/vk/link_parser.rs src-tauri/src/vk/command.rs src-tauri/src/lib.rs
git commit -m "feat: add subtitle track loading command"
```

## Task 2: Frontend Dropdown And Track Switching

**Files:**
- Modify: `src/lib/subtitles/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Add tests to `src/App.test.tsx` that:

1. Load a video with two tracks and assert a `Subtitles` combobox appears with both readable labels.
2. Select German and assert `invoke` was called with:

```ts
expect(mocks.invoke).toHaveBeenCalledWith("load_subtitle_track", {
  videoId: { ownerId: -1, videoId: 2 },
  trackId: "de_1_de.vtt",
})
```

3. Resolve the switch with `subtitleText` containing `Hallo Welt`, advance the mocked video time, and assert `Hallo`/`Welt` render.
4. Reject the switch with serialized `subtitles-not-found`, assert old words still render, and assert `This subtitle track is no longer available.` appears.
5. Resolve the switch with unparsable subtitle text and assert old words remain with `Subtitles could not be parsed for this track.`

Use this track fixture shape:

```ts
tracks: [
  {
    id: "ru_0_ru.vtt",
    lang: "ru",
    title: "ru.vtt",
    manifestName: "Русский",
    isAuto: false,
    storageIndex: 0,
    url: "https://vkvd737.okcdn.ru/ru.vtt",
  },
  {
    id: "de_1_de.vtt",
    lang: "de",
    title: "de.vtt",
    manifestName: "Deutsch",
    isAuto: false,
    storageIndex: 1,
    url: "https://vkvd737.okcdn.ru/de.vtt",
  },
]
```

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```powershell
fnm use 24.14.0
npm test -- src/App.test.tsx
```

Expected: tests fail because no dropdown exists and `load_subtitle_track` is not called.

- [ ] **Step 3: Add frontend type**

In `src/lib/subtitles/types.ts`, add:

```ts
export interface LoadedSubtitleTrack {
  selectedTrackId: string
  subtitleText: string
}
```

- [ ] **Step 4: Implement dropdown and switch flow**

In `src/App.tsx`:

1. Import `type ChangeEvent`.
2. Import `type LoadedSubtitleTrack`.
3. Add state:

```ts
const [selectedTrackId, setSelectedTrackId] = useState("");
const [isTrackLoading, setIsTrackLoading] = useState(false);
```

4. After initial successful load, set `selectedTrackId` to `loadedVideo.selectedTrackId`.
5. Add `handleTrackChange(event: ChangeEvent<HTMLSelectElement>)`.
6. In `handleTrackChange`, keep previous subtitles visible, call:

```ts
const loadedTrack = await invoke<LoadedSubtitleTrack>("load_subtitle_track", {
  videoId: video.videoId,
  trackId: nextTrackId,
});
```

7. Parse `loadedTrack.subtitleText`; on success, update the lane and selected track id. On error, keep the old lane and show a track-specific error.
8. Render:

```tsx
<label className="flex items-center gap-2 text-sm text-slate-300">
  <span>Subtitles</span>
  <select aria-label="Subtitles" ...>
    {video.tracks.map((track) => (
      <option key={track.id} value={track.id}>
        {formatTrackLabel(track)}
      </option>
    ))}
  </select>
</label>
```

9. Add helpers:

```ts
function formatTrackLabel(track: SubtitleTrack): string {
  const label = track.manifestName || track.title || track.lang || track.id;
  return track.isAuto ? `${label} auto` : label;
}

function mapTrackLoadError(error: unknown): string {
  const code = typeof error === "string" ? extractErrorCode(error) : error instanceof Error ? error.message : "";
  switch (code) {
    case "subtitles-not-found":
      return "This subtitle track is no longer available.";
    case "subtitle-fetch-failed":
      return "The subtitle file could not be downloaded.";
    case "subtitle-parse-failed":
      return "Subtitles could not be parsed for this track.";
    default:
      return "The subtitle track could not be loaded.";
  }
}
```

- [ ] **Step 5: Run frontend tests and verify GREEN**

Run:

```powershell
fnm use 24.14.0
npm test -- src/App.test.tsx
npm test
npm run build
```

Expected: App tests and full frontend suite pass; TypeScript build passes.

- [ ] **Step 6: Run backend and integrated checks**

Run:

```powershell
cd src-tauri
cargo test
cargo fmt --check
cd ..
fnm use 24.14.0
npm run tauri build -- --no-bundle
```

Expected: Rust tests pass, formatting is clean, and Tauri no-bundle build succeeds.

- [ ] **Step 7: Commit frontend integration**

Run:

```powershell
git add src/lib/subtitles/types.ts src/App.tsx src/App.test.tsx
git commit -m "feat: add subtitle track selector"
```

## Self-Review Checklist

- The backend re-fetches embed metadata before loading a selected track.
- The frontend never fetches subtitle URLs directly.
- Track switch errors keep the previous subtitle lane visible.
- Initial video load behavior and errors remain unchanged.
- The UI only adds one compact dropdown and no translation/dictionary features.
- Tests cover successful switch, missing track, and parse failure.
