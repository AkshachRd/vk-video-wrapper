import { describe, expect, it } from "vitest";

import { isGermanTrackLang } from "./is-german-track";

describe("isGermanTrackLang", () => {
  it("accepts de and de region tags", () => {
    expect(isGermanTrackLang("de")).toBe(true);
    expect(isGermanTrackLang(" de-DE ")).toBe(true);
  });

  it("rejects missing and non-German language tags", () => {
    expect(isGermanTrackLang("")).toBe(false);
    expect(isGermanTrackLang(undefined)).toBe(false);
    expect(isGermanTrackLang("ru")).toBe(false);
  });
});
