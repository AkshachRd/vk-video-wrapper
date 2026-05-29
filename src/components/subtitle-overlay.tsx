import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WordLookupPopover } from "@/components/word-lookup-popover";
import type { WordLookupState } from "@/lib/dictionary/types";
import type { WordSaveControl } from "@/lib/saved-words/types";
import { selectActiveCue } from "@/lib/subtitles/select-active-cue";
import type { SubtitleCue, SubtitleLane, SubtitleWord } from "@/lib/subtitles/types";

type SubtitleOverlayProps = {
  lane: SubtitleLane;
  timeMs: number;
  wordLookup?: WordLookupState;
  onWordInspect?: (cue: SubtitleCue, word: SubtitleWord) => void;
  onWordInspectEnd?: () => void;
  getWordSaveControl?: (
    cue: SubtitleCue,
    word: SubtitleWord,
    fallbackWord: string,
    lookup: WordLookupState,
  ) => WordSaveControl | undefined;
};

const IDLE_WORD_LOOKUP: WordLookupState = { status: "idle" };

function normalizedLookupWord(word: string): string {
  return word.trim().toLowerCase();
}

function lookupForWord(lookup: WordLookupState | undefined, fallbackWord: string): WordLookupState {
  if (!lookup || lookup.status === "idle") {
    return IDLE_WORD_LOOKUP;
  }

  return normalizedLookupWord(lookup.query) === normalizedLookupWord(fallbackWord)
    ? lookup
    : IDLE_WORD_LOOKUP;
}

export function SubtitleOverlay({
  lane,
  timeMs,
  wordLookup,
  onWordInspect,
  onWordInspectEnd,
  getWordSaveControl,
}: SubtitleOverlayProps) {
  const cue = selectActiveCue(lane.cues, timeMs);
  if (!cue) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 flex justify-center px-8">
      <div className="pointer-events-auto max-w-4xl rounded-md bg-black/70 px-4 py-3 text-center text-2xl leading-relaxed text-white shadow-lg">
        {cue.words.map((word) => {
          const fallbackWord = word.cleanText || word.text;
          const lookup = lookupForWord(wordLookup, fallbackWord);
          const saveControl = getWordSaveControl?.(cue, word, fallbackWord, lookup);

          return (
            <Popover
              key={word.id}
              onOpenChange={(open) => {
                if (open) {
                  onWordInspect?.(cue, word);
                  return;
                }

                onWordInspectEnd?.();
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="mx-1 rounded-sm px-1 text-white underline-offset-4 transition-colors hover:bg-white/15 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                >
                  {word.text}
                </button>
              </PopoverTrigger>
              <PopoverContent aria-label={`Word details: ${fallbackWord}`}>
                <WordLookupPopover fallbackWord={fallbackWord} lookup={lookup} saveControl={saveControl} />
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}
