import type { SavedWord } from "./types";

export interface TagOption {
  key: string;
  display: string;
}

export function normalizeTag(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function collectTagOptions(words: SavedWord[]): TagOption[] {
  const byKey = new Map<string, TagOption>();

  for (const word of words) {
    for (const tag of word.tags) {
      const key = normalizeTag(tag);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, { key, display: tag.trim() });
    }
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function wordMatchesSelectedTags(word: SavedWord, selectedKeys: string[]): boolean {
  if (selectedKeys.length === 0) return true;
  const keys = new Set(word.tags.map(normalizeTag));
  return selectedKeys.some((key) => keys.has(key));
}
