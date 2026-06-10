import { useState } from "react";
import { X } from "lucide-react";

import { SnakeBorder } from "@/components/snake-border";
import { Wave } from "@/components/wave";
import { formatRelativeDate } from "@/lib/recent-videos/format-relative-date";
import type { RecentVideo } from "@/lib/recent-videos/types";

type RecentVideosListProps = {
  videos: RecentVideo[];
  isLoading?: boolean;
  isUnavailable?: boolean;
  error?: string;
  onSelect: (video: RecentVideo) => void;
  onRemove: (video: RecentVideo) => void;
};

export function RecentVideosList({
  videos,
  isLoading,
  isUnavailable,
  error,
  onSelect,
  onRemove,
}: RecentVideosListProps) {
  return (
    <section aria-label="Недавние видео">
      <div className="px-9 pt-[30px]">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">Недавние</h2>
        <Wave className="mt-3 h-3" />
      </div>

      <div className="px-9 pt-[18px]">
        {error ? <div className="mb-3 text-xs text-ink-2">{error}</div> : null}

        {isUnavailable ? (
          <div className="py-14 text-center text-sm text-ink-3">История недоступна</div>
        ) : isLoading ? (
          <div className="py-14 text-center text-sm text-ink-3">Загружаю историю...</div>
        ) : videos.length === 0 ? (
          <div className="py-14 text-center text-sm text-ink-3">История пуста</div>
        ) : (
          <ul className="grid grid-cols-3 gap-[18px]">
            {videos.map((video, index) => {
              const title = video.title?.trim() || `video${video.ownerId}_${video.videoId}`;

              return (
                <li key={video.id} className="group/card relative">
                  <button
                    type="button"
                    onClick={() => onSelect(video)}
                    aria-label={title}
                    style={{ animationDelay: `${index * 0.06}s` }}
                    className="group/snake relative block w-full animate-cardrise rounded-card bg-paper text-left [transition:transform_0.35s_var(--ease-spring),box-shadow_0.35s_var(--ease-soft)] hover:-translate-y-1 hover:shadow-[0_22px_40px_-24px_rgba(0,0,0,0.4)] motion-reduce:animate-none"
                  >
                    <span className="relative block aspect-video overflow-hidden rounded-card bg-[radial-gradient(130%_130%_at_50%_30%,#1c1c1c_0%,#0a0a0a_80%)]">
                      <RecentThumbnail url={video.thumbnailUrl} />
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 ease-soft group-hover/card:opacity-100">
                        <span className="relative block h-[46px] w-[46px] scale-[0.7] rounded-full bg-paper transition-transform duration-[450ms] ease-spring after:absolute after:top-1/2 after:left-[54%] after:h-0 after:w-0 after:-translate-x-1/2 after:-translate-y-1/2 after:border-y-8 after:border-l-[13px] after:border-y-transparent after:border-l-ink after:content-[''] group-hover/card:scale-100" />
                      </span>
                    </span>
                    <span className="block px-1 pt-[13px] pb-1">
                      <span className="mb-[5px] line-clamp-2 block text-[14.5px] leading-[1.3] font-medium tracking-[-0.01em] break-words text-ink">
                        {title}
                      </span>
                      <span className="block text-[12.5px] text-ink-3">
                        {formatRelativeDate(video.lastWatchedAtMs, Date.now())}
                      </span>
                    </span>
                    <SnakeBorder shape="round" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(video)}
                    aria-label={`Удалить из истории: ${title}`}
                    className="absolute top-2.5 right-2.5 z-[2] flex h-[26px] w-[26px] scale-[0.8] items-center justify-center rounded-full bg-white/90 text-ink opacity-0 [transition:opacity_0.2s,transform_0.3s_var(--ease-spring),background-color_0.15s,color_0.15s] group-hover/card:scale-100 group-hover/card:opacity-100 hover:bg-ink hover:text-paper focus-visible:scale-100 focus-visible:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function RecentThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    // Тёмный градиентный «колодец» уже нарисован на родителе —
    // плейсхолдер лишь резервирует слой.
    return (
      <span
        data-testid="recent-thumb-placeholder"
        className="absolute inset-0 block"
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      data-testid="recent-thumb"
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
