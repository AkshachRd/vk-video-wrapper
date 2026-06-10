import type { CSSProperties, ReactNode } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

type PlayerControlsProps = {
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  onPlayPause: () => void;
  onSeek: (timeMs: number) => void;
  onSetVolume: (value: number) => void;
  onToggleMute: () => void;
  trailing?: ReactNode;
};

// Круглая кнопка контролбара; экспортируется для кнопки субтитров в App.
export const playerControlButtonClassName =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink [transition:background-color_0.18s_var(--ease-soft),scale_0.3s_var(--ease-spring)] hover:bg-ink hover:text-paper active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink";

export function PlayerControls({
  isPlaying,
  currentTimeMs,
  durationMs,
  volume,
  muted,
  onPlayPause,
  onSeek,
  onSetVolume,
  onToggleMute,
  trailing,
}: PlayerControlsProps) {
  const clampedTime = Math.min(currentTimeMs, durationMs || currentTimeMs);
  const seekFillPercent = durationMs > 0 ? (clampedTime / durationMs) * 100 : 0;
  const volumeValue = muted ? 0 : volume;

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white/96 px-3 py-[7px] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.4)]">
      <button
        type="button"
        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        onClick={onPlayPause}
        className={playerControlButtonClassName}
      >
        {isPlaying ? (
          <Pause className="h-[18px] w-[18px]" aria-hidden="true" />
        ) : (
          <Play className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
      </button>

      <span className="font-mono text-xs whitespace-nowrap tabular-nums text-ink-2">
        {formatTime(clampedTime)} / {formatTime(durationMs)}
      </span>

      <input
        type="range"
        aria-label="Перемотка"
        min={0}
        max={Math.max(durationMs, 0)}
        value={clampedTime}
        onChange={(event) => onSeek(Number(event.target.value))}
        style={{ "--range-fill": `${seekFillPercent}%` } as CSSProperties}
        className="range-ink min-w-0 flex-1"
      />

      <button
        type="button"
        aria-label={muted ? "Включить звук" : "Выключить звук"}
        onClick={onToggleMute}
        className={playerControlButtonClassName}
      >
        {muted ? (
          <VolumeX className="h-[18px] w-[18px]" aria-hidden="true" />
        ) : (
          <Volume2 className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
      </button>

      <input
        type="range"
        aria-label="Громкость"
        min={0}
        max={1}
        step={0.05}
        value={volumeValue}
        onChange={(event) => onSetVolume(Number(event.target.value))}
        style={{ "--range-fill": `${volumeValue * 100}%` } as CSSProperties}
        className="range-ink w-[60px] shrink-0"
      />

      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line-2" />

      {trailing}
    </div>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}
