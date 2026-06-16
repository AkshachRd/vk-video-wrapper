import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

import { getSupportedLookupLanguage } from "@/lib/dictionary/supported-lookup-language";
import type { WordLookup, WordLookupState } from "@/lib/dictionary/types";
import type { RecentVideo, RecordRecentVideoRequest } from "@/lib/recent-videos/types";
import { normalizeSavedWord } from "@/lib/saved-words/normalize-saved-word";
import { collectTagOptions, normalizeTag } from "@/lib/saved-words/tags";
import type { SavedWord, SaveWordRequest, WordSaveControl } from "@/lib/saved-words/types";
import { parseWebVtt } from "@/lib/subtitles/parse-webvtt";
import { selectActiveCue } from "@/lib/subtitles/select-active-cue";
import type {
  LoadedSubtitleTrack,
  LoadedVideo,
  SubtitleCue,
  SubtitleLane,
  SubtitleTrack,
  SubtitleWord,
} from "@/lib/subtitles/types";
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
const TAG_WORD_ERROR = "Не удалось обновить теги. Попробуйте ещё раз.";
const SECONDARY_TRACK_ERROR = "Не удалось загрузить вторую дорожку.";

type PendingSubtitlePause = {
  stopAtMs: number;
  holdAtMs: number;
};

type PendingSavedWordAction = "saving" | "removing";

/**
 * Контроллер приложения: всё состояние, Tauri-вызовы, обработчики и derived-значения,
 * общие для desktop- и mobile-вёрсток. Только данные/логика, без JSX. Десктоп-специфика
 * (фуллскрин, авто-скрытие контролов, меню субтитров) живёт в DesktopApp.
 */
export function useVideoApp() {
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isAd, setIsAd] = useState(false);
  const [playerMode, setPlayerMode] = useState<"clean" | "vk">("clean");
  const [wordLookup, setWordLookup] = useState<WordLookupState>({ status: "idle" });
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [areSavedWordsLoading, setAreSavedWordsLoading] = useState(true);
  const [savedWordsUnavailable, setSavedWordsUnavailable] = useState(false);
  const [pendingSavedWordActions, setPendingSavedWordActions] = useState<Record<string, PendingSavedWordAction>>({});
  const [saveWordErrorKey, setSaveWordErrorKey] = useState<string | undefined>();
  const [savedWordsPanelError, setSavedWordsPanelError] = useState<string | undefined>();
  const [freshSavedWordId, setFreshSavedWordId] = useState<string | undefined>();
  const freshSavedWordTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [selectedTagKeys, setSelectedTagKeys] = useState<string[]>([]);
  const [tagPendingWordIds, setTagPendingWordIds] = useState<string[]>([]);
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

  useEffect(
    () => () => {
      if (freshSavedWordTimerRef.current) clearTimeout(freshSavedWordTimerRef.current);
    },
    [],
  );

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
        setFreshSavedWordId(savedWord.id);
        if (freshSavedWordTimerRef.current) clearTimeout(freshSavedWordTimerRef.current);
        freshSavedWordTimerRef.current = setTimeout(() => setFreshSavedWordId(undefined), 700);
      } catch {
        setSaveWordErrorKey(key);
      } finally {
        clearPendingSavedWordAction(key);
      }
    },
    [clearPendingSavedWordAction, savedWords, selectedTrack, setPendingSavedWordAction],
  );

  const handleRemoveSavedWord = useCallback(
    async (word: SavedWord) => {
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
    },
    [clearPendingSavedWordAction, setPendingSavedWordAction],
  );

  const handleAddWordTag = useCallback(async (wordId: string, tag: string) => {
    const display = tag.trim();
    const key = normalizeTag(display);
    if (!key) return;

    setSavedWordsPanelError(undefined);
    setTagPendingWordIds((ids) => (ids.includes(wordId) ? ids : [...ids, wordId]));
    setSavedWords((words) =>
      words.map((word) =>
        word.id === wordId && !word.tags.some((existing) => normalizeTag(existing) === key)
          ? { ...word, tags: [...word.tags, display] }
          : word,
      ),
    );

    try {
      const tags = await invoke<string[]>("add_word_tag", { wordId, tag: display });
      savedWordsMutatedRef.current = true;
      setSavedWords((words) => words.map((word) => (word.id === wordId ? { ...word, tags } : word)));
    } catch {
      setSavedWords((words) =>
        words.map((word) =>
          word.id === wordId
            ? { ...word, tags: word.tags.filter((existing) => normalizeTag(existing) !== key) }
            : word,
        ),
      );
      setSavedWordsPanelError(TAG_WORD_ERROR);
    } finally {
      setTagPendingWordIds((ids) => ids.filter((id) => id !== wordId));
    }
  }, []);

  const handleRemoveWordTag = useCallback(async (wordId: string, tag: string) => {
    const key = normalizeTag(tag);
    if (!key) return;

    setSavedWordsPanelError(undefined);
    setTagPendingWordIds((ids) => (ids.includes(wordId) ? ids : [...ids, wordId]));
    setSavedWords((words) =>
      words.map((word) =>
        word.id === wordId
          ? { ...word, tags: word.tags.filter((existing) => normalizeTag(existing) !== key) }
          : word,
      ),
    );

    try {
      const tags = await invoke<string[]>("remove_word_tag", { wordId, tag });
      savedWordsMutatedRef.current = true;
      setSavedWords((words) => words.map((word) => (word.id === wordId ? { ...word, tags } : word)));
    } catch {
      setSavedWords((words) =>
        words.map((word) =>
          word.id === wordId && !word.tags.some((existing) => normalizeTag(existing) === key)
            ? { ...word, tags: [...word.tags, tag] }
            : word,
        ),
      );
      setSavedWordsPanelError(TAG_WORD_ERROR);
    } finally {
      setTagPendingWordIds((ids) => ids.filter((id) => id !== wordId));
    }
  }, []);

  const handleToggleTagFilter = useCallback((key: string) => {
    setSelectedTagKeys((keys) => (keys.includes(key) ? keys.filter((existing) => existing !== key) : [...keys, key]));
  }, []);

  const handleResetTagFilter = useCallback(() => setSelectedTagKeys([]), []);

  useEffect(() => {
    const available = new Set(collectTagOptions(savedWords).map((option) => option.key));
    setSelectedTagKeys((keys) => {
      const next = keys.filter((key) => available.has(key));
      return next.length === keys.length ? keys : next;
    });
  }, [savedWords]);

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
    (recent: RecentVideo) => {
      setUrl(recent.url);
      void loadFromUrl(recent.url);
    },
    [loadFromUrl],
  );

  const handleRemoveRecentVideo = useCallback(async (recent: RecentVideo) => {
    setRecentVideosError(undefined);

    try {
      await invoke("remove_recent_video", { id: recent.id });
      setRecentVideos((list) => list.filter((item) => item.id !== recent.id));
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

  const selectPrimaryTrack = useCallback(
    async (nextTrackId: string) => {
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

  // Desktop-обёртка под <select onChange>; ядро selectPrimaryTrack принимает id напрямую (mobile-ряды).
  const handleTrackChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      void selectPrimaryTrack(event.target.value);
    },
    [selectPrimaryTrack],
  );

  const selectSecondaryTrack = useCallback(
    async (nextTrackId: string) => {
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

  const handleSecondaryTrackChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      void selectSecondaryTrack(event.target.value);
    },
    [selectSecondaryTrack],
  );

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

  return {
    // state
    url,
    setUrl,
    isLoading,
    error,
    video,
    lane,
    secondaryLane,
    selectedTrackId,
    isTrackLoading,
    selectedSecondaryTrackId,
    isSecondaryTrackLoading,
    secondaryError,
    isPlaying,
    currentTimeMs,
    durationMs,
    volume,
    muted,
    isAd,
    playerMode,
    wordLookup,
    savedWords,
    areSavedWordsLoading,
    savedWordsUnavailable,
    savedWordsPanelError,
    pendingSavedWordActions,
    freshSavedWordId,
    selectedTagKeys,
    tagPendingWordIds,
    recentVideos,
    areRecentVideosLoading,
    recentVideosUnavailable,
    recentVideosError,
    // derived
    selectedTrack,
    effectiveTimeMs,
    primaryCue,
    showCustomUi,
    blockInput,
    // handlers
    handleSubmit,
    loadFromUrl,
    handleSelectRecentVideo,
    handleRemoveRecentVideo,
    handleBackToList,
    handleTrackChange,
    handleSecondaryTrackChange,
    selectPrimaryTrack,
    selectSecondaryTrack,
    handleSubtitleWordInspect,
    handleSubtitleWordInspectEnd,
    getWordSaveControl,
    handleRemoveSavedWord,
    handleAddWordTag,
    handleRemoveWordTag,
    handleToggleTagFilter,
    handleResetTagFilter,
    handlePlaybackStart,
    handleDurationChange,
    handlePlayingChange,
    handleVolumeChange,
    handleAdChange,
    handleTimeUpdate,
    handlePlayerControlsReady,
    handlePlayPause,
    handleSeek,
    handleSetVolume,
    handleToggleMute,
    toggleVkMode,
    // utils
    savedWordKey,
  } as const;
}

export type VideoApp = ReturnType<typeof useVideoApp>;

export function savedWordKey(language: string, normalizedWord: string): string {
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
