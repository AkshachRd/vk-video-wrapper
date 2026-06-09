import { useState } from "react";
import { X } from "lucide-react";

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
    <section
      aria-label="Недавние видео"
      className="rounded-md border border-slate-800 bg-slate-950/60 p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-slate-200">Недавние</h2>

      {error ? <div className="mb-3 text-xs text-red-300">{error}</div> : null}

      {isUnavailable ? (
        <div className="text-sm text-slate-400">История недоступна</div>
      ) : isLoading ? (
        <div className="text-sm text-slate-400">Загружаю историю...</div>
      ) : videos.length === 0 ? (
        <div className="text-sm text-slate-500">История пуста</div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {videos.map((video) => {
            const title = video.title?.trim() || `video${video.ownerId}_${video.videoId}`;

            return (
              <li key={video.id} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(video)}
                  aria-label={title}
                  className="block w-full overflow-hidden rounded-md border border-slate-800 bg-slate-900/70 text-left transition-colors hover:border-slate-600"
                >
                  <RecentThumbnail url={video.thumbnailUrl} />
                  <div className="p-2">
                    <div className="line-clamp-2 break-words text-sm font-medium text-white">{title}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {formatRelativeDate(video.lastWatchedAtMs, Date.now())}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(video)}
                  aria-label={`Удалить из истории: ${title}`}
                  className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white/90 transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RecentThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        data-testid="recent-thumb-placeholder"
        className="aspect-video w-full bg-slate-800"
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
      className="aspect-video w-full object-cover"
    />
  );
}
