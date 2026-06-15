import { Captions } from "lucide-react";

import { PlayerControls } from "@/components/player-controls";
import { SnakeBorder } from "@/components/snake-border";
import { SubtitleReferenceLine } from "@/components/subtitle-reference-line";
import { VideoPlayer } from "@/components/video-player";
import { MobileSubtitleLine } from "@/components/mobile/mobile-subtitle-line";
import type { SubtitleCue, SubtitleLane, SubtitleWord } from "@/lib/subtitles/types";
import type { VkPlayerControls } from "@/lib/vk-player/vk-player-bridge";

type LandscapePlayerProps = {
  embedUrl: string;
  title?: string;
  cue?: SubtitleCue;
  secondaryLane?: SubtitleLane;
  activeWordId?: string;
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
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
  onSetVolume: (value: number) => void;
  onToggleMute: () => void;
  onWordTap: (cue: SubtitleCue, word: SubtitleWord) => void;
  onBack: () => void;
  onOpenTracks: () => void;
  onOpenSaved: () => void;
  savedWordsCount: number;
};

// Иммерсивный landscape-плеер (landscape.css, без рамки телефона): full-bleed
// видео, оверлейный chrome, сабы низко по центру, плавающая пилюля контролов.
export function LandscapePlayer({
  embedUrl,
  title,
  cue,
  secondaryLane,
  activeWordId,
  isPlaying,
  currentTimeMs,
  durationMs,
  volume,
  muted,
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
  onSetVolume,
  onToggleMute,
  onWordTap,
  onBack,
  onOpenTracks,
  onOpenSaved,
  savedWordsCount,
}: LandscapePlayerProps) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-well">
      <div className="absolute inset-0">
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
      </div>

      {/* верхний chrome: белые кнопки на видео + тёмная пилюля «Мои слова» */}
      <div className="absolute top-4 right-6 left-[60px] z-10 flex items-center gap-3">
        <button
          type="button"
          aria-label="Назад"
          onClick={onBack}
          className="group/snake relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/94 text-[18px] text-ink [transition:scale_0.3s_var(--ease-spring)] active:scale-[0.92]"
        >
          ←
          <SnakeBorder shape="circle" stroke="paper" />
        </button>
        {title ? (
          <div className="min-w-0 truncate text-sm font-medium text-white/85">{title}</div>
        ) : null}
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Дорожки"
          onClick={onOpenTracks}
          className="group/snake relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/94 text-ink [transition:scale_0.3s_var(--ease-spring)] active:scale-[0.92]"
        >
          <Captions className="h-[18px] w-[18px]" aria-hidden="true" />
          <SnakeBorder shape="circle" stroke="paper" />
        </button>
        <button
          type="button"
          onClick={onOpenSaved}
          className="group/snake relative inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-[18px] py-3 text-sm font-medium text-paper shadow-[0_10px_26px_-10px_rgba(0,0,0,0.6)] [transition:scale_0.3s_var(--ease-spring)] active:scale-[0.96]"
        >
          Мои слова
          <span className="rounded-full bg-paper px-2 py-px font-mono text-xs font-semibold text-ink">
            {savedWordsCount}
          </span>
          <SnakeBorder key="a" shape="pill" always stroke="ink" />
        </button>
      </div>

      {/* сабы низко по центру */}
      {showCustomUi && cue ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[96px] z-[5] flex flex-col items-center gap-2 px-[90px]">
          <div className="pointer-events-auto max-w-[92%] rounded-card bg-paper px-[22px] py-[13px] text-center shadow-[0_16px_40px_-16px_rgba(0,0,0,0.55)]">
            <MobileSubtitleLine
              cue={cue}
              activeWordId={activeWordId}
              onWordTap={onWordTap}
              className="text-[22px] leading-[1.45] font-[450] tracking-[-0.01em] text-ink"
            />
          </div>
          {secondaryLane ? (
            <div className="flex w-full justify-center">
              <SubtitleReferenceLine lane={secondaryLane} primaryCue={cue} />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* плавающая пилюля контролов (переиспользует PlayerControls) */}
      {showCustomUi ? (
        <div className="absolute bottom-[22px] left-1/2 z-[7] w-[58%] max-w-[680px] min-w-[420px] -translate-x-1/2">
          <PlayerControls
            isPlaying={isPlaying}
            currentTimeMs={currentTimeMs}
            durationMs={durationMs}
            volume={volume}
            muted={muted}
            onPlayPause={onPlayPause}
            onSeek={onSeek}
            onSetVolume={onSetVolume}
            onToggleMute={onToggleMute}
          />
        </div>
      ) : null}
    </div>
  );
}
