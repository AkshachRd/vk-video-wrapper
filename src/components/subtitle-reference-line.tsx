import { selectAlignedCue } from "@/lib/subtitles/select-aligned-cue";
import type { SubtitleCue, SubtitleLane } from "@/lib/subtitles/types";

type SubtitleReferenceLineProps = {
  lane: SubtitleLane;
  primaryCue: SubtitleCue | undefined;
};

export function SubtitleReferenceLine({ lane, primaryCue }: SubtitleReferenceLineProps) {
  const cue = primaryCue ? selectAlignedCue(lane.cues, primaryCue) : undefined;
  if (!cue) return null;

  return (
    <div className="max-w-4xl rounded-md bg-black/60 px-3 py-1.5 text-center text-lg leading-relaxed text-slate-200/90 shadow">
      {cue.text}
    </div>
  );
}
