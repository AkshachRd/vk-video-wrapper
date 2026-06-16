import { describe, expect, it } from "vitest";

import type { SavedWord } from "./types";
import { collectTagOptions, normalizeTag, wordMatchesSelectedTags } from "./tags";

function word(overrides: Partial<SavedWord> = {}): SavedWord {
  return {
    id: "de:haus",
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

describe("tags helpers", () => {
  it("normalizes by trimming and lowercasing", () => {
    expect(normalizeTag("  Глаголы ")).toBe("глаголы");
  });

  it("collects a unique, sorted option per normalized key", () => {
    const options = collectTagOptions([
      word({ id: "de:haus", tags: ["Спорт", "глаголы"] }),
      word({ id: "en:house", tags: ["спорт"] }),
    ]);

    expect(options.map((option) => option.key)).toEqual(["глаголы", "спорт"]);
    expect(options.find((option) => option.key === "спорт")?.display).toBe("Спорт");
  });

  it("matches a word when any selected key is present (OR)", () => {
    const haus = word({ tags: ["дом"] });

    expect(wordMatchesSelectedTags(haus, [])).toBe(true);
    expect(wordMatchesSelectedTags(haus, ["дом", "мир"])).toBe(true);
    expect(wordMatchesSelectedTags(haus, ["мир"])).toBe(false);
  });
});
