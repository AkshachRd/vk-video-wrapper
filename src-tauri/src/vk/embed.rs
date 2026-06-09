use encoding_rs::{Encoding, UTF_8};
use quick_xml::events::{BytesRef, BytesStart, BytesText, Event};
use quick_xml::Reader;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::Duration;
use url::Url;

use super::errors::VkLoadError;
use super::link_parser::VkVideoId;

const USER_AGENT_VALUE: &str = "Mozilla/5.0";
const EMBED_REFERER: &str = "https://vkvideo.ru/";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VkSubtitleTrack {
    pub id: String,
    pub lang: String,
    pub title: String,
    pub url: String,
    pub manifest_name: String,
    pub is_auto: bool,
    pub storage_index: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VkEmbedMetadata {
    pub embed_url: String,
    pub tracks: Vec<VkSubtitleTrack>,
    pub title: Option<String>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawSubtitleTrack {
    #[serde(default)]
    is_auto: bool,
    #[serde(default)]
    storage_index: i64,
    #[serde(default)]
    lang: String,
    #[serde(default)]
    title: String,
    url: String,
    #[serde(default)]
    manifest_name: String,
}

pub fn build_embed_url(id: &VkVideoId) -> String {
    let mut url = Url::parse("https://vk.com/video_ext.php").expect("valid VK embed base URL");
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("oid", &id.owner_id.to_string());
        query.append_pair("id", &id.video_id.to_string());
        query.append_pair("hd", "2");
        query.append_pair("js_api", "1");
        if let Some(list) = &id.list {
            query.append_pair("list", list);
        }
        if let Some(access_key) = &id.access_key {
            query.append_pair("access_key", access_key);
        }
    }
    url.to_string()
}

#[cfg(test)]
fn extract_embed_metadata(html: &str) -> Result<VkEmbedMetadata, VkLoadError> {
    let tracks = extract_tracks(html)?;
    Ok(VkEmbedMetadata {
        embed_url: String::new(),
        tracks,
        title: extract_title(html),
        thumbnail_url: extract_thumbnail(html),
    })
}

pub async fn fetch_embed_metadata(id: &VkVideoId) -> Result<VkEmbedMetadata, VkLoadError> {
    let embed_url = build_embed_url(id);
    let client = build_embed_client()?;
    let request = build_embed_request(&client, &embed_url)?;
    let response = client
        .execute(request)
        .await
        .map_err(|_| VkLoadError::VideoUnavailable)?;

    if !response.status().is_success() {
        return Err(VkLoadError::VideoUnavailable);
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .cloned();
    let bytes = response
        .bytes()
        .await
        .map_err(|_| VkLoadError::VideoUnavailable)?;
    let html = decode_embed_html(&bytes, content_type.as_ref());

    let static_tracks = extract_tracks(&html).unwrap_or_default();
    let dash_tracks = fetch_dash_subtitle_tracks(&client, &html).await;
    let tracks = merge_subtitle_tracks(static_tracks, dash_tracks);
    if tracks.is_empty() {
        return Err(VkLoadError::SubtitlesNotFound);
    }

    let title = extract_title(&html);
    let thumbnail_url = extract_thumbnail(&html);
    let mut metadata = VkEmbedMetadata {
        embed_url: String::new(),
        tracks,
        title,
        thumbnail_url,
    };
    metadata.embed_url = embed_url;
    Ok(metadata)
}

fn build_embed_client() -> Result<reqwest::Client, VkLoadError> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|_| VkLoadError::VideoUnavailable)
}

fn build_embed_request(
    client: &reqwest::Client,
    embed_url: &str,
) -> Result<reqwest::Request, VkLoadError> {
    client
        .get(embed_url)
        .header(reqwest::header::USER_AGENT, USER_AGENT_VALUE)
        .header(reqwest::header::REFERER, EMBED_REFERER)
        .build()
        .map_err(|_| VkLoadError::VideoUnavailable)
}

fn decode_embed_html(bytes: &[u8], content_type: Option<&reqwest::header::HeaderValue>) -> String {
    let charset = content_type
        .and_then(|value| value.to_str().ok())
        .and_then(extract_charset);
    let encoding = charset
        .as_deref()
        .and_then(|label| Encoding::for_label(label.as_bytes()))
        .unwrap_or(UTF_8);
    let (decoded, _, _) = encoding.decode(bytes);

    decoded.into_owned()
}

fn extract_charset(content_type: &str) -> Option<String> {
    content_type.split(';').find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        key.trim().eq_ignore_ascii_case("charset").then(|| {
            value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_ascii_lowercase()
        })
    })
}

fn extract_tracks(html: &str) -> Result<Vec<VkSubtitleTrack>, VkLoadError> {
    let raw_json = extract_subtitle_array(html)?.replace("\\/", "/");

    let raw_tracks: Vec<RawSubtitleTrack> =
        serde_json::from_str(&raw_json).map_err(|_| VkLoadError::SubtitlesNotFound)?;

    let tracks: Vec<VkSubtitleTrack> = raw_tracks
        .into_iter()
        .filter(|track| !track.url.is_empty())
        .map(|track| {
            let id = [
                track.lang.as_str(),
                &track.storage_index.to_string(),
                track.title.as_str(),
            ]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("_");
            VkSubtitleTrack {
                id,
                lang: track.lang,
                title: track.title,
                url: track.url,
                manifest_name: track.manifest_name,
                is_auto: track.is_auto,
                storage_index: track.storage_index,
            }
        })
        .collect();

    if tracks.is_empty() {
        Err(VkLoadError::SubtitlesNotFound)
    } else {
        Ok(tracks)
    }
}

async fn fetch_dash_subtitle_tracks(client: &reqwest::Client, html: &str) -> Vec<VkSubtitleTrack> {
    let mut tracks = Vec::new();

    for manifest_url in extract_dash_manifest_urls(html) {
        let Ok(request) = client
            .get(&manifest_url)
            .header(reqwest::header::USER_AGENT, USER_AGENT_VALUE)
            .header(reqwest::header::REFERER, "https://vk.com/")
            .build()
        else {
            continue;
        };
        let Ok(response) = client.execute(request).await else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let Ok(manifest) = response.text().await else {
            continue;
        };
        tracks.extend(extract_dash_subtitle_tracks(&manifest, &manifest_url));
    }

    tracks
}

fn extract_dash_manifest_urls(html: &str) -> Vec<String> {
    let re =
        Regex::new(r#""dash_sep"\s*:\s*"((?:\\.|[^"\\])*)""#).expect("valid dash manifest regex");

    re.captures_iter(html)
        .filter_map(|captures| captures.get(1))
        .filter_map(|url| decode_json_string(url.as_str()))
        .collect()
}

fn decode_json_string(raw: &str) -> Option<String> {
    serde_json::from_str::<String>(&format!("\"{raw}\"")).ok()
}

fn extract_dash_subtitle_tracks(mpd: &str, manifest_url: &str) -> Vec<VkSubtitleTrack> {
    let Ok(manifest_url) = Url::parse(manifest_url) else {
        return Vec::new();
    };
    let mut reader = Reader::from_str(mpd);
    reader.config_mut().trim_text(true);

    let mut current_text_track: Option<DashTextTrack> = None;
    let mut reading_base_url = false;
    let mut tracks = Vec::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) if element.name().as_ref() == b"AdaptationSet" => {
                current_text_track = dash_text_track_from_adaptation_set(&element);
            }
            Ok(Event::Start(element)) if element.name().as_ref() == b"Representation" => {
                if let Some(track) = &mut current_text_track {
                    track.representation_id =
                        xml_attribute(&element, b"id").unwrap_or_else(|| "subtitles".to_string());
                }
            }
            Ok(Event::Start(element)) if element.name().as_ref() == b"BaseURL" => {
                reading_base_url = current_text_track.is_some();
            }
            Ok(Event::Text(text)) if reading_base_url => {
                if let (Some(track), Some(base_url)) =
                    (&mut current_text_track, decode_xml_text(&text))
                {
                    track.base_url.push_str(&base_url);
                }
            }
            Ok(Event::GeneralRef(reference)) if reading_base_url => {
                if let (Some(track), Some(value)) =
                    (&mut current_text_track, decode_xml_reference(&reference))
                {
                    track.base_url.push_str(&value);
                }
            }
            Ok(Event::End(element)) if element.name().as_ref() == b"BaseURL" => {
                reading_base_url = false;
            }
            Ok(Event::End(element)) if element.name().as_ref() == b"AdaptationSet" => {
                if let Some(track) = current_text_track.take() {
                    if let Some(track) =
                        dash_text_track_to_subtitle_track(track, &manifest_url, tracks.len())
                    {
                        tracks.push(track);
                    }
                }
                reading_base_url = false;
            }
            Ok(Event::Eof) => break,
            Err(_) => return Vec::new(),
            _ => {}
        }
    }

    tracks
}

#[derive(Debug)]
struct DashTextTrack {
    lang: String,
    representation_id: String,
    base_url: String,
}

fn dash_text_track_from_adaptation_set(element: &BytesStart<'_>) -> Option<DashTextTrack> {
    let content_type = xml_attribute(element, b"contentType");
    let mime_type = xml_attribute(element, b"mimeType");
    let is_text = content_type.as_deref() == Some("text")
        || mime_type
            .as_deref()
            .is_some_and(|value| value.eq_ignore_ascii_case("text/vtt"));
    if !is_text {
        return None;
    }

    Some(DashTextTrack {
        lang: xml_attribute(element, b"lang").unwrap_or_default(),
        representation_id: String::new(),
        base_url: String::new(),
    })
}

fn dash_text_track_to_subtitle_track(
    track: DashTextTrack,
    manifest_url: &Url,
    fallback_index: usize,
) -> Option<VkSubtitleTrack> {
    if track.lang.trim().is_empty() || track.base_url.trim().is_empty() {
        return None;
    }

    let representation_id = if track.representation_id.trim().is_empty() {
        format!("subtitles_{fallback_index}")
    } else {
        track.representation_id
    };
    let subtitle_url = manifest_url.join(track.base_url.trim()).ok()?;
    let storage_index = representation_id
        .rsplit('_')
        .next()
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(fallback_index as i64);

    Some(VkSubtitleTrack {
        id: format!(
            "dash_{}_{}",
            track_id_part(&track.lang),
            track_id_part(&representation_id)
        ),
        lang: track.lang.clone(),
        title: format!("{representation_id}.vtt"),
        url: subtitle_url.to_string(),
        manifest_name: subtitle_label_for_lang(&track.lang),
        is_auto: false,
        storage_index,
    })
}

fn xml_attribute(element: &BytesStart<'_>, name: &[u8]) -> Option<String> {
    element
        .attributes()
        .flatten()
        .find(|attribute| attribute.key.as_ref() == name)
        .and_then(|attribute| {
            attribute
                .unescape_value()
                .ok()
                .map(|value| value.into_owned())
        })
}

fn decode_xml_text(text: &BytesText<'_>) -> Option<String> {
    text.decode().ok().map(|value| value.into_owned())
}

fn decode_xml_reference(reference: &BytesRef<'_>) -> Option<String> {
    if let Ok(Some(ch)) = reference.resolve_char_ref() {
        return Some(ch.to_string());
    }

    let value = reference.decode().ok()?;
    match value.as_ref() {
        "amp" => Some("&".to_string()),
        "lt" => Some("<".to_string()),
        "gt" => Some(">".to_string()),
        "quot" => Some("\"".to_string()),
        "apos" => Some("'".to_string()),
        _ => None,
    }
}

fn merge_subtitle_tracks(
    primary_tracks: Vec<VkSubtitleTrack>,
    additional_tracks: Vec<VkSubtitleTrack>,
) -> Vec<VkSubtitleTrack> {
    let mut seen_languages = HashSet::new();
    let mut seen_ids = HashSet::new();
    let mut tracks = Vec::with_capacity(primary_tracks.len() + additional_tracks.len());

    for track in primary_tracks {
        remember_track(&track, &mut seen_languages, &mut seen_ids);
        tracks.push(track);
    }

    for track in additional_tracks {
        let language_key = normalized_track_language(&track);
        if !language_key.is_empty() && seen_languages.contains(&language_key) {
            continue;
        }
        if seen_ids.contains(&track.id) {
            continue;
        }

        remember_track(&track, &mut seen_languages, &mut seen_ids);
        tracks.push(track);
    }

    tracks
}

fn remember_track(
    track: &VkSubtitleTrack,
    seen_languages: &mut HashSet<String>,
    seen_ids: &mut HashSet<String>,
) {
    let language_key = normalized_track_language(track);
    if !language_key.is_empty() {
        seen_languages.insert(language_key);
    }
    seen_ids.insert(track.id.clone());
}

fn normalized_track_language(track: &VkSubtitleTrack) -> String {
    track.lang.trim().to_ascii_lowercase()
}

fn track_id_part(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn subtitle_label_for_lang(lang: &str) -> String {
    match lang.to_ascii_lowercase().as_str() {
        "ru" => "Русский".to_string(),
        "en" => "English".to_string(),
        "de" => "Deutsch".to_string(),
        _ => lang.to_ascii_uppercase(),
    }
}

fn extract_title(html: &str) -> Option<String> {
    extract_player_video_title(html)
        .or_else(|| extract_meta_content(html, "og:title"))
        .or_else(|| extract_md_title(html))
}

fn extract_thumbnail(html: &str) -> Option<String> {
    extract_player_thumbnail(html).or_else(|| extract_meta_content(html, "og:image"))
}

// The VK embed player JSON carries the video title in the video's identity
// block (`"owner_id":<id>,...,"title":"..."`). `owner_id` appears once in an
// embed and always before this title, so anchoring on it avoids grabbing a
// subtitle track's own `"title"` (which appears earlier in the subtitles array).
fn extract_player_video_title(html: &str) -> Option<String> {
    let re = Regex::new(r#""owner_id":-?\d+[^{}]*?"title":"((?:\\.|[^"\\])*)""#).ok()?;
    let raw = re.captures(html)?.get(1)?.as_str();
    let decoded = decode_json_string(raw)?;
    let trimmed = decoded.trim();

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

// The video object exposes a preview array `"image":[{"url":..,"width":..}, ..]`
// of thumbnail sizes (distinct from `"first_frame"`). Pick the largest by width.
fn extract_player_thumbnail(html: &str) -> Option<String> {
    let array = extract_image_array(html)?;
    let entry_re = Regex::new(r#""url":"((?:\\.|[^"\\])*)"[^}]*?"width":(\d+)"#).ok()?;
    let mut best: Option<(i64, String)> = None;

    for caps in entry_re.captures_iter(array) {
        let Some(url_match) = caps.get(1) else {
            continue;
        };
        let Some(width_match) = caps.get(2) else {
            continue;
        };
        let Ok(width) = width_match.as_str().parse::<i64>() else {
            continue;
        };
        let Some(url) = decode_json_string(url_match.as_str()) else {
            continue;
        };

        if best
            .as_ref()
            .map_or(true, |(best_width, _)| width > *best_width)
        {
            best = Some((width, url));
        }
    }

    best.map(|(_, url)| url)
}

fn extract_image_array(html: &str) -> Option<&str> {
    let key_re = Regex::new(r#""image"\s*:\s*\["#).ok()?;
    let key_match = key_re.find(html)?;
    let bracket_start = key_match.end() - 1;
    extract_balanced_json_array(html, bracket_start).ok()
}

fn extract_meta_content(html: &str, property: &str) -> Option<String> {
    let tag_pattern = format!(
        r#"(?is)<meta\b[^>]*\b(?:property|name)\s*=\s*["']{}["'][^>]*>"#,
        regex::escape(property)
    );
    let tag_re = Regex::new(&tag_pattern).ok()?;
    let content_re = Regex::new(r#"(?is)\bcontent\s*=\s*["']([^"']*)["']"#).ok()?;

    let tag = tag_re.find(html)?.as_str();
    let content = content_re.captures(tag)?.get(1)?.as_str();
    let decoded = decode_html_entities(content);
    let trimmed = decoded.trim();

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn extract_md_title(html: &str) -> Option<String> {
    let re = Regex::new(r#""md_title"\s*:\s*"((?:\\.|[^"\\])*)""#).ok()?;
    let raw = re.captures(html)?.get(1)?.as_str();
    let decoded = decode_json_string(raw)?;
    let trimmed = decoded.trim();

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn extract_subtitle_array(html: &str) -> Result<&str, VkLoadError> {
    let key_re =
        Regex::new(r#""subtitles"\s*:|\bsubtitles\s*:"#).expect("valid subtitles key regex");

    for key_match in key_re.find_iter(html) {
        let after_key = &html[key_match.end()..];
        let Some(start_offset) = after_key
            .char_indices()
            .find_map(|(index, ch)| (!ch.is_whitespace()).then_some(index))
        else {
            continue;
        };
        let start = key_match.end() + start_offset;
        if html[start..].starts_with('[') {
            return extract_balanced_json_array(html, start);
        }
    }

    Err(VkLoadError::SubtitlesNotFound)
}

fn extract_balanced_json_array(html: &str, start: usize) -> Result<&str, VkLoadError> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (offset, ch) in html[start..].char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '[' => depth += 1,
            ']' => {
                depth = depth.checked_sub(1).ok_or(VkLoadError::SubtitlesNotFound)?;
                if depth == 0 {
                    return Ok(&html[start..start + offset + ch.len_utf8()]);
                }
            }
            _ => {}
        }
    }

    Err(VkLoadError::SubtitlesNotFound)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vk::errors::VkLoadError;
    use crate::vk::link_parser::VkVideoId;
    use reqwest::header::{HeaderValue, REFERER, USER_AGENT};

    #[test]
    fn builds_vk_embed_url() {
        let id = VkVideoId {
            owner_id: -145784486,
            video_id: 456239038,
            list: None,
            access_key: None,
        };

        assert_eq!(
            build_embed_url(&id),
            "https://vk.com/video_ext.php?oid=-145784486&id=456239038&hd=2&js_api=1"
        );
    }

    #[test]
    fn builds_embed_url_with_list_and_access_key() {
        let id = VkVideoId {
            owner_id: -51890028,
            video_id: 456242200,
            list: Some("ln-Cg6C0nEVR81075JXFU".to_string()),
            access_key: Some("abc_123".to_string()),
        };

        assert_eq!(
            build_embed_url(&id),
            "https://vk.com/video_ext.php?oid=-51890028&id=456242200&hd=2&js_api=1&list=ln-Cg6C0nEVR81075JXFU&access_key=abc_123"
        );
    }

    #[test]
    fn extracts_subtitle_tracks_from_embed_html() {
        let html = include_str!("../../tests/fixtures/embed_with_subtitles.html");
        let metadata = extract_embed_metadata(html).unwrap();

        assert_eq!(metadata.tracks.len(), 2);
        assert_eq!(metadata.tracks[0].id, "ru_0_ru_auto.vtt");
        assert_eq!(metadata.tracks[0].lang, "ru");
        assert_eq!(metadata.tracks[0].manifest_name, "Русский");
        assert!(metadata.tracks[0].is_auto);
        assert_eq!(
            metadata.tracks[0].url,
            "https://vkvd737.okcdn.ru/?subId=1&id=1"
        );
    }

    #[test]
    fn extracts_dash_manifest_urls_from_embed_html() {
        let html = r#"window.playerParams = {"dash_sep":"https:\/\/vkvd251.okcdn.ru\/?srcIp=1\u0026ct=6"};"#;

        assert_eq!(
            extract_dash_manifest_urls(html),
            vec!["https://vkvd251.okcdn.ru/?srcIp=1&ct=6"]
        );
    }

    #[test]
    fn extracts_subtitle_tracks_from_dash_manifest() {
        let mpd = r#"<?xml version="1.0" encoding="UTF-8"?>
<MPD>
  <Period>
    <AdaptationSet id="1" mimeType="video/mp4"></AdaptationSet>
    <AdaptationSet contentType="text" lang="ru" mimeType="text/vtt">
      <Representation id="subtitles_0" bandwidth="141713">
        <BaseURL>?expires=1&amp;type=2&amp;ix=0&amp;ct=13&amp;id=8209654024949</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet contentType="text" lang="en" mimeType="text/vtt">
      <Representation id="subtitles_1" bandwidth="110098">
        <BaseURL>?expires=1&amp;type=2&amp;ix=1&amp;ct=13&amp;id=8209654024949</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet contentType="text" lang="de" mimeType="text/vtt">
      <Representation id="subtitles_2" bandwidth="113356">
        <BaseURL>?expires=1&amp;type=2&amp;ix=2&amp;ct=13&amp;id=8209654024949</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>"#;

        let tracks = extract_dash_subtitle_tracks(mpd, "https://vkvd251.okcdn.ru/?srcIp=1&ct=6");

        assert_eq!(tracks.len(), 3);
        assert_eq!(tracks[0].lang, "ru");
        assert_eq!(tracks[0].manifest_name, "Русский");
        assert_eq!(tracks[1].manifest_name, "English");
        assert_eq!(tracks[2].id, "dash_de_subtitles_2");
        assert_eq!(tracks[2].manifest_name, "Deutsch");
        assert_eq!(
            tracks[2].url,
            "https://vkvd251.okcdn.ru/?expires=1&type=2&ix=2&ct=13&id=8209654024949"
        );
    }

    #[test]
    fn merges_dash_tracks_without_duplicate_languages() {
        let static_ru = VkSubtitleTrack {
            id: "ru_0_Nicos Weg (A1).ru.srt".to_string(),
            lang: "ru".to_string(),
            title: "Nicos Weg (A1).ru.srt".to_string(),
            url: "https://vkvd251.okcdn.ru/?subId=1".to_string(),
            manifest_name: "Русский".to_string(),
            is_auto: false,
            storage_index: 0,
        };
        let dash_ru = VkSubtitleTrack {
            id: "dash_ru_subtitles_0".to_string(),
            lang: "ru".to_string(),
            title: "subtitles_0.vtt".to_string(),
            url: "https://vkvd251.okcdn.ru/?ix=0".to_string(),
            manifest_name: "Русский".to_string(),
            is_auto: false,
            storage_index: 0,
        };
        let dash_de = VkSubtitleTrack {
            id: "dash_de_subtitles_2".to_string(),
            lang: "de".to_string(),
            title: "subtitles_2.vtt".to_string(),
            url: "https://vkvd251.okcdn.ru/?ix=2".to_string(),
            manifest_name: "Deutsch".to_string(),
            is_auto: false,
            storage_index: 2,
        };

        let tracks = merge_subtitle_tracks(vec![static_ru], vec![dash_ru, dash_de]);

        assert_eq!(
            tracks
                .iter()
                .map(|track| track.manifest_name.as_str())
                .collect::<Vec<_>>(),
            vec!["Русский", "Deutsch"]
        );
    }

    #[test]
    fn extracts_subtitle_tracks_when_strings_contain_brackets() {
        let html = include_str!("../../tests/fixtures/embed_with_bracketed_subtitles.html");
        let metadata = extract_embed_metadata(html).unwrap();

        assert_eq!(metadata.tracks.len(), 1);
        assert_eq!(metadata.tracks[0].title, "ru_[auto].vtt");
        assert_eq!(
            metadata.tracks[0].url,
            "https://vkvd737.okcdn.ru/subtitles/ru]auto.vtt"
        );
    }

    #[test]
    fn decodes_windows_1251_embed_html_before_extracting_tracks() {
        let mut bytes =
            br#"var playerParams = {"subtitles":[{"lang":"ru","title":"ru.srt","url":"https:\/\/vkvd737.okcdn.ru\/?subId=1","manifest_name":""#
                .to_vec();
        bytes.extend_from_slice(&[0xD0, 0xF3, 0xF1, 0xF1, 0xEA, 0xE8, 0xE9]);
        bytes.extend_from_slice(br#"","is_auto":false,"storage_index":0}]};"#);

        let content_type = HeaderValue::from_static("text/html; charset=windows-1251");
        let html = decode_embed_html(&bytes, Some(&content_type));
        let metadata = extract_embed_metadata(&html).unwrap();

        assert_eq!(metadata.tracks[0].manifest_name, "Русский");
    }

    #[test]
    fn extracts_charset_from_content_type_case_insensitively() {
        assert_eq!(
            extract_charset("text/html; Charset=\"windows-1251\""),
            Some("windows-1251".to_string())
        );
    }

    #[test]
    fn returns_subtitles_not_found_when_embed_has_no_tracks() {
        let html = include_str!("../../tests/fixtures/embed_without_subtitles.html");
        assert!(matches!(
            extract_embed_metadata(html),
            Err(VkLoadError::SubtitlesNotFound)
        ));
    }

    #[test]
    fn builds_embed_request_with_user_agent_and_referer() {
        let request = build_embed_request(
            &reqwest::Client::new(),
            "https://vk.com/video_ext.php?oid=-1&id=2&hd=2&js_api=1",
        )
        .unwrap();

        assert_eq!(request.headers()[USER_AGENT], "Mozilla/5.0");
        assert_eq!(request.headers()[REFERER], "https://vkvideo.ru/");
    }

    #[test]
    fn builds_embed_client() {
        assert!(build_embed_client().is_ok());
    }

    #[test]
    fn extracts_title_and_thumbnail_from_og_meta() {
        let html = r#"<html><head>
            <meta property="og:title" content="Deutsch lernen &amp; mehr">
            <meta property="og:image" content="https://img.example/preview.jpg">
            </head></html>"#;

        assert_eq!(
            extract_title(html).as_deref(),
            Some("Deutsch lernen & mehr")
        );
        assert_eq!(
            extract_thumbnail(html).as_deref(),
            Some("https://img.example/preview.jpg")
        );
    }

    #[test]
    fn falls_back_to_md_title_when_og_title_absent() {
        let html = r#"<html><body>var playerParams = {"md_title":"Easy German 142","subtitles":[]};</body></html>"#;

        assert_eq!(extract_title(html).as_deref(), Some("Easy German 142"));
    }

    #[test]
    fn returns_none_when_no_title_or_thumbnail() {
        let html = r#"<html><head></head><body></body></html>"#;

        assert_eq!(extract_title(html), None);
        assert_eq!(extract_thumbnail(html), None);
    }

    #[test]
    fn extracts_video_title_and_thumbnail_from_player_params() {
        let html = concat!(
            r#"var playerParams = {"params":[{"#,
            r#""subtitles":[{"lang":"ru","title":"Nicos Weg (A1).ru.srt","url":"https:\/\/vkvd.okcdn.ru\/sub.vtt"}],"#,
            r#""image":[{"url":"https:\/\/sun9-62.userapi.com\/small.jpg","width":130,"height":96,"with_padding":1},"#,
            r#"{"url":"https:\/\/sun9-62.userapi.com\/big.jpg","width":640,"height":480,"with_padding":1}],"#,
            r#""first_frame":[{"url":"https:\/\/sun9-62.userapi.com\/frame.jpg","width":1000,"height":700}],"#,
            r#""duration":6220,"height":720,"id":456239038,"owner_id":-145784486,"ov_id":"9870329260277","title":"Nicos Weg (A1)"}]};"#,
        );

        assert_eq!(extract_title(html).as_deref(), Some("Nicos Weg (A1)"));
        assert_eq!(
            extract_thumbnail(html).as_deref(),
            Some("https://sun9-62.userapi.com/big.jpg")
        );
    }
}
