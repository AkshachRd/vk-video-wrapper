# Snake2 Monochrome Restyle Design

Date: 2026-06-10

## Goal

Port the user's Claude Design handoff — "Змейка 2": a monochrome black-and-white
visual identity with IBM Plex type, animated wave dividers, and a signature
"stitch-ring" hover effect — onto the existing app. This is a **visual-layer
restyle only**: all logic, state, data fetching, player integration, and Tauri
commands stay as they are.

The handoff brands the app "ЛУПА / lupa". That name is **not** carried over in
any form; the app remains `vk-video-wrapper`.

## Sources Of Truth

- Handoff bundle: `docs/design/snake2-handoff/` (vendored into the repo together
  with this spec; original lives in
  `C:\Users\daniil.khudyakov\Downloads\design_handoff_snake2`).
  - `README.md` — the design contract: tokens, type scale, per-component visual
    spec, SnakeBorder TSX reference, snake-host table.
  - `files/lupa-snake2.html` — runnable prototype (open in a browser) used for
    side-by-side fidelity checks.
  - `files/mono.css`, `files/snake.css`, `files/stitch.css` — reference CSS.
  - `files/pieces.jsx`, `files/app-snake2.jsx`, `files/data.jsx` — reference
    markup. `files/tweaks-panel.jsx` is a prototyping tool and is **not** ported.
- Fidelity bar (from the handoff): high — colors, type, spacing, radii, and the
  hover animation are final and should match the prototype pixel-for-pixel,
  modulo the deliberate deviations listed below.

## Decisions Made With The User

1. **Shell**: white window card on the gray page background, **without** the
   decorative titlebar (no traffic-light dots, no in-app window title) — the
   real Tauri window already provides OS chrome.
2. **Language**: all visible UI texts become Russian, including the load/track
   error messages that are currently English. Already-Russian strings stay.
3. **Styling approach**: Tailwind-first ("approach B"). Design tokens go into
   Tailwind v4 `@theme`; component styling is rewritten as Tailwind utilities in
   JSX. The handoff CSS files are reference material, not shipped assets — no
   `mono.css`/`snake.css`/`stitch.css` in `src/`.
4. **Fonts are self-hosted** via `@fontsource` packages (desktop app must look
   identical offline; no Google Fonts requests at runtime).

## Styling Architecture

`src/styles.css` is rewritten around `@import "tailwindcss"` plus:

- **`@theme` tokens** (values from the handoff):
  - Colors: `--color-paper #ffffff`, `--color-paper-2 #f6f6f6`,
    `--color-paper-3 #efefef`, `--color-ink #0c0c0c`, `--color-ink-2 #707070`,
    `--color-ink-3 #a8a8a8`, `--color-line #e9e9e9`, `--color-line-2 #dcdcdc`,
    `--color-well #0a0a0a` (video well), `--color-page #e9e9e7` (behind the
    window card).
  - Radii: `--radius-card 20px`, `--radius-card-sm 12px`, `--radius-card-lg 25px`;
    pills use the built-in `rounded-full`.
  - Fonts: `--font-sans "IBM Plex Sans Variable", system-ui, sans-serif`,
    `--font-mono "IBM Plex Mono", ui-monospace, monospace`.
  - Easings: `--ease-spring cubic-bezier(0.16,1.1,0.3,1)`,
    `--ease-soft cubic-bezier(0.33,0.9,0.4,1)`.
  - `@keyframes` + `--animate-*` tokens: `cardrise` (cards enter), `popin`
    (popover enter), `wcardflash` (fresh saved word), `slither`/`slither-rev`/
    `bob`/`bob2` (wave divider), a pulse for the playing dot, `uslither`
    (word-underline wiggle). Entrance animations follow the handoff pattern:
    **transform-only with `opacity: 1` base** so content never gets stuck
    invisible.
- **Plain-CSS remainder** (only what utilities cannot express): cross-browser
  styling for the native `input[type="range"]` seek/volume tracks
  (`::-webkit-slider-thumb` etc. beyond what arbitrary variants cover).
- **`:root` snake variables** (read by `SnakeBorder` via `getComputedStyle`,
  Змейка 2 values): `--snake-sw: 3px`, `--snake-amp: 4px`,
  `--snake-wavelen: 13px`, `--snake-gap: 14px` (per-shape: round 16px,
  circle 12px). Also `--radius: 20px` kept as a raw var because the SnakeBorder
  geometry reads it for `shape="round"`.
- Wave SVG patterns (`--wave-a`, `--wave-b`, `--wave-ink` data-URIs) live as
  CSS variables; markup references them with `bg-(image:--wave-a)`.
- Base styles: gray page background, `min-width 960px` / `min-height 720px`
  preserved, `::selection` ink-on-paper, antialiasing.
- The current dark slate theme in `styles.css` is removed. `src/App.css` (dead
  Tauri-template file, not imported anywhere) is deleted.

Fonts: `@fontsource-variable/ibm-plex-sans` (wght axis covers the 450 subtitle
weight) and `@fontsource/ibm-plex-mono` (400, 500), cyrillic + latin subsets,
imported in `src/main.tsx`.

`index.html`: `lang="en"` → `lang="ru"`; title stays "VK Video Wrapper".

## New Component: SnakeBorder

`src/components/snake-border.tsx` — the only new JS the design needs. Port the
TSX reference from the handoff README (§ SnakeBorder) with these changes:

- Visual classes become Tailwind utilities inside the component. The host gets
  `group/snake` (plus `relative` and visible overflow); the floating `<svg>`
  reveals on `group-hover/snake:` / `group-focus-visible/snake:` (focus-visible,
  not the prototype's focus-within: a mouse click also focuses the button and
  the ring would stick visible after clicking); the `<path>`
  uses the stitch look (continuous ring, no dasharray).
- The global `.snakes`/`.stitch`/`.curves` mode classes from the prototype are
  dropped — Змейка 2 is the only mode; there are no runtime toggles and no
  Tweaks panel.
- `prefers-reduced-motion: reduce` guard: the ring still renders and reveals on
  hover, but the rAF phase animation does not run (static wavy ring), and the
  wave dividers/pulse animations are paused via `motion-reduce:` utilities.
- Behavior preserved from the reference: measure host via `ResizeObserver`,
  sample the rounded-rect perimeter, displace along normals by
  `amp·sin(K·dist + phase)`, draw a closed quadratic-bézier path, advance phase
  ~0.1/frame only while hovered/focused; `aria-hidden` SVG.

Ring hosts (from the handoff table):

| Element | shape |
|---|---|
| «Загрузить →» submit button | `pill` |
| Recent video card | `round` |
| «← Назад» button | `pill` |
| Player corner buttons (gear, fullscreen) | `circle` |
| «Сохранить слово» button | `pill` |

## Surfaces To Restyle

All in `src/`; logic, props, and handlers unchanged unless noted.

- **`App.tsx` — shell**: gray page, centered white window card (max-width
  1140px, `rounded-card-lg`, shadow `0 40px 90px -40px rgba(0,0,0,0.32)`), no
  titlebar. Masthead = wave divider with generous top spacing (no wordmark).
- **`App.tsx` — URL bar**: full-width pill (`1.5px` `line-2` border; focus →
  ink border + soft 4px ring), borderless input with placeholder
  «вставь ссылку vkvideo.ru/video…», black pill button «Загрузить →» (arrow
  nudges +5px on hover; loading label «Загрузка →»), snake-host. While loading,
  the flowing wave loading bar from the prototype shows under the bar. The
  shadcn `Input`/`Button` wrappers are replaced by plain styled elements.
- **`App.tsx` — section header**: «Недавние» 17px/600 + wave divider beneath.
- **`recent-videos-list.tsx`**: fixed 3-column grid, 18px gap. Card =
  snake-host (`round`), `rounded-card`, `cardrise` entrance, hover lift −4px +
  shadow + white play chip scaling in (0.7→1), «×» revealed on hover
  (white circle → ink fill on its own hover). Real thumbnails kept; the dark
  radial-gradient well is the no/failed-thumbnail placeholder. Title 14.5/500,
  relative date 12.5 `ink-3`. **No duration badge** (duration is not stored).
- **`App.tsx` — player view**: back row = outline pill «← Назад» (snake-host,
  replaces «← К списку») + muted now-playing title. Grid
  `1fr 280px`, 18px gap. Video well `rounded-card-lg`, `bg-well`; the real VK
  iframe fills it (no decorative placeholder). «ВОСПРОИЗВЕДЕНИЕ» pulse-dot
  indicator top-left, shown **only while controls are visible** (deviation, see
  below). Corner buttons: two white circular buttons top-right (gear → VK mode,
  fullscreen), snake-hosts (`circle`), lucide icons.
- **`player-controls.tsx`**: floating white pill bar (`bg-white/96`,
  `rounded-full`, `0 10px 30px` shadow), inset 14px from the well edges,
  auto-hide slides it down (existing `useControlsAutoHide`). Circular control
  buttons (hover → ink fill, white icon), mono tabular timecode, thin seek
  track (`line-2`) with ink fill and a round knob that scales 1.25 on hover,
  mini volume track, captions button as `trailing`. Seek/volume remain native
  `input[type="range"]` elements styled to match.
- **`App.tsx` — track menu**: stays a Radix popover; content restyled as a
  262px rounded card with two pill `<select>`s («Субтитры» / «Перевод»),
  custom chevron, ink focus border.
- **`subtitle-overlay.tsx`**: subtitle line = white card (`rounded-card`,
  `0 16px 40px` shadow), 22px/450 text; each word button shows the wavy
  `--wave-ink` underline on hover/active (with `uslither` wiggle). Popover
  stays Radix.
- **`word-lookup-popover.tsx`**: 282px content, headword 22/600 + mono IPA in
  `ink-2`, small underlined mono source link («ВИКИСЛОВАРЬ · EN/DE/RU» derived
  from the existing `source`/`languageName` fields), mono-labeled sections
  «Значение» and «Грамматика», footer = full-width black pill
  «Сохранить слово» (snake-host); saved state flips to a light pill with inset
  border and a check mark that springs in. Loading / not-found / unavailable
  states keep their current copy, restyled with tokens.
- **`subtitle-reference-line.tsx`**: dark translucent pill
  (`rgba(10,10,10,0.78)`, `rounded-full`, `backdrop-blur`), white 14.5/400.
- **`saved-words-panel.tsx`**: header «Слова» + ink count chip (white number),
  word cards on `paper-2` with `rounded-card-sm`: word 15/600, mono language
  tag, meaning 13px `ink-2`, «×» on hover. Newly saved card flashes
  (`wcardflash`) and slides in. Empty state: centered mono hint.
- **`ui/` primitives**: `ui/popover.tsx` (Radix wrapper) stays and its default
  content styling moves to monochrome tokens. `ui/button.tsx`, `ui/input.tsx`,
  `ui/alert.tsx` become unused after the restyle and are deleted (restyled
  surfaces use plain elements; error blocks are styled divs).
- **Error blocks** (load/track errors, history/words failures): quiet
  token-styled notes (`paper-2` background, `ink-2` text, `rounded-card`) — the
  prototype defines no error styling, so this is an in-system extension, not a
  red alert.

## Localization (Russian Everywhere)

- «Load» → «Загрузить →», «Loading...» → «Загрузка →» (button), URL placeholder
  → «вставь ссылку vkvideo.ru/video…».
- «← К списку» → «← Назад».
- `LOAD_ERROR_MESSAGES`, `UNKNOWN_LOAD_ERROR`, parse/track error constants in
  `App.tsx` → Russian equivalents (e.g. «Это не похоже на публичную ссылку VK
  Video», «Видео недоступно без входа в VK или не может быть открыто»,
  «Субтитры для этого видео не найдены», «Не удалось скачать файл субтитров»,
  «Не удалось разобрать субтитры», «Не удалось загрузить дорожку субтитров»).
- English aria-labels/titles (player buttons, selects) → Russian
  («Воспроизвести»/«Пауза», «Включить звук»/«Выключить звук» (как в прототипе),
  «Перемотка», «Громкость»,
  «Настройки VK (скорость, качество)», «Полный экран»/«Выйти из полноэкранного
  режима», «Субтитры»).
- Strings that are already Russian stay byte-identical.

## Deliberate Deviations From The Prototype

Recorded so the fidelity check does not flag them:

1. No decorative titlebar/traffic lights (user decision).
2. Real video thumbnails on recent cards; prototype's gradient well is only the
   placeholder. No duration badge (data not stored).
3. «ВОСПРОИЗВЕДЕНИЕ» indicator is tied to controls visibility instead of
   showing permanently — over a real movie a constant pulse is noise.
4. VK mode keeps current behavior (custom UI hides, VK iframe controls become
   usable). The prototype's «РЕЖИМ VK» overlay is not ported — it would cover
   the very VK menu the mode exists to expose.
5. Fullscreen is real (`requestFullscreen` on the player container), which
   natively hides the side panel; the prototype's fake in-window fullscreen is
   not ported.
6. Seek/volume are styled native range inputs, not the prototype's div-based
   track (accessibility + existing tests).
7. Word popover and track menu remain Radix popovers (anchoring, focus
   management); only their content/styling matches the design.
8. Icons come from lucide-react (same minimal stroke/currentColor style) instead
   of the prototype's inline `Ic` set.
9. No Tweaks panel, no runtime toggles for curves/snakes/motion — Змейка 2
   defaults are baked in.
10. The loading-button label is «Загрузка →» (prototype) — chosen over the
    «Загружаю...» shown in an intermediate Q&A preview.

## Edge Cases

- **Reduced motion**: wave dividers and pulse static, SnakeBorder ring static
  but still appears, entrance animations off (`motion-reduce:`). Content is
  always visible because entrances are transform-only.
- **jsdom has no `ResizeObserver`**: `SnakeBorder` would crash existing
  component tests → add a minimal mock in `src/test/setup.ts`.
- **Fonts**: variable IBM Plex Sans provides the 450 subtitle weight; fallback
  `system-ui` keeps layout sane if a font fails to load.
- **Fullscreen**: window-card chrome must not constrain the fullscreened player
  container (it fullscreens directly, bypassing the card's `max-width`); well
  radius drops in fullscreen as today.
- **Narrow window**: card is centered with 32px viewport padding; body
  min-width 960px unchanged.

## Testing

- **Existing tests**: update only those asserting changed user-visible text
  («Load», «← К списку», English error messages) or grid expectations. All
  behavior tests (popover lifecycle, pause-at-cue-boundary, track switching,
  saved words, history) must pass unmodified beyond label changes.
- **New tests**:
  - `snake-border.test.tsx`: renders an `aria-hidden` SVG path; starts phase
    animation on mouseenter and stops on mouseleave (mock rAF); cleans up
    listeners/observer on unmount.
  - Russian error mapping: load-error codes render the new Russian messages.
  - Playing indicator: visible only when controls are visible while playing.
- **Manual fidelity pass**: `files/lupa-snake2.html` opened next to
  `npm run tauri dev`; per-surface comparison and the handoff's final check —
  hover/focus on every snake-host shows the ring sitting cleanly outside the
  element with a visible gap.
- Commands: `npm test`, `npm run build`, `git diff --check`.

## Out Of Scope

- Any backend (`src-tauri`) change.
- Behavior/feature changes beyond visuals and Russian texts.
- Machine translation UI, dictionary changes, new player capabilities.
- Theme switching (single light monochrome theme only).
- `AGENTS.md` gets only a codebase-map touch-up for the new
  `snake-border.tsx` and the styling approach note.
