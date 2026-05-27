export function isGermanTrackLang(lang: string | undefined): boolean {
  const normalized = lang?.trim().toLowerCase() ?? "";
  return normalized === "de" || normalized.startsWith("de-");
}
