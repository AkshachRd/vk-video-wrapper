use serde::Serialize;

use super::embed::{fetch_embed_metadata, VkEmbedMetadata, VkSubtitleTrack};
use super::errors::VkLoadError;
use super::link_parser::{parse_vk_video_url, VkVideoId};
use super::subtitles::{fetch_subtitle_text, select_subtitle_pair};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedVideo {
    pub video_id: VkVideoId,
    pub embed_url: String,
    pub tracks: Vec<VkSubtitleTrack>,
    pub selected_track_id: String,
    pub subtitle_text: String,
    pub secondary_track_id: Option<String>,
    pub secondary_subtitle_text: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedSubtitleTrack {
    pub selected_track_id: String,
    pub subtitle_text: String,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn load_video_from_url(url: String) -> Result<LoadedVideo, String> {
    let video_id = parse_vk_video_url(&url).map_err(String::from)?;
    let metadata = fetch_embed_metadata(&video_id)
        .await
        .map_err(String::from)?;

    let (selected_track, secondary_track) = {
        let (primary, secondary) = select_subtitle_pair(&metadata.tracks).map_err(String::from)?;
        (primary.clone(), secondary.cloned())
    };

    let subtitle_text = fetch_subtitle_text(&selected_track)
        .await
        .map_err(String::from)?;

    let (secondary_track_id, secondary_subtitle_text) = match &secondary_track {
        Some(track) => match fetch_subtitle_text(track).await {
            Ok(text) => (Some(track.id.clone()), Some(text)),
            Err(_) => (None, None),
        },
        None => (None, None),
    };

    Ok(assemble_loaded_video(
        video_id,
        metadata,
        selected_track,
        subtitle_text,
        secondary_track_id,
        secondary_subtitle_text,
    ))
}

#[tauri::command]
pub async fn load_subtitle_track(
    video_id: VkVideoId,
    track_id: String,
) -> Result<LoadedSubtitleTrack, String> {
    let metadata = fetch_embed_metadata(&video_id)
        .await
        .map_err(String::from)?;
    let selected_track = select_track_by_id(&metadata.tracks, &track_id).map_err(String::from)?;
    let subtitle_text = fetch_subtitle_text(&selected_track)
        .await
        .map_err(String::from)?;

    Ok(assemble_loaded_subtitle_track(
        selected_track,
        subtitle_text,
    ))
}

fn assemble_loaded_video(
    video_id: VkVideoId,
    metadata: VkEmbedMetadata,
    selected_track: VkSubtitleTrack,
    subtitle_text: String,
    secondary_track_id: Option<String>,
    secondary_subtitle_text: Option<String>,
) -> LoadedVideo {
    LoadedVideo {
        video_id,
        embed_url: metadata.embed_url,
        tracks: metadata.tracks,
        selected_track_id: selected_track.id,
        subtitle_text,
        secondary_track_id,
        secondary_subtitle_text,
    }
}

fn select_track_by_id(
    tracks: &[VkSubtitleTrack],
    track_id: &str,
) -> Result<VkSubtitleTrack, VkLoadError> {
    tracks
        .iter()
        .find(|track| track.id == track_id)
        .cloned()
        .ok_or(VkLoadError::SubtitlesNotFound)
}

fn assemble_loaded_subtitle_track(
    selected_track: VkSubtitleTrack,
    subtitle_text: String,
) -> LoadedSubtitleTrack {
    LoadedSubtitleTrack {
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

    fn track_with_id(id: &str) -> VkSubtitleTrack {
        VkSubtitleTrack {
            id: id.to_string(),
            lang: id.split('_').next().unwrap_or("ru").to_string(),
            title: format!("{id}.vtt"),
            url: "https://vkvd737.okcdn.ru/subtitles/test.vtt".to_string(),
            manifest_name: id.to_string(),
            is_auto: false,
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
            secondary_track_id: Some("ru_1_ru.vtt".to_string()),
            secondary_subtitle_text: Some("WEBVTT\n\nпривет".to_string()),
        })
        .unwrap();

        assert_eq!(value["videoId"]["ownerId"], -1);
        assert_eq!(value["selectedTrackId"], "ru_0_ru_auto.vtt");
        assert_eq!(value["subtitleText"], "WEBVTT");
        assert_eq!(value["secondaryTrackId"], "ru_1_ru.vtt");
        assert_eq!(value["secondarySubtitleText"], "WEBVTT\n\nпривет");
    }

    #[test]
    fn loaded_video_serializes_absent_secondary_as_null() {
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
            secondary_track_id: None,
            secondary_subtitle_text: None,
        })
        .unwrap();

        assert_eq!(value["secondaryTrackId"], serde_json::Value::Null);
        assert_eq!(value["secondarySubtitleText"], serde_json::Value::Null);
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
            Some("ru_1_ru.vtt".to_string()),
            Some("WEBVTT\n\nпривет".to_string()),
        );

        assert_eq!(video.selected_track_id, "ru_0_ru_auto.vtt");
        assert_eq!(video.subtitle_text, "WEBVTT\n\nhello");
        assert_eq!(video.secondary_track_id.as_deref(), Some("ru_1_ru.vtt"));
        assert_eq!(
            video.secondary_subtitle_text.as_deref(),
            Some("WEBVTT\n\nпривет")
        );
        assert_eq!(video.tracks.len(), 1);
    }

    #[test]
    fn loaded_subtitle_track_serializes_as_camel_case() {
        let value = serde_json::to_value(LoadedSubtitleTrack {
            selected_track_id: "de_1_de.vtt".to_string(),
            subtitle_text: "WEBVTT\n\nHallo".to_string(),
        })
        .unwrap();

        assert_eq!(value["selectedTrackId"], "de_1_de.vtt");
        assert_eq!(value["subtitleText"], "WEBVTT\n\nHallo");
    }

    #[test]
    fn selects_requested_track_by_id() {
        let ru = track_with_id("ru_0_ru.vtt");
        let de = track_with_id("de_1_de.vtt");
        let selected = select_track_by_id(&[ru, de.clone()], "de_1_de.vtt").unwrap();

        assert_eq!(selected, de);
    }

    #[test]
    fn returns_subtitles_not_found_for_missing_track_id() {
        let tracks = vec![track_with_id("ru_0_ru.vtt")];

        assert!(matches!(
            select_track_by_id(&tracks, "de_1_de.vtt"),
            Err(crate::vk::errors::VkLoadError::SubtitlesNotFound)
        ));
    }

    #[test]
    fn assembles_loaded_subtitle_track() {
        let selected = track_with_id("de_1_de.vtt");
        let loaded = assemble_loaded_subtitle_track(selected, "WEBVTT\n\nHallo".to_string());

        assert_eq!(loaded.selected_track_id, "de_1_de.vtt");
        assert_eq!(loaded.subtitle_text, "WEBVTT\n\nHallo");
    }
}
