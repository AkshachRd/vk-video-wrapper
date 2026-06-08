import type { SubtitleCue } from "./types";

/**
 * Pick the cue that best lines up with a target time window (typically the
 * active cue of another lane). Two subtitle tracks for the same video rarely
 * share identical cue boundaries, so matching the second lane by raw time makes
 * it drift ahead of or behind the primary lane. Choosing the cue with the
 * greatest overlap keeps the second lane in step with the primary cue it
 * translates.
 *
 * Returns undefined when no cue overlaps the window (a boundary touch counts as
 * zero overlap, not a match).
 */
export function selectAlignedCue(
  cues: readonly SubtitleCue[],
  target: { startMs: number; endMs: number },
): SubtitleCue | undefined {
  let best: SubtitleCue | undefined;
  let bestOverlap = 0;

  for (const cue of cues) {
    const overlap = Math.min(cue.endMs, target.endMs) - Math.max(cue.startMs, target.startMs);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = cue;
    }
  }

  return best;
}
