# Custom Player Chrome (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace VK's visible player UI with our own clean control bar (play/pause, seek, time, volume) that covers VK's chrome during normal playback, steps aside for ads, and offers a toggle into VK's native UI for speed/quality.

**Architecture:** Expand the `VK.VideoPlayer` JS-API bridge to the full confirmed surface and forward playback state to `App`. `App` owns player state + a `clean | vk` mode (with an automatic ad override), renders a new presentational control bar over the player container, and toggles the iframe's `pointer-events` so VK's own controls stay hidden in clean mode.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library, Tailwind, lucide-react, Tauri (WebView2).

**Spec:** `docs/superpowers/specs/2026-06-08-custom-player-chrome-design.md`

---

## Design Refinement vs Spec (read first)

The spec mockup placed the **VK toggle** and **fullscreen** inside the control bar. But the control bar is hidden in VK mode and ad mode — which would trap the user (no way to switch back from VK mode). So this plan keeps **VK toggle and fullscreen as always-visible corner buttons** (top-right), and the hideable bottom control bar holds only the transport controls (play/pause, time, seek, volume/mute). Everything else matches the spec.

Visibility rules (define `showCustomUi = playerMode === "clean" && !isAd`):
- Subtitle overlay + bottom control bar: shown when `showCustomUi`.
- Corner buttons (VK toggle, fullscreen): shown when `!isAd`.
- During an ad (`isAd`): none of our chrome shows; the iframe is interactive.

## File Structure

- `src/lib/vk-player/vk-player-bridge.ts` — **modify**: expand `VkPlayer` type, `VkPlayerControls`, options/callbacks, event wiring.
- `src/lib/vk-player/vk-player-bridge.test.ts` — **modify**: update fake player + assertions; add new event/control tests.
- `src/components/video-player.tsx` — **modify**: forward new callbacks, full `onControlsReady`, add `blockInput` prop.
- `src/components/subtitle-overlay.test.tsx` — **modify**: the `VideoPlayer` describe block's mock/assertions (it lives in this file).
- `src/components/player-controls.tsx` — **create**: presentational transport bar.
- `src/components/player-controls.test.tsx` — **create**: control bar tests.
- `src/App.tsx` — **modify**: player state, modes, wiring, render bar + corner VK toggle, gate subtitle overlay on `showCustomUi`.
- `src/App.test.tsx` — **modify**: extend the `VideoPlayer` mock to expose controls; add player-chrome tests.
- Docs: `docs/llm/current-behavior.md`, `docs/llm/product-context.md`, `AGENTS.md`.

---

## Task 1: Expand the VK player bridge

**Files:**
- Modify: `src/lib/vk-player/vk-player-bridge.ts`
- Modify: `src/lib/vk-player/vk-player-bridge.test.ts`

- [ ] **Step 1: Update the existing test's fake player and add new tests**

Replace the entire contents of `src/lib/vk-player/vk-player-bridge.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVkPlayerBridge, loadVkPlayerScript } from "./vk-player-bridge";

type EventPayload = { time?: number; duration?: number; volume?: number; muted?: boolean };
type EventHandler = (payload: EventPayload) => void;

function makeFakePlayer() {
  const handlers = new Map<string, EventHandler>();
  return {
    handlers,
    on: vi.fn((event: string, handler: EventHandler) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    mute: vi.fn(),
    unmute: vi.fn(),
    destroy: vi.fn(),
  };
}

describe("createVkPlayerBridge", () => {
  it("forwards timeupdate as rounded ms and duration as rounded ms", () => {
    const fakePlayer = makeFakePlayer();
    const onTimeUpdate = vi.fn();
    const onDurationChange = vi.fn();

    createVkPlayerBridge({
      iframe: document.createElement("iframe"),
      playerFactory: () => fakePlayer,
      onTimeUpdate,
      onDurationChange,
    });

    fakePlayer.handlers.get("timeupdate")?.({ time: 12.3456, duration: 100.4 });

    expect(onTimeUpdate).toHaveBeenCalledWith(12346);
    expect(onDurationChange).toHaveBeenCalledWith(100400);
  });

  it("reports playing state and playback start on started/resumed, and not-playing on paused/ended", () => {
    const fakePlayer = makeFakePlayer();
    const onPlayingChange = vi.fn();
    const onPlaybackStart = vi.fn();

    createVkPlayerBridge({
      iframe: document.createElement("iframe"),
      playerFactory: () => fakePlayer,
      onTimeUpdate: vi.fn(),
      onPlayingChange,
      onPlaybackStart,
    });

    fakePlayer.handlers.get("started")?.({});
    fakePlayer.handlers.get("resumed")?.({});
    fakePlayer.handlers.get("paused")?.({});
    fakePlayer.handlers.get("ended")?.({});

    expect(onPlayingChange.mock.calls).toEqual([[true], [true], [false], [false]]);
    expect(onPlaybackStart).toHaveBeenCalledTimes(2);
  });

  it("forwards volume changes and ad state", () => {
    const fakePlayer = makeFakePlayer();
    const onVolumeChange = vi.fn();
    const onAdChange = vi.fn();

    createVkPlayerBridge({
      iframe: document.createElement("iframe"),
      playerFactory: () => fakePlayer,
      onTimeUpdate: vi.fn(),
      onVolumeChange,
      onAdChange,
    });

    fakePlayer.handlers.get("volumechange")?.({ volume: 0.5, muted: true });
    fakePlayer.handlers.get("adStarted")?.({});
    fakePlayer.handlers.get("adCompleted")?.({});

    expect(onVolumeChange).toHaveBeenCalledWith({ volume: 0.5, muted: true });
    expect(onAdChange.mock.calls).toEqual([[true], [false]]);
  });

  it("exposes controls that call the underlying player", () => {
    const fakePlayer = makeFakePlayer();

    const controls = createVkPlayerBridge({
      iframe: document.createElement("iframe"),
      playerFactory: () => fakePlayer,
      onTimeUpdate: vi.fn(),
    });

    controls.play();
    controls.pause();
    controls.seek(42);
    controls.setVolume(0.3);
    controls.mute();
    controls.unmute();

    expect(fakePlayer.play).toHaveBeenCalled();
    expect(fakePlayer.pause).toHaveBeenCalled();
    expect(fakePlayer.seek).toHaveBeenCalledWith(42);
    expect(fakePlayer.setVolume).toHaveBeenCalledWith(0.3);
    expect(fakePlayer.mute).toHaveBeenCalled();
    expect(fakePlayer.unmute).toHaveBeenCalled();
  });

  it("unsubscribes all handlers and destroys the player on destroy", () => {
    const fakePlayer = makeFakePlayer();

    const controls = createVkPlayerBridge({
      iframe: document.createElement("iframe"),
      playerFactory: () => fakePlayer,
      onTimeUpdate: vi.fn(),
    });

    controls.destroy();

    for (const event of [
      "timeupdate",
      "started",
      "resumed",
      "paused",
      "ended",
      "volumechange",
      "adStarted",
      "adCompleted",
    ]) {
      expect(fakePlayer.off).toHaveBeenCalledWith(event, fakePlayer.handlers.get(event));
    }
    expect(fakePlayer.destroy).toHaveBeenCalled();
  });
});

describe("loadVkPlayerScript", () => {
  beforeEach(() => {
    document.head.replaceChildren();
  });

  it("injects the VK player script once and resolves when it loads", async () => {
    const firstLoad = loadVkPlayerScript();
    const secondLoad = loadVkPlayerScript();
    const script = document.querySelector<HTMLScriptElement>(
      'script[src="https://vk.com/js/api/videoplayer.js"]',
    );

    expect(document.querySelectorAll("script")).toHaveLength(1);
    expect(script).not.toBeNull();

    script?.dispatchEvent(new Event("load"));

    await expect(firstLoad).resolves.toBeUndefined();
    await expect(secondLoad).resolves.toBeUndefined();
  });

  it("rejects when the VK player script fails to load", async () => {
    const loading = loadVkPlayerScript();
    const script = document.querySelector<HTMLScriptElement>(
      'script[src="https://vk.com/js/api/videoplayer.js"]',
    );

    script?.dispatchEvent(new Event("error"));

    await expect(loading).rejects.toThrow("Failed to load VK player script");
  });

  it("retries with a new script element after a load failure", async () => {
    const failedLoad = loadVkPlayerScript();
    const failedScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://vk.com/js/api/videoplayer.js"]',
    );

    failedScript?.dispatchEvent(new Event("error"));
    await expect(failedLoad).rejects.toThrow("Failed to load VK player script");

    const retryLoad = loadVkPlayerScript();
    const retryScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://vk.com/js/api/videoplayer.js"]',
    );

    expect(retryScript).not.toBe(failedScript);

    retryScript?.dispatchEvent(new Event("load"));
    await expect(retryLoad).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- vk-player-bridge`
Expected: FAIL — controls (`play`/`seek`/`setVolume`/etc.) and the new callbacks don't exist yet; type errors on the fake player.

- [ ] **Step 3: Rewrite the bridge implementation**

Replace lines 1-64 of `src/lib/vk-player/vk-player-bridge.ts` (the type declarations and `createVkPlayerBridge`, i.e. everything above `export function loadVkPlayerScript`) with:

```ts
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
```

(Leave `loadVkPlayerScript` and `createDefaultPlayer` below unchanged.)

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test -- vk-player-bridge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vk-player/vk-player-bridge.ts src/lib/vk-player/vk-player-bridge.test.ts
git commit -m "$(printf 'feat: расширение моста VK-плеера до полного API\n\nДобавлены контролы play/seek/setVolume/mute/unmute и проброс событий duration/playing/volume/ad поверх подтверждённого API VK.VideoPlayer.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: VideoPlayer forwards controls + supports blockInput

**Files:**
- Modify: `src/components/video-player.tsx`
- Modify: `src/components/subtitle-overlay.test.tsx` (the `describe("VideoPlayer")` block)

- [ ] **Step 1: Update the VideoPlayer tests in subtitle-overlay.test.tsx**

In `src/components/subtitle-overlay.test.tsx`, replace the second test inside `describe("VideoPlayer", ...)` — the one titled "loads the VK script, initializes the bridge, and cleans up on unmount" — with the two tests below (keep the first test "renders the VK iframe with js_api enabled" as-is):

```tsx
  it("loads the VK script, initializes the bridge with all callbacks, and cleans up on unmount", async () => {
    const destroy = vi.fn();
    const controls = { destroy, play: vi.fn(), pause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), mute: vi.fn(), unmute: vi.fn() };
    const onTimeUpdate = vi.fn();
    const onControlsReady = vi.fn();
    mocks.loadVkPlayerScript.mockResolvedValue(undefined);
    mocks.createVkPlayerBridge.mockReturnValue(controls);

    const { unmount } = render(
      <VideoPlayer
        embedUrl="https://vk.com/video_ext.php?oid=1&id=2"
        onTimeUpdate={onTimeUpdate}
        onControlsReady={onControlsReady}
      />,
    );
    const iframe = screen.getByTitle<HTMLIFrameElement>("VK Video player");

    await waitFor(() => {
      expect(mocks.createVkPlayerBridge).toHaveBeenCalledWith(
        expect.objectContaining({ iframe, onTimeUpdate }),
      );
    });
    expect(onControlsReady).toHaveBeenCalledWith(controls);

    unmount();

    expect(onControlsReady).toHaveBeenLastCalledWith(undefined);
    expect(destroy).toHaveBeenCalled();
  });

  it("blocks iframe pointer input when blockInput is set", () => {
    render(
      <VideoPlayer
        embedUrl="https://vk.com/video_ext.php?oid=1&id=2"
        onTimeUpdate={vi.fn()}
        blockInput
      />,
    );

    expect(screen.getByTitle("VK Video player").className).toContain("pointer-events-none");
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- subtitle-overlay`
Expected: FAIL — `blockInput` prop and the full-controls `onControlsReady` aren't implemented.

- [ ] **Step 3: Rewrite video-player.tsx**

Replace the entire contents of `src/components/video-player.tsx` with:

```tsx
import { useEffect, useRef } from "react";

import { createVkPlayerBridge, loadVkPlayerScript } from "@/lib/vk-player/vk-player-bridge";
import type { VkPlayerControls } from "@/lib/vk-player/vk-player-bridge";
import { cn } from "@/lib/utils";

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
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test -- subtitle-overlay`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/video-player.tsx src/components/subtitle-overlay.test.tsx
git commit -m "$(printf 'feat: VideoPlayer пробрасывает контролы и поддерживает blockInput\n\nVideoPlayer форвардит новые колбэки моста и отдаёт полный набор контролов; prop blockInput выключает pointer-events у iframe для чистого режима.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: Manual autoplay spike (human-run gate)

This step needs the real WebView2 runtime and cannot be done by a subagent. The controller pauses here and asks the human to run it. It uses Task 1/2 (bridge `play()` + `onControlsReady`) plus a tiny temporary button.

- [ ] **Step 1: Add a temporary play probe button in App.tsx**

Temporarily, inside the player container `<div>` (right after `<VideoPlayer ... />`), add:

```tsx
                {/* TEMP autoplay spike — remove in Task 5 */}
                <button
                  type="button"
                  data-testid="spike-play"
                  onClick={() => playerControlsRef.current?.play?.()}
                  className="absolute left-2 top-2 z-20 rounded bg-fuchsia-600 px-2 py-1 text-xs"
                >
                  spike play
                </button>
```

(`playerControlsRef` currently holds `Pick<VkPlayerControls,"pause">`; for the spike, the optional-call `?.play?.()` is safe even before Task 5 widens the ref type. The mock VideoPlayer in tests doesn't call `onControlsReady`, so this button is a no-op there.)

- [ ] **Step 2: Run the app and observe (HUMAN)**

Run: `npm run tauri dev` (use `fnm use 24.14.0` first if Node is too old).
Load `https://vkvideo.ru/video-145784486_456239038`, wait for the player to appear, do NOT press VK's own play, then click the magenta "spike play" button.

Report back:
1. Does the video start playing from our button alone? (yes/no)
2. If it starts, is there sound, or is it muted? (sound/muted/none)
3. Does VK show any "tap to unmute"/sound-prohibited hint?

- [ ] **Step 3: Record the finding and confirm the first-play behavior**

Write the observed result into the spec file under a new "## Autoplay Spike Result" section (one short paragraph), and confirm the first-play handling for Task 5:
- If our button starts playback with sound → custom play works directly; no special first-play handling needed.
- If it starts muted (or VK shows a sound hint) → custom play works but the first start is muted; Task 5 relies on the existing volume/mute control to unmute (default state will reflect VK's `volumechange`).
- If it does NOT start at all → Task 5 keeps the first start in VK mode: the player loads in `vk` mode by default until the first `started` event, then switches to `clean`.

- [ ] **Step 4: Remove the temporary probe button**

Delete the TEMP block added in Step 1. (Task 5 adds the real control bar.)

- [ ] **Step 5: Commit the recorded finding**

```bash
git add docs/superpowers/specs/2026-06-08-custom-player-chrome-design.md src/App.tsx
git commit -m "$(printf 'docs: результат спайка автоплея VK-плеера\n\nЗафиксировано поведение play() через postMessage в WebView2 и выбранная стратегия первого запуска. Временная кнопка-проба удалена.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: Control bar component (`player-controls.tsx`)

Presentational only; no VK knowledge. Holds transport controls (play/pause, time, seek, volume/mute). VK toggle and fullscreen are NOT here (they are corner buttons in App — see Design Refinement).

**Files:**
- Create: `src/components/player-controls.tsx`
- Test: `src/components/player-controls.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/player-controls.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { PlayerControls } from "./player-controls";

function setup(overrides: Partial<ComponentProps<typeof PlayerControls>> = {}) {
  const props = {
    isPlaying: false,
    currentTimeMs: 61000,
    durationMs: 6203000,
    volume: 1,
    muted: false,
    onPlayPause: vi.fn(),
    onSeek: vi.fn(),
    onSetVolume: vi.fn(),
    onToggleMute: vi.fn(),
    ...overrides,
  };
  render(<PlayerControls {...props} />);
  return props;
}

describe("PlayerControls", () => {
  it("shows a play affordance when paused and fires onPlayPause", async () => {
    const user = userEvent.setup();
    const props = setup({ isPlaying: false });

    await user.click(screen.getByRole("button", { name: "Play" }));

    expect(props.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("shows a pause affordance when playing", () => {
    setup({ isPlaying: true });

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("renders elapsed and total time as H:MM:SS / M:SS", () => {
    setup({ currentTimeMs: 61000, durationMs: 6203000 });

    expect(screen.getByText("1:01 / 1:43:23")).toBeInTheDocument();
  });

  it("seeks via the progress slider", () => {
    const props = setup({ durationMs: 100000 });

    fireEvent.change(screen.getByRole("slider", { name: "Seek" }), {
      target: { value: "50000" },
    });

    expect(props.onSeek).toHaveBeenCalledWith(50000);
  });

  it("toggles mute and shows the muted icon", async () => {
    const user = userEvent.setup();
    const props = setup({ muted: true });

    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unmute" }));

    expect(props.onToggleMute).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- player-controls`
Expected: FAIL — `./player-controls` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/player-controls.tsx`:

```tsx
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

type PlayerControlsProps = {
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  onPlayPause: () => void;
  onSeek: (timeMs: number) => void;
  onSetVolume: (value: number) => void;
  onToggleMute: () => void;
};

export function PlayerControls({
  isPlaying,
  currentTimeMs,
  durationMs,
  volume,
  muted,
  onPlayPause,
  onSeek,
  onSetVolume,
  onToggleMute,
}: PlayerControlsProps) {
  const clampedTime = Math.min(currentTimeMs, durationMs || currentTimeMs);

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-md bg-black/70 px-3 py-2 text-white">
      <button
        type="button"
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={onPlayPause}
        className="rounded p-1 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        {isPlaying ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
      </button>

      <span className="whitespace-nowrap text-xs tabular-nums text-slate-200">
        {formatTime(clampedTime)} / {formatTime(durationMs)}
      </span>

      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={Math.max(durationMs, 0)}
        value={clampedTime}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="h-1 flex-1 cursor-pointer accent-sky-400"
      />

      <button
        type="button"
        aria-label={muted ? "Unmute" : "Mute"}
        onClick={onToggleMute}
        className="rounded p-1 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        {muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
      </button>

      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(event) => onSetVolume(Number(event.target.value))}
        className="h-1 w-20 cursor-pointer accent-sky-400"
      />
    </div>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test -- player-controls`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/player-controls.tsx src/components/player-controls.test.tsx
git commit -m "$(printf 'feat: компонент панели управления плеером\n\nPlayerControls: плей/пауза, время H:MM:SS, перемотка, громкость/мьют. Презентационный, без знания о VK.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: App integration — player state, modes, control bar, VK toggle

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Extend the App.test VideoPlayer mock (additively) and add failing tests**

The `mocks` hoisted object and the `vi.mock("@/components/video-player", ...)` factory already exist in `src/App.test.tsx` and are shared by the existing App suites (they rely on `mocks.emitTimeUpdate`, `mocks.emitPlaybackStart`, `mocks.readyPlayer`, `mocks.pausePlayer` and the in-mock buttons). Do NOT remove any of that — make additive changes.

(a) Add control-mock fns to the hoisted `mocks` object (alongside the existing `pausePlayer`):

```tsx
    playPlayer: vi.fn(),
    seekPlayer: vi.fn(),
    setVolumePlayer: vi.fn(),
    mutePlayer: vi.fn(),
    unmutePlayer: vi.fn(),
```

(b) Replace the existing `VideoPlayer` mock factory with the version below. It keeps the existing buttons + emit wiring, captures all callbacks on `playerProps.current`, makes `readyPlayer` provide the FULL controls object, and exposes `blockInput` as a data attribute. (If the pre-existing factory has extra buttons/wiring beyond this, preserve them — only ADD the full controls object, the extra captured callbacks, and `data-block-input`.)

```tsx
vi.mock("@/components/video-player", () => ({
  VideoPlayer: (props: {
    embedUrl?: string;
    onTimeUpdate: (ms: number) => void;
    onPlaybackStart?: () => void;
    onPlayingChange?: (isPlaying: boolean) => void;
    onVolumeChange?: (state: { volume: number; muted: boolean }) => void;
    onAdChange?: (isAd: boolean) => void;
    onControlsReady?: (controls: unknown) => void;
    blockInput?: boolean;
  }) => {
    mocks.playerProps.current = props;
    mocks.emitTimeUpdate.mockImplementation(props.onTimeUpdate);
    mocks.emitPlaybackStart.mockImplementation(() => props.onPlaybackStart?.());
    mocks.readyPlayer.mockImplementation(() =>
      props.onControlsReady?.({
        play: mocks.playPlayer,
        pause: mocks.pausePlayer,
        seek: mocks.seekPlayer,
        setVolume: mocks.setVolumePlayer,
        mute: mocks.mutePlayer,
        unmute: mocks.unmutePlayer,
        destroy: vi.fn(),
      }),
    );
    return (
      <div data-testid="video-player" data-block-input={props.blockInput ? "true" : "false"}>
        <button type="button" onClick={() => mocks.readyPlayer()}>ready player</button>
        <button type="button" onClick={() => props.onTimeUpdate(500)}>advance video</button>
        <button type="button" onClick={() => props.onTimeUpdate(1000)}>advance to next subtitle</button>
        <button type="button" onClick={() => props.onTimeUpdate(1200)}>late player tick</button>
      </div>
    );
  },
}));
```

(c) Add this helper near the other helpers (after `loadAndPlay`). It wires the full controls via the existing `readyPlayer` mechanism:

```tsx
function readyControls() {
  act(() => {
    mocks.readyPlayer();
  });
}
```

(d) Append a new suite at the end of the file:

```tsx
describe("App player chrome", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.playerProps.current = undefined;
    mocks.parseMap.clear();
    mocks.parseMap.set("PRIMARY", PRIMARY_CUES);
    mocks.parseMap.set("SECONDARY_RU", SECONDARY_CUES);
    mocks.playPlayer.mockReset();
    mocks.pausePlayer.mockReset();
    mocks.seekPlayer.mockReset();
    mocks.setVolumePlayer.mockReset();
    mocks.mutePlayer.mockReset();
    mocks.unmutePlayer.mockReset();
    setupInvoke();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the custom control bar and blocks iframe input in clean mode", async () => {
    render(<App />);
    await loadAndPlay();
    readyControls();

    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByTestId("video-player").getAttribute("data-block-input")).toBe("true");
  });

  it("plays and pauses through the bridge controls", async () => {
    render(<App />);
    const user = await loadAndPlay();
    readyControls();

    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(mocks.playPlayer).toHaveBeenCalledTimes(1);

    act(() => {
      mocks.playerProps.current?.onPlayingChange?.(true);
    });

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(mocks.pausePlayer).toHaveBeenCalledTimes(1);
  });

  it("switches to VK mode (enables iframe input, hides the bar) and back", async () => {
    render(<App />);
    const user = await loadAndPlay();
    readyControls();

    await user.click(screen.getByRole("button", { name: "VK controls (speed, quality)" }));

    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.getByTestId("video-player").getAttribute("data-block-input")).toBe("false");

    await user.click(screen.getByRole("button", { name: "Back to clean controls" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByTestId("video-player").getAttribute("data-block-input")).toBe("true");
  });

  it("steps aside during an ad and restores afterward", async () => {
    render(<App />);
    await loadAndPlay();
    readyControls();

    act(() => {
      mocks.playerProps.current?.onAdChange?.(true);
    });
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.getByTestId("video-player").getAttribute("data-block-input")).toBe("false");

    act(() => {
      mocks.playerProps.current?.onAdChange?.(false);
    });
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByTestId("video-player").getAttribute("data-block-input")).toBe("true");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- App`
Expected: FAIL — no control bar, no VK toggle, `data-block-input` is always false.

- [ ] **Step 3: Add player-chrome imports to App.tsx**

Add next to the other component imports (after the `SubtitleReferenceLine` import):

```tsx
import { PlayerControls } from "@/components/player-controls";
```

Add to the lucide import (it currently imports `Maximize2, Minimize2`) so it becomes:

```tsx
import { Maximize2, Minimize2, Settings, X } from "lucide-react";
```

- [ ] **Step 4: Add player state to App.tsx**

After the `isFullscreen` state declaration (`const [isFullscreen, setIsFullscreen] = useState(false);`), add:

```tsx
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isAd, setIsAd] = useState(false);
  const [playerMode, setPlayerMode] = useState<"clean" | "vk">("clean");
```

- [ ] **Step 5: Widen the player controls ref and ready handler**

Change the ref type:

```tsx
  const playerControlsRef = useRef<VkPlayerControls | undefined>(undefined);
```

Replace `handlePlayerControlsReady` with:

```tsx
  const handlePlayerControlsReady = useCallback((controls: VkPlayerControls | undefined) => {
    playerControlsRef.current = controls;
  }, []);
```

- [ ] **Step 6: Add memoized player callbacks**

Add these `useCallback`s next to `handleTimeUpdate` (they must be stable so the bridge isn't re-created):

```tsx
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
```

Then update `handleTimeUpdate` so its non-held path also stores `currentTimeMs`. Replace the final `setTimeMs(nextTimeMs);` line in `handleTimeUpdate` with:

```tsx
    setTimeMs(nextTimeMs);
    setCurrentTimeMs(nextTimeMs);
```

And in the held-pause branch, after `setTimeMs(pendingPause.holdAtMs);`, add `setCurrentTimeMs(pendingPause.holdAtMs);` so the bar reflects the held time too.

- [ ] **Step 7: Add control handlers**

Add after `toggleFullscreen`:

```tsx
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
```

- [ ] **Step 8: Add the derived UI flags near effectiveTimeMs**

After `const primaryCue = ...`, add:

```tsx
  const showCustomUi = playerMode === "clean" && !isAd;
  const blockInput = showCustomUi;
```

- [ ] **Step 9: Wire VideoPlayer and render the bar + VK toggle**

Replace the player container block (the `<div ref={setPlayerContainer} ...>` ... matching `</div>`, currently spanning the `VideoPlayer`, the subtitle overlay column, and the standalone fullscreen button) with:

```tsx
              <div
                ref={setPlayerContainer}
                data-testid="player-container"
                className={cn(
                  "relative aspect-video overflow-hidden bg-black",
                  isFullscreen ? "" : "rounded-md border border-slate-800",
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
                  <div className="pointer-events-none absolute inset-x-0 bottom-16 flex flex-col items-center gap-1 px-8">
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
                      <div
                        data-testid="secondary-subtitle-slot"
                        className="flex min-h-10 justify-center"
                      >
                        <SubtitleReferenceLine lane={secondaryLane} primaryCue={primaryCue} />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {showCustomUi ? (
                  <div className="absolute inset-x-0 bottom-0 p-2">
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
                    />
                  </div>
                ) : null}

                {!isAd ? (
                  <div className="absolute right-2 top-2 flex gap-2">
                    <button
                      type="button"
                      onClick={toggleVkMode}
                      aria-label={
                        playerMode === "vk"
                          ? "Back to clean controls"
                          : "VK controls (speed, quality)"
                      }
                      title={
                        playerMode === "vk"
                          ? "Back to clean controls"
                          : "VK controls (speed, quality)"
                      }
                      className="rounded-md bg-black/60 p-2 text-white/90 transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                    >
                      {playerMode === "vk" ? (
                        <X className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Settings className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                      title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                      className="rounded-md bg-black/60 p-2 text-white/90 transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                    >
                      {isFullscreen ? (
                        <Minimize2 className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Maximize2 className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
```

(Note: the subtitle overlay column moved from `bottom-7` to `bottom-16` so it sits above the new control bar. The standalone fullscreen button is removed; fullscreen is now the second corner button.)

- [ ] **Step 10: Run the App tests to confirm they pass**

Run: `npm test -- App`
Expected: PASS (the new "App player chrome" suite plus all existing App tests — the existing "App fullscreen" test still finds the "Fullscreen" button in the corner cluster, and subtitle tests still find subtitles in clean mode).

- [ ] **Step 11: Run the full suite and build**

Run: `npm test`
Expected: PASS (all suites).

Run: `npm run build`
Expected: PASS (no unused locals; all imports used).

- [ ] **Step 12: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "$(printf 'feat: кастомная панель управления плеером и режимы\n\nApp хранит состояние плеера (играет/время/длительность/громкость/реклама) и режим clean|vk. В чистом режиме показывается своя панель управления и субтитры, iframe VK не принимает мышь. Угловые кнопки VK и полного экрана видны всегда (кроме рекламы), панель и субтитры прячутся в режиме VK и во время рекламы.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: Documentation

**Files:**
- Modify: `docs/llm/current-behavior.md`
- Modify: `docs/llm/product-context.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update docs/llm/current-behavior.md**

Add a "## Custom Player Chrome" section describing: the app renders its own control bar (play/pause, seek, time, volume/mute) over the VK iframe; in clean mode the iframe ignores mouse input so VK's controls/cards stay hidden; corner buttons toggle a "VK" mode (native VK UI for speed/quality, which the JS API does not expose) and fullscreen; on `adStarted` the app steps aside (re-enables VK input, hides our chrome) and restores on `adCompleted`. Note speed/quality are reachable only via the VK toggle. Note Phase 2 (learning controls) is planned.

- [ ] **Step 2: Update docs/llm/product-context.md**

Add a capability bullet: "Render a custom player control bar over VK and cover VK's native chrome (with a VK-mode toggle for speed/quality)." Move "controlling the VK player's own UI" framing accordingly. Keep speed/quality-as-native-controls and PiP as non-goals.

- [ ] **Step 3: Update AGENTS.md**

In the Codebase Map add `src/components/player-controls.tsx`. In VK Integration Facts, record the confirmed `VK.VideoPlayer` JS-API surface (methods + events) and the fact that speed and quality are not in the API. Adjust the scope note about not controlling VK's player to reflect the custom chrome.

- [ ] **Step 4: Commit**

```bash
git add docs/llm/current-behavior.md docs/llm/product-context.md AGENTS.md
git commit -m "$(printf 'docs: кастомный интерфейс плеера и API VK\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 7: Full verification

- [ ] **Step 1: Frontend checks**

Run: `npm test` → all suites PASS.
Run: `npm run build` → PASS.
Run: `git diff --check` → no whitespace errors.

- [ ] **Step 2: Backend unaffected (sanity)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS (no backend changes this phase).

- [ ] **Step 3: Manual verification (HUMAN, requires network + WebView2)**

Run `npm run tauri dev`, load `https://vkvideo.ru/video-145784486_456239038`, and confirm:
- Clean mode shows only our control bar + subtitles; VK's control bar/logo/cards do not appear on hover.
- Play/pause, seek, volume/mute work; time + duration update.
- The VK (gear) corner button switches to VK's native UI (gear reachable for speed/quality) and back; fullscreen corner button still works and keeps subtitles.
- If an ad plays, our chrome disappears and the ad is interactive; afterward clean mode resumes.
- Re-confirm the first-play behavior recorded in Task 3.

---

## Self-Review Notes

- **Spec coverage:** expanded bridge (T1); VideoPlayer callbacks + `blockInput` clean cover (T2); autoplay spike (T3); control bar play/pause/seek/volume/time (T4); App modes clean/vk/ad + wiring + VK toggle + ad step-aside (T5); docs incl. API findings + speed/quality limitation (T6); verification (T7). Fullscreen is preserved as a corner button (Design Refinement) rather than inside the bar, with stated reasoning.
- **Type consistency:** `VkPlayerControls` = `{play,pause,seek(seconds),setVolume,mute,unmute,destroy}` used in bridge, VideoPlayer `onControlsReady`, and App ref. Bridge `seek` takes seconds; App `handleSeek` converts ms→seconds. Callback names (`onDurationChange`, `onPlayingChange`, `onVolumeChange`, `onAdChange`) match across bridge, VideoPlayer, and App.
- **No placeholders:** every code step shows full code; every run step states the expected result. The only intentionally manual steps are the Task 3 spike and Task 7 Step 3, both explicitly human-run.
