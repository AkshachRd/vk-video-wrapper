import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VideoPlayer } from "./video-player";

const mocks = vi.hoisted(() => ({
  createVkPlayerBridge: vi.fn(),
  loadVkPlayerScript: vi.fn(),
}));

vi.mock("@/lib/vk-player/vk-player-bridge", () => ({
  createVkPlayerBridge: mocks.createVkPlayerBridge,
  loadVkPlayerScript: mocks.loadVkPlayerScript,
}));

describe("VideoPlayer", () => {
  beforeEach(() => {
    mocks.createVkPlayerBridge.mockReset();
    mocks.loadVkPlayerScript.mockReset();
  });

  it("contains script load failures without initializing the bridge", async () => {
    mocks.loadVkPlayerScript.mockRejectedValue(new Error("network failed"));

    render(
      <VideoPlayer
        embedUrl="https://vk.com/video_ext.php?oid=1&id=2"
        onTimeUpdate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mocks.loadVkPlayerScript).toHaveBeenCalledOnce();
    });
    await Promise.resolve();

    expect(mocks.createVkPlayerBridge).not.toHaveBeenCalled();
  });

  it("contains bridge creation failures after the script loads", async () => {
    mocks.loadVkPlayerScript.mockResolvedValue(undefined);
    mocks.createVkPlayerBridge.mockImplementation(() => {
      throw new Error("VK.VideoPlayer is not available");
    });

    render(
      <VideoPlayer
        embedUrl="https://vk.com/video_ext.php?oid=1&id=2"
        onTimeUpdate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mocks.createVkPlayerBridge).toHaveBeenCalledWith({
        iframe: screen.getByTitle("VK Video player"),
        onTimeUpdate: expect.any(Function),
      });
    });
  });
});
