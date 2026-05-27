# German Word Popover Design

Date: 2026-05-27

## Goal

Add a richer word-inspection popover for German subtitles. When a user clicks a German subtitle word, the app should show Russian dictionary information resembling the reference screenshot's structure: word, pronunciation, meaning, and grammar.

This is still an MVP feature. It should improve the existing clickable subtitle popover without turning the app into a full language-learning platform.

## Product Scope

In scope:
- German subtitle tracks only.
- Russian dictionary explanations.
- Online lookup through a Wiktapi-compatible service backed by Russian Wiktionary/Kaikki data.
- In-memory caching during the app session.
- A compact popover with loading, success, not-found, and unavailable states.
- A data contract that can later be backed by a local dictionary without changing the frontend component shape.

Out of scope:
- Other subtitle languages.
- Machine translation.
- LLM-based contextual explanation.
- Saved words, history, accounts, or study tools.
- Offline dictionary packaging.
- True sense disambiguation based on the subtitle sentence.

## Source Decision

Use approach A from brainstorming: Russian Wiktionary German entries through Kaikki/Wiktapi.

Rationale:
- Kaikki publishes machine-readable Wiktionary extracts, including Russian Wiktionary entries for German words.
- The Russian Wiktionary German extract gives Russian-language meanings directly, avoiding a first-version machine-translation layer.
- A Wiktapi-compatible API provides structured JSON over Wiktextract/Kaikki-style data and keeps the app from parsing Wiktionary HTML.
- The backend can hide the exact provider behind a stable Tauri command, allowing a later switch to a local SQLite dictionary.

References:
- Kaikki Russian Wiktionary German index: https://kaikki.org/ruwiktionary/%D0%9D%D0%B5%D0%BC%D0%B5%D1%86%D0%BA%D0%B8%D0%B9/index.html
- Wiktapi documentation: https://wiktapi.dev/
- Wiktapi quickstart: https://wiktapi.dev/quickstart

Licensing note:
- Wiktionary-derived data is share-alike content. The implementation must preserve source attribution in the normalized lookup result and expose it in the UI or an adjacent attribution surface. The implementation plan should verify the exact attribution text required by the selected endpoint before shipping.

## Architecture

Keep dictionary lookup behind the Rust/Tauri backend.

Frontend responsibilities:
1. Detect when the selected subtitle track is German.
2. Open the popover immediately on word click.
3. Render lookup states: loading, ready, not found, unavailable, or unsupported language.
4. Preserve the existing subtitle cue hold and pause-at-cue-boundary behavior.
5. Avoid direct browser requests to the dictionary provider.

Backend responsibilities:
1. Normalize the clicked German word for lookup.
2. Query a Wiktapi-compatible endpoint for Russian Wiktionary German data.
3. Enforce a short timeout, response size limit, and host allowlist.
4. Normalize the external response into an app-owned contract.
5. Cache successful results and not-found results in memory for the current app session.
6. Return stable error categories to the frontend.

The subtitle cue text should be passed to the backend command now, but the first implementation should not use it for sense disambiguation. It is included so the command shape will support contextual lookup later.

## Data Flow

Existing flow:
1. `SubtitleOverlay` renders clickable words from the active cue.
2. A word click opens a Radix popover containing only the word.
3. `App` arms the existing pause-at-cue-boundary behavior.

New flow:
1. User clicks a word in a German subtitle cue.
2. `SubtitleOverlay` still calls the existing cue-inspection callback so hold/pause behavior remains unchanged.
3. A new word lookup callback receives the clicked word and cue context.
4. `App` opens the popover in loading state and invokes a new Tauri command, such as `lookup_german_word`.
5. Rust backend checks the session cache.
6. On cache miss, Rust calls the Wiktapi-compatible endpoint.
7. Rust maps the provider response into `GermanWordLookup`.
8. Frontend updates the popover with either dictionary data or an error state.

Proposed command input:

```ts
type GermanWordLookupRequest = {
  word: string;
  cueText: string;
  trackLang: string;
};
```

Proposed command output:

```ts
type GermanWordLookup = {
  query: string;
  headword: string;
  ipa?: string;
  partOfSpeech?: string;
  grammar: string[];
  meanings: string[];
  source: "ruwiktionary";
  sourceUrl?: string;
};
```

Stable frontend error categories:

```ts
type GermanWordLookupError =
  | "unsupported-language"
  | "not-found"
  | "dictionary-unavailable";
```

## Popover UI

The visual direction should follow the approved companion mockup:
- Compact dark popover positioned above the subtitle lane.
- Header with the headword, IPA when available, language/source metadata, and close button.
- A `Значение` block for Russian meanings.
- A `Грамматика` block for part of speech and grammar tags.
- Loading state that keeps the clicked word visible and shows `Ищу в словаре...`.
- Not-found state: `Слово не найдено в немецком словаре`.
- Network/API failure state: `Словарь сейчас недоступен`.
- Unsupported language state for non-German tracks.

The popover should stay utility-focused and should not adopt the full decorative style of the reference screenshot. The reference informs content hierarchy, not the app's overall visual identity.

## German Track Detection

Use subtitle track metadata already returned by the backend. For the first implementation, treat a track as German when `track.lang` is `de` or starts with `de-` after trimming and lowercasing.

If track language metadata is missing or not German, do not call the dictionary command. The UI should keep the old simple word display or show an unsupported-language state, depending on what is less disruptive in implementation. The preferred behavior is to keep the old simple word display for non-German tracks.

## Word Normalization

Frontend should pass the clicked word's existing `cleanText`. Backend should still normalize defensively:
- trim whitespace
- strip surrounding punctuation
- preserve German letters and casing where useful
- reject empty strings after cleanup

The first implementation should query the clicked form directly. Lemma fallback can be added later if Wiktapi/Kaikki data for inflected forms is insufficient.

## Cache Policy

Use an in-memory backend cache for the current app session.

Cache key:

```text
de:<normalized-word>
```

Cache values:
- successful `GermanWordLookup`
- not-found result

Do not cache transient provider failures in the first version. A short negative cache for not-found is acceptable because repeated clicks on absent words should not retry aggressively.

Disk caching is out of scope for this design.

## Network And Safety

The dictionary client should be separate from VK subtitle fetching.

Requirements:
- Use an explicit User-Agent.
- Use a short timeout, approximately 5 seconds.
- Limit response size before parsing.
- Allowlist the selected Wiktapi-compatible host.
- Return stable app errors instead of provider-specific text.
- Keep the provider URL configurable in code so tests can use a local mock server.

The dictionary allowlist must not relax the existing subtitle URL allowlist.

## Error Behavior

Frontend behavior:
- Opening a lookup never clears the loaded video or subtitle lane.
- Lookup failure does not close the popover.
- Closing the popover releases the held cue using the existing lifecycle.
- Retrying can be implicit: clicking the same word again can re-run lookup unless a cached result exists.

Backend behavior:
- Empty normalized word maps to `not-found`.
- 404 or equivalent provider miss maps to `not-found`.
- Timeout, DNS, invalid JSON, unexpected response, and oversized response map to `dictionary-unavailable`.
- Unsupported language should be prevented by the frontend, but the backend should still reject non-German requests defensively if `trackLang` is included.

## Testing

Frontend tests:
- Clicking a German subtitle word opens the popover and shows loading state.
- Successful lookup renders `Значение` and `Грамматика`.
- Not-found and unavailable errors render distinct messages.
- Non-German tracks do not invoke the dictionary lookup.
- Existing cue hold and release behavior still works when lookup is loading, succeeds, fails, and the popover closes.

Backend tests:
- German word normalization handles punctuation and empty strings.
- Wiktapi-compatible URL construction uses the expected edition/language parameters.
- Successful provider JSON maps into `GermanWordLookup`.
- Not-found, timeout, invalid JSON, and oversized response map to stable errors.
- Dictionary host allowlist rejects unexpected hosts.
- Cache returns repeated successful and not-found lookups without another provider call.

Recommended verification:

```powershell
npm test
npm run build
git diff --check
Set-Location src-tauri
cargo test
cargo fmt --check
```

## Future Extensions

Potential follow-ups after the MVP:
- Lemma fallback for inflected German forms.
- Local SQLite dictionary generated from Kaikki JSONL.
- Contextual sense ranking using `cueText`.
- Grammar explanations from a local German NLP model.
- Secondary examples or synonyms from OpenThesaurus.
- A dedicated attribution/about surface for dictionary sources if the popover becomes too crowded.
