type VkPlayerEvent =
  | "timeupdate"
  | "started"
  | "resumed"
  | "paused"
  | "ended"
  | "volumechange"
  | "adStarted"
  | "adCompleted";

type VkPlayerEventPayload = {
  time?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
};

type VkPlayerEventHandler = (payload: VkPlayerEventPayload) => void;

type VkPlayer = {
  on(event: VkPlayerEvent, handler: VkPlayerEventHandler): void;
  off?(event: VkPlayerEvent, handler: VkPlayerEventHandler): void;
  play(): void;
  pause(): void;
  seek(time: number): void;
  setVolume(value: number): void;
  mute(): void;
  unmute(): void;
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
  onDurationChange?: (durationMs: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
  onVolumeChange?: (state: { volume: number; muted: boolean }) => void;
  onAdChange?: (isAd: boolean) => void;
  onPlaybackStart?: () => void;
  playerFactory?: (iframe: HTMLIFrameElement) => VkPlayer;
};

export type VkPlayerControls = {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(value: number): void;
  mute(): void;
  unmute(): void;
  destroy(): void;
};

const VK_PLAYER_SCRIPT_ID = "vk-video-player-api";
const VK_PLAYER_SCRIPT_URL = "https://vk.com/js/api/videoplayer.js";

let scriptLoadPromise: Promise<void> | undefined;

export function createVkPlayerBridge({
  iframe,
  onTimeUpdate,
  onDurationChange,
  onPlayingChange,
  onVolumeChange,
  onAdChange,
  onPlaybackStart,
  playerFactory,
}: CreateVkPlayerBridgeOptions): VkPlayerControls {
  const player = (playerFactory ?? createDefaultPlayer)(iframe);

  const emitDuration = (payload: VkPlayerEventPayload) => {
    if (typeof payload.duration === "number" && payload.duration > 0) {
      onDurationChange?.(Math.round(payload.duration * 1000));
    }
  };

  const handleTimeUpdate: VkPlayerEventHandler = (payload) => {
    onTimeUpdate(Math.round((payload.time ?? 0) * 1000));
    emitDuration(payload);
  };
  const handleStart: VkPlayerEventHandler = (payload) => {
    onPlayingChange?.(true);
    emitDuration(payload);
    onPlaybackStart?.();
  };
  const handleStop: VkPlayerEventHandler = () => {
    onPlayingChange?.(false);
  };
  const handleVolume: VkPlayerEventHandler = (payload) => {
    onVolumeChange?.({ volume: payload.volume ?? 1, muted: payload.muted ?? false });
  };
  const handleAdStarted: VkPlayerEventHandler = () => onAdChange?.(true);
  const handleAdCompleted: VkPlayerEventHandler = () => onAdChange?.(false);

  player.on("timeupdate", handleTimeUpdate);
  player.on("started", handleStart);
  player.on("resumed", handleStart);
  player.on("paused", handleStop);
  player.on("ended", handleStop);
  player.on("volumechange", handleVolume);
  player.on("adStarted", handleAdStarted);
  player.on("adCompleted", handleAdCompleted);

  return {
    play() {
      player.play();
    },
    pause() {
      player.pause();
    },
    seek(seconds) {
      player.seek(seconds);
    },
    setVolume(value) {
      player.setVolume(value);
    },
    mute() {
      player.mute();
    },
    unmute() {
      player.unmute();
    },
    destroy() {
      player.off?.("timeupdate", handleTimeUpdate);
      player.off?.("started", handleStart);
      player.off?.("resumed", handleStart);
      player.off?.("paused", handleStop);
      player.off?.("ended", handleStop);
      player.off?.("volumechange", handleVolume);
      player.off?.("adStarted", handleAdStarted);
      player.off?.("adCompleted", handleAdCompleted);
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
