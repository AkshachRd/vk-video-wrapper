# Handoff: ЛУПА — mobile layouts (portrait + landscape)

## Overview
Mobile adaptation of the B&W "Змейка 2" visual identity for the VK video
language-learning app (`vk-video-wrapper`). Two layouts:

- **Portrait** (`lupa-mobile-portrait.html`) — full app: start screen, player,
  and three bottom sheets (word lookup, saved words, tracks).
- **Landscape** (`lupa-mobile-landscape.html`) — immersive player: full-bleed
  video, overlaid chrome, subtitles centered low, side-in panels.

This handoff covers the **visual + interaction layer only**. You keep your own
logic, state, data and player. It builds on the desktop handoff — read that one
first for the design system and the signature snake-ring effect:
**see `../design_handoff_snake2/README.md`** (tokens, typography, the full
`SnakeBorder.tsx` port, component specs). This document only adds the
**mobile-specific** decisions.

## About the files
These are **in-browser HTML/JSX prototypes** (React via Babel standalone, mock
data, no build step) — design references, not production code. Recreate the look
in the real Tauri + React + TypeScript app using its own patterns.

| File | Role |
|---|---|
| `files/mono.css` | Design system (shared with desktop). Port ~1:1. |
| `files/snake.css` + `files/stitch.css` | Snake-ring styling (shared). Port as-is. |
| `files/mobile.css` | **Portrait** layout + bottom sheets. Mobile-specific. |
| `files/landscape.css` | **Landscape** bezel + overlay player + side panels. |
| `files/pieces.jsx` | `SnakeBorder` (with the touch upgrade — see below), `tokenizeLine`, shared view components. Reference. |
| `files/app-mobile.jsx` | Portrait app shell + sheets. Reference for structure. |
| `files/app-land.jsx` | Landscape app shell + side panels. Reference. |
| `files/data.jsx` | Mock data + inline icon set (`Ic`). Reference. |
| `files/lupa-mobile-*.html` | Runnable prototypes — open in a browser. |

The prototypes mount inside a fake iPhone bezel for presentation. **In the real
app you render fullscreen** — drop the bezel/device wrapper entirely; only the
inner app markup + CSS matters.

## Fidelity
High-fidelity. Layout, spacing, type and the hover/press ring are final.

---

## Mobile-specific decision #1 — the snake ring on touch

On desktop the ring appears on `:hover`. **Touch screens have no hover**, so the
`SnakeBorder` component was upgraded:

- **`always` prop** — ring runs continuously (used on the primary CTA so the
  signature is always visible). E.g. the round "→" load button (portrait) and
  the "Мои слова" pill (landscape).
- **Pointer events** — the ring also starts on `pointerdown` and stops on
  `pointerup`/`pointercancel`, so on **all other** elements it appears **while
  pressed** (press-state), then fades.

The upgraded effect handlers (already in `files/pieces.jsx`):
```js
host.addEventListener("mouseenter", start);
host.addEventListener("mouseleave", always ? () => {} : stop);
host.addEventListener("focusin", start);
host.addEventListener("focusout", always ? () => {} : stop);
host.addEventListener("pointerdown", start);
host.addEventListener("pointerup", always ? () => {} : stop);
host.addEventListener("pointercancel", always ? () => {} : stop);
```
And the CSS reveal (in `mobile.css`):
```css
.snake-svg[data-always] { opacity: 1 !important; transform: none !important; }
.snakes .snake-host:active > .snake-svg { opacity: 1; transform: scale(1); }
```

**TSX port of the touch-ready `SnakeBorder`:** take the base component from
`../design_handoff_snake2/README.md` and (a) add an `always?: boolean` prop,
(b) register the pointer/`always` listeners exactly as above, (c) render
`data-always={always ? "1" : undefined}` on the `<svg>`. When `always` toggles,
remount the component (`key={always ? "a" : "p"}`) so the loop restarts cleanly.

## Mobile-specific decision #2 — ring density is a CSS default, not JS

The loop tightness is `--snake-wavelen` (smaller = denser loops). On desktop the
Tweaks panel set it via JS; the mobile prototype has no panel by default, so the
default is now baked into `stitch.css`:
```css
:root { --snake-wavelen: 13px; }
```
**Always set this default in CSS** (don't rely on JS) so rings look identical on
every surface, including small circular buttons. Without it the generator falls
back to ~40px → a sparse "gear" look on small radii.

---

## Portrait layout (`mobile.css`)

Single column, vertical scroll, fixed bottom dock. Device-content root is
`.m-root` with classes `stitch snakes curves`.

### Start screen
- **Top safe area** `.m-safetop` (60px) clears the status bar / dynamic island.
- **Top bar** `.m-topbar`: mono kicker "ЛУПА · VK".
- **Wave divider** `.m-wave.wave` (the animated sinuous line).
- **URL row** `.m-urlrow`: a pill input `.m-url` (52px tall, 1.5px border,
  ink on focus) + a round 52px black CTA `.m-cta` with `<SnakeBorder shape="circle" always>`.
- **Section head** `.m-sec` ("Недавние" + mono count).
- **Recent list** `.m-list`: single-column cards `.m-card`, 22px gap, 130px
  bottom padding so the dock never covers the last card. Each card: 16:9 dark
  thumb (`.m-thumb`) with rounded `--radius`, EN/RU pill top-left, duration chip
  bottom-right, centered play chip; title 16/500, relative date 13 `--ink-3`.
- **Bottom dock** `.m-dock`: a centered pill `.m-dock-pill` "Мои слова · N"
  with a white-bg count chip; sits on a top-fading gradient so content scrolls
  under it. Opens the saved-words sheet.

### Player screen
- Top safe area, then `.m-pbar`: round back button `.m-back` (snake-host) +
  truncated title.
- **Video** `.m-video`: 16:9 rounded dark well, centered placeholder mark,
  `ВОСПРОИЗВЕДЕНИЕ` pulse dot while playing.
- **Control strip** `.m-controls`: 46px round play/pause, mono timecode, thin
  seek (`.m-seek` with `.tr/.fl/.kn`), and a ghost captions button (snake-host)
  that opens the tracks sheet.
- **Reading area** `.m-read` (mobile-specific!): instead of overlaying subtitles
  on the video (too small on a phone), the active subtitle sits in a large
  `--paper-2` card below the video — mono label row ("Субтитры · EN" + "нажми
  слово"), the line as tappable `.word` buttons at 23px (big tap targets), and
  the Russian reference line under a hairline. Tapping a word opens the word
  sheet.
- Bottom dock identical to start.

### Bottom sheets (`.m-sheet` family)
All three (word / saved / tracks) share the pattern:
- Dimmed backdrop `.m-sheet-back` (fade in), tap to close.
- Sheet `.m-sheet`: `border-radius: 28px 28px 0 0`, slides up via
  `@keyframes sheetup` (translateY 100%→0, spring), `max-height: 86%`, 34px
  bottom padding for the home indicator, grab handle `.m-grab` on top.
- **Word sheet** (`WordSheet`): big headword `.m-wl-hw` (30px) + IPA, source
  link, "Значение"/"Грамматика" sections, a 56px full-width black
  **"Сохранить слово"** button (`.m-save`, snake-host) that flips to a light
  "Сохранено" state with a check.
- **Saved sheet** (`SavedSheet`): "Слова" + count chip, list of `.m-sw-card`
  (`--paper-2`, `--radius`), new card flashes via `wcardflash`, "×" to remove,
  empty state hint.
- **Tracks sheet** (`TrackSheet`): two groups ("Субтитры"/"Перевод") of
  `.m-tr-opt` rows; the selected row is solid ink (`.sel`) with a check tick.

### Navigation model
`screen` = `'start' | 'player'`; `sheet` = `null | {type:'word',clean,display} |
'saved' | 'tracks'`. URL submit / card tap → fake load → player. These flows are
illustrative — wire to your real player + data.

---

## Landscape layout (`landscape.css`)

Immersive, **video-first**. The prototype hand-draws a horizontal bezel
(`.phone-land`, 874×402, camera island on the left edge, home indicator bottom)
and auto-scales to fit narrow windows. **In the real app, drop the bezel** — use
the inner overlay structure fullscreen and gate it on
`orientation: landscape` / your own orientation state.

- **Full-bleed video** `.pl-video` fills the screen; centered placeholder
  `.pl-vcenter`.
- **Top chrome** `.pl-top` (absolute, inset from the left island): round back
  button (returns to portrait page in the proto), title, captions button, and a
  "Мои слова · N" pill with an `always` ring. Buttons are white-on-video; their
  snake stroke is overridden to white (`.pl-top .snake-path { stroke: var(--paper) }`),
  while the dark pill keeps ink stroke.
- **Subtitles** `.pl-subs`: reuses the desktop `.sub-card` / `.sub-line` /
  `.ref-line` styles, centered low (bottom 96px), generous side padding so they
  clear the island and controls. Tappable words → word panel.
- **Floating controls** `.pl-ctrl`: a centered rounded pill (≈58% width) with
  play/pause, timecode, seek — reusing the desktop `.ctrl-btn/.timecode/.seek`
  classes.
- **Side panels** (instead of bottom sheets): `.pl-panel` slides in from the
  **right** (`@keyframes panelin`, translateX 100%→0), 350px wide, rounded on
  the left edge, dimmed `.pl-back` behind. Word / saved / tracks reuse the same
  inner markup (`.m-wl-*`, `.m-sw-*`, `.m-tr-*`) from `mobile.css`. Side-in is
  used because bottom sheets would cover the (short) video in landscape.

---

## What to reuse vs. rebuild
- **Reuse 1:1:** `mono.css` tokens, `snake.css` + `stitch.css`, the inner sheet/
  panel content classes (`.m-wl-*`, `.m-sw-*`, `.m-tr-*`), `.sub-card/.sub-line/
  .ref-line`, `.ctrl-btn/.timecode/.seek`.
- **Port the layout shells:** `mobile.css` (portrait + sheets) and
  `landscape.css` (overlay player + side panels) — minus the hand-drawn bezel.
- **Rebuild in TSX with your logic:** the app shells (`app-mobile.jsx`,
  `app-land.jsx`) are structure references; lift the markup + classes, drop the
  mock state and the fake `IOSDevice`/`.phone-land` wrappers, wire your real
  player, data and navigation.
- **One real component to port:** the touch-ready `SnakeBorder` (above + base in
  the desktop handoff). Everything else is presentational markup + CSS.

## Behaviour notes (logic stays yours)
- Subtitle words: **entrance animates `transform` only, opacity stays 1** (never
  animate from `opacity:0` with `fill:forwards/backwards`) — so words remain
  visible if the timeline is paused/throttled. Re-applied per cue via WAAPI keyed
  on `cue.id`. Keep this rule when you port.
- Sheets/panels close on backdrop tap; consider adding swipe-to-dismiss in the
  real app (not in the proto).
- Respect `prefers-reduced-motion`: you can disable the ring's rAF travel and the
  wave drift; static states still look correct.

## Assets
None external. Icons are inline SVG (`Ic` in `data.jsx`). Waves + word underline
are inline SVG data-URIs in `mono.css`. Fonts: IBM Plex Sans / Mono (Google
Fonts, Cyrillic + Latin).

## Suggested integration order
1. Ensure the desktop design system is in place (`../design_handoff_snake2`).
2. Port `mobile.css`; render the portrait app shell fullscreen (no bezel), wire
   your data into start/player + the three sheets.
3. Add the touch-ready `SnakeBorder` + `snake-host`/`always` per the table.
4. Confirm `--snake-wavelen: 13px` default is set in CSS.
5. Port `landscape.css`; render the overlay player on landscape orientation with
   right side-in panels.
6. Verify on a real device: CTA ring always animates; pressing other controls
   shows the ring; subtitles stay visible during playback; sheets/panels open
   above the home indicator / clear of the camera island.
