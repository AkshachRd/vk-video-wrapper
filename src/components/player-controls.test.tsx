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
