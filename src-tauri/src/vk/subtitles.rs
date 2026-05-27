use super::embed::VkSubtitleTrack;
use super::errors::VkLoadError;
use std::time::Duration;
use url::{Host, Url};

const USER_AGENT_VALUE: &str = "Mozilla/5.0";
const SUBTITLE_REFERER: &str = "https://vk.com/";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_SUBTITLE_BYTES: usize = 2 * 1024 * 1024;
const ALLOWED_SUBTITLE_HOSTS: &[&str] = &["okcdn.ru", "userapi.com", "vk.com", "vkvideo.ru"];

pub fn select_primary_track(tracks: &[VkSubtitleTrack]) -> Result<&VkSubtitleTrack, VkLoadError> {
    tracks
        .iter()
        .find(|track| track.lang.eq_ignore_ascii_case("ru"))
        .or_else(|| tracks.first())
        .ok_or(VkLoadError::SubtitlesNotFound)
}

pub async fn fetch_subtitle_text(track: &VkSubtitleTrack) -> Result<String, VkLoadError> {
    let client = build_subtitle_client()?;
    let request = build_subtitle_request(&client, track)?;
    let response = client
        .execute(request)
        .await
        .map_err(|_| VkLoadError::SubtitleFetchFailed)?;

    ensure_subtitle_response_status(response.status())?;

    let bytes = read_limited_subtitle_bytes(response).await?;
    subtitle_text_from_bytes(&bytes)
}

fn build_subtitle_client() -> Result<reqwest::Client, VkLoadError> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| VkLoadError::SubtitleFetchFailed)
}

fn build_subtitle_request(
    client: &reqwest::Client,
    track: &VkSubtitleTrack,
) -> Result<reqwest::Request, VkLoadError> {
    let url = validate_subtitle_url(&track.url)?;
    client
        .get(url)
        .header(reqwest::header::USER_AGENT, USER_AGENT_VALUE)
        .header(reqwest::header::REFERER, SUBTITLE_REFERER)
        .build()
        .map_err(|_| VkLoadError::SubtitleFetchFailed)
}

fn validate_subtitle_url(input: &str) -> Result<Url, VkLoadError> {
    let url = Url::parse(input).map_err(|_| VkLoadError::SubtitleFetchFailed)?;
    if url.scheme() != "https" {
        return Err(VkLoadError::SubtitleFetchFailed);
    }

    let allowed = matches!(
        url.host(),
        Some(Host::Domain(host)) if is_allowed_subtitle_host(host)
    );
    if !allowed {
        return Err(VkLoadError::SubtitleFetchFailed);
    }

    Ok(url)
}

fn is_allowed_subtitle_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    ALLOWED_SUBTITLE_HOSTS
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
}

fn ensure_subtitle_response_status(status: reqwest::StatusCode) -> Result<(), VkLoadError> {
    if status.is_success() {
        Ok(())
    } else {
        Err(VkLoadError::SubtitleFetchFailed)
    }
}

async fn read_limited_subtitle_bytes(
    mut response: reqwest::Response,
) -> Result<Vec<u8>, VkLoadError> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| VkLoadError::SubtitleFetchFailed)?
    {
        append_subtitle_chunk(&mut bytes, &chunk)?;
    }
    Ok(bytes)
}

fn append_subtitle_chunk(bytes: &mut Vec<u8>, chunk: &[u8]) -> Result<(), VkLoadError> {
    let next_len = bytes
        .len()
        .checked_add(chunk.len())
        .ok_or(VkLoadError::SubtitleFetchFailed)?;
    if next_len > MAX_SUBTITLE_BYTES {
        return Err(VkLoadError::SubtitleFetchFailed);
    }

    bytes.extend_from_slice(chunk);
    Ok(())
}

fn subtitle_text_from_bytes(bytes: &[u8]) -> Result<String, VkLoadError> {
    if bytes.len() > MAX_SUBTITLE_BYTES {
        return Err(VkLoadError::SubtitleFetchFailed);
    }

    String::from_utf8(bytes.to_vec()).map_err(|_| VkLoadError::SubtitleParseFailed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vk::embed::VkSubtitleTrack;
    use crate::vk::errors::VkLoadError;
    use reqwest::header::{REFERER, USER_AGENT};

    fn track(id: &str, lang: &str) -> VkSubtitleTrack {
        track_with_url(
            id,
            lang,
            &format!("https://vkvd737.okcdn.ru/subtitles/{id}.vtt"),
        )
    }

    fn track_with_url(id: &str, lang: &str, url: &str) -> VkSubtitleTrack {
        VkSubtitleTrack {
            id: id.to_string(),
            lang: lang.to_string(),
            title: format!("{lang}.vtt"),
            url: url.to_string(),
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

    #[test]
    fn accepts_expected_subtitle_hosts() {
        for url in [
            "https://vkvd737.okcdn.ru/subtitles/ru.vtt",
            "https://psv4.userapi.com/subtitles/ru.vtt",
            "https://vk.com/subtitles/ru.vtt",
            "https://static.vk.com/subtitles/ru.vtt",
            "https://vkvideo.ru/subtitles/ru.vtt",
            "https://cdn.vkvideo.ru/subtitles/ru.vtt",
        ] {
            assert!(validate_subtitle_url(url).is_ok(), "{url}");
        }
    }

    #[test]
    fn rejects_untrusted_subtitle_urls() {
        for url in [
            "http://vkvd737.okcdn.ru/subtitles/ru.vtt",
            "https://localhost/subtitles/ru.vtt",
            "https://127.0.0.1/subtitles/ru.vtt",
            "https://[::1]/subtitles/ru.vtt",
            "https://10.0.0.1/subtitles/ru.vtt",
            "https://172.16.0.1/subtitles/ru.vtt",
            "https://192.168.1.10/subtitles/ru.vtt",
            "https://169.254.1.1/subtitles/ru.vtt",
            "https://[fe80::1]/subtitles/ru.vtt",
            "https://example.com/subtitles/ru.vtt",
            "https://okcdn.ru.evil.example/subtitles/ru.vtt",
        ] {
            assert!(
                matches!(
                    validate_subtitle_url(url),
                    Err(VkLoadError::SubtitleFetchFailed)
                ),
                "{url}"
            );
        }
    }

    #[test]
    fn rejects_untrusted_host_before_building_request() {
        let track = track_with_url("bad", "ru", "https://example.com/bad.vtt");

        assert!(matches!(
            build_subtitle_request(&reqwest::Client::new(), &track),
            Err(VkLoadError::SubtitleFetchFailed)
        ));
    }

    #[test]
    fn rejects_redirect_statuses() {
        assert!(matches!(
            ensure_subtitle_response_status(reqwest::StatusCode::FOUND),
            Err(VkLoadError::SubtitleFetchFailed)
        ));
    }

    #[test]
    fn converts_bounded_subtitle_bytes_to_text() {
        let text = subtitle_text_from_bytes(b"WEBVTT\n\nhello").unwrap();

        assert_eq!(text, "WEBVTT\n\nhello");
    }

    #[test]
    fn rejects_oversized_subtitle_bytes() {
        let bytes = vec![b'a'; MAX_SUBTITLE_BYTES + 1];

        assert!(matches!(
            subtitle_text_from_bytes(&bytes),
            Err(VkLoadError::SubtitleFetchFailed)
        ));
    }

    #[test]
    fn accumulates_subtitle_chunks_until_limit() {
        let mut bytes = Vec::new();

        append_subtitle_chunk(&mut bytes, b"WEB").unwrap();
        append_subtitle_chunk(&mut bytes, b"VTT").unwrap();

        assert_eq!(bytes, b"WEBVTT");
    }

    #[test]
    fn rejects_chunk_that_would_exceed_limit_without_appending() {
        let mut bytes = vec![b'a'; MAX_SUBTITLE_BYTES - 1];

        assert!(matches!(
            append_subtitle_chunk(&mut bytes, b"aa"),
            Err(VkLoadError::SubtitleFetchFailed)
        ));
        assert_eq!(bytes.len(), MAX_SUBTITLE_BYTES - 1);
    }

    #[test]
    fn builds_subtitle_client() {
        assert!(build_subtitle_client().is_ok());
    }
}
