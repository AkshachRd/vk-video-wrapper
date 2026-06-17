import { useState } from "react";

import { MobileStartScreen } from "@/components/mobile/mobile-start-screen";
import { MobilePlayerScreen } from "@/components/mobile/mobile-player-screen";
import { LandscapePlayer } from "@/components/mobile/landscape-player";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { SidePanel } from "@/components/mobile/side-panel";
import { WordSheetContent } from "@/components/mobile/word-sheet-content";
import { SavedWordsSheetContent } from "@/components/mobile/saved-words-sheet-content";
import { TrackSheetContent } from "@/components/mobile/track-sheet-content";
import { MobileWordGraphScreen } from "@/components/word-graph/mobile-word-graph-screen";
import type { VideoApp } from "@/lib/app/use-video-app";
import type { WordLookupState } from "@/lib/dictionary/types";
import { useOrientation } from "@/lib/platform/use-orientation";
import { selectAlignedCue } from "@/lib/subtitles/select-aligned-cue";
import type { SubtitleCue, SubtitleWord } from "@/lib/subtitles/types";

type Sheet = "none" | "word" | "saved" | "tracks";
type WordTarget = { cue: SubtitleCue; word: SubtitleWord };

// Лукап показываем в шторке только если он относится к выбранному слову.
function matchedLookup(lookup: WordLookupState, fallbackWord: string): WordLookupState {
  if (lookup.status === "idle") return lookup;
  return lookup.query.trim().toLowerCase() === fallbackWord.trim().toLowerCase()
    ? lookup
    : { status: "idle" };
}

export function MobileApp({ app }: { app: VideoApp }) {
  const orientation = useOrientation();
  const [sheet, setSheet] = useState<Sheet>("none");
  const [wordTarget, setWordTarget] = useState<WordTarget | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  const onPlayer = Boolean(app.video && app.lane);
  const useLandscapePlayer = orientation === "landscape" && onPlayer;
  // В landscape шторки снизу закрыли бы (короткое) видео — выезжаем сбоку.
  const Shell = orientation === "landscape" ? SidePanel : BottomSheet;
  const savedWordsCount = app.savedWords.length;

  const removingWordIds = app.savedWords
    .filter((word) => app.pendingSavedWordActions[app.savedWordKey(word.language, word.normalizedWord)] === "removing")
    .map((word) => word.id);

  const referenceCue =
    app.secondaryLane && app.primaryCue ? selectAlignedCue(app.secondaryLane.cues, app.primaryCue) : undefined;
  const trackLabel = app.selectedTrack?.lang ? app.selectedTrack.lang.toUpperCase() : "—";

  const closeWordSheet = () => {
    app.handleSubtitleWordInspectEnd();
    setWordTarget(null);
    setSheet("none");
  };

  const onWordTap = (cue: SubtitleCue, word: SubtitleWord) => {
    setWordTarget({ cue, word });
    setSheet("word");
    app.handleSubtitleWordInspect(cue, word);
  };

  const onBack = () => {
    setShowGraph(false);
    setWordTarget(null);
    setSheet("none");
    app.handleBackToList();
  };

  const fallbackWord = wordTarget ? wordTarget.word.cleanText || wordTarget.word.text : "";
  const wordLookup = matchedLookup(app.wordLookup, fallbackWord);

  return (
    <div className="fixed inset-0 overflow-hidden bg-paper text-ink">
      {showGraph && app.video ? (
        <MobileWordGraphScreen words={app.savedWords} onBack={() => setShowGraph(false)} />
      ) : null}

      {!showGraph && useLandscapePlayer && app.video ? (
        <LandscapePlayer
          embedUrl={app.video.embedUrl}
          title={app.video.title}
          cue={app.primaryCue}
          secondaryLane={app.secondaryLane}
          activeWordId={sheet === "word" ? wordTarget?.word.id : undefined}
          isPlaying={app.isPlaying}
          currentTimeMs={app.currentTimeMs}
          durationMs={app.durationMs}
          volume={app.volume}
          muted={app.muted}
          blockInput={app.blockInput}
          showCustomUi={app.showCustomUi}
          onTimeUpdate={app.handleTimeUpdate}
          onDurationChange={app.handleDurationChange}
          onPlayingChange={app.handlePlayingChange}
          onVolumeChange={app.handleVolumeChange}
          onAdChange={app.handleAdChange}
          onPlaybackStart={app.handlePlaybackStart}
          onControlsReady={app.handlePlayerControlsReady}
          onPlayPause={app.handlePlayPause}
          onSeek={app.handleSeek}
          onSetVolume={app.handleSetVolume}
          onToggleMute={app.handleToggleMute}
          onWordTap={onWordTap}
          onBack={onBack}
          onOpenTracks={() => setSheet("tracks")}
          onOpenSaved={() => setSheet("saved")}
          savedWordsCount={savedWordsCount}
        />
      ) : !showGraph && onPlayer && app.video ? (
        <MobilePlayerScreen
          embedUrl={app.video.embedUrl}
          title={app.video.title}
          cue={app.primaryCue}
          trackLabel={trackLabel}
          referenceText={referenceCue?.text}
          activeWordId={sheet === "word" ? wordTarget?.word.id : undefined}
          isPlaying={app.isPlaying}
          currentTimeMs={app.currentTimeMs}
          durationMs={app.durationMs}
          blockInput={app.blockInput}
          showCustomUi={app.showCustomUi}
          onTimeUpdate={app.handleTimeUpdate}
          onDurationChange={app.handleDurationChange}
          onPlayingChange={app.handlePlayingChange}
          onVolumeChange={app.handleVolumeChange}
          onAdChange={app.handleAdChange}
          onPlaybackStart={app.handlePlaybackStart}
          onControlsReady={app.handlePlayerControlsReady}
          onPlayPause={app.handlePlayPause}
          onSeek={app.handleSeek}
          onWordTap={onWordTap}
          onBack={onBack}
          onOpenTracks={() => setSheet("tracks")}
          onOpenSaved={() => setSheet("saved")}
          savedWordsCount={savedWordsCount}
        />
      ) : showGraph ? null : (
        <MobileStartScreen
          url={app.url}
          onUrlChange={app.setUrl}
          isLoading={app.isLoading}
          onSubmit={app.handleSubmit}
          recentVideos={app.recentVideos}
          areRecentVideosLoading={app.areRecentVideosLoading}
          recentVideosUnavailable={app.recentVideosUnavailable}
          recentVideosError={app.recentVideosError}
          onSelectRecent={app.handleSelectRecentVideo}
          onRemoveRecent={app.handleRemoveRecentVideo}
          savedWordsCount={savedWordsCount}
          onOpenSaved={() => setSheet("saved")}
        />
      )}

      {sheet === "word" && wordTarget ? (
        <Shell label={`Слово: ${fallbackWord}`} onClose={closeWordSheet}>
          <WordSheetContent
            fallbackWord={fallbackWord}
            lookup={wordLookup}
            saveControl={app.getWordSaveControl(wordTarget.cue, wordTarget.word, fallbackWord, wordLookup)}
          />
        </Shell>
      ) : null}

      {sheet === "saved" ? (
        <Shell label="Сохранённые слова" onClose={() => setSheet("none")}>
          <SavedWordsSheetContent
            words={app.savedWords}
            pendingWordIds={removingWordIds}
            freshWordId={app.freshSavedWordId}
            error={app.savedWordsPanelError}
            isLoading={app.areSavedWordsLoading}
            isUnavailable={app.savedWordsUnavailable}
            onRemove={app.handleRemoveSavedWord}
            selectedTagKeys={app.selectedTagKeys}
            onToggleTagFilter={app.handleToggleTagFilter}
            onResetTagFilter={app.handleResetTagFilter}
            tagPendingWordIds={app.tagPendingWordIds}
            generatingTagWordIds={app.generatingTagWordIds}
            onAddTag={app.handleAddWordTag}
            onRemoveTag={app.handleRemoveWordTag}
            onOpenGraph={() => {
              setSheet("none");
              setShowGraph(true);
            }}
          />
        </Shell>
      ) : null}

      {sheet === "tracks" && app.video ? (
        <Shell label="Субтитры и перевод" onClose={() => setSheet("none")}>
          <TrackSheetContent
            tracks={app.video.tracks}
            selectedTrackId={app.selectedTrackId}
            selectedSecondaryTrackId={app.selectedSecondaryTrackId}
            isTrackLoading={app.isTrackLoading}
            isSecondaryTrackLoading={app.isSecondaryTrackLoading}
            onSelectPrimary={app.selectPrimaryTrack}
            onSelectSecondary={app.selectSecondaryTrack}
            secondaryError={app.secondaryError}
          />
        </Shell>
      ) : null}
    </div>
  );
}
