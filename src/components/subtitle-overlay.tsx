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
  popoverContainer?: HTMLElement | null;
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
  popoverContainer,
}: SubtitleOverlayProps) {
  const cue = selectActiveCue(lane.cues, timeMs);
  if (!cue) return null;

  return (
    <div className="pointer-events-auto max-w-[92%] rounded-card bg-paper px-[22px] py-[13px] text-center text-[22px] leading-[1.45] font-[450] tracking-[-0.01em] text-ink shadow-[0_16px_40px_-16px_rgba(0,0,0,0.55)]">
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
                className="relative mx-1 inline-block px-px text-ink outline-none after:absolute after:inset-x-0 after:-bottom-[5px] after:h-[5px] after:origin-left after:scale-x-0 after:bg-(image:--wave-ink) after:bg-position-[50%_50%] after:bg-size-[11px_5px] after:bg-repeat-x after:opacity-85 after:transition-transform after:duration-300 after:ease-spring after:content-[''] hover:after:scale-x-100 motion-safe:hover:after:animate-uslither focus-visible:after:scale-x-100 aria-expanded:after:scale-x-100 motion-safe:aria-expanded:after:animate-uslither"
              >
                {word.text}
              </button>
            </PopoverTrigger>
            <PopoverContent
              aria-label={`Слово: ${fallbackWord}`}
              container={popoverContainer}
              className="w-[282px]"
              onOpenAutoFocus={(event) => {
                // Автофокус Radix на кнопке «Сохранить слово» ложно включал её
                // snake-кольцо (reveal по focus-within) ещё до завершения popin.
                event.preventDefault();
              }}
            >
              <WordLookupPopover fallbackWord={fallbackWord} lookup={lookup} saveControl={saveControl} />
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
