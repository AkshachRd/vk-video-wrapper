# Current Behavior Notes For LLM Agents

## Main User Flow

1. User enters a VK Video URL in the input.
2. User clicks «Загрузить».
3. App clears previous video state and asks the Rust backend to load the video.
4. Backend returns embed URL, video id, subtitle tracks, selected track id, and raw subtitle text.
5. Frontend parses subtitle text into cues and words.
6. VK iframe is rendered.
7. App overlay displays the active subtitle cue based on VK player time; when a Russian track is available a second read-only reference line is automatically shown below the primary line.
8. User can switch the primary app subtitle track with the «Субтитры» dropdown.
9. User can switch or hide the reference line with the `Перевод` dropdown (includes a "Нет" off option and all available tracks).
10. User can click a word in the primary overlay to inspect it in a dictionary popover and optionally save it to the «Слова» panel.

## Recently Watched

The start screen (when no video is loaded) shows a "Недавние" grid of recently watched videos under the URL form.

Each card shows a best-effort thumbnail and title (parsed from embed `og:image`/`og:title`, falling back to `md_title` and a `video{owner}_{id}` label) plus a relative "last watched" date. Clicking a card reloads that video through the same load path as the URL form. A per-card "×" removes one entry. A "← Назад" control returns from a loaded video to the start screen.

History is automatic: every successful load is recorded via `record_recent_video` (best-effort; a failure never disturbs playback). Entries are deduplicated by `{ownerId}_{videoId}`, ordered by last watched, and capped at the newest 24. Storage is SQLite (`recent-videos.sqlite3`), mirroring saved words; an unavailable store shows "История недоступна" and never blocks video loading.

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

Clicking a subtitle word opens a popover with a dictionary card for that word.

The subtitle line still shows the original visible word text, including punctuation where applicable.

When the primary track language maps to a supported lookup language (`de`/`en`/`ru`, regional variants like `de-DE` included), the frontend calls the Rust `lookup_word` command with the cleaned word and the track language. For unsupported track languages no lookup is started and the popover shows only the cleaned word plus the save-word button.

The dictionary card (ready state) shows:
- The dictionary headword (it can differ from the clicked form) with IPA when available.
- A «ВИКИСЛОВАРЬ · <LANG>» source line, rendered as a link when a source URL is known.
- A «Значение» section with up to six meanings.
- A «Грамматика» section with part of speech and grammar tags when present.

The single dictionary source is Russian Wiktionary data on kaikki.org. The backend allowlists the `kaikki.org` host, sends no-redirect requests with a 5-second timeout and a 512 KiB response cap, retries the lowercase form when the exact form is not found, and keeps an in-memory cache of found/not-found results. Do not add other dictionary providers or lookup languages without a new product decision.

## Word Lookup States

The popover renders one of five lookup states:

- `idle` — no lookup was started (unsupported track language); only the word and the save button are shown.
- `loading` — «Ищу в словаре...» with a spinner.
- `ready` — the dictionary card.
- `not-found` — «Слово не найдено в словаре».
- `unavailable` — «Словарь сейчас недоступен» (network failures, size/time limits, parsing errors).

Only a backend `not-found` error maps to the not-found state; any other lookup error maps to unavailable. Lookup responses are request-id-guarded so a late response cannot overwrite the state for a newer word click. Closing the popover resets the lookup to idle.

## Saved Words

Every popover state includes a save-word button. Its states: «Сохранить слово» (unsaved), «Сохраняю...», «Сохранено», «Удаляю...», and «Сохранение недоступно» (disabled when the store is unavailable). The button toggles: clicking it for an already saved word removes the word.

What gets saved depends on the lookup state. With a ready lookup the app saves the dictionary headword, language, language name, first meaning, source, and source URL. Otherwise it saves the clicked word with the normalized track language (`unknown` fallback) and no meaning — saving works even when the word was not found or the track language is unsupported.

Saved words persist in SQLite (`saved-words.sqlite3`) through the `list_saved_words` / `save_word` / `remove_saved_word` commands. Words are unique per language + normalized (trimmed, lowercased) word; saving an existing pair updates the stored card instead of duplicating it. The backend rejects words without alphanumeric characters.

The «Слова» panel below the player lists saved words newest-first with a counter chip. Each card shows the saved word, its language code, the first meaning (or «без значения»), and a per-card remove control. Panel states: «Загружаю слова...» while loading, «Список слов недоступен» when the store is unavailable, «Сохраненных слов пока нет» when empty. Save/remove failures show small inline errors (under the popover button for save, in the panel for remove) and never clear the existing list.

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

## Custom Player Chrome

The app renders its own control bar over the VK iframe. Controls: play/pause button, elapsed/total time display (H:MM:SS or M:SS format), seek bar, volume slider, and mute toggle. The component is `src/components/player-controls.tsx`; playback is driven through the VK `VideoPlayer` JS API via `src/lib/vk-player/vk-player-bridge.ts`.

`src/App.tsx` owns player state and three operating modes:

- **clean** (default): the iframe has `pointer-events: none`, so VK's own control bar, hover chrome, and logo are covered by the app's overlay and unreachable. The app's control bar and subtitle overlay are visible.
- **vk**: toggled by a corner gear button (top-right). Restores iframe pointer events and hides the app control bar so the user can reach VK's native gear menu for playback speed and quality. Toggling back returns to clean mode.
- **ad** (automatic): when VK fires `adStarted` the app steps aside — iframe pointer events are restored and the app chrome is hidden so the ad's own controls are reachable. On `adCompleted` the app restores clean mode automatically.

Corner buttons in the top-right (visible when not in an ad): the VK-mode toggle (gear icon / X to return) and a fullscreen toggle.

**Confirmed limitations:**
- Playback speed and quality are not exposed by the VK JS API (only `getQuality` read-only). They are reachable only through VK's native gear menu, which is why the vk-mode toggle exists.
- VK's "Watch also" recommendations card and ad creatives render inside the cross-origin iframe and cannot be removed via the API. Clean mode only blocks mouse clicks on them; it does not hide them.

**Phase 2 (planned next):** learning-oriented controls — replay cue, seek-by-cue, keyboard shortcuts.

## VK Player Bridge Events

The bridge listens to and exposes the following VK player events:

```text
timeupdate   — current position in ms
started      — playback first started
resumed      — playback resumed after pause
paused       — playback paused
ended        — video ended
volumechange — volume or mute state changed
adStarted    — VK ad began (app steps aside)
adCompleted  — VK ad finished (app restores clean mode)
```

`timeupdate` drives active cue selection.

`started` and `resumed` release a held inspected subtitle when the user continues playback.

`adStarted` / `adCompleted` drive the automatic ad step-aside mode.

The bridge exposes these control methods: `play()`, `pause()`, `seek(ms)`, `setVolume(0–1)`, `mute()`, `unmute()`.

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

