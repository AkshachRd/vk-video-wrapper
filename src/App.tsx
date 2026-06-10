import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Captions, Maximize2, Minimize2, Settings, X } from "lucide-react";

import { SnakeBorder } from "@/components/snake-border";
import { Wave } from "@/components/wave";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RecentVideosList } from "@/components/recent-videos-list";
import { SavedWordsPanel } from "@/components/saved-words-panel";
import { SubtitleOverlay } from "@/components/subtitle-overlay";
import { PlayerControls } from "@/components/player-controls";
import { SubtitleReferenceLine } from "@/components/subtitle-reference-line";
import { VideoPlayer } from "@/components/video-player";
import { getSupportedLookupLanguage } from "@/lib/dictionary/supported-lookup-language";
import type { WordLookup, WordLookupState } from "@/lib/dictionary/types";
import type { RecentVideo, RecordRecentVideoRequest } from "@/lib/recent-videos/types";
import { normalizeSavedWord } from "@/lib/saved-words/normalize-saved-word";
import type { SavedWord, SaveWordRequest, WordSaveControl } from "@/lib/saved-words/types";
import { parseWebVtt } from "@/lib/subtitles/parse-webvtt";
import { selectActiveCue } from "@/lib/subtitles/select-active-cue";
import { useControlsAutoHide } from "@/lib/player/use-controls-auto-hide";
import { cn } from "@/lib/utils";
import type { LoadedSubtitleTrack, LoadedVideo, SubtitleCue, SubtitleLane, SubtitleTrack, SubtitleWord } from "@/lib/subtitles/types";
import type { VkPlayerControls } from "@/lib/vk-player/vk-player-bridge";

const LOAD_ERROR_MESSAGES: Record<string, string> = {
  "invalid-link": "Это не похоже на публичную ссылку VK Video.",
  "video-unavailable": "Видео недоступно без входа в VK или не может быть открыто.",
  "subtitles-not-found": "Субтитры для этого видео не найдены.",
  "subtitle-fetch-failed": "Не удалось скачать файл субтитров.",
  "subtitle-parse-failed": "Не удалось разобрать субтитры этого видео.",
};

const UNKNOWN_LOAD_ERROR = "Не удалось загрузить видео.";
const SUBTITLE_PARSE_ERROR = "Не удалось разобрать субтитры этого видео.";
const TRACK_PARSE_ERROR = "Не удалось разобрать субтитры этой дорожки.";
const SAVE_WORD_ERROR = "Не удалось сохранить слово";
const REMOVE_WORD_ERROR = "Не удалось удалить слово";
const SECONDARY_TRACK_ERROR = "Не удалось загрузить вторую дорожку.";

type PendingSubtitlePause = {
  stopAtMs: number;
  holdAtMs: number;
};

type PendingSavedWordAction = "saving" | "removing";

export default function App() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [video, setVideo] = useState<LoadedVideo | undefined>();
  const [lane, setLane] = useState<SubtitleLane | undefined>();
  const [timeMs, setTimeMs] = useState(0);
  const [heldSubtitleTimeMs, setHeldSubtitleTimeMs] = useState<number | undefined>();
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [isTrackLoading, setIsTrackLoading] = useState(false);
  const [secondaryLane, setSecondaryLane] = useState<SubtitleLane | undefined>();
  const [selectedSecondaryTrackId, setSelectedSecondaryTrackId] = useState("");
  const [isSecondaryTrackLoading, setIsSecondaryTrackLoading] = useState(false);
  const [secondaryError, setSecondaryError] = useState<string | undefined>();
  const [playerContainer, setPlayerContainer] = useState<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isAd, setIsAd] = useState(false);
  const [playerMode, setPlayerMode] = useState<"clean" | "vk">("clean");
  const [subtitlesMenuOpen, setSubtitlesMenuOpen] = useState(false);
  const [wordLookup, setWordLookup] = useState<WordLookupState>({ status: "idle" });
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [areSavedWordsLoading, setAreSavedWordsLoading] = useState(true);
  const [savedWordsUnavailable, setSavedWordsUnavailable] = useState(false);
  const [pendingSavedWordActions, setPendingSavedWordActions] = useState<Record<string, PendingSavedWordAction>>({});
  const [saveWordErrorKey, setSaveWordErrorKey] = useState<string | undefined>();
  const [savedWordsPanelError, setSavedWordsPanelError] = useState<string | undefined>();
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [areRecentVideosLoading, setAreRecentVideosLoading] = useState(true);
  const [recentVideosUnavailable, setRecentVideosUnavailable] = useState(false);
  const [recentVideosError, setRecentVideosError] = useState<string | undefined>();
  const requestIdRef = useRef(0);
  const trackRequestIdRef = useRef(0);
  const secondaryTrackRequestIdRef = useRef(0);
  const lookupRequestIdRef = useRef(0);
  const playerControlsRef = useRef<VkPlayerControls | undefined>(undefined);
  const pendingSubtitlePauseRef = useRef<PendingSubtitlePause | undefined>(undefined);
  const savedWordsMutatedRef = useRef(false);
  const removedSavedWordIdsRef = useRef(new Set<string>());
  const removedSavedWordKeysRef = useRef(new Set<string>());
  const selectedTrack = video?.tracks.find((track) => track.id === selectedTrackId);

  useEffect(() => {
    let cancelled = false;

    void invoke<SavedWord[]>("list_saved_words")
      .then((words) => {
        if (!cancelled) {
          setSavedWords((currentWords) => {
            if (!savedWordsMutatedRef.current) {
              return words;
            }

            const filteredWords = words.filter(
              (word) =>
                !removedSavedWordIdsRef.current.has(word.id) &&
                !removedSavedWordKeysRef.current.has(savedWordKey(word.language, word.normalizedWord)),
            );

            return mergeSavedWords(filteredWords, currentWords);
          });
        }
      })
      .catch(() => {
        if (!cancelled) setSavedWordsUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setAreSavedWordsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void invoke<RecentVideo[]>("list_recent_videos")
      .then((videos) => {
        if (!cancelled) setRecentVideos(videos);
      })
      .catch(() => {
        if (!cancelled) setRecentVideosUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setAreRecentVideosLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const resetWordLookup = useCallback(() => {
    lookupRequestIdRef.current += 1;
    setWordLookup({ status: "idle" });
  }, []);

  const handlePlayerControlsReady = useCallback((controls: VkPlayerControls | undefined) => {
    playerControlsRef.current = controls;
  }, []);

  const handleSubtitleWordInspect = useCallback(
    (cue: SubtitleCue, word: SubtitleWord) => {
      const holdAtMs = Math.max(cue.startMs, cue.endMs - 1);
      pendingSubtitlePauseRef.current = {
        stopAtMs: cue.endMs,
        holdAtMs,
      };
      setHeldSubtitleTimeMs(holdAtMs);

      const lookupLanguage = getSupportedLookupLanguage(selectedTrack?.lang);

      if (!selectedTrack || !lookupLanguage) {
        lookupRequestIdRef.current += 1;
        setWordLookup({ status: "idle" });
        return;
      }

      const query = word.cleanText || word.text;
      const requestId = lookupRequestIdRef.current + 1;
      lookupRequestIdRef.current = requestId;

      setWordLookup({ status: "loading", query });
      void invoke<WordLookup>("lookup_word", {
        word: query,
        cueText: cue.text,
        trackLang: selectedTrack.lang,
      })
        .then((data) => {
          if (lookupRequestIdRef.current === requestId) {
            setWordLookup({ status: "ready", query, data });
          }
        })
        .catch((lookupError: unknown) => {
          if (lookupRequestIdRef.current !== requestId) {
            return;
          }

          setWordLookup({
            status: extractErrorCode(lookupError) === "not-found" ? "not-found" : "unavailable",
            query,
          });
        });
    },
    [selectedTrack],
  );

  const setPendingSavedWordAction = useCallback((key: string, action: PendingSavedWordAction) => {
    setPendingSavedWordActions((actions) => ({
      ...actions,
      [key]: action,
    }));
  }, []);

  const clearPendingSavedWordAction = useCallback((key: string) => {
    setPendingSavedWordActions((actions) => {
      if (!(key in actions)) {
        return actions;
      }

      const remainingActions = { ...actions };
      delete remainingActions[key];
      return remainingActions;
    });
  }, []);

  const handleToggleSavedWord = useCallback(
    async (fallbackWord: string, lookup: WordLookupState) => {
      const payload = buildSaveWordRequest({
        fallbackWord,
        selectedTrack,
        lookup,
      });
      const normalizedWord = normalizeSavedWord(payload.displayWord);
      const key = savedWordKey(payload.language, normalizedWord);
      const existingWord = savedWords.find((word) => savedWordKey(word.language, word.normalizedWord) === key);

      setPendingSavedWordAction(key, existingWord ? "removing" : "saving");
      setSaveWordErrorKey(undefined);
      setSavedWordsPanelError(undefined);

      try {
        if (existingWord) {
          await invoke("remove_saved_word", {
            language: existingWord.language,
            normalizedWord: existingWord.normalizedWord,
          });
          savedWordsMutatedRef.current = true;
          removedSavedWordIdsRef.current.add(existingWord.id);
          removedSavedWordKeysRef.current.add(savedWordKey(existingWord.language, existingWord.normalizedWord));
          setSavedWords((words) => words.filter((word) => word.id !== existingWord.id));
          return;
        }

        const savedWord = await invoke<SavedWord>("save_word", {
          payload,
        });
        savedWordsMutatedRef.current = true;
        removedSavedWordIdsRef.current.delete(savedWord.id);
        removedSavedWordKeysRef.current.delete(savedWordKey(savedWord.language, savedWord.normalizedWord));
        setSavedWords((words) => replaceSavedWord(words, savedWord));
      } catch {
        setSaveWordErrorKey(key);
      } finally {
        clearPendingSavedWordAction(key);
      }
    },
    [clearPendingSavedWordAction, savedWords, selectedTrack, setPendingSavedWordAction],
  );

  const handleRemoveSavedWord = useCallback(async (word: SavedWord) => {
    const key = savedWordKey(word.language, word.normalizedWord);

    setPendingSavedWordAction(key, "removing");
    setSavedWordsPanelError(undefined);

    try {
      await invoke("remove_saved_word", {
        language: word.language,
        normalizedWord: word.normalizedWord,
      });
      savedWordsMutatedRef.current = true;
      removedSavedWordIdsRef.current.add(word.id);
      removedSavedWordKeysRef.current.add(key);
      setSavedWords((words) => words.filter((savedWord) => savedWord.id !== word.id));
    } catch {
      setSavedWordsPanelError(REMOVE_WORD_ERROR);
    } finally {
      clearPendingSavedWordAction(key);
    }
  }, [clearPendingSavedWordAction, setPendingSavedWordAction]);

  const getWordSaveControl = useCallback(
    (_cue: SubtitleCue, _word: SubtitleWord, fallbackWord: string, lookup: WordLookupState): WordSaveControl => {
      if (savedWordsUnavailable) {
        return { status: "unavailable" };
      }

      const payload = buildSaveWordRequest({
        fallbackWord,
        selectedTrack,
        lookup,
      });
      const normalizedWord = normalizeSavedWord(payload.displayWord);
      const key = savedWordKey(payload.language, normalizedWord);
      const isSaved = savedWords.some((word) => savedWordKey(word.language, word.normalizedWord) === key);
      const error = saveWordErrorKey === key ? SAVE_WORD_ERROR : undefined;
      const pendingAction = pendingSavedWordActions[key];

      if (pendingAction) {
        return {
          status: pendingAction,
          onToggle: () => {},
          error,
        };
      }

      return {
        status: isSaved ? "saved" : "unsaved",
        onToggle: () => {
          void handleToggleSavedWord(fallbackWord, lookup);
        },
        error,
      };
    },
    [handleToggleSavedWord, pendingSavedWordActions, savedWords, savedWordsUnavailable, saveWordErrorKey, selectedTrack],
  );

  const handleSubtitleWordInspectEnd = useCallback(() => {
    pendingSubtitlePauseRef.current = undefined;
    setHeldSubtitleTimeMs(undefined);
    resetWordLookup();
  }, [resetWordLookup]);

  const handlePlaybackStart = useCallback(() => {
    if (pendingSubtitlePauseRef.current) {
      return;
    }

    setHeldSubtitleTimeMs(undefined);
  }, []);

  const handleDurationChange = useCallback((nextDurationMs: number) => {
    setDurationMs(nextDurationMs);
  }, []);

  const handlePlayingChange = useCallback((nextIsPlaying: boolean) => {
    setIsPlaying(nextIsPlaying);
  }, []);

  const handleVolumeChange = useCallback((state: { volume: number; muted: boolean }) => {
    setVolume(state.volume);
    setMuted(state.muted);
  }, []);

  const handleAdChange = useCallback((nextIsAd: boolean) => {
    setIsAd(nextIsAd);
  }, []);

  const handleTimeUpdate = useCallback((nextTimeMs: number) => {
    const pendingPause = pendingSubtitlePauseRef.current;

    if (pendingPause && nextTimeMs >= pendingPause.stopAtMs) {
      pendingSubtitlePauseRef.current = undefined;

      if (playerControlsRef.current) {
        playerControlsRef.current.pause();
        setTimeMs(pendingPause.holdAtMs);
        setCurrentTimeMs(pendingPause.holdAtMs);
        return;
      }
    }

    setTimeMs(nextTimeMs);
    setCurrentTimeMs(nextTimeMs);
  }, []);

  const recordRecentVideo = useCallback((loadedVideo: LoadedVideo, sourceUrl: string) => {
    const payload: RecordRecentVideoRequest = {
      url: sourceUrl,
      ownerId: loadedVideo.videoId.ownerId,
      videoId: loadedVideo.videoId.videoId,
      title: loadedVideo.title ?? null,
      thumbnailUrl: loadedVideo.thumbnailUrl ?? null,
    };

    void invoke<RecentVideo>("record_recent_video", { payload })
      .then((saved) => {
        setRecentVideos((list) => [saved, ...list.filter((item) => item.id !== saved.id)]);
      })
      .catch(() => {
        // Recording history is best-effort; never disturb playback.
      });
  }, []);

  const loadFromUrl = useCallback(
    async (rawUrl: string) => {
      const trimmedUrl = rawUrl.trim();
      if (isLoading || !trimmedUrl) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      trackRequestIdRef.current += 1;

      resetWordLookup();
      setIsLoading(true);
      setIsTrackLoading(false);
      setError(undefined);
      setVideo(undefined);
      setLane(undefined);
      setTimeMs(0);
      setHeldSubtitleTimeMs(undefined);
      setSelectedTrackId("");
      setSecondaryLane(undefined);
      setSelectedSecondaryTrackId("");
      setIsSecondaryTrackLoading(false);
      setSecondaryError(undefined);
      secondaryTrackRequestIdRef.current += 1;
      pendingSubtitlePauseRef.current = undefined;

      let loadedVideo: LoadedVideo;

      try {
        loadedVideo = await invoke<LoadedVideo>("load_video_from_url", {
          url: trimmedUrl,
        });
      } catch (loadError) {
        if (requestIdRef.current === requestId) {
          setError(mapLoadError(loadError));
        }
        return;
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }

      if (requestIdRef.current !== requestId) {
        return;
      }

      let cues: SubtitleLane["cues"];

      try {
        cues = parseWebVtt(loadedVideo.subtitleText);
      } catch {
        setError(SUBTITLE_PARSE_ERROR);
        return;
      }

      if (cues.length === 0) {
        setError(SUBTITLE_PARSE_ERROR);
        return;
      }

      setVideo(loadedVideo);
      setSelectedTrackId(loadedVideo.selectedTrackId);
      setLane({
        role: "primary",
        source: "vk-track",
        trackId: loadedVideo.selectedTrackId,
        cues,
      });

      if (loadedVideo.secondaryTrackId && loadedVideo.secondarySubtitleText) {
        try {
          const secondaryCues = parseWebVtt(loadedVideo.secondarySubtitleText);
          if (secondaryCues.length > 0) {
            setSecondaryLane({
              role: "secondary",
              source: "vk-track",
              trackId: loadedVideo.secondaryTrackId,
              cues: secondaryCues,
            });
            setSelectedSecondaryTrackId(loadedVideo.secondaryTrackId);
          }
        } catch {
          // Opora is optional; ignore a parse failure silently.
        }
      }

      recordRecentVideo(loadedVideo, trimmedUrl);
    },
    [isLoading, recordRecentVideo, resetWordLookup],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void loadFromUrl(url);
    },
    [loadFromUrl, url],
  );

  const handleSelectRecentVideo = useCallback(
    (video: RecentVideo) => {
      setUrl(video.url);
      void loadFromUrl(video.url);
    },
    [loadFromUrl],
  );

  const handleRemoveRecentVideo = useCallback(async (video: RecentVideo) => {
    setRecentVideosError(undefined);

    try {
      await invoke("remove_recent_video", { id: video.id });
      setRecentVideos((list) => list.filter((item) => item.id !== video.id));
    } catch {
      setRecentVideosError("Не удалось удалить из истории");
    }
  }, []);

  const handleBackToList = useCallback(() => {
    requestIdRef.current += 1;
    trackRequestIdRef.current += 1;
    secondaryTrackRequestIdRef.current += 1;
    resetWordLookup();
    pendingSubtitlePauseRef.current = undefined;
    playerControlsRef.current = undefined;
    setVideo(undefined);
    setLane(undefined);
    setSecondaryLane(undefined);
    setSelectedTrackId("");
    setSelectedSecondaryTrackId("");
    setSecondaryError(undefined);
    setError(undefined);
    setHeldSubtitleTimeMs(undefined);
    setIsPlaying(false);
  }, [resetWordLookup]);

  const handleTrackChange = useCallback(
    async (event: ChangeEvent<HTMLSelectElement>) => {
      const nextTrackId = event.target.value;
      if (!video || !lane || isTrackLoading || nextTrackId === selectedTrackId) {
        return;
      }

      const trackRequestId = trackRequestIdRef.current + 1;
      trackRequestIdRef.current = trackRequestId;

      resetWordLookup();
      setIsTrackLoading(true);
      setError(undefined);
      setHeldSubtitleTimeMs(undefined);
      pendingSubtitlePauseRef.current = undefined;

      let loadedTrack: LoadedSubtitleTrack;

      try {
        loadedTrack = await invoke<LoadedSubtitleTrack>("load_subtitle_track", {
          videoId: video.videoId,
          trackId: nextTrackId,
        });
      } catch (trackLoadError) {
        if (trackRequestIdRef.current === trackRequestId) {
          setError(mapTrackLoadError(trackLoadError));
          setIsTrackLoading(false);
        }
        return;
      }

      if (trackRequestIdRef.current !== trackRequestId) {
        return;
      }

      let cues: SubtitleLane["cues"];

      try {
        cues = parseWebVtt(loadedTrack.subtitleText);
      } catch {
        if (trackRequestIdRef.current === trackRequestId) {
          setError(TRACK_PARSE_ERROR);
          setIsTrackLoading(false);
        }
        return;
      }

      if (cues.length === 0) {
        if (trackRequestIdRef.current === trackRequestId) {
          setError(TRACK_PARSE_ERROR);
          setIsTrackLoading(false);
        }
        return;
      }

      if (trackRequestIdRef.current !== trackRequestId) {
        return;
      }

      setSelectedTrackId(loadedTrack.selectedTrackId);
      setLane({
        role: "primary",
        source: "vk-track",
        trackId: loadedTrack.selectedTrackId,
        cues,
      });
      setIsTrackLoading(false);
    },
    [isTrackLoading, lane, resetWordLookup, selectedTrackId, video],
  );

  const handleSecondaryTrackChange = useCallback(
    async (event: ChangeEvent<HTMLSelectElement>) => {
      const nextTrackId = event.target.value;
      if (!video || isSecondaryTrackLoading || nextTrackId === selectedSecondaryTrackId) {
        return;
      }

      const secondaryRequestId = secondaryTrackRequestIdRef.current + 1;
      secondaryTrackRequestIdRef.current = secondaryRequestId;
      setSecondaryError(undefined);

      if (nextTrackId === "") {
        setSecondaryLane(undefined);
        setSelectedSecondaryTrackId("");
        return;
      }

      setIsSecondaryTrackLoading(true);

      let loadedTrack: LoadedSubtitleTrack;

      try {
        loadedTrack = await invoke<LoadedSubtitleTrack>("load_subtitle_track", {
          videoId: video.videoId,
          trackId: nextTrackId,
        });
      } catch {
        if (secondaryTrackRequestIdRef.current === secondaryRequestId) {
          setSecondaryError(SECONDARY_TRACK_ERROR);
          setIsSecondaryTrackLoading(false);
        }
        return;
      }

      if (secondaryTrackRequestIdRef.current !== secondaryRequestId) {
        return;
      }

      let secondaryCues: SubtitleLane["cues"];

      try {
        secondaryCues = parseWebVtt(loadedTrack.subtitleText);
      } catch {
        if (secondaryTrackRequestIdRef.current === secondaryRequestId) {
          setSecondaryError(SECONDARY_TRACK_ERROR);
          setIsSecondaryTrackLoading(false);
        }
        return;
      }

      if (secondaryCues.length === 0) {
        if (secondaryTrackRequestIdRef.current === secondaryRequestId) {
          setSecondaryError(SECONDARY_TRACK_ERROR);
          setIsSecondaryTrackLoading(false);
        }
        return;
      }

      setSelectedSecondaryTrackId(loadedTrack.selectedTrackId);
      setSecondaryLane({
        role: "secondary",
        source: "vk-track",
        trackId: loadedTrack.selectedTrackId,
        cues: secondaryCues,
      });
      setIsSecondaryTrackLoading(false);
    },
    [isSecondaryTrackLoading, selectedSecondaryTrackId, video],
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerContainer);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [playerContainer]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    void playerContainer?.requestFullscreen();
  }, [playerContainer]);

  const handlePlayPause = useCallback(() => {
    const controls = playerControlsRef.current;
    if (!controls) return;
    if (isPlaying) {
      controls.pause();
    } else {
      controls.play();
    }
  }, [isPlaying]);

  const handleSeek = useCallback((nextTimeMs: number) => {
    playerControlsRef.current?.seek(nextTimeMs / 1000);
    setCurrentTimeMs(nextTimeMs);
  }, []);

  const handleSetVolume = useCallback((value: number) => {
    playerControlsRef.current?.setVolume(value);
    setVolume(value);
    setMuted(value === 0);
  }, []);

  const handleToggleMute = useCallback(() => {
    const controls = playerControlsRef.current;
    if (!controls) return;
    if (muted) {
      controls.unmute();
    } else {
      controls.mute();
    }
  }, [muted]);

  const toggleVkMode = useCallback(() => {
    setPlayerMode((mode) => (mode === "clean" ? "vk" : "clean"));
  }, []);

  const effectiveTimeMs = heldSubtitleTimeMs ?? timeMs;
  const primaryCue = lane ? selectActiveCue(lane.cues, effectiveTimeMs) : undefined;
  const showCustomUi = playerMode === "clean" && !isAd;
  const blockInput = showCustomUi;
  const { visible: controlsVisible, reveal: revealControls } = useControlsAutoHide({
    active: isPlaying && showCustomUi && !subtitlesMenuOpen,
  });

  const subtitlesMenu =
    video && video.tracks.length > 0 ? (
      <Popover open={subtitlesMenuOpen} onOpenChange={setSubtitlesMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Субтитры и перевод"
            title="Субтитры и перевод"
            className="rounded p-1 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <Captions className="h-5 w-5" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          container={isFullscreen ? playerContainer : undefined}
          className="w-64"
        >
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              <span>Субтитры</span>
              <select
                aria-label="Субтитры"
                value={selectedTrackId}
                disabled={isTrackLoading}
                onChange={handleTrackChange}
                className="h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50"
              >
                {video.tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {formatTrackLabel(track)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              <span>Перевод</span>
              <select
                aria-label="Перевод"
                value={selectedSecondaryTrackId}
                disabled={isSecondaryTrackLoading}
                onChange={handleSecondaryTrackChange}
                className="h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50"
              >
                <option value="">Нет</option>
                {video.tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {formatTrackLabel(track)}
                  </option>
                ))}
              </select>
            </label>
            {secondaryError ? (
              <span className="text-sm text-amber-300">{secondaryError}</span>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    ) : null;

  return (
    <main className="flex min-h-screen p-8">
      <div className="m-auto flex w-full max-w-[1140px] flex-col overflow-hidden rounded-card-lg bg-paper shadow-[0_1px_0_rgba(0,0,0,0.04),0_40px_90px_-40px_rgba(0,0,0,0.32)]">
        <div className="relative min-h-[640px] pb-[34px]">
          {/* мастхед: в этой версии дизайна — только волна */}
          <header className="px-9 pt-[34px] pb-2">
            <Wave className="mt-[18px] h-[18px]" />
          </header>

          <form
            className="mx-9 mt-[22px] flex items-center gap-2 rounded-full border-[1.5px] border-line-2 bg-paper py-1.5 pr-1.5 pl-[22px] [transition:border-color_0.2s_var(--ease-soft),box-shadow_0.2s_var(--ease-soft)] focus-within:border-ink focus-within:shadow-[0_0_0_4px_rgba(12,12,12,0.05)]"
            onSubmit={handleSubmit}
          >
            <input
              aria-label="VK Video URL"
              placeholder="вставь ссылку vkvideo.ru/video…"
              value={url}
              disabled={isLoading}
              onChange={(event) => setUrl(event.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[15px] tracking-[-0.01em] text-ink outline-none placeholder:text-ink-3"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="group/snake relative flex h-11 items-center gap-[9px] rounded-full bg-ink px-6 text-sm font-medium tracking-[0.01em] whitespace-nowrap text-paper [transition:opacity_0.2s,scale_0.4s_var(--ease-spring)] active:scale-[0.97] disabled:cursor-progress disabled:opacity-45"
            >
              {isLoading ? "Загрузка" : "Загрузить"}
              <span
                aria-hidden="true"
                className="inline-block transition-transform duration-500 ease-spring group-hover/snake:translate-x-[5px]"
              >
                →
              </span>
              <SnakeBorder shape="pill" />
            </button>
          </form>

          {isLoading ? (
            <div data-testid="load-wave" className="mx-9 mt-4 h-3.5 overflow-hidden">
              <div className="h-full w-full animate-flow bg-(image:--wave-load) bg-position-[0px_50%] bg-size-[44px_10px] bg-repeat-x motion-reduce:animate-none" />
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="mx-9 mt-4 rounded-card bg-paper-2 px-5 py-3 text-sm text-ink-2">
              {error}
            </div>
          ) : null}

          {!video || !lane ? (
            <RecentVideosList
              videos={recentVideos}
              isLoading={areRecentVideosLoading}
              isUnavailable={recentVideosUnavailable}
              error={recentVideosError}
              onSelect={handleSelectRecentVideo}
              onRemove={handleRemoveRecentVideo}
            />
          ) : null}

          {video && lane ? (
            <div className="px-9 pt-[18px]">
              <div className="mb-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="group/snake relative flex items-center gap-[9px] rounded-full border-[1.5px] border-line-2 bg-paper px-4 py-2 text-[13px] font-medium text-ink transition-colors duration-200 hover:border-ink"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block transition-transform duration-[450ms] ease-spring group-hover/snake:-translate-x-1"
                  >
                    ←
                  </span>
                  Назад
                  <SnakeBorder shape="pill" />
                </button>
                {video.title ? (
                  <span className="ml-auto min-w-0 truncate text-[13px] font-medium text-ink-2">{video.title}</span>
                ) : null}
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_280px] items-start gap-[18px]">
                <div
                  ref={setPlayerContainer}
                  data-testid="player-container"
                  onPointerMove={revealControls}
                  className={cn(
                    "relative aspect-video overflow-hidden bg-well",
                    isFullscreen ? "" : "rounded-card-lg",
                    !controlsVisible && "cursor-none",
                  )}
                >
                  <VideoPlayer
                    embedUrl={video.embedUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onDurationChange={handleDurationChange}
                    onPlayingChange={handlePlayingChange}
                    onVolumeChange={handleVolumeChange}
                    onAdChange={handleAdChange}
                    onPlaybackStart={handlePlaybackStart}
                    onControlsReady={handlePlayerControlsReady}
                    blockInput={blockInput}
                  />

                  {showCustomUi ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label="Воспроизведение или пауза"
                      data-testid="player-click-surface"
                      onClick={handlePlayPause}
                      className={cn(
                        "absolute inset-0 h-full w-full bg-transparent",
                        controlsVisible ? "cursor-pointer" : "cursor-none",
                      )}
                    />
                  ) : null}

                  {isPlaying && showCustomUi ? (
                    <div
                      data-testid="playing-indicator"
                      className={cn(
                        "absolute top-[15px] left-4 z-[6] flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-white/75 transition-opacity duration-300",
                        controlsVisible ? "opacity-100" : "opacity-0",
                      )}
                    >
                      <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-white motion-reduce:animate-none" />
                      ВОСПРОИЗВЕДЕНИЕ
                    </div>
                  ) : null}

                  {showCustomUi ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-[76px] z-[5] flex flex-col items-center gap-[9px] px-[26px]">
                      <SubtitleOverlay
                        lane={lane}
                        timeMs={effectiveTimeMs}
                        wordLookup={wordLookup}
                        onWordInspect={handleSubtitleWordInspect}
                        onWordInspectEnd={handleSubtitleWordInspectEnd}
                        getWordSaveControl={getWordSaveControl}
                        popoverContainer={isFullscreen ? playerContainer : undefined}
                      />
                      {secondaryLane ? (
                        <div data-testid="secondary-subtitle-slot" className="flex min-h-10 justify-center">
                          <SubtitleReferenceLine lane={secondaryLane} primaryCue={primaryCue} />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {showCustomUi ? (
                    <div
                      data-testid="player-control-bar"
                      className={cn(
                        "absolute inset-x-3.5 bottom-3.5 z-[7] [transition:transform_0.35s_var(--ease-soft),opacity_0.3s_var(--ease-soft)]",
                        controlsVisible ? "opacity-100" : "pointer-events-none translate-y-[140%] opacity-0",
                      )}
                    >
                      <PlayerControls
                        isPlaying={isPlaying}
                        currentTimeMs={currentTimeMs}
                        durationMs={durationMs}
                        volume={volume}
                        muted={muted}
                        onPlayPause={handlePlayPause}
                        onSeek={handleSeek}
                        onSetVolume={handleSetVolume}
                        onToggleMute={handleToggleMute}
                        trailing={subtitlesMenu}
                      />
                    </div>
                  ) : null}

                  {!isAd ? (
                    <div
                      data-testid="player-corner-controls"
                      className={cn(
                        "absolute top-3.5 right-3.5 z-[7] flex gap-2 transition-opacity duration-300",
                        controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
                      )}
                    >
                      <button
                        type="button"
                        onClick={toggleVkMode}
                        aria-label={
                          playerMode === "vk"
                            ? "Вернуться к своим контролам"
                            : "Настройки VK (скорость, качество)"
                        }
                        title={
                          playerMode === "vk"
                            ? "Вернуться к своим контролам"
                            : "Настройки VK (скорость, качество)"
                        }
                        className="group/snake relative flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink [transition:background-color_0.18s_var(--ease-soft),color_0.18s,scale_0.3s_var(--ease-spring)] hover:bg-ink hover:text-paper active:scale-90"
                      >
                        {playerMode === "vk" ? (
                          <X className="h-[18px] w-[18px]" aria-hidden="true" />
                        ) : (
                          <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
                        )}
                        <SnakeBorder shape="circle" />
                      </button>
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        aria-label={isFullscreen ? "Выйти из полноэкранного режима" : "Полный экран"}
                        title={isFullscreen ? "Выйти из полноэкранного режима" : "Полный экран"}
                        className="group/snake relative flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink [transition:background-color_0.18s_var(--ease-soft),color_0.18s,scale_0.3s_var(--ease-spring)] hover:bg-ink hover:text-paper active:scale-90"
                      >
                        {isFullscreen ? (
                          <Minimize2 className="h-[18px] w-[18px]" aria-hidden="true" />
                        ) : (
                          <Maximize2 className="h-[18px] w-[18px]" aria-hidden="true" />
                        )}
                        <SnakeBorder shape="circle" />
                      </button>
                    </div>
                  ) : null}
                </div>

                <SavedWordsPanel
                  words={savedWords}
                  isLoading={areSavedWordsLoading}
                  isUnavailable={savedWordsUnavailable}
                  pendingWordIds={savedWords
                    .filter((word) => pendingSavedWordActions[savedWordKey(word.language, word.normalizedWord)] === "removing")
                    .map((word) => word.id)}
                  error={savedWordsPanelError}
                  onRemove={handleRemoveSavedWord}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function formatTrackLabel(track: SubtitleTrack): string {
  const label = track.manifestName || track.title || track.lang || track.id;
  return track.isAuto ? `${label} (авто)` : label;
}

function savedWordKey(language: string, normalizedWord: string): string {
  return `${language}:${normalizedWord}`;
}

function replaceSavedWord(words: SavedWord[], savedWord: SavedWord): SavedWord[] {
  const withoutExisting = words.filter((word) => word.id !== savedWord.id);
  return [savedWord, ...withoutExisting];
}

function mergeSavedWords(base: SavedWord[], current: SavedWord[]): SavedWord[] {
  const currentIds = new Set(current.map((word) => word.id));
  return [...current, ...base.filter((word) => !currentIds.has(word.id))];
}

function buildSaveWordRequest({
  fallbackWord,
  selectedTrack,
  lookup,
}: {
  fallbackWord: string;
  selectedTrack: SubtitleTrack | undefined;
  lookup: WordLookupState;
}): SaveWordRequest {
  if (lookup.status === "ready") {
    return {
      displayWord: lookup.data.headword,
      language: lookup.data.language,
      languageName: lookup.data.languageName,
      firstMeaning: lookup.data.meanings[0] ?? null,
      source: lookup.data.source,
      sourceUrl: lookup.data.sourceUrl,
    };
  }

  const supportedLanguage = getSupportedLookupLanguage(selectedTrack?.lang);
  return {
    displayWord: fallbackWord,
    language: (supportedLanguage ?? selectedTrack?.lang.trim().toLocaleLowerCase()) || "unknown",
    languageName: null,
    firstMeaning: null,
    source: null,
    sourceUrl: null,
  };
}

function mapLoadError(error: unknown): string {
  const code = extractErrorCode(error);

  return LOAD_ERROR_MESSAGES[code] ?? UNKNOWN_LOAD_ERROR;
}

function mapTrackLoadError(error: unknown): string {
  const code = extractErrorCode(error);

  switch (code) {
    case "subtitles-not-found":
      return "Эта дорожка субтитров больше недоступна.";
    case "subtitle-fetch-failed":
      return "Не удалось скачать файл субтитров.";
    case "subtitle-parse-failed":
      return TRACK_PARSE_ERROR;
    default:
      return "Не удалось загрузить дорожку субтитров.";
  }
}

function extractErrorCode(error: unknown): string {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";

  try {
    const parsed = JSON.parse(message) as { kind?: unknown };

    if (typeof parsed.kind === "string") {
      return parsed.kind;
    }
  } catch {
    return message;
  }

  return message;
}
