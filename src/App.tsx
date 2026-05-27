import { useCallback, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubtitleOverlay } from "@/components/subtitle-overlay";
import { VideoPlayer } from "@/components/video-player";
import { parseWebVtt } from "@/lib/subtitles/parse-webvtt";
import type { LoadedVideo, SubtitleLane } from "@/lib/subtitles/types";

const LOAD_ERROR_MESSAGES: Record<string, string> = {
  "invalid-link": "This does not look like a public VK Video link.",
  "video-unavailable": "This video is unavailable without VK login or cannot be opened.",
  "subtitles-not-found": "Subtitles were not found for this video.",
  "subtitle-fetch-failed": "The subtitle file could not be downloaded.",
  "subtitle-parse-failed": "Subtitles could not be parsed for this video.",
};

const UNKNOWN_LOAD_ERROR = "The video could not be loaded.";
const SUBTITLE_PARSE_ERROR = "Subtitles could not be parsed for this video.";

export default function App() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [video, setVideo] = useState<LoadedVideo | undefined>();
  const [lane, setLane] = useState<SubtitleLane | undefined>();
  const [timeMs, setTimeMs] = useState(0);
  const requestIdRef = useRef(0);

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
      setLane({
        role: "primary",
        source: "vk-track",
        trackId: loadedVideo.selectedTrackId,
        cues,
      });
    },
    [isLoading, url],
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
            <div className="text-sm text-slate-400">Loaded subtitles</div>
            <div className="relative aspect-video overflow-hidden rounded-md border border-slate-800 bg-black">
              <VideoPlayer embedUrl={video.embedUrl} onTimeUpdate={setTimeMs} />
              <SubtitleOverlay lane={lane} timeMs={timeMs} />
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function mapLoadError(error: unknown): string {
  const code = typeof error === "string" ? extractErrorCode(error) : error instanceof Error ? error.message : "";

  return LOAD_ERROR_MESSAGES[code] ?? UNKNOWN_LOAD_ERROR;
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
