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
    <div className="max-w-[88%] rounded-full bg-[rgba(10,10,10,0.78)] px-4 py-[7px] text-center text-[14.5px] text-white backdrop-blur-[3px]">
      {cue.text}
    </div>
  );
}
