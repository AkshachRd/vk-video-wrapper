import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { selectActiveCue } from "@/lib/subtitles/select-active-cue";
import type { SubtitleCue, SubtitleLane } from "@/lib/subtitles/types";

type SubtitleOverlayProps = {
  lane: SubtitleLane;
  timeMs: number;
  onWordInspect?: (cue: SubtitleCue) => void;
};

export function SubtitleOverlay({ lane, timeMs, onWordInspect }: SubtitleOverlayProps) {
  const cue = selectActiveCue(lane.cues, timeMs);
  if (!cue) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 flex justify-center px-8">
      <div className="pointer-events-auto max-w-4xl rounded-md bg-black/70 px-4 py-3 text-center text-2xl leading-relaxed text-white shadow-lg">
        {cue.words.map((word) => (
          <Popover key={word.id}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="mx-1 rounded-sm px-1 text-white underline-offset-4 transition-colors hover:bg-white/15 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                onClick={() => onWordInspect?.(cue)}
              >
                {word.text}
              </button>
            </PopoverTrigger>
            <PopoverContent>{word.cleanText || word.text}</PopoverContent>
          </Popover>
        ))}
      </div>
    </div>
  );
}
