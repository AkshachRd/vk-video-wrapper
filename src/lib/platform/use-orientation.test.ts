import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useOrientation } from "./use-orientation";

function stubMatchMedia(landscape: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("landscape") ? landscape : !landscape,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("useOrientation", () => {
  it("returns landscape when the landscape media query matches", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useOrientation());
    expect(result.current).toBe("landscape");
  });

  it("returns portrait otherwise", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useOrientation());
    expect(result.current).toBe("portrait");
  });
});
