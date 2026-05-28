export type SupportedLookupLanguage = "de" | "en" | "ru";

export interface WordLookup {
  query: string;
  headword: string;
  language: SupportedLookupLanguage;
  languageName: "Немецкий" | "Английский" | "Русский";
  ipa: string | null;
  partOfSpeech: string | null;
  grammar: string[];
  meanings: string[];
  source: "ruwiktionary-kaikki";
  sourceUrl: string | null;
}

export type WordLookupState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; data: WordLookup }
  | { status: "not-found"; query: string }
  | { status: "unavailable"; query: string };
