use regex::Regex;
use serde::{Deserialize, Serialize};
use url::Url;

use super::errors::VkLoadError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VkVideoId {
    pub owner_id: i64,
    pub video_id: i64,
    pub list: Option<String>,
    pub access_key: Option<String>,
}

pub fn parse_vk_video_url(input: &str) -> Result<VkVideoId, VkLoadError> {
    let url = Url::parse(input).map_err(|_| VkLoadError::InvalidLink)?;
    let host = url.host_str().ok_or(VkLoadError::InvalidLink)?;
    if !matches!(
        host,
        "vkvideo.ru" | "www.vkvideo.ru" | "vk.com" | "www.vk.com"
    ) {
        return Err(VkLoadError::InvalidLink);
    }

    let re = Regex::new(r"video(-?\d+)_(\d+)").expect("valid video regex");
    let captures = re
        .captures(url.path())
        .or_else(|| re.captures(url.as_str()))
        .ok_or(VkLoadError::InvalidLink)?;

    let owner_id = captures
        .get(1)
        .and_then(|m| m.as_str().parse::<i64>().ok())
        .ok_or(VkLoadError::InvalidLink)?;
    let video_id = captures
        .get(2)
        .and_then(|m| m.as_str().parse::<i64>().ok())
        .ok_or(VkLoadError::InvalidLink)?;

    let list = url
        .query_pairs()
        .find(|(key, _)| key == "list")
        .map(|(_, value)| value.to_string());
    let access_key = url
        .query_pairs()
        .find(|(key, _)| key == "access_key")
        .map(|(_, value)| value.to_string());

    Ok(VkVideoId {
        owner_id,
        video_id,
        list,
        access_key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vkvideo_url_with_negative_owner() {
        let id = parse_vk_video_url("https://vkvideo.ru/video-145784486_456239038").unwrap();
        assert_eq!(id.owner_id, -145784486);
        assert_eq!(id.video_id, 456239038);
    }

    #[test]
    fn parses_vkvideo_url_with_list_query() {
        let id = parse_vk_video_url(
            "https://vkvideo.ru/video-51890028_456242200?list=ln-Cg6C0nEVR81075JXFU",
        )
        .unwrap();
        assert_eq!(id.owner_id, -51890028);
        assert_eq!(id.video_id, 456242200);
        assert_eq!(id.list.as_deref(), Some("ln-Cg6C0nEVR81075JXFU"));
    }

    #[test]
    fn parses_vk_com_url() {
        let id = parse_vk_video_url("https://vk.com/video-145784486_456239038").unwrap();
        assert_eq!(id.owner_id, -145784486);
        assert_eq!(id.video_id, 456239038);
    }

    #[test]
    fn rejects_non_vk_video_url() {
        assert!(matches!(
            parse_vk_video_url("https://example.com/video-1_2"),
            Err(VkLoadError::InvalidLink)
        ));
    }
}
