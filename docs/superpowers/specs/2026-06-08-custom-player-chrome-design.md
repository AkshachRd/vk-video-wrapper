# Custom Player Chrome (Phase 1) Design

Date: 2026-06-08

## Goal

Replace the visible VK Video player UI with our own clean control bar, so the app
looks and behaves like a single integrated player instead of an embedded VK
iframe. During normal playback the user sees only our controls and the app
subtitle overlay; VK's logo, control bar, recommendation cards, and menus are
covered. A small escape hatch keeps VK's native settings (speed and quality)
reachable when needed.

This is Phase 1 of a two-phase effort:
- **Phase 1 (this spec):** custom control bar, clean cover of VK chrome,
  ad-aware behavior, and a "VK" toggle for speed/quality.
- **Phase 2 (separate spec, later):** learning-oriented controls — replay current
  cue, jump to previous/next cue, click a subtitle word/line to seek, and keyboard
  shortcuts. These build on Phase 1's expanded bridge.

## Product Scope

In scope (Phase 1):
- A custom control bar overlaying the bottom of the player: play/pause, a seek
  bar (scrub + elapsed), current time / duration, volume + mute, the existing
  app fullscreen button, and a "VK" toggle.
- Clean cover: VK's own controls/menus/logo/cards stay hidden during normal
  playback by making the iframe ignore mouse input.
- Ad-aware mode: detect VK ads and step aside so ads stay usable.
- "VK" toggle: temporarily switch to VK's native UI to use speed/quality, then
  return to the clean custom UI.
- Expanded VK player bridge exposing the full confirmed API.

Out of scope (Phase 1):
- Learning controls (replay/seek-by-cue, keyboard shortcuts) — Phase 2.
- Playback speed and quality selection as *native app controls*. The VK JS API
  exposes neither a speed method nor a `setQuality` method (see API findings), so
  both remain only inside VK's gear menu, reached via the "VK" toggle.
- Picture-in-picture, chromecast, or other VK-native features not in the JS API.
- Removing VK ads or VK recommendation cards (not possible via the API; we cover
  or step aside, we do not suppress).

## Autoplay Spike Result (2026-06-09, WebView2)

Verified in the running Tauri app with a temporary probe button wired to the
bridge `play()`. On a fresh load, clicking our custom play (without ever touching
VK's own controls) starts playback **with sound** — no muted-autoplay restriction,
no `autoplaySoundProhibited` hint. **Conclusion: custom play drives playback
directly; no first-play fallback (no "start via VK first" path) is needed.**

Also observed during the spike: VK's "Watch also" recommendations card appears
over the video (bottom-right) during playback. It is an in-iframe VK element with
no API method or embed param to disable it (`recommendationsLoaded` /
`recommendationClicked` are observe-only). Clean mode (`pointer-events:none`)
prevents clicking it but does not stop it rendering. Fully removing all VK chrome
(this card and ads) is only possible by not using VK's iframe player at all
(playing the raw stream in our own `<video>`), which is a separate, larger effort
(signed URLs, possible DRM, ToS) and out of scope for Phase 1.

## VK Player JS API Findings (verified from videoplayer.js)

The player object returned by `new VK.VideoPlayer(iframe)` (from
`https://vk.com/js/api/videoplayer.js`) was read directly. It is a thin
`postMessage` wrapper. Exact surface:

Methods:
- `play()` → posts `{method:"play"}`
- `pause()` → `{method:"pause"}`
- `seek(time)` → `{method:"seek", time}` (time in seconds)
- `seekLive()` → `{method:"seekLive"}`
- `setVolume(value)` → `{method:"set_volume", volume}` (0..1); also clears muted
- `getVolume()`, `getCurrentTime()`, `getDuration()`, `getQuality()` — return the
  last cached state (no network call)
- `mute()`, `unmute()`, `isMuted()`
- `getState()`, `getErrorCode()`
- `on(event, cb)`, `off(event, cb)`, `destroy()`

There is **no** speed/rate method and **no** `setQuality` — quality is read-only.

Events (`VK.VideoPlayer.Events`): `inited`, `timeupdate`, `volumechange`,
`qualitychange`, `started`, `resumed`, `paused`, `seeked`, `ended`, `error`,
`adStarted`, `adCompleted`, `autoplaySoundProhibited`, `fullscreenEnter`,
`fullscreenExit`, `recommendationsLoaded`, `recommendationClicked`.

States (`VK.VideoPlayer.States`): `uninited`, `unstarted`, `playing`, `paused`,
`ended`, `error`.

Every event callback receives a payload merged with the cached state fields
`{state, volume, muted, time, duration, quality, errorCode}`. `adStarted` /
`adCompleted` additionally carry `{section}`; recommendation events carry video
data. So `timeupdate`/`started` give `time` and `duration`; `volumechange` gives
`volume` and `muted`.

## Architecture Overview

The split is unchanged: Rust owns network/subtitles; React owns UI and player
integration. Phase 1 changes are entirely frontend.

Layers touched:
1. `src/lib/vk-player/vk-player-bridge.ts` — expand to the full API + richer
   event forwarding.
2. `src/components/video-player.tsx` — forward new callbacks; add a `blockInput`
   prop that toggles iframe `pointer-events`.
3. `src/components/player-controls.tsx` (new) — presentational control bar.
4. `src/App.tsx` — own player state + modes, wire controls, render the bar.

## Bridge Design (`vk-player-bridge.ts`)

Expand the `VkPlayer` type to include the methods used and the new events. The
bridge keeps using `playerFactory` injection for tests.

New controls contract:

```ts
export type VkPlayerControls = {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(value: number): void; // 0..1
  mute(): void;
  unmute(): void;
  destroy(): void;
};
```

New options/callbacks:

```ts
type CreateVkPlayerBridgeOptions = {
  iframe: HTMLIFrameElement;
  onTimeUpdate: (timeMs: number) => void;
  onDurationChange?: (durationMs: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
  onVolumeChange?: (state: { volume: number; muted: boolean }) => void;
  onAdChange?: (isAd: boolean) => void;
  onPlaybackStart?: () => void; // unchanged: releases a held subtitle cue
  playerFactory?: (iframe: HTMLIFrameElement) => VkPlayer;
};
```

Event mapping:
- `timeupdate` → `onTimeUpdate(round(time*1000))`; also `onDurationChange` when
  `duration` present and changed.
- `started`, `resumed` → `onPlayingChange(true)` + `onPlaybackStart()` (keep the
  existing held-cue release).
- `paused`, `ended` → `onPlayingChange(false)`.
- `volumechange` → `onVolumeChange({ volume, muted })`.
- `adStarted` → `onAdChange(true)`; `adCompleted` → `onAdChange(false)`.
- `duration` arrives on most payloads; forward via `onDurationChange` when known.

`seek` converts seconds (the bridge takes seconds to match the VK method; App
converts ms→seconds at the call site, or the bridge accepts ms and divides —
**decision: bridge `seek` takes seconds**, App converts, to keep the bridge a
faithful 1:1 wrapper of the VK method).

The bridge unsubscribes all handlers and calls `player.destroy()` on `destroy()`.

## VideoPlayer Design (`video-player.tsx`)

- Accept the new optional callbacks and pass them into `createVkPlayerBridge`.
- `onControlsReady` now surfaces the full `VkPlayerControls` (not just `pause`).
- New prop `blockInput: boolean`. When true, the iframe gets `pointer-events-none`
  (clean mode); when false, `pointer-events-auto` (VK/ad mode). Default true.

## Control Bar Design (`player-controls.tsx`, new)

Presentational, no VK knowledge. Props:

```ts
type PlayerControlsProps = {
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  volume: number;       // 0..1
  muted: boolean;
  isFullscreen: boolean;
  isVkMode: boolean;
  onPlayPause: () => void;
  onSeek: (timeMs: number) => void;
  onSetVolume: (value: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleVkMode: () => void;
};
```

Layout (left→right): play/pause button, `current / duration` time text, a seek
range input (0..durationMs, value clamped to currentTimeMs, `onChange` →
`onSeek`), a volume control (mute toggle + range 0..1), the "VK" toggle button,
and the fullscreen button (moves here from its current standalone position).

Visuals: a translucent bar (`bg-black/70`) pinned to the bottom of the player
container, `pointer-events-auto`, lucide icons (`Play`, `Pause`, `Volume2`,
`VolumeX`, `Maximize2`, `Minimize2`). Time formatted `H:MM:SS` / `M:SS`.

The seek input shows elapsed only (the API exposes no buffered range).

## App Integration (`App.tsx`)

New state:
- `isPlaying`, `currentTimeMs`, `durationMs`, `volume`, `muted` — from bridge
  callbacks.
- `isAd: boolean` — from `onAdChange`.
- `playerMode: "clean" | "vk"` — user toggle; `isAd` overrides to VK-like input.

Derived:
- `blockInput = playerMode === "clean" && !isAd` → passed to `VideoPlayer`.
- Control bar is shown when `playerMode === "clean" && !isAd`; hidden in VK/ad
  mode so VK's own UI is usable.

Wiring (handlers call `playerControlsRef.current`):
- `onPlayPause` → `isPlaying ? pause() : play()`.
- `onSeek(ms)` → `seek(ms / 1000)`; optimistic `setCurrentTimeMs(ms)`.
- `onSetVolume(v)` → `setVolume(v)`.
- `onToggleMute` → `muted ? unmute() : mute()`.
- `onToggleVkMode` → flip `playerMode`.
- Fullscreen handler stays as already implemented.

`currentTimeMs` continues to feed the subtitle overlay via the existing
`effectiveTimeMs`/held-cue logic. The bridge's `onTimeUpdate` already updates
`timeMs`; the held-cue pause logic stays intact.

Ad handling: when `isAd` becomes true, `blockInput` flips false and the bar
hides, so the VK ad (and any skip button) is interactive. When false again, clean
mode resumes.

## Risks And Mitigations

1. **Autoplay / user-gesture across the iframe (highest risk).** `play()` is a
   `postMessage`; the browser may not treat it as a user gesture for the
   cross-origin media, so the first play could be blocked or forced-muted
   (`autoplaySoundProhibited`). **Mitigation:** the first implementation task is a
   runtime spike in WebView2 — call `play()` from our button on a fresh load and
   observe. If sound is blocked: fall back so the *first* start happens in VK mode
   (user clicks VK's play once), after which API control + clean mode take over;
   surface `autoplaySoundProhibited` by showing an unmute affordance. The spike
   result is recorded in the plan before the control bar is finalized.
2. **Residual VK auto-cards.** `recommendationsLoaded` / "Watch also" render in
   the iframe; `pointer-events:none` neutralizes clicks but they may still be
   visible. We may add a mask over common regions, but full suppression is not
   possible. Accept minor residual visibility.
3. **No buffered range.** Seek bar shows elapsed only.
4. **Seek precision.** Relies on VK's `seek`; acceptable for navigation.

## Testing

Bridge (`vk-player-bridge.test.ts`): with a fake player, assert each control
posts the right call and each event maps to the right callback (timeupdate→ms,
started/resumed→playing true + onPlaybackStart, paused/ended→playing false,
volumechange→{volume,muted}, adStarted/adCompleted→onAdChange, duration→ms).
`destroy` unsubscribes and destroys.

`player-controls.test.tsx`: renders play vs pause icon by `isPlaying`; time text
formatting; seek input fires `onSeek` with ms; volume/mute fire callbacks; VK and
fullscreen toggles fire; icons reflect `isVkMode`/`isFullscreen`.

`App.test.tsx`: clean mode shows our bar and sets `blockInput`; toggling "VK"
hides the bar and enables iframe input; `adStarted` hides the bar + enables input,
`adCompleted` restores; play/pause/seek/volume handlers call the mocked bridge
controls; `timeupdate` still drives the subtitle overlay.

Manual (not unit-testable): real autoplay behavior in WebView2, actual visual
cover of VK chrome, fullscreen, and ad step-aside.

## Build Sequence

1. Runtime autoplay spike (record result; decide first-play fallback).
2. Expand the bridge + tests.
3. `VideoPlayer` new callbacks + `blockInput` + tests.
4. `player-controls.tsx` + tests.
5. `App.tsx` player state, modes, wiring, render bar; ad + VK toggle + tests.
6. Verification: `npm test`, `npm run build`, `git diff --check`; backend
   unaffected.
7. Docs: update `docs/llm/current-behavior.md`, `docs/llm/product-context.md`,
   `AGENTS.md` to describe the custom chrome, modes, and the speed/quality
   limitation; note Phase 2 follows.
