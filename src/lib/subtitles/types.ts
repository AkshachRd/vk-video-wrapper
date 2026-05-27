export interface SubtitleWord {
  id: string;
  text: string;
  cleanText: string;
  startMs?: number;
  endMs?: number;
}

export interface SubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words: SubtitleWord[];
}

export type SubtitleRole = "primary" | "secondary";

export type SubtitleSource = "vk-track" | "machine-translation";

export interface SubtitleLane {
  role: SubtitleRole;
  source: SubtitleSource;
  trackId?: string;
  cues: SubtitleCue[];
}

export interface SubtitleTrack {
  id: string;
  lang: string;
  title: string;
  url: string;
  manifestName: string;
  isAuto: boolean;
  storageIndex: number;
}

export interface LoadedVideo {
  videoId: {
    ownerId: number;
    videoId: number;
    list?: string;
    accessKey?: string;
  };
  embedUrl: string;
  tracks: SubtitleTrack[];
  selectedTrackId: string;
  subtitleText: string;
}

export interface LoadedSubtitleTrack {
  selectedTrackId: string;
  subtitleText: string;
}
