import { useState } from "react";
import { X } from "lucide-react";

import { formatRelativeDate } from "@/lib/recent-videos/format-relative-date";
import type { RecentVideo } from "@/lib/recent-videos/types";

type MobileRecentCardProps = {
  video: RecentVideo;
  onSelect: (video: RecentVideo) => void;
  onRemove: (video: RecentVideo) => void;
};

// Карточка недавнего видео (mobile.css .m-card/.m-thumb/.m-playchip/.m-cmeta).
// Чипы языка/длительности из прототипа опущены — их нет в модели RecentVideo.
export function MobileRecentCard({ video, onSelect, onRemove }: MobileRecentCardProps) {
  const title = video.title?.trim() || `video${video.ownerId}_${video.videoId}`;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={title}
        onClick={() => onSelect(video)}
        className="block w-full text-left [transition:scale_0.2s] active:scale-[0.985]"
      >
        <span className="relative block aspect-video overflow-hidden rounded-[20px] bg-[radial-gradient(130%_130%_at_50%_30%,#1c1c1c_0%,#0a0a0a_80%)]">
          <RecentThumbnail url={video.thumbnailUrl} />
          <span className="absolute top-1/2 left-1/2 flex h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 scale-90 items-center justify-center rounded-full bg-white/92">
            <span className="ml-1 h-0 w-0 border-y-[9px] border-l-[15px] border-y-transparent border-l-ink" />
          </span>
        </span>
        <span className="block px-1 pt-[11px]">
          <span className="mb-[5px] block text-base leading-[1.3] font-medium tracking-[-0.01em] break-words text-ink">
            {title}
          </span>
          <span className="block text-[13px] text-ink-3">
            {formatRelativeDate(video.lastWatchedAtMs, Date.now())}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Удалить из истории: ${title}`}
        onClick={() => onRemove(video)}
        className="absolute top-2.5 right-2.5 z-[2] flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-ink-2 [transition:background-color_0.15s,color_0.15s] active:bg-ink active:text-paper"
      >
        <X className="h-[15px] w-[15px]" aria-hidden="true" />
      </button>
    </div>
  );
}

function RecentThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return <span data-testid="recent-thumb-placeholder" className="absolute inset-0 block" aria-hidden="true" />;
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
