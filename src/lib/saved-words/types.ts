export interface SavedWord {
  id: string;
  normalizedWord: string;
  displayWord: string;
  language: string;
  languageName: string | null;
  firstMeaning: string | null;
  source: string | null;
  sourceUrl: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  tags: string[];
}

export interface SaveWordRequest {
  displayWord: string;
  language: string;
  languageName: string | null;
  firstMeaning: string | null;
  source: string | null;
  sourceUrl: string | null;
}

export type WordSaveStatus = "unsaved" | "saving" | "saved" | "removing" | "unavailable";

export type WordSaveControl =
  | {
      status: Exclude<WordSaveStatus, "unavailable">;
      onToggle: () => void;
      error?: string;
    }
  | {
      status: "unavailable";
      error?: string;
      onToggle?: undefined;
    };
