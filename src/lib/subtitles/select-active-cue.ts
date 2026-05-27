import type { SubtitleCue } from "./types";

export function selectActiveCue(
  cues: readonly SubtitleCue[],
  timeMs: number,
): SubtitleCue | undefined {
  return cues.find((cue) => cue.startMs <= timeMs && timeMs < cue.endMs);
}
