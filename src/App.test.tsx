import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WordLookup } from "@/lib/dictionary/types";
import type { SavedWord } from "@/lib/saved-words/types";
import type { LoadedVideo } from "@/lib/subtitles/types";

import App from "./App";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  parseWebVtt: vi.fn(),
  pausePlayer: vi.fn(),
  emitTimeUpdate: vi.fn(),
  emitPlaybackStart: vi.fn(),
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
    onPlaybackStart,
    onControlsReady,
  }: {
    embedUrl: string;
    onTimeUpdate: (timeMs: number) => void;
    onPlaybackStart?: () => void;
    onControlsReady?: (controls: { pause: () => void } | undefined) => void;
  }) => {
    mocks.emitTimeUpdate.mockImplementation(onTimeUpdate);
    mocks.emitPlaybackStart.mockImplementation(() => onPlaybackStart?.());
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
    selectedTrackId: "",
    subtitleText: [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:01.000",
      "Hello from VK",
    ].join("\n"),
    ...overrides,
  };
}

function wordLookup(overrides: Partial<WordLookup> = {}): WordLookup {
  return {
    query: "Hallo",
    headword: "hallo",
    language: "de",
    languageName: "Немецкий",
    ipa: null,
    partOfSpeech: null,
    grammar: [],
    meanings: ["привет"],
    source: "ruwiktionary-kaikki",
    sourceUrl: null,
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

const englishTrack: LoadedVideo["tracks"][number] = {
  id: "en_3_en.vtt",
  lang: "en-US",
  title: "en.vtt",
  manifestName: "English",
  isAuto: false,
  storageIndex: 3,
  url: "https://vkvd737.okcdn.ru/en.vtt",
};

const frenchTrack: LoadedVideo["tracks"][number] = {
  id: "fr_4_fr.vtt",
  lang: "fr",
  title: "fr.vtt",
  manifestName: "French",
  isAuto: false,
  storageIndex: 4,
  url: "https://vkvd737.okcdn.ru/fr.vtt",
};

describe("App", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.parseWebVtt.mockReset();
    mocks.pausePlayer.mockReset();
    mocks.emitTimeUpdate.mockReset();
    mocks.emitPlaybackStart.mockReset();
    mocks.readyPlayer.mockReset();
    mocks.parseWebVtt.mockImplementation((raw: string) => {
      if (raw.includes("Hallo Welt")) {
        const cues = [
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

        if (raw.includes("Weiter")) {
          cues.push({
            id: "cue-de-2",
            startMs: 1000,
            endMs: 2000,
            text: "Weiter",
            words: [{ id: "cue-de-2:0", text: "Weiter", cleanText: "Weiter" }],
          });
        }

        return cues;
      }

      if (raw.includes("Hello house")) {
        return [
          {
            id: "cue-en",
            startMs: 0,
            endMs: 1000,
            text: "Hello house",
            words: [
              { id: "cue-en:0", text: "Hello", cleanText: "Hello" },
              { id: "cue-en:1", text: "house", cleanText: "house" },
            ],
          },
        ];
      }

      if (raw.includes("Это дом")) {
        return [
          {
            id: "cue-ru",
            startMs: 0,
            endMs: 1000,
            text: "Это дом",
            words: [
              { id: "cue-ru:0", text: "Это", cleanText: "Это" },
              { id: "cue-ru:1", text: "дом", cleanText: "дом" },
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
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") {
        return Promise.resolve([]);
      }

      return Promise.resolve(loadedVideo());
    });
  });

  it("loads a VK video, parses subtitles, and renders the player", async () => {
    const user = userEvent.setup();

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

  it("loads saved words on startup and renders them beside the player", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") {
        return Promise.resolve([
          {
            id: "de:welt",
            normalizedWord: "welt",
            displayWord: "Welt",
            language: "de",
            languageName: "Немецкий",
            firstMeaning: "мир",
            source: "ruwiktionary-kaikki",
            sourceUrl: null,
            createdAtMs: 1000,
            updatedAtMs: 1000,
          },
        ]);
      }
      if (command === "load_video_from_url") {
        return Promise.resolve(loadedVideo());
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(await screen.findByRole("region", { name: "Сохраненные слова" })).toBeInTheDocument();
    expect(screen.getByText("Welt")).toBeInTheDocument();
    expect(screen.getByText("мир")).toBeInTheDocument();
  });

  it("saves a ready lookup word and updates the saved words panel", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "de_1_de.vtt",
            subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
          }),
        );
      }
      if (command === "lookup_word") {
        return Promise.resolve(wordLookup({
          query: "Welt",
          headword: "Welt",
          meanings: ["мир"],
        }));
      }
      if (command === "save_word") {
        return Promise.resolve({
          id: "de:welt",
          normalizedWord: "welt",
          displayWord: "Welt",
          language: "de",
          languageName: "Немецкий",
          firstMeaning: "мир",
          source: "ruwiktionary-kaikki",
          sourceUrl: null,
          createdAtMs: 1000,
          updatedAtMs: 1000,
        });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "Welt" }));
    await screen.findByText("мир");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(mocks.invoke).toHaveBeenCalledWith("save_word", {
      payload: {
        displayWord: "Welt",
        language: "de",
        languageName: "Немецкий",
        firstMeaning: "мир",
        source: "ruwiktionary-kaikki",
        sourceUrl: null,
      },
    });
    expect(await screen.findByText("Сохранено")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Сохраненные слова" })).toHaveTextContent("Welt");
  });

  it("keeps a confirmed save when delayed startup saved words resolve later", async () => {
    const user = userEvent.setup();
    let resolveSavedWords: (words: SavedWord[]) => void = () => {};

    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") {
        return new Promise<SavedWord[]>((resolve) => {
          resolveSavedWords = resolve;
        });
      }
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "de_1_de.vtt",
            subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
          }),
        );
      }
      if (command === "lookup_word") {
        return Promise.resolve(wordLookup({
          query: "Welt",
          headword: "Welt",
          meanings: ["мир"],
        }));
      }
      if (command === "save_word") {
        return Promise.resolve({
          id: "de:welt",
          normalizedWord: "welt",
          displayWord: "Welt",
          language: "de",
          languageName: "Немецкий",
          firstMeaning: "мир",
          source: "ruwiktionary-kaikki",
          sourceUrl: null,
          createdAtMs: 1000,
          updatedAtMs: 1000,
        });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "Welt" }));
    await screen.findByText("мир");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    const savedWordsPanel = screen.getByRole("region", { name: "Сохраненные слова" });
    expect(await screen.findByText("Сохранено")).toBeInTheDocument();
    expect(savedWordsPanel).toHaveTextContent("Welt");

    await act(async () => {
      resolveSavedWords([]);
    });

    expect(screen.getByRole("region", { name: "Сохраненные слова" })).toHaveTextContent("Welt");
  });

  it("removes a saved word from the popover", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") {
        return Promise.resolve([
          {
            id: "de:welt",
            normalizedWord: "welt",
            displayWord: "Welt",
            language: "de",
            languageName: "Немецкий",
            firstMeaning: "мир",
            source: "ruwiktionary-kaikki",
            sourceUrl: null,
            createdAtMs: 1000,
            updatedAtMs: 1000,
          },
        ]);
      }
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "de_1_de.vtt",
            subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
          }),
        );
      }
      if (command === "lookup_word") {
        return Promise.resolve(wordLookup({
          query: "Welt",
          headword: "Welt",
          meanings: ["мир"],
        }));
      }
      if (command === "remove_saved_word") {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "Welt" }));
    await user.click(await screen.findByRole("button", { name: "Сохранено" }));

    expect(mocks.invoke).toHaveBeenCalledWith("remove_saved_word", {
      language: "de",
      normalizedWord: "welt",
    });
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Сохраненные слова" })).not.toHaveTextContent("Welt");
    });
  });

  it("shows save failure without closing the popover", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "de_1_de.vtt",
            subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
          }),
        );
      }
      if (command === "lookup_word") {
        return Promise.resolve(wordLookup({
          query: "Welt",
          headword: "Welt",
          meanings: ["мир"],
        }));
      }
      if (command === "save_word") {
        return Promise.reject(JSON.stringify({ kind: "saved-words-unavailable" }));
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "Welt" }));
    await screen.findByText("мир");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("Не удалось сохранить слово")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Word details: Welt" })).toBeInTheDocument();
  });

  it("maps serialized subtitle-not-found backend errors to a user-facing message", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
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

    expect(
      await screen.findByText("Subtitles were not found for this video."),
    ).toBeInTheDocument();
  });

  it("maps plain string backend errors to a user-facing message", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      return Promise.reject("subtitles-not-found");
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(
      await screen.findByText("Subtitles were not found for this video."),
    ).toBeInTheDocument();
  });

  it("shows a subtitle parse error when loaded subtitle text has no cues", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      return Promise.resolve(
        loadedVideo({
          subtitleText: "WEBVTT\n\nNOTE no cues here",
        }),
      );
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(
      await screen.findByText("Subtitles could not be parsed for this video."),
    ).toBeInTheDocument();
  });

  it("shows a subtitle parse error when subtitle parsing throws", async () => {
    const user = userEvent.setup();
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

    expect(mocks.invoke.mock.calls.some(([command]) => command === "load_video_from_url")).toBe(false);
  });

  it("disables loading controls and ignores duplicate submits while loading", async () => {
    const user = userEvent.setup();
    let resolveLoad: (video: LoadedVideo) => void = () => {};
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);

      return new Promise<LoadedVideo>((resolve) => {
        resolveLoad = resolve;
      });
    });

    render(<App />);

    const input = screen.getByLabelText("VK Video URL");
    await user.type(input, "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();

    await user.keyboard("{Enter}");

    expect(mocks.invoke.mock.calls.filter(([command]) => command === "load_video_from_url")).toHaveLength(1);

    resolveLoad(loadedVideo());

    expect(await screen.findByText("Loaded subtitles")).toBeInTheDocument();
  });

  it("shows a subtitle track dropdown with readable labels after loading", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      return Promise.resolve(
        loadedVideo({
          tracks: subtitleTracks,
          selectedTrackId: "ru_0_ru.vtt",
        }),
      );
    });

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
      if (command === "list_saved_words") return Promise.resolve([]);
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

  it("ignores stale subtitle track loads after a new video starts loading", async () => {
    const user = userEvent.setup();
    let loadCount = 0;
    let resolveTrackLoad: (track: { selectedTrackId: string; subtitleText: string }) => void = () => {};

    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") {
        loadCount += 1;

        if (loadCount === 1) {
          return Promise.resolve(
            loadedVideo({
              tracks: subtitleTracks,
              selectedTrackId: "ru_0_ru.vtt",
            }),
          );
        }

        return Promise.resolve(
          loadedVideo({
            videoId: {
              ownerId: -3,
              videoId: 4,
            },
            embedUrl: "https://vk.com/video_ext.php?oid=-3&id=4&hash=def",
            tracks: subtitleTracks,
            selectedTrackId: "ru_0_ru.vtt",
          }),
        );
      }

      if (command === "load_subtitle_track") {
        return new Promise((resolve) => {
          resolveTrackLoad = resolve;
        });
      }

      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    const input = screen.getByLabelText("VK Video URL");
    await user.type(input, "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Subtitles" }), "de_1_de.vtt");

    await user.clear(input);
    await user.type(input, "https://vkvideo.ru/video-3_4");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(await screen.findByText(/oid=-3&id=4/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Subtitles" })).toHaveValue("ru_0_ru.vtt");

    await act(async () => {
      resolveTrackLoad({
        selectedTrackId: "de_1_de.vtt",
        subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
      });
    });

    expect(screen.getByRole("combobox", { name: "Subtitles" })).toHaveValue("ru_0_ru.vtt");
    expect(screen.queryByRole("button", { name: "Hallo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
  });

  it("looks up German words and renders Russian dictionary details", async () => {
    const user = userEvent.setup();
    let resolveLookup: (lookup: WordLookup) => void = () => {};

    mocks.invoke.mockImplementation((command: string) => {
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "de_1_de.vtt",
            subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
          }),
        );
      }

      if (command === "lookup_word") {
        return new Promise((resolve) => {
          resolveLookup = resolve;
        });
      }

      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "Hallo" }));

    expect(screen.getByText("Ищу в словаре...")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith("lookup_word", {
      word: "Hallo",
      cueText: "Hallo Welt",
      trackLang: "de",
    });

    await act(async () => {
      resolveLookup(wordLookup({
        query: "Hallo",
        headword: "hallo",
        ipa: "haˈloː",
        partOfSpeech: "междометие",
        grammar: ["приветствие"],
        sourceUrl: "https://kaikki.org/ruwiktionary/Немецкий/meaning/h/ha/hallo.html",
      }));
    });

    expect(await screen.findByText("Значение")).toBeInTheDocument();
    expect(screen.getByText("привет")).toBeInTheDocument();
    expect(screen.getByText("Грамматика")).toBeInTheDocument();
  });

  it("looks up English words with the universal dictionary command", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: [...subtitleTracks, englishTrack],
            selectedTrackId: "en_3_en.vtt",
            subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello house",
          }),
        );
      }

      if (command === "lookup_word") {
        return Promise.resolve(wordLookup({
          query: "house",
          headword: "house",
          language: "en",
          languageName: "Английский",
          partOfSpeech: "существительное",
          grammar: ["единственное число"],
          meanings: ["дом (сооружение)"],
        }));
      }

      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "house" }));

    expect(mocks.invoke).toHaveBeenCalledWith("lookup_word", {
      word: "house",
      cueText: "Hello house",
      trackLang: "en-US",
    });
    expect(await screen.findByText("дом (сооружение)")).toBeInTheDocument();
  });

  it("looks up Russian words with the universal dictionary command", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "ru_0_ru.vtt",
            subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nЭто дом",
          }),
        );
      }

      if (command === "lookup_word") {
        return Promise.resolve(wordLookup({
          query: "дом",
          headword: "дом",
          language: "ru",
          languageName: "Русский",
          ipa: "dom",
          partOfSpeech: "существительное",
          grammar: ["мужской род"],
          meanings: ["архитектурное сооружение, предназначенное для жилья"],
        }));
      }

      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "дом" }));

    expect(mocks.invoke).toHaveBeenCalledWith("lookup_word", {
      word: "дом",
      cueText: "Это дом",
      trackLang: "ru",
    });
    expect(
      await screen.findByText("архитектурное сооружение, предназначенное для жилья"),
    ).toBeInTheDocument();
  });

  it("shows a not-found dictionary lookup state", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "de_1_de.vtt",
            subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
          }),
        );
      }

      return Promise.reject(JSON.stringify({ kind: "not-found", message: "not-found" }));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "Hallo" }));

    expect(await screen.findByText("Слово не найдено в словаре")).toBeInTheDocument();
  });

  it("shows an unavailable dictionary lookup state", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "de_1_de.vtt",
            subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
          }),
        );
      }

      return Promise.reject(
        JSON.stringify({ kind: "dictionary-unavailable", message: "dictionary-unavailable" }),
      );
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "Hallo" }));

    expect(await screen.findByText("Словарь сейчас недоступен")).toBeInTheDocument();
  });

  it("does not call dictionary lookup for unsupported tracks", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      return Promise.resolve(
        loadedVideo({
          tracks: [frenchTrack],
          selectedTrackId: "fr_4_fr.vtt",
        }),
      );
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "Hello" }));

    expect(screen.getByLabelText("Word details: Hello")).toHaveTextContent("Hello");
    expect(mocks.invoke.mock.calls.some(([command]) => command === "lookup_word")).toBe(false);
  });

  it("saves unsupported-track fallback words with raw track language", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: [frenchTrack],
            selectedTrackId: "fr_4_fr.vtt",
          }),
        );
      }
      if (command === "save_word") {
        return Promise.resolve({
          id: "fr:hello",
          normalizedWord: "hello",
          displayWord: "Hello",
          language: "fr",
          languageName: null,
          firstMeaning: null,
          source: null,
          sourceUrl: null,
          createdAtMs: 1000,
          updatedAtMs: 1000,
        });
      }

      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "Hello" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(mocks.invoke.mock.calls.some(([command]) => command === "lookup_word")).toBe(false);
    expect(mocks.invoke).toHaveBeenCalledWith("save_word", {
      payload: {
        displayWord: "Hello",
        language: "fr",
        languageName: null,
        firstMeaning: null,
        source: null,
        sourceUrl: null,
      },
    });
  });

  it("ignores stale dictionary lookup responses after another word is inspected", async () => {
    const user = userEvent.setup();
    let resolveHalloLookup: (lookup: WordLookup) => void = () => {};
    let resolveWeltLookup: (lookup: WordLookup) => void = () => {};

    mocks.invoke.mockImplementation((command: string, args?: { word?: string }) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "de_1_de.vtt",
            subtitleText: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo Welt",
          }),
        );
      }

      if (command === "lookup_word" && args?.word === "Hallo") {
        return new Promise((resolve) => {
          resolveHalloLookup = resolve;
        });
      }

      if (command === "lookup_word" && args?.word === "Welt") {
        return new Promise((resolve) => {
          resolveWeltLookup = resolve;
        });
      }

      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(await screen.findByRole("button", { name: "advance video" }));
    await user.click(screen.getByRole("button", { name: "Hallo" }));
    await user.click(screen.getByRole("button", { name: "Welt" }));

    await act(async () => {
      resolveWeltLookup(wordLookup({
        query: "Welt",
        headword: "Welt",
        partOfSpeech: "существительное",
        meanings: ["мир"],
      }));
    });

    expect(await screen.findByText("мир")).toBeInTheDocument();

    await act(async () => {
      resolveHalloLookup(wordLookup({
        query: "Hallo",
        headword: "Hallo",
        partOfSpeech: "междометие",
      }));
    });

    expect(screen.getByText("мир")).toBeInTheDocument();
    expect(screen.queryByText("привет")).not.toBeInTheDocument();
  });

  it("holds and releases a German cue while dictionary lookup is active", async () => {
    const user = userEvent.setup();
    let resolveLookup: (lookup: WordLookup) => void = () => {};

    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
      if (command === "load_video_from_url") {
        return Promise.resolve(
          loadedVideo({
            tracks: subtitleTracks,
            selectedTrackId: "de_1_de.vtt",
            subtitleText: [
              "WEBVTT",
              "",
              "00:00:00.000 --> 00:00:01.000",
              "Hallo Welt",
              "",
              "00:00:01.000 --> 00:00:02.000",
              "Weiter",
            ].join("\n"),
          }),
        );
      }

      if (command === "lookup_word") {
        return new Promise((resolve) => {
          resolveLookup = resolve;
        });
      }

      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await screen.findByText(/video_ext\.php/);

    act(() => {
      mocks.readyPlayer();
      mocks.emitTimeUpdate(500);
    });

    await user.click(screen.getByRole("button", { name: "Hallo" }));

    expect(screen.getByText("Ищу в словаре...")).toBeInTheDocument();

    act(() => {
      mocks.emitTimeUpdate(1000);
    });

    expect(mocks.pausePlayer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Hallo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hallo" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: "Weiter" })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByText("Ищу в словаре...")).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Word details: Hallo")).not.toBeInTheDocument();

    await act(async () => {
      resolveLookup(wordLookup({
        query: "Hallo",
        headword: "hallo",
        grammar: ["приветствие"],
      }));
    });

    expect(screen.queryByText("привет")).not.toBeInTheDocument();

    act(() => {
      mocks.emitPlaybackStart();
      mocks.emitTimeUpdate(1200);
    });

    expect(screen.queryByRole("button", { name: "Hallo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeInTheDocument();
  });

  it("pauses before moving to the next subtitle after a word is clicked", async () => {
    const user = userEvent.setup();

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

  it("releases an inspected subtitle when playback resumes", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await screen.findByText(/video_ext\.php/);

    act(() => {
      mocks.readyPlayer();
      mocks.emitTimeUpdate(500);
    });

    await user.click(screen.getByRole("button", { name: "Hello" }));

    act(() => {
      mocks.emitTimeUpdate(1000);
      mocks.emitTimeUpdate(1200);
    });

    expect(screen.getByRole("button", { name: "Hello" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();

    act(() => {
      mocks.emitPlaybackStart();
      mocks.emitTimeUpdate(1200);
    });

    expect(screen.queryByRole("button", { name: "Hello" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("keeps the boundary pause armed when playback starts before the inspected cue ends", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.type(screen.getByLabelText("VK Video URL"), "https://vkvideo.ru/video-1_2");
    await user.click(screen.getByRole("button", { name: "Load" }));
    await screen.findByText(/video_ext\.php/);

    act(() => {
      mocks.readyPlayer();
      mocks.emitTimeUpdate(500);
    });

    await user.click(screen.getByRole("button", { name: "Hello" }));

    act(() => {
      mocks.emitPlaybackStart();
      mocks.emitTimeUpdate(1000);
    });

    expect(mocks.pausePlayer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Hello" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("keeps previous subtitles visible when selected track loading fails", async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "list_saved_words") return Promise.resolve([]);
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
      if (command === "list_saved_words") return Promise.resolve([]);
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
