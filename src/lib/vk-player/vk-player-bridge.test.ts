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
