# Mobile Android Layout Design (portrait + landscape)

Date: 2026-06-15

## Goal

Implement the Claude Design **mobile** handoff for the "Змейка 2" identity on top
of the existing desktop app: a phone **portrait** layout (start screen, player
with a reading-area subtitle reader, three bottom sheets) and a phone
**landscape** layout (immersive overlay player with right side-in panels). The
target is a real **Android** Tauri build; the desktop layout stays exactly as it
is and is selected automatically on desktop.

This is an **additive** change: reuse the project's existing React components,
logic, Tauri commands, and design tokens to the maximum. No new product
behavior — the same load/track/lookup/saved-words/recent flows, re-presented for
touch.

The handoff brands the app "ЛУПА / lupa". As with the desktop restyle, that name
is **not** carried over; the app remains `vk-video-wrapper`. (The portrait top
bar's "ЛУПА · VK" kicker is dropped/neutralized — see Decisions.)

## Sources Of Truth

- Mobile handoff bundle: `C:\Users\daniil.khudyakov\Downloads\design_handoff_mobile`
  (to be vendored into `docs/design/snake2-mobile-handoff/` alongside this spec).
  - `README.md` — mobile contract: the two `SnakeBorder` touch upgrades, the
    `--snake-wavelen: 13px` CSS default, portrait/landscape layout specs, the
    "reuse vs rebuild" table, behaviour notes.
  - `files/mobile.css` — portrait layout + bottom sheets (reference).
  - `files/landscape.css` — landscape bezel-free overlay player + side panels
    (reference).
  - `files/app-mobile.jsx`, `files/app-land.jsx`, `files/pieces.jsx`,
    `files/data.jsx` — structure references (mock state / fake bezel are dropped).
  - `files/lupa-mobile-portrait.html`, `files/lupa-mobile-landscape.html` —
    runnable prototypes for side-by-side fidelity checks.
- Desktop design system already in the repo: `docs/design/snake2-handoff/` and
  `docs/superpowers/specs/2026-06-10-snake2-monochrome-restyle-design.md`. The
  mobile work **builds on** it (tokens, `SnakeBorder`, wave, components).
- Fidelity bar (from the handoff): high — layout, spacing, type and the
  hover/press ring are final.

## Decisions Made With The User

1. **Activation = real mobile build, not responsive desktop.** The app picks
   layout by **platform**: Android (and iOS, if ever built) renders the mobile
   shell; desktop renders the current layout. Not a window-width breakpoint, not
   a manual toggle.
2. **Both orientations now**: portrait *and* landscape.
3. **Platform target = Android.** iOS cannot be built from this Windows machine
   (needs macOS); it is out of scope beyond config that doesn't break.
4. **Tauri Android = scaffold + config in this pass.** Add the OS plugin, wire
   `lib.rs`, attempt `tauri android init`, and document the toolchain. A full
   Android build/run is **not** verifiable here (no `ANDROID_HOME`/`NDK_HOME`/
   JDK 17 installed — only a Java 8 stub). This is documented, not a green check.
5. **Refactor: extract a `useVideoApp()` controller hook.** All of today's
   `App.tsx` state, Tauri calls, and handlers move into the hook. `App` becomes a
   thin platform dispatcher; the desktop JSX moves verbatim into `desktop-app.tsx`.
6. **Styling = Tailwind-first**, identical to the desktop decision. Mobile shells
   are Tailwind utilities in JSX; mobile keyframes go into `@theme`. **No**
   shipped `mobile.css`/`landscape.css`, **no** token-alias layer — the existing
   `@theme` tokens are used directly. The handoff CSS files are reference only.

## Architecture

### Layout selection

`App.tsx` becomes a dispatcher:

```tsx
const platform = usePlatform();      // 'mobile' | 'desktop'
const app = useVideoApp();           // shared controller
return platform === "mobile" ? <MobileApp app={app} /> : <DesktopApp app={app} />;
```

- `usePlatform()` — primary signal is `@tauri-apps/plugin-os` `platform()`
  (`android`/`ios` ⇒ `mobile`, else `desktop`). When the plugin is unavailable
  (browser dev, jsdom tests) it returns `desktop`. A dev override
  `?platform=mobile`/`?platform=desktop` query param forces a value for browser
  preview. **Critical constraint:** in jsdom (no plugin, no query) it MUST resolve
  to `desktop` so the existing 55 `<App/>` tests stay green unchanged.
- `useOrientation()` — `matchMedia('(orientation: landscape)')`, returns
  `'portrait' | 'landscape'`, subscribed for live rotation. Used by `MobileApp`
  to switch **component trees** (bottom sheets vs. right panels; scroll column vs.
  overlay player), not just styling.

### Controller hook — `src/lib/app/use-video-app.ts`

Holds everything currently in `App.tsx`: `url`, `video`, `lane`,
`secondaryLane`, track ids + loading flags, `timeMs`/`heldSubtitleTimeMs`,
player state (`isPlaying`, `currentTimeMs`, `durationMs`, `volume`, `muted`,
`isAd`, `playerMode`), `wordLookup`, saved words + pending/fresh state, recent
videos, and all the refs (request ids, pending pause, saved-word dedup sets).
Exposes the same handlers (`loadFromUrl`, `handleSubmit`,
`handleSelectRecentVideo`, `handleRemoveRecentVideo`, `handleBackToList`,
`handleTrackChange`, `handleSecondaryTrackChange`, `handleSubtitleWordInspect`,
`handleSubtitleWordInspectEnd`, `handlePlaybackStart`, `handleTimeUpdate`,
`handlePlayPause`, `handleSeek`, `handleSetVolume`, `handleToggleMute`,
`toggleVkMode`, `getWordSaveControl`, `handleRemoveSavedWord`, the player-bridge
ready callback) plus derived values (`effectiveTimeMs`, `primaryCue`,
`selectedTrack`, `showCustomUi`). Pure data/logic — **no JSX**.

Desktop-only concerns that are *not* in the hook: fullscreen
(`useControlsAutoHide`, `requestFullscreen`, `isFullscreen`, `playerContainer`
ref) stay in `desktop-app.tsx`. Mobile owns its own sheet/panel open-state and
(if needed) its own controls visibility.

### Files

```
src/
  App.tsx                          # → platform dispatcher only
  app/
    desktop-app.tsx                # current desktop JSX, verbatim, consuming the hook
    mobile-app.tsx                 # mobile shell: orientation switch + sheet/panel state
  lib/
    app/use-video-app.ts           # controller hook (extracted from App.tsx)
    platform/use-platform.ts       # 'mobile' | 'desktop'
    platform/use-orientation.ts    # 'portrait' | 'landscape'
  components/mobile/
    mobile-start-screen.tsx        # top bar, wave, URL row + circle CTA, recent list, dock pill
    mobile-recent-card.tsx         # 16:9 thumb, lang/dur chips, play chip, title, relative date
    mobile-player-screen.tsx       # pbar (back + title), video well, control strip, reading area, dock
    mobile-reading-area.tsx        # tappable words + RU reference line (mobile reader)
    landscape-player.tsx           # full-bleed VideoPlayer, top chrome, subs, floating controls, panels
    bottom-sheet.tsx               # portrait sheet shell (backdrop + grab + sheetup)
    side-panel.tsx                 # landscape panel shell (backdrop + panelin from right)
    word-sheet-content.tsx         # word lookup body (shared by portrait sheet + landscape panel)
    saved-words-sheet-content.tsx  # saved words list body
    track-sheet-content.tsx        # tracks/translation selection body
  components/snake-border.tsx      # + `always` prop, pointer events, press-reveal (touch)
  styles.css                       # + mobile keyframes in @theme; drop body min-width
```

### `useVideoApp` reuse map

| Mobile surface | Reused from the controller / existing components |
|---|---|
| Start: URL submit, recents | `loadFromUrl`, `handleSubmit`, `recentVideos`, `handleSelectRecentVideo`, `handleRemoveRecentVideo` |
| Player video well | the **same** `VideoPlayer` (iframe bridge), `blockInput` |
| Control strip / floating controls | `isPlaying`/`currentTimeMs`/`durationMs`/`handlePlayPause`/`handleSeek`; landscape reuses `PlayerControls` |
| Reading area words | `primaryCue.words`, `handleSubtitleWordInspect`, `handleSubtitleWordInspectEnd`, `getWordSaveControl` |
| Word sheet/panel | `wordLookup` (`WordLookupState`) + `getWordSaveControl` (`WordSaveControl`) |
| Saved sheet/panel | `savedWords`, `handleRemoveSavedWord`, pending/fresh state |
| Tracks sheet/panel | `video.tracks`, `selectedTrackId`/`selectedSecondaryTrackId`, `handleTrackChange`/`handleSecondaryTrackChange` |
| Landscape subtitles + ref line | reuse `SubtitleOverlay` (or its word machinery) + `SubtitleReferenceLine` |
| Pause-at-cue / hold | already in the hook; identical on both platforms |

## Component & behaviour specs

### Portrait

- **Start screen**: 60px top safe area; top bar (the handoff's "ЛУПА · VK"
  kicker is dropped — leave the mono kicker slot empty or reuse the desktop
  `Wave` only, per Decision/Goal; no app rename); animated `Wave`; URL row =
  pill input (52px, ink-on-focus) + round 52px black CTA carrying
  `<SnakeBorder shape="circle" always>`; "Недавние" section head with a mono
  count; single-column recent cards (`mobile-recent-card`) with 130px bottom
  padding; bottom dock = centered "Мои слова · N" pill over a top-fading
  gradient, opens the saved sheet.
- **Player screen**: top safe area; pbar with a round back button (snake-host)
  and truncated title; 16:9 rounded `bg-well` video mounting `VideoPlayer`;
  `ВОСПРОИЗВЕДЕНИЕ` pulse dot while playing; control strip (46px play/pause, mono
  timecode, thin seek, ghost captions button → tracks sheet); **reading area**
  (`mobile-reading-area`): the active cue rendered as big tappable `.word`
  buttons (~23px) in a `bg-paper-2` card with a mono label row, plus the RU
  reference line under a hairline when a secondary lane exists; bottom dock as on
  start.
- **Bottom sheets** (`bottom-sheet` shell): dimmed backdrop (tap to close),
  rounded-top sheet sliding up via the `sheetup` keyframe, `max-height: 86%`,
  bottom padding for the home indicator, grab handle.
  - Word sheet → `word-sheet-content`: 30px headword + IPA, source link,
    Значение/Грамматика sections, 56px full-width black **"Сохранить слово"**
    button (snake-host) flipping to a light "Сохранено" state, driven by
    `WordSaveControl` (all five states: unsaved/saving/saved/removing/unavailable).
  - Saved sheet → `saved-words-sheet-content`: "Слова" + count chip, cards with
    `wcardflash` on fresh, "×" remove, empty hint.
  - Tracks sheet → `track-sheet-content`: "Субтитры" and "Перевод" groups of rows;
    selected row solid ink with a tick; "Перевод" includes a "Нет" option.

### Landscape (`landscape-player`)

Bezel-free, video-first overlay (the handoff's `.phone-land`/`.pl-island`/
`.pl-home` bezel is dropped). Full-bleed `VideoPlayer`; top chrome (round back,
title, captions button, "Мои слова · N" pill with an `always` ring; white snake
stroke on video, ink stroke on the dark pill); subtitles centered low (reuse
`SubtitleOverlay` + `SubtitleReferenceLine`); a centered floating control pill
(reuse `PlayerControls`); **right side-in panels** (`side-panel` shell, `panelin`
keyframe) for word/saved/tracks reusing the same `*-sheet-content` bodies.

### `SnakeBorder` touch upgrade (single component, backward compatible)

- Add `always?: boolean`. When set: render with the ring forced visible and run
  the rAF loop continuously (the prototype's `data-always` + remount-on-toggle
  via `key`); used on the portrait circle CTA and the landscape "Мои слова" pill.
- Register pointer listeners so the ring also reveals on `pointerdown` and (when
  not `always`) hides on `pointerup`/`pointercancel` — i.e. press-state on touch.
- **Preserve desktop behaviour**: `mouseenter`/`focus-visible` reveal and the
  existing remeasure-on-start logic stay; the press-reveal is added via a
  `group-active/snake` Tailwind variant alongside the current hover/focus-visible
  variants. No desktop regression.
- `--snake-wavelen: 13px` is already the project default in `styles.css` :root —
  matches the handoff requirement; no change needed.

### Styling specifics

- Add `@keyframes sheetup`, `panelin`, `backin` to the `@theme` block next to the
  existing ones, exposed as `--animate-*` utilities.
- The reading-area word underline reuses the existing `--wave-ink` /
  `uslither` treatment from the desktop subtitle word (same Tailwind `after:`
  pattern as `subtitle-overlay.tsx`).
- Drop `body { min-width: 960px; min-height: 720px }` (it would break portrait).
  Keep a `min-width` only on the desktop root wrapper so the desktop layout
  doesn't collapse. Mobile relies on the platform switch, not viewport width.
- Word entrance animation: **transform only, opacity stays 1**, re-applied per
  cue keyed on `cue.id` (the handoff's hard rule; already how the desktop overlay
  behaves).

## Android scaffold (best-effort here)

- Add `@tauri-apps/plugin-os` (npm) and `tauri-plugin-os` (Cargo); register
  `.plugin(tauri_plugin_os::init())` in `lib.rs`; add the `os:default` permission
  to the desktop+mobile capability set.
- `lib.rs` already has `#[cfg_attr(mobile, tauri::mobile_entry_point)]` — no
  change to the entry point.
- Attempt `npm run tauri android init`. Expected to fail in this environment for
  lack of `ANDROID_HOME`/`NDK_HOME`/JDK 17. Capture the exact failure.
- Write `docs/llm/android-build.md`: prerequisites (JDK 17, Android SDK +
  platform-tools + the NDK, the env vars), and the `tauri android init` /
  `tauri android dev` / `tauri android build` commands. The mobile webview is
  Android System WebView (Chromium) — note that the VK iframe + JS API and the
  CSP must be re-checked on-device (not verifiable here).
- The generated `src-tauri/gen/android` (when produced on a real toolchain) is
  build output; decide ignore-vs-commit in the build doc (default: follow Tauri's
  recommendation to commit it).

## Testing

Add tests before implementation (TDD), test user-visible behaviour through RTL,
mock `invoke` and the iframe boundary (mirror the existing suites).

- **Regression (must stay green, unchanged):** the 55 `App.test.tsx` tests and
  all component tests — guaranteed by `usePlatform()` defaulting to `desktop` in
  jsdom.
- **`use-platform`:** desktop by default (no plugin, no query); `mobile` with the
  dev override; (plugin path can be covered by mocking `@tauri-apps/plugin-os`).
- **`mobile-app`:** renders the portrait tree in portrait and the landscape tree
  in landscape (mock `matchMedia`); opening/closing each sheet/panel.
- **Sheet bodies:** `word-sheet-content` across `WordLookupState` ×
  `WordSaveControl` states (mirror `word-lookup-popover.test`);
  `saved-words-sheet-content` list/empty/remove/fresh; `track-sheet-content`
  primary/secondary selection incl. "Нет".
- **`mobile-reading-area`:** tapping a word calls `onWordInspect`; RU line shown
  only with a secondary lane; entrance does not animate opacity.
- **`SnakeBorder`:** `always` renders the always-on ring and starts the loop;
  press (`pointerdown`) reveals; existing hover/focus-visible tests unaffected.
- **Commands:** `npm test`, `npm run build`, `git diff --check`; `cargo test`,
  `cargo fmt --check`. (`npm run tauri android *` is documented, not run to green.)

## Out Of Scope

- iOS build (config only; not buildable on Windows).
- A full Android build/run/emulator verification (no toolchain here).
- Any new product behaviour, new dictionary sources/languages, VK auth, MT lane,
  or app rename to "ЛУПА".
- Swipe-to-dismiss for sheets (handoff lists it as optional; not in this pass).
- `prefers-reduced-motion` is respected where the existing components already do;
  no new motion knobs.

## Suggested Phasing (for the plan)

1. `SnakeBorder` touch upgrade + mobile keyframes in `@theme` + drop body
   min-width (with tests).
2. `usePlatform`/`useOrientation` + extract `useVideoApp()`; `App` dispatcher;
   `desktop-app.tsx` move (regression suite must stay green).
3. Portrait: start screen, player screen, reading area, three bottom sheets.
4. Landscape: overlay player + right side panels (reusing portrait sheet bodies).
5. Android scaffold: OS plugin, `lib.rs`, capability, `tauri android init`
   attempt, `docs/llm/android-build.md`.
