import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SavedWord } from "@/lib/saved-words/types";

import { SavedWordsPanel } from "./saved-words-panel";

function savedWord(overrides: Partial<SavedWord> = {}): SavedWord {
  return {
    id: "de:welt",
    normalizedWord: "welt",
    displayWord: "Welt",
    language: "de",
    languageName: "Немецкий",
    firstMeaning: "мир",
    source: "ruwiktionary-kaikki",
    sourceUrl: "https://kaikki.org/example",
    createdAtMs: 1000,
    updatedAtMs: 1000,
    ...overrides,
  };
}

describe("SavedWordsPanel", () => {
  it("renders saved words with language and first meaning", () => {
    render(<SavedWordsPanel words={[savedWord()]} onRemove={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Сохраненные слова" })).toBeInTheDocument();
    expect(screen.getByText("Welt")).toBeInTheDocument();
    expect(screen.getByText("de")).toBeInTheDocument();
    expect(screen.getByText("мир")).toBeInTheDocument();
  });

  it("renders a quiet empty state", () => {
    render(<SavedWordsPanel words={[]} onRemove={vi.fn()} />);

    expect(screen.getByText("Сохраненных слов пока нет")).toBeInTheDocument();
  });

  it("renders unavailable state", () => {
    render(<SavedWordsPanel words={[]} isUnavailable onRemove={vi.fn()} />);

    expect(screen.getByText("Список слов недоступен")).toBeInTheDocument();
  });

  it("removes a saved word from the panel", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<SavedWordsPanel words={[savedWord()]} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "Удалить Welt" }));

    expect(onRemove).toHaveBeenCalledWith(savedWord());
  });

  it("marks the freshly saved word for the flash highlight", () => {
    render(<SavedWordsPanel words={[savedWord()]} freshWordId="de:welt" onRemove={vi.fn()} />);

    expect(screen.getByText("Welt").closest("[data-fresh='true']")).not.toBeNull();
  });

  it("does not mark stale words as fresh", () => {
    render(<SavedWordsPanel words={[savedWord()]} onRemove={vi.fn()} />);

    expect(screen.getByText("Welt").closest("[data-fresh='true']")).toBeNull();
  });
});
