# VK Video Subtitle Track Selection Design

## Goal

Add a simple way to choose which VK-provided subtitle track is rendered by the app overlay. This fixes the current behavior where the backend automatically picks Russian subtitles and changing subtitles inside the VK player does not affect the app overlay.

## Scope

In scope:
- Show a simple subtitle track dropdown after a video is loaded.
- List tracks returned by the existing VK embed metadata extraction.
- Let the user switch the app overlay to another VK subtitle track, such as German.
- Keep subtitle fetching inside the Tauri backend.
- Keep the MVP to one rendered subtitle lane.

Out of scope:
- Machine translation.
- Dual subtitle rendering.
- Dictionary lookup beyond the existing word-only popover.
- Saved words, auth, search, or persistent preferences.
- Controlling VK player's own subtitle menu.

## UX

After a successful video load, the app shows a compact dropdown above the player.

The dropdown label is `Subtitles`. The selected option is the currently rendered subtitle track. Each option uses the clearest available label:

1. `manifestName` when present.
2. Otherwise `title`.
3. Otherwise `lang`.
4. Otherwise the track id.

If `isAuto` is true, append `auto` in the visible label.

When the user chooses another track:
- Disable the dropdown while loading the new subtitle file.
- Keep the current video and current subtitles visible until the new track succeeds.
- On success, parse the new subtitle text and replace the primary lane.
- On failure, keep the previous subtitles and show an alert.

## Backend Design

Add a Tauri command for loading one specific subtitle track:

```rust
load_subtitle_track(video_id: VkVideoId, track_id: String) -> Result<LoadedSubtitleTrack, String>
```

`LoadedSubtitleTrack` returns:

```rust
{
  selectedTrackId: string,
  subtitleText: string
}
```

The command should:
1. Re-fetch VK embed metadata for the supplied `videoId`.
2. Find the track whose generated `id` matches `trackId`.
3. Fetch subtitle text through the existing backend subtitle fetcher.
4. Reuse existing URL allowlist, redirect, timeout, and streaming size-limit protections.

Re-fetching metadata is preferred over reusing the stale signed URL from the frontend because VK subtitle URLs can be temporary.

If the requested track id is not found, return `subtitles-not-found`.

## Frontend Design

`App` keeps the loaded `video`, current `lane`, and selected track id.

On initial `load_video_from_url`, behavior stays the same:
- Backend chooses the default track.
- Frontend parses `subtitleText`.
- Frontend creates the primary `SubtitleLane`.

After load, render a dropdown using a small shadcn-style select primitive or a native select styled like the existing controls. The simplest acceptable MVP is a styled native `<select>` with an accessible label.

On dropdown change:
1. Set track-loading state.
2. Call `invoke<LoadedSubtitleTrack>("load_subtitle_track", { videoId: video.videoId, trackId })`.
3. Parse returned `subtitleText` with `parseWebVtt`.
4. If cues exist, update the primary lane with the new `trackId`.
5. If the backend call or parsing fails, keep the previous lane and show an error message.

## Errors

Track switch errors should not clear the player or existing subtitles.

Use concise user-facing messages:
- Backend `subtitles-not-found`: `This subtitle track is no longer available.`
- Backend `subtitle-fetch-failed`: `The subtitle file could not be downloaded.`
- Backend `subtitle-parse-failed` or frontend empty/throwing parse: `Subtitles could not be parsed for this track.`
- Unknown error: `The subtitle track could not be loaded.`

Initial video load error messages remain unchanged.

## Testing

Backend tests:
- Command finds a requested track by id and returns subtitle text using testable internal assembly where possible.
- Missing track id maps to `SubtitlesNotFound`.
- Existing subtitle URL security tests remain unchanged.

Frontend tests:
- Dropdown appears after successful video load.
- Dropdown lists multiple tracks with readable labels.
- Selecting another track calls `load_subtitle_track` with `videoId` and `trackId`.
- Successful switch updates rendered subtitle words.
- Failed switch keeps the old subtitles and shows an alert.
- Empty or unparsable switched track keeps old subtitles and shows a parse error.

## Acceptance Criteria

- Loading a VK video still works as before.
- If VK exposes multiple subtitle tracks, the user can switch from Russian to German in the app overlay.
- Switching VK player's own subtitle menu is not required and does not control the overlay.
- All existing tests pass.
- New backend and frontend tests cover track selection behavior.
