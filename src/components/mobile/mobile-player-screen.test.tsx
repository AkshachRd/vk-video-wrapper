import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/video-player", () => ({
  VideoPlayer: () => <div data-testid="video-player" />,
}));

import { MobilePlayerScreen } from "./mobile-player-screen";
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

const baseProps = {
  embedUrl: "https://vk.com/video_ext.php",
  title: "Doc",
  cue,
  trackLabel: "EN",
  isPlaying: false,
  currentTimeMs: 0,
  durationMs: 120000,
  onTimeUpdate: () => {},
  onPlayPause: () => {},
  onSeek: () => {},
  onWordTap: () => {},
  onBack: () => {},
  onOpenTracks: () => {},
  onOpenSaved: () => {},
  savedWordsCount: 3,
};

describe("MobilePlayerScreen", () => {
  it("mounts the shared VideoPlayer", () => {
    render(<MobilePlayerScreen {...baseProps} />);
    expect(screen.getByTestId("video-player")).toBeInTheDocument();
  });

  it("wires play/pause, captions, back and the saved dock", () => {
    const onPlayPause = vi.fn();
    const onOpenTracks = vi.fn();
    const onBack = vi.fn();
    const onOpenSaved = vi.fn();
    render(
      <MobilePlayerScreen
        {...baseProps}
        onPlayPause={onPlayPause}
        onOpenTracks={onOpenTracks}
        onBack={onBack}
        onOpenSaved={onOpenSaved}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Воспроизвести" }));
    expect(onPlayPause).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Дорожки" }));
    expect(onOpenTracks).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBack).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Мои слова/ }));
    expect(onOpenSaved).toHaveBeenCalled();
  });

  it("renders the reading area with the active cue words", () => {
    const onWordTap = vi.fn();
    render(<MobilePlayerScreen {...baseProps} onWordTap={onWordTap} />);
    fireEvent.click(screen.getByRole("button", { name: "world" }));
    expect(onWordTap).toHaveBeenCalledWith(cue, cue.words[1]);
  });
});
