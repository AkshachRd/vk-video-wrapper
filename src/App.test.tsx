import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LoadedVideo } from "@/lib/subtitles/types";

import App from "./App";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  parseWebVtt: vi.fn(),
  pausePlayer: vi.fn(),
  emitTimeUpdate: vi.fn(),
  readyPlayer: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("@/lib/subtitles/parse-webvtt", () => ({
  parseWebVtt: mocks.parseWebVtt,
}));

vi.mock("@/components/video-player", () => ({
  VideoPlayer: ({
    embedUrl,
    onTimeUpdate,
    onControlsReady,
  }: {
    embedUrl: string;
    onTimeUpdate: (timeMs: number) => void;
    onControlsReady?: (controls: { pause: () => void } | undefined) => void;
  }) => {
    mocks.emitTimeUpdate.mockImplementation(onTimeUpdate);
    mocks.readyPlayer.mockImplementation(() => onControlsReady?.({ pause: mocks.pausePlayer }));

    return (
      <div>
        <div>Player: {embedUrl}</div>
        <button type="button" onClick={() => onControlsReady?.({ pause: mocks.pausePlayer })}>
          ready player
        </button>
        <button type="button" onClick={() => onTimeUpdate(500)}>
          advance video
        </button>
        <button type="button" onClick={() => onTimeUpdate(1000)}>
          advance to next subtitle
        </button>
        <button type="button" onClick={() => onTimeUpdate(1200)}>
          late player tick
        </button>
      </div>
    );
  },
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

const subtitleTracks: LoadedVideo["tracks"] = [
  {
    id: "ru_0_ru.vtt",
    lang: "ru",
    title: "ru.vtt",
    manifestName: "Русский",
    isAuto: false,
    storageIndex: 0,
    url: "https://vkvd737.okcdn.ru/ru.vtt",
  },
  {
    id: "de_1_de.vtt",
    lang: "de",
    title: "de.vtt",
    manifestName: "Deutsch",
    isAuto: false,
    storageIndex: 1,
    url: "https://vkvd737.okcdn.ru/de.vtt",
  },
  {
    id: "ru_2_ru_auto.vtt",
    lang: "ru",
    title: "ru_auto.vtt",
    manifestName: "",
    isAuto: true,
    storageIndex: 2,
    url: "https://vkvd737.okcdn.ru/ru-auto.vtt",
  },
];

describe("App", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.parseWebVtt.mockReset();
    mocks.pausePlayer.mockReset();
    mocks.emitTimeUpdate.mockReset();
    mocks.readyPlayer.mockReset();
    mocks.parseWebVtt.mockImplementation((raw: string) => {
      if (raw.includes("Hallo Welt")) {
        return [
          {
            id: "cue-de",
            startMs: 0,
            endMs: 1000,
            text: "Hallo Welt",
            words: [
              { id: "cue-de:0", text: "Hallo", cleanText: "Hallo" },
              { id: "cue-de:1", text: "Welt", cleanText: "Welt" },
            ],
          },
        ];
      }

      if (!raw.includes("Hello from VK")) {
        return [];
      }

      return [
        {
          id: "cue-1",
          startMs: 0,
          endMs: 1000,
          text: "Hello from VK",
          words: [
            { id: "cue-1:0", text: "Hello", cleanText: "Hello" },
            { id: "cue-1:1", text: "from", cleanText: "from" },
            { id: "cue-1:2", text: "VK", cleanText: "VK" },
          ],
        },
        {
          id: "cue-2",
          startMs: 1000,
          endMs: 2000,
          text: "Next subtitle",
          words: [
            { id: "cue-2:0", text: "Next", cleanText: "Next" },
            { id: "cue-2:1", text: "subtitle", cleanText: "subtitle" },
          ],
        },
      ];
    });
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

  it("maps plain string backend errors to a user-facing message", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockRejectedValue("subtitles-not-found");

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

  it("shows a subtitle parse error when subtitle parsing throws", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockResolvedValue(loadedVideo());
    mocks.parseWebVtt.mockImplementationOnce(() => {
      throw new Error("parser failed");
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(
      await screen.findByText("Subtitles could not be parsed for this video."),
    ).toBeInTheDocument();
  });

  it("does not invoke the backend for a blank URL", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "   ");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("disables loading controls and ignores duplicate submits while loading", async () => {
    const user = userEvent.setup();
    let resolveLoad: (video: LoadedVideo) => void = () => {};
    mocks.invoke.mockReturnValue(
      new Promise<LoadedVideo>((resolve) => {
        resolveLoad = resolve;
      }),
    );

    render(<App />);

    const input = screen.getByLabelText("VK Video URL");
    await user.type(input, "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();

    await user.keyboard("{Enter}");

    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    resolveLoad(loadedVideo());

    expect(await screen.findByText("Loaded subtitles")).toBeInTheDocument();
  });

  it("shows a subtitle track dropdown with readable labels after loading", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockResolvedValue(
      loadedVideo({
        tracks: subtitleTracks,
        selectedTrackId: "ru_0_ru.vtt",
      }),
    );

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));

    const select = await screen.findByRole("combobox", { name: "Subtitles" });

    expect(select).toHaveValue("ru_0_ru.vtt");
    expect(screen.getByRole("option", { name: "Русский" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Deutsch" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ru_auto.vtt auto" })).toBeInTheDocument();
  });

  it("loads a selected subtitle track and updates rendered words", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "ru_0_ru.vtt",
          }),
        );
      }

      return Promise.resolve({
        selectedTrackId: "de_1_de.vtt",
        subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
      });
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Subtitles" }), "de_1_de.vtt");

    expect(mocks.invoke).toHaveBeenCalledWith("load_subtitle_track", {
      videoId: { ownerId: -1, videoId: 2 },
      trackId: "de_1_de.vtt",
    });

    await user.click(screen.getByRole("button", { name: "advance video" }));

    expect(await screen.findByRole("button", { name: "Hallo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Welt" })).toBeInTheDocument();
  });

  it("pauses before moving to the next subtitle after a word is clicked", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockResolvedValue(loadedVideo());

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await screen.findByText(/video_ext\.php/);

    act(() => {
      mocks.readyPlayer();
      mocks.emitTimeUpdate(500);
    });

    await user.click(screen.getByRole("button", { name: "Hello" }));

    expect(mocks.pausePlayer).not.toHaveBeenCalled();

    act(() => {
      mocks.emitTimeUpdate(1000);
    });

    expect(mocks.pausePlayer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hello" })).toHaveAttribute("aria-expanded", "true");

    act(() => {
      mocks.emitTimeUpdate(1200);
    });

    expect(mocks.pausePlayer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hello" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("keeps previous subtitles visible when selected track loading fails", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "ru_0_ru.vtt",
          }),
        );
      }

      return Promise.reject(
        JSON.stringify({
          kind: "subtitles-not-found",
          message: "subtitles-not-found",
        }),
      );
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Subtitles" }), "de_1_de.vtt");

    expect(await screen.findByText("This subtitle track is no longer available.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Subtitles" })).toHaveValue("ru_0_ru.vtt");
  });

  it("keeps previous subtitles visible when selected track cannot be parsed", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "ru_0_ru.vtt",
          }),
        );
      }

      return Promise.resolve({
        selectedTrackId: "de_1_de.vtt",
        subtitleText: "WEBVTT\n\nNOTE missing cues",
      });
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Subtitles" }), "de_1_de.vtt");

    expect(await screen.findByText("Subtitles could not be parsed for this track.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Subtitles" })).toHaveValue("ru_0_ru.vtt");
  });
});
