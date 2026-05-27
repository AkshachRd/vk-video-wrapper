import { useCallback, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubtitleOverlay } from "@/components/subtitle-overlay";
import { VideoPlayer } from "@/components/video-player";
import { parseWebVtt } from "@/lib/subtitles/parse-webvtt";
import type { LoadedSubtitleTrack, LoadedVideo, SubtitleCue, SubtitleLane, SubtitleTrack } from "@/lib/subtitles/types";
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

type PendingSubtitlePause = {
  cueId: string;
  stopAtMs: number;
  holdAtMs: number;
};

export default function App() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [video, setVideo] = useState<LoadedVideo | undefined>();
  const [lane, setLane] = useState<SubtitleLane | undefined>();
  const [timeMs, setTimeMs] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [isTrackLoading, setIsTrackLoading] = useState(false);
  const requestIdRef = useRef(0);
  const playerControlsRef = useRef<Pick<VkPlayerControls, "pause"> | undefined>(undefined);
  const pendingSubtitlePauseRef = useRef<PendingSubtitlePause | undefined>(undefined);

  const handlePlayerControlsReady = useCallback(
    (controls: Pick<VkPlayerControls, "pause"> | undefined) => {
      playerControlsRef.current = controls;
    },
    [],
  );

  const handleSubtitleWordInspect = useCallback((cue: SubtitleCue) => {
    pendingSubtitlePauseRef.current = {
      cueId: cue.id,
      stopAtMs: cue.endMs,
      holdAtMs: Math.max(cue.startMs, cue.endMs - 1),
    };
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

      setIsLoading(true);
      setError(undefined);
      setVideo(undefined);
      setLane(undefined);
      setTimeMs(0);
      setSelectedTrackId("");
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
    },
    [isLoading, url],
  );

  const handleTrackChange = useCallback(
    async (event: ChangeEvent<HTMLSelectElement>) => {
      const nextTrackId = event.target.value;
      if (!video || !lane || isTrackLoading || nextTrackId === selectedTrackId) {
        return;
      }

      setIsTrackLoading(true);
      setError(undefined);
      pendingSubtitlePauseRef.current = undefined;

      let loadedTrack: LoadedSubtitleTrack;

      try {
        loadedTrack = await invoke<LoadedSubtitleTrack>("load_subtitle_track", {
          videoId: video.videoId,
          trackId: nextTrackId,
        });
      } catch (trackLoadError) {
        setError(mapTrackLoadError(trackLoadError));
        setIsTrackLoading(false);
        return;
      }

      let cues: SubtitleLane["cues"];

      try {
        cues = parseWebVtt(loadedTrack.subtitleText);
      } catch {
        setError(TRACK_PARSE_ERROR);
        setIsTrackLoading(false);
        return;
      }

      if (cues.length === 0) {
        setError(TRACK_PARSE_ERROR);
        setIsTrackLoading(false);
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
    [isTrackLoading, lane, selectedTrackId, video],
  );

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <form className="mx-auto flex max-w-5xl gap-2" onSubmit={handleSubmit}>
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

      <section className="mx-auto mt-6 max-w-5xl">
        {error ? <Alert>{error}</Alert> : null}

        {video && lane ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-400">Loaded subtitles</div>
              {video.tracks.length > 0 ? (
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
              ) : null}
            </div>
            <div className="relative aspect-video overflow-hidden rounded-md border border-slate-800 bg-black">
              <VideoPlayer
                embedUrl={video.embedUrl}
                onTimeUpdate={handleTimeUpdate}
                onControlsReady={handlePlayerControlsReady}
              />
              <SubtitleOverlay
                lane={lane}
                timeMs={timeMs}
                onWordInspect={handleSubtitleWordInspect}
              />
            </div>
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

function mapLoadError(error: unknown): string {
  const code = typeof error === "string" ? extractErrorCode(error) : error instanceof Error ? error.message : "";

  return LOAD_ERROR_MESSAGES[code] ?? UNKNOWN_LOAD_ERROR;
}

function mapTrackLoadError(error: unknown): string {
  const code = typeof error === "string" ? extractErrorCode(error) : error instanceof Error ? error.message : "";

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

function extractErrorCode(error: string): string {
  try {
    const parsed = JSON.parse(error) as { kind?: unknown };

    if (typeof parsed.kind === "string") {
      return parsed.kind;
    }
  } catch {
    return error;
  }

  return error;
}
