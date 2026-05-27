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

export interface SubtitleLane {
  role: "primary" | "secondary";
  source: "vk-track" | "machine-translation";
  trackId?: string;
  cues: SubtitleCue[];
}

export interface VkSubtitleTrack {
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
  tracks: VkSubtitleTrack[];
  selectedTrackId: string;
  subtitleText: string;
}
