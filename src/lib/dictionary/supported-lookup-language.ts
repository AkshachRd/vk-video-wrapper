import type { SupportedLookupLanguage } from "./types";

export function getSupportedLookupLanguage(lang: string | undefined): SupportedLookupLanguage | undefined {
  const normalized = lang?.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (normalized === "de" || normalized.startsWith("de-")) {
    return "de";
  }

  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }

  if (normalized === "ru" || normalized.startsWith("ru-")) {
    return "ru";
  }

  return undefined;
}
