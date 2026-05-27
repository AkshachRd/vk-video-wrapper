use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use url::{Host, Url};

const DEFAULT_LOOKUP_BASE: &str = "https://api.wiktapi.dev/v1/ru/word/";
const ALLOWED_DICTIONARY_HOST: &str = "api.wiktapi.dev";
const USER_AGENT_VALUE: &str = "vk-video-wrapper/0.1 dictionary-lookup";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_DICTIONARY_BYTES: usize = 512 * 1024;

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
    cache: Mutex<HashMap<String, CacheEntry>>,
}

impl GermanDictionaryState {
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
enum GermanWordLookupError {
    UnsupportedLanguage,
    NotFound,
    DictionaryUnavailable,
}

impl GermanWordLookupError {
    fn kind(self) -> &'static str {
        match self {
            GermanWordLookupError::UnsupportedLanguage => "unsupported-language",
            GermanWordLookupError::NotFound => "not-found",
            GermanWordLookupError::DictionaryUnavailable => "dictionary-unavailable",
        }
    }
}

impl From<GermanWordLookupError> for String {
    fn from(value: GermanWordLookupError) -> Self {
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
}

impl Default for DictionaryClientConfig {
    fn default() -> Self {
        Self {
            endpoint_base: Url::parse(DEFAULT_LOOKUP_BASE)
                .expect("default dictionary endpoint must be a valid URL"),
            allowed_hosts: vec![ALLOWED_DICTIONARY_HOST.to_string()],
        }
    }
}

impl DictionaryClientConfig {
    #[cfg(test)]
    fn for_tests(endpoint_base: &str) -> Self {
        Self {
            endpoint_base: Url::parse(endpoint_base).expect("test endpoint must be a valid URL"),
            allowed_hosts: vec![ALLOWED_DICTIONARY_HOST.to_string()],
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
        }
    }
}

#[tauri::command]
pub async fn lookup_german_word(
    state: tauri::State<'_, GermanDictionaryState>,
    word: String,
    cue_text: String,
    track_lang: String,
) -> Result<GermanWordLookup, String> {
    let _cue_text = cue_text;

    lookup_german_word_with_config(
        &state,
        &DictionaryClientConfig::default(),
        &word,
        &track_lang,
    )
    .await
    .map_err(String::from)
}

async fn lookup_german_word_with_config(
    state: &GermanDictionaryState,
    config: &DictionaryClientConfig,
    word: &str,
    track_lang: &str,
) -> Result<GermanWordLookup, GermanWordLookupError> {
    if !is_supported_german_language(track_lang) {
        return Err(GermanWordLookupError::UnsupportedLanguage);
    }

    let normalized = normalize_german_word(word).ok_or(GermanWordLookupError::NotFound)?;
    let cache_key = format!("de:{}", normalized.to_lowercase());

    match state.cached(&cache_key) {
        Some(CacheEntry::Found(lookup)) => return Ok(lookup),
        Some(CacheEntry::NotFound) => return Err(GermanWordLookupError::NotFound),
        None => {}
    }

    match fetch_lookup(config, &normalized).await {
        Ok(lookup) => {
            state.store_cache(&cache_key, CacheEntry::Found(lookup.clone()));
            Ok(lookup)
        }
        Err(GermanWordLookupError::NotFound) => {
            state.store_cache(&cache_key, CacheEntry::NotFound);
            Err(GermanWordLookupError::NotFound)
        }
        Err(error) => Err(error),
    }
}

async fn fetch_lookup(
    config: &DictionaryClientConfig,
    query: &str,
) -> Result<GermanWordLookup, GermanWordLookupError> {
    let client = build_dictionary_client()?;
    let url = build_lookup_url(config, query)?;
    let response = client
        .get(url)
        .header(reqwest::header::USER_AGENT, USER_AGENT_VALUE)
        .send()
        .await
        .map_err(|_| GermanWordLookupError::DictionaryUnavailable)?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(GermanWordLookupError::NotFound);
    }

    if !response.status().is_success() {
        return Err(GermanWordLookupError::DictionaryUnavailable);
    }

    let bytes = read_limited_dictionary_bytes(response).await?;
    parse_provider_response(query, &bytes)
}

fn build_dictionary_client() -> Result<reqwest::Client, GermanWordLookupError> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| GermanWordLookupError::DictionaryUnavailable)
}

fn build_lookup_url(
    config: &DictionaryClientConfig,
    word: &str,
) -> Result<Url, GermanWordLookupError> {
    if !is_allowed_dictionary_url(config, &config.endpoint_base) {
        return Err(GermanWordLookupError::DictionaryUnavailable);
    }

    let mut url = config.endpoint_base.clone();
    {
        let mut path = url
            .path_segments_mut()
            .map_err(|_| GermanWordLookupError::DictionaryUnavailable)?;
        path.pop_if_empty();
        path.push(word);
    }
    url.query_pairs_mut().clear().append_pair("lang", "de");

    Ok(url)
}

fn is_allowed_dictionary_url(config: &DictionaryClientConfig, url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }

    matches!(
        url.host(),
        Some(Host::Domain(host)) if config.allowed_hosts.contains(&normalize_host(host))
    )
}

fn normalize_host(host: &str) -> String {
    host.trim_end_matches('.').to_ascii_lowercase()
}

async fn read_limited_dictionary_bytes(
    mut response: reqwest::Response,
) -> Result<Vec<u8>, GermanWordLookupError> {
    let mut bytes = Vec::new();

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| GermanWordLookupError::DictionaryUnavailable)?
    {
        append_dictionary_chunk(&mut bytes, &chunk)?;
    }

    Ok(bytes)
}

fn append_dictionary_chunk(bytes: &mut Vec<u8>, chunk: &[u8]) -> Result<(), GermanWordLookupError> {
    let next_len = bytes
        .len()
        .checked_add(chunk.len())
        .ok_or(GermanWordLookupError::DictionaryUnavailable)?;
    if next_len > MAX_DICTIONARY_BYTES {
        return Err(GermanWordLookupError::DictionaryUnavailable);
    }

    bytes.extend_from_slice(chunk);
    Ok(())
}

fn normalize_german_word(word: &str) -> Option<String> {
    let normalized = word
        .trim()
        .trim_matches(|character: char| !character.is_alphabetic());

    if normalized.is_empty() {
        None
    } else {
        Some(normalized.to_string())
    }
}

fn is_supported_german_language(lang: &str) -> bool {
    let normalized = lang.trim().to_ascii_lowercase();
    normalized == "de" || normalized.starts_with("de-")
}

fn parse_provider_response(
    query: &str,
    bytes: &[u8],
) -> Result<GermanWordLookup, GermanWordLookupError> {
    if bytes.len() > MAX_DICTIONARY_BYTES {
        return Err(GermanWordLookupError::DictionaryUnavailable);
    }

    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| GermanWordLookupError::DictionaryUnavailable)?;

    find_provider_entry(query, &value)
}

fn find_provider_entry(
    query: &str,
    value: &Value,
) -> Result<GermanWordLookup, GermanWordLookupError> {
    match value {
        Value::Array(entries) => find_provider_entry_in_entries(query, entries),
        Value::Object(object) => match object.get("entries") {
            Some(Value::Array(entries)) => find_provider_entry_in_entries(query, entries),
            Some(_) => Err(GermanWordLookupError::DictionaryUnavailable),
            None => match parse_entry(query, value) {
                ParsedEntry::Found(lookup) => Ok(lookup),
                ParsedEntry::NoUsableGlosses => Err(GermanWordLookupError::NotFound),
                ParsedEntry::ContractDrift => Err(GermanWordLookupError::DictionaryUnavailable),
            },
        },
        _ => Err(GermanWordLookupError::DictionaryUnavailable),
    }
}

fn find_provider_entry_in_entries(
    query: &str,
    entries: &[Value],
) -> Result<GermanWordLookup, GermanWordLookupError> {
    let mut saw_no_usable_glosses = false;
    let mut saw_contract_drift = false;

    for entry in entries {
        match parse_entry(query, entry) {
            ParsedEntry::Found(lookup) => return Ok(lookup),
            ParsedEntry::NoUsableGlosses => saw_no_usable_glosses = true,
            ParsedEntry::ContractDrift => saw_contract_drift = true,
        }
    }

    if saw_contract_drift {
        Err(GermanWordLookupError::DictionaryUnavailable)
    } else if saw_no_usable_glosses || entries.is_empty() {
        Err(GermanWordLookupError::NotFound)
    } else {
        Err(GermanWordLookupError::DictionaryUnavailable)
    }
}

enum ParsedEntry {
    Found(GermanWordLookup),
    NoUsableGlosses,
    ContractDrift,
}

fn parse_entry(query: &str, entry: &Value) -> ParsedEntry {
    let Some(object) = entry.as_object() else {
        return ParsedEntry::ContractDrift;
    };
    let Some(senses) = object.get("senses").and_then(Value::as_array) else {
        return ParsedEntry::ContractDrift;
    };

    let mut meanings = Vec::new();
    let mut grammar = Vec::new();

    for sense in senses {
        collect_meanings(sense, &mut meanings);
        collect_grammar(sense, &mut grammar);
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

    ParsedEntry::Found(GermanWordLookup {
        query: query.to_string(),
        headword: headword.clone(),
        ipa: extract_ipa(object.get("sounds")),
        part_of_speech,
        grammar,
        meanings,
        source: "ruwiktionary".to_string(),
        source_url: build_source_url(&headword),
    })
}

fn collect_meanings(sense: &Value, meanings: &mut Vec<String>) {
    let Some(glosses) = sense.get("glosses").and_then(Value::as_array) else {
        return;
    };

    for gloss in glosses {
        if let Some(gloss) = gloss
            .as_str()
            .map(str::trim)
            .filter(|gloss| !gloss.is_empty())
        {
            push_unique(meanings, gloss.to_string());
        }
    }
}

fn collect_grammar(sense: &Value, grammar: &mut Vec<String>) {
    let Some(tags) = sense.get("tags").and_then(Value::as_array) else {
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

fn extract_ipa(sounds: Option<&Value>) -> Option<String> {
    let sounds = sounds?.as_array()?;

    sounds.iter().find_map(|sound| {
        sound
            .get("ipa")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|ipa| !ipa.is_empty())
            .map(ToString::to_string)
    })
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
        "masculine" => Some("мужской род"),
        "feminine" => Some("женский род"),
        "neuter" => Some("средний род"),
        "present" => Some("настоящее время"),
        "past" => Some("прошедшее время"),
        "comparative" => Some("сравнительная степень"),
        "superlative" => Some("превосходная степень"),
        _ => None,
    }
}

fn build_source_url(headword: &str) -> Option<String> {
    let mut url = Url::parse("https://ru.wiktionary.org/wiki/").ok()?;
    {
        let mut path = url.path_segments_mut().ok()?;
        path.pop_if_empty();
        path.push(headword);
    }
    Some(url.to_string())
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.contains(&value) {
        values.push(value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_clicked_german_words() {
        assert_eq!(
            normalize_german_word("„Häuser!“"),
            Some("Häuser".to_string())
        );
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

        assert_eq!(
            url.as_str(),
            "https://api.wiktapi.dev/v1/ru/word/H%C3%A4user?lang=de"
        );
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
    fn builds_lookup_url_for_explicitly_allowed_mock_host() {
        let config = DictionaryClientConfig::for_tests_with_allowed_hosts(
            "https://localhost:8787/v1/ru/word/",
            &["localhost"],
        );
        let url = build_lookup_url(&config, "Häuser").unwrap();

        assert_eq!(
            url.as_str(),
            "https://localhost:8787/v1/ru/word/H%C3%A4user?lang=de"
        );
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
    fn maps_provider_contract_drift_to_dictionary_unavailable() {
        assert!(matches!(
            parse_provider_response("x", br#"{"unexpected":[]}"#),
            Err(GermanWordLookupError::DictionaryUnavailable)
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
}
