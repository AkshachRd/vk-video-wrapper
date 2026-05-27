use super::embed::VkSubtitleTrack;
use super::errors::VkLoadError;

const USER_AGENT_VALUE: &str = "Mozilla/5.0";
const SUBTITLE_REFERER: &str = "https://vk.com/";

pub fn select_primary_track(tracks: &[VkSubtitleTrack]) -> Result<&VkSubtitleTrack, VkLoadError> {
    tracks
        .iter()
        .find(|track| track.lang.eq_ignore_ascii_case("ru"))
        .or_else(|| tracks.first())
        .ok_or(VkLoadError::SubtitlesNotFound)
}

pub async fn fetch_subtitle_text(track: &VkSubtitleTrack) -> Result<String, VkLoadError> {
    let client = reqwest::Client::new();
    let request = build_subtitle_request(&client, track)?;
    let response = client
        .execute(request)
        .await
        .map_err(|_| VkLoadError::SubtitleFetchFailed)?;

    if !response.status().is_success() {
        return Err(VkLoadError::SubtitleFetchFailed);
    }

    response
        .text()
        .await
        .map_err(|_| VkLoadError::SubtitleFetchFailed)
}

fn build_subtitle_request(
    client: &reqwest::Client,
    track: &VkSubtitleTrack,
) -> Result<reqwest::Request, VkLoadError> {
    client
        .get(&track.url)
        .header(reqwest::header::USER_AGENT, USER_AGENT_VALUE)
        .header(reqwest::header::REFERER, SUBTITLE_REFERER)
        .build()
        .map_err(|_| VkLoadError::SubtitleFetchFailed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vk::embed::VkSubtitleTrack;
    use crate::vk::errors::VkLoadError;
    use reqwest::header::{REFERER, USER_AGENT};

    fn track(id: &str, lang: &str) -> VkSubtitleTrack {
        VkSubtitleTrack {
            id: id.to_string(),
            lang: lang.to_string(),
            title: format!("{lang}.vtt"),
            url: format!("https://example.com/{id}.vtt"),
            manifest_name: lang.to_string(),
            is_auto: false,
            storage_index: 0,
        }
    }

    #[test]
    fn prefers_russian_track() {
        let tracks = vec![track("en", "en"), track("ru", "ru")];
        assert_eq!(select_primary_track(&tracks).unwrap().id, "ru");
    }

    #[test]
    fn falls_back_to_first_track() {
        let tracks = vec![track("de", "de"), track("en", "en")];
        assert_eq!(select_primary_track(&tracks).unwrap().id, "de");
    }

    #[test]
    fn rejects_empty_tracks() {
        assert!(matches!(
            select_primary_track(&[]),
            Err(VkLoadError::SubtitlesNotFound)
        ));
    }

    #[test]
    fn builds_subtitle_request_with_user_agent_and_referer() {
        let request = build_subtitle_request(&reqwest::Client::new(), &track("ru", "ru")).unwrap();

        assert_eq!(request.headers()[USER_AGENT], "Mozilla/5.0");
        assert_eq!(request.headers()[REFERER], "https://vk.com/");
    }
}
