import { MobileSubtitleLine } from "@/components/mobile/mobile-subtitle-line";
import type { SubtitleCue, SubtitleWord } from "@/lib/subtitles/types";

type MobileReadingAreaProps = {
  cue: SubtitleCue;
  trackLabel: string;
  referenceText?: string;
  activeWordId?: string;
  onWordTap: (cue: SubtitleCue, word: SubtitleWord) => void;
};

// Мобильный «читатель» субтитров (mobile.css .m-read): крупная строка
// тапабельных слов в карточке вместо оверлея на видео, плюс RU-строка-перевод.
export function MobileReadingArea({
  cue,
  trackLabel,
  referenceText,
  activeWordId,
  onWordTap,
}: MobileReadingAreaProps) {
  return (
    <div className="mx-4 rounded-card-lg bg-paper-2 px-[18px] pt-[18px] pb-4">
      <div className="mb-3 flex items-center justify-between font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3">
        <span>Субтитры · {trackLabel}</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ink" />
          нажми слово
        </span>
      </div>

      <MobileSubtitleLine
        cue={cue}
        activeWordId={activeWordId}
        onWordTap={onWordTap}
        className="text-[23px] leading-[1.5] font-[450] tracking-[-0.01em] text-ink"
      />

      {referenceText ? (
        <div className="mt-3 border-t border-line pt-3 text-[15px] leading-[1.45] text-ink-2">{referenceText}</div>
      ) : null}
    </div>
  );
}
