import { describe, expect, it } from "vitest";

import { normalizeSavedWord } from "./normalize-saved-word";

describe("normalizeSavedWord", () => {
  it("trims and lowercases words for saved-word matching", () => {
    expect(normalizeSavedWord(" House ")).toBe("house");
    expect(normalizeSavedWord("Дом")).toBe("дом");
  });
});
