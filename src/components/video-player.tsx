import { useEffect, useRef } from "react";

import { createVkPlayerBridge, loadVkPlayerScript } from "@/lib/vk-player/vk-player-bridge";

type VideoPlayerProps = {
  embedUrl: string;
  onTimeUpdate: (timeMs: number) => void;
};

export function VideoPlayer({ embedUrl, onTimeUpdate }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let bridge: { destroy(): void } | undefined;

    async function initializeBridge() {
      const iframe = iframeRef.current;
      if (!iframe) return;

      await loadVkPlayerScript();
      if (cancelled || !iframeRef.current) return;

      bridge = createVkPlayerBridge({
        iframe: iframeRef.current,
        onTimeUpdate,
      });
    }

    void initializeBridge();

    return () => {
      cancelled = true;
      bridge?.destroy();
    };
  }, [embedUrl, onTimeUpdate]);

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
