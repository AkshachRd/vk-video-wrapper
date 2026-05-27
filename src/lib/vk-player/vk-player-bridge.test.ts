import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVkPlayerBridge, loadVkPlayerScript } from "./vk-player-bridge";

type TimeUpdatePayload = { time?: number };
type TimeUpdateHandler = (payload: TimeUpdatePayload) => void;

describe("createVkPlayerBridge", () => {
  it("subscribes to timeupdate and reports rounded milliseconds", () => {
    const handlers = new Map<string, TimeUpdateHandler>();
    const fakePlayer = {
      on: vi.fn((event: string, handler: TimeUpdateHandler) => {
        handlers.set(event, handler);
      }),
      off: vi.fn(),
      pause: vi.fn(),
      destroy: vi.fn(),
    };
    const iframe = document.createElement("iframe");
    const onTimeUpdate = vi.fn();

    const bridge = createVkPlayerBridge({
      iframe,
      playerFactory: () => fakePlayer,
      onTimeUpdate,
    });

    handlers.get("timeupdate")?.({ time: 12.3456 });

    expect(onTimeUpdate).toHaveBeenCalledWith(12346);

    bridge.pause();

    expect(fakePlayer.pause).toHaveBeenCalled();

    bridge.destroy();

    expect(fakePlayer.off).toHaveBeenCalledWith("timeupdate", handlers.get("timeupdate"));
    expect(fakePlayer.destroy).toHaveBeenCalled();
  });

  it("reports playback start when VK starts or resumes playback", () => {
    const handlers = new Map<string, TimeUpdateHandler>();
    const fakePlayer = {
      on: vi.fn((event: string, handler: TimeUpdateHandler) => {
        handlers.set(event, handler);
      }),
      off: vi.fn(),
      pause: vi.fn(),
      destroy: vi.fn(),
    };
    const iframe = document.createElement("iframe");
    const onPlaybackStart = vi.fn();

    const bridge = createVkPlayerBridge({
      iframe,
      playerFactory: () => fakePlayer,
      onTimeUpdate: vi.fn(),
      onPlaybackStart,
    });

    handlers.get("started")?.({});
    handlers.get("resumed")?.({});

    expect(onPlaybackStart).toHaveBeenCalledTimes(2);

    bridge.destroy();

    expect(fakePlayer.off).toHaveBeenCalledWith("started", handlers.get("started"));
    expect(fakePlayer.off).toHaveBeenCalledWith("resumed", handlers.get("resumed"));
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
