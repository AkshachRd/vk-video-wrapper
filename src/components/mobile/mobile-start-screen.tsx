import type { ChangeEvent, FormEvent } from "react";

import { SnakeBorder } from "@/components/snake-border";
import { Wave } from "@/components/wave";
import { MobileRecentCard } from "@/components/mobile/mobile-recent-card";
import type { RecentVideo } from "@/lib/recent-videos/types";

type MobileStartScreenProps = {
  url: string;
  onUrlChange: (value: string) => void;
  isLoading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  recentVideos: RecentVideo[];
  areRecentVideosLoading?: boolean;
  recentVideosUnavailable?: boolean;
  recentVideosError?: string;
  onSelectRecent: (video: RecentVideo) => void;
  onRemoveRecent: (video: RecentVideo) => void;
  savedWordsCount: number;
  onOpenSaved: () => void;
};

// Стартовый экран portrait (mobile.css .m-screen/.m-urlrow/.m-sec/.m-list/.m-dock).
export function MobileStartScreen({
  url,
  onUrlChange,
  isLoading,
  onSubmit,
  recentVideos,
  areRecentVideosLoading,
  recentVideosUnavailable,
  recentVideosError,
  onSelectRecent,
  onRemoveRecent,
  savedWordsCount,
  onOpenSaved,
}: MobileStartScreenProps) {
  return (
    <div className="relative h-full overflow-hidden bg-paper">
      <div className="h-full overflow-y-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
        <div className="h-[60px] shrink-0" />

        <Wave className="mx-5 mb-1 h-3.5" />

        <form
          data-testid="mobile-url-form"
          onSubmit={onSubmit}
          className="flex items-center gap-2.5 px-5 pt-2 pb-1.5"
        >
          <label className="flex h-[52px] flex-1 items-center rounded-full border-[1.5px] border-line-2 pr-1.5 pl-[18px] [transition:border-color_0.2s_var(--ease-soft)] focus-within:border-ink">
            <input
              aria-label="VK Video URL"
              placeholder="вставь ссылку vkvideo.ru/video…"
              value={url}
              disabled={isLoading}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onUrlChange(event.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
            />
          </label>
          <button
            type="submit"
            aria-label="Загрузить"
            disabled={isLoading}
            className="group/snake relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-ink text-[22px] text-paper [transition:scale_0.3s_var(--ease-spring)] active:scale-[0.94] disabled:opacity-50"
          >
            {isLoading ? "…" : "→"}
            <SnakeBorder key="a" shape="circle" always />
          </button>
        </form>

        <div className="flex items-baseline gap-2.5 px-5 pt-[18px] pb-0.5">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">Недавние</h2>
          <span className="font-mono text-[13px] text-ink-3">
            {String(recentVideos.length).padStart(2, "0")}
          </span>
        </div>

        <div className="flex flex-col gap-[22px] px-5 pt-3 pb-[130px]">
          {recentVideosError ? <div className="text-xs text-ink-2">{recentVideosError}</div> : null}
          {recentVideosUnavailable ? (
            <div className="py-12 text-center text-sm text-ink-3">История недоступна</div>
          ) : areRecentVideosLoading ? (
            <div className="py-12 text-center text-sm text-ink-3">Загружаю историю...</div>
          ) : recentVideos.length === 0 ? (
            <div className="py-12 text-center text-sm text-ink-3">История пуста</div>
          ) : (
            recentVideos.map((video) => (
              <MobileRecentCard
                key={video.id}
                video={video}
                onSelect={onSelectRecent}
                onRemove={onRemoveRecent}
              />
            ))
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center bg-[linear-gradient(to_top,var(--color-paper)_62%,transparent)] px-5 pt-3.5 pb-[30px]">
        <MobileSavedDockPill count={savedWordsCount} onClick={onOpenSaved} />
      </div>
    </div>
  );
}

export function MobileSavedDockPill({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2.5 rounded-full bg-ink px-[22px] py-[13px] text-sm font-medium text-paper shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)] [transition:scale_0.3s_var(--ease-spring)] active:scale-[0.96]"
    >
      Мои слова
      <span className="rounded-full bg-paper px-2 py-px font-mono text-xs font-semibold text-ink">{count}</span>
    </button>
  );
}
