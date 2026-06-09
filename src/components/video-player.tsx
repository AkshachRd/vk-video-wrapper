import { useEffect, useRef } from "react";

import { createVkPlayerBridge, loadVkPlayerScript } from "@/lib/vk-player/vk-player-bridge";
import type { VkPlayerControls } from "@/lib/vk-player/vk-player-bridge";
import { cn } from "@/lib/utils";

// All callback props must be stable (e.g. wrapped in useCallback). They are in
// the bridge-init effect's dependency array, so a fresh reference each render
// would tear down and recreate the VK player. `blockInput` is intentionally NOT
// in that effect — it only toggles the iframe's pointer-events.
type VideoPlayerProps = {
  embedUrl: string;
  onTimeUpdate: (timeMs: number) => void;
  onDurationChange?: (durationMs: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
  onVolumeChange?: (state: { volume: number; muted: boolean }) => void;
  onAdChange?: (isAd: boolean) => void;
  onPlaybackStart?: () => void;
  onControlsReady?: (controls: VkPlayerControls | undefined) => void;
  blockInput?: boolean;
};

export function VideoPlayer({
  embedUrl,
  onTimeUpdate,
  onDurationChange,
  onPlayingChange,
  onVolumeChange,
  onAdChange,
  onPlaybackStart,
  onControlsReady,
  blockInput = false,
}: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let bridge: VkPlayerControls | undefined;

    async function initializeBridge() {
      try {
        const iframe = iframeRef.current;
        if (!iframe) return;

        await loadVkPlayerScript();
        if (cancelled || !iframeRef.current) return;

        bridge = createVkPlayerBridge({
          iframe: iframeRef.current,
          onTimeUpdate,
          onDurationChange,
          onPlayingChange,
          onVolumeChange,
          onAdChange,
          onPlaybackStart,
        });
        onControlsReady?.(bridge);
      } catch {
        return;
      }
    }

    void initializeBridge();

    return () => {
      cancelled = true;
      onControlsReady?.(undefined);
      bridge?.destroy();
    };
  }, [
    embedUrl,
    onAdChange,
    onControlsReady,
    onDurationChange,
    onPlaybackStart,
    onPlayingChange,
    onTimeUpdate,
    onVolumeChange,
  ]);

  return (
    <iframe
      ref={iframeRef}
      title="VK Video player"
      src={withJsApi(embedUrl)}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      className={cn("h-full w-full border-0", blockInput && "pointer-events-none")}
    />
  );
}

function withJsApi(embedUrl: string): string {
  const url = new URL(embedUrl, window.location.href);
  url.searchParams.set("js_api", "1");
  return url.toString();
}
