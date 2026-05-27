# German Word Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a German-only word lookup popover that shows Russian dictionary meanings and grammar from a Wiktapi/Kaikki-backed backend command.

**Architecture:** Rust owns dictionary networking, normalization, response mapping, safety limits, and session cache. React owns German track detection, lookup lifecycle, popover states, and preserving the existing subtitle hold/pause behavior.

**Tech Stack:** Tauri 2, Rust, reqwest, serde/serde_json, React 19, TypeScript, Vitest, React Testing Library, Radix Popover.

---

## File Structure

- Create `src-tauri/src/vk/dictionary.rs`: German dictionary command, error mapping, provider client helpers, response parser, word normalization, in-memory cache tests.
- Modify `src-tauri/src/vk/mod.rs`: expose the dictionary module.
- Modify `src-tauri/src/lib.rs`: manage dictionary state and register `lookup_german_word`.
- Create `src/lib/dictionary/types.ts`: frontend lookup result and UI-state types.
- Create `src/lib/dictionary/is-german-track.ts`: small tested helper for German track detection.
- Create `src/components/word-lookup-popover.tsx`: visual content for loading, success, not found, unavailable, and fallback simple-word states.
- Modify `src/components/subtitle-overlay.tsx`: pass clicked word to the app and render the richer popover content.
- Modify `src/components/subtitle-overlay.test.tsx`: cover the new overlay callback shape and popover rendering states.
- Modify `src/App.tsx`: own lookup state, invoke the backend command for German tracks, reset stale requests, and keep current subtitle pause lifecycle.
- Modify `src/App.test.tsx`: cover German lookup success/errors, non-German no-op, and hold/release behavior with lookup.

## Task 1: Backend German Dictionary Command

**Files:**
- Create: `src-tauri/src/vk/dictionary.rs`
- Modify: `src-tauri/src/vk/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests for normalization, URL construction, parsing, errors, and cache**

Add unit tests in `src-tauri/src/vk/dictionary.rs` under `#[cfg(test)]` before production implementation. Cover these exact behaviors:

```rust
#[test]
fn normalizes_clicked_german_words() {
    assert_eq!(normalize_german_word("„Häuser!“"), Some("Häuser".to_string()));
    assert_eq!(normalize_german_word("  wir  "), Some("wir".to_string()));
    assert_eq!(normalize_german_word("!!!"), None);
}

#[test]
fn detects_supported_german_track_languages() {
    assert!(is_supported_german_language("de"));
    assert!(is_supported_german_language(" de-DE "));
    assert!(!is_supported_german_language("ru"));
    assert!(!is_supported_german_language(""));
}

#[test]
fn builds_wiktapi_lookup_url() {
    let config = DictionaryClientConfig::for_tests("https://api.wiktapi.dev/v1/ru/word/");
    let url = build_lookup_url(&config, "Häuser").unwrap();

    assert_eq!(url.as_str(), "https://api.wiktapi.dev/v1/ru/word/H%C3%A4user?lang=de");
}

#[test]
fn rejects_untrusted_dictionary_hosts() {
    let config = DictionaryClientConfig::for_tests("https://example.com/v1/ru/word/");

    assert!(matches!(
        build_lookup_url(&config, "Haus"),
        Err(GermanWordLookupError::DictionaryUnavailable)
    ));
}

#[test]
fn parses_array_provider_response_into_lookup() {
    let json = r#"[{
        "word": "wir",
        "pos": "pron",
        "sounds": [{"ipa": "viːɐ̯"}],
        "senses": [{
            "glosses": ["мы"],
            "tags": ["first-person", "plural", "nominative"]
        }]
    }]"#;

    let lookup = parse_provider_response("wir", json.as_bytes()).unwrap();

    assert_eq!(lookup.query, "wir");
    assert_eq!(lookup.headword, "wir");
    assert_eq!(lookup.ipa.as_deref(), Some("viːɐ̯"));
    assert_eq!(lookup.part_of_speech.as_deref(), Some("местоимение"));
    assert_eq!(lookup.meanings, vec!["мы"]);
    assert!(lookup.grammar.contains(&"1-е лицо".to_string()));
    assert!(lookup.grammar.contains(&"множественное число".to_string()));
    assert!(lookup.grammar.contains(&"именительный падеж".to_string()));
    assert_eq!(lookup.source, "ruwiktionary");
}

#[test]
fn maps_empty_provider_senses_to_not_found() {
    let json = r#"[{"word": "x", "senses": []}]"#;

    assert!(matches!(
        parse_provider_response("x", json.as_bytes()),
        Err(GermanWordLookupError::NotFound)
    ));
}

#[test]
fn caches_successful_and_not_found_results() {
    let state = GermanDictionaryState::default();
    let lookup = GermanWordLookup {
        query: "wir".to_string(),
        headword: "wir".to_string(),
        ipa: Some("viːɐ̯".to_string()),
        part_of_speech: Some("местоимение".to_string()),
        grammar: vec!["1-е лицо".to_string()],
        meanings: vec!["мы".to_string()],
        source: "ruwiktionary".to_string(),
        source_url: Some("https://ru.wiktionary.org/wiki/wir".to_string()),
    };

    state.store_cache("de:wir", CacheEntry::Found(lookup.clone()));
    state.store_cache("de:nosuchword", CacheEntry::NotFound);

    assert_eq!(state.cached("de:wir"), Some(CacheEntry::Found(lookup)));
    assert_eq!(state.cached("de:nosuchword"), Some(CacheEntry::NotFound));
}
```

- [ ] **Step 2: Run targeted Rust tests and verify they fail for missing implementation**

Run:

```powershell
Set-Location src-tauri
cargo test dictionary
```

Expected: fail because `dictionary` module/types/functions are not implemented yet.

- [ ] **Step 3: Implement the backend dictionary module**

Create `src-tauri/src/vk/dictionary.rs` with these public API shapes:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GermanWordLookup {
    pub query: String,
    pub headword: String,
    pub ipa: Option<String>,
    pub part_of_speech: Option<String>,
    pub grammar: Vec<String>,
    pub meanings: Vec<String>,
    pub source: String,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum CacheEntry {
    Found(GermanWordLookup),
    NotFound,
}

#[derive(Default)]
pub struct GermanDictionaryState {
    cache: std::sync::Mutex<std::collections::HashMap<String, CacheEntry>>,
}

#[tauri::command]
pub async fn lookup_german_word(
    state: tauri::State<'_, GermanDictionaryState>,
    word: String,
    cue_text: String,
    track_lang: String,
) -> Result<GermanWordLookup, String>
```

Implementation requirements:
- `lookup_german_word` rejects non-German `track_lang` with `"unsupported-language"`.
- Normalize `word`; empty result maps to `"not-found"`.
- Use cache key `de:<normalized-word-lowercase>`.
- Cache successful lookups and not-found results.
- Do not cache `dictionary-unavailable`.
- `cue_text` is accepted but unused; bind it as `_cue_text` internally to avoid warnings.
- Use default endpoint base `https://api.wiktapi.dev/v1/ru/word/`.
- Build lookup URLs by appending the word as one path segment and adding `lang=de`.
- Allow only `api.wiktapi.dev` by default.
- Use `reqwest::Client::builder().timeout(Duration::from_secs(5)).redirect(reqwest::redirect::Policy::none())`.
- Use explicit User-Agent such as `vk-video-wrapper/0.1 dictionary-lookup`.
- Reject non-success status; map `404` to not-found and all other failures to unavailable.
- Read response bytes, reject bodies over `512 * 1024` bytes before JSON parsing.
- Parse flexible provider response shapes: direct object, array of objects, or object containing `entries`.
- Extract first usable entry with at least one non-empty glossary string.
- Extract IPA from `sounds[].ipa`.
- Map common `pos` values and common `tags` values to Russian user-facing grammar strings.
- Set `source_url` to `https://ru.wiktionary.org/wiki/<urlencoded-headword>`.

Add `pub mod dictionary;` to `src-tauri/src/vk/mod.rs`.

Register state and command in `src-tauri/src/lib.rs`:

```rust
.manage(vk::dictionary::GermanDictionaryState::default())
.invoke_handler(tauri::generate_handler![
    vk::command::load_video_from_url,
    vk::command::load_subtitle_track,
    vk::dictionary::lookup_german_word
])
```

- [ ] **Step 4: Run targeted Rust tests and verify they pass**

Run:

```powershell
Set-Location src-tauri
cargo test dictionary
```

Expected: all dictionary tests pass.

- [ ] **Step 5: Run all Rust tests**

Run:

```powershell
Set-Location src-tauri
cargo test
```

Expected: all Rust tests pass.

## Task 2: Frontend Popover Component And Overlay Contract

**Files:**
- Create: `src/lib/dictionary/types.ts`
- Create: `src/lib/dictionary/is-german-track.ts`
- Create: `src/lib/dictionary/is-german-track.test.ts`
- Create: `src/components/word-lookup-popover.tsx`
- Create: `src/components/word-lookup-popover.test.tsx`
- Modify: `src/components/subtitle-overlay.tsx`
- Modify: `src/components/subtitle-overlay.test.tsx`

- [ ] **Step 1: Write failing frontend tests for German detection and popover rendering**

Create `src/lib/dictionary/is-german-track.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isGermanTrackLang } from "./is-german-track";

describe("isGermanTrackLang", () => {
  it("accepts de and de region tags", () => {
    expect(isGermanTrackLang("de")).toBe(true);
    expect(isGermanTrackLang(" de-DE ")).toBe(true);
  });

  it("rejects missing and non-German language tags", () => {
    expect(isGermanTrackLang("")).toBe(false);
    expect(isGermanTrackLang(undefined)).toBe(false);
    expect(isGermanTrackLang("ru")).toBe(false);
  });
});
```

Create `src/components/word-lookup-popover.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WordLookupPopover } from "./word-lookup-popover";

describe("WordLookupPopover", () => {
  it("renders the simple fallback word when lookup is idle", () => {
    render(<WordLookupPopover fallbackWord="утро" lookup={{ status: "idle" }} />);

    expect(screen.getByText("утро")).toBeInTheDocument();
  });

  it("renders a Russian loading message", () => {
    render(<WordLookupPopover fallbackWord="wir" lookup={{ status: "loading", query: "wir" }} />);

    expect(screen.getByText("wir")).toBeInTheDocument();
    expect(screen.getByText("Ищу в словаре...")).toBeInTheDocument();
  });

  it("renders meaning and grammar sections for ready lookup data", () => {
    render(
      <WordLookupPopover
        fallbackWord="wir"
        lookup={{
          status: "ready",
          query: "wir",
          data: {
            query: "wir",
            headword: "wir",
            ipa: "viːɐ̯",
            partOfSpeech: "местоимение",
            grammar: ["1-е лицо", "множественное число"],
            meanings: ["мы"],
            source: "ruwiktionary",
            sourceUrl: "https://ru.wiktionary.org/wiki/wir",
          },
        }}
      />,
    );

    expect(screen.getByText("wir")).toBeInTheDocument();
    expect(screen.getByText("/viːɐ̯/")).toBeInTheDocument();
    expect(screen.getByText("Значение")).toBeInTheDocument();
    expect(screen.getByText("мы")).toBeInTheDocument();
    expect(screen.getByText("Грамматика")).toBeInTheDocument();
    expect(screen.getByText(/местоимение/)).toBeInTheDocument();
    expect(screen.getByText(/1-е лицо/)).toBeInTheDocument();
  });

  it("renders not-found and unavailable messages", () => {
    const { rerender } = render(
      <WordLookupPopover fallbackWord="x" lookup={{ status: "not-found", query: "x" }} />,
    );
    expect(screen.getByText("Слово не найдено в немецком словаре")).toBeInTheDocument();

    rerender(<WordLookupPopover fallbackWord="x" lookup={{ status: "unavailable", query: "x" }} />);
    expect(screen.getByText("Словарь сейчас недоступен")).toBeInTheDocument();
  });
});
```

Update `src/components/subtitle-overlay.test.tsx` before implementation:
- Change the callback assertion so `onWordInspect` must receive both the active cue and clicked word.
- Add a test that passes `wordLookup={{ status: "loading", query: "утро" }}` and verifies the open popover shows `Ищу в словаре...`.

- [ ] **Step 2: Run frontend targeted tests and verify they fail**

Run:

```powershell
npm test -- src/lib/dictionary/is-german-track.test.ts src/components/word-lookup-popover.test.tsx src/components/subtitle-overlay.test.tsx
```

Expected: fail because new files/API are not implemented yet.

- [ ] **Step 3: Implement dictionary frontend types and popover component**

Create `src/lib/dictionary/types.ts`:

```ts
export interface GermanWordLookup {
  query: string;
  headword: string;
  ipa?: string;
  partOfSpeech?: string;
  grammar: string[];
  meanings: string[];
  source: "ruwiktionary";
  sourceUrl?: string;
}

export type WordLookupState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; data: GermanWordLookup }
  | { status: "not-found"; query: string }
  | { status: "unavailable"; query: string };
```

Create `src/lib/dictionary/is-german-track.ts`:

```ts
export function isGermanTrackLang(lang: string | undefined): boolean {
  const normalized = lang?.trim().toLowerCase() ?? "";
  return normalized === "de" || normalized.startsWith("de-");
}
```

Create `src/components/word-lookup-popover.tsx` using utility-focused Tailwind classes:
- `fallbackWord` string prop.
- `lookup: WordLookupState` prop.
- For `idle`, render only fallback word.
- For `loading`, render word header and `Ищу в словаре...`.
- For `ready`, render headword, optional `/ipa/`, source metadata, `Значение`, meanings joined as separate lines, `Грамматика`, part of speech plus grammar tags.
- For `not-found`, render fallback word and `Слово не найдено в немецком словаре`.
- For `unavailable`, render fallback word and `Словарь сейчас недоступен`.

Update `src/components/subtitle-overlay.tsx`:
- Import `SubtitleWord` and `WordLookupState`.
- Change `onWordInspect?: (cue: SubtitleCue, word: SubtitleWord) => void`.
- Add `wordLookup?: WordLookupState`.
- Call `onWordInspect?.(cue, word)` on word click.
- Render `<WordLookupPopover fallbackWord={word.cleanText || word.text} lookup={wordLookup ?? { status: "idle" }} />` inside `PopoverContent`.

- [ ] **Step 4: Run targeted frontend tests and verify they pass**

Run:

```powershell
npm test -- src/lib/dictionary/is-german-track.test.ts src/components/word-lookup-popover.test.tsx src/components/subtitle-overlay.test.tsx
```

Expected: targeted frontend tests pass.

## Task 3: App Lookup Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing App tests for lookup lifecycle**

Add tests to `src/App.test.tsx` before implementation:

```tsx
it("looks up German words and renders Russian dictionary details", async () => {
  const user = userEvent.setup();
  mocks.invoke.mockImplementation((command: string) => {
    if (command === "load_video_from_url") {
      return Promise.resolve(
        loadedVideo({
          tracks: subtitleTracks,
          selectedTrackId: "de_1_de.vtt",
          subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
        }),
      );
    }

    if (command === "lookup_german_word") {
      return Promise.resolve({
        query: "Hallo",
        headword: "hallo",
        ipa: "haˈloː",
        partOfSpeech: "междометие",
        grammar: ["приветствие"],
        meanings: ["привет"],
        source: "ruwiktionary",
        sourceUrl: "https://ru.wiktionary.org/wiki/hallo",
      });
    }

    return Promise.reject(new Error(`unexpected command: ${command}`));
  });

  render(<App />);

  await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
  await user.click(screen.getByRole("button", { name: "Load" }));
  await user.click(await screen.findByRole("button", { name: "advance video" }));
  await user.click(screen.getByRole("button", { name: "Hallo" }));

  expect(screen.getByText("Ищу в словаре...")).toBeInTheDocument();
  expect(mocks.invoke).toHaveBeenCalledWith("lookup_german_word", {
    word: "Hallo",
    cueText: "Hallo Welt",
    trackLang: "de",
  });
  expect(await screen.findByText("Значение")).toBeInTheDocument();
  expect(screen.getByText("привет")).toBeInTheDocument();
  expect(screen.getByText("Грамматика")).toBeInTheDocument();
});

it("shows a not-found dictionary lookup state", async () => {
  const user = userEvent.setup();
  mocks.invoke.mockImplementation((command: string) => {
    if (command === "load_video_from_url") {
      return Promise.resolve(
        loadedVideo({
          tracks: subtitleTracks,
          selectedTrackId: "de_1_de.vtt",
          subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
        }),
      );
    }

    return Promise.reject(JSON.stringify({ kind: "not-found", message: "not-found" }));
  });

  render(<App />);

  await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
  await user.click(screen.getByRole("button", { name: "Load" }));
  await user.click(await screen.findByRole("button", { name: "advance video" }));
  await user.click(screen.getByRole("button", { name: "Hallo" }));

  expect(await screen.findByText("Слово не найдено в немецком словаре")).toBeInTheDocument();
});

it("shows an unavailable dictionary lookup state", async () => {
  const user = userEvent.setup();
  mocks.invoke.mockImplementation((command: string) => {
    if (command === "load_video_from_url") {
      return Promise.resolve(
        loadedVideo({
          tracks: subtitleTracks,
          selectedTrackId: "de_1_de.vtt",
          subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
        }),
      );
    }

    return Promise.reject(JSON.stringify({ kind: "dictionary-unavailable", message: "dictionary-unavailable" }));
  });

  render(<App />);

  await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
  await user.click(screen.getByRole("button", { name: "Load" }));
  await user.click(await screen.findByRole("button", { name: "advance video" }));
  await user.click(screen.getByRole("button", { name: "Hallo" }));

  expect(await screen.findByText("Словарь сейчас недоступен")).toBeInTheDocument();
});

it("does not call dictionary lookup for non-German tracks", async () => {
  const user = userEvent.setup();
  mocks.invoke.mockResolvedValue(
    loadedVideo({
      tracks: subtitleTracks,
      selectedTrackId: "ru_0_ru.vtt",
    }),
  );

  render(<App />);

  await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
  await user.click(screen.getByRole("button", { name: "Load" }));
  await user.click(await screen.findByRole("button", { name: "advance video" }));
  await user.click(screen.getByRole("button", { name: "Hello" }));

  expect(screen.getByText("Hello")).toBeInTheDocument();
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run targeted App tests and verify they fail**

Run:

```powershell
npm test -- src/App.test.tsx
```

Expected: fail because App does not invoke `lookup_german_word` or pass lookup state to `SubtitleOverlay`.

- [ ] **Step 3: Implement App lookup state and invoke integration**

Update `src/App.tsx`:
- Import `SubtitleWord`, `GermanWordLookup`, `WordLookupState`, and `isGermanTrackLang`.
- Add state:

```ts
const [wordLookup, setWordLookup] = useState<WordLookupState>({ status: "idle" });
const lookupRequestIdRef = useRef(0);
```

- Add helper inside component:

```ts
const selectedTrack = video?.tracks.find((track) => track.id === selectedTrackId);
```

- Change `handleSubtitleWordInspect` to receive `(cue: SubtitleCue, word: SubtitleWord)`.
- Keep existing cue boundary pause logic unchanged.
- If selected track lang is not German, set lookup state to idle and return without invoking.
- For German tracks, increment request id, set loading, and call:

```ts
invoke<GermanWordLookup>("lookup_german_word", {
  word: word.cleanText || word.text,
  cueText: cue.text,
  trackLang: selectedTrack.lang,
})
```

- On success, only update state if the request id is still current.
- On error, parse the serialized backend error with existing `extractErrorCode`; map `not-found` to `{ status: "not-found" }`, all other lookup failures to `{ status: "unavailable" }`.
- On popover close, new URL load, and track change, increment `lookupRequestIdRef.current` and reset lookup state to idle.
- Pass `wordLookup={wordLookup}` to `SubtitleOverlay`.

- [ ] **Step 4: Run targeted App tests and verify they pass**

Run:

```powershell
npm test -- src/App.test.tsx
```

Expected: App tests pass.

- [ ] **Step 5: Run all frontend tests**

Run:

```powershell
npm test
```

Expected: all frontend tests pass.

## Task 4: Full Verification And Cleanup

**Files:**
- Modify only files needed to fix verification failures.

- [ ] **Step 1: Run frontend build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 2: Run Rust formatting check**

Run:

```powershell
Set-Location src-tauri
cargo fmt --check
```

Expected: formatting check passes. If it fails, run `cargo fmt`, then re-run `cargo fmt --check`.

- [ ] **Step 3: Run final Rust tests**

Run:

```powershell
Set-Location src-tauri
cargo test
```

Expected: all Rust tests pass.

- [ ] **Step 4: Run whitespace check**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 5: Inspect final diff against the spec**

Check:
- German-only behavior is enforced.
- UI strings are Russian.
- Existing subtitle hold/release behavior still has tests.
- Backend has dictionary host allowlist and response limit.
- `.superpowers/` companion artifacts remain uncommitted.

Expected: no missing spec requirements.
