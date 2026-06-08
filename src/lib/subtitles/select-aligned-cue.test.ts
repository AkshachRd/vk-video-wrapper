import { describe, expect, it } from "vitest";

import { selectAlignedCue } from "./select-aligned-cue";
import type { SubtitleCue } from "./types";

function cue(id: string, startMs: number, endMs: number): SubtitleCue {
  return { id, startMs, endMs, text: id, words: [] };
}

describe("selectAlignedCue", () => {
  it("returns the cue with the greatest overlap with the target window", () => {
    const cues = [cue("a", 900, 2800), cue("b", 2800, 4900)];

    expect(selectAlignedCue(cues, { startMs: 1000, endMs: 3000 })?.id).toBe("a");
    expect(selectAlignedCue(cues, { startMs: 3000, endMs: 5000 })?.id).toBe("b");
  });

  it("prefers the larger-overlap cue when the target spans two cues", () => {
    const cues = [cue("short", 1000, 1500), cue("long", 1500, 4000)];

    expect(selectAlignedCue(cues, { startMs: 1000, endMs: 4000 })?.id).toBe("long");
  });

  it("treats a boundary touch as no match", () => {
    const cues = [cue("a", 0, 1000), cue("b", 2000, 3000)];

    expect(selectAlignedCue(cues, { startMs: 1000, endMs: 2000 })).toBeUndefined();
  });

  it("returns undefined when there are no cues", () => {
    expect(selectAlignedCue([], { startMs: 0, endMs: 1000 })).toBeUndefined();
  });
});
