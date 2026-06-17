# Design: «Граф слов» (Word & Tag Graph) screen

Date: 2026-06-17
Status: Approved (design); implementation pending
Source handoff: `~/Downloads/design_handoff_word_graph` (README + vanilla HTML/CSS/JS prototype)

## Summary

A new screen for the app that visualises the user's **saved words and their tags** as an
Obsidian-style force-directed graph on a zoomable, pannable canvas. Tags are dark hub nodes; words
are light circle nodes; a word links to each of its tags. The user can search across words AND tags
with one field, filter by tag chips and node type, drag nodes around (they spring back into the live
simulation), zoom/pan, and click a node to open a detail card.

The screen reads the **already-loaded** saved-words store (`app.savedWords`) — no new backend, no new
Tauri command. It belongs to the existing monochrome «Змейка 2» theme and reuses the app's design
tokens and the `SnakeBorder` component (the handoff's `mono.css` / `snake.css` are already present in
`src/styles.css` and `src/components/snake-border.tsx`, so they are NOT re-ported).

## Goals / Non-goals

**Goals**
- Pixel-faithful recreation of the handoff's graph look, motion, and interactions, using the app's
  existing React patterns, tokens, and components.
- Port the framework-agnostic canvas force-simulation directly (it is the reusable core).
- Wire the graph to the real saved-words + tags source so add/remove/auto-tag changes reflect live.
- Desktop and mobile layouts.

**Non-goals**
- No `d3-force` or other graph dependency (hand-rolled forces are ~50 lines, already tuned, ~24–50
  nodes — O(n²) is fine).
- No tag glosses (the data layer has none; the tag card shows only the word list).
- No data mutation from the graph (tag editing stays in the words panel/sheet).
- Graph is reachable only from the player context (the words panel/sheet), not the start screen.
- No new backend or persistence beyond `localStorage` for camera + node positions.

## Decisions (resolved during brainstorming)

1. **Navigation:** entry from the words panel/sheet; back returns to the player. Local screen state
   in each shell; `useVideoApp` (already 1000+ lines) is untouched.
2. **Platforms:** desktop + mobile (separate layout components, shared engine + hook).
3. **Tag gloss:** omitted — the tag detail card shows only the word list and count.
4. **Mobile zoom:** on-screen `+ / −` buttons plus **pinch-to-zoom** (two-pointer), in addition to
   the handoff's wheel zoom (wheel is desktop-only).
5. **Architecture:** split the vanilla engine into a pure model + a thin React hook + React chrome
   (Approach A), instead of porting the imperative DOM-string controller verbatim.

## Architecture (Approach A)

Split the handoff's single vanilla closure (which mixes physics, drawing, pointer handling, and
direct DOM manipulation via `innerHTML`) into testable layers:

- **Pure model** — building/searching/filtering the graph and coordinate math. No DOM.
- **Simulation** — physics step + `draw(ctx)`. Only touches the canvas context.
- **React hook** — owns the canvas ref + RAF loop, wires pointer/wheel events, exposes state and
  imperative actions, and rebuilds-with-position-preservation when saved words change.
- **React chrome** — header, search, filters, legend, hint, zoom stack, detail card, no-result,
  styled with existing tokens + `SnakeBorder`. React owns the DOM (no `innerHTML`).

### File layout

```
src/lib/word-graph/
  types.ts            # GraphNode (word|tag), GraphLink, Camera, GraphFilters, GraphView
  graph-model.ts      # buildGraph(words); matchNodes(nodes,q); computeHidden(nodes,filters);
                      # toScreen/toWorld; nodeAt(); position-preserving rebuild diff
  simulation.ts       # Simulation: physics step + draw(ctx, view); reheat()
  use-word-graph.ts   # React hook: canvas ref, RAF, pointer/wheel/pinch, state + actions
  persistence.ts      # load/save camera + node positions to localStorage (debounced 400ms)

src/components/word-graph/
  word-graph-screen.tsx           # desktop screen
  mobile-word-graph-screen.tsx    # full-screen mobile layout
  graph-search-field.tsx          # pill search + clear (shared)
  graph-filter-row.tsx            # tag chips (with counts) + type segment (shared)
  graph-detail-card.tsx           # word/tag detail card (React)
  graph-canvas.tsx                # <canvas> + legend + hint + zoom controls + no-result overlay
```

## Data mapping (`buildGraph(words: SavedWord[])`)

Built from `app.savedWords` (no new fetch):

- **Tag nodes**: from `collectTagOptions(words)` (existing dedup by normalized key).
  - `id = "tag:" + key`, `type = "tag"`, `label = option.display`
  - `deg = #words carrying the tag`, `r = 15 + min(deg, 12) * 1.7`
  - no `gloss`
- **Word nodes**:
  - `id = "word:" + savedWord.id`, `type = "word"`, `label = displayWord`
  - `lang = language.toUpperCase()`, `meaning = firstMeaning ?? ""`
  - `tags = word.tags` (display strings; linked by normalized key), `r = 7`
- **Links**: word ↔ each of its tags (matched by `normalizeTag`). Words with no tags are valid
  isolated nodes (gravity + breathing keep them drifting; fully searchable and clickable).
- Each node also carries sim fields `x, y, vx, vy, phase` and a derived `neighbors: string[]`.
- Header counters: `words.length` слов, `tagOptions.length` тегов.

## Navigation

`useVideoApp` is untouched. Screen state is local to each shell.

- **Desktop (`DesktopApp`)**: a `граф` button in the `SavedWordsPanel` header (next to the count
  chip), disabled when there are zero words. Clicking sets local `showGraph` → renders
  `<WordGraphScreen>` in place of the player/panel grid. The screen's `← к плееру` back button
  (carrying `SnakeBorder shape="pill"`) clears `showGraph`.
- **Mobile (`MobileApp`)**: an `открыть граф` action in `SavedWordsSheetContent`; tapping closes the
  sheet and sets a `graph` screen mode → renders `<MobileWordGraphScreen>` full-screen; back → player.
- Both pass `words={app.savedWords}` and the existing tag handlers on `app`. Detail-card pill clicks
  focus+select nodes only; they do not mutate data.

## Screen layout (desktop)

Inside the existing `max-w-[1140px]` main, mirroring the handoff:

1. **Header row**: CSS/SVG magnifier mark + title `Граф слов` (26px/500/-0.02em) and subtitle
   `сохранённые слова и их теги — как созвездие связей` (13px/`ink-2`). Right cluster: mono counters
   `{N} слов` · `{N} тегов` (number 14px/600 ink, label `ink-3`), then `← к плееру` back button
   (pill, `1.5px line-2`, hover → `ink` border + arrow nudges left, `SnakeBorder`).
2. **Search** (`graph-search-field`, 54px pill, `1.5px line-2`): leading magnifier, `<input>` 16px,
   placeholder `искать слово или тег…`, trailing mono hint `слова + теги`, clear (×) button shown
   when non-empty (hover → ink bg). Focus: border `ink` + `box-shadow 0 0 0 4px rgba(12,12,12,0.05)`.
   `Esc` clears; `Enter` pans camera to first core match.
3. **Filter row** (`graph-filter-row`): mono `показать` label; multi-select tag chips, each with a
   mono count of words carrying it (active = solid ink); right-aligned segmented control
   `всё / слова / теги` (active = ink bg + white). Graph-local filter state — nothing written back to
   `app` (independent of the words-panel tag filter).
4. **Canvas area** (`graph-canvas`, `flex-1`, `1px line` border, `rounded-card`, `min-h-[520px]`,
   `overflow-hidden`): `<canvas>` (cursor grab/grabbing/pointer); top-left **legend** (`● тег` /
   `○ слово`); top-right **controls hint** (mono, 3 lines); bottom-left **zoom stack** (`+ / − / ↻`,
   38px, hairline-separated, `rounded-[14px]`, hover → ink); centered **no-result overlay** (hidden
   unless a search yields zero matches: `Пусто` + `по запросу «{q}» ничего не найдено`); bottom-right
   **detail card**.

### Mobile layout (`<MobileWordGraphScreen>`)

Full-screen in `MobileApp`: compact top bar (back chevron + `Граф слов` + counters), the search pill,
a horizontally scrollable chip row with the type segment, canvas filling the rest. Detail card docks
to the bottom as a card/sheet. Zoom via on-screen `+ / −` buttons and **pinch-to-zoom**; controls
hint swaps to touch wording (`тяни — двигать · тап — открыть`).

## Interactions (spec-faithful, from the handoff)

- **Camera**: `cam = {x, y, scale}`. Pan = drag on empty canvas. Wheel zoom = `scale *= exp(-dy*0.0015)`
  clamped `[0.3, 3.2]`, anchored under the cursor. Zoom buttons `×1.25 / ×0.8` around canvas center.
  Pinch (mobile) anchors around the pinch midpoint. A gesture under 3px of movement counts as a click.
- **Nodes**: hover → 1.4px ring + pointer cursor. Drag pins to cursor (`vx=vy=0`) and reheats; on
  release the node unpins and springs back. Click (no drag) selects, opens the card, and highlights
  the node + neighbours (everything else dims to 0.16). Click empty → deselect + close card.
- **Search**: lowercase/trim; `matched` = nodes whose query is a substring of label / tag gloss
  (n/a here) / word meaning / any tag label; `highlight = matched ∪ neighbours(matched)`,
  `highlight.core = matched`. Non-highlighted nodes + edges dim to 0.16; core gets the 2px ring; edges
  touching a core node render strong. Empty query clears. Zero matches → no-result overlay.
- **Filters**: tag chips multi-select (AND); type segment hides the other node type. Hidden nodes are
  excluded from render, hit-testing, AND physics; recompute reheats. A selected/hovered node that
  becomes hidden is deselected. Filters + search compose.
- **Detail card**: word → headword + mono lang badge + light `слово` badge + meaning + `Теги · n`
  outline pills (click → focus+select tag). tag → label + dark `тег` badge + `Слова · n` solid pills
  with mono lang superscript (click → focus+select word). Close (×) top-right or click empty. Focus =
  animate camera to center the node at `scale ≥ 1.1` over 420ms (cubic ease-out). Enter animation:
  opacity 0.28s + transform 0.34s spring.

## Physics (ported constants)

Force-directed, integrated each frame, always running at a low floor so nodes gently drift.

| Constant | Value |
|---|---|
| `ALPHA_MIN` | 0.02 |
| `ALPHA_DECAY` | 0.012 |
| `CHARGE` | 2600 (`f = CHARGE*alpha / dist²`) |
| `LINK_LEN` | 96 |
| `LINK_K` | 0.035 |
| `GRAVITY` | 0.018 |
| `DAMP` | 0.86 |
| Max speed | 30 |
| Soft collision | extra push when `dist < r_a + r_b + 16` |
| Breathing | ±0.18 sinusoidal per-node wander (random phase) |

Seed layout: tags on an inner ring (R≈115), words on an outer ring (R≈220–290) with jitter. User
actions `reheat()` alpha.

## Rendering values (canvas `draw()`)

- Background dot grid: `rgba(12,12,12,0.045)`, r=1px, spacing `34px × scale` (hidden when step < 14px).
- Edges: normal `rgba(12,12,12,0.10)`; strong (touching selection/search core) `rgba(12,12,12,0.32)`;
  dimmed `rgba(12,12,12,0.035)`; 1px.
- Tag node fill `#0c0c0c`; word node fill `#ffffff` + stroke `#0c0c0c` 1.6px.
- Selection/core ring `rgba(12,12,12,0.9)` 2px (selected/core) or 1.4px (hover), drawn at `r+5`.
- Dimmed node/label opacity 0.16. Label halo `rgba(255,255,255,0.82)` rounded-rect, r=4.
- Tag label `600 fs px IBM Plex Mono` white, centered in disc when it fits (`fs = clamp(9, r*0.42, 13)`),
  else below. Word label `500 fs px IBM Plex Sans` ink, below the node (`fs = max(11, 13*min(1.1, scale))`).
- DPR capped at 2.

## Persistence (`persistence.ts`)

Camera `{x,y,scale}` + per-node positions keyed by node id → `localStorage["lupa-graph-v1"]`, debounced
400ms while the sim is warm or dragging. On load, restore camera + positions for ids that still exist;
unknown ids fall back to the seed ring. Reset (`↻`) clears the key. All access wrapped in try/catch.

## Reactivity to `app.savedWords`

The hook diffs incoming words/tags against the live node set by id: surviving nodes keep their
`x/y/vx/vy`; new nodes seed onto the ring; removed nodes drop; degrees/radii recompute; then `reheat()`.
Add/remove a word or tag elsewhere (or the AI auto-tagger finishing) reflows smoothly instead of
resetting. If the selected node disappears, the card closes.

## Edge cases

- **No saved words / store unavailable**: centered empty state (`Сохранённых слов пока нет` /
  `Список слов недоступен`) instead of an empty canvas; the entry button is disabled at zero words.
- **Words with no tags**: isolated, drifting, searchable, clickable; card shows `Теги · 0`.
- **Filter/search hides the selected or hovered node** → deselect (card closes).
- **Container resize / mobile rotation**: re-measure via `ResizeObserver` (more correct inside the
  flex layout than the handoff's window-resize listener).
- **`prefers-reduced-motion`**: drop the perpetual breathing wander and the card spring; the sim still
  settles, it just doesn't float forever.

## Testing (TDD — tests before implementation, behavior-focused)

**Pure unit tests (`graph-model`, `persistence`):**
- `buildGraph`: tag dedup by normalized key; degree + radius; links; isolated (untagged) words;
  multi-language words.
- `matchNodes`: substring match on label / word meaning / tag label; neighbour expansion;
  empty-query clears.
- `computeHidden`: type filter; tag multi-select AND; deselect-when-hidden.
- Transforms: `toScreen`/`toWorld` round-trip; `nodeAt` hit-testing (incl. radius padding).
- Position-preserving rebuild diff: surviving ids keep coords, new ids seed, stale ids drop.
- Persistence round-trip: save → load restores camera + known positions, ignores stale ids; reset
  clears the key; corrupt/absent storage degrades gracefully.

**Component tests (RTL, canvas `getContext` stubbed):**
- Search: clear button appears when non-empty and clears the field/highlight.
- Tag chip toggles active state; type segment switches.
- Detail card renders word vs tag content; pill clicks invoke focus/select.
- No-result overlay shows on zero matches.
- Empty / unavailable states.
- Navigation: `граф` button opens the screen; `← к плееру` returns; entry disabled at zero words;
  mobile sheet → full-screen graph → back.

**Not asserted:** exact physics float positions and pixel drawing. We test the pure logic that feeds
`draw()`, and that the RAF loop mounts/unmounts cleanly without throwing.

## Out of scope / future

- Tag glosses (would need a data-layer field; tag card is designed to slot one in later).
- Barnes-Hut/quadtree or d3-force for very large vocabularies (current O(n²) is fine at this scale).
- Editing tags directly from the graph.
