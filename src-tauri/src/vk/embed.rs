use regex::Regex;
use serde::{Deserialize, Serialize};
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

pub fn extract_embed_metadata(html: &str) -> Result<VkEmbedMetadata, VkLoadError> {
    let tracks = extract_tracks(html)?;
    Ok(VkEmbedMetadata {
        embed_url: String::new(),
        tracks,
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

    let html = response
        .text()
        .await
        .map_err(|_| VkLoadError::VideoUnavailable)?;
    let mut metadata = extract_embed_metadata(&html)?;
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
    use reqwest::header::{REFERER, USER_AGENT};

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
}
