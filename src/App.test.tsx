import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LoadedVideo } from "@/lib/subtitles/types";

import App from "./App";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("@/components/video-player", () => ({
  VideoPlayer: ({
    embedUrl,
    onTimeUpdate,
  }: {
    embedUrl: string;
    onTimeUpdate: (timeMs: number) => void;
  }) => (
    <div>
      <div>Player: {embedUrl}</div>
      <button type="button" onClick={() => onTimeUpdate(500)}>
        advance video
      </button>
    </div>
  ),
}));

function loadedVideo(overrides: Partial<LoadedVideo> = {}): LoadedVideo {
  return {
    videoId: {
      ownerId: -1,
      videoId: 2,
    },
    embedUrl: "https://vk.com/video_ext.php?oid=-1&id=2&hash=abc",
    tracks: [],
    selectedTrackId: "track-1",
    subtitleText: [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:01.000",
      "Hello from VK",
    ].join("\n"),
    ...overrides,
  };
}

describe("App", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  it("loads a VK video, parses subtitles, and renders the player", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockResolvedValue(loadedVideo());

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "  https://vkvideo.ru/video-1_2  ");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(mocks.invoke).toHaveBeenCalledWith("load_video_from_url", {
      url: "https://vkvideo.ru/video-1_2",
    });
    expect(await screen.findByText(/video_ext\.php/)).toBeInTheDocument();
    expect(screen.getByText("Loaded subtitles")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "advance video" }));

    expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "from" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VK" })).toBeInTheDocument();
  });

  it("maps serialized subtitle-not-found backend errors to a user-facing message", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockRejectedValue(
      JSON.stringify({
        kind: "subtitles-not-found",
        message: "subtitles-not-found",
      }),
    );

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(
      await screen.findByText("Subtitles were not found for this video."),
    ).toBeInTheDocument();
  });

  it("shows a subtitle parse error when loaded subtitle text has no cues", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockResolvedValue(
      loadedVideo({
        subtitleText: "WEBVTT\n\nNOTE no cues here",
      }),
    );

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(
      await screen.findByText("Subtitles could not be parsed for this video."),
    ).toBeInTheDocument();
  });
});
