import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/video-player", () => ({
  VideoPlayer: () => <div data-testid="video-player" />,
}));

import { MobileApp } from "./mobile-app";
import type { VideoApp } from "@/lib/app/use-video-app";
import type { LoadedVideo, SubtitleCue, SubtitleLane, SubtitleTrack } from "@/lib/subtitles/types";

const tracks: SubtitleTrack[] = [
  { id: "en", lang: "en", title: "English", url: "u", manifestName: "English", isAuto: false, storageIndex: 0 },
  { id: "ru", lang: "ru", title: "Русский", url: "u", manifestName: "Русский", isAuto: false, storageIndex: 1 },
];

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

const video: LoadedVideo = {
  videoId: { ownerId: -1, videoId: 1 },
  embedUrl: "https://vk.com/video_ext.php",
  tracks,
  selectedTrackId: "en",
  subtitleText: "",
  title: "Doc",
};

const lane: SubtitleLane = { role: "primary", source: "vk-track", trackId: "en", cues: [cue] };

function makeApp(overrides: Partial<VideoApp> = {}): VideoApp {
  const base = {
    url: "",
    setUrl: vi.fn(),
    isLoading: false,
    error: undefined,
    video: undefined,
    lane: undefined,
    secondaryLane: undefined,
    selectedTrackId: "en",
    isTrackLoading: false,
    selectedSecondaryTrackId: "",
    isSecondaryTrackLoading: false,
    secondaryError: undefined,
    isPlaying: false,
    currentTimeMs: 0,
    durationMs: 1000,
    volume: 1,
    muted: false,
    isAd: false,
    playerMode: "clean",
    wordLookup: { status: "idle" },
    savedWords: [],
    areSavedWordsLoading: false,
    savedWordsUnavailable: false,
    savedWordsPanelError: undefined,
    pendingSavedWordActions: {},
    freshSavedWordId: undefined,
    recentVideos: [],
    areRecentVideosLoading: false,
    recentVideosUnavailable: false,
    recentVideosError: undefined,
    selectedTrack: tracks[0],
    effectiveTimeMs: 0,
    primaryCue: undefined,
    showCustomUi: true,
    blockInput: true,
    handleSubmit: vi.fn((e: { preventDefault: () => void }) => e.preventDefault()),
    loadFromUrl: vi.fn(),
    handleSelectRecentVideo: vi.fn(),
    handleRemoveRecentVideo: vi.fn(),
    handleBackToList: vi.fn(),
    handleTrackChange: vi.fn(),
    handleSecondaryTrackChange: vi.fn(),
    selectPrimaryTrack: vi.fn(),
    selectSecondaryTrack: vi.fn(),
    handleSubtitleWordInspect: vi.fn(),
    handleSubtitleWordInspectEnd: vi.fn(),
    getWordSaveControl: vi.fn(() => ({ status: "unsaved", onToggle: vi.fn() })),
    handleRemoveSavedWord: vi.fn(),
    handlePlaybackStart: vi.fn(),
    handleDurationChange: vi.fn(),
    handlePlayingChange: vi.fn(),
    handleVolumeChange: vi.fn(),
    handleAdChange: vi.fn(),
    handleTimeUpdate: vi.fn(),
    handlePlayerControlsReady: vi.fn(),
    handlePlayPause: vi.fn(),
    handleSeek: vi.fn(),
    handleSetVolume: vi.fn(),
    handleToggleMute: vi.fn(),
    toggleVkMode: vi.fn(),
    savedWordKey: (language: string, normalizedWord: string) => `${language}:${normalizedWord}`,
  };
  return { ...base, ...overrides } as unknown as VideoApp;
}

describe("MobileApp", () => {
  it("shows the start screen and opens the saved sheet from the dock", () => {
    render(<MobileApp app={makeApp()} />);
    expect(screen.getByRole("button", { name: "Загрузить" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Мои слова/ }));
    expect(screen.getByRole("dialog", { name: "Сохранённые слова" })).toBeInTheDocument();
  });

  it("shows the player and opens the word sheet on word tap", () => {
    const app = makeApp({ video, lane, primaryCue: cue });
    render(<MobileApp app={app} />);
    expect(screen.getByTestId("video-player")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "world" }));
    expect(app.handleSubtitleWordInspect).toHaveBeenCalledWith(cue, cue.words[1]);
    expect(screen.getByRole("dialog", { name: "Слово: world" })).toBeInTheDocument();
  });

  it("opens the tracks sheet from the player", () => {
    render(<MobileApp app={makeApp({ video, lane, primaryCue: cue })} />);
    fireEvent.click(screen.getByRole("button", { name: "Дорожки" }));
    expect(screen.getByRole("dialog", { name: "Субтитры и перевод" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Субтитры" })).toBeInTheDocument();
  });
});
