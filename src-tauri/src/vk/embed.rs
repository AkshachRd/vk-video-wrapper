use regex::Regex;
use serde::{Deserialize, Serialize};

use super::errors::VkLoadError;
use super::link_parser::VkVideoId;

const USER_AGENT_VALUE: &str = "Mozilla/5.0";
const EMBED_REFERER: &str = "https://vkvideo.ru/";

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
    format!(
        "https://vk.com/video_ext.php?oid={}&id={}&hd=2&js_api=1",
        id.owner_id, id.video_id
    )
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
    let client = reqwest::Client::new();
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
    let re = Regex::new(r#""?subtitles"?\s*:\s*(\[[^\]]*\])"#).expect("valid subtitle regex");
    let raw_json = re
        .captures(html)
        .and_then(|captures| captures.get(1))
        .map(|m| m.as_str().replace("\\/", "/"))
        .ok_or(VkLoadError::SubtitlesNotFound)?;

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
}
