# AGENTS.md

## Product

This repository is a local Tauri app for watching public VK Video links with an app-owned interactive subtitle overlay.

Current MVP behavior:
- User pastes a public `vkvideo.ru/video...` or `vk.com/video...` URL.
- Rust backend fetches VK embed metadata and VK-owned subtitle files.
- React frontend renders the VK iframe player and a separate clickable subtitle overlay.
- User can choose among VK-provided subtitle tracks with the app dropdown.
- Clicking a subtitle word opens a small popover showing only that word.
- After a word click, playback pauses at the end of the current cue and keeps that cue visible until the user closes the popover or resumes playback.
- User can also enable a second read-only reference line (another VK track) via a separate "Перевод" dropdown; the app auto-selects a Russian track as the reference when one is available.

Detailed context lives in:
- `docs/llm/product-context.md`
- `docs/llm/current-behavior.md`
- Existing design docs under `docs/superpowers/specs/`

## Scope Boundaries

Keep the MVP small:
- Public videos only.
- VK-provided subtitles only.
- One interactive subtitle lane plus an optional read-only reference lane (both from VK tracks).
- No VK auth.
- No machine translation UI yet.
- No dictionary lookup beyond showing the clicked word.
- No saved words, account system, search, or local subtitle import.

Future architecture should keep room for a machine-translation secondary lane, but do not expose unfinished controls.

## Development Commands

Use PowerShell on Windows from the repository root unless noted.

Recommended checks:

```powershell
npm test
npm run build
git diff --check
```

Rust backend checks:

```powershell
Set-Location src-tauri
cargo test
cargo fmt --check
```

Tauri production build smoke check:

```powershell
npm run tauri build -- --no-bundle
```

## Node And Tauri Notes

The project requires Node `^20.19.0 || >=22.12.0`; this workspace has been verified with Node `24.14.0`.

If the shell Node is too old, run this only for the current shell:

```powershell
fnm use 24.14.0
```

Do not change the user's global/default `fnm` configuration unless explicitly asked.

`npm run tauri build -- --no-bundle` may print a warning from Tauri's nested `beforeBuildCommand` about Node `20.18.0`. In this environment the build still completed successfully and produced `src-tauri/target/release/vk-video-wrapper.exe`.

## Codebase Map

Frontend:
- `src/App.tsx`: top-level app state, load flow, track selection, subtitle hold/pause behavior; owns secondary lane state and the "Перевод" dropdown; owns player state and clean/vk/ad mode switching.
- `src/components/player-controls.tsx`: custom player control bar (play/pause, seek bar, time display, volume/mute).
- `src/components/video-player.tsx`: VK iframe wrapper and bridge initialization.
- `src/components/subtitle-overlay.tsx`: active cue rendering, word buttons, popover lifecycle.
- `src/components/subtitle-reference-line.tsx`: read-only secondary subtitle line (no word clicks, no popover, no dictionary, no saved words).
- `src/lib/vk-player/vk-player-bridge.ts`: thin wrapper around `VK.VideoPlayer`; exposes play/pause/seek/setVolume/mute/unmute and events timeupdate/started/resumed/paused/ended/volumechange/adStarted/adCompleted.
- `src/lib/subtitles/parse-webvtt.ts`: WebVTT/SRT-ish parsing and VK inline markup cleanup.
- `src/lib/subtitles/select-active-cue.ts`: active cue lookup by time.
- `src/lib/subtitles/types.ts`: subtitle and loaded-video contracts.

Backend:
- `src-tauri/src/vk/link_parser.rs`: VK video URL parsing.
- `src-tauri/src/vk/embed.rs`: VK embed HTML/DASH metadata extraction.
- `src-tauri/src/vk/subtitles.rs`: subtitle URL validation and download.
- `src-tauri/src/vk/command.rs`: Tauri commands and loaded-video assembly.
- `src-tauri/src/vk/errors.rs`: error mapping.

## VK Integration Facts

VK's official video API is not used for subtitles. The app relies on public embed data and DASH manifests:
- Build/fetch `https://vk.com/video_ext.php?...`.
- Extract track metadata from embed HTML and, when present, DASH manifests.
- Download selected subtitle files through the Rust backend because direct browser fetch can hit CORS and signed URL constraints.
- `select_subtitle_pair` in `src-tauri/src/vk/subtitles.rs` selects a default pair: primary = first non-Russian track (else first track), secondary = first Russian track that differs from the primary (else none). This replaces the old "prefer Russian for the primary" behavior.

Subtitle URLs are temporary and should not be treated as stable stored data.

Accepted subtitle hosts are intentionally allowlisted in the backend. Do not relax this without tests and a clear reason.

### VK.VideoPlayer JS API Surface (confirmed)

Methods available through the bridge:
`play`, `pause`, `seek(seconds)`, `setVolume(0–1)`, `getVolume()`, `mute()`, `unmute()`, `isMuted()`, `getCurrentTime()`, `getDuration()`, `getQuality()`, `getState()`, `on(event, handler)`, `off(event, handler)`, `destroy()`.

Events fired by VK:
`inited`, `timeupdate`, `volumechange`, `qualitychange`, `started`, `resumed`, `paused`, `seeked`, `ended`, `error`, `adStarted`, `adCompleted`, `fullscreenEnter`, `fullscreenExit`, `recommendationsLoaded`, `recommendationsClicked`.

**There is NO speed/rate method and NO `setQuality` — quality is read-only via `getQuality`.** Playback speed and quality are accessible only through VK's own gear menu (reachable in `vk` mode).

## Testing Expectations

Add tests for behavior changes before changing production code.

Important regression areas:
- Link parsing for `vkvideo.ru` and `vk.com` URLs.
- Embed charset decoding and metadata extraction.
- DASH subtitle track extraction.
- Subtitle host allowlist and fetch limits.
- VK automatic subtitles and rolling-caption normalization.
- Track dropdown success/failure behavior.
- Word popover lifecycle.
- Pause-at-cue-boundary and release-on-playback-resume behavior.

For frontend tests, prefer testing user-visible behavior through React Testing Library. Mocks are acceptable around Tauri `invoke` and the iframe player boundary.

## Collaboration Notes

The user currently prefers working in the main workspace without creating git worktrees.

Do not revert unrelated local changes. If the tree is dirty, inspect before editing and only touch files needed for the task.

Keep UI changes quiet and utility-focused. This is not a landing page or media portal.

