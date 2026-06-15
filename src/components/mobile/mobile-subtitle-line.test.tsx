import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileSubtitleLine } from "./mobile-subtitle-line";
import { MobileReadingArea } from "./mobile-reading-area";
import type { SubtitleCue } from "@/lib/subtitles/types";

const cue: SubtitleCue = {
  id: "c1",
  startMs: 0,
  endMs: 1000,
  text: "Hello world",
  words: [
    { id: "w1", text: "Hello", cleanText: "hello" },
    { id: "w2", text: "world", cleanText: "world" },
  ],
};

afterEach(() => {
  // снять подменённый WAAPI-мок, если ставился
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
});

describe("MobileSubtitleLine", () => {
  it("renders one button per word", () => {
    render(<MobileSubtitleLine cue={cue} onWordTap={() => {}} />);
    expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "world" })).toBeInTheDocument();
  });

  it("calls onWordTap with the cue and tapped word", () => {
    const onWordTap = vi.fn();
    render(<MobileSubtitleLine cue={cue} onWordTap={onWordTap} />);
    fireEvent.click(screen.getByRole("button", { name: "world" }));
    expect(onWordTap).toHaveBeenCalledWith(cue, cue.words[1]);
  });

  it("marks the active word", () => {
    render(<MobileSubtitleLine cue={cue} activeWordId="w1" onWordTap={() => {}} />);
    expect(screen.getByRole("button", { name: "Hello" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "world" })).not.toHaveAttribute("data-active");
  });

  it("animates entrance with transform only, never opacity", () => {
    const animateMock = vi.fn();
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animateMock;

    render(<MobileSubtitleLine cue={cue} onWordTap={() => {}} />);

    expect(animateMock).toHaveBeenCalled();
    for (const call of animateMock.mock.calls) {
      const keyframes = call[0] as Array<Record<string, unknown>>;
      for (const frame of keyframes) {
        expect(frame.opacity).toBeUndefined();
        expect(frame).toHaveProperty("transform");
      }
    }
  });
});

describe("MobileReadingArea", () => {
  it("shows the track label and the word line", () => {
    render(<MobileReadingArea cue={cue} trackLabel="EN" onWordTap={() => {}} />);
    expect(screen.getByText("Субтитры · EN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
  });

  it("renders the reference line only when referenceText is given", () => {
    const { rerender } = render(<MobileReadingArea cue={cue} trackLabel="EN" onWordTap={() => {}} />);
    expect(screen.queryByText("Привет мир")).not.toBeInTheDocument();

    rerender(<MobileReadingArea cue={cue} trackLabel="EN" referenceText="Привет мир" onWordTap={() => {}} />);
    expect(screen.getByText("Привет мир")).toBeInTheDocument();
  });
});
