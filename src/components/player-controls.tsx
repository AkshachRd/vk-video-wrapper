import { Play, Pause, Volume2, VolumeX } from "lucide-react";

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
};

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
}: PlayerControlsProps) {
  const clampedTime = Math.min(currentTimeMs, durationMs || currentTimeMs);

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-md bg-black/70 px-3 py-2 text-white">
      <button
        type="button"
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={onPlayPause}
        className="rounded p-1 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        {isPlaying ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
      </button>

      <span className="whitespace-nowrap text-xs tabular-nums text-slate-200">
        {formatTime(clampedTime)} / {formatTime(durationMs)}
      </span>

      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={Math.max(durationMs, 0)}
        value={clampedTime}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="h-1 flex-1 cursor-pointer accent-sky-400"
      />

      <button
        type="button"
        aria-label={muted ? "Unmute" : "Mute"}
        onClick={onToggleMute}
        className="rounded p-1 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        {muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
      </button>

      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(event) => onSetVolume(Number(event.target.value))}
        className="h-1 w-20 cursor-pointer accent-sky-400"
      />
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
