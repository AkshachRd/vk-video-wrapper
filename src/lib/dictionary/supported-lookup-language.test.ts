import { describe, expect, it } from "vitest";

import { getSupportedLookupLanguage } from "./supported-lookup-language";

describe("getSupportedLookupLanguage", () => {
  it("accepts German, English, and Russian language tags", () => {
    expect(getSupportedLookupLanguage("de")).toBe("de");
    expect(getSupportedLookupLanguage(" de-DE ")).toBe("de");
    expect(getSupportedLookupLanguage("en-US")).toBe("en");
    expect(getSupportedLookupLanguage("ru-RU")).toBe("ru");
  });

  it("rejects missing and unsupported language tags", () => {
    expect(getSupportedLookupLanguage("")).toBeUndefined();
    expect(getSupportedLookupLanguage(undefined)).toBeUndefined();
    expect(getSupportedLookupLanguage("fr")).toBeUndefined();
  });
});
