import { describe, expect, it } from "vitest";

import type { SubtitleCue } from "./types";
import { selectActiveCue } from "./select-active-cue";

describe("selectActiveCue", () => {
  const cues: SubtitleCue[] = [
    {
      id: "first",
      startMs: 1000,
      endMs: 2000,
      text: "First",
      words: [],
    },
    {
      id: "second",
      startMs: 2500,
      endMs: 3000,
      text: "Second",
      words: [],
    },
  ];

  it("returns the cue whose inclusive start and exclusive end contain the time", () => {
    expect(selectActiveCue(cues, 1000)).toBe(cues[0]);
    expect(selectActiveCue(cues, 1999)).toBe(cues[0]);
    expect(selectActiveCue(cues, 2500)).toBe(cues[1]);
  });

  it("returns undefined outside cue ranges and at the exclusive end", () => {
    expect(selectActiveCue(cues, 999)).toBeUndefined();
    expect(selectActiveCue(cues, 2000)).toBeUndefined();
    expect(selectActiveCue(cues, 3000)).toBeUndefined();
  });
});
