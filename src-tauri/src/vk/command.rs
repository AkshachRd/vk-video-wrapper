use serde::Serialize;

use super::embed::{fetch_embed_metadata, VkEmbedMetadata, VkSubtitleTrack};
use super::link_parser::{parse_vk_video_url, VkVideoId};
use super::subtitles::{fetch_subtitle_text, select_primary_track};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedVideo {
    pub video_id: VkVideoId,
    pub embed_url: String,
    pub tracks: Vec<VkSubtitleTrack>,
    pub selected_track_id: String,
    pub subtitle_text: String,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn load_video_from_url(url: String) -> Result<LoadedVideo, String> {
    let video_id = parse_vk_video_url(&url).map_err(String::from)?;
    let metadata = fetch_embed_metadata(&video_id)
        .await
        .map_err(String::from)?;
    let selected_track = select_primary_track(&metadata.tracks)
        .map_err(String::from)?
        .clone();
    let subtitle_text = fetch_subtitle_text(&selected_track)
        .await
        .map_err(String::from)?;

    Ok(assemble_loaded_video(
        video_id,
        metadata,
        selected_track,
        subtitle_text,
    ))
}

fn assemble_loaded_video(
    video_id: VkVideoId,
    metadata: VkEmbedMetadata,
    selected_track: VkSubtitleTrack,
    subtitle_text: String,
) -> LoadedVideo {
    LoadedVideo {
        video_id,
        embed_url: metadata.embed_url,
        tracks: metadata.tracks,
        selected_track_id: selected_track.id,
        subtitle_text,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vk::embed::VkSubtitleTrack;
    use crate::vk::link_parser::VkVideoId;

    fn track() -> VkSubtitleTrack {
        VkSubtitleTrack {
            id: "ru_0_ru_auto.vtt".to_string(),
            lang: "ru".to_string(),
            title: "ru_auto.vtt".to_string(),
            url: "https://example.com/ru.vtt".to_string(),
            manifest_name: "Русский".to_string(),
            is_auto: true,
            storage_index: 0,
        }
    }

    #[test]
    fn loaded_video_serializes_as_camel_case() {
        let value = serde_json::to_value(LoadedVideo {
            video_id: VkVideoId {
                owner_id: -1,
                video_id: 2,
                list: None,
                access_key: None,
            },
            embed_url: "https://vk.com/video_ext.php?oid=-1&id=2&hd=2&js_api=1".to_string(),
            tracks: vec![track()],
            selected_track_id: "ru_0_ru_auto.vtt".to_string(),
            subtitle_text: "WEBVTT".to_string(),
        })
        .unwrap();

        assert_eq!(value["videoId"]["ownerId"], -1);
        assert_eq!(value["videoId"]["videoId"], 2);
        assert_eq!(
            value["embedUrl"],
            "https://vk.com/video_ext.php?oid=-1&id=2&hd=2&js_api=1"
        );
        assert_eq!(value["tracks"][0]["manifestName"], "Русский");
        assert_eq!(value["selectedTrackId"], "ru_0_ru_auto.vtt");
        assert_eq!(value["subtitleText"], "WEBVTT");
    }

    #[test]
    fn load_video_from_url_returns_serialized_invalid_link_error() {
        let error = tauri::async_runtime::block_on(load_video_from_url(
            "https://example.com/video-1_2".to_string(),
        ))
        .unwrap_err();

        assert_eq!(error, r#"{"kind":"invalid-link","message":"invalid-link"}"#);
    }

    #[test]
    fn assembles_loaded_video_from_supplied_metadata_and_subtitle_text() {
        let video_id = VkVideoId {
            owner_id: -1,
            video_id: 2,
            list: None,
            access_key: None,
        };
        let selected_track = track();
        let metadata = VkEmbedMetadata {
            embed_url: "https://vk.com/video_ext.php?oid=-1&id=2&hd=2&js_api=1".to_string(),
            tracks: vec![selected_track.clone()],
        };

        let video = assemble_loaded_video(
            video_id,
            metadata,
            selected_track,
            "WEBVTT\n\nhello".to_string(),
        );

        assert_eq!(video.selected_track_id, "ru_0_ru_auto.vtt");
        assert_eq!(video.subtitle_text, "WEBVTT\n\nhello");
        assert_eq!(video.tracks.len(), 1);
    }
}
