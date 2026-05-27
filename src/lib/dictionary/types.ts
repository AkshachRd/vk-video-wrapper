export interface GermanWordLookup {
  query: string;
  headword: string;
  ipa?: string;
  partOfSpeech?: string;
  grammar: string[];
  meanings: string[];
  source: "ruwiktionary";
  sourceUrl?: string;
}

export type WordLookupState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; data: GermanWordLookup }
  | { status: "not-found"; query: string }
  | { status: "unavailable"; query: string };
