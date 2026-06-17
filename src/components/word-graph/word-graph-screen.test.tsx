import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WordGraphScreen } from "./word-graph-screen";
import type { SavedWord } from "@/lib/saved-words/types";

function word(id: string, tags: string[]): SavedWord {
  return {
    id,
    normalizedWord: id,
    displayWord: id,
    language: "de",
    languageName: null,
    firstMeaning: id,
    source: null,
    sourceUrl: null,
    createdAtMs: 0,
    updatedAtMs: 0,
    tags,
  };
}

describe("WordGraphScreen", () => {
  it("рисует заголовок, счётчики и кнопку назад", async () => {
    const onBack = vi.fn();
    // три слова при двух тегах (один тег несут два слова) → счётчик слов «3»
    // уникален среди всех чисел на экране (тегов 2, степени чипов 2 и 1)
    render(
      <WordGraphScreen
        words={[word("muss", ["aufgabe"]), word("nein", ["aufgabe"]), word("tag", ["zeit"])]}
        onBack={onBack}
      />,
    );
    expect(screen.getByRole("heading", { name: "Граф слов" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // 3 слова (тегов 2)
    await userEvent.click(screen.getByRole("button", { name: /к плееру/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("показывает пустое состояние без слов", () => {
    render(<WordGraphScreen words={[]} onBack={vi.fn()} />);
    expect(screen.getByText(/Сохранённых слов пока нет/)).toBeInTheDocument();
  });

  it("чип фильтра по тегу присутствует", () => {
    render(<WordGraphScreen words={[word("muss", ["aufgabe"])]} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: /aufgabe/ })).toBeInTheDocument();
  });
});
