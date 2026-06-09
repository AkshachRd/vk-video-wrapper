import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useControlsAutoHide } from "./use-controls-auto-hide";

describe("useControlsAutoHide", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays visible and never hides while inactive", () => {
    const { result } = renderHook(() => useControlsAutoHide({ active: false, hideDelayMs: 1000 }));

    expect(result.current.visible).toBe(true);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.visible).toBe(true);
  });

  it("hides after the delay once active", () => {
    const { result } = renderHook(() => useControlsAutoHide({ active: true, hideDelayMs: 1000 }));

    expect(result.current.visible).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.visible).toBe(false);
  });

  it("reveal() shows again and re-arms the hide timer while active", () => {
    const { result } = renderHook(() => useControlsAutoHide({ active: true, hideDelayMs: 1000 }));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.visible).toBe(false);

    act(() => {
      result.current.reveal();
    });
    expect(result.current.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.visible).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.visible).toBe(false);
  });

  it("shows and stops hiding when active turns false", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useControlsAutoHide({ active, hideDelayMs: 1000 }),
      { initialProps: { active: true } },
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.visible).toBe(false);

    rerender({ active: false });
    expect(result.current.visible).toBe(true);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.visible).toBe(true);
  });
});
