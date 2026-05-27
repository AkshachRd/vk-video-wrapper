use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
#[serde(tag = "kind", content = "message")]
pub enum VkLoadError {
    #[error("invalid-link")]
    InvalidLink,
    #[error("video-unavailable")]
    VideoUnavailable,
    #[error("subtitles-not-found")]
    SubtitlesNotFound,
    #[error("subtitle-fetch-failed")]
    SubtitleFetchFailed,
    #[error("subtitle-parse-failed")]
    SubtitleParseFailed,
}

impl From<VkLoadError> for String {
    fn from(value: VkLoadError) -> Self {
        let message = value.to_string();
        serde_json::json!({
            "kind": message.clone(),
            "message": message,
        })
        .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_errors_to_serializable_strings() {
        let error: String = VkLoadError::SubtitlesNotFound.into();

        assert_eq!(
            error,
            r#"{"kind":"subtitles-not-found","message":"subtitles-not-found"}"#
        );
    }
}
