import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SubtitleCue, SubtitleLane } from "@/lib/subtitles/types";

import { SubtitleReferenceLine } from "./subtitle-reference-line";

const lane: SubtitleLane = {
  role: "secondary",
  source: "vk-track",
  cues: [
    { id: "s0", startMs: 900, endMs: 2800, text: "Привет Макс", words: [] },
    { id: "s1", startMs: 2800, endMs: 4900, text: "Как дела", words: [] },
  ],
};

function primaryCue(startMs: number, endMs: number): SubtitleCue {
  return { id: "p", startMs, endMs, text: "primary", words: [] };
}

describe("SubtitleReferenceLine", () => {
  it("renders the reference cue aligned to the primary cue, not raw time", () => {
    // The primary cue [1000,3000] best overlaps s0, even though raw time near
    // its end (e.g. 2900) would naively land inside s1.
    render(<SubtitleReferenceLine lane={lane} primaryCue={primaryCue(1000, 3000)} />);

    expect(screen.getByText("Привет Макс")).toBeInTheDocument();
    expect(screen.queryByText("Как дела")).not.toBeInTheDocument();
  });

  it("switches with the primary cue", () => {
    render(<SubtitleReferenceLine lane={lane} primaryCue={primaryCue(3000, 5000)} />);

    expect(screen.getByText("Как дела")).toBeInTheDocument();
  });

  it("does not render clickable word buttons", () => {
    render(<SubtitleReferenceLine lane={lane} primaryCue={primaryCue(1000, 3000)} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing when there is no primary cue", () => {
    const { container } = render(<SubtitleReferenceLine lane={lane} primaryCue={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no reference cue overlaps the primary cue", () => {
    const { container } = render(
      <SubtitleReferenceLine lane={lane} primaryCue={primaryCue(8000, 9000)} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
