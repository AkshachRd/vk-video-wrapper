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
    tags: [],
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

  it("filters words by selected tag (OR)", () => {
    const haus = savedWord({ id: "de:haus", displayWord: "Haus", normalizedWord: "haus", tags: ["дом"] });
    const welt = savedWord({ id: "de:welt", displayWord: "Welt", normalizedWord: "welt", tags: ["мир"] });

    render(
      <SavedWordsPanel
        words={[haus, welt]}
        selectedTagKeys={["дом"]}
        onToggleTagFilter={vi.fn()}
        onResetTagFilter={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("Haus")).toBeInTheDocument();
    expect(screen.queryByText("Welt")).not.toBeInTheDocument();
  });

  it("shows the visible-of-total counter when filtered", () => {
    const haus = savedWord({ id: "de:haus", displayWord: "Haus", normalizedWord: "haus", tags: ["дом"] });
    const welt = savedWord({ id: "de:welt", displayWord: "Welt", normalizedWord: "welt", tags: ["мир"] });

    render(
      <SavedWordsPanel
        words={[haus, welt]}
        selectedTagKeys={["дом"]}
        onToggleTagFilter={vi.fn()}
        onResetTagFilter={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("из 02")).toBeInTheDocument();
  });

  it("shows an empty-filter message when nothing matches", () => {
    const haus = savedWord({ id: "de:haus", tags: ["дом"] });

    render(
      <SavedWordsPanel
        words={[haus]}
        selectedTagKeys={["несуществующий"]}
        onToggleTagFilter={vi.fn()}
        onResetTagFilter={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("Нет слов с выбранными тегами")).toBeInTheDocument();
  });

  it("hides tag controls when the store is unavailable", () => {
    const haus = savedWord({ tags: ["дом"] });

    render(<SavedWordsPanel words={[haus]} isUnavailable onRemove={vi.fn()} />);

    expect(screen.queryByLabelText("Фильтр по тегам")).not.toBeInTheDocument();
  });

  it("показывает кнопку «граф» и зовёт onOpenGraph", async () => {
    const onOpenGraph = vi.fn();
    render(
      <SavedWordsPanel
        words={[
          {
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
          },
        ]}
        onRemove={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        onOpenGraph={onOpenGraph}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Граф слов" }));
    expect(onOpenGraph).toHaveBeenCalled();
  });

  it("не рисует кнопку «граф» без onOpenGraph или без слов", () => {
    const { rerender } = render(<SavedWordsPanel words={[]} onRemove={vi.fn()} onOpenGraph={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Граф слов" })).toBeNull(); // нет слов
    rerender(
      <SavedWordsPanel
        words={[
          {
            id: "a",
            normalizedWord: "m",
            displayWord: "m",
            language: "de",
            languageName: null,
            firstMeaning: null,
            source: null,
            sourceUrl: null,
            createdAtMs: 0,
            updatedAtMs: 0,
            tags: [],
          },
        ]}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Граф слов" })).toBeNull(); // нет колбэка
  });
});
