import { afterEach, describe, expect, it } from "vitest";

import { buildGraph } from "./graph-model";
import { applyPersisted, clearGraphState, loadGraphState, saveGraphState } from "./persistence";
import type { SavedWord } from "@/lib/saved-words/types";

function word(id: string, tags: string[]): SavedWord {
  return {
    id,
    normalizedWord: id,
    displayWord: id,
    language: "de",
    languageName: null,
    firstMeaning: null,
    source: null,
    sourceUrl: null,
    createdAtMs: 0,
    updatedAtMs: 0,
    tags,
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("persistence", () => {
  it("save → load восстанавливает камеру и позиции", () => {
    saveGraphState({ cam: { x: 1, y: 2, scale: 1.5 }, pos: { "word:a": [10, 20] } });
    const loaded = loadGraphState();
    expect(loaded?.cam).toEqual({ x: 1, y: 2, scale: 1.5 });
    expect(loaded?.pos["word:a"]).toEqual([10, 20]);
  });

  it("load возвращает null при отсутствии и при битом JSON", () => {
    expect(loadGraphState()).toBeNull();
    localStorage.setItem("lupa-graph-v1", "{not json");
    expect(loadGraphState()).toBeNull();
  });

  it("clearGraphState стирает ключ", () => {
    saveGraphState({ cam: { x: 0, y: 0, scale: 1 }, pos: {} });
    clearGraphState();
    expect(loadGraphState()).toBeNull();
  });

  it("applyPersisted ставит координаты известным id и игнорирует устаревшие", () => {
    const data = buildGraph([word("a", [])]);
    applyPersisted(data.nodes, { cam: { x: 0, y: 0, scale: 1 }, pos: { "word:a": [7, 8], "word:ghost": [1, 1] } });
    const a = data.nodes.find((n) => n.id === "word:a")!;
    expect([a.x, a.y]).toEqual([7, 8]);
  });
});
