# Saved Words SQLite Design

Date: 2026-05-29

## Goal

Add a persistent saved-words list for clicked subtitle words.

The user should be able to save a word from the word popover and see saved words in a right-side panel next to the video player. The list persists across app restarts using SQLite.

This remains a small local vocabulary feature. It should not add accounts, cloud sync, study scheduling, translation UI, notes, tags, or per-video history in this iteration.

## Product Scope

In scope:
- Save and unsave words from the existing word lookup popover.
- Persist saved words locally in SQLite.
- Show a saved-words panel to the right of the player.
- Deduplicate by subtitle language and normalized word.
- Store the display word, language, optional language name, first dictionary meaning when available, optional source metadata, and timestamps.
- Keep saved words global across loaded videos and subtitle tracks.
- Preserve existing subtitle popover, dictionary lookup, and pause-at-cue-boundary behavior.

Out of scope:
- User accounts or sync.
- Export/import.
- Tags, notes, spaced repetition, or learned/unlearned states.
- Saving every occurrence or cue context.
- Search and filters.
- Backend dictionary changes beyond reusing the existing lookup result shape.
- Machine translation.

## Chosen Approach

Use SQLite immediately, backed by a small Rust persistence module exposed through Tauri commands.

Rationale:
- The user explicitly prefers starting with SQLite.
- SQLite is a better foundation if saved words later gain contexts, history, tags, or review states.
- Keeping persistence in Rust avoids relying on WebView storage details and gives the app a durable local data boundary.

The implementation should keep the first schema narrow so the feature does not become a study system prematurely.

## Data Model

Create a `saved_words` table during app startup:

```sql
CREATE TABLE IF NOT EXISTS saved_words (
  id TEXT PRIMARY KEY,
  normalized_word TEXT NOT NULL,
  display_word TEXT NOT NULL,
  language TEXT NOT NULL,
  language_name TEXT,
  first_meaning TEXT,
  source TEXT,
  source_url TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE(language, normalized_word)
);
```

Field meanings:
- `id`: stable app-owned id in the form `{language}:{normalized_word}`.
- `normalized_word`: trimmed lower-case comparison form used for deduplication.
- `display_word`: user-visible form from the clicked word or dictionary headword.
- `language`: normalized subtitle language code when possible, otherwise the raw track language code.
- `language_name`: optional display name such as `Немецкий`, `Английский`, or `Русский`.
- `first_meaning`: first dictionary meaning if lookup data is ready and includes meanings.
- `source` and `source_url`: optional attribution fields copied from dictionary lookup data when present.
- `created_at_ms`: insertion time.
- `updated_at_ms`: last metadata update time.

The unique key is `language + normalized_word`. For example, English `House` and `house` are the same saved word, but the same spelling in another language is separate.

## Backend Architecture

Add a new top-level Rust module at `src-tauri/src/saved_words.rs`. It should not be mixed into `vk::dictionary`; dictionary lookup and user persistence are different responsibilities.

Application startup:
1. Resolve an app data path for the SQLite database.
2. Open a SQLite connection.
3. Run the migration for `saved_words`.
4. Manage a `SavedWordsState` through Tauri state.

Commands:

```text
list_saved_words() -> Vec<SavedWord>
save_word(payload: SaveWordRequest) -> SavedWord
remove_saved_word(language: String, normalizedWord: String) -> ()
```

Return saved words ordered by `created_at_ms DESC`, so newest words appear first.

`save_word` should upsert on `language + normalized_word`. If a word already exists, update metadata fields and `updated_at_ms` but keep the original `created_at_ms`, so ordering remains based on first save time.

Backend errors should serialize into these stable categories:

```text
saved-words-unavailable
invalid-saved-word
```

Storage failures must not affect video loading, subtitle parsing, player control, or dictionary lookup.

## Frontend Architecture

Add a saved-words state boundary in `App`:
- load saved words once on app mount with `list_saved_words`;
- keep the returned list in memory;
- pass the list and handlers to the right-side panel and popover;
- update local state after successful save or remove;
- surface storage errors without clearing video state.

Add a `SavedWordsPanel` component:
- renders to the right of the loaded player area;
- shows a quiet empty state when there are no saved words;
- shows each item with word, language code, and first meaning or `без значения`;
- supports removing an item from the list;
- does not include search, filters, tags, or study controls in this iteration.

Extend `WordLookupPopover` with saved-word controls:
- show `Сохранить` when the current word is not saved;
- show `Сохраняю...` while saving;
- show `Сохранено` when saved;
- clicking `Сохранено` removes the word;
- show a short inline error such as `Не удалось сохранить слово` if save/remove fails.

The save button should not close the popover and should not interrupt the existing cue hold behavior.

## Save Payload

The frontend should build save payloads from the best data currently available.

When lookup is ready:
- `displayWord`: dictionary `headword`;
- `language`: lookup `language`;
- `languageName`: lookup `languageName`;
- `firstMeaning`: first item from lookup `meanings`;
- `source` and `sourceUrl`: copied from lookup data.

When lookup is loading, unavailable, not found, unsupported, or absent:
- `displayWord`: clicked word's cleaned text or visible text;
- `language`: normalized selected track language when possible, otherwise raw selected track language or `unknown`;
- `languageName`: empty/null unless known;
- `firstMeaning`: empty/null;
- source fields: empty/null.

The app should allow saving unsupported-language words. They appear with no meaning and a language code if available.

## Layout

For loaded-video state, replace the single centered player column with a two-column work area:
- left column: existing controls and 16:9 video player;
- right column: saved-words panel, approximately 280-320px wide.

The right panel must not overlay the VK iframe, subtitle overlay, or popover.

If the viewport is too narrow, the panel can stack below the player. The current app already has a `body` minimum width of 960px, so the primary desktop/Tauri layout should be side-by-side.

Keep the visual style quiet and utility-focused:
- dark panel matching the current slate/black palette;
- compact rows;
- no hero treatment, decorative cards, or marketing copy.

## Data Flow

1. App starts and asks backend for `list_saved_words`.
2. User loads a video and clicks a subtitle word.
3. Existing popover opens and existing dictionary lookup behavior runs.
4. Popover checks whether the current `language + normalizedWord` exists in saved words.
5. User clicks `Сохранить`.
6. Frontend sends `save_word`.
7. Backend normalizes defensively, upserts SQLite row, and returns the saved item.
8. Frontend inserts or replaces that item in local saved-word state.
9. Saved-words panel re-renders with the new item at the top if it is newly created.
10. Clicking `Сохранено` or a panel remove control calls `remove_saved_word`.
11. Frontend removes the item from local state after backend success.

Changing video URL or subtitle track must not clear saved words.

## Error Behavior

Initial `list_saved_words` failure:
- show the panel with a compact unavailable state;
- disable save controls and show them as unavailable;
- keep video loading and subtitles usable.

Save/remove failure:
- leave the popover open;
- keep current word inspection and dictionary result visible;
- show `Не удалось сохранить слово`;
- do not optimistically change the panel unless the backend confirms success.

Invalid empty normalized word:
- backend rejects with `invalid-saved-word`;
- frontend shows the same compact save failure copy.

Dictionary failures:
- unchanged from current behavior;
- the user can still save the bare word without a meaning.

## Testing

Backend tests:
- migration creates the `saved_words` table.
- `save_word` inserts a row.
- saving the same `language + normalized_word` upserts without a duplicate.
- upsert preserves `created_at_ms` and updates metadata.
- `list_saved_words` returns newest first.
- `remove_saved_word` deletes only the matching language and normalized word.
- empty or punctuation-only words map to `invalid-saved-word`.
- SQLite open, migration, query, insert, update, and delete failures map to `saved-words-unavailable`.

Frontend tests:
- `App` loads saved words on mount.
- loaded video layout renders the saved-words panel to the right of the player.
- empty panel state is visible when the list is empty.
- popover shows `Сохранить` for an unsaved word.
- clicking `Сохранить` calls `save_word` and updates the panel.
- ready dictionary lookup contributes first meaning and source metadata to the save payload.
- unsupported or failed lookup can still save the bare word.
- saved word shows `Сохранено`; clicking it removes the word.
- save/remove failure shows `Не удалось сохранить слово`.
- existing cue hold and pause-at-cue-boundary tests continue passing.

Recommended verification:

```powershell
npm test
npm run build
git diff --check
Set-Location src-tauri
cargo test
cargo fmt --check
```

Run the Tauri production smoke build if the SQLite dependency or app startup wiring changes enough to justify it:

```powershell
npm run tauri build -- --no-bundle
```

## Future Extensions

Potential follow-ups:
- save per-video cue context as a separate table;
- search and language filters;
- export/import;
- tags and review states;
- migration framework if multiple schema versions become likely;
- richer attribution/about surface for dictionary-derived saved metadata.
