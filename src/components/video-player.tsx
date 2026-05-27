import { useEffect, useRef } from "react";

import { createVkPlayerBridge, loadVkPlayerScript } from "@/lib/vk-player/vk-player-bridge";
import type { VkPlayerControls } from "@/lib/vk-player/vk-player-bridge";

type VideoPlayerProps = {
  embedUrl: string;
  onTimeUpdate: (timeMs: number) => void;
  onControlsReady?: (controls: Pick<VkPlayerControls, "pause"> | undefined) => void;
};

export function VideoPlayer({ embedUrl, onTimeUpdate, onControlsReady }: VideoPlayerProps) {
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
        });
        onControlsReady?.({ pause: bridge.pause });
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
  }, [embedUrl, onControlsReady, onTimeUpdate]);

  return (
    <iframe
      ref={iframeRef}
      title="VK Video player"
      src={withJsApi(embedUrl)}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      className="h-full w-full border-0"
    />
  );
}

function withJsApi(embedUrl: string): string {
  const url = new URL(embedUrl, window.location.href);
  url.searchParams.set("js_api", "1");
  return url.toString();
}
