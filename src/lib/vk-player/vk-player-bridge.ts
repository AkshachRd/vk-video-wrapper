type VkPlayerEvent = "timeupdate" | "started" | "resumed";
type VkPlayerTimeUpdatePayload = { time?: number };
type VkPlayerEventHandler = (payload: VkPlayerTimeUpdatePayload) => void;

type VkPlayer = {
  on(event: VkPlayerEvent, handler: VkPlayerEventHandler): void;
  off?(event: VkPlayerEvent, handler: VkPlayerEventHandler): void;
  pause(): void;
  destroy(): void;
};

type VkWindow = Window & {
  VK?: {
    VideoPlayer?: new (iframe: HTMLIFrameElement) => VkPlayer;
  };
};

type CreateVkPlayerBridgeOptions = {
  iframe: HTMLIFrameElement;
  onTimeUpdate: (timeMs: number) => void;
  onPlaybackStart?: () => void;
  playerFactory?: (iframe: HTMLIFrameElement) => VkPlayer;
};

export type VkPlayerControls = {
  pause(): void;
  destroy(): void;
};

const VK_PLAYER_SCRIPT_ID = "vk-video-player-api";
const VK_PLAYER_SCRIPT_URL = "https://vk.com/js/api/videoplayer.js";

let scriptLoadPromise: Promise<void> | undefined;

export function createVkPlayerBridge({
  iframe,
  onTimeUpdate,
  onPlaybackStart,
  playerFactory,
}: CreateVkPlayerBridgeOptions): VkPlayerControls {
  const player = (playerFactory ?? createDefaultPlayer)(iframe);
  const handleTimeUpdate: VkPlayerEventHandler = (payload) => {
    onTimeUpdate(Math.round((payload.time ?? 0) * 1000));
  };
  const handlePlaybackStart: VkPlayerEventHandler = () => {
    onPlaybackStart?.();
  };

  player.on("timeupdate", handleTimeUpdate);
  player.on("started", handlePlaybackStart);
  player.on("resumed", handlePlaybackStart);

  return {
    pause() {
      player.pause();
    },
    destroy() {
      player.off?.("timeupdate", handleTimeUpdate);
      player.off?.("started", handlePlaybackStart);
      player.off?.("resumed", handlePlaybackStart);
      player.destroy();
    },
  };
}

export function loadVkPlayerScript(): Promise<void> {
  const existingScript = document.getElementById(VK_PLAYER_SCRIPT_ID);
  if (existingScript && scriptLoadPromise) return scriptLoadPromise;
  if (existingScript) return Promise.resolve();

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = VK_PLAYER_SCRIPT_ID;
    script.src = VK_PLAYER_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      scriptLoadPromise = undefined;
      reject(new Error("Failed to load VK player script"));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

function createDefaultPlayer(iframe: HTMLIFrameElement): VkPlayer {
  const VideoPlayer = (window as VkWindow).VK?.VideoPlayer;
  if (!VideoPlayer) {
    throw new Error("VK.VideoPlayer is not available");
  }

  return new VideoPlayer(iframe);
}
