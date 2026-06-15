import type { CSSProperties } from "react";
import { Captions, Pause, Play } from "lucide-react";

import { SnakeBorder } from "@/components/snake-border";
import { VideoPlayer } from "@/components/video-player";
import { MobileReadingArea } from "@/components/mobile/mobile-reading-area";
import { MobileSavedDockPill } from "@/components/mobile/mobile-start-screen";
import { formatTime } from "@/lib/player/format-time";
import type { SubtitleCue, SubtitleWord } from "@/lib/subtitles/types";
import type { VkPlayerControls } from "@/lib/vk-player/vk-player-bridge";

type MobilePlayerScreenProps = {
  embedUrl: string;
  title?: string;
  cue?: SubtitleCue;
  trackLabel: string;
  referenceText?: string;
  activeWordId?: string;
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  blockInput?: boolean;
  showCustomUi?: boolean;
  onTimeUpdate: (timeMs: number) => void;
  onDurationChange?: (durationMs: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
  onVolumeChange?: (state: { volume: number; muted: boolean }) => void;
  onAdChange?: (isAd: boolean) => void;
  onPlaybackStart?: () => void;
  onControlsReady?: (controls: VkPlayerControls | undefined) => void;
  onPlayPause: () => void;
  onSeek: (timeMs: number) => void;
  onWordTap: (cue: SubtitleCue, word: SubtitleWord) => void;
  onBack: () => void;
  onOpenTracks: () => void;
  onOpenSaved: () => void;
  savedWordsCount: number;
};

// Экран плеера portrait (mobile.css .m-pbar/.m-video/.m-controls/.m-read): видео-
// колодец с тем же VideoPlayer, контрол-стрип и reading-area вместо оверлея на видео.
export function MobilePlayerScreen({
  embedUrl,
  title,
  cue,
  trackLabel,
  referenceText,
  activeWordId,
  isPlaying,
  currentTimeMs,
  durationMs,
  blockInput,
  showCustomUi = true,
  onTimeUpdate,
  onDurationChange,
  onPlayingChange,
  onVolumeChange,
  onAdChange,
  onPlaybackStart,
  onControlsReady,
  onPlayPause,
  onSeek,
  onWordTap,
  onBack,
  onOpenTracks,
  onOpenSaved,
  savedWordsCount,
}: MobilePlayerScreenProps) {
  const clampedTime = Math.min(currentTimeMs, durationMs || currentTimeMs);
  const seekFillPercent = durationMs > 0 ? (clampedTime / durationMs) * 100 : 0;

  return (
    <div className="relative h-full overflow-hidden bg-paper">
      <div className="h-full overflow-y-auto [scrollbar-width:none]">
        <div className="h-[60px] shrink-0" />

        <div className="flex items-center gap-3 px-4 pt-1 pb-2.5">
          <button
            type="button"
            aria-label="Назад"
            onClick={onBack}
            className="group/snake relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line-2 bg-paper text-[19px] text-ink [transition:scale_0.3s_var(--ease-spring)] active:scale-[0.92]"
          >
            ←
            <SnakeBorder shape="circle" />
          </button>
          {title ? <div className="min-w-0 truncate text-sm font-semibold text-ink">{title}</div> : null}
        </div>

        <div className="relative mx-4 aspect-video overflow-hidden rounded-card bg-well">
          <VideoPlayer
            embedUrl={embedUrl}
            onTimeUpdate={onTimeUpdate}
            onDurationChange={onDurationChange}
            onPlayingChange={onPlayingChange}
            onVolumeChange={onVolumeChange}
            onAdChange={onAdChange}
            onPlaybackStart={onPlaybackStart}
            onControlsReady={onControlsReady}
            blockInput={blockInput}
          />
          {showCustomUi && isPlaying ? (
            <div className="pointer-events-none absolute top-2.5 left-3 flex items-center gap-[7px] font-mono text-[9px] tracking-[0.12em] text-white/75">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-white motion-reduce:animate-none" />
              ВОСПРОИЗВЕДЕНИЕ
            </div>
          ) : null}
        </div>

        {showCustomUi ? (
          <>
            <div className="flex items-center gap-3 px-5 pt-3 pb-1.5">
          <button
            type="button"
            aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
            onClick={onPlayPause}
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-ink text-paper [transition:scale_0.3s_var(--ease-spring)] active:scale-90"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          <span className="font-mono text-xs whitespace-nowrap tabular-nums text-ink-2">
            {formatTime(clampedTime)} <span className="text-ink-3">/</span> {formatTime(durationMs)}
          </span>

          <input
            type="range"
            aria-label="Перемотка"
            min={0}
            max={Math.max(durationMs, 0)}
            step={1000}
            value={clampedTime}
            onChange={(event) => onSeek(Number(event.target.value))}
            style={{ "--range-fill": `${seekFillPercent}%` } as CSSProperties}
            className="range-ink min-w-0 flex-1"
          />

          <button
            type="button"
            aria-label="Дорожки"
            onClick={onOpenTracks}
            className="group/snake relative flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-line-2 bg-paper text-ink [transition:scale_0.3s_var(--ease-spring)] active:scale-90"
          >
            <Captions className="h-[18px] w-[18px]" aria-hidden="true" />
            <SnakeBorder shape="circle" />
          </button>
        </div>

            {cue ? (
              <MobileReadingArea
                cue={cue}
                trackLabel={trackLabel}
                referenceText={referenceText}
                activeWordId={activeWordId}
                onWordTap={onWordTap}
              />
            ) : null}
          </>
        ) : null}

        <div className="h-[120px]" />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center bg-[linear-gradient(to_top,var(--color-paper)_62%,transparent)] px-5 pt-3.5 pb-[30px]">
        <MobileSavedDockPill count={savedWordsCount} onClick={onOpenSaved} />
      </div>
    </div>
  );
}
