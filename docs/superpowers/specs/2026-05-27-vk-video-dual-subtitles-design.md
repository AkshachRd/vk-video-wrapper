# VK Video Dual Subtitles MVP Design

Date: 2026-05-27

## Purpose

Build the base for a local Tauri app that lets a user watch a public VK Video with interactive subtitles. The user pastes a VK Video URL, the app loads subtitles from VK's own video data, renders them as clickable words, and shows a small popover containing the clicked word.

The first version is intentionally small. It validates that VK subtitle extraction, player synchronization, and clickable subtitle rendering can work together before adding translation, dictionaries, accounts, or saved vocabulary.

## MVP Scope

The MVP supports only public VK Video links that can be opened without VK login. The input is a single URL pasted by the user.

The app loads one primary subtitle track from VK and renders it in sync with the VK player. Internally, the data model keeps room for a secondary subtitle lane, but the first UI does not expose machine translation or any translation workflow.

The word popover shows only the clicked word. It does not show translation, lemma, examples, notes, or history.

## Out Of Scope

- VK authorization and private videos.
- Searching or browsing VK content.
- Machine translation.
- Dictionary lookup.
- Saving words or learning history.
- Importing local subtitle files.
- Manual subtitle editing.
- Robust handling of every VK player variant.

## VK Video Findings

The official VK API schema for `video.get` exposes video metadata such as `player`, `files`, `episodes`, and related fields, but it does not expose a documented `subtitles` or `captions` field.

The VK iframe player API is available through `https://vk.com/js/api/videoplayer.js`. It requires an iframe URL with `js_api=1` and provides player synchronization primitives such as `timeupdate`, `getCurrentTime()`, and `getDuration()`.

For the provided public videos, `https://vk.com/video_ext.php?oid=<ownerId>&id=<videoId>&hd=2&js_api=1` returns embed HTML containing subtitle metadata:

```json
{
  "has_subtitles": 1,
  "subtitles": [
    {
      "is_auto": true,
      "storage_index": 0,
      "lang": "ru",
      "title": "ru_auto.vtt",
      "url": "https://vkvd...okcdn.ru/...",
      "manifest_name": "Русский"
    }
  ]
}
```

For `https://vkvideo.ru/video-145784486_456239038`, VK returned a Russian subtitle track titled `Nicos Weg (A1).ru.srt`, served as `text/vtt`.

For `https://vkvideo.ru/video-51890028_456242200?list=ln-Cg6C0nEVR81075JXFU`, VK returned a Russian automatic subtitle track titled `ru_auto.vtt`, served as `text/vtt`.

This `video_ext.php -> subtitles[].url` path is not an official API contract. It is acceptable for this MVP as an R&D foundation, with clear fallback states if VK changes the response shape or withholds subtitles.

## Functional Requirements

1. The user can paste a VK Video URL and load it.
2. The app accepts public `vkvideo.ru/video...` and `vk.com/video...` style URLs.
3. The app extracts `ownerId` and `videoId` from the URL.
4. The app fetches the VK embed HTML for the video.
5. The app extracts available subtitle tracks from `subtitles[]`.
6. If a Russian track exists, the app chooses it as the primary track. Otherwise, it chooses the first available track.
7. The app downloads the selected subtitle file through the Tauri backend.
8. The app parses WebVTT/SRT-like text into normalized subtitle cues.
9. The app renders the VK iframe player and synchronizes subtitles with player time.
10. The active subtitle cue is rendered as clickable words.
11. Clicking a word opens a shadcn popover containing only that word.
12. If the link is invalid, the video is unavailable, or subtitles are missing, the app shows a simple error state.

## Non-Functional Requirements

The app should feel like a quiet utility, not a landing page or media portal. The first screen is the working interface: URL input, load action, player area, subtitle overlay, and error/loading states.

The app should keep the first version stable by avoiding speculative product features. Future translation and second-subtitle support should fit the model without appearing as broken or inactive controls in the MVP UI.

The app should treat VK subtitle URLs as temporary. It should fetch them on demand and not persist them as durable references.

## Architecture

### LinkParser

Parses VK Video URLs and returns:

```ts
type VkVideoId = {
  ownerId: number
  videoId: number
  list?: string
  accessKey?: string
}
```

For MVP, `ownerId` and `videoId` are required. `list` and `accessKey` may be preserved for future compatibility but are not required.

### VkEmbedClient

Runs on the Tauri backend. It builds the embed URL:

```text
https://vk.com/video_ext.php?oid=<ownerId>&id=<videoId>&hd=2&js_api=1
```

It fetches the HTML and extracts video metadata and subtitle track metadata. It should not assume that `subtitles[]` is always present.

### SubtitleFetcher

Runs on the Tauri backend. It downloads the selected `subtitles[].url` because direct browser fetch may fail due to missing CORS headers on the VK CDN subtitle response.

It returns raw subtitle text and basic response metadata useful for diagnostics.

### SubtitleParser

Parses raw WebVTT/SRT-like content into normalized cues:

```ts
type SubtitleCue = {
  id: string
  startMs: number
  endMs: number
  text: string
  words: SubtitleWord[]
}

type SubtitleWord = {
  id: string
  text: string
  startMs?: number
  endMs?: number
}
```

For VK automatic WebVTT, cue text can include inline timestamp markup such as `<00:00:00.480><c>word</c>`. The MVP parser must clean this markup for display. Extracting per-word timing from the markup is optional for the first version.

### VkPlayerBridge

Runs in the frontend. It loads `https://vk.com/js/api/videoplayer.js`, creates `VK.VideoPlayer(iframe)`, and listens for `timeupdate` events.

It exposes current playback time in milliseconds to the subtitle overlay.

### SubtitleOverlay

Receives current time and the primary subtitle lane. It finds the active cue and renders the cue text as clickable words. A word click opens a shadcn popover.

The popover displays the cleaned word only. Punctuation should be stripped for the popover value while remaining visible in the subtitle line where practical.

### SubtitleLanes

The internal model supports future dual subtitles:

```ts
type SubtitleLane = {
  role: 'primary' | 'secondary'
  source: 'vk-track' | 'machine-translation'
  trackId?: string
  cues: SubtitleCue[]
}
```

The MVP creates only the `primary` lane. A future version can attach a second VK track or a machine-translation provider to the `secondary` lane without changing the player or overlay contract.

## Data Flow

1. User pastes a VK Video URL and clicks Load.
2. Frontend calls a Tauri command such as `load_video_from_url(url)`.
3. Backend parses the URL.
4. Backend fetches `video_ext.php`.
5. Backend extracts available subtitle tracks.
6. Backend selects the first Russian track, or the first track if Russian is unavailable.
7. Backend downloads the selected subtitle URL.
8. Backend returns video metadata, track metadata, selected track id, and raw subtitle text.
9. Frontend parses the subtitles into cues and words.
10. Frontend renders the VK iframe with `js_api=1`.
11. Frontend initializes `VK.VideoPlayer`.
12. `timeupdate` drives active cue selection.
13. User clicks a word and sees a popover containing the word.

## UI Requirements

The first screen contains:

- Compact URL input.
- Load button.
- VK video player area.
- Subtitle area over the video or immediately under it if overlay is unstable in Tauri WebView2.
- Loading state.
- Error state.
- Word popover.

Recommended shadcn components:

- `Input`
- `Button`
- `Popover`
- `Alert`
- Optional loading indicator or skeleton if already convenient.

Subtitle text should prioritize readability: white text, dark translucent background, hover/focus affordance for clickable words, and no layout shift when words are hovered or clicked.

## Error Handling

The app should distinguish these error categories:

- `invalid-link`: the URL cannot be parsed into a VK video id.
- `video-unavailable`: the embed HTML cannot be fetched or indicates unavailable content.
- `subtitles-not-found`: no usable `subtitles[]` track exists.
- `subtitle-fetch-failed`: the subtitle URL cannot be downloaded.
- `subtitle-parse-failed`: raw subtitle text cannot be parsed into cues.
- `player-init-failed`: the VK iframe player bridge cannot initialize.

Errors should be shown in plain user-facing language. Detailed diagnostics can remain in logs.

## Testing Strategy

Tests should cover the contracts most likely to break:

- `LinkParser` with `vkvideo.ru/video-145784486_456239038`, `vkvideo.ru/video-51890028_456242200?list=ln-Cg6C0nEVR81075JXFU`, `vk.com/video...`, and invalid URLs.
- `VkEmbedClient` against fixture HTML containing `subtitles[]`, fixture HTML without subtitles, and malformed subtitle metadata.
- `SubtitleParser` with ordinary WebVTT, VK automatic WebVTT with inline timestamps, multi-line cues, and cue text containing punctuation.
- `SubtitleOverlay` cue selection by `timeMs` and word click behavior.

Manual verification should use the two known public VK Video examples from this spec.

## Risks

The subtitle metadata path is undocumented and may change.

VK CDN subtitle URLs are signed and temporary, so cached subtitle URLs can expire or stop working.

Subtitle URL fetches may fail in the browser due to CORS, so the backend must own subtitle downloading.

VK iframe behavior in Tauri WebView2 may differ from a normal browser, especially around autoplay, fullscreen, and keyboard focus.

Not all public videos have subtitles.

Automatic VK subtitles may include inline timing markup that requires cleanup before display.

## Accepted MVP Trade-Offs

The MVP accepts dependence on `video_ext.php` because it is the only observed source that provides VK-owned subtitle URLs for the target use case.

The MVP does not expose translation or second subtitle selection in UI, even though the internal lane model is designed for it.

The MVP focuses on proving the core pipeline: public link, VK subtitle extraction, subtitle parsing, player synchronization, clickable words, and simple popover.
