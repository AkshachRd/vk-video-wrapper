# Mobile Android Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a touch-first **mobile** layout (phone portrait + landscape) for a real Android Tauri build, selected by platform, reusing the existing desktop logic and components to the maximum.

**Architecture:** `App.tsx` becomes a platform dispatcher (`usePlatform()` → `DesktopApp` | `MobileApp`). All current `App.tsx` state/handlers move into a shared controller hook `useVideoApp()`; the desktop JSX moves verbatim into `desktop-app.tsx`. `MobileApp` switches between a portrait component tree (start/player/bottom-sheets) and a landscape tree (overlay player/right side-panels) via `useOrientation()`. Styling is Tailwind-first, reusing the existing `@theme` tokens; mobile keyframes are added to `@theme`. Android is scaffolded (OS plugin + lib glue + config + docs) — a full build is not verifiable in this environment.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (`@theme`), Tauri 2 (`@tauri-apps/plugin-os`), Vitest + React Testing Library, Rust.

**Source of truth for visuals:** the vendored handoff at `docs/design/snake2-mobile-handoff/files/{mobile.css,landscape.css}`. Every presentational task cites the exact CSS block to translate to Tailwind utilities 1:1 (same px, radii, colors via `@theme` tokens). Existing `@theme` token map: `--paper`→`paper`, `--paper-2`→`paper-2`, `--ink`→`ink`, `--ink-2`→`ink-2`, `--ink-3`→`ink-3`, `--line`→`line`, `--line-2`→`line-2`, `--well`→`well`; `--fs-mono`→`font-mono`; `--ease`→`ease-soft`; `--spring`→`ease-spring`; `--radius`→`[20px]` raw (`--radius` :root var) or `rounded-card`; `--r-lg`→`rounded-card-lg`.

**House rules:** Russian, concise commit messages with body + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. **Git via PowerShell** (the Bash tool's shell profile aborts on an fnm error). Add tests before production code. Run `npm test` / `npm run build` after each phase.

---

## File Structure

```
docs/design/snake2-mobile-handoff/        # vendored handoff (reference assets)
src/
  App.tsx                                  # MODIFY → platform dispatcher
  app/
    desktop-app.tsx                        # CREATE → current desktop JSX (moved)
    mobile-app.tsx                         # CREATE → mobile shell + orientation switch + sheet state
  lib/
    app/use-video-app.ts                   # CREATE → controller hook (extracted from App.tsx)
    platform/use-platform.ts               # CREATE
    platform/use-orientation.ts            # CREATE
  components/
    snake-border.tsx                       # MODIFY → +always, pointer/press reveal
    mobile/
      mobile-start-screen.tsx              # CREATE
      mobile-recent-card.tsx               # CREATE
      mobile-player-screen.tsx             # CREATE
      mobile-subtitle-line.tsx             # CREATE (shared tappable word line; portrait + landscape)
      mobile-reading-area.tsx              # CREATE (label + word line + RU ref line)
      landscape-player.tsx                 # CREATE
      bottom-sheet.tsx                     # CREATE (portrait sheet shell)
      side-panel.tsx                       # CREATE (landscape panel shell)
      word-sheet-content.tsx               # CREATE
      saved-words-sheet-content.tsx        # CREATE
      track-sheet-content.tsx              # CREATE
  styles.css                               # MODIFY → +keyframes, drop body min-width
src-tauri/
  Cargo.toml                               # MODIFY → tauri-plugin-os
  src/lib.rs                               # MODIFY → register os plugin
  capabilities/default.json                # MODIFY → os:default
  tauri.conf.json                          # MODIFY (if needed for android)
docs/llm/android-build.md                  # CREATE
```

---

## Phase 0 — Vendor the handoff

### Task 0: Vendor the mobile handoff bundle

**Files:**
- Create: `docs/design/snake2-mobile-handoff/**` (copy of the handoff)

- [ ] **Step 1: Copy the bundle into the repo**

PowerShell:
```powershell
$src = "C:\Users\daniil.khudyakov\Downloads\design_handoff_mobile"
$dst = "D:\Projects\vk-video-wrapper\docs\design\snake2-mobile-handoff"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item -Recurse -Force "$src\*" $dst
```

- [ ] **Step 2: Confirm `@source not "../docs"` already excludes it from Tailwind scanning** (it does — `src/styles.css:2`). No change needed.

- [ ] **Step 3: Commit**

```powershell
git -C "D:\Projects\vk-video-wrapper" add docs/design/snake2-mobile-handoff
git -C "D:\Projects\vk-video-wrapper" commit -m @'
docs: вендоринг мобильного хендоффа «Змейка 2»

Reference-бандл (mobile.css/landscape.css/jsx-прототипы) кладём в репо рядом со спекой как источник истины по визуалу мобильной адаптации.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Phase 1 — Foundations

### Task 1: Mobile keyframes + drop body min-width

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add keyframes + `--animate-*` to the `@theme` block** (next to the existing ones, ~`src/styles.css:38`):

```css
  --animate-sheetup: sheetup 0.4s var(--ease-spring) both;
  --animate-panelin: panelin 0.4s var(--ease-spring) both;
  --animate-backin: backin 0.28s var(--ease-soft) both;
```
and the keyframes inside `@theme`:
```css
  @keyframes sheetup { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes panelin { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes backin { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 2: Remove `min-width: 960px; min-height: 720px` from `body`** (`src/styles.css:111-112`). Desktop keeps its size via the dispatcher/desktop root (the Tauri window is 1180×820 anyway). Replace with nothing (leave `margin:0`, background, font).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success (Tailwind picks up the new `animate-sheetup`/`animate-panelin`/`animate-backin` utilities; no broken CSS).

- [ ] **Step 4: Commit** (`feat: мобильные keyframes + снят min-width у body`).

### Task 2: `SnakeBorder` touch upgrade (`always` + press reveal)

The mobile CTA needs an always-on ring; all touch controls need a press-state ring. Keep desktop hover/focus-visible behaviour identical.

**Files:**
- Modify: `src/components/snake-border.tsx`
- Test: `src/components/snake-border.test.tsx`

- [ ] **Step 1: Write failing tests** (append to the existing suite):

```tsx
it("runs the ring continuously when `always` is set", () => {
  render(
    <button className="group/snake relative">
      <SnakeBorder shape="circle" always />
    </button>,
  );
  const svg = document.querySelector("svg[data-always]");
  expect(svg).not.toBeNull();
});

it("reveals the ring on pointerdown (touch press)", () => {
  render(
    <button className="group/snake relative" data-testid="host">
      <SnakeBorder shape="pill" />
    </button>,
  );
  const host = screen.getByTestId("host");
  // start() is registered for pointerdown; assert the listener path by firing it.
  fireEvent.pointerDown(host);
  // path d is built on start(); a non-empty d proves the loop drew at least once.
  const path = document.querySelector("svg path");
  expect(path?.getAttribute("d")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- snake-border`
Expected: FAIL (`data-always` not rendered; `always` prop unknown).

- [ ] **Step 3: Implement** in `snake-border.tsx`:
  - Signature: `export function SnakeBorder({ shape = "pill", always = false }: { shape?: SnakeShape; always?: boolean })`.
  - In the effect, after `measure(); draw();`, add `if (always) start();`.
  - Change the leave/blur listeners to no-op when `always`:
    ```ts
    host.addEventListener("mouseenter", start);
    host.addEventListener("mouseleave", always ? noop : stop);
    host.addEventListener("focusin", start);
    host.addEventListener("focusout", always ? noop : stop);
    host.addEventListener("pointerdown", start);
    host.addEventListener("pointerup", always ? noop : stop);
    host.addEventListener("pointercancel", always ? noop : stop);
    ```
    where `const noop = () => {}`. Update the cleanup `removeEventListener` calls to match (remove all seven).
  - On the `<svg>`, add `data-always={always ? "1" : undefined}`.
  - In the className, keep the hover/focus-visible reveal and **add press reveal**: `group-active/snake:scale-100 group-active/snake:opacity-100`. When `always`, force visible via inline style override: add `data-always` styling using a new utility — simplest is inline `style={{ ...(always ? { opacity: 1, transform: "none" } : {}) }}` merged with the existing `--snake-gap` style. Keep `key`-based remount handled by the consumer (`key={always ? "a" : "p"}`).

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- snake-border`
Expected: PASS. Also run full `npm test` to confirm no desktop regression in components using `SnakeBorder`.

- [ ] **Step 5: Commit** (`feat: SnakeBorder — always-кольцо и press-reveal на touch`).

---

## Phase 2 — Platform/orientation + controller extraction

### Task 3: `usePlatform()` hook

**Files:**
- Create: `src/lib/platform/use-platform.ts`
- Test: `src/lib/platform/use-platform.test.ts`

Decision logic: read `?platform=` override first; else if `@tauri-apps/plugin-os` resolves `platform()` to `android`/`ios` → `mobile`; else `desktop`. The hook starts at `desktop` (so jsdom/SSR/first paint is desktop — protects the existing `<App/>` tests) and upgrades to `mobile` asynchronously if the OS plugin reports a mobile platform.

- [ ] **Step 1: Failing test**

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlatform } from "./use-platform";

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("usePlatform", () => {
  it("defaults to desktop without override or OS plugin", async () => {
    const { result } = renderHook(() => usePlatform());
    await waitFor(() => expect(result.current).toBe("desktop"));
  });

  it("honours the ?platform=mobile dev override", () => {
    window.history.replaceState({}, "", "/?platform=mobile");
    const { result } = renderHook(() => usePlatform());
    expect(result.current).toBe("mobile");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npm test -- use-platform` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import { useEffect, useState } from "react";

export type Platform = "mobile" | "desktop";

function overrideFromQuery(): Platform | undefined {
  if (typeof window === "undefined") return undefined;
  const p = new URLSearchParams(window.location.search).get("platform");
  return p === "mobile" || p === "desktop" ? p : undefined;
}

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(() => overrideFromQuery() ?? "desktop");

  useEffect(() => {
    if (overrideFromQuery()) return;
    let cancelled = false;
    void import("@tauri-apps/plugin-os")
      .then((os) => os.platform())
      .then((name) => {
        if (!cancelled && (name === "android" || name === "ios")) setPlatform("mobile");
      })
      .catch(() => { /* not in Tauri / plugin absent → stay desktop */ });
    return () => { cancelled = true; };
  }, []);

  return platform;
}
```

- [ ] **Step 4: Run to verify pass** — `npm test -- use-platform` → PASS. (The OS-plugin import rejects in jsdom; `.catch` keeps it desktop.)

- [ ] **Step 5: Commit** (`feat: usePlatform — детект mobile/desktop по платформе`).

### Task 4: `useOrientation()` hook

**Files:**
- Create: `src/lib/platform/use-orientation.ts`
- Test: `src/lib/platform/use-orientation.test.ts`

- [ ] **Step 1: Failing test** (mock `matchMedia`):

```ts
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOrientation } from "./use-orientation";

function stubMatchMedia(landscape: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("landscape") ? landscape : !landscape,
    media: q, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe("useOrientation", () => {
  it("returns landscape when the landscape media query matches", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useOrientation());
    expect(result.current).toBe("landscape");
  });
  it("returns portrait otherwise", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useOrientation());
    expect(result.current).toBe("portrait");
  });
});
```

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement**

```ts
import { useEffect, useState } from "react";

export type Orientation = "portrait" | "landscape";

const QUERY = "(orientation: landscape)";

function read(): Orientation {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "portrait";
  return window.matchMedia(QUERY).matches ? "landscape" : "portrait";
}

export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setOrientation(mql.matches ? "landscape" : "portrait");
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return orientation;
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** (`feat: useOrientation — portrait/landscape по media query`).

### Task 5: Extract `useVideoApp()`; `App` dispatcher; `desktop-app.tsx`

This is the high-risk refactor. Strategy: **move, don't rewrite.** Cut the state/handlers from `App.tsx` into the hook; move the JSX into `desktop-app.tsx`; make `App` a 3-line dispatcher. The existing 55 `App.test.tsx` tests are the regression net (they render `<App/>`; `usePlatform` is desktop in jsdom, so the desktop tree renders unchanged).

**Files:**
- Create: `src/lib/app/use-video-app.ts`
- Create: `src/app/desktop-app.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `use-video-app.ts`** — move, verbatim, from `App.tsx`: every `useState`/`useRef`/`useEffect`/`useCallback` and the helper functions (`savedWordKey`, `replaceSavedWord`, `mergeSavedWords`, `buildSaveWordRequest`, `mapLoadError`, `mapTrackLoadError`, `extractErrorCode`, the message consts) plus derived values (`selectedTrack`, `effectiveTimeMs`, `primaryCue`, `showCustomUi`, `blockInput`). Keep fullscreen/controls-auto-hide/`playerContainer`/`subtitlesMenu` **out** (those stay desktop-only). Return one object with all state + setters needed by the views + handlers + derived values. Signature:

```ts
export function useVideoApp() {
  // …all moved state/handlers…
  return {
    url, setUrl, isLoading, error, video, lane, secondaryLane,
    selectedTrackId, isTrackLoading, selectedSecondaryTrackId, isSecondaryTrackLoading, secondaryError,
    isPlaying, currentTimeMs, durationMs, volume, muted, isAd, playerMode,
    wordLookup, savedWords, areSavedWordsLoading, savedWordsUnavailable, savedWordsPanelError,
    pendingSavedWordActions, freshSavedWordId,
    recentVideos, areRecentVideosLoading, recentVideosUnavailable, recentVideosError,
    selectedTrack, effectiveTimeMs, primaryCue, showCustomUi, blockInput,
    handleSubmit, loadFromUrl, handleSelectRecentVideo, handleRemoveRecentVideo, handleBackToList,
    handleTrackChange, handleSecondaryTrackChange,
    handleSubtitleWordInspect, handleSubtitleWordInspectEnd, getWordSaveControl, handleRemoveSavedWord,
    handlePlaybackStart, handleDurationChange, handlePlayingChange, handleVolumeChange, handleAdChange,
    handleTimeUpdate, handlePlayerControlsReady, handlePlayPause, handleSeek, handleSetVolume,
    handleToggleMute, toggleVkMode, savedWordKey,
  } as const;
}
export type VideoApp = ReturnType<typeof useVideoApp>;
```

- [ ] **Step 2: Create `desktop-app.tsx`** — paste the current `App()` return JSX (the `<main>…</main>` block, lines `src/App.tsx:814-1056`) and the desktop-only state it owns: `playerContainer`/`setPlayerContainer`, `isFullscreen`, `subtitlesMenuOpen`, `useControlsAutoHide`, `toggleFullscreen`, and the `subtitlesMenu` JSX (lines `750-812`). It receives `const app = useVideoApp()` either via prop or by calling the hook itself. **Use a prop** so `App` owns the single hook instance:

```tsx
export function DesktopApp({ app }: { app: VideoApp }) {
  const [playerContainer, setPlayerContainer] = useState<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [subtitlesMenuOpen, setSubtitlesMenuOpen] = useState(false);
  // …fullscreen effect + toggleFullscreen + useControlsAutoHide…
  // …subtitlesMenu JSX using app.video / app.handleTrackChange / etc…
  return ( /* moved <main> JSX, reading from `app.` */ );
}
```
Replace bare references (`url` → `app.url`, `handleSubmit` → `app.handleSubmit`, etc.) throughout the moved JSX. The `trackSelect*`/`monoLabel` class consts move here too (desktop-only).

- [ ] **Step 3: Rewrite `App.tsx`** to the dispatcher:

```tsx
import { usePlatform } from "@/lib/platform/use-platform";
import { useVideoApp } from "@/lib/app/use-video-app";
import { DesktopApp } from "@/app/desktop-app";
import { MobileApp } from "@/app/mobile-app";

export default function App() {
  const platform = usePlatform();
  const app = useVideoApp();
  return platform === "mobile" ? <MobileApp app={app} /> : <DesktopApp app={app} />;
}
```
(Temporarily stub `MobileApp` as `export function MobileApp(_: { app: VideoApp }) { return null; }` so the build compiles until Phase 3 wires it.)

- [ ] **Step 4: Run the regression net**

Run: `npm test`
Expected: all existing suites PASS unchanged (desktop in jsdom). Fix import/reference fallout until green. Then `npm run build` → PASS.

- [ ] **Step 5: Commit** (`refactor: вынос логики App в useVideoApp + диспетчер платформы`). Body: lists that all state/handlers moved to the hook, App is now a dispatcher, desktop JSX moved to desktop-app.tsx, behaviour unchanged (55 App-тестов + компонентные зелёные).

---

## Phase 3 — Portrait

> All Phase 3/4 components are presentational; translate the cited handoff CSS to Tailwind utilities 1:1. Tests assert behaviour + key DOM, not exact classes.

### Task 6: `mobile-recent-card.tsx`

**CSS source:** `docs/design/snake2-mobile-handoff/files/mobile.css` `.m-card/.m-thumb/.m-dur/.m-lang/.m-playchip/.m-cmeta/.m-ctitle/.m-cwhen` (lines 74-99).

**Files:** Create `src/components/mobile/mobile-recent-card.tsx`; Test `src/components/mobile/mobile-recent-card.test.tsx`.

Props: `{ video: RecentVideo; onSelect: (v: RecentVideo) => void; onRemove: (v: RecentVideo) => void }`. Reuse `formatRelativeDate` from `src/lib/recent-videos/format-relative-date.ts` for `.m-cwhen`. Thumbnail uses `video.thumbnailUrl` (fallback to the gradient well). No lang/dur in `RecentVideo` — omit the `.m-lang`/`.m-dur` chips (they are mock-only) unless the type has them; check `src/lib/recent-videos/types.ts` and only render fields that exist.

- [ ] **Step 1: Test** — renders title + relative date; clicking the card calls `onSelect(video)`; clicking remove calls `onRemove(video)` and stops propagation.
- [ ] **Step 2: Run fail. Step 3: Implement. Step 4: Run pass.**
- [ ] **Step 5: Commit** (`feat: mobile-recent-card`).

### Task 7: `mobile-start-screen.tsx`

**CSS source:** `.m-screen/.m-scroll/.m-safetop/.m-topbar/.m-wave/.m-urlrow/.m-url/.m-cta/.m-sec/.m-list/.m-dock/.m-dock-pill` (mobile.css 16-116). Drop the `.m-kicker` "ЛУПА · VK" text (Decision: no rename); keep the wave (`<Wave/>`).

**Files:** Create `src/components/mobile/mobile-start-screen.tsx`; Test alongside.

Props from `useVideoApp`: `url`, `setUrl`, `isLoading`, `handleSubmit`, `recentVideos`, `areRecentVideosLoading`, `recentVideosUnavailable`, `recentVideosError`, `handleSelectRecentVideo`, `handleRemoveRecentVideo`, plus `savedWordsCount: number` and `onOpenSaved: () => void` (dock pill). The 52px circle CTA carries `<SnakeBorder shape="circle" always key="a" />`. Reuse `Wave` and `mobile-recent-card`.

- [ ] **Step 1: Test** — submitting the URL form calls `handleSubmit`; the dock pill shows the count and calls `onOpenSaved`; recent list renders one card per video; loading/empty/unavailable states render.
- [ ] **Steps 2-4 TDD. Step 5: Commit** (`feat: mobile-start-screen`).

### Task 8: `mobile-subtitle-line.tsx` + `mobile-reading-area.tsx`

Shared tappable word line (used by reading area **and** landscape), plus the portrait reading area wrapper.

**CSS source:** `.m-read/.m-read-label/.m-subline/.m-refline` (mobile.css 158-168). Word underline reuses the desktop `.word` `after:` pattern from `src/components/subtitle-overlay.tsx:73`.

**Files:** Create `src/components/mobile/mobile-subtitle-line.tsx`, `src/components/mobile/mobile-reading-area.tsx`; Tests alongside.

`mobile-subtitle-line.tsx` props: `{ cue: SubtitleCue; activeWordId?: string; onWordTap: (cue, word) => void }`. Renders `cue.words` as `<button>`s (active when `word.id === activeWordId`). Entrance: per-cue WAAPI keyed on `cue.id`, **transform only, opacity stays 1** (port `ReadBox` effect from `app-mobile.jsx:25-35` using `--motion`; degrade gracefully if `Element.prototype.animate` is absent in jsdom — guard with `if (typeof b.animate === "function")`).

`mobile-reading-area.tsx` props: `{ cue; secondaryCue?; activeWordId?; onWordTap; trackLabel: string }`. Label row "Субтитры · <LANG>" + "нажми слово"; renders `<MobileSubtitleLine/>`; RU ref line (`.m-refline`) only when `secondaryCue` present.

- [ ] **Step 1: Tests** — tapping a word calls `onWordTap(cue, word)`; active word gets the active class/state; RU line shown only with `secondaryCue`; entrance does not set opacity to 0 (assert the animate keyframes are transform-only via a spy on `HTMLElement.prototype.animate`).
- [ ] **Steps 2-4 TDD. Step 5: Commit** (`feat: mobile-subtitle-line + reading-area`).

### Task 9: Sheet shell + three sheet bodies

**CSS source:** `.m-sheet-back/.m-sheet/.m-grab/.m-sheet-scroll` (mobile.css 173-191) for the shell; `.m-wl-*` (193-217), `.m-sw-*` (219-232), `.m-tr-*` (234-241) for the bodies.

**Files:** Create `bottom-sheet.tsx`, `word-sheet-content.tsx`, `saved-words-sheet-content.tsx`, `track-sheet-content.tsx` under `src/components/mobile/`; Tests for each body.

- `bottom-sheet.tsx`: `{ label: string; onClose: () => void; children }`. Backdrop (`animate-backin`, tap → `onClose`), sheet (`animate-sheetup`, `rounded-t-[28px]`, `max-h-[86%]`, grab handle, scroll area). `role="dialog"`, `aria-label={label}`.
- `word-sheet-content.tsx`: `{ fallbackWord: string; lookup: WordLookupState; saveControl?: WordSaveControl }` — same contracts as `WordLookupPopover`, but `.m-wl-*` sizing (30px headword). Render all states (idle/loading/not-found/unavailable/ready) like `word-lookup-popover.tsx`. Save button = 56px full-width, `.m-save` styling, `<SnakeBorder shape="pill" />`, drives `saveControl.onToggle`; saved/removing show the check + light state; disabled on saving/removing/unavailable. **Mirror `src/components/word-lookup-popover.test.tsx` cases.**
- `saved-words-sheet-content.tsx`: `{ words: SavedWord[]; pendingWordIds: string[]; freshWordId?: string; onRemove: (w) => void; error?; isLoading; isUnavailable }` — "Слова" + count chip; cards (`.m-sw-card`, `fresh` → `animate-wcardflash`); "×" remove; empty/loading/unavailable states. Mirror `saved-words-panel.test.tsx`.
- `track-sheet-content.tsx`: `{ tracks: SubtitleTrack[]; selectedTrackId; selectedSecondaryTrackId; isTrackLoading; isSecondaryTrackLoading; onPrimaryChange; onSecondaryChange; secondaryError? }` — two groups "Субтитры"/"Перевод" of `.m-tr-opt` rows (selected = `.sel` ink + tick); "Перевод" includes a "Нет" row (value `""`). Reuse `formatTrackLabel` (export it from a shared util or duplicate the 3-line helper).

- [ ] **Steps per body: TDD (test → fail → implement → pass).**
- [ ] **Commit** (`feat: mobile bottom-sheet + word/saved/track sheet-content`).

### Task 10: `mobile-player-screen.tsx`

**CSS source:** `.m-pbar/.m-back/.m-ptitle/.m-video/.m-vcenter/.m-pdot/.m-controls/.m-cbtn/.m-time/.m-seek` (mobile.css 121-168).

**Files:** Create `src/components/mobile/mobile-player-screen.tsx`; Test alongside.

Props from `useVideoApp` + sheet openers: `video`, `lane`, `secondaryLane`, `primaryCue`, `effectiveTimeMs`, `isPlaying`, `currentTimeMs`, `durationMs`, `blockInput`, the player callbacks (`handleTimeUpdate`/…/`handlePlayerControlsReady`), `handlePlayPause`, `handleSeek`, `handleSubtitleWordInspect`/`handleSubtitleWordInspectEnd`, `selectedTrack`, plus `onBack`, `onOpenTracks`, `onOpenSaved`, `savedWordsCount`, `activeWordId`. Mounts the **existing `VideoPlayer`** in the `.m-video` well. Back button = `.m-back` snake-host (`<SnakeBorder shape="circle" />`). Control strip: 46px play/pause (`.m-cbtn`), mono timecode (reuse `formatTime` — export from `player-controls.tsx` or duplicate), thin seek (a `range-ink` input or the `.m-seek` track — prefer a styled `<input type=range>` for accessibility, mirroring `PlayerControls`), ghost captions (`.m-cbtn.ghost`, snake-host) → `onOpenTracks`. Reading area via `mobile-reading-area`. Dock pill → `onOpenSaved`.

- [ ] **Step 1: Test** — renders `VideoPlayer` (mock the iframe boundary as in `video-player.test.tsx`); play/pause button calls `handlePlayPause`; captions button calls `onOpenTracks`; back calls `onBack`; reading area renders the active cue's words.
- [ ] **Steps 2-4 TDD. Step 5: Commit** (`feat: mobile-player-screen`).

### Task 11: `mobile-app.tsx` portrait wiring

**Files:** Create `src/app/mobile-app.tsx` (replace the Phase-2 stub); Test `src/app/mobile-app.test.tsx`.

State: `screen` derived from `app.video && app.lane` (player vs start); `sheet: null | { type: "word" } | "saved" | "tracks"`. Word taps set the sheet and call `app.handleSubtitleWordInspect`; closing any word sheet calls `app.handleSubtitleWordInspectEnd`. `activeWordId` tracked for the active word highlight. Root: `<div className="…m-root…">` (absolute inset, paper bg). For Phase 3, render portrait only (landscape added in Phase 4). The three sheets render via `bottom-sheet` + the matching `*-sheet-content`, fed from `app`.

- [ ] **Step 1: Test** — with `?platform=mobile` via the dispatcher (or render `<MobileApp app={mockApp}/>` directly with a hand-built `app` object): start screen shows when no video; opening the saved dock pill renders the saved sheet; tapping a word (player screen, with a mocked loaded video) opens the word sheet and calls `handleSubtitleWordInspect`.
- [ ] **Step 2: Run fail. Step 3: Implement. Step 4: Run pass** (+ full `npm test`, `npm run build`).
- [ ] **Step 5: Commit** (`feat: mobile-app — portrait shell + bottom-sheets`).

---

## Phase 4 — Landscape

### Task 12: `side-panel.tsx`

**CSS source:** `landscape.css` `.pl-back/.pl-panel` (102-119). Right slide-in (`animate-panelin`), 350px, rounded-left, dimmed backdrop.

**Files:** Create `src/components/mobile/side-panel.tsx`; Test alongside. Same API shape as `bottom-sheet` (`{ label; onClose; children }`) so the sheet bodies are reused verbatim.

- [ ] **TDD: backdrop tap closes; renders children; role/aria. Commit** (`feat: side-panel shell`).

### Task 13: `landscape-player.tsx` + orientation switch

**CSS source:** `landscape.css` `.pl-video/.pl-vcenter/.pl-top/.pl-btn/.pl-title/.pl-words/.pl-subs/.pl-ctrl` (34-99). Drop the bezel (`.phone-land/.pl-island/.pl-home`).

**Files:** Create `src/components/mobile/landscape-player.tsx`; Modify `src/app/mobile-app.tsx`; Tests.

Full-bleed `VideoPlayer`; top chrome (back `.pl-btn` snake-host; title; captions `.pl-btn` → tracks; "Мои слова · N" `.pl-words` with `<SnakeBorder shape="pill" always key="a" />`). Snake stroke: white on the video buttons, ink on the dark pill — override via the path stroke (the `SnakeBorder` path uses `stroke-ink`; for white-on-video buttons wrap in a class that sets `--snake-stroke` or add a `stroke` prop). **Add a `stroke?: "ink" | "paper"` prop to `SnakeBorder`** (default `ink`) to support this cleanly; update Task 2 note if implementing here. Subtitles low-center: reuse `mobile-subtitle-line` (tap → word panel) + `SubtitleReferenceLine` for the RU line. Floating controls: reuse `PlayerControls` (captions in `trailing`), centered pill. Panels via `side-panel` + the same sheet bodies.

`mobile-app.tsx`: `const orientation = useOrientation();` → render `landscape-player` (with `side-panel`s) when `landscape` and a video is loaded; else the portrait tree. Start screen stays portrait-style in both (the handoff only specifies the landscape **player**).

- [ ] **Step 1: Test** — `mobile-app` with `matchMedia` stubbed landscape + a loaded video renders the landscape player (assert a landscape-only testid, e.g. the `.pl-words` pill); portrait stub renders the portrait player. Word tap opens the side panel.
- [ ] **Steps 2-4 TDD** (+ full `npm test`, `npm run build`).
- [ ] **Step 5: Commit** (`feat: landscape-player + переключение по ориентации`).

---

## Phase 5 — Android scaffold

### Task 14: OS plugin wiring

**Files:** Modify `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `package.json` (already has `@tauri-apps/plugin-os`? No → add).

- [ ] **Step 1:** Add npm dep: `npm i @tauri-apps/plugin-os`.
- [ ] **Step 2:** Add Cargo dep to `src-tauri/Cargo.toml` `[dependencies]`: `tauri-plugin-os = "2"`.
- [ ] **Step 3:** Register in `lib.rs`: `.plugin(tauri_plugin_os::init())` (after the opener plugin).
- [ ] **Step 4:** Add `"os:default"` to the permissions array in `src-tauri/capabilities/default.json` (read it first; match existing format).
- [ ] **Step 5:** Verify: `npm run build` (frontend) + `Set-Location src-tauri; cargo build` (compiles the plugin; revert location after). Expected: success.
- [ ] **Step 6: Commit** (`feat: plugin-os для детекта платформы (desktop + Android)`).

### Task 15: Android target scaffold + docs

**Files:** Create `docs/llm/android-build.md`; possibly modify `tauri.conf.json` / `.gitignore`.

- [ ] **Step 1:** Attempt init: `npm run tauri android init`. Capture output. **Expected here:** failure for missing `ANDROID_HOME`/`NDK_HOME`/JDK 17 (only a Java 8 stub is installed). Do **not** fake success.
- [ ] **Step 2:** Write `docs/llm/android-build.md` documenting: prerequisites (JDK 17, Android Studio / cmdline-tools, SDK platform + platform-tools, NDK; env vars `JAVA_HOME`, `ANDROID_HOME`, `NDK_HOME`), then `npm run tauri android init`, `... android dev`, `... android build`. Note on-device re-checks: VK iframe + JS API in Android System WebView, the CSP in `tauri.conf.json`, and that `usePlatform` will resolve `android` → mobile automatically. Record the exact init error seen in Step 1 and the resolution (install the toolchain).
- [ ] **Step 3:** If `tauri android init` produced `src-tauri/gen/android`, decide commit-vs-ignore per Tauri guidance (default: commit). If it failed (expected), note that `gen/android` will be generated once the toolchain is present.
- [ ] **Step 4: Commit** (`docs: инструкция по Android-сборке + статус скаффолда`).

---

## Final verification

- [ ] `npm test` — all green (existing 55 App tests + component tests + new mobile/hook tests).
- [ ] `npm run build` — success.
- [ ] `git diff --check` — no whitespace errors.
- [ ] `Set-Location src-tauri; cargo test; cargo fmt --check` — green.
- [ ] Browser preview: `npm run dev`, open `http://localhost:3005/?platform=mobile`, devtools device emulation → verify portrait start/player/sheets and (rotate) landscape player. Capture a note; on-device Android verification is out of scope here.

---

## Self-Review notes

- **Spec coverage:** platform dispatch (T3,T5) ✓; orientation (T4,T13) ✓; controller hook (T5) ✓; SnakeBorder touch+always (T2) ✓; portrait start/player/reading/sheets (T6-T11) ✓; landscape overlay+panels (T12-T13) ✓; Tailwind-first/no shipped CSS (all UI tasks) ✓; keyframes in @theme + drop min-width (T1) ✓; Android scaffold+docs (T14-T15) ✓; reuse VideoPlayer/PlayerControls/SubtitleReferenceLine/contracts (T8-T13) ✓; transform-only word entrance (T8) ✓.
- **Type consistency:** `VideoApp = ReturnType<typeof useVideoApp>` is the single prop type passed to `DesktopApp`/`MobileApp`. Sheet bodies reuse existing exported contracts (`WordLookupState`, `WordSaveControl`, `SavedWord`, `SubtitleTrack`, `SubtitleCue`). `SnakeBorder` gains `always` (T2) and `stroke` (T13) — both optional, backward compatible.
- **Known deviation from desktop spec:** desktop chose Tailwind-first/no shipped handoff CSS; mobile follows the same (confirmed with user) — no `mobile.css` shipped.
