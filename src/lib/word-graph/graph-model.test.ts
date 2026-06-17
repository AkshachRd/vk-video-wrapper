import { describe, expect, it } from "vitest";

import type { SavedWord } from "@/lib/saved-words/types";
import { buildGraph, matchNodes, reconcileGraph, seedLayout } from "./graph-model";

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

describe("seedLayout", () => {
  it("разносит узлы из начала координат (теги ближе, слова дальше)", () => {
    const data = buildGraph([word({ id: "a", tags: ["aufgabe"] })]);
    seedLayout(data);
    for (const n of data.nodes) {
      expect(Math.hypot(n.x, n.y)).toBeGreaterThan(0);
      expect(n.phase).toBeGreaterThanOrEqual(0);
    }
    const tag = data.nodes.find((n) => n.type === "tag")!;
    const wordN = data.nodes.find((n) => n.type === "word")!;
    expect(Math.hypot(tag.x, tag.y)).toBeLessThan(Math.hypot(wordN.x, wordN.y));
  });
});

describe("reconcileGraph", () => {
  it("сохраняет координаты выживших узлов и засевает новые", () => {
    const prev = buildGraph([word({ id: "a", tags: ["aufgabe"] })]);
    seedLayout(prev);
    const a = prev.nodes.find((n) => n.id === "word:a")!;
    a.x = 123;
    a.y = -45;
    a.vx = 2;

    const next = buildGraph([
      word({ id: "a", tags: ["aufgabe"] }),
      word({ id: "b", tags: ["aufgabe"] }),
    ]);
    const merged = reconcileGraph(prev, next);

    const keptA = merged.nodes.find((n) => n.id === "word:a")!;
    expect(keptA.x).toBe(123);
    expect(keptA.y).toBe(-45);
    expect(keptA.vx).toBe(2);

    const newB = merged.nodes.find((n) => n.id === "word:b")!;
    expect(Math.hypot(newB.x, newB.y)).toBeGreaterThan(0); // засеян
  });

  it("отбрасывает узлы, которых больше нет", () => {
    const prev = buildGraph([word({ id: "a", tags: ["aufgabe"] })]);
    seedLayout(prev);
    const next = buildGraph([word({ id: "b", tags: ["aufgabe"] })]);
    const merged = reconcileGraph(prev, next);
    expect(merged.nodes.find((n) => n.id === "word:a")).toBeUndefined();
    expect(merged.nodes.find((n) => n.id === "word:b")).toBeDefined();
  });
});

describe("matchNodes", () => {
  const data = buildGraph([
    word({ id: "nein", displayWord: "nein", firstMeaning: "нет", tags: ["negation", "decline"] }),
    word({ id: "tag", displayWord: "tag", firstMeaning: "день", tags: ["time"] }),
  ]);

  it("пустой запрос не даёт совпадений", () => {
    const r = matchNodes(data.nodes, "  ");
    expect(r.core.size).toBe(0);
    expect(r.highlight.size).toBe(0);
  });

  it("находит по ярлыку слова и добавляет соседей в highlight", () => {
    const r = matchNodes(data.nodes, "nein");
    expect(r.core.has("word:nein")).toBe(true);
    expect(r.highlight.has("tag:negation")).toBe(true); // сосед
    expect(r.highlight.has("tag:decline")).toBe(true);
  });

  it("находит по значению слова и по ярлыку тега", () => {
    expect(matchNodes(data.nodes, "день").core.has("word:tag")).toBe(true);
    expect(matchNodes(data.nodes, "negation").core.has("tag:negation")).toBe(true);
    // совпадение по тексту тега у слова
    expect(matchNodes(data.nodes, "decline").core.has("word:nein")).toBe(true);
  });

  it("регистронезависимый и по подстроке", () => {
    expect(matchNodes(data.nodes, "NEG").core.has("tag:negation")).toBe(true);
  });
});
