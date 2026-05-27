import { describe, expect, it } from "vitest";

import { cleanWord, parseWebVtt } from "./parse-webvtt";

describe("parseWebVtt", () => {
  it("parses ordinary WebVTT cues with multiline text", () => {
    const cues = parseWebVtt(`WEBVTT

intro
00:00:01.200 --> 00:00:03.400
Hello, world!
Second line.
`);

    expect(cues).toEqual([
      {
        id: "intro",
        startMs: 1200,
        endMs: 3400,
        text: "Hello, world!\nSecond line.",
        words: [
          {
            id: "intro:0",
            text: "Hello,",
            cleanText: "Hello",
          },
          {
            id: "intro:1",
            text: "world!",
            cleanText: "world",
          },
          {
            id: "intro:2",
            text: "Second",
            cleanText: "Second",
          },
          {
            id: "intro:3",
            text: "line.",
            cleanText: "line",
          },
        ],
      },
    ]);
  });

  it("parses SRT cue counters and comma timestamps", () => {
    const cues = parseWebVtt(`1
00:00:00,500 --> 00:00:02,000
First subtitle

2
00:00:02,100 --> 00:00:04,250
Second subtitle
`);

    expect(cues).toMatchObject([
      {
        id: "1",
        startMs: 500,
        endMs: 2000,
        text: "First subtitle",
      },
      {
        id: "2",
        startMs: 2100,
        endMs: 4250,
        text: "Second subtitle",
      },
    ]);
  });

  it("cleans VK inline timestamps and cue tags before display while preserving word timing", () => {
    const cues = parseWebVtt(`WEBVTT

00:00:00.000 --> 00:00:01.500
<c><00:00:00.480>Hello,</c> <00:00:00.900>world!</c>
`);

    expect(cues).toEqual([
      {
        id: "cue-1",
        startMs: 0,
        endMs: 1500,
        text: "Hello, world!",
        words: [
          {
            id: "cue-1:0",
            text: "Hello,",
            cleanText: "Hello",
            startMs: 480,
          },
          {
            id: "cue-1:1",
            text: "world!",
            cleanText: "world",
            startMs: 900,
          },
        ],
      },
    ]);
  });

  it("cleans VK inline minute timestamps with dot and comma milliseconds", () => {
    const cues = parseWebVtt(`WEBVTT

00:00:10.000 --> 00:00:15.000
Ready <00:12.345>set <00:13,500>go.
`);

    expect(cues).toEqual([
      {
        id: "cue-1",
        startMs: 10000,
        endMs: 15000,
        text: "Ready set go.",
        words: [
          {
            id: "cue-1:0",
            text: "Ready",
            cleanText: "Ready",
          },
          {
            id: "cue-1:1",
            text: "set",
            cleanText: "set",
            startMs: 12345,
          },
          {
            id: "cue-1:2",
            text: "go.",
            cleanText: "go",
            startMs: 13500,
          },
        ],
      },
    ]);
  });
});

describe("cleanWord", () => {
  it("strips surrounding punctuation without changing inner punctuation", () => {
    expect(cleanWord("\"(can't-stop!)\"")).toBe("can't-stop");
  });
});
