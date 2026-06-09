export interface RecentVideo {
  id: string;
  url: string;
  ownerId: number;
  videoId: number;
  title: string | null;
  thumbnailUrl: string | null;
  createdAtMs: number;
  lastWatchedAtMs: number;
}

export interface RecordRecentVideoRequest {
  url: string;
  ownerId: number;
  videoId: number;
  title: string | null;
  thumbnailUrl: string | null;
}
