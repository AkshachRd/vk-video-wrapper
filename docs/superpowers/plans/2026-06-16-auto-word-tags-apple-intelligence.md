# Авто-теги для сохранённых слов через Apple Intelligence — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При первом сохранении слова в фоне получать 1–2 тематических тега (по-русски) от локальной модели Apple Intelligence и показывать их на карточке слова, переиспользуя существующую систему тегов.

**Architecture:** Гибрид. Модель вызывается только из фронта (JS `availability()`/`generate()` из `tauri-plugin-apple-intelligence-api`, т.к. Rust-API плагина приватный). Вся тестируемая логика — построение промпта, парсинг ответа, валидация, вставка — в Rust-командах `build_word_tag_prompt` и `apply_generated_tags`, использующих существующую таблицу `word_tags`. Авто-теги неразличимы от ручных.

**Tech Stack:** Tauri v2, Rust, rusqlite, serde_json; React 19 + TypeScript, Vitest + React Testing Library; плагин `tauri-plugin-apple-intelligence` (Rust, только macOS) + `tauri-plugin-apple-intelligence-api` (npm).

**Spec:** `docs/superpowers/specs/2026-06-16-auto-word-tags-apple-intelligence-design.md`

---

## Замечания по окружению

- Rust-тесты: `cargo test --manifest-path src-tauri/Cargo.toml <filter>`.
- Фронт-тесты: `npx vitest run <file> -t "<name>"` или `npm test`.
- Команды Rust из задач 1–3 тестируются через `*_in_state`-функции напрямую (без `invoke`), регистрация команд не требуется до задачи 4.
- Весь новый Rust-код добавляется в `src-tauri/src/saved_words.rs` — он переиспользует приватные хелперы `normalize_tag`, `find_saved_word`, `add_word_tag_in_state`, `list_word_tags_in`.

---

## Task 1: `parse_theme_tags` — чистый парсер ответа модели

**Files:**
- Modify: `src-tauri/src/saved_words.rs` (новые функции + тесты в модуле `tests`)

- [ ] **Step 1: Написать падающие тесты**

В конце модуля `#[cfg(test)] mod tests` (перед закрывающей `}`) добавить:

```rust
    #[test]
    fn parse_theme_tags_reads_json_array_lowercased() {
        assert_eq!(parse_theme_tags(r#"["Еда","СПОРТ"]"#), vec!["еда", "спорт"]);
    }

    #[test]
    fn parse_theme_tags_extracts_json_embedded_in_text() {
        let raw = "Вот категории: [ \"Еда\", \"кухня\" ] — готово";
        assert_eq!(parse_theme_tags(raw), vec!["еда", "кухня"]);
    }

    #[test]
    fn parse_theme_tags_falls_back_to_comma_split() {
        assert_eq!(parse_theme_tags("Еда, спорт"), vec!["еда", "спорт"]);
    }

    #[test]
    fn parse_theme_tags_drops_empty_and_punctuation_and_dedups() {
        assert_eq!(parse_theme_tags(r#"["", "...", "Еда", "еда"]"#), vec!["еда"]);
    }

    #[test]
    fn parse_theme_tags_caps_at_two() {
        assert_eq!(parse_theme_tags(r#"["еда","спорт","право"]"#), vec!["еда", "спорт"]);
    }

    #[test]
    fn parse_theme_tags_drops_too_long() {
        let long = "а".repeat(41);
        let raw = format!(r#"["{long}", "еда"]"#);
        assert_eq!(parse_theme_tags(&raw), vec!["еда"]);
    }
```

- [ ] **Step 2: Запустить, убедиться, что не компилируется/падает**

Run: `cargo test --manifest-path src-tauri/Cargo.toml parse_theme_tags`
Expected: FAIL — `cannot find function parse_theme_tags in this scope`.

- [ ] **Step 3: Реализовать `parse_theme_tags`**

Добавить рядом с `normalize_tag` (вне `mod tests`), в основной код файла:

```rust
fn parse_json_array(raw: &str) -> Option<Vec<String>> {
    let start = raw.find('[')?;
    let end = raw.rfind(']')?;
    if end <= start {
        return None;
    }
    serde_json::from_str::<Vec<String>>(&raw[start..=end]).ok()
}

fn parse_theme_tags(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();

    let candidates: Vec<String> = match parse_json_array(trimmed) {
        Some(values) => values,
        None => trimmed
            .trim_start_matches(['[', '{'])
            .trim_end_matches([']', '}'])
            .split(['\n', ','])
            .map(|piece| piece.trim().trim_matches('"').to_string())
            .collect(),
    };

    let mut out: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for candidate in candidates {
        if let Some(normalized) = normalize_tag(&candidate) {
            if seen.insert(normalized.clone()) {
                out.push(normalized);
                if out.len() == 2 {
                    break;
                }
            }
        }
    }

    out
}
```

- [ ] **Step 4: Запустить тесты — должны пройти**

Run: `cargo test --manifest-path src-tauri/Cargo.toml parse_theme_tags`
Expected: PASS (6 тестов).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/saved_words.rs
git commit -m "feat: parse_theme_tags для разбора ответа модели в теги"
```

---

## Task 2: `build_prompt` + команда `build_word_tag_prompt`

**Files:**
- Modify: `src-tauri/src/saved_words.rs`

- [ ] **Step 1: Написать падающие тесты**

Добавить в `mod tests`:

```rust
    #[test]
    fn build_prompt_mentions_word_and_meaning() {
        let word = save_word_in_state(&SavedWordsState::in_memory_for_tests().unwrap(), request("Haus", "de"), 1000)
            .unwrap();
        let prompt = build_prompt(&word);
        assert!(prompt.contains("Haus"));
        assert!(prompt.contains("мир"));
    }

    #[test]
    fn build_word_tag_prompt_returns_none_for_word_with_tags() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();
        add_word_tag_in_state(&state, "de:haus", "дом", 2000).unwrap();

        let prompt = build_word_tag_prompt_in_state(&state, "de:haus").unwrap();

        assert_eq!(prompt, None);
    }

    #[test]
    fn build_word_tag_prompt_returns_some_for_fresh_word() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();

        let prompt = build_word_tag_prompt_in_state(&state, "de:haus").unwrap();

        assert!(prompt.unwrap().contains("Haus"));
    }

    #[test]
    fn build_word_tag_prompt_rejects_missing_word() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();

        let error = build_word_tag_prompt_in_state(&state, "de:ghost").unwrap_err();

        assert_eq!(error, SavedWordsError::InvalidSavedWord);
    }
```

- [ ] **Step 2: Запустить — падает**

Run: `cargo test --manifest-path src-tauri/Cargo.toml build_prompt build_word_tag_prompt`
Expected: FAIL — `cannot find function build_prompt` / `build_word_tag_prompt_in_state`.

- [ ] **Step 3: Реализовать `build_prompt` и `build_word_tag_prompt_in_state`**

Добавить в основной код файла (рядом с `add_word_tag_in_state`):

```rust
fn build_prompt(word: &SavedWord) -> String {
    let meaning = word.first_meaning.as_deref().unwrap_or("");
    let language = word
        .language_name
        .as_deref()
        .unwrap_or(word.language.as_str());

    format!(
        "Определи 1–2 тематические категории (тему/домен) для слова, чтобы \
         сгруппировать его в личном словаре. Слово ({language}): \"{}\". \
         Значение: \"{meaning}\". Ответь ТОЛЬКО JSON-массивом строк на русском \
         языке, нижним регистром, каждая категория — одно-два слова, без \
         пояснений. Пример: [\"еда\", \"кухня\"].",
        word.display_word
    )
}

pub fn build_word_tag_prompt_in_state(
    state: &SavedWordsState,
    word_id: &str,
) -> Result<Option<String>, SavedWordsError> {
    let connection = state.connection()?;
    let word = find_saved_word(&connection, word_id)?.ok_or(SavedWordsError::InvalidSavedWord)?;

    if word.tags.is_empty() {
        Ok(Some(build_prompt(&word)))
    } else {
        Ok(None)
    }
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `cargo test --manifest-path src-tauri/Cargo.toml build_prompt build_word_tag_prompt`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/saved_words.rs
git commit -m "feat: build_word_tag_prompt — промпт для тематических тегов"
```

---

## Task 3: Команда `apply_generated_tags`

**Files:**
- Modify: `src-tauri/src/saved_words.rs`

- [ ] **Step 1: Написать падающие тесты**

Добавить в `mod tests`:

```rust
    #[test]
    fn apply_generated_tags_inserts_parsed_tags() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();

        let tags = apply_generated_tags_in_state(&state, "de:haus", r#"["дом","жильё"]"#, 2000).unwrap();

        assert_eq!(tags, vec!["дом".to_string(), "жильё".to_string()]);
    }

    #[test]
    fn apply_generated_tags_is_idempotent() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();

        apply_generated_tags_in_state(&state, "de:haus", r#"["дом"]"#, 2000).unwrap();
        // у слова уже есть тег → skip-страховка возвращает текущие без изменений
        let tags = apply_generated_tags_in_state(&state, "de:haus", r#"["жильё"]"#, 3000).unwrap();

        assert_eq!(tags, vec!["дом".to_string()]);
    }

    #[test]
    fn apply_generated_tags_empty_raw_adds_nothing() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();
        save_word_in_state(&state, request("Haus", "de"), 1000).unwrap();

        let tags = apply_generated_tags_in_state(&state, "de:haus", "не знаю", 2000).unwrap();

        assert!(tags.is_empty());
    }

    #[test]
    fn apply_generated_tags_rejects_missing_word() {
        let state = SavedWordsState::in_memory_for_tests().unwrap();

        let error = apply_generated_tags_in_state(&state, "de:ghost", r#"["дом"]"#, 2000).unwrap_err();

        assert_eq!(error, SavedWordsError::InvalidSavedWord);
    }
```

- [ ] **Step 2: Запустить — падает**

Run: `cargo test --manifest-path src-tauri/Cargo.toml apply_generated_tags`
Expected: FAIL — `cannot find function apply_generated_tags_in_state`.

- [ ] **Step 3: Реализовать `apply_generated_tags_in_state`**

Добавить рядом с `add_word_tag_in_state`. Важно: НЕ держать MutexGuard во время вызова `add_word_tag_in_state` (он берёт лок сам — иначе deadlock на не-реентрантном `Mutex`).

```rust
pub fn apply_generated_tags_in_state(
    state: &SavedWordsState,
    word_id: &str,
    raw: &str,
    now_ms: i64,
) -> Result<Vec<String>, SavedWordsError> {
    // Существование + skip-страховка в коротком scope, затем гард освобождается.
    {
        let connection = state.connection()?;
        match find_saved_word(&connection, word_id)? {
            None => return Err(SavedWordsError::InvalidSavedWord),
            Some(word) if !word.tags.is_empty() => return Ok(word.tags),
            Some(_) => {}
        }
    }

    for tag in parse_theme_tags(raw) {
        add_word_tag_in_state(state, word_id, &tag, now_ms)?;
    }

    let connection = state.connection()?;
    list_word_tags_in(&connection, word_id)
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `cargo test --manifest-path src-tauri/Cargo.toml apply_generated_tags`
Expected: PASS (4 теста).

- [ ] **Step 5: Прогнать весь backend и формат**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo fmt --manifest-path src-tauri/Cargo.toml`
Expected: все тесты PASS; формат без изменений.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/saved_words.rs
git commit -m "feat: apply_generated_tags — парсинг и вставка авто-тегов"
```

---

## Task 4: Команды-обёртки, регистрация и интеграция плагина

**Files:**
- Modify: `src-tauri/src/saved_words.rs` (две `#[tauri::command]`-обёртки)
- Modify: `src-tauri/src/lib.rs` (регистрация плагина под macOS + команд)
- Modify: `src-tauri/Cargo.toml` (таргет-зависимость плагина)
- Modify: `src-tauri/capabilities/default.json` (permission плагина)
- Modify: `package.json` (npm-пакет API)

- [ ] **Step 1: Добавить команды-обёртки в `saved_words.rs`**

Рядом с `add_word_tag` / `remove_word_tag`:

```rust
#[tauri::command(rename_all = "camelCase")]
pub fn build_word_tag_prompt(
    state: tauri::State<'_, SavedWordsState>,
    word_id: String,
) -> Result<Option<String>, String> {
    build_word_tag_prompt_in_state(&state, &word_id).map_err(String::from)
}

#[tauri::command(rename_all = "camelCase")]
pub fn apply_generated_tags(
    state: tauri::State<'_, SavedWordsState>,
    word_id: String,
    raw: String,
) -> Result<Vec<String>, String> {
    apply_generated_tags_in_state(&state, &word_id, &raw, now_ms()).map_err(String::from)
}
```

- [ ] **Step 2: Зарегистрировать команды и плагин в `lib.rs`**

Добавить в `tauri::generate_handler![...]` (после `saved_words::remove_word_tag`):

```rust
            saved_words::build_word_tag_prompt,
            saved_words::apply_generated_tags,
```

Зарегистрировать плагин под macOS. Заменить начало цепочки билдера так, чтобы плагин добавлялся условно:

```rust
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init());

    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_plugin_apple_intelligence::init());

    builder
        .setup(|app| {
```

(далее `.setup(...)` … `.run(...)` остаются как были, но теперь как продолжение `builder`).

- [ ] **Step 3: Добавить таргет-зависимость крейта в `Cargo.toml`**

В конец `src-tauri/Cargo.toml`:

```toml
[target.'cfg(target_os = "macos")'.dependencies]
tauri-plugin-apple-intelligence = { git = "https://github.com/jaytuduri/tauri-plugin-apple-intelligence" }
```

> Если у плагина есть тег/релиз — закрепить через `rev`/`tag`. Сверить по README плагина на момент реализации.

- [ ] **Step 4: Добавить permission в capability**

В `src-tauri/capabilities/default.json` в массив `permissions` добавить:

```json
    "apple-intelligence:default"
```

> Точный идентификатор permission генерируется плагином. Если при ручной проверке (Task 8) JS-вызовы отклоняются с ошибкой permission, заменить на конкретные `apple-intelligence:allow-availability` и `apple-intelligence:allow-generate` (имена сверить в `src-tauri/gen/schemas/` после первой сборки).

- [ ] **Step 5: Установить npm-пакет API**

Run: `npm install github:jaytuduri/tauri-plugin-apple-intelligence`
Expected: в `package.json` → `dependencies` появляется `tauri-plugin-apple-intelligence-api`.

- [ ] **Step 6: Собрать backend (на macOS)**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: сборка успешна. (Требуется macOS 26 + Xcode с FoundationModels SDK; если сборка падает в build.rs плагина — зафиксировать как блокер окружения и сообщить пользователю, логику не менять.)

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/saved_words.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/capabilities/default.json package.json package-lock.json
git commit -m "feat: регистрация команд авто-тегов и плагина Apple Intelligence (macOS)"
```

---

## Task 5: Объявление типов модуля плагина (фронт)

**Files:**
- Create: `src/types/apple-intelligence.d.ts`

- [ ] **Step 1: Создать ambient-декларацию модуля**

Пакет может не поставлять типы — без декларации `tsc -b` упадёт на импорте. Создать `src/types/apple-intelligence.d.ts`:

```ts
declare module "tauri-plugin-apple-intelligence-api" {
  export interface AvailabilityStatus {
    available: boolean;
    reason?: string;
  }

  export function availability(): Promise<AvailabilityStatus>;
  export function generate(prompt: string): Promise<string>;
}
```

- [ ] **Step 2: Проверить типы**

Run: `npx tsc -b`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/types/apple-intelligence.d.ts
git commit -m "chore: типы для tauri-plugin-apple-intelligence-api"
```

---

## Task 6: Доступность таггера в хуке `use-video-app`

**Files:**
- Modify: `src/lib/app/use-video-app.ts`
- Modify: `src/App.test.tsx` (мок модуля плагина + дефолты)

- [ ] **Step 1: Добавить мок модуля плагина в тест-сетап**

В `src/App.test.tsx` в объект `mocks = vi.hoisted(() => ({ ... }))` добавить поля:

```ts
  availability: vi.fn(),
  generate: vi.fn(),
```

Рядом с другими `vi.mock(...)` добавить:

```ts
vi.mock("tauri-plugin-apple-intelligence-api", () => ({
  availability: mocks.availability,
  generate: mocks.generate,
}));
```

В блоке `beforeEach` (там, где сбрасываются моки) добавить дефолты, чтобы существующие тесты не запускали генерацию:

```ts
    mocks.availability.mockResolvedValue({ available: false });
    mocks.generate.mockReset();
```

- [ ] **Step 2: Написать падающий тест доступности → отсутствие генерации**

Добавить новый тест (рядом с тестами тегов, ~строка 1636):

```ts
  it("does not call the tagger when Apple Intelligence is unavailable", async () => {
    const user = userEvent.setup();
    mocks.availability.mockResolvedValue({ available: false });
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") return Promise.resolve(loadedVideo());
      if (command === "save_word") {
        return Promise.resolve({
          id: "de:welt",
          normalizedWord: "welt",
          displayWord: "Welt",
          language: "de",
          languageName: "Немецкий",
          firstMeaning: "мир",
          source: "ruwiktionary-kaikki",
          sourceUrl: null,
          createdAtMs: 1000,
          updatedAtMs: 1000,
          tags: [],
        });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);
    await waitFor(() => expect(mocks.availability).toHaveBeenCalled());

    expect(mocks.invoke).not.toHaveBeenCalledWith("build_word_tag_prompt", expect.anything());
    expect(mocks.generate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Запустить — падает**

Run: `npx vitest run src/App.test.tsx -t "unavailable"`
Expected: FAIL — `mocks.availability` не вызывается (эффекта ещё нет).

- [ ] **Step 4: Реализовать чтение доступности в хуке**

В `src/lib/app/use-video-app.ts` добавить состояние рядом с `tagPendingWordIds` (ок. строки 81):

```ts
  const [generatingTagWordIds, setGeneratingTagWordIds] = useState<string[]>([]);
  const wordTaggerAvailableRef = useRef(false);
```

Добавить эффект на маунте (рядом с эффектом `list_saved_words`):

```ts
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { availability } = await import("tauri-plugin-apple-intelligence-api");
        const status = await availability();
        if (!cancelled) wordTaggerAvailableRef.current = Boolean(status?.available);
      } catch {
        if (!cancelled) wordTaggerAvailableRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
```

(Флаг держим только в `ref` — он нужен лишь триггеру в колбэке, в рендере не участвует.)

- [ ] **Step 5: Запустить — проходит**

Run: `npx vitest run src/App.test.tsx -t "unavailable"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/app/use-video-app.ts src/App.test.tsx
git commit -m "feat: чтение доступности Apple Intelligence в хуке приложения"
```

---

## Task 7: Поток генерации `generateWordTags` и триггер при сохранении

**Files:**
- Modify: `src/lib/app/use-video-app.ts`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Написать падающий тест полного потока**

```ts
  it("generates theme tags on first save when the tagger is available", async () => {
    const user = userEvent.setup();
    mocks.availability.mockResolvedValue({ available: true });
    mocks.generate.mockResolvedValue('["город"]');
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") return Promise.resolve(loadedVideo());
      if (command === "save_word") {
        return Promise.resolve({
          id: "de:welt",
          normalizedWord: "welt",
          displayWord: "Welt",
          language: "de",
          languageName: "Немецкий",
          firstMeaning: "мир",
          source: "ruwiktionary-kaikki",
          sourceUrl: null,
          createdAtMs: 1000,
          updatedAtMs: 1000,
          tags: [],
        });
      }
      if (command === "build_word_tag_prompt") return Promise.resolve("PROMPT");
      if (command === "apply_generated_tags") return Promise.resolve(["город"]);
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);
    await waitFor(() => expect(mocks.availability).toHaveBeenCalled());
    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: /Загрузить/ }));
    await screen.findByText("Welt");

    // имитируем первое сохранение слова через тот же путь, что UI:
    await user.click(screen.getByRole("button", { name: "Welt" }));
    await user.click(await screen.findByRole("button", { name: "Сохранить слово" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("build_word_tag_prompt", { wordId: "de:welt" });
    });
    await waitFor(() => {
      expect(mocks.generate).toHaveBeenCalledWith("PROMPT");
    });
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("apply_generated_tags", { wordId: "de:welt", raw: '["город"]' });
    });
    expect((await screen.findAllByText("город")).length).toBeGreaterThan(0);
  });
```

> Примечание: точные роли/тексты кнопок «Welt»/«Сохранить слово» — те же, что в существующих тестах попапа в `src/App.test.tsx`. Если в файле уже есть хелпер открытия попапа и сохранения, переиспользовать его вместо дублирования кликов.

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run src/App.test.tsx -t "generates theme tags"`
Expected: FAIL — `build_word_tag_prompt` не вызывается.

- [ ] **Step 3: Реализовать `generateWordTags` и триггер**

В `src/lib/app/use-video-app.ts` добавить колбэк (рядом с `handleAddWordTag`):

```ts
  const generateWordTags = useCallback(async (wordId: string) => {
    setGeneratingTagWordIds((ids) => (ids.includes(wordId) ? ids : [...ids, wordId]));
    try {
      const prompt = await invoke<string | null>("build_word_tag_prompt", { wordId });
      if (!prompt) return;
      const { generate } = await import("tauri-plugin-apple-intelligence-api");
      const raw = await generate(prompt);
      const tags = await invoke<string[]>("apply_generated_tags", { wordId, raw });
      if (tags.length > 0) {
        savedWordsMutatedRef.current = true;
        setSavedWords((words) => words.map((word) => (word.id === wordId ? { ...word, tags } : word)));
      }
    } catch {
      // авто-теги — бонус: ошибки инференса/парсинга проглатываем тихо
    } finally {
      setGeneratingTagWordIds((ids) => ids.filter((id) => id !== wordId));
    }
  }, []);
```

В `handleToggleSavedWord`, в ветке нового слова, сразу после установки `freshSavedWordTimerRef` (после строки с `setTimeout(... 700)`):

```ts
        if (wordTaggerAvailableRef.current) {
          void generateWordTags(savedWord.id);
        }
```

Добавить `generateWordTags` в массив зависимостей `useCallback` для `handleToggleSavedWord`:

```ts
    [clearPendingSavedWordAction, generateWordTags, savedWords, selectedTrack, setPendingSavedWordAction],
```

В возвращаемый объект хука (рядом с `tagPendingWordIds`) добавить:

```ts
    generatingTagWordIds,
```

- [ ] **Step 4: Запустить — проходит**

Run: `npx vitest run src/App.test.tsx -t "generates theme tags"`
Expected: PASS.

- [ ] **Step 5: Добавить тесты skip/тихой ошибки**

```ts
  it("skips generation when the backend returns no prompt", async () => {
    const user = userEvent.setup();
    mocks.availability.mockResolvedValue({ available: true });
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") return Promise.resolve(loadedVideo());
      if (command === "save_word") {
        return Promise.resolve({
          id: "de:welt", normalizedWord: "welt", displayWord: "Welt", language: "de",
          languageName: "Немецкий", firstMeaning: "мир", source: "ruwiktionary-kaikki",
          sourceUrl: null, createdAtMs: 1000, updatedAtMs: 1000, tags: [],
        });
      }
      if (command === "build_word_tag_prompt") return Promise.resolve(null);
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);
    await waitFor(() => expect(mocks.availability).toHaveBeenCalled());
    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: /Загрузить/ }));
    await screen.findByText("Welt");
    await user.click(screen.getByRole("button", { name: "Welt" }));
    await user.click(await screen.findByRole("button", { name: "Сохранить слово" }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("build_word_tag_prompt", { wordId: "de:welt" }));
    expect(mocks.generate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Запустить — проходит**

Run: `npx vitest run src/App.test.tsx -t "skips generation"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/app/use-video-app.ts src/App.test.tsx
git commit -m "feat: фоновая генерация авто-тегов при первом сохранении слова"
```

---

## Task 8: Pending-индикатор «подбираю теги…» в панели

**Files:**
- Modify: `src/components/saved-words-panel.tsx`
- Modify: `src/app/desktop-app.tsx`
- Modify: `src/app/mobile-app.tsx`
- Modify: `src/components/saved-words-panel.test.tsx` (если есть; иначе тест в `src/App.test.tsx`)

- [ ] **Step 1: Написать падающий тест индикатора**

Добавить в `src/App.test.tsx` (поток генерации с задержкой, чтобы поймать индикатор):

```ts
  it("shows a pending hint while theme tags are being generated", async () => {
    const user = userEvent.setup();
    mocks.availability.mockResolvedValue({ available: true });
    let resolveGenerate: (value: string) => void = () => {};
    mocks.generate.mockReturnValue(new Promise<string>((resolve) => { resolveGenerate = resolve; }));
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") return Promise.resolve(loadedVideo());
      if (command === "save_word") {
        return Promise.resolve({
          id: "de:welt", normalizedWord: "welt", displayWord: "Welt", language: "de",
          languageName: "Немецкий", firstMeaning: "мир", source: "ruwiktionary-kaikki",
          sourceUrl: null, createdAtMs: 1000, updatedAtMs: 1000, tags: [],
        });
      }
      if (command === "build_word_tag_prompt") return Promise.resolve("PROMPT");
      if (command === "apply_generated_tags") return Promise.resolve(["город"]);
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);
    await waitFor(() => expect(mocks.availability).toHaveBeenCalled());
    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: /Загрузить/ }));
    await screen.findByText("Welt");
    await user.click(screen.getByRole("button", { name: "Welt" }));
    await user.click(await screen.findByRole("button", { name: "Сохранить слово" }));

    expect(await screen.findByText("подбираю теги…")).toBeInTheDocument();
    resolveGenerate('["город"]');
    await waitFor(() => expect(screen.queryByText("подбираю теги…")).not.toBeInTheDocument());
  });
```

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run src/App.test.tsx -t "pending hint"`
Expected: FAIL — текст «подбираю теги…» не найден.

- [ ] **Step 3: Прокинуть `generatingTagWordIds` в панель**

В `src/app/desktop-app.tsx` и `src/app/mobile-app.tsx` в JSX `<SavedWordsPanel ... />` (рядом с `tagPendingWordIds={app.tagPendingWordIds}`) добавить:

```tsx
                generatingTagWordIds={app.generatingTagWordIds}
```

- [ ] **Step 4: Реализовать индикатор в панели**

В `src/components/saved-words-panel.tsx`:

В тип `SavedWordsPanelProps` добавить:

```ts
  generatingTagWordIds?: string[];
```

В деструктуризацию пропсов добавить `generatingTagWordIds = [],` (рядом с `tagPendingWordIds = [],`), и рядом с `tagPendingWordIdSet`:

```ts
  const generatingTagWordIdSet = new Set(generatingTagWordIds);
```

В блоке рендера тегов карточки заменить вызов редактора так, чтобы редактор блокировался и при генерации, и добавить строку-индикатор:

```tsx
              {tagsEnabled && onAddTag && onRemoveTag ? (
                <>
                  <WordTagEditor
                    wordId={word.id}
                    tags={word.tags}
                    suggestions={suggestions}
                    disabled={tagPendingWordIdSet.has(word.id) || generatingTagWordIdSet.has(word.id)}
                    onAddTag={onAddTag}
                    onRemoveTag={onRemoveTag}
                  />
                  {generatingTagWordIdSet.has(word.id) ? (
                    <div className="mt-1.5 font-mono text-[10px] tracking-[0.04em] text-ink-3">
                      подбираю теги…
                    </div>
                  ) : null}
                </>
              ) : null}
```

- [ ] **Step 5: Запустить — проходит**

Run: `npx vitest run src/App.test.tsx -t "pending hint"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/saved-words-panel.tsx src/app/desktop-app.tsx src/app/mobile-app.tsx src/App.test.tsx
git commit -m "feat: индикатор подбора авто-тегов на карточке слова"
```

---

## Task 9: Полная проверка и регрессии

**Files:** none (verification only)

- [ ] **Step 1: Все фронт-тесты**

Run: `npm test`
Expected: PASS (включая существующие тесты тегов и попапа — регрессий нет).

- [ ] **Step 2: Все backend-тесты + формат**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo fmt --manifest-path src-tauri/Cargo.toml --check`
Expected: PASS; формат без изменений.

- [ ] **Step 3: Сборка фронта и whitespace**

Run: `npm run build && git diff --check`
Expected: сборка успешна; нет ошибок whitespace.

- [ ] **Step 4: Ручная проверка на macOS (если доступно железо)**

Запустить `npm run tauri dev` на macOS 26 + Apple Silicon с включённым Apple Intelligence. Сохранить новое слово → через секунду-две на карточке появляются 1–2 русских тематических тега; индикатор «подбираю теги…» виден во время генерации. Если JS-вызовы отклоняются по permission — поправить capability (Task 4, Step 4). На не-macOS/без AI: сохранение работает, теги не генерируются, индикатор не мелькает.

- [ ] **Step 5: Финальный коммит (если правились capability/прочее при проверке)**

```bash
git add -A
git commit -m "chore: проверка авто-тегов и правки интеграции"
```

---

## Self-Review (выполнено автором плана)

- **Покрытие спека:** платформенный гейтинг (Task 4), build_prompt+парсинг+вставка (Tasks 1–3), команды и регистрация (Task 4), доступность (Task 6), триггер при первом сохранении и skip (Task 7), pending-индикатор и отсутствие мерцания на не-macOS (Tasks 6–8), переиспользование фильтра/автоподсказок/снятия (без изменений — покрыто существующими тестами, проверяется в Task 9). Тестовая матрица спека отражена в задачах 1, 3, 6, 7, 8.
- **Плейсхолдеры:** единственные «сверить по README» относятся к внешнему плагину (git-ref крейта и строка permission) — это объективные неизвестные early-release зависимости, помечены явными шагами проверки, а не пропуски собственной логики.
- **Согласованность имён:** `build_word_tag_prompt`/`build_word_tag_prompt_in_state`, `apply_generated_tags`/`apply_generated_tags_in_state`, `parse_theme_tags`, `generateWordTags`, `generatingTagWordIds`, `wordTaggerAvailableRef` — используются единообразно во всех задачах; аргументы команд (`wordId`, `raw`) совпадают между Rust-обёртками и вызовами `invoke` на фронте.
