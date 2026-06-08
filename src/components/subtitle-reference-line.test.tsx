import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SubtitleLane } from "@/lib/subtitles/types";

import { SubtitleReferenceLine } from "./subtitle-reference-line";

const lane: SubtitleLane = {
  role: "secondary",
  source: "vk-track",
  cues: [
    {
      id: "c0",
      startMs: 1000,
      endMs: 5000,
      text: "Я сегодня иду в кино",
      words: [
        { id: "c0w0", text: "Я", cleanText: "я" },
        { id: "c0w1", text: "сегодня", cleanText: "сегодня" },
      ],
    },
    {
      id: "c1",
      startMs: 6000,
      endMs: 7000,
      text: "Завтра тоже",
      words: [{ id: "c1w0", text: "Завтра", cleanText: "завтра" }],
    },
  ],
};

describe("SubtitleReferenceLine", () => {
  it("renders the active cue as plain text", () => {
    render(<SubtitleReferenceLine lane={lane} timeMs={1200} />);

    expect(screen.getByText("Я сегодня иду в кино")).toBeInTheDocument();
  });

  it("does not render clickable word buttons", () => {
    render(<SubtitleReferenceLine lane={lane} timeMs={1200} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing when no cue is active", () => {
    const { container } = render(<SubtitleReferenceLine lane={lane} timeMs={800} />);

    expect(container).toBeEmptyDOMElement();
  });
});
