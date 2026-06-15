import type { SubtitleTrack } from "@/lib/subtitles/types";

// Человекочитаемое имя дорожки для выпадашек/списков (desktop-меню и mobile-шторка).
export function formatTrackLabel(track: SubtitleTrack): string {
  const label = track.manifestName || track.title || track.lang || track.id;
  return track.isAuto ? `${label} (авто)` : label;
}
