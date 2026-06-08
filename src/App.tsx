import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SavedWordsPanel } from "@/components/saved-words-panel";
import { SubtitleOverlay } from "@/components/subtitle-overlay";
import { SubtitleReferenceLine } from "@/components/subtitle-reference-line";
import { VideoPlayer } from "@/components/video-player";
import { getSupportedLookupLanguage } from "@/lib/dictionary/supported-lookup-language";
import type { WordLookup, WordLookupState } from "@/lib/dictionary/types";
import { normalizeSavedWord } from "@/lib/saved-words/normalize-saved-word";
import type { SavedWord, SaveWordRequest, WordSaveControl } from "@/lib/saved-words/types";
import { parseWebVtt } from "@/lib/subtitles/parse-webvtt";
import { selectActiveCue } from "@/lib/subtitles/select-active-cue";
import type { LoadedSubtitleTrack, LoadedVideo, SubtitleCue, SubtitleLane, SubtitleTrack, SubtitleWord } from "@/lib/subtitles/types";
import type { VkPlayerControls } from "@/lib/vk-player/vk-player-bridge";

const LOAD_ERROR_MESSAGES: Record<string, string> = {
  "invalid-link": "This does not look like a public VK Video link.",
  "video-unavailable": "This video is unavailable without VK login or cannot be opened.",
  "subtitles-not-found": "Subtitles were not found for this video.",
  "subtitle-fetch-failed": "The subtitle file could not be downloaded.",
  "subtitle-parse-failed": "Subtitles could not be parsed for this video.",
};

const UNKNOWN_LOAD_ERROR = "The video could not be loaded.";
const SUBTITLE_PARSE_ERROR = "Subtitles could not be parsed for this video.";
const TRACK_PARSE_ERROR = "Subtitles could not be parsed for this track.";
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
  const [wordLookup, setWordLookup] = useState<WordLookupState>({ status: "idle" });
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [areSavedWordsLoading, setAreSavedWordsLoading] = useState(true);
  const [savedWordsUnavailable, setSavedWordsUnavailable] = useState(false);
  const [pendingSavedWordActions, setPendingSavedWordActions] = useState<Record<string, PendingSavedWordAction>>({});
  const [saveWordErrorKey, setSaveWordErrorKey] = useState<string | undefined>();
  const [savedWordsPanelError, setSavedWordsPanelError] = useState<string | undefined>();
  const requestIdRef = useRef(0);
  const trackRequestIdRef = useRef(0);
  const secondaryTrackRequestIdRef = useRef(0);
  const lookupRequestIdRef = useRef(0);
  const playerControlsRef = useRef<Pick<VkPlayerControls, "pause"> | undefined>(undefined);
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

  const resetWordLookup = useCallback(() => {
    lookupRequestIdRef.current += 1;
    setWordLookup({ status: "idle" });
  }, []);

  const handlePlayerControlsReady = useCallback(
    (controls: Pick<VkPlayerControls, "pause"> | undefined) => {
      playerControlsRef.current = controls;
    },
    [],
  );

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

  const handleTimeUpdate = useCallback((nextTimeMs: number) => {
    const pendingPause = pendingSubtitlePauseRef.current;

    if (pendingPause && nextTimeMs >= pendingPause.stopAtMs) {
      pendingSubtitlePauseRef.current = undefined;

      if (playerControlsRef.current) {
        playerControlsRef.current.pause();
        setTimeMs(pendingPause.holdAtMs);
        return;
      }
    }

    setTimeMs(nextTimeMs);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedUrl = url.trim();
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
    },
    [isLoading, resetWordLookup, url],
  );

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

  const effectiveTimeMs = heldSubtitleTimeMs ?? timeMs;
  const primaryCue = lane ? selectActiveCue(lane.cues, effectiveTimeMs) : undefined;

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <form className="mx-auto flex max-w-7xl gap-2" onSubmit={handleSubmit}>
        <Input
          aria-label="VK Video URL"
          placeholder="https://vkvideo.ru/video-..."
          value={url}
          disabled={isLoading}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Loading..." : "Load"}
        </Button>
      </form>

      <section className="mx-auto mt-6 max-w-7xl">
        {error ? <Alert>{error}</Alert> : null}

        {video && lane ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-400">Loaded subtitles</div>
                {video.tracks.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <span>Subtitles</span>
                      <select
                        aria-label="Subtitles"
                        value={selectedTrackId}
                        disabled={isTrackLoading}
                        onChange={handleTrackChange}
                        className="h-9 min-w-40 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50"
                      >
                        {video.tracks.map((track) => (
                          <option key={track.id} value={track.id}>
                            {formatTrackLabel(track)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <span>Перевод</span>
                      <select
                        aria-label="Перевод"
                        value={selectedSecondaryTrackId}
                        disabled={isSecondaryTrackLoading}
                        onChange={handleSecondaryTrackChange}
                        className="h-9 min-w-40 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50"
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
                ) : null}
              </div>
              <div className="relative aspect-video overflow-hidden rounded-md border border-slate-800 bg-black">
                <VideoPlayer
                  embedUrl={video.embedUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onPlaybackStart={handlePlaybackStart}
                  onControlsReady={handlePlayerControlsReady}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-7 flex flex-col items-center gap-1 px-8">
                  <SubtitleOverlay
                    lane={lane}
                    timeMs={effectiveTimeMs}
                    wordLookup={wordLookup}
                    onWordInspect={handleSubtitleWordInspect}
                    onWordInspectEnd={handleSubtitleWordInspectEnd}
                    getWordSaveControl={getWordSaveControl}
                  />
                  {secondaryLane ? (
                    <div
                      data-testid="secondary-subtitle-slot"
                      className="flex min-h-10 justify-center"
                    >
                      <SubtitleReferenceLine lane={secondaryLane} primaryCue={primaryCue} />
                    </div>
                  ) : null}
                </div>
              </div>
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
        ) : null}
      </section>
    </main>
  );
}

function formatTrackLabel(track: SubtitleTrack): string {
  const label = track.manifestName || track.title || track.lang || track.id;
  return track.isAuto ? `${label} auto` : label;
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
      return "This subtitle track is no longer available.";
    case "subtitle-fetch-failed":
      return "The subtitle file could not be downloaded.";
    case "subtitle-parse-failed":
      return TRACK_PARSE_ERROR;
    default:
      return "The subtitle track could not be loaded.";
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
