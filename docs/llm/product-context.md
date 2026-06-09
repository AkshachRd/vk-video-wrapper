# VK Video Wrapper Product Context

## One-Line Summary

VK Video Wrapper is a local Tauri desktop app that lets a user paste a public VK Video URL, load VK-provided subtitles, render them in an app-owned overlay, and click words for a simple word popover.

## Current Product Goal

The project is an MVP for interactive subtitles over VK Video. It is deliberately narrow:
- Prove public VK Video subtitle extraction.
- Prove player-time synchronization.
- Prove clickable subtitle words.
- Keep the architecture open for future dual subtitles or machine translation.

The first version does not try to be a language-learning platform. It is a local utility for watching a known public video with better subtitle interaction.

## User Priorities Captured So Far

The user wants:
- A local Tauri app.
- Public VK videos only.
- Input by plain video link.
- Subtitles taken from VK's own video data, not generated externally.
- Track selection because VK player subtitle selection does not control the app overlay.
- A very simple word popover: only the clicked word for now.
- No machine translation in v1, but architecture should allow either a second subtitle track or machine translation later.
- Smooth reading behavior: when a word is clicked, the current subtitle line should remain visible and readable until the user is done with it.

## Current MVP Capabilities

The app can:
- Parse public `vkvideo.ru/video...` links, including negative owner ids and `list` query values.
- Parse public `vk.com/video...` links.
- Fetch VK embed HTML through the Rust backend.
- Decode embed HTML with charset handling, including Windows-1251.
- Extract subtitle tracks from embed HTML.
- Extract additional subtitle tracks from DASH manifests when VK exposes them there.
- Download subtitle files through the backend.
- Accept known VK/OK CDN subtitle hosts through an allowlist.
- Parse WebVTT/SRT-like subtitle text.
- Clean VK automatic subtitle inline timing and cue tags.
- Normalize rolling automatic captions so the app displays a readable current phrase instead of noisy incremental caption fragments.
- Render a VK iframe player with `js_api=1`.
- Use `VK.VideoPlayer` events for time sync.
- Render an app-owned subtitle overlay over the video.
- Let the user select a VK subtitle track from a dropdown.
- Keep the previous subtitle lane visible if switching tracks fails.
- Show a popover with the clicked word.
- Pause at the end of the current cue after a word click.
- Hold the inspected cue visible across late player time updates.
- Release the held cue when the popover closes or playback resumes.
- Render an optional second read-only reference line in another VK track (auto-selected Russian when available, switchable or dismissible via "Перевод" dropdown).
- Render a custom player control bar (play/pause, seek, time, volume/mute) over the VK iframe and cover VK's native chrome during normal playback (`clean` mode), with a corner-button toggle into VK's native UI (`vk` mode) for speed and quality settings unreachable via the JS API.
- Record an automatic "recently watched" list (SQLite) and reopen a video by clicking a start-screen card instead of pasting a URL.

## Non-Goals For Now

Do not add unless explicitly requested:
- VK login or private videos.
- Searching/browsing VK videos.
- Machine translation UI.
- Dictionary APIs.
- Lemmas, examples, pronunciation, or word notes.
- Cloud-synced or cross-device history (local recently-watched history is now in scope; resume position and favorites/pinning are not).
- Local subtitle file import.
- Manual subtitle editing.
- Controlling the VK player's own subtitle menu.
- Persistent user preferences.
- In-app playback speed or quality controls (no set-speed/setQuality in the VK JS API; reachable only via VK's native gear menu).
- Picture-in-picture (API-limited in the cross-origin iframe context).

## Architecture Overview

The product has two main halves:

1. Rust/Tauri backend owns network access to VK embed pages and subtitle files.
2. React frontend owns UI, subtitle parsing for display, player bridge integration, and overlay interaction.

Important boundary:
- Backend returns raw subtitle text and track metadata.
- Frontend parses subtitle text into cues and words.

This keeps subtitle rendering and interaction easy to iterate on in TypeScript while keeping potentially CORS-sensitive network fetches in Rust.

## Backend Pipeline

The load flow starts with a Tauri command:

```text
load_video_from_url(url)
```

Backend steps:
1. Parse the VK Video URL into a video id object.
2. Fetch VK embed HTML.
3. Extract video/player metadata and subtitle track metadata.
4. Optionally fetch and parse DASH manifest metadata for extra tracks.
5. Select a default track pair via `select_subtitle_pair`: primary = first non-Russian track (else first track), secondary = first Russian track differing from the primary (else none).
6. Download the primary subtitle file; attempt to download the secondary (failure is non-fatal — `secondaryTrackId` and `secondarySubtitleText` will be null).
7. Return loaded video metadata, all known tracks, selected primary track id, optional secondary track id, embed URL, and raw subtitle texts.

Track switching uses:

```text
load_subtitle_track(videoId, trackId)
```

Backend re-fetches metadata before loading a track because subtitle URLs can be signed and temporary.

## Frontend Pipeline

Frontend flow:
1. User submits a URL.
2. `App` invokes `load_video_from_url`.
3. `parseWebVtt` converts raw subtitle text into cues.
4. `VideoPlayer` renders the VK iframe.
5. `VideoPlayer` loads `https://vk.com/js/api/videoplayer.js`.
6. `createVkPlayerBridge` creates `VK.VideoPlayer(iframe)`.
7. Bridge listens to `timeupdate`, `started`, and `resumed`.
8. `timeupdate` drives active cue selection.
9. `SubtitleOverlay` renders words from the active cue.
10. Word click opens a Radix/shadcn popover and arms a pause at the cue boundary.

## Data Model Direction

The UI renders two lanes: a primary interactive lane and an optional read-only reference lane. The model already captures this with:

```ts
type SubtitleLane = {
  role: "primary" | "secondary";
  source: "vk-track" | "machine-translation";
  trackId?: string;
  cues: SubtitleCue[];
};
```

Both current lanes use `source: "vk-track"`. The `machine-translation` source is reserved for a future non-goal and should not be wired up without a product decision.

## Known VK Video Examples

Use these examples for manual testing and reasoning:

```text
https://vkvideo.ru/video-145784486_456239038
https://vkvideo.ru/video-51890028_456242200?list=ln-Cg6C0nEVR81075JXFU
https://vkvideo.ru/video-26086420_456245583
```

Observed cases:
- Videos can expose multiple subtitle tracks.
- VK player subtitle choice does not affect the app overlay.
- Some tracks appear only through DASH metadata.
- Auto-generated subtitles can be rolling/incremental and require normalization.

## Product Risks

The subtitle extraction path is not an official stable API. VK may change embed HTML, DASH manifests, subtitle metadata, or CDN URL behavior.

Subtitle CDN URLs can expire and should be loaded on demand.

The VK iframe is third-party UI inside Tauri WebView2. Some behavior, especially focus, fullscreen, autoplay, and controls, can differ from a browser.

Automatic subtitle quality and formatting varies by video.

## Design Principles

Keep the app utility-like:
- Dense, direct interface.
- No marketing-style landing page.
- Avoid decorative UI.
- Optimize for repeated use: paste link, load, read, click word.

Keep changes scoped:
- Prefer existing components and patterns.
- Add tests around behavior that can regress.
- Avoid broad refactors while VK extraction is still exploratory.

