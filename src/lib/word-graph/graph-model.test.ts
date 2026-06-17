import { describe, expect, it } from "vitest";

import type { SavedWord } from "@/lib/saved-words/types";
import { buildGraph } from "./graph-model";

function word(overrides: Partial<SavedWord> = {}): SavedWord {
  return {
    id: "de-haus",
    normalizedWord: "haus",
    displayWord: "Haus",
    language: "de",
    languageName: "Немецкий",
    firstMeaning: "дом",
    source: null,
    sourceUrl: null,
    createdAtMs: 1000,
    updatedAtMs: 1000,
    tags: [],
    ...overrides,
  };
}

describe("buildGraph", () => {
  it("создаёт по узлу на слово и по узлу на уникальный тег", () => {
    const { nodes } = buildGraph([
      word({ id: "a", displayWord: "muss", tags: ["aufgabe", "pflicht"] }),
      word({ id: "b", displayWord: "arbeit", tags: ["Aufgabe"] }), // дедуп по нормализованному ключу
    ]);
    const words = nodes.filter((n) => n.type === "word");
    const tags = nodes.filter((n) => n.type === "tag");
    expect(words).toHaveLength(2);
    expect(tags.map((t) => t.key).sort()).toEqual(["aufgabe", "pflicht"]);
  });

  it("связывает слово с каждым его тегом и считает степень тега", () => {
    const { nodes, links } = buildGraph([
      word({ id: "a", tags: ["aufgabe", "pflicht"] }),
      word({ id: "b", tags: ["aufgabe"] }),
    ]);
    expect(links).toHaveLength(3);
    const aufgabe = nodes.find((n) => n.key === "aufgabe")!;
    expect(aufgabe.deg).toBe(2);
    expect(aufgabe.r).toBeCloseTo(15 + 2 * 1.7, 5);
    const wordA = nodes.find((n) => n.id === "word:a")!;
    expect(wordA.r).toBe(7);
    expect(wordA.neighbors).toContain(aufgabe.id);
    expect(aufgabe.neighbors).toContain("word:a");
  });

  it("слова без тегов остаются изолированными узлами", () => {
    const { nodes, links } = buildGraph([word({ id: "lonely", tags: [] })]);
    expect(links).toHaveLength(0);
    const n = nodes.find((x) => x.id === "word:lonely")!;
    expect(n.neighbors).toHaveLength(0);
    expect(n.deg).toBe(0);
  });

  it("даёт префиксованные id и берёт lang/meaning из слова", () => {
    const { nodes } = buildGraph([
      word({ id: "x", displayWord: "no", language: "en", firstMeaning: "нет", tags: ["negation"] }),
    ]);
    const w = nodes.find((n) => n.id === "word:x")!;
    expect(w.lang).toBe("EN");
    expect(w.meaning).toBe("нет");
    expect(w.tags).toEqual(["negation"]);
    const t = nodes.find((n) => n.type === "tag")!;
    expect(t.id).toBe("tag:negation");
  });
});
