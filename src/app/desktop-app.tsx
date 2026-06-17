import { useCallback, useEffect, useState } from "react";
import { Captions, Maximize2, Minimize2, Settings, X } from "lucide-react";

import { SnakeBorder } from "@/components/snake-border";
import { Wave } from "@/components/wave";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RecentVideosList } from "@/components/recent-videos-list";
import { SavedWordsPanel } from "@/components/saved-words-panel";
import { SubtitleOverlay } from "@/components/subtitle-overlay";
import { PlayerControls, playerControlButtonClassName } from "@/components/player-controls";
import { SubtitleReferenceLine } from "@/components/subtitle-reference-line";
import { VideoPlayer } from "@/components/video-player";
import { WordGraphScreen } from "@/components/word-graph/word-graph-screen";
import { useControlsAutoHide } from "@/lib/player/use-controls-auto-hide";
import { formatTrackLabel } from "@/lib/subtitles/format-track-label";
import { cn } from "@/lib/utils";
import type { VideoApp } from "@/lib/app/use-video-app";

const trackSelectWrapClassName =
  "relative block rounded-full border-[1.5px] border-line-2 bg-paper transition-colors duration-200 focus-within:border-ink after:pointer-events-none after:absolute after:top-1/2 after:right-4 after:h-[7px] after:w-[7px] after:-translate-y-[65%] after:rotate-45 after:border-r-2 after:border-b-2 after:border-ink-2 after:content-['']";

const trackSelectClassName =
  "w-full cursor-pointer appearance-none rounded-full border-0 bg-transparent py-2.5 pr-9 pl-4 text-sm text-ink outline-none disabled:opacity-50";

const monoLabelClassName =
  "font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase";

export function DesktopApp({ app }: { app: VideoApp }) {
  const [playerContainer, setPlayerContainer] = useState<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [subtitlesMenuOpen, setSubtitlesMenuOpen] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerContainer);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [playerContainer]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    void playerContainer?.requestFullscreen();
  }, [playerContainer]);

  const { visible: controlsVisible, reveal: revealControls } = useControlsAutoHide({
    active: app.isPlaying && app.showCustomUi && !subtitlesMenuOpen,
  });

  const subtitlesMenu =
    app.video && app.video.tracks.length > 0 ? (
      <Popover open={subtitlesMenuOpen} onOpenChange={setSubtitlesMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Субтитры и перевод"
            title="Субтитры и перевод"
            className={playerControlButtonClassName}
          >
            <Captions className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          sideOffset={10}
          container={isFullscreen ? playerContainer : undefined}
          className="w-[262px] p-4"
        >
          <div className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-[7px]">
              <span className={cn(monoLabelClassName, "text-ink-2")}>Субтитры</span>
              <span className={trackSelectWrapClassName}>
                <select
                  aria-label="Субтитры"
                  value={app.selectedTrackId}
                  disabled={app.isTrackLoading}
                  onChange={app.handleTrackChange}
                  className={trackSelectClassName}
                >
                  {app.video.tracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {formatTrackLabel(track)}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="flex flex-col gap-[7px]">
              <span className={cn(monoLabelClassName, "text-ink-2")}>Перевод</span>
              <span className={trackSelectWrapClassName}>
                <select
                  aria-label="Перевод"
                  value={app.selectedSecondaryTrackId}
                  disabled={app.isSecondaryTrackLoading}
                  onChange={app.handleSecondaryTrackChange}
                  className={trackSelectClassName}
                >
                  <option value="">Нет</option>
                  {app.video.tracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {formatTrackLabel(track)}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            {app.secondaryError ? <span className="text-sm text-ink-2">{app.secondaryError}</span> : null}
          </div>
        </PopoverContent>
      </Popover>
    ) : null;

  return (
    <main className="mx-auto w-full max-w-[1140px] min-w-[960px]">
      <div className="relative pb-[34px]">
        {/* мастхед: в этой версии дизайна — только волна */}
        <header className="px-9 pt-[34px] pb-2">
          <Wave className="mt-[18px] h-[18px]" />
        </header>

        <form
          className="mx-9 mt-[22px] flex items-center gap-2 rounded-full border-[1.5px] border-line-2 bg-paper py-1.5 pr-1.5 pl-[22px] [transition:border-color_0.2s_var(--ease-soft),box-shadow_0.2s_var(--ease-soft)] focus-within:border-ink focus-within:shadow-[0_0_0_4px_rgba(12,12,12,0.05)]"
          onSubmit={app.handleSubmit}
        >
          <input
            aria-label="VK Video URL"
            placeholder="вставь ссылку vkvideo.ru/video…"
            value={app.url}
            disabled={app.isLoading}
            onChange={(event) => app.setUrl(event.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[15px] tracking-[-0.01em] text-ink outline-none placeholder:text-ink-3"
          />
          <button
            type="submit"
            disabled={app.isLoading}
            className="group/snake relative flex h-11 items-center gap-[9px] rounded-full bg-ink px-6 text-sm font-medium tracking-[0.01em] whitespace-nowrap text-paper [transition:opacity_0.2s,scale_0.4s_var(--ease-spring)] active:scale-[0.97] disabled:cursor-progress disabled:opacity-45"
          >
            {app.isLoading ? "Загрузка" : "Загрузить"}
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-500 ease-spring group-hover/snake:translate-x-[5px]"
            >
              →
            </span>
            <SnakeBorder shape="pill" />
          </button>
        </form>

        {app.isLoading ? (
          <div data-testid="load-wave" className="mx-9 mt-4 h-3.5 overflow-hidden">
            <div className="h-full w-full animate-flow bg-(image:--wave-load) bg-position-[0px_50%] bg-size-[44px_10px] bg-repeat-x motion-reduce:animate-none" />
          </div>
        ) : null}

        {app.error ? (
          <div role="alert" className="mx-9 mt-4 rounded-card bg-paper-2 px-5 py-3 text-sm text-ink-2">
            {app.error}
          </div>
        ) : null}

        {!app.video || !app.lane ? (
          <RecentVideosList
            videos={app.recentVideos}
            isLoading={app.areRecentVideosLoading}
            isUnavailable={app.recentVideosUnavailable}
            error={app.recentVideosError}
            onSelect={app.handleSelectRecentVideo}
            onRemove={app.handleRemoveRecentVideo}
          />
        ) : null}

        {app.video && app.lane && showGraph ? (
          <WordGraphScreen words={app.savedWords} onBack={() => setShowGraph(false)} />
        ) : null}

        {app.video && app.lane && !showGraph ? (
          <div className="px-9 pt-[18px]">
            <div className="mb-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowGraph(false);
                  app.handleBackToList();
                }}
                className="group/snake relative flex items-center gap-[9px] rounded-full border-[1.5px] border-line-2 bg-paper px-4 py-2 text-[13px] font-medium text-ink transition-colors duration-200 hover:border-ink"
              >
                <span
                  aria-hidden="true"
                  className="inline-block transition-transform duration-[450ms] ease-spring group-hover/snake:-translate-x-1"
                >
                  ←
                </span>
                Назад
                <SnakeBorder shape="pill" />
              </button>
              {app.video.title ? (
                <span className="ml-auto min-w-0 truncate text-[13px] font-medium text-ink-2">{app.video.title}</span>
              ) : null}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_280px] items-start gap-[18px]">
              <div
                ref={setPlayerContainer}
                data-testid="player-container"
                onPointerMove={revealControls}
                className={cn(
                  "relative aspect-video overflow-hidden bg-well",
                  isFullscreen ? "" : "rounded-card-lg",
                  !controlsVisible && "cursor-none",
                )}
              >
                <VideoPlayer
                  embedUrl={app.video.embedUrl}
                  onTimeUpdate={app.handleTimeUpdate}
                  onDurationChange={app.handleDurationChange}
                  onPlayingChange={app.handlePlayingChange}
                  onVolumeChange={app.handleVolumeChange}
                  onAdChange={app.handleAdChange}
                  onPlaybackStart={app.handlePlaybackStart}
                  onControlsReady={app.handlePlayerControlsReady}
                  blockInput={app.blockInput}
                />

                {app.showCustomUi ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Воспроизведение или пауза"
                    data-testid="player-click-surface"
                    onClick={app.handlePlayPause}
                    className={cn(
                      "absolute inset-0 h-full w-full bg-transparent",
                      controlsVisible ? "cursor-pointer" : "cursor-none",
                    )}
                  />
                ) : null}

                {app.isPlaying && app.showCustomUi ? (
                  <div
                    data-testid="playing-indicator"
                    className={cn(
                      "pointer-events-none absolute top-[15px] left-4 z-[6] flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-white/75 transition-opacity duration-300",
                      controlsVisible ? "opacity-100" : "opacity-0",
                    )}
                  >
                    <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-white motion-reduce:animate-none" />
                    ВОСПРОИЗВЕДЕНИЕ
                  </div>
                ) : null}

                {app.showCustomUi ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-[76px] z-[5] flex flex-col items-center gap-[9px] px-[26px]">
                    <SubtitleOverlay
                      lane={app.lane}
                      timeMs={app.effectiveTimeMs}
                      wordLookup={app.wordLookup}
                      onWordInspect={app.handleSubtitleWordInspect}
                      onWordInspectEnd={app.handleSubtitleWordInspectEnd}
                      getWordSaveControl={app.getWordSaveControl}
                      popoverContainer={isFullscreen ? playerContainer : undefined}
                    />
                    {app.secondaryLane ? (
                      <div
                        data-testid="secondary-subtitle-slot"
                        // w-full: max-w-[88%] пилюли должен считаться от ширины видео,
                        // а не от сжатого по содержимому слота — иначе пилюля всегда
                        // ограничена 88% собственной ширины и переносит короткие фразы
                        className="flex min-h-10 w-full justify-center"
                      >
                        <SubtitleReferenceLine lane={app.secondaryLane} primaryCue={app.primaryCue} />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {app.showCustomUi ? (
                  <div
                    data-testid="player-control-bar"
                    className={cn(
                      "absolute inset-x-3.5 bottom-3.5 z-[7] [transition:translate_0.35s_var(--ease-soft),opacity_0.3s_var(--ease-soft)]",
                      controlsVisible ? "opacity-100" : "pointer-events-none translate-y-[140%] opacity-0",
                    )}
                  >
                    <PlayerControls
                      isPlaying={app.isPlaying}
                      currentTimeMs={app.currentTimeMs}
                      durationMs={app.durationMs}
                      volume={app.volume}
                      muted={app.muted}
                      onPlayPause={app.handlePlayPause}
                      onSeek={app.handleSeek}
                      onSetVolume={app.handleSetVolume}
                      onToggleMute={app.handleToggleMute}
                      trailing={subtitlesMenu}
                    />
                  </div>
                ) : null}

                {!app.isAd ? (
                  <div
                    data-testid="player-corner-controls"
                    className={cn(
                      "absolute top-3.5 right-3.5 z-[7] flex gap-2 transition-opacity duration-300",
                      controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                  >
                    <button
                      type="button"
                      onClick={app.toggleVkMode}
                      aria-label={
                        app.playerMode === "vk"
                          ? "Вернуться к своим контролам"
                          : "Настройки VK (скорость, качество)"
                      }
                      title={
                        app.playerMode === "vk"
                          ? "Вернуться к своим контролам"
                          : "Настройки VK (скорость, качество)"
                      }
                      className="group/snake relative flex h-9 w-9 items-center justify-center rounded-full bg-white/94 text-ink [transition:background-color_0.18s_var(--ease-soft),color_0.18s,scale_0.3s_var(--ease-spring)] hover:bg-ink hover:text-paper active:scale-90"
                    >
                      {app.playerMode === "vk" ? (
                        <X className="h-[18px] w-[18px]" aria-hidden="true" />
                      ) : (
                        <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
                      )}
                      <SnakeBorder shape="circle" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      aria-label={isFullscreen ? "Выйти из полноэкранного режима" : "Полный экран"}
                      title={isFullscreen ? "Выйти из полноэкранного режима" : "Полный экран"}
                      className="group/snake relative flex h-9 w-9 items-center justify-center rounded-full bg-white/94 text-ink [transition:background-color_0.18s_var(--ease-soft),color_0.18s,scale_0.3s_var(--ease-spring)] hover:bg-ink hover:text-paper active:scale-90"
                    >
                      {isFullscreen ? (
                        <Minimize2 className="h-[18px] w-[18px]" aria-hidden="true" />
                      ) : (
                        <Maximize2 className="h-[18px] w-[18px]" aria-hidden="true" />
                      )}
                      <SnakeBorder shape="circle" />
                    </button>
                  </div>
                ) : null}
              </div>

              <SavedWordsPanel
                words={app.savedWords}
                isLoading={app.areSavedWordsLoading}
                isUnavailable={app.savedWordsUnavailable}
                pendingWordIds={app.savedWords
                  .filter(
                    (word) =>
                      app.pendingSavedWordActions[app.savedWordKey(word.language, word.normalizedWord)] === "removing",
                  )
                  .map((word) => word.id)}
                freshWordId={app.freshSavedWordId}
                error={app.savedWordsPanelError}
                onRemove={app.handleRemoveSavedWord}
                selectedTagKeys={app.selectedTagKeys}
                onToggleTagFilter={app.handleToggleTagFilter}
                onResetTagFilter={app.handleResetTagFilter}
                tagPendingWordIds={app.tagPendingWordIds}
                generatingTagWordIds={app.generatingTagWordIds}
                onAddTag={app.handleAddWordTag}
                onRemoveTag={app.handleRemoveWordTag}
                onOpenGraph={() => setShowGraph(true)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
