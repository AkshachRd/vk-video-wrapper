import { selectActiveCue } from "@/lib/subtitles/select-active-cue";
import type { SubtitleLane } from "@/lib/subtitles/types";

type SubtitleReferenceLineProps = {
  lane: SubtitleLane;
  timeMs: number;
};

export function SubtitleReferenceLine({ lane, timeMs }: SubtitleReferenceLineProps) {
  const cue = selectActiveCue(lane.cues, timeMs);
  if (!cue) return null;

  return (
    <div className="max-w-4xl rounded-md bg-black/60 px-3 py-1.5 text-center text-lg leading-relaxed text-slate-200/90 shadow">
      {cue.text}
    </div>
  );
}
