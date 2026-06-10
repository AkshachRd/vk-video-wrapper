import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Wave } from "./wave";

describe("Wave", () => {
  it("renders a decorative divider hidden from the accessibility tree", () => {
    const { container } = render(<Wave className="h-3" />);
    const wave = container.firstElementChild;

    expect(wave).not.toBeNull();
    expect(wave).toHaveAttribute("aria-hidden", "true");
    expect(wave!.className).toContain("h-3");
  });
});
