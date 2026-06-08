# Second Subtitle Line (Read-Only Reference) Design

Date: 2026-06-08

## Goal

Add a second, non-primary subtitle line below the existing interactive line. The
second line is a read-only reference ("opora") in another language whose track the
user can choose. The intended use is language learning: the primary line is the
studied (foreign) language with clickable words and dictionary lookup, while the
secondary line shows a Russian translation for support.

This builds on the existing single-lane overlay and the data model that already
reserves `role: "primary" | "secondary"` for exactly this case. It does not turn
the app into a full study platform.

## Product Scope

In scope:
- One additional subtitle line, rendered below the primary line.
- The second line is read-only: no clickable words, no popover, no dictionary
  lookup, no saved-words control.
- The second line's track is chosen from the VK-provided tracks via a dedicated
  "Перевод" dropdown that includes a `Нет` (off) option.
- On video load, the app auto-selects a default pair: primary = studied (foreign)
  track, secondary = Russian track when available. The user can change or disable
  the second line afterward.
- The default track selection logic moves from "prefer Russian as primary" to
  "prefer foreign as primary, Russian as secondary".
- The second line follows the same playback time as the primary line, including
  the existing held-cue / pause-at-cue-boundary behavior.

Out of scope (unchanged non-goals):
- Machine translation as the secondary source. The second line is a VK-provided
  track only for now. The model keeps `source: "machine-translation"` reserved for
  later, but no MT UI is added.
- Clickable words / dictionary / saved words on the second line.
- More than two rendered lines.
- A persisted preference for the chosen secondary language across sessions.
- VK auth, private videos, local subtitle import.

## Decisions From Brainstorming

1. Role of the second line: read-only reference/translation. Words are not
   clickable.
2. Activation: auto-pick a second language on load when a suitable track exists;
   the user can disable it with `Нет` or change it.
3. Default pairing: primary = studied/foreign, secondary = Russian. This flips the
   current backend default, which prefers Russian for the primary.
4. Architecture: the Rust backend computes the pair and returns both tracks in a
   single `load_video_from_url` response (approach A). All language-selection
   heuristics stay in Rust.
5. Layout: primary line on top (larger, interactive), Russian opora below
   (smaller, dimmer, read-only).
6. The opora must never break the main load. Held-cue / pause behavior carries over
   to the opora for free because both lines read the same effective time.

## Architecture Overview

The split stays the same: Rust owns network access and track selection; the React
frontend owns parsing, rendering, and interaction.

The change touches three layers:

1. Backend track selection (`subtitles.rs`): a new pair selector.
2. Backend command contract (`command.rs`): `LoadedVideo` carries an optional
   secondary track id and secondary subtitle text.
3. Frontend (`App.tsx`, overlay components): a second lane state, a second
   dropdown, and a read-only line component stacked below the primary.

## Backend Design

### Pair selection (`src-tauri/src/vk/subtitles.rs`)

Replace `select_primary_track` (currently "prefer Russian, else first") with a pair
selector:

```rust
pub fn select_subtitle_pair(
    tracks: &[VkSubtitleTrack],
) -> Result<(&VkSubtitleTrack, Option<&VkSubtitleTrack>), VkLoadError>;
```

Rules:
- Primary: the first track with `lang != ru` (case-insensitive); if none, the first
  track overall.
- Secondary: the first track with `lang == ru` that is not the same track instance
  as the primary; otherwise `None`.
- Empty `tracks` returns `VkLoadError::SubtitlesNotFound`, as today.

Resulting behavior:
- `[en, ru]` -> primary `en`, secondary `ru`.
- `[ru]` -> primary `ru`, secondary `None`.
- `[en, de]` -> primary `en`, secondary `None` (no Russian; the user can still pick
  a second line manually).
- `[ru, en, de]` -> primary `en` (first non-ru by order), secondary `ru`.

Note: "studied language" is not configurable; "foreign" is approximated as
"not Russian". The user can always override both lines via the dropdowns.

### Command contract (`src-tauri/src/vk/command.rs`)

Extend `LoadedVideo`:

```rust
pub struct LoadedVideo {
    pub video_id: VkVideoId,
    pub embed_url: String,
    pub tracks: Vec<VkSubtitleTrack>,
    pub selected_track_id: String,            // primary (unchanged meaning)
    pub subtitle_text: String,                // primary text (unchanged meaning)
    pub secondary_track_id: Option<String>,   // new
    pub secondary_subtitle_text: Option<String>, // new
}
```

`load_video_from_url`:
1. Parse URL, fetch embed metadata (unchanged).
2. `select_subtitle_pair` to get primary + optional secondary.
3. Fetch primary subtitle text (unchanged; failure fails the whole load, as today).
4. If a secondary track exists, attempt to fetch its text. On success, set both
   secondary fields. On fetch failure, set both secondary fields to `None` and still
   return success. The opora is optional and must never break the main load.

`load_subtitle_track` is unchanged. It already selects any track by id and returns
text, so the frontend reuses it to switch either the primary or the secondary line.

`LoadedSubtitleTrack` is unchanged.

## Frontend Design

### Types (`src/lib/subtitles/types.ts`)

```ts
export interface LoadedVideo {
  // ...existing fields...
  secondaryTrackId?: string;
  secondarySubtitleText?: string;
}
```

`SubtitleLane`, `SubtitleRole`, `SubtitleSource` are unchanged and already support
`role: "secondary"`, `source: "vk-track"`.

### State (`src/App.tsx`)

New state alongside the primary lane:
- `secondaryLane: SubtitleLane | undefined`
- `selectedSecondaryTrackId: string` (`""` means off / `Нет`)
- `isSecondaryTrackLoading: boolean`
- `secondaryTrackRequestIdRef` (independent request-id guard, same pattern as the
  primary `trackRequestIdRef`)
- `secondaryError: string | undefined` (scoped to the second line)

Load flow (`handleSubmit` success path):
- Parse `secondarySubtitleText` when present. On success, set `secondaryLane` with
  `{ role: "secondary", source: "vk-track", trackId: secondaryTrackId, cues }` and
  `selectedSecondaryTrackId = secondaryTrackId`.
- If the field is absent or parsing yields zero cues, leave the second line off
  (`secondaryLane = undefined`, `selectedSecondaryTrackId = ""`). This is silent; no
  error is shown for an auto-pick that did not produce a usable opora.
- Reset all secondary state on every new URL submit, mirroring the primary reset.

Secondary dropdown handler (`handleSecondaryTrackChange`):
- Options: `Нет` (value `""`) plus every track in `video.tracks`, labeled with the
  existing `formatTrackLabel`.
- Selecting `Нет`: clear `secondaryLane` and `selectedSecondaryTrackId`, clear
  `secondaryError`.
- Selecting a track: call `load_subtitle_track(videoId, trackId)`, parse, set the
  secondary lane. Guard with `secondaryTrackRequestIdRef`. On fetch/parse failure,
  set `secondaryError` and keep the previous secondary lane visible (mirrors the
  primary track-switch behavior). Failures here never touch the primary lane or the
  top-level `error`.

The primary `handleTrackChange` is unchanged in behavior; it keeps using the
existing top-level `error` and `selectedTrackId`.

### Rendering

Layout: a single bottom-anchored flex-column wrapper centers and stacks the two
lines, primary on top and the opora below.

Refactor: the absolute positioning currently inside `SubtitleOverlay`
(`absolute inset-x-0 bottom-7 flex justify-center px-8`) moves up into a new
wrapper owned by `App`. `SubtitleOverlay` keeps rendering only its cue bubble (the
interactive primary line) and no longer self-positions. The wrapper renders:

```
<div className="pointer-events-none absolute inset-x-0 bottom-7 flex flex-col items-center gap-1 px-8">
  <SubtitleOverlay ... />            {/* primary, interactive, larger */}
  {secondaryLane ? <SubtitleReferenceLine lane={secondaryLane} timeMs={effectiveTimeMs} /> : null}
</div>
```

New component `src/components/subtitle-reference-line.tsx`:
- Props: `{ lane: SubtitleLane; timeMs: number }`.
- Uses `selectActiveCue(lane.cues, timeMs)`; renders `null` when no active cue.
- Renders the cue as plain text (no per-word buttons, no `Popover`).
- Styling: smaller than the primary (e.g. `text-lg` vs the primary's `text-2xl`),
  dimmer (e.g. `text-slate-200`/reduced opacity), its own translucent bubble,
  `pointer-events-none`.

Both lines receive `heldSubtitleTimeMs ?? timeMs` as the effective time, so the
opora freezes together with the primary line during word inspection and the
pause-at-cue-boundary hold. No new pause logic is required; the secondary line just
shows whichever of its cues overlaps the effective time.

### Subtitle controls UI

The controls row gains a second labeled dropdown next to the existing "Subtitles"
control:
- "Subtitles" (primary) — unchanged.
- "Перевод" (secondary) — `Нет` + all tracks. Disabled while
  `isSecondaryTrackLoading`.
- `secondaryError`, when set, renders as a quiet inline note near the "Перевод"
  dropdown. It does not use the top-level `Alert` and does not clear the video.

## Error Handling Summary

- Primary load failure: unchanged (clears video, shows top-level error).
- Secondary fetch failure during initial load: backend returns secondary as
  `None`; the app simply shows no second line. Silent.
- Secondary parse failure during initial load: app leaves the second line off.
  Silent.
- Secondary switch failure (dropdown): scoped `secondaryError`; previous opora and
  the entire primary lane remain intact.

## Testing

Backend (`cargo test`):
- `select_subtitle_pair`: `[en, ru]` -> (`en`, `ru`); `[ru]` -> (`ru`, `None`);
  `[en, de]` -> (`en`, `None`); `[ru, en, de]` -> (`en`, `ru`); empty -> error.
- The old `prefers_russian_track` test is replaced by foreign-primary +
  russian-secondary assertions.
- `LoadedVideo` serializes `secondaryTrackId` / `secondarySubtitleText` as
  camelCase, including the `None` case.
- `load_video_from_url` assembly includes the secondary fields when a Russian track
  exists.

Frontend (`npm test`, React Testing Library):
- An auto-picked opora renders as a read-only line: its words are plain text, not
  buttons; clicking the text opens no popover.
- The primary line is still interactive (regression): its words are buttons and
  open the popover.
- Changing the "Перевод" dropdown to another track replaces the opora; selecting
  `Нет` removes it.
- A secondary switch failure shows the scoped inline note and leaves the primary
  lane and video intact.
- During held-cue inspection, the opora shows its cue at the held time (freezes
  with the primary line).
- Mock `invoke` for `load_video_from_url` (returning the new secondary fields) and
  `load_subtitle_track`, and mock the iframe player boundary, as in existing tests.

Other checks: `npm run build`, `git diff --check`, `cargo fmt --check`.

## Documentation Updates

- `AGENTS.md`: update the VK Integration / selection note (no longer "prefer
  Russian primary"); add the second line to the codebase map; adjust the scope
  note that limited rendering to one lane.
- `docs/llm/current-behavior.md`: describe the second read-only line, the "Перевод"
  dropdown, auto-pairing, and that held-cue behavior covers both lines.
- `docs/llm/product-context.md`: move the dual-line item from "future" to current
  capabilities; drop the single-lane non-goal; keep machine-translation as a
  non-goal.

## Build Sequence

1. Backend: `select_subtitle_pair` + tests (replace `select_primary_track` usage).
2. Backend: extend `LoadedVideo` + `load_video_from_url` to fetch and return the
   secondary, with the "secondary failure is non-fatal" behavior + tests.
3. Frontend types: add the two optional fields to `LoadedVideo`.
4. Frontend: `SubtitleReferenceLine` component + tests.
5. Frontend: positioning-wrapper refactor of `SubtitleOverlay` (move absolute
   positioning out) + tests confirming the primary line still works.
6. Frontend: `App.tsx` secondary state, load-flow parsing, and the "Перевод"
   dropdown + handler + tests.
7. Docs updates.
8. Full verification: `npm test`, `npm run build`, `git diff --check`, and in
   `src-tauri`: `cargo test`, `cargo fmt --check`.
