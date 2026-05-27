import type { SubtitleCue, SubtitleWord } from "./types";

const TIMING_SEPARATOR = "-->";
const INLINE_TIMESTAMP_RE = /<((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})>/g;
const TAG_RE = /<\/?[a-z][^>]*>/gi;
const EDGE_PUNCTUATION_RE = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;

export function parseWebVtt(raw: string): SubtitleCue[] {
  const blocks = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim());
    const timingIndex = lines.findIndex((line) => line.includes(TIMING_SEPARATOR));

    if (timingIndex === -1) {
      continue;
    }

    const timing = parseTimingLine(lines[timingIndex]);

    if (!timing) {
      continue;
    }

    const id = getCueId(lines.slice(0, timingIndex), cues.length);
    const rawText = lines.slice(timingIndex + 1).join("\n");
    const text = cleanCueText(rawText);

    if (!text) {
      continue;
    }

    cues.push({
      id,
      startMs: timing.startMs,
      endMs: timing.endMs,
      text,
      words: tokenizeWords(rawText, id),
    });
  }

  return cues;
}

export function cleanWord(word: string): string {
  return word.replace(EDGE_PUNCTUATION_RE, "");
}

function parseTimingLine(line: string): { startMs: number; endMs: number } | undefined {
  const [startRaw, endAndSettingsRaw] = line.split(TIMING_SEPARATOR);

  if (!startRaw || !endAndSettingsRaw) {
    return undefined;
  }

  const endRaw = endAndSettingsRaw.trim().split(/\s+/)[0];
  const startMs = parseTimestamp(startRaw.trim());
  const endMs = parseTimestamp(endRaw);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return undefined;
  }

  return { startMs, endMs };
}

function parseTimestamp(value: string): number {
  const normalized = value.replace(",", ".");
  const parts = normalized.split(":");
  const secondsRaw = parts.pop();

  if (!secondsRaw) {
    return Number.NaN;
  }

  const seconds = Number(secondsRaw);
  const minutes = Number(parts.pop() ?? 0);
  const hours = Number(parts.pop() ?? 0);

  if (!Number.isFinite(seconds) || !Number.isFinite(minutes) || !Number.isFinite(hours)) {
    return Number.NaN;
  }

  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}

function getCueId(linesBeforeTiming: string[], cueCount: number): string {
  const id = linesBeforeTiming
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isHeaderOrMetadataLine(line))
    .at(-1);

  return id ?? `cue-${cueCount + 1}`;
}

function isHeaderOrMetadataLine(line: string): boolean {
  return line === "WEBVTT" || line.startsWith("WEBVTT ") || /^[A-Za-z-]+:\s*/.test(line);
}

function cleanCueText(rawText: string): string {
  return rawText
    .split("\n")
    .map((line) => cleanCueLine(line))
    .filter(Boolean)
    .join("\n");
}

function cleanCueLine(line: string): string {
  return line
    .replace(INLINE_TIMESTAMP_RE, " ")
    .replace(TAG_RE, "")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
}

function tokenizeWords(rawText: string, cueId: string): SubtitleWord[] {
  const words: SubtitleWord[] = [];
  let pendingStartMs: number | undefined;
  let cursor = 0;

  for (const match of rawText.matchAll(INLINE_TIMESTAMP_RE)) {
    const matchIndex = match.index ?? cursor;
    appendWords(rawText.slice(cursor, matchIndex), cueId, words, pendingStartMs);
    pendingStartMs = parseTimestamp(match[1]);
    cursor = matchIndex + match[0].length;
  }

  appendWords(rawText.slice(cursor), cueId, words, pendingStartMs);

  return words;
}

function appendWords(
  rawChunk: string,
  cueId: string,
  words: SubtitleWord[],
  pendingStartMs: number | undefined,
): void {
  let nextStartMs = pendingStartMs;
  const cleanedChunk = rawChunk.replace(TAG_RE, " ").replace(/[ \t\n\f\r\v]+/g, " ").trim();

  if (!cleanedChunk) {
    return;
  }

  for (const text of cleanedChunk.split(/\s+/)) {
    const word: SubtitleWord = {
      id: `${cueId}:${words.length}`,
      text,
      cleanText: cleanWord(text),
    };

    if (nextStartMs !== undefined) {
      word.startMs = nextStartMs;
      nextStartMs = undefined;
    }

    words.push(word);
  }
}
