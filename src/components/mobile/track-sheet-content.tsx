import { formatTrackLabel } from "@/lib/subtitles/format-track-label";
import type { SubtitleTrack } from "@/lib/subtitles/types";
import { cn } from "@/lib/utils";

type TrackSheetContentProps = {
  tracks: SubtitleTrack[];
  selectedTrackId: string;
  selectedSecondaryTrackId: string;
  isTrackLoading?: boolean;
  isSecondaryTrackLoading?: boolean;
  onSelectPrimary: (trackId: string) => void;
  onSelectSecondary: (trackId: string) => void;
  secondaryError?: string;
};

function TrackOption({
  label,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between rounded-2xl px-4 py-[15px] text-left text-base disabled:opacity-50",
        selected ? "bg-ink text-paper" : "bg-paper-2 text-ink",
      )}
    >
      {label}
      <span
        aria-hidden="true"
        className={cn(
          "h-[9px] w-4 -rotate-45 border-b-[2.5px] border-l-[2.5px] border-current",
          selected ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}

// Содержимое шторки/панели дорожек (mobile.css .m-tr-*): группы «Субтитры»/«Перевод».
export function TrackSheetContent({
  tracks,
  selectedTrackId,
  selectedSecondaryTrackId,
  isTrackLoading,
  isSecondaryTrackLoading,
  onSelectPrimary,
  onSelectSecondary,
  secondaryError,
}: TrackSheetContentProps) {
  return (
    <div className="px-4 pb-2">
      <div role="listbox" aria-label="Субтитры">
        <div className="px-1.5 pt-1 pb-2 font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3">Субтитры</div>
        <div className="flex flex-col gap-2">
          {tracks.map((track) => (
            <TrackOption
              key={track.id}
              label={formatTrackLabel(track)}
              selected={track.id === selectedTrackId}
              disabled={isTrackLoading}
              onSelect={() => onSelectPrimary(track.id)}
            />
          ))}
        </div>
      </div>

      <div role="listbox" aria-label="Перевод" className="mt-3.5">
        <div className="px-1.5 pt-1 pb-2 font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3">Перевод</div>
        <div className="flex flex-col gap-2">
          <TrackOption
            label="Нет"
            selected={selectedSecondaryTrackId === ""}
            disabled={isSecondaryTrackLoading}
            onSelect={() => onSelectSecondary("")}
          />
          {tracks.map((track) => (
            <TrackOption
              key={track.id}
              label={formatTrackLabel(track)}
              selected={track.id === selectedSecondaryTrackId}
              disabled={isSecondaryTrackLoading}
              onSelect={() => onSelectSecondary(track.id)}
            />
          ))}
        </div>
        {secondaryError ? <div className="px-1.5 pt-2 text-sm text-ink-2">{secondaryError}</div> : null}
      </div>
    </div>
  );
}
