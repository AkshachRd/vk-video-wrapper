import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MobileWordGraphScreen } from "./mobile-word-graph-screen";
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

describe("MobileWordGraphScreen", () => {
  it("рисует заголовок и зовёт onBack", async () => {
    const onBack = vi.fn();
    render(<MobileWordGraphScreen words={[word("muss", ["aufgabe"])]} onBack={onBack} />);
    expect(screen.getByText("Граф слов")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("пустое состояние без слов", () => {
    render(<MobileWordGraphScreen words={[]} onBack={vi.fn()} />);
    expect(screen.getByText(/Сохранённых слов пока нет/)).toBeInTheDocument();
  });
});
