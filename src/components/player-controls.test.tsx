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

    await user.click(screen.getByRole("button", { name: "Воспроизвести" }));

    expect(props.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("shows a pause affordance when playing", () => {
    setup({ isPlaying: true });

    expect(screen.getByRole("button", { name: "Пауза" })).toBeInTheDocument();
  });

  it("shows volume controls by default", () => {
    setup();
    expect(screen.getByRole("slider", { name: "Громкость" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Выключить звук" })).toBeInTheDocument();
  });

  it("hides volume controls when showVolume is false", () => {
    setup({ showVolume: false });
    expect(screen.queryByRole("slider", { name: "Громкость" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Выключить звук" })).not.toBeInTheDocument();
    // перемотка остаётся
    expect(screen.getByRole("slider", { name: "Перемотка" })).toBeInTheDocument();
  });

  it("renders elapsed and total time as H:MM:SS / M:SS", () => {
    setup({ currentTimeMs: 61000, durationMs: 6203000 });

    expect(screen.getByText("1:01 / 1:43:23")).toBeInTheDocument();
  });

  it("seeks via the progress slider", () => {
    const props = setup({ durationMs: 100000 });

    fireEvent.change(screen.getByRole("slider", { name: "Перемотка" }), {
      target: { value: "50000" },
    });

    expect(props.onSeek).toHaveBeenCalledWith(50000);
  });

  it("steps the seek slider by one second per arrow key press", () => {
    const props = setup({ currentTimeMs: 61000, durationMs: 100000 });

    const slider = screen.getByRole("slider", {
      name: "Перемотка",
    }) as HTMLInputElement;
    // jsdom не воспроизводит нативную обработку стрелок на range, поэтому
    // нажатие стрелки моделируем по спецификации: один шаг = stepUp().
    slider.stepUp();
    fireEvent.change(slider, { target: { value: slider.value } });

    expect(props.onSeek).toHaveBeenCalledWith(62000);
  });

  it("toggles mute and shows the muted icon", async () => {
    const user = userEvent.setup();
    const props = setup({ muted: true });

    expect(screen.getByRole("button", { name: "Включить звук" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Включить звук" }));

    expect(props.onToggleMute).toHaveBeenCalledTimes(1);
  });
});
