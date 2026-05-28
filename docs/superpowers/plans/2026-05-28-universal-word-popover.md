# Universal Word Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the rich word popover from German-only lookup to German, English, and Russian lookup with Russian dictionary explanations from Kaikki JSONL.

**Architecture:** Rust owns supported-language normalization, Kaikki URL construction, network safety, JSONL parsing, and session cache behind a single `lookup_word` command. React owns language support checks, lookup lifecycle, stale-response protection, and the compact popover states.

**Tech Stack:** Tauri/Rust, reqwest, serde_json, React, TypeScript, Vitest, React Testing Library.

---

## File Structure

- Modify `src-tauri/src/vk/dictionary.rs`: rename public model/state/error semantics from German-specific to universal, replace Wiktapi URL construction with Kaikki JSONL URL construction, parse JSONL, add `de/en/ru` support.
- Modify `src-tauri/src/lib.rs`: manage `DictionaryState` and register `lookup_word`.
- Keep `src-tauri/src/vk/mod.rs` unchanged unless module naming is changed; the implementation can keep the file name `dictionary.rs`.
- Modify `src/lib/dictionary/types.ts`: replace `GermanWordLookup` with `WordLookup`, add `language` and `languageName`.
- Replace `src/lib/dictionary/is-german-track.ts` with `src/lib/dictionary/supported-lookup-language.ts`: return `de | en | ru | undefined`.
- Replace `src/lib/dictionary/is-german-track.test.ts` with `src/lib/dictionary/supported-lookup-language.test.ts`.
- Modify `src/components/word-lookup-popover.tsx`: use neutral `WordLookupState`, source value, and generic not-found copy.
- Modify `src/components/word-lookup-popover.test.tsx`: update test data for `de/en/ru`.
- Modify `src/App.tsx`: call `lookup_word` for supported languages.
- Modify `src/App.test.tsx`: update German tests and add English/Russian coverage.

## Task 1: Backend Universal Dictionary

**Files:**
- Modify: `src-tauri/src/vk/dictionary.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing backend tests**

In `src-tauri/src/vk/dictionary.rs`, replace or extend the existing `#[cfg(test)]` tests with tests that assert the universal API. Include these behaviors:

```rust
#[test]
fn normalizes_supported_lookup_languages() {
    assert_eq!(normalize_supported_language("de"), Some(SupportedLookupLanguage::German));
    assert_eq!(normalize_supported_language(" de-DE "), Some(SupportedLookupLanguage::German));
    assert_eq!(normalize_supported_language("en-US"), Some(SupportedLookupLanguage::English));
    assert_eq!(normalize_supported_language("ru-RU"), Some(SupportedLookupLanguage::Russian));
    assert_eq!(normalize_supported_language("fr"), None);
    assert_eq!(normalize_supported_language(""), None);
}

#[test]
fn builds_kaikki_jsonl_urls_for_supported_languages() {
    let config = DictionaryClientConfig::for_tests("https://kaikki.org/ruwiktionary/");

    assert_eq!(
        build_lookup_url(&config, SupportedLookupLanguage::German, "Haus").unwrap().as_str(),
        "https://kaikki.org/ruwiktionary/%D0%9D%D0%B5%D0%BC%D0%B5%D1%86%D0%BA%D0%B8%D0%B9/meaning/H/Ha/Haus.jsonl"
    );
    assert_eq!(
        build_lookup_url(&config, SupportedLookupLanguage::English, "house").unwrap().as_str(),
        "https://kaikki.org/ruwiktionary/%D0%90%D0%BD%D0%B3%D0%BB%D0%B8%D0%B9%D1%81%D0%BA%D0%B8%D0%B9/meaning/h/ho/house.jsonl"
    );
    assert_eq!(
        build_lookup_url(&config, SupportedLookupLanguage::Russian, "дом").unwrap().as_str(),
        "https://kaikki.org/ruwiktionary/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9/meaning/%D0%B4/%D0%B4%D0%BE/%D0%B4%D0%BE%D0%BC.jsonl"
    );
}

#[test]
fn parses_german_english_and_russian_jsonl_entries() {
    let german = br#"{"word":"Haus","pos":"noun","lang_code":"de","lang":"Немецкий","sounds":[{"ipa":"[haʊ̯s]"}],"tags":["neuter"],"senses":[{"glosses":["дом, здание"]}]}"#;
    let english = br#"{"word":"house","pos":"noun","lang_code":"en","lang":"Английский","sounds":[{"ipa":"[haʊs]"}],"senses":[{"glosses":["дом (сооружение)"]}]}"#;
    let russian = br#"{"word":"дом","pos":"noun","lang_code":"ru","lang":"Русский","sounds":[{"ipa":"[dom]"}],"tags":["masculine","inanimate"],"senses":[{"glosses":["архитектурное сооружение, предназначенное для жилья"]}]}"#;

    assert_eq!(
        parse_provider_response(SupportedLookupLanguage::German, "Haus", german).unwrap().language,
        SupportedLookupLanguage::German
    );
    assert_eq!(
        parse_provider_response(SupportedLookupLanguage::English, "house", english).unwrap().meanings,
        vec!["дом (сооружение)"]
    );
    assert_eq!(
        parse_provider_response(SupportedLookupLanguage::Russian, "дом", russian).unwrap().headword,
        "дом"
    );
}

#[test]
fn parses_multiple_jsonl_entries_with_meaning_cap() {
    let jsonl = [
        r#"{"word":"house","pos":"noun","lang_code":"en","lang":"Английский","senses":[{"glosses":["дом"]},{"glosses":["театр"]},{"glosses":["династия"]},{"glosses":["палата"]}]}"#,
        r#"{"word":"house","pos":"verb","lang_code":"en","lang":"Английский","senses":[{"glosses":["размещать"]},{"glosses":["вмещать"]},{"glosses":["укладывать"]}]}"#,
    ].join("\n");

    let lookup = parse_provider_response(SupportedLookupLanguage::English, "house", jsonl.as_bytes()).unwrap();

    assert_eq!(lookup.meanings.len(), 6);
    assert!(lookup.meanings.contains(&"дом".to_string()));
    assert!(lookup.meanings.contains(&"вмещать".to_string()));
}
```

Also keep tests for host allowlist, response size limit, empty glosses as `not-found`, contract drift as `dictionary-unavailable`, and cache entries by language key.

- [ ] **Step 2: Run backend tests and verify RED**

Run:

```powershell
Set-Location src-tauri
cargo test dictionary
```

Expected: fail because `SupportedLookupLanguage`, `lookup_word`, Kaikki URL construction, and JSONL parsing are not implemented yet.

- [ ] **Step 3: Implement universal backend types and command**

In `src-tauri/src/vk/dictionary.rs`, rename public types and command shapes:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SupportedLookupLanguage {
    German,
    English,
    Russian,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordLookup {
    pub query: String,
    pub headword: String,
    pub language: String,
    pub language_name: String,
    pub ipa: Option<String>,
    pub part_of_speech: Option<String>,
    pub grammar: Vec<String>,
    pub meanings: Vec<String>,
    pub source: String,
    pub source_url: Option<String>,
}

#[derive(Default)]
pub struct DictionaryState {
    cache: Mutex<HashMap<String, CacheEntry>>,
}

#[tauri::command]
pub async fn lookup_word(
    state: tauri::State<'_, DictionaryState>,
    word: String,
    cue_text: String,
    track_lang: String,
) -> Result<WordLookup, String> {
    let _cue_text = cue_text;
    lookup_word_with_config(&state, &DictionaryClientConfig::default(), &word, &track_lang)
        .await
        .map_err(String::from)
}
```

Use `SupportedLookupLanguage::code()` returning `de/en/ru` and `language_name()` returning `Немецкий/Английский/Русский`.

- [ ] **Step 4: Implement Kaikki URL construction**

Change defaults:

```rust
const DEFAULT_LOOKUP_BASE: &str = "https://kaikki.org/ruwiktionary/";
const ALLOWED_DICTIONARY_HOST: &str = "kaikki.org";
const SOURCE_NAME: &str = "ruwiktionary-kaikki";
const MEANING_LIMIT: usize = 6;
```

Build path segments as:

```rust
fn build_lookup_url(
    config: &DictionaryClientConfig,
    language: SupportedLookupLanguage,
    word: &str,
) -> Result<Url, WordLookupError> {
    if !is_allowed_dictionary_url(config, &config.endpoint_base) {
        return Err(WordLookupError::DictionaryUnavailable);
    }

    let first = prefix_chars(word, 1).ok_or(WordLookupError::NotFound)?;
    let first_two = prefix_chars(word, 2).ok_or(WordLookupError::NotFound)?;
    let mut url = config.endpoint_base.clone();
    {
        let mut path = url.path_segments_mut().map_err(|_| WordLookupError::DictionaryUnavailable)?;
        path.pop_if_empty();
        path.push(language.language_name());
        path.push("meaning");
        path.push(&first);
        path.push(&first_two);
        path.push(&format!("{word}.jsonl"));
    }
    url.query_pairs_mut().clear();
    Ok(url)
}

fn prefix_chars(word: &str, count: usize) -> Option<String> {
    let prefix: String = word.chars().take(count).collect();
    if prefix.is_empty() { None } else { Some(prefix) }
}
```

- [ ] **Step 5: Implement JSONL parser and fallback requests**

Parse bytes line-by-line with `serde_json::from_str::<Value>()`. Ignore blank lines. If any nonblank line is invalid JSON, return `dictionary-unavailable`.

Rules:
- Filter objects by `lang_code == language.code()`.
- Combine meanings from the first usable entries until `MEANING_LIMIT`.
- Treat all matching entries with no usable glosses as `not-found`.
- Treat missing object shape, missing `lang_code`, or missing `senses` in nonblank provider data as `dictionary-unavailable`.
- Trim IPA square brackets when rendering data by storing `haʊs`, not `[haʊs]`.
- `source_url` should be the Kaikki HTML URL for the same entry path with `.html` instead of `.jsonl`.
- For `de/en/ru`, after a not-found fetch, retry lowercase only if `word != word.to_lowercase()` for that language.

- [ ] **Step 6: Update Tauri registration**

In `src-tauri/src/lib.rs`, change:

```rust
.manage(vk::dictionary::GermanDictionaryState::default())
vk::dictionary::lookup_german_word
```

to:

```rust
.manage(vk::dictionary::DictionaryState::default())
vk::dictionary::lookup_word
```

- [ ] **Step 7: Run backend verification and commit**

Run:

```powershell
Set-Location src-tauri
cargo test dictionary
cargo test
cargo fmt --check
Set-Location ..
git diff --check
```

Expected: all pass.

Commit:

```powershell
git add src-tauri/src/vk/dictionary.rs src-tauri/src/lib.rs
git commit -m "feat: universalize dictionary lookup backend"
```

## Task 2: Frontend Lookup Types And Popover

**Files:**
- Modify: `src/lib/dictionary/types.ts`
- Delete: `src/lib/dictionary/is-german-track.ts`
- Delete: `src/lib/dictionary/is-german-track.test.ts`
- Create: `src/lib/dictionary/supported-lookup-language.ts`
- Create: `src/lib/dictionary/supported-lookup-language.test.ts`
- Modify: `src/components/word-lookup-popover.tsx`
- Modify: `src/components/word-lookup-popover.test.tsx`
- Modify: `src/components/subtitle-overlay.tsx` only if type imports need updating.
- Modify: `src/components/subtitle-overlay.test.tsx` only if type fixtures need updating.

- [ ] **Step 1: Write failing frontend helper and popover tests**

Create `src/lib/dictionary/supported-lookup-language.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getSupportedLookupLanguage } from "./supported-lookup-language";

describe("getSupportedLookupLanguage", () => {
  it("accepts German, English, and Russian language tags", () => {
    expect(getSupportedLookupLanguage("de")).toBe("de");
    expect(getSupportedLookupLanguage(" de-DE ")).toBe("de");
    expect(getSupportedLookupLanguage("en-US")).toBe("en");
    expect(getSupportedLookupLanguage("ru-RU")).toBe("ru");
  });

  it("rejects missing and unsupported language tags", () => {
    expect(getSupportedLookupLanguage("")).toBeUndefined();
    expect(getSupportedLookupLanguage(undefined)).toBeUndefined();
    expect(getSupportedLookupLanguage("fr")).toBeUndefined();
  });
});
```

Update `src/components/word-lookup-popover.test.tsx` ready data to include `language`, `languageName`, and `source: "ruwiktionary-kaikki"`. Add English and Russian ready-state cases:

```tsx
render(
  <WordLookupPopover
    fallbackWord="дом"
    lookup={{
      status: "ready",
      query: "дом",
      data: {
        query: "дом",
        headword: "дом",
        language: "ru",
        languageName: "Русский",
        ipa: "dom",
        partOfSpeech: "существительное",
        grammar: ["мужской род"],
        meanings: ["архитектурное сооружение, предназначенное для жилья"],
        source: "ruwiktionary-kaikki",
        sourceUrl: "https://kaikki.org/ruwiktionary/Русский/meaning/д/до/дом.html",
      },
    }}
  />,
);
expect(screen.getByText("архитектурное сооружение, предназначенное для жилья")).toBeInTheDocument();
```

Change not-found expectation to:

```ts
expect(screen.getByText("Слово не найдено в словаре")).toBeInTheDocument();
```

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```powershell
npm test -- src/lib/dictionary/supported-lookup-language.test.ts src/components/word-lookup-popover.test.tsx src/components/subtitle-overlay.test.tsx
```

Expected: fail because the helper and neutral type fields are missing.

- [ ] **Step 3: Implement neutral frontend types and language helper**

Replace `src/lib/dictionary/types.ts` content with:

```ts
export type SupportedLookupLanguage = "de" | "en" | "ru";

export interface WordLookup {
  query: string;
  headword: string;
  language: SupportedLookupLanguage;
  languageName: "Немецкий" | "Английский" | "Русский";
  ipa?: string;
  partOfSpeech?: string;
  grammar: string[];
  meanings: string[];
  source: "ruwiktionary-kaikki";
  sourceUrl?: string;
}

export type WordLookupState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; data: WordLookup }
  | { status: "not-found"; query: string }
  | { status: "unavailable"; query: string };
```

Create `src/lib/dictionary/supported-lookup-language.ts`:

```ts
import type { SupportedLookupLanguage } from "./types";

export function getSupportedLookupLanguage(lang: string | undefined): SupportedLookupLanguage | undefined {
  const normalized = lang?.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (normalized === "de" || normalized.startsWith("de-")) {
    return "de";
  }

  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }

  if (normalized === "ru" || normalized.startsWith("ru-")) {
    return "ru";
  }

  return undefined;
}
```

Delete `src/lib/dictionary/is-german-track.ts` and `src/lib/dictionary/is-german-track.test.ts`.

- [ ] **Step 4: Update popover implementation**

In `src/components/word-lookup-popover.tsx`:
- Keep `WordLookupState` import.
- Change not-found copy to `Слово не найдено в словаре`.
- Keep loading and unavailable copy unchanged.
- Continue rendering `data.source` as the link text; it will now be `ruwiktionary-kaikki`.
- Keep `grammarText` logic unchanged, but only render `Грамматика` when `grammarText` is nonempty if the implementation naturally supports it. If leaving always-rendered, ensure tests include grammar.

- [ ] **Step 5: Run targeted frontend verification and commit**

Run:

```powershell
npm test -- src/lib/dictionary/supported-lookup-language.test.ts src/components/word-lookup-popover.test.tsx src/components/subtitle-overlay.test.tsx
npm run build
git diff --check
```

Expected: all pass.

Commit:

```powershell
git add src/lib/dictionary src/components/word-lookup-popover.tsx src/components/word-lookup-popover.test.tsx src/components/subtitle-overlay.tsx src/components/subtitle-overlay.test.tsx
git commit -m "feat: generalize word lookup popover"
```

## Task 3: App Integration For de/en/ru

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing App integration tests**

Update existing German lookup tests to expect `lookup_word`, neutral result shape, and generic not-found copy.

Add English and Russian cases to `src/App.test.tsx`. Use `subtitleTracks` entries for `en` and `ru`, or extend the local fixture:

```ts
const englishTrack = {
  id: "en_3_en.vtt",
  lang: "en-US",
  title: "en.vtt",
  manifestName: "English",
  isAuto: false,
  storageIndex: 3,
  url: "https://vkvd737.okcdn.ru/en.vtt",
};
```

Add a test for English:

```ts
it("looks up English words with the universal dictionary command", async () => {
  const user = userEvent.setup();
  mocks.invoke.mockImplementation((command: string) => {
    if (command === "load_video_from_url") {
      return Promise.resolve(
        loadedVideo({
          tracks: [...subtitleTracks, englishTrack],
          selectedTrackId: "en_3_en.vtt",
          subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello house",
        }),
      );
    }

    if (command === "lookup_word") {
      return Promise.resolve({
        query: "house",
        headword: "house",
        language: "en",
        languageName: "Английский",
        partOfSpeech: "существительное",
        grammar: ["единственное число"],
        meanings: ["дом (сооружение)"],
        source: "ruwiktionary-kaikki",
      });
    }

    return Promise.reject(new Error(`unexpected command: ${command}`));
  });

  render(<App />);
  await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
  await user.click(screen.getByRole("button", { name: "Load" }));
  await user.click(await screen.findByRole("button", { name: "advance video" }));
  await user.click(screen.getByRole("button", { name: "house" }));

  expect(mocks.invoke).toHaveBeenCalledWith("lookup_word", {
    word: "house",
    cueText: "Hello house",
    trackLang: "en-US",
  });
  expect(await screen.findByText("дом (сооружение)")).toBeInTheDocument();
});
```

Add a Russian case using `дом` and `trackLang: "ru"`, expecting Ru-Ru meaning text.

Update unsupported-language test so a track such as `fr` does not call `lookup_word`.

- [ ] **Step 2: Run App tests and verify RED**

Run:

```powershell
npm test -- src/App.test.tsx
```

Expected: fail because `App` still imports German helper/type and invokes `lookup_german_word`.

- [ ] **Step 3: Implement App integration**

In `src/App.tsx`:
- Replace `isGermanTrackLang` import with `getSupportedLookupLanguage`.
- Replace `GermanWordLookup` import with `WordLookup`.
- In `handleSubtitleWordInspect`, compute:

```ts
const lookupLanguage = getSupportedLookupLanguage(selectedTrack?.lang);
if (!selectedTrack || !lookupLanguage) {
  lookupRequestIdRef.current += 1;
  setWordLookup({ status: "idle" });
  return;
}
```

- Invoke the universal command:

```ts
void invoke<WordLookup>("lookup_word", {
  word: query,
  cueText: cue.text,
  trackLang: selectedTrack.lang,
})
```

- Keep request-id stale response protection exactly as currently implemented.
- Keep reset behavior on popover close, new URL load, and track change.

- [ ] **Step 4: Run targeted App verification and commit**

Run:

```powershell
npm test -- src/App.test.tsx
npm test
npm run build
git diff --check
```

Expected: all pass.

Commit:

```powershell
git add src/App.tsx src/App.test.tsx
git commit -m "feat: connect universal word lookup"
```

## Task 4: Final Verification And Cleanup

**Files:**
- Modify only files required to fix issues found during verification.

- [ ] **Step 1: Search for stale German-only API names**

Run:

```powershell
rg -n "lookup_german_word|GermanWordLookup|GermanDictionaryState|isGermanTrackLang|немецком словаре|api\\.wiktapi\\.dev|Wiktapi" src src-tauri docs\\superpowers\\plans\\2026-05-28-universal-word-popover.md
```

Expected: no matches in `src` or `src-tauri`; matches in historical docs are acceptable outside the new plan.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run build
git diff --check
Set-Location src-tauri
cargo test
cargo fmt --check
Set-Location ..
```

Expected: all pass.

- [ ] **Step 3: Manual smoke check with dev server**

If no dev server is running, start one:

```powershell
npm run dev -- --host 127.0.0.1
```

Open the local URL and confirm:
- Existing video load UI still renders.
- Word popover still opens for visible subtitles.
- Generic loading/not-found/unavailable copy fits in the compact popover.

- [ ] **Step 4: Commit verification fixes if any**

If Task 4 required code changes:

```powershell
git add <changed-files>
git commit -m "fix: clean up universal word lookup"
```

If no changes were needed, do not create an empty commit.
