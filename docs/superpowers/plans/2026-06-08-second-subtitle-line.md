# Second Subtitle Line (Read-Only Reference) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, read-only Russian reference subtitle line below the existing interactive line, with its own track dropdown and an auto-picked default pair (primary = foreign/studied, secondary = Russian).

**Architecture:** The Rust backend selects a *pair* of tracks and returns both (ids + texts) in one `load_video_from_url` response; fetching the secondary is non-fatal. The React frontend stores a second `secondary` lane, renders it through a new read-only `SubtitleReferenceLine` stacked under the interactive `SubtitleOverlay`, and exposes a "Перевод" dropdown that reuses the existing `load_subtitle_track` command. Both lines read the same effective time (`heldSubtitleTimeMs ?? timeMs`), so the existing held-cue/pause behavior covers the opora for free.

**Tech Stack:** Rust (Tauri commands, `reqwest`), React 19 + TypeScript, Vitest + React Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-08-second-subtitle-line-design.md`

---

## File Structure

Backend (`src-tauri/src/vk/`):
- `subtitles.rs` — **modify**: replace `select_primary_track` with `select_subtitle_pair`; update its tests.
- `command.rs` — **modify**: extend `LoadedVideo` with `secondary_track_id` / `secondary_subtitle_text`; fetch the secondary in `load_video_from_url` (non-fatal); update `assemble_loaded_video` and tests; change the import.

Frontend (`src/`):
- `lib/subtitles/types.ts` — **modify**: add `secondaryTrackId?` / `secondarySubtitleText?` to `LoadedVideo`.
- `components/subtitle-reference-line.tsx` — **create**: read-only line component.
- `components/subtitle-reference-line.test.tsx` — **create**: component tests.
- `components/subtitle-overlay.tsx` — **modify**: remove the outer absolute-positioning wrapper (return only the cue bubble); positioning moves into `App`.
- `App.tsx` — **modify**: secondary lane state, secondary parse on load, "Перевод" dropdown + handler, stacking wrapper, single `effectiveTimeMs`.
- `App.test.tsx` — **create**: integration tests for the second-line behaviors.

Docs:
- `AGENTS.md`, `docs/llm/current-behavior.md`, `docs/llm/product-context.md` — **modify**.

---

## Task 1: Backend pair selection (`select_subtitle_pair`)

Replace the Russian-first single selector with a pair selector. The crate must keep compiling, so the only caller (`command.rs`) is updated in the same task to consume the primary half of the pair.

**Files:**
- Modify: `src-tauri/src/vk/subtitles.rs` (function at lines 18-24; tests at lines 155-173)
- Modify: `src-tauri/src/vk/command.rs` (import line 6; usage lines 31-33)

- [ ] **Step 1: Replace the selection tests in `subtitles.rs`**

In `src-tauri/src/vk/subtitles.rs`, replace the three existing tests `prefers_russian_track`, `falls_back_to_first_track`, and `rejects_empty_tracks` (lines 155-173) with these:

```rust
    #[test]
    fn prefers_foreign_track_as_primary_and_russian_as_secondary() {
        let tracks = vec![track("ru", "ru"), track("en", "en")];
        let (primary, secondary) = select_subtitle_pair(&tracks).unwrap();
        assert_eq!(primary.id, "en");
        assert_eq!(secondary.unwrap().id, "ru");
    }

    #[test]
    fn keeps_track_order_when_picking_primary() {
        let tracks = vec![track("ru", "ru"), track("en", "en"), track("de", "de")];
        let (primary, secondary) = select_subtitle_pair(&tracks).unwrap();
        assert_eq!(primary.id, "en");
        assert_eq!(secondary.unwrap().id, "ru");
    }

    #[test]
    fn russian_only_has_no_secondary() {
        let tracks = vec![track("ru", "ru")];
        let (primary, secondary) = select_subtitle_pair(&tracks).unwrap();
        assert_eq!(primary.id, "ru");
        assert!(secondary.is_none());
    }

    #[test]
    fn no_russian_means_no_secondary() {
        let tracks = vec![track("en", "en"), track("de", "de")];
        let (primary, secondary) = select_subtitle_pair(&tracks).unwrap();
        assert_eq!(primary.id, "en");
        assert!(secondary.is_none());
    }

    #[test]
    fn rejects_empty_tracks() {
        assert!(matches!(
            select_subtitle_pair(&[]),
            Err(VkLoadError::SubtitlesNotFound)
        ));
    }
```

- [ ] **Step 2: Run the backend tests to confirm they fail to compile**

Run: `cargo test --manifest-path src-tauri/Cargo.toml select_subtitle_pair`
Expected: compile error — `select_subtitle_pair` is not found (and `select_primary_track` is still referenced in `command.rs`).

- [ ] **Step 3: Implement `select_subtitle_pair` and remove `select_primary_track`**

In `src-tauri/src/vk/subtitles.rs`, replace the whole `select_primary_track` function (lines 18-24) with:

```rust
pub fn select_subtitle_pair(
    tracks: &[VkSubtitleTrack],
) -> Result<(&VkSubtitleTrack, Option<&VkSubtitleTrack>), VkLoadError> {
    let primary = tracks
        .iter()
        .find(|track| !track.lang.eq_ignore_ascii_case("ru"))
        .or_else(|| tracks.first())
        .ok_or(VkLoadError::SubtitlesNotFound)?;

    let secondary = tracks
        .iter()
        .find(|track| track.lang.eq_ignore_ascii_case("ru") && !std::ptr::eq(*track, primary));

    Ok((primary, secondary))
}
```

- [ ] **Step 4: Update the caller in `command.rs` (primary only, contract unchanged this task)**

In `src-tauri/src/vk/command.rs`, change the import on line 6 from:

```rust
use super::subtitles::{fetch_subtitle_text, select_primary_track};
```

to:

```rust
use super::subtitles::{fetch_subtitle_text, select_subtitle_pair};
```

Then replace lines 31-33 (the `select_primary_track(...)?.clone()` block) with a scoped borrow so `metadata` can still be moved into `assemble_loaded_video` later:

```rust
    let selected_track = {
        let (primary, _secondary) = select_subtitle_pair(&metadata.tracks).map_err(String::from)?;
        primary.clone()
    };
```

- [ ] **Step 5: Run the backend tests to confirm they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (all existing tests plus the five new selection tests).

- [ ] **Step 6: Format and commit**

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
git add src-tauri/src/vk/subtitles.rs src-tauri/src/vk/command.rs
git commit -m "$(printf 'feat: выбор пары дорожек субтитров\n\nselect_subtitle_pair заменяет select_primary_track: основная — первая не-русская дорожка (иначе первая), вторая — русская, если есть и отличается от основной.\n\nДефолт меняется с «основная — русская» на «основная — изучаемая», чтобы кликабельная строка была на изучаемом языке.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: Backend contract — return the secondary track

Extend `LoadedVideo` with the optional secondary id + text, and fetch the secondary in `load_video_from_url`. A failed secondary fetch must not fail the load.

**Files:**
- Modify: `src-tauri/src/vk/command.rs` (struct lines 8-16; command lines 25-44; `assemble_loaded_video` lines 65-78; tests lines 131-192)

- [ ] **Step 1: Update the `LoadedVideo` serialization test for the new fields**

In `src-tauri/src/vk/command.rs`, replace the `loaded_video_serializes_as_camel_case` test (lines 131-156) with:

```rust
    #[test]
    fn loaded_video_serializes_as_camel_case() {
        let value = serde_json::to_value(LoadedVideo {
            video_id: VkVideoId {
                owner_id: -1,
                video_id: 2,
                list: None,
                access_key: None,
            },
            embed_url: "https://vk.com/video_ext.php?oid=-1&id=2&hd=2&js_api=1".to_string(),
            tracks: vec![track()],
            selected_track_id: "ru_0_ru_auto.vtt".to_string(),
            subtitle_text: "WEBVTT".to_string(),
            secondary_track_id: Some("ru_1_ru.vtt".to_string()),
            secondary_subtitle_text: Some("WEBVTT\n\nпривет".to_string()),
        })
        .unwrap();

        assert_eq!(value["videoId"]["ownerId"], -1);
        assert_eq!(value["selectedTrackId"], "ru_0_ru_auto.vtt");
        assert_eq!(value["subtitleText"], "WEBVTT");
        assert_eq!(value["secondaryTrackId"], "ru_1_ru.vtt");
        assert_eq!(value["secondarySubtitleText"], "WEBVTT\n\nпривет");
    }

    #[test]
    fn loaded_video_serializes_absent_secondary_as_null() {
        let value = serde_json::to_value(LoadedVideo {
            video_id: VkVideoId {
                owner_id: -1,
                video_id: 2,
                list: None,
                access_key: None,
            },
            embed_url: "https://vk.com/video_ext.php?oid=-1&id=2&hd=2&js_api=1".to_string(),
            tracks: vec![track()],
            selected_track_id: "ru_0_ru_auto.vtt".to_string(),
            subtitle_text: "WEBVTT".to_string(),
            secondary_track_id: None,
            secondary_subtitle_text: None,
        })
        .unwrap();

        assert_eq!(value["secondaryTrackId"], serde_json::Value::Null);
        assert_eq!(value["secondarySubtitleText"], serde_json::Value::Null);
    }
```

- [ ] **Step 2: Update the assembly test for the new `assemble_loaded_video` signature**

In `src-tauri/src/vk/command.rs`, replace the `assembles_loaded_video_from_supplied_metadata_and_subtitle_text` test (lines 168-192) with:

```rust
    #[test]
    fn assembles_loaded_video_from_supplied_metadata_and_subtitle_text() {
        let video_id = VkVideoId {
            owner_id: -1,
            video_id: 2,
            list: None,
            access_key: None,
        };
        let selected_track = track();
        let metadata = VkEmbedMetadata {
            embed_url: "https://vk.com/video_ext.php?oid=-1&id=2&hd=2&js_api=1".to_string(),
            tracks: vec![selected_track.clone()],
        };

        let video = assemble_loaded_video(
            video_id,
            metadata,
            selected_track,
            "WEBVTT\n\nhello".to_string(),
            Some("ru_1_ru.vtt".to_string()),
            Some("WEBVTT\n\nпривет".to_string()),
        );

        assert_eq!(video.selected_track_id, "ru_0_ru_auto.vtt");
        assert_eq!(video.subtitle_text, "WEBVTT\n\nhello");
        assert_eq!(video.secondary_track_id.as_deref(), Some("ru_1_ru.vtt"));
        assert_eq!(
            video.secondary_subtitle_text.as_deref(),
            Some("WEBVTT\n\nпривет")
        );
        assert_eq!(video.tracks.len(), 1);
    }
```

- [ ] **Step 3: Run the backend tests to confirm they fail to compile**

Run: `cargo test --manifest-path src-tauri/Cargo.toml loaded_video`
Expected: compile error — `LoadedVideo` has no field `secondary_track_id`; `assemble_loaded_video` takes 4 args, not 6.

- [ ] **Step 4: Extend the `LoadedVideo` struct**

In `src-tauri/src/vk/command.rs`, replace the struct (lines 8-16) with:

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
}
```

- [ ] **Step 5: Fetch the secondary in `load_video_from_url`**

In `src-tauri/src/vk/command.rs`, replace the body of `load_video_from_url` (currently lines 25-44, including the scoped-borrow block added in Task 1) with:

```rust
#[tauri::command(rename_all = "snake_case")]
pub async fn load_video_from_url(url: String) -> Result<LoadedVideo, String> {
    let video_id = parse_vk_video_url(&url).map_err(String::from)?;
    let metadata = fetch_embed_metadata(&video_id)
        .await
        .map_err(String::from)?;

    let (selected_track, secondary_track) = {
        let (primary, secondary) = select_subtitle_pair(&metadata.tracks).map_err(String::from)?;
        (primary.clone(), secondary.cloned())
    };

    let subtitle_text = fetch_subtitle_text(&selected_track)
        .await
        .map_err(String::from)?;

    let (secondary_track_id, secondary_subtitle_text) = match &secondary_track {
        Some(track) => match fetch_subtitle_text(track).await {
            Ok(text) => (Some(track.id.clone()), Some(text)),
            Err(_) => (None, None),
        },
        None => (None, None),
    };

    Ok(assemble_loaded_video(
        video_id,
        metadata,
        selected_track,
        subtitle_text,
        secondary_track_id,
        secondary_subtitle_text,
    ))
}
```

- [ ] **Step 6: Update `assemble_loaded_video`**

In `src-tauri/src/vk/command.rs`, replace `assemble_loaded_video` (lines 65-78) with:

```rust
fn assemble_loaded_video(
    video_id: VkVideoId,
    metadata: VkEmbedMetadata,
    selected_track: VkSubtitleTrack,
    subtitle_text: String,
    secondary_track_id: Option<String>,
    secondary_subtitle_text: Option<String>,
) -> LoadedVideo {
    LoadedVideo {
        video_id,
        embed_url: metadata.embed_url,
        tracks: metadata.tracks,
        selected_track_id: selected_track.id,
        subtitle_text,
        secondary_track_id,
        secondary_subtitle_text,
    }
}
```

- [ ] **Step 7: Run the backend tests to confirm they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (all tests).

- [ ] **Step 8: Format and commit**

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
git add src-tauri/src/vk/command.rs
git commit -m "$(printf 'feat: возврат второй дорожки из load_video_from_url\n\nLoadedVideo получает secondaryTrackId и secondarySubtitleText; вторая дорожка скачивается там же. Сбой загрузки второй дорожки не валит загрузку видео — поля просто становятся None.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: Frontend type — secondary fields on `LoadedVideo`

**Files:**
- Modify: `src/lib/subtitles/types.ts` (interface lines 38-49)

- [ ] **Step 1: Add the optional fields**

In `src/lib/subtitles/types.ts`, replace the `LoadedVideo` interface (lines 38-49) with:

```ts
export interface LoadedVideo {
  videoId: {
    ownerId: number;
    videoId: number;
    list?: string;
    accessKey?: string;
  };
  embedUrl: string;
  tracks: SubtitleTrack[];
  selectedTrackId: string;
  subtitleText: string;
  secondaryTrackId?: string;
  secondarySubtitleText?: string;
}
```

- [ ] **Step 2: Verify the type compiles**

Run: `npm run build`
Expected: PASS (TypeScript compiles; no runtime change yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/subtitles/types.ts
git commit -m "$(printf 'feat: поля второй дорожки в типе LoadedVideo\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: `SubtitleReferenceLine` read-only component

A presentational line: active cue text only, no buttons, no popover. Uses the real `selectActiveCue` (trivial pure function — no mock).

**Files:**
- Create: `src/components/subtitle-reference-line.tsx`
- Test: `src/components/subtitle-reference-line.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/subtitle-reference-line.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SubtitleLane } from "@/lib/subtitles/types";

import { SubtitleReferenceLine } from "./subtitle-reference-line";

const lane: SubtitleLane = {
  role: "secondary",
  source: "vk-track",
  cues: [
    {
      id: "c0",
      startMs: 1000,
      endMs: 5000,
      text: "Я сегодня иду в кино",
      words: [
        { id: "c0w0", text: "Я", cleanText: "я" },
        { id: "c0w1", text: "сегодня", cleanText: "сегодня" },
      ],
    },
    {
      id: "c1",
      startMs: 6000,
      endMs: 7000,
      text: "Завтра тоже",
      words: [{ id: "c1w0", text: "Завтра", cleanText: "завтра" }],
    },
  ],
};

describe("SubtitleReferenceLine", () => {
  it("renders the active cue as plain text", () => {
    render(<SubtitleReferenceLine lane={lane} timeMs={1200} />);

    expect(screen.getByText("Я сегодня иду в кино")).toBeInTheDocument();
  });

  it("does not render clickable word buttons", () => {
    render(<SubtitleReferenceLine lane={lane} timeMs={1200} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing when no cue is active", () => {
    const { container } = render(<SubtitleReferenceLine lane={lane} timeMs={800} />);

    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- subtitle-reference-line`
Expected: FAIL — cannot resolve `./subtitle-reference-line`.

- [ ] **Step 3: Implement the component**

Create `src/components/subtitle-reference-line.tsx`:

```tsx
import { selectActiveCue } from "@/lib/subtitles/select-active-cue";
import type { SubtitleLane } from "@/lib/subtitles/types";

type SubtitleReferenceLineProps = {
  lane: SubtitleLane;
  timeMs: number;
};

export function SubtitleReferenceLine({ lane, timeMs }: SubtitleReferenceLineProps) {
  const cue = selectActiveCue(lane.cues, timeMs);
  if (!cue) return null;

  return (
    <div className="max-w-4xl rounded-md bg-black/60 px-3 py-1.5 text-center text-lg leading-relaxed text-slate-200/90 shadow">
      {cue.text}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test -- subtitle-reference-line`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/subtitle-reference-line.tsx src/components/subtitle-reference-line.test.tsx
git commit -m "$(printf 'feat: компонент второй строки субтитров (только чтение)\n\nSubtitleReferenceLine рисует активную реплику обычным текстом без кнопок и поповера.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: App integration — second lane, dropdown, stacked layout

This task: (a) moves the bottom positioning out of `SubtitleOverlay` into an `App`-owned wrapper, (b) adds the secondary lane state + "Перевод" dropdown to `App`, and (c) adds an integration test harness. The overlay edit and the wrapper land together so the UI is never in a half-positioned state.

**Files:**
- Modify: `src/components/subtitle-overlay.tsx` (return block lines 49-85)
- Modify: `src/App.tsx`
- Create: `src/App.test.tsx`

- [ ] **Step 1: Confirm the overlay tests are green before refactoring**

Run: `npm test -- subtitle-overlay`
Expected: PASS (baseline).

- [ ] **Step 2: Remove the outer positioning wrapper from `SubtitleOverlay`**

In `src/components/subtitle-overlay.tsx`, replace the entire returned JSX (lines 49-85, the `<div className="pointer-events-none absolute ...">` wrapper down to its closing `</div>`) with the bubble-only version below. Only the outer wrapper is removed; the inner `<div>` and the `cue.words.map(...)` block are unchanged.

```tsx
  return (
    <div className="pointer-events-auto max-w-4xl rounded-md bg-black/70 px-4 py-3 text-center text-2xl leading-relaxed text-white shadow-lg">
      {cue.words.map((word) => {
        const fallbackWord = word.cleanText || word.text;
        const lookup = lookupForWord(wordLookup, fallbackWord);
        const saveControl = getWordSaveControl?.(cue, word, fallbackWord, lookup);

        return (
          <Popover
            key={word.id}
            onOpenChange={(open) => {
              if (open) {
                onWordInspect?.(cue, word);
                return;
              }

              onWordInspectEnd?.();
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="mx-1 rounded-sm px-1 text-white underline-offset-4 transition-colors hover:bg-white/15 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                {word.text}
              </button>
            </PopoverTrigger>
            <PopoverContent aria-label={`Word details: ${fallbackWord}`}>
              <WordLookupPopover fallbackWord={fallbackWord} lookup={lookup} saveControl={saveControl} />
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
```

- [ ] **Step 3: Confirm the overlay tests are still green**

Run: `npm test -- subtitle-overlay`
Expected: PASS (the tests assert roles/text, not positioning).

- [ ] **Step 4: Write the failing App integration tests**

Create `src/App.test.tsx`. This harness mocks `invoke` (dispatched by command name), the `VideoPlayer` (captures its props so the test can drive `onTimeUpdate`), and `parseWebVtt` (maps sentinel strings to fixed cues, decoupling the test from WebVTT formatting).

```tsx
import { act } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LoadedVideo, SubtitleCue } from "@/lib/subtitles/types";

import App from "./App";

const hoisted = vi.hoisted(() => ({
  invoke: vi.fn(),
  playerProps: { current: undefined as undefined | { onTimeUpdate: (ms: number) => void } },
  parseMap: new Map<string, SubtitleCue[]>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: hoisted.invoke }));

vi.mock("@/components/video-player", () => ({
  VideoPlayer: (props: { onTimeUpdate: (ms: number) => void }) => {
    hoisted.playerProps.current = props;
    return <div data-testid="video-player" />;
  },
}));

vi.mock("@/lib/subtitles/parse-webvtt", () => ({
  parseWebVtt: (text: string) => hoisted.parseMap.get(text) ?? [],
}));

const PRIMARY_CUES: SubtitleCue[] = [
  {
    id: "p0",
    startMs: 1000,
    endMs: 5000,
    text: "Bonjour le monde",
    words: [
      { id: "p0w0", text: "Bonjour", cleanText: "Bonjour" },
      { id: "p0w1", text: "le", cleanText: "le" },
      { id: "p0w2", text: "monde", cleanText: "monde" },
    ],
  },
];

const SECONDARY_CUES: SubtitleCue[] = [
  {
    id: "s0",
    startMs: 1000,
    endMs: 2000,
    text: "секунда один",
    words: [{ id: "s0w0", text: "секунда", cleanText: "секунда" }],
  },
  {
    id: "s1",
    startMs: 2000,
    endMs: 5000,
    text: "секунда два",
    words: [{ id: "s1w0", text: "два", cleanText: "два" }],
  },
];

const ENGLISH_CUES: SubtitleCue[] = [
  {
    id: "e0",
    startMs: 1000,
    endMs: 5000,
    text: "hello world",
    words: [{ id: "e0w0", text: "hello", cleanText: "hello" }],
  },
];

function makeTrack(id: string, lang: string, manifestName: string) {
  return { id, lang, title: id, url: "", manifestName, isAuto: false, storageIndex: 0 };
}

const LOADED_VIDEO: LoadedVideo = {
  videoId: { ownerId: -1, videoId: 2 },
  embedUrl: "https://vk.com/video_ext.php?oid=-1&id=2&js_api=1",
  tracks: [
    makeTrack("fr", "fr", "Français"),
    makeTrack("ru", "ru", "Русский"),
    makeTrack("en", "en", "English"),
  ],
  selectedTrackId: "fr",
  subtitleText: "PRIMARY",
  secondaryTrackId: "ru",
  secondarySubtitleText: "SECONDARY_RU",
};

const TEXT_BY_TRACK: Record<string, string> = {
  fr: "PRIMARY",
  ru: "SECONDARY_RU",
  en: "EN",
};

type InvokeOverrides = {
  loadedVideo?: LoadedVideo;
  failSecondarySwitch?: boolean;
};

function setupInvoke(overrides: InvokeOverrides = {}) {
  const loadedVideo = overrides.loadedVideo ?? LOADED_VIDEO;
  hoisted.invoke.mockImplementation((command: string, args?: { trackId?: string }) => {
    switch (command) {
      case "list_saved_words":
        return Promise.resolve([]);
      case "load_video_from_url":
        return Promise.resolve(loadedVideo);
      case "load_subtitle_track":
        if (overrides.failSecondarySwitch) {
          return Promise.reject(new Error("boom"));
        }
        return Promise.resolve({
          selectedTrackId: args?.trackId,
          subtitleText: TEXT_BY_TRACK[args?.trackId ?? ""] ?? "",
        });
      default:
        return Promise.reject(new Error(`unexpected command: ${command}`));
    }
  });
}

async function loadAndPlay(timeMs = 1200) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
  await user.click(screen.getByRole("button", { name: "Load" }));
  await screen.findByTestId("video-player");
  act(() => {
    hoisted.playerProps.current?.onTimeUpdate(timeMs);
  });
  return user;
}

describe("App second subtitle line", () => {
  beforeEach(() => {
    hoisted.invoke.mockReset();
    hoisted.playerProps.current = undefined;
    hoisted.parseMap.clear();
    hoisted.parseMap.set("PRIMARY", PRIMARY_CUES);
    hoisted.parseMap.set("SECONDARY_RU", SECONDARY_CUES);
    hoisted.parseMap.set("EN", ENGLISH_CUES);
    setupInvoke();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("auto-picks the Russian reference line and renders it read-only", async () => {
    render(<App />);
    await loadAndPlay();

    expect(screen.getByText("секунда один")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "секунда один" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bonjour" })).toBeInTheDocument();
  });

  it("keeps the primary line interactive", async () => {
    render(<App />);
    const user = await loadAndPlay();

    await user.click(screen.getByRole("button", { name: "Bonjour" }));

    expect(screen.getByRole("dialog", { name: "Word details: Bonjour" })).toBeInTheDocument();
  });

  it("switches the reference line via the Перевод dropdown", async () => {
    render(<App />);
    const user = await loadAndPlay();

    await user.selectOptions(screen.getByLabelText("Перевод"), "en");

    expect(await screen.findByText("hello world")).toBeInTheDocument();
    expect(screen.queryByText("секунда один")).not.toBeInTheDocument();
    expect(hoisted.invoke).toHaveBeenCalledWith("load_subtitle_track", {
      videoId: LOADED_VIDEO.videoId,
      trackId: "en",
    });
  });

  it("removes the reference line when Нет is selected", async () => {
    render(<App />);
    const user = await loadAndPlay();

    await user.selectOptions(screen.getByLabelText("Перевод"), "");

    expect(screen.queryByText("секунда один")).not.toBeInTheDocument();
    expect(hoisted.invoke).not.toHaveBeenCalledWith(
      "load_subtitle_track",
      expect.anything(),
    );
  });

  it("shows a scoped error and keeps the previous reference line when a switch fails", async () => {
    render(<App />);
    setupInvoke({ failSecondarySwitch: true });
    const user = await loadAndPlay();

    await user.selectOptions(screen.getByLabelText("Перевод"), "en");

    expect(await screen.findByText("Не удалось загрузить вторую дорожку.")).toBeInTheDocument();
    expect(screen.getByText("секунда один")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bonjour" })).toBeInTheDocument();
  });

  it("freezes the reference line at the held time when a primary word is inspected", async () => {
    render(<App />);
    const user = await loadAndPlay(1200);

    expect(screen.getByText("секунда один")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Bonjour" }));

    expect(await screen.findByText("секунда два")).toBeInTheDocument();
    expect(screen.queryByText("секунда один")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the App tests to confirm they fail**

Run: `npm test -- App`
Expected: FAIL — there is no "Перевод" control and no secondary line yet (e.g. `getByLabelText("Перевод")` throws; `getByText("секунда один")` not found).

- [ ] **Step 6: Add the secondary error constant and import in `App.tsx`**

In `src/App.tsx`, add the import next to the other component imports (after the `SubtitleOverlay` import on line 8):

```tsx
import { SubtitleReferenceLine } from "@/components/subtitle-reference-line";
```

Add this constant next to the other error-message constants (after `REMOVE_WORD_ERROR` on line 30):

```tsx
const SECONDARY_TRACK_ERROR = "Не удалось загрузить вторую дорожку.";
```

- [ ] **Step 7: Add secondary state**

In `src/App.tsx`, immediately after the `selectedTrackId` / `isTrackLoading` state declarations (after line 48), add:

```tsx
  const [secondaryLane, setSecondaryLane] = useState<SubtitleLane | undefined>();
  const [selectedSecondaryTrackId, setSelectedSecondaryTrackId] = useState("");
  const [isSecondaryTrackLoading, setIsSecondaryTrackLoading] = useState(false);
  const [secondaryError, setSecondaryError] = useState<string | undefined>();
```

And next to the other refs (after `trackRequestIdRef` on line 57), add:

```tsx
  const secondaryTrackRequestIdRef = useRef(0);
```

- [ ] **Step 8: Reset secondary state on new submit, and parse the auto-picked secondary**

In `handleSubmit`, inside the reset block, after `setSelectedTrackId("");` (line 329) add:

```tsx
      setSecondaryLane(undefined);
      setSelectedSecondaryTrackId("");
      setIsSecondaryTrackLoading(false);
      setSecondaryError(undefined);
      secondaryTrackRequestIdRef.current += 1;
```

Then, on the success path, immediately after the existing `setLane({ role: "primary", ... });` call (lines 369-374) add:

```tsx
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
```

- [ ] **Step 9: Add the secondary track-change handler**

In `src/App.tsx`, add this `useCallback` immediately after `handleTrackChange` (after line 448):

```tsx
  const handleSecondaryTrackChange = useCallback(
    async (event: ChangeEvent<HTMLSelectElement>) => {
      const nextTrackId = event.target.value;
      if (!video || isSecondaryTrackLoading || nextTrackId === selectedSecondaryTrackId) {
        return;
      }

      const secondaryRequestId = secondaryTrackRequestIdRef.current + 1;
      secondaryTrackRequestIdRef.current = secondaryRequestId;
      setSecondaryError(undefined);

      if (nextTrackId === "") {
        setSecondaryLane(undefined);
        setSelectedSecondaryTrackId("");
        return;
      }

      setIsSecondaryTrackLoading(true);

      let loadedTrack: LoadedSubtitleTrack;

      try {
        loadedTrack = await invoke<LoadedSubtitleTrack>("load_subtitle_track", {
          videoId: video.videoId,
          trackId: nextTrackId,
        });
      } catch {
        if (secondaryTrackRequestIdRef.current === secondaryRequestId) {
          setSecondaryError(SECONDARY_TRACK_ERROR);
          setIsSecondaryTrackLoading(false);
        }
        return;
      }

      if (secondaryTrackRequestIdRef.current !== secondaryRequestId) {
        return;
      }

      let secondaryCues: SubtitleLane["cues"];

      try {
        secondaryCues = parseWebVtt(loadedTrack.subtitleText);
      } catch {
        if (secondaryTrackRequestIdRef.current === secondaryRequestId) {
          setSecondaryError(SECONDARY_TRACK_ERROR);
          setIsSecondaryTrackLoading(false);
        }
        return;
      }

      if (secondaryCues.length === 0) {
        if (secondaryTrackRequestIdRef.current === secondaryRequestId) {
          setSecondaryError(SECONDARY_TRACK_ERROR);
          setIsSecondaryTrackLoading(false);
        }
        return;
      }

      setSelectedSecondaryTrackId(loadedTrack.selectedTrackId);
      setSecondaryLane({
        role: "secondary",
        source: "vk-track",
        trackId: loadedTrack.selectedTrackId,
        cues: secondaryCues,
      });
      setIsSecondaryTrackLoading(false);
    },
    [isSecondaryTrackLoading, selectedSecondaryTrackId, video],
  );
```

- [ ] **Step 10: Compute a single effective time**

In `src/App.tsx`, just before the `return (` of the component (after `handleSecondaryTrackChange`), add:

```tsx
  const effectiveTimeMs = heldSubtitleTimeMs ?? timeMs;
```

- [ ] **Step 11: Add the "Перевод" dropdown to the controls row**

In `src/App.tsx`, replace the controls row block (lines 471-491, the `<div className="flex flex-wrap items-center justify-between gap-3">` ... `</div>` that holds "Loaded subtitles" and the "Subtitles" `<label>`) with:

```tsx
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-400">Loaded subtitles</div>
                {video.tracks.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <span>Subtitles</span>
                      <select
                        aria-label="Subtitles"
                        value={selectedTrackId}
                        disabled={isTrackLoading}
                        onChange={handleTrackChange}
                        className="h-9 min-w-40 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50"
                      >
                        {video.tracks.map((track) => (
                          <option key={track.id} value={track.id}>
                            {formatTrackLabel(track)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <span>Перевод</span>
                      <select
                        aria-label="Перевод"
                        value={selectedSecondaryTrackId}
                        disabled={isSecondaryTrackLoading}
                        onChange={handleSecondaryTrackChange}
                        className="h-9 min-w-40 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50"
                      >
                        <option value="">Нет</option>
                        {video.tracks.map((track) => (
                          <option key={track.id} value={track.id}>
                            {formatTrackLabel(track)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {secondaryError ? (
                      <span className="text-sm text-amber-300">{secondaryError}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
```

- [ ] **Step 12: Stack both lines in the player overlay**

In `src/App.tsx`, replace the `<SubtitleOverlay ... />` block inside the `relative aspect-video` container (lines 499-506) with a positioning wrapper that holds the primary overlay plus the optional reference line, and switch the primary overlay's `timeMs` to `effectiveTimeMs`:

```tsx
                <div className="pointer-events-none absolute inset-x-0 bottom-7 flex flex-col items-center gap-1 px-8">
                  <SubtitleOverlay
                    lane={lane}
                    timeMs={effectiveTimeMs}
                    wordLookup={wordLookup}
                    onWordInspect={handleSubtitleWordInspect}
                    onWordInspectEnd={handleSubtitleWordInspectEnd}
                    getWordSaveControl={getWordSaveControl}
                  />
                  {secondaryLane ? (
                    <SubtitleReferenceLine lane={secondaryLane} timeMs={effectiveTimeMs} />
                  ) : null}
                </div>
```

- [ ] **Step 13: Run the App tests to confirm they pass**

Run: `npm test -- App`
Expected: PASS (6 tests).

- [ ] **Step 14: Run the full frontend suite and build**

Run: `npm test`
Expected: PASS (all suites, including `subtitle-overlay` and `subtitle-reference-line`).

Run: `npm run build`
Expected: PASS (TypeScript + Vite build clean).

- [ ] **Step 15: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components/subtitle-overlay.tsx
git commit -m "$(printf 'feat: вторая строка субтитров с выбором языка\n\nApp хранит secondary lane, парсит автоподобранную вторую дорожку при загрузке и даёт дропдаун «Перевод» (с опцией «Нет») поверх load_subtitle_track. Позиционирование вынесено из SubtitleOverlay в общий контейнер-колонку, обе строки используют единое effectiveTimeMs, поэтому удержание реплики и пауза на границе работают и для опоры.\n\nОшибки второй дорожки показываются отдельной строкой рядом с дропдауном и не трогают основную строку и видео.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: Documentation

Bring the docs in line: drop the "one lane" framing and the Russian-first primary note.

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/llm/current-behavior.md`
- Modify: `docs/llm/product-context.md`

- [ ] **Step 1: Update `AGENTS.md`**

In `AGENTS.md`:
- Under "Current MVP behavior", change the line "User can choose among VK-provided subtitle tracks with the app dropdown." to also mention the second line, e.g. add: "User can also enable a second read-only reference line in another VK track via a separate dropdown."
- In "Scope Boundaries", change "One rendered subtitle lane for now." to "One interactive lane plus an optional read-only reference lane."
- In "Codebase Map" (Frontend), add: "`src/components/subtitle-reference-line.tsx`: read-only secondary subtitle line." and note that `src/App.tsx` owns the secondary lane state and the "Перевод" dropdown.
- In "VK Integration Facts", update the default-selection statement: the backend now selects a *pair* — primary prefers a non-Russian (studied) track, secondary prefers Russian — via `select_subtitle_pair`.

- [ ] **Step 2: Update `docs/llm/current-behavior.md`**

In `docs/llm/current-behavior.md`:
- In "Main User Flow", add a step: the app auto-picks a Russian reference line when available and renders it under the primary line; the user can change it with the "Перевод" dropdown or turn it off with "Нет".
- Add a short "Second Reference Line" section: read-only (no word clicks/popover), chosen from VK tracks, default pairing primary = studied/foreign + secondary = Russian, both lines share the same effective time so held-cue and boundary-pause apply to both, secondary load failures are scoped and never clear the video or primary lane.

- [ ] **Step 3: Update `docs/llm/product-context.md`**

In `docs/llm/product-context.md`:
- Move "dual subtitles" from future-facing to current: add a capability line "Render an optional second read-only subtitle line in another VK track."
- Remove "One rendered subtitle lane" implications; keep machine translation as a non-goal (the second line is a VK track only).
- Update the "Backend Pipeline" step that says "Select a default track, currently preferring Russian" to describe pair selection (foreign primary, Russian secondary).

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/llm/current-behavior.md docs/llm/product-context.md
git commit -m "$(printf 'docs: описание второй строки субтитров\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 7: Full verification

- [ ] **Step 1: Frontend checks**

Run: `npm test`
Expected: PASS (all suites).

Run: `npm run build`
Expected: PASS.

Run: `git diff --check`
Expected: no whitespace errors.

- [ ] **Step 2: Backend checks**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
Expected: clean (no diff).

- [ ] **Step 3: Manual smoke check (optional, requires network)**

Run `npm run tauri dev`, load `https://vkvideo.ru/video-26086420_456245583`, and confirm: a primary line plus, when a Russian track exists, a smaller dimmer reference line below it; the "Перевод" dropdown switches/disables the second line; clicking a primary word still opens the popover and holds both lines at the cue.

---

## Self-Review Notes

- **Spec coverage:** pair selection + flip (Task 1); contract + non-fatal secondary fetch (Task 2); TS type (Task 3); read-only component (Task 4); state/dropdown/stacking/effective-time/errors + all listed frontend tests (Task 5); docs (Task 6); verification commands (Task 7).
- **Type consistency:** `select_subtitle_pair` returns `(&VkSubtitleTrack, Option<&VkSubtitleTrack>)` everywhere; `LoadedVideo` secondary fields are `Option<String>` (Rust) / `string | undefined` (TS); `SubtitleReferenceLine` takes `{ lane, timeMs }` in both its impl and all call sites; the error constant is `SECONDARY_TRACK_ERROR` = "Не удалось загрузить вторую дорожку." used in both `App.tsx` and the failure test.
- **No placeholders:** every code step shows complete code; every run step states the expected result.
