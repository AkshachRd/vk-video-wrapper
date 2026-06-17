import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SavedWordsSheetContent } from "./saved-words-sheet-content";

const w = {
  id: "a",
  normalizedWord: "muss",
  displayWord: "muss",
  language: "de",
  languageName: null,
  firstMeaning: "должен",
  source: null,
  sourceUrl: null,
  createdAtMs: 0,
  updatedAtMs: 0,
  tags: ["aufgabe"],
};

describe("SavedWordsSheetContent · граф", () => {
  it("показывает кнопку «Открыть граф» и зовёт onOpenGraph", async () => {
    const onOpenGraph = vi.fn();
    render(
      <SavedWordsSheetContent
        words={[w]}
        onRemove={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        onOpenGraph={onOpenGraph}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Открыть граф" }));
    expect(onOpenGraph).toHaveBeenCalled();
  });

  it("без слов кнопки нет", () => {
    render(<SavedWordsSheetContent words={[]} onRemove={vi.fn()} onOpenGraph={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Открыть граф" })).toBeNull();
  });
});
