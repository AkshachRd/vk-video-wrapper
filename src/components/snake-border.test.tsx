import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SnakeBorder } from "./snake-border";

function renderInHost(shape?: "pill" | "round" | "circle") {
  const result = render(
    <button type="button" className="group/snake relative">
      hover me
      <SnakeBorder shape={shape} />
    </button>,
  );
  const host = result.getByRole("button");
  const svg = host.querySelector("svg")!;
  const path = svg.querySelector("path")!;
  return { host, svg, path };
}

describe("SnakeBorder", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders a decorative ring with a generated closed path", () => {
    const { svg, path } = renderInHost("round");

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("data-shape", "round");
    expect(path.getAttribute("d")).toMatch(/^M.+Z$/);
  });

  it("starts the phase animation on hover and stops on leave", () => {
    const { host } = renderInHost();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    fireEvent.mouseEnter(host);
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);

    fireEvent.mouseLeave(host);
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("stops the animation and removes listeners on unmount", () => {
    const result = render(
      <button type="button" className="group/snake relative">
        hover me
        <SnakeBorder />
      </button>,
    );
    const host = result.getByRole("button");

    fireEvent.mouseEnter(host);
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);

    result.unmount();

    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("keeps the ring static under prefers-reduced-motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true } as MediaQueryList),
    );
    const { host, path } = renderInHost();

    fireEvent.mouseEnter(host);

    expect(path.getAttribute("d")).toMatch(/^M.+Z$/);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
