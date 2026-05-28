use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use url::{Host, Url};

const DEFAULT_LOOKUP_BASE: &str = "https://kaikki.org/ruwiktionary/";
const ALLOWED_DICTIONARY_HOST: &str = "kaikki.org";
const SOURCE_NAME: &str = "ruwiktionary-kaikki";
const USER_AGENT_VALUE: &str = "vk-video-wrapper/0.1 dictionary-lookup";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_DICTIONARY_BYTES: usize = 512 * 1024;
const MEANING_LIMIT: usize = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SupportedLookupLanguage {
    German,
    English,
    Russian,
}

impl SupportedLookupLanguage {
    fn code(self) -> &'static str {
        match self {
            SupportedLookupLanguage::German => "de",
            SupportedLookupLanguage::English => "en",
            SupportedLookupLanguage::Russian => "ru",
        }
    }

    fn language_name(self) -> &'static str {
        match self {
            SupportedLookupLanguage::German => "Немецкий",
            SupportedLookupLanguage::English => "Английский",
            SupportedLookupLanguage::Russian => "Русский",
        }
    }
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

#[derive(Debug, Clone, PartialEq, Eq)]
enum CacheEntry {
    Found(WordLookup),
    NotFound,
}

#[derive(Default)]
pub struct DictionaryState {
    cache: Mutex<HashMap<String, CacheEntry>>,
}

impl DictionaryState {
    fn cached(&self, key: &str) -> Option<CacheEntry> {
        self.cache.lock().ok()?.get(key).cloned()
    }

    fn store_cache(&self, key: &str, entry: CacheEntry) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(key.to_string(), entry);
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WordLookupError {
    UnsupportedLanguage,
    NotFound,
    DictionaryUnavailable,
}

impl WordLookupError {
    fn kind(self) -> &'static str {
        match self {
            WordLookupError::UnsupportedLanguage => "unsupported-language",
            WordLookupError::NotFound => "not-found",
            WordLookupError::DictionaryUnavailable => "dictionary-unavailable",
        }
    }
}

impl From<WordLookupError> for String {
    fn from(value: WordLookupError) -> Self {
        let message = value.kind();
        serde_json::json!({
            "kind": message,
            "message": message,
        })
        .to_string()
    }
}

#[derive(Debug, Clone)]
struct DictionaryClientConfig {
    endpoint_base: Url,
    allowed_hosts: Vec<String>,
    #[cfg(test)]
    allow_insecure_localhost: bool,
}

impl Default for DictionaryClientConfig {
    fn default() -> Self {
        Self {
            endpoint_base: Url::parse(DEFAULT_LOOKUP_BASE)
                .expect("default dictionary endpoint must be a valid URL"),
            allowed_hosts: vec![ALLOWED_DICTIONARY_HOST.to_string()],
            #[cfg(test)]
            allow_insecure_localhost: false,
        }
    }
}

impl DictionaryClientConfig {
    #[cfg(test)]
    fn for_tests(endpoint_base: &str) -> Self {
        Self {
            endpoint_base: Url::parse(endpoint_base).expect("test endpoint must be a valid URL"),
            allowed_hosts: vec![ALLOWED_DICTIONARY_HOST.to_string()],
            allow_insecure_localhost: false,
        }
    }

    #[cfg(test)]
    fn for_tests_with_allowed_hosts(endpoint_base: &str, allowed_hosts: &[&str]) -> Self {
        Self {
            endpoint_base: Url::parse(endpoint_base).expect("test endpoint must be a valid URL"),
            allowed_hosts: allowed_hosts
                .iter()
                .map(|host| normalize_host(host))
                .collect(),
            allow_insecure_localhost: false,
        }
    }

    #[cfg(test)]
    fn for_tests_with_insecure_localhost(endpoint_base: &str) -> Self {
        Self {
            endpoint_base: Url::parse(endpoint_base).expect("test endpoint must be a valid URL"),
            allowed_hosts: vec!["localhost".to_string(), "127.0.0.1".to_string()],
            allow_insecure_localhost: true,
        }
    }
}

#[tauri::command]
pub async fn lookup_word(
    state: tauri::State<'_, DictionaryState>,
    word: String,
    cue_text: String,
    track_lang: String,
) -> Result<WordLookup, String> {
    let _cue_text = cue_text;

    lookup_word_with_config(
        &state,
        &DictionaryClientConfig::default(),
        &word,
        &track_lang,
    )
    .await
    .map_err(String::from)
}

async fn lookup_word_with_config(
    state: &DictionaryState,
    config: &DictionaryClientConfig,
    word: &str,
    track_lang: &str,
) -> Result<WordLookup, WordLookupError> {
    let language =
        normalize_supported_language(track_lang).ok_or(WordLookupError::UnsupportedLanguage)?;
    let normalized = normalize_lookup_word(word).ok_or(WordLookupError::NotFound)?;
    let cache_key = cache_key(language, &normalized);

    match state.cached(&cache_key) {
        Some(CacheEntry::Found(lookup)) => return Ok(lookup),
        Some(CacheEntry::NotFound) => return Err(WordLookupError::NotFound),
        None => {}
    }

    let lowercase = normalized.to_lowercase();
    let mut attempts = vec![normalized.as_str()];
    if normalized != lowercase {
        attempts.push(lowercase.as_str());
    }

    for attempt in attempts {
        match fetch_lookup(config, language, attempt).await {
            Ok(lookup) => {
                state.store_cache(&cache_key, CacheEntry::Found(lookup.clone()));
                return Ok(lookup);
            }
            Err(WordLookupError::NotFound) => {}
            Err(error) => return Err(error),
        }
    }

    state.store_cache(&cache_key, CacheEntry::NotFound);
    Err(WordLookupError::NotFound)
}

async fn fetch_lookup(
    config: &DictionaryClientConfig,
    language: SupportedLookupLanguage,
    query: &str,
) -> Result<WordLookup, WordLookupError> {
    let client = build_dictionary_client()?;
    let url = build_lookup_url(config, language, query)?;
    let response = client
        .get(url)
        .header(reqwest::header::USER_AGENT, USER_AGENT_VALUE)
        .send()
        .await
        .map_err(|_| WordLookupError::DictionaryUnavailable)?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(WordLookupError::NotFound);
    }

    if !response.status().is_success() {
        return Err(WordLookupError::DictionaryUnavailable);
    }

    let bytes = read_limited_dictionary_bytes(response).await?;
    parse_provider_response(language, query, &bytes)
}

fn build_dictionary_client() -> Result<reqwest::Client, WordLookupError> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| WordLookupError::DictionaryUnavailable)
}

fn build_lookup_url(
    config: &DictionaryClientConfig,
    language: SupportedLookupLanguage,
    word: &str,
) -> Result<Url, WordLookupError> {
    if !is_allowed_dictionary_url(config, &config.endpoint_base) {
        return Err(WordLookupError::DictionaryUnavailable);
    }

    build_entry_url(&config.endpoint_base, language, word, "jsonl")
}

fn build_entry_url(
    endpoint_base: &Url,
    language: SupportedLookupLanguage,
    word: &str,
    extension: &str,
) -> Result<Url, WordLookupError> {
    let first = prefix_chars(word, 1).ok_or(WordLookupError::NotFound)?;
    let first_two = prefix_chars(word, 2).ok_or(WordLookupError::NotFound)?;
    let mut url = endpoint_base.clone();
    {
        let mut path = url
            .path_segments_mut()
            .map_err(|_| WordLookupError::DictionaryUnavailable)?;
        path.pop_if_empty();
        path.push(language.language_name());
        path.push("meaning");
        path.push(&first);
        path.push(&first_two);
        path.push(&format!("{word}.{extension}"));
    }
    url.set_query(None);
    Ok(url)
}

fn prefix_chars(word: &str, count: usize) -> Option<String> {
    let prefix: String = word.chars().take(count).collect();
    if prefix.is_empty() {
        None
    } else {
        Some(prefix)
    }
}

fn is_allowed_dictionary_url(config: &DictionaryClientConfig, url: &Url) -> bool {
    let Some(host) = normalized_url_host(url) else {
        return false;
    };
    let host_allowed = config.allowed_hosts.contains(&host);

    if !host_allowed {
        return false;
    }

    if url.scheme() == "https" {
        return true;
    }

    #[cfg(test)]
    if config.allow_insecure_localhost && url.scheme() == "http" {
        return host == "localhost" || host == "127.0.0.1";
    }

    false
}

fn normalized_url_host(url: &Url) -> Option<String> {
    match url.host()? {
        Host::Domain(host) => Some(normalize_host(host)),
        Host::Ipv4(address) => Some(address.to_string()),
        Host::Ipv6(address) => Some(address.to_string()),
    }
}

fn normalize_host(host: &str) -> String {
    host.trim_end_matches('.').to_ascii_lowercase()
}

async fn read_limited_dictionary_bytes(
    mut response: reqwest::Response,
) -> Result<Vec<u8>, WordLookupError> {
    let mut bytes = Vec::new();

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| WordLookupError::DictionaryUnavailable)?
    {
        append_dictionary_chunk(&mut bytes, &chunk)?;
    }

    Ok(bytes)
}

fn append_dictionary_chunk(bytes: &mut Vec<u8>, chunk: &[u8]) -> Result<(), WordLookupError> {
    let next_len = bytes
        .len()
        .checked_add(chunk.len())
        .ok_or(WordLookupError::DictionaryUnavailable)?;
    if next_len > MAX_DICTIONARY_BYTES {
        return Err(WordLookupError::DictionaryUnavailable);
    }

    bytes.extend_from_slice(chunk);
    Ok(())
}

fn normalize_lookup_word(word: &str) -> Option<String> {
    let normalized = word
        .trim()
        .trim_matches(|character: char| !character.is_alphabetic());

    if normalized.is_empty() {
        None
    } else {
        Some(normalized.to_string())
    }
}

fn normalize_supported_language(lang: &str) -> Option<SupportedLookupLanguage> {
    let normalized = lang.trim().to_ascii_lowercase();

    if normalized == "de" || normalized.starts_with("de-") {
        Some(SupportedLookupLanguage::German)
    } else if normalized == "en" || normalized.starts_with("en-") {
        Some(SupportedLookupLanguage::English)
    } else if normalized == "ru" || normalized.starts_with("ru-") {
        Some(SupportedLookupLanguage::Russian)
    } else {
        None
    }
}

fn parse_provider_response(
    language: SupportedLookupLanguage,
    query: &str,
    bytes: &[u8],
) -> Result<WordLookup, WordLookupError> {
    if bytes.len() > MAX_DICTIONARY_BYTES {
        return Err(WordLookupError::DictionaryUnavailable);
    }

    let body = std::str::from_utf8(bytes).map_err(|_| WordLookupError::DictionaryUnavailable)?;
    let mut builder = LookupBuilder::new(language, query);
    let mut saw_line = false;
    let mut saw_matching_entry = false;
    let mut saw_matching_entry_without_glosses = false;

    for line in body.lines().map(str::trim).filter(|line| !line.is_empty()) {
        saw_line = true;
        let value: Value =
            serde_json::from_str(line).map_err(|_| WordLookupError::DictionaryUnavailable)?;

        match parse_entry(language, query, &value) {
            ParsedEntry::Found(entry) => {
                saw_matching_entry = true;
                builder.push_entry(entry);
                if builder.meanings.len() >= MEANING_LIMIT {
                    break;
                }
            }
            ParsedEntry::NoUsableGlosses => {
                saw_matching_entry = true;
                saw_matching_entry_without_glosses = true;
            }
            ParsedEntry::WrongLanguage => {}
            ParsedEntry::ContractDrift => return Err(WordLookupError::DictionaryUnavailable),
        }
    }

    if !saw_line {
        return Err(WordLookupError::NotFound);
    }

    if builder.has_meanings() {
        Ok(builder.finish())
    } else if saw_matching_entry || saw_matching_entry_without_glosses {
        Err(WordLookupError::NotFound)
    } else {
        Err(WordLookupError::NotFound)
    }
}

struct LookupBuilder {
    query: String,
    language: SupportedLookupLanguage,
    headword: Option<String>,
    ipa: Option<String>,
    part_of_speech: Option<String>,
    grammar: Vec<String>,
    meanings: Vec<String>,
}

impl LookupBuilder {
    fn new(language: SupportedLookupLanguage, query: &str) -> Self {
        Self {
            query: query.to_string(),
            language,
            headword: None,
            ipa: None,
            part_of_speech: None,
            grammar: Vec::new(),
            meanings: Vec::new(),
        }
    }

    fn push_entry(&mut self, entry: ParsedEntryData) {
        if self.headword.is_none() {
            self.headword = Some(entry.headword);
        }
        if self.ipa.is_none() {
            self.ipa = entry.ipa;
        }
        if self.part_of_speech.is_none() {
            self.part_of_speech = entry.part_of_speech;
        }

        for item in entry.grammar {
            push_unique(&mut self.grammar, item);
        }
        for meaning in entry.meanings {
            if self.meanings.len() >= MEANING_LIMIT {
                break;
            }
            push_unique(&mut self.meanings, meaning);
        }
    }

    fn has_meanings(&self) -> bool {
        !self.meanings.is_empty()
    }

    fn finish(self) -> WordLookup {
        let headword = self.headword.unwrap_or_else(|| self.query.clone());
        WordLookup {
            query: self.query,
            headword: headword.clone(),
            language: self.language.code().to_string(),
            language_name: self.language.language_name().to_string(),
            ipa: self.ipa,
            part_of_speech: self.part_of_speech,
            grammar: self.grammar,
            meanings: self.meanings,
            source: SOURCE_NAME.to_string(),
            source_url: build_source_url(self.language, &headword),
        }
    }
}

enum ParsedEntry {
    Found(ParsedEntryData),
    NoUsableGlosses,
    WrongLanguage,
    ContractDrift,
}

struct ParsedEntryData {
    headword: String,
    ipa: Option<String>,
    part_of_speech: Option<String>,
    grammar: Vec<String>,
    meanings: Vec<String>,
}

fn parse_entry(language: SupportedLookupLanguage, query: &str, entry: &Value) -> ParsedEntry {
    let Some(object) = entry.as_object() else {
        return ParsedEntry::ContractDrift;
    };
    let Some(lang_code) = object.get("lang_code").and_then(Value::as_str) else {
        return ParsedEntry::ContractDrift;
    };
    let Some(senses) = object.get("senses").and_then(Value::as_array) else {
        return ParsedEntry::ContractDrift;
    };

    if lang_code != language.code() {
        return ParsedEntry::WrongLanguage;
    }

    let mut meanings = Vec::new();
    let mut grammar = Vec::new();

    collect_tag_list(object.get("tags"), &mut grammar);
    collect_raw_tag_list(object.get("raw_tags"), &mut grammar);
    collect_form_grammar(object.get("forms"), &mut grammar);

    for sense in senses {
        collect_meanings(sense, &mut meanings);
        collect_tag_list(sense.get("tags"), &mut grammar);
        collect_raw_tag_list(sense.get("raw_tags"), &mut grammar);
    }

    if meanings.is_empty() {
        return ParsedEntry::NoUsableGlosses;
    }

    let headword = object
        .get("word")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|word| !word.is_empty())
        .unwrap_or(query)
        .to_string();
    let part_of_speech = object
        .get("pos")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|pos| !pos.is_empty())
        .map(map_part_of_speech);

    ParsedEntry::Found(ParsedEntryData {
        headword,
        ipa: extract_ipa(object.get("sounds")),
        part_of_speech,
        grammar,
        meanings,
    })
}

fn collect_meanings(sense: &Value, meanings: &mut Vec<String>) {
    let Some(glosses) = sense.get("glosses").and_then(Value::as_array) else {
        return;
    };

    for gloss in glosses {
        if meanings.len() >= MEANING_LIMIT {
            break;
        }
        if let Some(gloss) = gloss
            .as_str()
            .map(str::trim)
            .filter(|gloss| !gloss.is_empty())
        {
            push_unique(meanings, gloss.to_string());
        }
    }
}

fn collect_tag_list(tags: Option<&Value>, grammar: &mut Vec<String>) {
    let Some(tags) = tags.and_then(Value::as_array) else {
        return;
    };

    for tag in tags {
        if let Some(mapped) = tag
            .as_str()
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
            .and_then(map_grammar_tag)
        {
            push_unique(grammar, mapped.to_string());
        }
    }
}

fn collect_raw_tag_list(tags: Option<&Value>, grammar: &mut Vec<String>) {
    let Some(tags) = tags.and_then(Value::as_array) else {
        return;
    };

    for tag in tags {
        if let Some(tag) = tag.as_str().map(str::trim).filter(|tag| !tag.is_empty()) {
            push_unique(grammar, tag.to_string());
        }
    }
}

fn collect_form_grammar(forms: Option<&Value>, grammar: &mut Vec<String>) {
    let Some(forms) = forms.and_then(Value::as_array) else {
        return;
    };

    for form in forms {
        collect_tag_list(form.get("tags"), grammar);
        collect_raw_tag_list(form.get("raw_tags"), grammar);
    }
}

fn extract_ipa(sounds: Option<&Value>) -> Option<String> {
    let sounds = sounds?.as_array()?;

    sounds.iter().find_map(|sound| {
        sound
            .get("ipa")
            .and_then(Value::as_str)
            .map(str::trim)
            .map(trim_ipa_brackets)
            .filter(|ipa| !ipa.is_empty())
            .map(ToString::to_string)
    })
}

fn trim_ipa_brackets(ipa: &str) -> &str {
    ipa.trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim()
}

fn map_part_of_speech(pos: &str) -> String {
    match pos.to_ascii_lowercase().as_str() {
        "adj" | "adjective" => "прилагательное",
        "adv" | "adverb" => "наречие",
        "article" | "det" | "determiner" => "артикль",
        "conj" | "conjunction" => "союз",
        "interj" | "interjection" => "междометие",
        "noun" | "n" => "существительное",
        "num" | "numeral" => "числительное",
        "prep" | "preposition" => "предлог",
        "pron" | "pronoun" => "местоимение",
        "verb" | "v" => "глагол",
        _ => pos,
    }
    .to_string()
}

fn map_grammar_tag(tag: &str) -> Option<&'static str> {
    match tag.to_ascii_lowercase().as_str() {
        "first-person" => Some("1-е лицо"),
        "second-person" => Some("2-е лицо"),
        "third-person" => Some("3-е лицо"),
        "singular" => Some("единственное число"),
        "plural" => Some("множественное число"),
        "nominative" => Some("именительный падеж"),
        "genitive" => Some("родительный падеж"),
        "dative" => Some("дательный падеж"),
        "accusative" => Some("винительный падеж"),
        "instrumental" => Some("творительный падеж"),
        "prepositional" => Some("предложный падеж"),
        "masculine" => Some("мужской род"),
        "feminine" => Some("женский род"),
        "neuter" => Some("средний род"),
        "inanimate" => Some("неодушевлённое"),
        "animate" => Some("одушевлённое"),
        "present" => Some("настоящее время"),
        "past" => Some("прошедшее время"),
        "comparative" => Some("сравнительная степень"),
        "superlative" => Some("превосходная степень"),
        _ => None,
    }
}

fn build_source_url(language: SupportedLookupLanguage, headword: &str) -> Option<String> {
    let base = Url::parse(DEFAULT_LOOKUP_BASE).ok()?;
    build_entry_url(&base, language, headword, "html")
        .ok()
        .map(|url| url.to_string())
}

fn cache_key(language: SupportedLookupLanguage, word: &str) -> String {
    format!("{}:{}", language.code(), word.to_lowercase())
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.contains(&value) {
        values.push(value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration as StdDuration;

    #[test]
    fn normalizes_supported_lookup_languages() {
        assert_eq!(
            normalize_supported_language("de"),
            Some(SupportedLookupLanguage::German)
        );
        assert_eq!(
            normalize_supported_language(" de-DE "),
            Some(SupportedLookupLanguage::German)
        );
        assert_eq!(
            normalize_supported_language("en-US"),
            Some(SupportedLookupLanguage::English)
        );
        assert_eq!(
            normalize_supported_language("ru-RU"),
            Some(SupportedLookupLanguage::Russian)
        );
        assert_eq!(normalize_supported_language("fr"), None);
        assert_eq!(normalize_supported_language(""), None);
    }

    #[test]
    fn builds_kaikki_jsonl_urls_for_supported_languages() {
        let config = DictionaryClientConfig::for_tests("https://kaikki.org/ruwiktionary/");
        assert_eq!(
            build_lookup_url(&config, SupportedLookupLanguage::German, "Haus")
                .unwrap()
                .as_str(),
            "https://kaikki.org/ruwiktionary/%D0%9D%D0%B5%D0%BC%D0%B5%D1%86%D0%BA%D0%B8%D0%B9/meaning/H/Ha/Haus.jsonl"
        );
        assert_eq!(
            build_lookup_url(&config, SupportedLookupLanguage::English, "house")
                .unwrap()
                .as_str(),
            "https://kaikki.org/ruwiktionary/%D0%90%D0%BD%D0%B3%D0%BB%D0%B8%D0%B9%D1%81%D0%BA%D0%B8%D0%B9/meaning/h/ho/house.jsonl"
        );
        assert_eq!(
            build_lookup_url(&config, SupportedLookupLanguage::Russian, "дом")
                .unwrap()
                .as_str(),
            "https://kaikki.org/ruwiktionary/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9/meaning/%D0%B4/%D0%B4%D0%BE/%D0%B4%D0%BE%D0%BC.jsonl"
        );
    }

    #[test]
    fn rejects_untrusted_dictionary_hosts() {
        let config = DictionaryClientConfig::for_tests("https://example.com/ruwiktionary/");

        assert!(matches!(
            build_lookup_url(&config, SupportedLookupLanguage::German, "Haus"),
            Err(WordLookupError::DictionaryUnavailable)
        ));
    }

    #[test]
    fn builds_lookup_url_for_explicitly_allowed_mock_host() {
        let config = DictionaryClientConfig::for_tests_with_allowed_hosts(
            "https://localhost:8787/ruwiktionary/",
            &["localhost"],
        );
        let url = build_lookup_url(&config, SupportedLookupLanguage::German, "Häuser").unwrap();

        assert_eq!(
            url.as_str(),
            "https://localhost:8787/ruwiktionary/%D0%9D%D0%B5%D0%BC%D0%B5%D1%86%D0%BA%D0%B8%D0%B9/meaning/H/H%C3%A4/H%C3%A4user.jsonl"
        );
    }

    #[test]
    fn rejects_oversized_provider_responses() {
        let mut bytes = Vec::new();
        let chunk = vec![b'x'; MAX_DICTIONARY_BYTES + 1];

        assert!(matches!(
            append_dictionary_chunk(&mut bytes, &chunk),
            Err(WordLookupError::DictionaryUnavailable)
        ));
    }

    #[test]
    fn parses_german_english_and_russian_jsonl_entries() {
        let german = r#"{"word":"Haus","pos":"noun","lang_code":"de","lang":"Немецкий","sounds":[{"ipa":"[haʊ̯s]"}],"tags":["neuter"],"senses":[{"glosses":["дом, здание"]}]}"#;
        let english = r#"{"word":"house","pos":"noun","lang_code":"en","lang":"Английский","sounds":[{"ipa":"[haʊs]"}],"senses":[{"glosses":["дом (сооружение)"]}]}"#;
        let russian = r#"{"word":"дом","pos":"noun","lang_code":"ru","lang":"Русский","sounds":[{"ipa":"[dom]"}],"tags":["masculine","inanimate"],"senses":[{"glosses":["архитектурное сооружение, предназначенное для жилья"]}]}"#;

        let german_lookup =
            parse_provider_response(SupportedLookupLanguage::German, "Haus", german.as_bytes())
                .unwrap();
        assert_eq!(
            german_lookup.language,
            SupportedLookupLanguage::German.code()
        );
        assert_eq!(german_lookup.language_name, "Немецкий");
        assert_eq!(german_lookup.ipa.as_deref(), Some("haʊ̯s"));
        assert_eq!(
            german_lookup.part_of_speech.as_deref(),
            Some("существительное")
        );
        assert!(german_lookup.grammar.contains(&"средний род".to_string()));
        assert_eq!(german_lookup.source, "ruwiktionary-kaikki");
        assert_eq!(
            german_lookup.source_url.as_deref(),
            Some("https://kaikki.org/ruwiktionary/%D0%9D%D0%B5%D0%BC%D0%B5%D1%86%D0%BA%D0%B8%D0%B9/meaning/H/Ha/Haus.html")
        );

        assert_eq!(
            parse_provider_response(
                SupportedLookupLanguage::English,
                "house",
                english.as_bytes()
            )
            .unwrap()
            .meanings,
            vec!["дом (сооружение)"]
        );
        assert_eq!(
            parse_provider_response(SupportedLookupLanguage::Russian, "дом", russian.as_bytes())
                .unwrap()
                .headword,
            "дом"
        );
    }

    #[test]
    fn parses_multiple_jsonl_entries_with_meaning_cap() {
        let jsonl = [
            r#"{"word":"house","pos":"noun","lang_code":"en","lang":"Английский","senses":[{"glosses":["дом"]},{"glosses":["театр"]},{"glosses":["династия"]},{"glosses":["палата"]}]}"#,
            r#"{"word":"house","pos":"verb","lang_code":"en","lang":"Английский","senses":[{"glosses":["размещать"]},{"glosses":["вмещать"]},{"glosses":["укладывать"]}]}"#,
        ]
        .join("\n");

        let lookup =
            parse_provider_response(SupportedLookupLanguage::English, "house", jsonl.as_bytes())
                .unwrap();

        assert_eq!(lookup.meanings.len(), 6);
        assert!(lookup.meanings.contains(&"дом".to_string()));
        assert!(lookup.meanings.contains(&"вмещать".to_string()));
    }

    #[test]
    fn ignores_non_matching_language_entries_in_jsonl() {
        let jsonl = [
            r#"{"word":"house","pos":"noun","lang_code":"de","lang":"Немецкий","senses":[{"glosses":["ошибочный язык"]}]}"#,
            r#"{"word":"house","pos":"noun","lang_code":"en","lang":"Английский","senses":[{"glosses":["дом"]}]}"#,
        ]
        .join("\n");

        let lookup =
            parse_provider_response(SupportedLookupLanguage::English, "house", jsonl.as_bytes())
                .unwrap();

        assert_eq!(lookup.meanings, vec!["дом"]);
    }

    #[test]
    fn maps_empty_provider_glosses_to_not_found() {
        let jsonl = r#"{"word":"x","lang_code":"en","senses":[{"glosses":[]}]}"#;

        assert!(matches!(
            parse_provider_response(SupportedLookupLanguage::English, "x", jsonl.as_bytes()),
            Err(WordLookupError::NotFound)
        ));
    }

    #[test]
    fn maps_provider_contract_drift_to_dictionary_unavailable() {
        assert!(matches!(
            parse_provider_response(
                SupportedLookupLanguage::English,
                "x",
                br#"{"unexpected":[]}"#
            ),
            Err(WordLookupError::DictionaryUnavailable)
        ));
        assert!(matches!(
            parse_provider_response(
                SupportedLookupLanguage::English,
                "x",
                br#"{"word":"x","lang_code":"en","senses":[}"#
            ),
            Err(WordLookupError::DictionaryUnavailable)
        ));
    }

    #[test]
    fn lookup_maps_unsupported_language_before_fetching_provider() {
        let state = DictionaryState::default();
        let config = DictionaryClientConfig::for_tests("https://kaikki.org/ruwiktionary/");

        let result = tauri::async_runtime::block_on(lookup_word_with_config(
            &state, &config, "maison", "fr",
        ));

        assert!(matches!(result, Err(WordLookupError::UnsupportedLanguage)));
        let serialized = String::from(WordLookupError::UnsupportedLanguage);
        assert!(serialized.contains(r#""kind":"unsupported-language""#));
    }

    #[test]
    fn successful_lookup_cache_prevents_repeated_provider_requests() {
        let body = r#"{"word":"house","pos":"noun","lang_code":"en","lang":"Английский","senses":[{"glosses":["дом"]}]}"#;
        let server = TestDictionaryServer::new(200, body);
        let config =
            DictionaryClientConfig::for_tests_with_insecure_localhost(&server.endpoint_base());
        let state = DictionaryState::default();

        let first =
            tauri::async_runtime::block_on(lookup_word_with_config(&state, &config, "house", "en"))
                .unwrap();
        let second =
            tauri::async_runtime::block_on(lookup_word_with_config(&state, &config, "house", "en"))
                .unwrap();

        assert_eq!(first.meanings, vec!["дом"]);
        assert_eq!(second.meanings, vec!["дом"]);
        assert_eq!(server.request_count(), 1);
    }

    #[test]
    fn not_found_lookup_cache_prevents_repeated_provider_requests() {
        let server = TestDictionaryServer::new(404, "");
        let config =
            DictionaryClientConfig::for_tests_with_insecure_localhost(&server.endpoint_base());
        let state = DictionaryState::default();

        let first = tauri::async_runtime::block_on(lookup_word_with_config(
            &state, &config, "missing", "en",
        ));
        let second = tauri::async_runtime::block_on(lookup_word_with_config(
            &state, &config, "missing", "en",
        ));

        assert!(matches!(first, Err(WordLookupError::NotFound)));
        assert!(matches!(second, Err(WordLookupError::NotFound)));
        assert_eq!(server.request_count(), 1);
    }

    #[test]
    fn maps_provider_404_to_not_found() {
        let server = TestDictionaryServer::new(404, "");
        let config =
            DictionaryClientConfig::for_tests_with_insecure_localhost(&server.endpoint_base());
        let state = DictionaryState::default();

        let result = tauri::async_runtime::block_on(lookup_word_with_config(
            &state, &config, "missing", "en",
        ));

        assert!(matches!(result, Err(WordLookupError::NotFound)));
    }

    #[test]
    fn maps_provider_non_success_status_to_dictionary_unavailable() {
        let server = TestDictionaryServer::new(500, "");
        let config =
            DictionaryClientConfig::for_tests_with_insecure_localhost(&server.endpoint_base());
        let state = DictionaryState::default();

        let result =
            tauri::async_runtime::block_on(lookup_word_with_config(&state, &config, "house", "en"));

        assert!(matches!(
            result,
            Err(WordLookupError::DictionaryUnavailable)
        ));
    }

    #[test]
    fn maps_network_send_failure_to_dictionary_unavailable() {
        let endpoint_base = unused_localhost_endpoint_base();
        let config = DictionaryClientConfig::for_tests_with_insecure_localhost(&endpoint_base);
        let state = DictionaryState::default();

        let result =
            tauri::async_runtime::block_on(lookup_word_with_config(&state, &config, "house", "en"));

        assert!(matches!(
            result,
            Err(WordLookupError::DictionaryUnavailable)
        ));
    }

    struct TestDictionaryServer {
        endpoint_base: String,
        request_count: Arc<AtomicUsize>,
        stop: Arc<AtomicBool>,
        handle: Option<thread::JoinHandle<()>>,
    }

    impl TestDictionaryServer {
        fn new(status_code: u16, body: &'static str) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            listener.set_nonblocking(true).unwrap();
            let request_count = Arc::new(AtomicUsize::new(0));
            let stop = Arc::new(AtomicBool::new(false));
            let thread_request_count = Arc::clone(&request_count);
            let thread_stop = Arc::clone(&stop);

            let handle = thread::spawn(move || {
                while !thread_stop.load(Ordering::SeqCst) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            thread_request_count.fetch_add(1, Ordering::SeqCst);
                            write_response(&mut stream, status_code, body);
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(StdDuration::from_millis(5));
                        }
                        Err(_) => break,
                    }
                }
            });

            Self {
                endpoint_base: format!("http://127.0.0.1:{port}/ruwiktionary/"),
                request_count,
                stop,
                handle: Some(handle),
            }
        }

        fn endpoint_base(&self) -> String {
            self.endpoint_base.clone()
        }

        fn request_count(&self) -> usize {
            self.request_count.load(Ordering::SeqCst)
        }
    }

    impl Drop for TestDictionaryServer {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::SeqCst);
            let _ = TcpStream::connect(self.endpoint_base.replace("/ruwiktionary/", ""));
            if let Some(handle) = self.handle.take() {
                handle.join().unwrap();
            }
        }
    }

    fn write_response(stream: &mut TcpStream, status_code: u16, body: &str) {
        let _ = stream.set_read_timeout(Some(StdDuration::from_millis(100)));
        let mut request_buffer = [0; 1024];
        let _ = stream.read(&mut request_buffer);
        let reason = match status_code {
            200 => "OK",
            404 => "Not Found",
            500 => "Internal Server Error",
            _ => "Test Status",
        };
        let response = format!(
            "HTTP/1.1 {status_code} {reason}\r\nContent-Type: application/jsonl; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.as_bytes().len()
        );
        stream.write_all(response.as_bytes()).unwrap();
    }

    fn unused_localhost_endpoint_base() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        format!("http://localhost:{port}/ruwiktionary/")
    }
}
