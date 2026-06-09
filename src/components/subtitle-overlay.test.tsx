import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubtitleLane } from "@/lib/subtitles/types";

import { SubtitleOverlay } from "./subtitle-overlay";
import { VideoPlayer } from "./video-player";

const mocks = vi.hoisted(() => ({
  createVkPlayerBridge: vi.fn(),
  loadVkPlayerScript: vi.fn(),
  selectActiveCue: vi.fn(),
}));

vi.mock("@/lib/vk-player/vk-player-bridge", () => ({
  createVkPlayerBridge: mocks.createVkPlayerBridge,
  loadVkPlayerScript: mocks.loadVkPlayerScript,
}));

vi.mock("@/lib/subtitles/select-active-cue", () => ({
  selectActiveCue: mocks.selectActiveCue,
}));

const lane: SubtitleLane = {
  role: "primary",
  source: "vk-track",
  cues: [
    {
      id: "cue-0",
      startMs: 1000,
      endMs: 5000,
      text: "Доброе утро!",
      words: [
        { id: "w1", text: "Доброе", cleanText: "Доброе" },
        { id: "w2", text: "утро!", cleanText: "утро" },
      ],
    },
    {
      id: "cue-1",
      startMs: 6000,
      endMs: 7000,
      text: "Добрый вечер.",
      words: [{ id: "w3", text: "вечер.", cleanText: "вечер" }],
    },
  ],
};

describe("SubtitleOverlay", () => {
  beforeEach(() => {
    mocks.createVkPlayerBridge.mockReset();
    mocks.loadVkPlayerScript.mockReset();
    mocks.selectActiveCue.mockReset();
    mocks.selectActiveCue.mockImplementation((cues: SubtitleLane["cues"], timeMs: number) =>
      cues.find((cue) => cue.startMs <= timeMs && timeMs < cue.endMs),
    );
  });

  it("renders active cue words as buttons and omits inactive cue words", () => {
    render(<SubtitleOverlay lane={lane} timeMs={1200} />);

    expect(mocks.selectActiveCue).toHaveBeenCalledWith(lane.cues, 1200);
    expect(screen.getByRole("button", { name: "Доброе" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "утро!" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "вечер." })).not.toBeInTheDocument();
  });

  it("opens a popover with the cleaned word", async () => {
    const user = userEvent.setup();
    render(<SubtitleOverlay lane={lane} timeMs={1200} />);

    await user.click(screen.getByRole("button", { name: "утро!" }));

    expect(screen.getByRole("dialog", { name: "Word details: утро" })).toBeInTheDocument();
    expect(screen.getByText("утро")).toBeInTheDocument();
  });

  it("notifies when a word is clicked with the active cue and clicked word", async () => {
    const user = userEvent.setup();
    const onWordInspect = vi.fn();
    render(<SubtitleOverlay lane={lane} timeMs={1200} onWordInspect={onWordInspect} />);

    await user.click(screen.getByRole("button", { name: "Доброе" }));

    expect(onWordInspect).toHaveBeenCalledWith(lane.cues[0], lane.cues[0].words[0]);
  });

  it("does not inspect a word again when clicking its already-open trigger to close", async () => {
    const user = userEvent.setup();
    const onWordInspect = vi.fn();
    const onWordInspectEnd = vi.fn();
    render(
      <SubtitleOverlay
        lane={lane}
        timeMs={1200}
        onWordInspect={onWordInspect}
        onWordInspectEnd={onWordInspectEnd}
      />,
    );

    const button = screen.getByRole("button", { name: "Доброе" });
    await user.click(button);
    await user.click(button);

    expect(onWordInspect).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onWordInspectEnd).toHaveBeenCalledTimes(1);
    });
  });

  it("renders lookup state inside an open word popover", async () => {
    const user = userEvent.setup();
    render(
      <SubtitleOverlay
        lane={lane}
        timeMs={1200}
        wordLookup={{ status: "loading", query: "утро" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "утро!" }));

    expect(screen.getByText("Ищу в словаре...")).toBeInTheDocument();
  });

  it("shows save controls from the word save callback inside an open popover", async () => {
    const user = userEvent.setup();
    render(
      <SubtitleOverlay
        lane={lane}
        timeMs={1200}
        getWordSaveControl={(_cue, _word, fallbackWord) =>
          fallbackWord === "утро" ? { status: "unsaved", onToggle: vi.fn() } : undefined
        }
      />,
    );

    await user.click(screen.getByRole("button", { name: "утро!" }));

    expect(screen.getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
  });

  it("does not show lookup state for a different word", async () => {
    const user = userEvent.setup();
    render(
      <SubtitleOverlay
        lane={lane}
        timeMs={1200}
        wordLookup={{ status: "loading", query: "Доброе" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "утро!" }));

    expect(screen.queryByText("Ищу в словаре...")).not.toBeInTheDocument();
    expect(screen.getByText("утро")).toBeInTheDocument();
  });

  it("notifies when a word popover closes", async () => {
    const user = userEvent.setup();
    const onWordInspectEnd = vi.fn();
    render(<SubtitleOverlay lane={lane} timeMs={1200} onWordInspectEnd={onWordInspectEnd} />);

    await user.click(screen.getByRole("button", { name: "Доброе" }));
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(onWordInspectEnd).toHaveBeenCalledTimes(1);
    });
  });

  it("renders nothing when no cue is active", () => {
    render(<SubtitleOverlay lane={lane} timeMs={800} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("VideoPlayer", () => {
  beforeEach(() => {
    mocks.createVkPlayerBridge.mockReset();
    mocks.loadVkPlayerScript.mockReset();
    mocks.selectActiveCue.mockReset();
  });

  it("renders the VK iframe with js_api enabled", () => {
    render(
      <VideoPlayer
        embedUrl="https://vk.com/video_ext.php?oid=1&id=2"
        onTimeUpdate={vi.fn()}
      />,
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("VK Video player");
    const src = new URL(iframe.src);

    expect(src.searchParams.get("oid")).toBe("1");
    expect(src.searchParams.get("id")).toBe("2");
    expect(src.searchParams.get("js_api")).toBe("1");
  });

  it("loads the VK script, initializes the bridge with all callbacks, and cleans up on unmount", async () => {
    const destroy = vi.fn();
    const controls = { destroy, play: vi.fn(), pause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), mute: vi.fn(), unmute: vi.fn() };
    const onTimeUpdate = vi.fn();
    const onControlsReady = vi.fn();
    mocks.loadVkPlayerScript.mockResolvedValue(undefined);
    mocks.createVkPlayerBridge.mockReturnValue(controls);

    const { unmount } = render(
      <VideoPlayer
        embedUrl="https://vk.com/video_ext.php?oid=1&id=2"
        onTimeUpdate={onTimeUpdate}
        onControlsReady={onControlsReady}
      />,
    );
    const iframe = screen.getByTitle<HTMLIFrameElement>("VK Video player");

    await waitFor(() => {
      expect(mocks.createVkPlayerBridge).toHaveBeenCalledWith(
        expect.objectContaining({ iframe, onTimeUpdate }),
      );
    });
    expect(onControlsReady).toHaveBeenCalledWith(controls);

    unmount();

    expect(onControlsReady).toHaveBeenLastCalledWith(undefined);
    expect(destroy).toHaveBeenCalled();
  });

  it("blocks iframe pointer input when blockInput is set", () => {
    render(
      <VideoPlayer
        embedUrl="https://vk.com/video_ext.php?oid=1&id=2"
        onTimeUpdate={vi.fn()}
        blockInput
      />,
    );

    expect(screen.getByTitle("VK Video player").className).toContain("pointer-events-none");
  });
});
