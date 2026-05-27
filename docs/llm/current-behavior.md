# Current Behavior Notes For LLM Agents

## Main User Flow

1. User enters a VK Video URL in the input.
2. User clicks `Load`.
3. App clears previous video state and asks the Rust backend to load the video.
4. Backend returns embed URL, video id, subtitle tracks, selected track id, and raw subtitle text.
5. Frontend parses subtitle text into cues and words.
6. VK iframe is rendered.
7. App overlay displays the active subtitle cue based on VK player time.
8. User can switch the app subtitle track with the `Subtitles` dropdown.
9. User can click a word in the overlay to inspect it.

## Subtitle Track Dropdown

The dropdown controls only the app overlay.

It does not control the VK player's built-in subtitle menu, and the VK player's built-in subtitle selection does not control the app overlay.

Track labels use the best available track metadata:
1. `manifestName`
2. `title`
3. `lang`
4. `id`

If a track is automatic, the visible label appends `auto`.

When switching tracks:
- The current video stays loaded.
- The current subtitle lane stays visible while the new track loads.
- On success, the app replaces the primary lane with parsed cues from the new track.
- On failure, the app keeps the old lane and shows an error.

## Automatic And Rolling Subtitles

VK automatic subtitles can arrive as WebVTT with inline timestamp/cue markup, for example timestamp tags around words.

The parser cleans display text and keeps punctuation readable.

Some auto subtitles behave like rolling captions: each cue repeats previous text and appends or shifts a few words. The app normalizes these to more readable cue text so the overlay shows a phrase suitable for reading, not the raw incremental caption stream.

This normalization is important for videos like:

```text
https://vkvideo.ru/video-26086420_456245583
```

## Word Popover

Clicking a subtitle word opens a popover containing only the cleaned word.

The subtitle line still shows the original visible word text, including punctuation where applicable.

The popover is intentionally simple for v1. Do not add translations, dictionary results, or saved-word behavior without a new product decision.

## Pause At Subtitle Boundary

The app supports a reading-oriented interaction:

1. User clicks a word in the current cue.
2. The popover opens.
3. Video continues until the end of that cue.
4. The app pauses the VK player at the cue boundary.
5. The app keeps the clicked cue visible instead of immediately showing the next cue.
6. Late `timeupdate` events after the pause must not replace the held cue with the next cue.

This is implemented by holding subtitle time separately from real playback time while a word is being inspected.

## Releasing A Held Cue

A held cue should be released when:
- The word popover closes.
- Playback starts/resumes after the app-triggered boundary pause.
- A new URL is loaded.
- A different subtitle track is selected.

The held cue should not be released by a `started` or `resumed` event that happens before the cue boundary pause has fired. Otherwise, the planned pause at the end of the cue would be cancelled.

## VK Player Bridge Events

The frontend bridge currently uses these VK player events:

```text
timeupdate
started
resumed
```

`timeupdate` updates current playback time in milliseconds.

`started` and `resumed` are used to release a held inspected subtitle after the user continues playback.

The bridge exposes only the controls currently needed by the app. At present that is `pause()`.

## Error Behavior

Initial load errors can clear the current video because a new video was requested.

Track switch errors should not clear the current video or subtitle lane.

User-facing error categories include:
- Invalid public VK video link.
- Video unavailable without login or otherwise inaccessible.
- No subtitles found.
- Subtitle file could not be downloaded.
- Subtitle text could not be parsed.
- Subtitle track could not be loaded.

## Verification Checklist For Behavior Changes

When touching subtitle or player behavior, run at least:

```powershell
npm test
npm run build
git diff --check
```

When touching Rust backend or VK network parsing, also run:

```powershell
Set-Location src-tauri
cargo test
cargo fmt --check
```

For broad changes, run:

```powershell
npm run tauri build -- --no-bundle
```

Known environment caveat: Tauri build can warn that the nested `beforeBuildCommand` sees Node `20.18.0`, even when the shell uses Node `24.14.0`. The build has still completed successfully in this workspace.

