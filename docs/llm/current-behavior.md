# Current Behavior Notes For LLM Agents

## Main User Flow

1. User enters a VK Video URL in the input.
2. User clicks `Load`.
3. App clears previous video state and asks the Rust backend to load the video.
4. Backend returns embed URL, video id, subtitle tracks, selected track id, and raw subtitle text.
5. Frontend parses subtitle text into cues and words.
6. VK iframe is rendered.
7. App overlay displays the active subtitle cue based on VK player time; when a Russian track is available a second read-only reference line is automatically shown below the primary line.
8. User can switch the primary app subtitle track with the `Subtitles` dropdown.
9. User can switch or hide the reference line with the `Перевод` dropdown (includes a "Нет" off option and all available tracks).
10. User can click a word in the primary overlay to inspect it.

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

## Second Reference Line

The app renders an optional second subtitle line below the primary interactive line.

It is read-only: no word clicks, no popover, no dictionary lookup, no saved words.

The default pairing chosen by the backend is primary = studied/foreign track, secondary = Russian track. The user can override the secondary via the "Перевод" dropdown or turn it off with "Нет".

The reference line is aligned to the primary cue, not selected by raw time. The two tracks rarely share identical cue boundaries, so picking the reference cue by time alone makes it drift ahead of or behind the primary line and show the wrong translation. Instead the app picks the reference cue with the greatest time-overlap with the currently active primary cue (`selectAlignedCue`), so both lines switch together. Because the primary cue is computed from the same effective (possibly held) time, the held-cue and pause-at-cue-boundary behavior applies to the reference line automatically.

The reference line keeps a reserved vertical slot even when it has no matching cue, so the primary line stays fixed in place instead of dropping when the reference text is briefly absent.

Secondary load and switch failures show a small scoped inline note. They never clear the video or the primary subtitle lane.

## Fullscreen

The app overlay lives outside the VK iframe, so VK's own fullscreen button (which makes only the cross-origin iframe fullscreen) cannot carry the overlay into the browser top layer. The app therefore provides its own fullscreen button in the top-right corner of the player that requests fullscreen on the app's player container, which holds both the iframe and the overlay, so subtitles stay visible. While fullscreen, the word popover is portaled into that container instead of `document.body`, otherwise it would render outside the top layer and be invisible. VK's native fullscreen button still works but shows only the VK player without the app overlay.

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

