import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GraphFilterRow } from "./graph-filter-row";

const tagOptions = [
  { key: "aufgabe", display: "aufgabe", count: 2 },
  { key: "time", display: "time", count: 1 },
];

describe("GraphFilterRow", () => {
  it("переключает тег-чип и помечает активным", async () => {
    const onToggle = vi.fn();
    render(
      <GraphFilterRow
        tagOptions={tagOptions}
        activeTags={["aufgabe"]}
        onToggleTag={onToggle}
        typeFilter="all"
        onTypeChange={vi.fn()}
      />,
    );
    const chip = screen.getByRole("button", { name: /aufgabe/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /time/ }));
    expect(onToggle).toHaveBeenCalledWith("time");
  });

  it("переключает сегмент типа", async () => {
    const onTypeChange = vi.fn();
    render(
      <GraphFilterRow
        tagOptions={tagOptions}
        activeTags={[]}
        onToggleTag={vi.fn()}
        typeFilter="all"
        onTypeChange={onTypeChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "слова" }));
    expect(onTypeChange).toHaveBeenCalledWith("word");
  });
});
