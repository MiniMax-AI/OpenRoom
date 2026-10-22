/**
 * YouTubeApp type definitions
 *
 * A YouTube search result card. Kayley dispatches youtube/SEARCH via
 * vibe_action, the component performs the actual search, and renders
 * each result as a clickable card that embeds the YouTube player.
 */

export interface YouTubeSearchResult {
  video_id: string;
  title: string;
  channel: string;
  thumbnail_url: string;
  /** Human-readable duration string (e.g. "4:02"). Absent for live streams. */
  duration?: string;
}

export interface YouTubeAppState {
  query: string;
  results: YouTubeSearchResult[];
  isSearching: boolean;
  error: string | null;
  /** video_id of currently playing embed, or null when showing the results grid. */
  playingVideoId: string | null;
  /** Ordered queue of video ids. The currently playing id is at queueIndex. */
  queue: string[];
  queueIndex: number;
}

// ============ YouTube IFrame Player API — minimal typings ============
// Upstream ships no first-class types; we declare only what we call.

export interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  loadVideoById: (videoId: string | { videoId: string }) => void;
  cueVideoById: (videoId: string) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  destroy: () => void;
}

export interface YTPlayerConstructorOptions {
  videoId?: string;
  height?: string | number;
  width?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: { data: number; target: YTPlayer }) => void;
    onError?: (event: { data: number }) => void;
  };
}

export interface YTNamespace {
  Player: new (
    elementId: string | HTMLElement,
    options: YTPlayerConstructorOptions,
  ) => YTPlayer;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}
