/**
 * MusicApp type definitions
 * Following guide.md specification
 */

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  coverColor: string; // hex color
  createdAt: number;
  audioUrl: string;
}

export interface Playlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt: number;
}

export interface PlayerState {
  currentSongId: string | null;
  currentPlaylistContext: string | null;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  playMode: 'sequential' | 'repeat-one' | 'shuffle';
}

export interface AppState {
  currentView: 'all-songs' | 'playlist';
  activePlaylistId: string | null;
  player: PlayerState;
  searchQuery: string;
}

export type MusicAction =
  // Operation Actions
  | { type: 'PLAY_SONG'; payload: { songId: string } }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NEXT_SONG' }
  | { type: 'PREV_SONG' }
  | { type: 'SET_VOLUME'; payload: { volume: number } }
  | { type: 'SEEK'; payload: { time: number } }
  | { type: 'SELECT_PLAYLIST'; payload: { playlistId: string } }
  | { type: 'SET_PLAY_MODE'; payload: { mode: PlayerState['playMode'] } }
  // Mutation Actions (Agent has completed writing, App refreshes Repo)
  | { type: 'CREATE_SONG' }
  | { type: 'UPDATE_SONG' }
  | { type: 'DELETE_SONG' }
  | { type: 'CREATE_PLAYLIST' }
  | { type: 'UPDATE_PLAYLIST' }
  | { type: 'DELETE_PLAYLIST' }
  // Refresh Actions
  | { type: 'REFRESH_SONGS' }
  | { type: 'REFRESH_PLAYLISTS' }
  // System Action
  | { type: 'SYNC_STATE' };
