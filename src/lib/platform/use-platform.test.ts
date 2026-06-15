import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { usePlatform } from "./use-platform";

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("usePlatform", () => {
  it("defaults to desktop outside Tauri without an override", async () => {
    const { result } = renderHook(() => usePlatform());
    // jsdom не имеет __TAURI_INTERNALS__ → плагин не дёргается, остаёмся desktop
    await waitFor(() => expect(result.current).toBe("desktop"));
  });

  it("honours the ?platform=mobile dev override", () => {
    window.history.replaceState({}, "", "/?platform=mobile");
    const { result } = renderHook(() => usePlatform());
    expect(result.current).toBe("mobile");
  });

  it("honours the ?platform=desktop dev override", () => {
    window.history.replaceState({}, "", "/?platform=desktop");
    const { result } = renderHook(() => usePlatform());
    expect(result.current).toBe("desktop");
  });
});
