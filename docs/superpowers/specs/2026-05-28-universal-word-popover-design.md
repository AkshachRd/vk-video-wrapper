# Universal Word Popover Design

Date: 2026-05-28

## Goal

Extend the rich word-inspection popover from German-only lookup to German, English, and Russian subtitle tracks.

The popover should keep Russian UI copy and Russian dictionary explanations for all supported languages. For Russian subtitle words, the lookup is Ru-Ru: a Russian-language dictionary explanation of the Russian word, not an English translation.

This remains an MVP dictionary feature. It should not become machine translation, saved vocabulary, or LLM-based contextual explanation.

## Product Scope

In scope:
- German, English, and Russian subtitle tracks.
- Russian dictionary explanations for all supported languages.
- One normalized app-owned lookup contract used by backend and frontend.
- Online lookup through Kaikki JSONL pages generated from Russian Wiktionary data.
- In-memory caching during the app session.
- Compact popover states: loading, ready, not found, unavailable, and simple-word fallback for unsupported languages.

Out of scope:
- Other subtitle languages.
- Machine translation.
- LLM-based contextual explanation.
- Saved words, history, accounts, or study tools.
- Offline dictionary packaging.
- True sense disambiguation based on subtitle context.
- Lemmatization or morphological fallback beyond simple word-form retries.

## Source Decision

Use Kaikki JSONL pages from the Russian Wiktionary extract as the first universal source.

Rationale:
- Kaikki exposes machine-readable Wiktionary extracts as per-entry JSONL files.
- The Russian Wiktionary extract has Russian-language meanings for German, English, and Russian entries.
- Direct Kaikki JSONL works for Cyrillic Russian words, while the current Wiktapi word endpoint tested during brainstorming returned 404 for URL-encoded Russian words such as `дом`.
- A single source and a single wiktextract-style parser produce a cleaner architecture than splitting German/English through Wiktapi and Russian through Kaikki.

References:
- Kaikki Russian Wiktionary German entry example: https://kaikki.org/ruwiktionary/%D0%9D%D0%B5%D0%BC%D0%B5%D1%86%D0%BA%D0%B8%D0%B9/meaning/H/Ha/Haus.jsonl
- Kaikki Russian Wiktionary English entry example: https://kaikki.org/ruwiktionary/%D0%90%D0%BD%D0%B3%D0%BB%D0%B8%D0%B9%D1%81%D0%BA%D0%B8%D0%B9/meaning/h/ho/house.jsonl
- Kaikki Russian Wiktionary Russian entry example: https://kaikki.org/ruwiktionary/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9/meaning/%D0%B4/%D0%B4%D0%BE/%D0%B4%D0%BE%D0%BC.jsonl
- Kaikki raw data page: https://kaikki.org/dictionary/rawdata.html
- Wiktapi editions documentation: https://wiktapi.dev/concepts/editions

Licensing note:
- Wiktionary-derived data is share-alike content. The lookup result must preserve source attribution and expose a source URL in the popover. A fuller attribution/about surface can be added later if the app grows beyond the MVP.

## Architecture

Replace the German-specific dictionary surface with a language-neutral dictionary surface.

Backend responsibilities:
1. Expose one Tauri command: `lookup_word`.
2. Accept `word`, `cueText`, and `trackLang`.
3. Normalize `trackLang` to a supported lookup language: `de`, `en`, or `ru`.
4. Reject unsupported languages with `unsupported-language`.
5. Normalize the clicked word defensively.
6. Build and fetch the Kaikki JSONL URL for the selected language.
7. Enforce timeout, response size limit, no redirects, and host allowlist.
8. Parse wiktextract/Kaikki JSONL into an app-owned `WordLookup`.
9. Cache successful and not-found results for the current app session.

Frontend responsibilities:
1. Detect supported lookup track languages with one helper.
2. Open the existing popover immediately on word click.
3. Preserve the existing cue hold and pause-at-cue-boundary behavior.
4. Invoke `lookup_word` only for `de`, `en`, and `ru` tracks.
5. Keep the simple word-only popover for unsupported or missing track languages.
6. Render language-neutral lookup states in Russian.
7. Ignore stale async lookup responses using the existing request-id pattern.

The subtitle cue text stays in the command input. The first implementation does not use it for sense disambiguation, but preserving it keeps room for later contextual ranking.

## Supported Languages

Supported lookup languages:

```text
de -> Немецкий
en -> Английский
ru -> Русский
```

Track language matching:
- Trim and lowercase `track.lang`.
- `de` and `de-*` map to `de`.
- `en` and `en-*` map to `en`.
- `ru` and `ru-*` map to `ru`.
- Everything else is unsupported.

Unsupported languages should not show a hard error in the popover. The user should still be able to click a word and see the old simple word display.

## Data Flow

1. `SubtitleOverlay` renders clickable words from the active subtitle cue.
2. User clicks a word.
3. `SubtitleOverlay` passes `cue` and `word` to `App`.
4. `App` arms the existing cue hold and pause-at-cue-boundary behavior.
5. `App` checks the selected subtitle track language.
6. If unsupported, `App` resets lookup state to `idle` and leaves the simple popover content.
7. If supported, `App` sets `{ status: "loading", query }` and invokes `lookup_word`.
8. Rust checks the session cache with key `{language}:{normalizedWord}`.
9. On cache miss, Rust downloads the Kaikki JSONL page.
10. Rust parses one or more JSONL entries, filters by `lang_code`, and maps the first usable entries into `WordLookup`.
11. Frontend renders ready, not-found, or unavailable state.
12. Closing the popover resets lookup state and releases the held cue as it does now.

## Command Contract

Proposed command input:

```ts
type WordLookupRequest = {
  word: string;
  cueText: string;
  trackLang: string;
};
```

Proposed command output:

```ts
type WordLookup = {
  query: string;
  headword: string;
  language: "de" | "en" | "ru";
  languageName: "Немецкий" | "Английский" | "Русский";
  ipa?: string;
  partOfSpeech?: string;
  grammar: string[];
  meanings: string[];
  source: "ruwiktionary-kaikki";
  sourceUrl?: string;
};
```

Stable frontend error categories:

```ts
type WordLookupError =
  | "unsupported-language"
  | "not-found"
  | "dictionary-unavailable";
```

The implementation may keep old German type aliases temporarily while migrating tests, but the final public frontend/backend contract should use neutral `WordLookup` names.

`sourceUrl` should point to a user-readable Kaikki HTML entry page when possible, not the JSONL file. A later attribution view can add direct Wiktionary links if needed.

## Kaikki URL Building

Base URL:

```text
https://kaikki.org/ruwiktionary/
```

Language path segment:

```text
de -> Немецкий
en -> Английский
ru -> Русский
```

Entry path shape:

```text
{languageName}/meaning/{firstChar}/{firstTwoChars}/{word}.jsonl
```

Examples:

```text
Немецкий/meaning/H/Ha/Haus.jsonl
Английский/meaning/h/ho/house.jsonl
Русский/meaning/д/до/дом.jsonl
```

Path construction requirements:
- Use URL/path segment encoding APIs rather than manual string concatenation.
- Treat Unicode scalar values as characters when deriving `firstChar` and `firstTwoChars`.
- Preserve the original useful casing for the first request.
- For `de` and `en`, retry lowercase when the original request returns not-found and the original had uppercase characters.
- For `ru`, preserve Cyrillic and `ё`; lowercase fallback is allowed only when the clicked token contains uppercase letters.

## JSONL Parsing

The parser should handle one JSON object per line. A word may have multiple entries, such as English `house` as a noun and verb.

For each object:
- Require matching `lang_code`.
- Use `word` as `headword`.
- Use `sounds[].ipa` for the first available IPA, trimming square brackets for display if useful.
- Use `pos` for part of speech.
- Use `tags`, `raw_tags`, and selected form tags for grammar text.
- Flatten `senses[].glosses` into `meanings`.
- Ignore entries without usable glosses.

Selection policy:
- Prefer entries that match the requested `lang_code`.
- Include meanings from the first one or two usable entries, capped to a small number such as six meanings total.
- The first implementation does not rank senses by `cueText`.

Provider contract drift means the response is syntactically JSONL but lacks the expected object/entry shape in a way that suggests parser incompatibility. That maps to `dictionary-unavailable`, not `not-found`.

## Popover UI

The visual hierarchy remains the current compact dark popover:
- Header with headword.
- IPA when available.
- Source link.
- `Значение` section for Russian meanings.
- `Грамматика` section for part of speech and grammar tags.

State copy:
- Loading: `Ищу в словаре...`
- Not found: `Слово не найдено в словаре`
- Unavailable: `Словарь сейчас недоступен`

The not-found copy should no longer mention German. The popover should not add separate language-learning controls, saved-word actions, or translation toggles in this scope.

## Cache Policy

Use backend in-memory cache for the current app session.

Cache key:

```text
{language}:{normalized-word}
```

Cache values:
- successful `WordLookup`
- not-found result

Do not cache `dictionary-unavailable`, because transient network failures should be retryable on a later click.

## Network And Safety

Requirements:
- Use an explicit User-Agent.
- Use a short timeout, approximately 5 seconds.
- Disable redirects.
- Limit response size before parsing.
- Allowlist `kaikki.org`.
- Keep the endpoint base configurable in code so tests can use a local mock server.
- Return stable app errors instead of provider-specific text.

This dictionary allowlist is separate from VK subtitle URL validation and must not relax subtitle download safety.

## Error Behavior

Backend mapping:
- Empty normalized word -> `not-found`.
- Unsupported track language -> `unsupported-language`.
- Kaikki 404 -> `not-found`.
- Empty JSONL or no usable glosses for the requested language -> `not-found`.
- Timeout, DNS, invalid JSONL, oversized response, non-2xx except 404, and contract drift -> `dictionary-unavailable`.

Frontend behavior:
- Lookup failure does not close the popover.
- Lookup failure does not clear the loaded video or subtitle lane.
- Closing the popover releases the held cue using the existing lifecycle.
- Starting a new lookup invalidates older pending responses.
- Loading a new video or changing subtitle track resets lookup state.

## Testing

Backend tests:
- Language normalization accepts `de`, `de-DE`, `en`, `en-US`, `ru`, and `ru-RU`.
- Unsupported languages map to `unsupported-language`.
- URL construction matches representative German, English, and Russian words.
- URL construction handles Unicode path segments without manual string corruption.
- Host allowlist rejects unexpected hosts.
- Response byte limit maps to `dictionary-unavailable`.
- Successful German, English, and Russian JSONL map into `WordLookup`.
- Multiple JSONL entries can contribute meanings without exceeding the cap.
- Empty glosses map to `not-found`.
- Invalid JSONL and provider contract drift map to `dictionary-unavailable`.
- Successful and not-found cache entries prevent repeated provider requests.

Frontend tests:
- Supported-language helper accepts `de/en/ru` and regional variants.
- Unsupported languages return `undefined` from the language-normalization helper.
- Popover renders loading, ready, not-found, unavailable, and idle states.
- Ready state renders source, `Значение`, and `Грамматика` for `de`, `en`, and `ru` data.
- `App` invokes `lookup_word` for German, English, and Russian tracks.
- `App` does not invoke lookup for unsupported tracks.
- Stale lookup responses do not overwrite the currently inspected word.
- Existing cue hold and release behavior still works while lookup is loading, succeeds, fails, and closes.

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

Potential follow-ups:
- Local SQLite dictionary generated from Kaikki JSONL.
- Lemma fallback for inflected forms.
- Contextual sense ranking using `cueText`.
- Better morphology hints for Russian cases and English verb forms.
- A dedicated attribution/about surface if source details become too crowded for the popover.
