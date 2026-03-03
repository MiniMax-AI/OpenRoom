import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  fetchVibeInfo,
  createAppFileApi,
  batchConcurrent,
  type CharacterAppAction,
  ActionTriggerBy,
} from '@/lib';
import './i18n';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Shuffle,
  Music,
  ListMusic,
} from 'lucide-react';
import type { Song, Playlist, PlayerState, AppState } from './types';
import {
  APP_ID,
  APP_NAME,
  SONGS_DIR,
  PLAYLISTS_DIR,
  STATE_FILE,
  ActionTypes,
  DEFAULT_PLAYER_STATE,
  DEFAULT_APP_STATE,
} from './actions/constants';
import { SEED_SONGS, SEED_PLAYLISTS } from './mock/seedData';
import styles from './index.module.scss';

// Create file API with App path prefix
const musicFileApi = createAppFileApi(APP_NAME);

// Utility functions
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ============ Sidebar Component ============
interface SidebarProps {
  playlists: Playlist[];
  currentPlaylistId: string | null;
  onSelectPlaylist: (playlistId: string | null) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ playlists, currentPlaylistId, onSelectPlaylist }) => {
  const { t } = useTranslation('musicApp');
  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarSection}>
        <div className={styles.sectionTitle}>{t('sidebar.library')}</div>
        <div className={styles.playlistList}>
          <button
            className={`${styles.playlistItem} ${styles.allTracksItem} ${currentPlaylistId === null ? styles.active : ''}`}
            onClick={() => onSelectPlaylist(null)}
          >
            <ListMusic size={18} />
            {t('sidebar.allTracks')}
          </button>
        </div>
      </div>
      <div className={styles.sidebarSection}>
        <div className={styles.sectionTitle}>{t('sidebar.playlists')}</div>
        <div className={styles.playlistList}>
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              className={`${styles.playlistItem} ${currentPlaylistId === playlist.id ? styles.active : ''}`}
              onClick={() => onSelectPlaylist(playlist.id)}
            >
              <ListMusic size={18} />
              {playlist.name}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
};

// ============ SongList Component ============
interface SongListProps {
  songs: Song[];
  currentSongId: string | null;
  isPlaying: boolean;
  playlistName: string;
  onPlaySong: (songId: string) => void;
  onPlayAll: () => void;
}

const SongList: React.FC<SongListProps> = ({
  songs,
  currentSongId,
  isPlaying,
  playlistName,
  onPlaySong,
  onPlayAll,
}) => {
  const { t } = useTranslation('musicApp');
  return (
    <main className={styles.content}>
      <div className={styles.contentHeader}>
        <div className={styles.playlistInfo}>
          <h1 className={styles.playlistTitle}>{playlistName}</h1>
          <div className={styles.playlistMeta}>
            {t('trackList.songCount', { count: songs.length })}
          </div>
        </div>
        <button className={styles.playAllBtn} onClick={onPlayAll} disabled={songs.length === 0}>
          <Play size={24} fill="currentColor" />
        </button>
      </div>

      <div className={styles.trackList}>
        <div className={styles.trackListHeader}>
          <span>{t('trackList.columnIndex')}</span>
          <span>{t('trackList.columnTitle')}</span>
          <span>{t('trackList.columnAlbum')}</span>
          <span>{t('trackList.columnDuration')}</span>
        </div>
        {songs.length === 0 ? (
          <div className={styles.emptyState}>
            <Music size={48} className={styles.emptyIcon} />
            <p>{t('trackList.emptyState')}</p>
          </div>
        ) : (
          songs.map((song, index) => {
            const isCurrent = song.id === currentSongId;
            const isCurrentPlaying = isCurrent && isPlaying;
            return (
              <div
                key={song.id}
                className={`${styles.trackItem} ${isCurrent ? styles.playing : ''}`}
                onClick={() => onPlaySong(song.id)}
              >
                <div className={styles.trackIndex}>
                  <span className={styles.trackNumber}>{index + 1}</span>
                  <span className={styles.trackPlayIcon}>
                    <Play size={16} fill="currentColor" />
                  </span>
                  <span className={styles.trackPlayingIcon}>
                    {isCurrentPlaying ? (
                      <Volume2 size={16} />
                    ) : (
                      <Play size={16} fill="currentColor" />
                    )}
                  </span>
                </div>
                <div className={styles.trackInfo}>
                  <div className={styles.trackTitle}>{song.title}</div>
                  <div className={styles.trackArtist}>{song.artist}</div>
                </div>
                <div className={styles.trackAlbum}>{song.album || t('trackList.unknownAlbum')}</div>
                <div className={styles.trackDuration}>{formatDuration(song.duration)}</div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
};

// ============ PlayerBar Component ============
interface PlayerBarProps {
  currentSong: Song | null;
  playerState: PlayerState;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
}

const PlayerBar: React.FC<PlayerBarProps> = ({
  currentSong,
  playerState,
  onPlayPause,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleRepeat,
  onToggleShuffle,
}) => {
  const { isPlaying, volume, currentTime, playMode } = playerState;
  const duration = currentSong?.duration || 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onVolumeChange(Math.max(0, Math.min(1, percent)));
  };

  return (
    <div className={styles.playerBar}>
      {/* Now Playing Info */}
      <div className={styles.nowPlaying}>
        {currentSong ? (
          <>
            <div className={styles.nowPlayingCover}>
              <Music size={24} />
            </div>
            <div className={styles.nowPlayingInfo}>
              <div className={styles.nowPlayingTitle}>{currentSong.title}</div>
              <div className={styles.nowPlayingArtist}>{currentSong.artist}</div>
            </div>
          </>
        ) : null}
      </div>

      {/* Player Controls */}
      <div className={styles.playerControls}>
        <div className={styles.controlButtons}>
          <button
            className={`${styles.controlBtn} ${playMode === 'shuffle' ? styles.active : ''}`}
            onClick={onToggleShuffle}
          >
            <Shuffle size={18} />
          </button>
          <button className={styles.controlBtn} onClick={onPrev} disabled={!currentSong}>
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            className={`${styles.controlBtn} ${styles.playPauseBtn}`}
            onClick={onPlayPause}
            disabled={!currentSong}
          >
            {isPlaying ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </button>
          <button className={styles.controlBtn} onClick={() => onNext()} disabled={!currentSong}>
            <SkipForward size={20} fill="currentColor" />
          </button>
          <button
            className={`${styles.controlBtn} ${playMode === 'repeat-one' ? styles.active : ''}`}
            onClick={onToggleRepeat}
          >
            <Repeat size={18} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className={styles.progressBar}>
          <span className={styles.progressTime}>{formatDuration(currentTime)}</span>
          <div className={styles.progressSlider} onClick={handleProgressClick}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }}>
              <div className={styles.progressThumb} />
            </div>
          </div>
          <span className={styles.progressTime}>{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Volume Control */}
      <div className={styles.volumeControl}>
        <button className={styles.volumeBtn} onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}>
          {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <div className={styles.volumeSlider} onClick={handleVolumeClick}>
          <div className={styles.volumeFill} style={{ width: `${volume * 100}%` }} />
        </div>
      </div>
    </div>
  );
};

// ============ Main Component ============
const MusicApp: React.FC = () => {
  const { t } = useTranslation('musicApp');
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentPlaylistId, setCurrentPlaylistId] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>(DEFAULT_PLAYER_STATE);
  const [isLoading, setIsLoading] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playQueueRef = useRef<string[]>([]);
  const handleNextRef = useRef<(_auto?: boolean) => void>(() => {});

  // Get songs for the current playlist
  const getCurrentSongs = useCallback((): Song[] => {
    if (currentPlaylistId === null) {
      return songs;
    }
    const playlist = playlists.find((p) => p.id === currentPlaylistId);
    if (!playlist || !playlist.songIds) return [];
    return playlist.songIds
      .map((id) => songs.find((s) => s.id === id))
      .filter((s): s is Song => s !== undefined);
  }, [songs, playlists, currentPlaylistId]);

  // Get current song
  const currentSong = songs.find((s) => s.id === playerState.currentSongId) || null;

  // Get current playlist name
  const currentPlaylistName = currentPlaylistId
    ? playlists.find((p) => p.id === currentPlaylistId)?.name || t('player.playlist')
    : t('sidebar.allTracks');

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = playerState.volume;

    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setPlayerState((prev) => ({ ...prev, currentTime: audio.currentTime }));
    };

    const handleEnded = () => {
      handleNextRef.current(true);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // ============ Data Refresh Methods (Repo refresh) ============

  // Refresh song data from cloud
  const refreshSongs = useCallback(async (): Promise<Song[]> => {
    try {
      const songFiles = await musicFileApi.listFiles(SONGS_DIR);
      const jsonFiles = songFiles.filter((f) => f.type === 'file' && f.name.endsWith('.json'));

      const loadedSongs: Song[] = [];

      await batchConcurrent(jsonFiles, (file) => musicFileApi.readFile(file.path), {
        onBatch: (batchResults, startIndex) => {
          batchResults.forEach((result, i) => {
            const fileIndex = startIndex + i;
            if (result.status === 'fulfilled' && result.value.content) {
              try {
                const song =
                  typeof result.value.content === 'string'
                    ? JSON.parse(result.value.content)
                    : result.value.content;
                loadedSongs.push(song as Song);
              } catch {
                console.warn('[MusicApp] Failed to parse song:', jsonFiles[fileIndex].path);
              }
            } else if (result.status === 'rejected') {
              console.warn(
                '[MusicApp] Failed to read song:',
                jsonFiles[fileIndex].path,
                result.reason,
              );
            }
          });
          // Update UI immediately after each batch for progressive rendering
          if (loadedSongs.length > 0) {
            setSongs([...loadedSongs]);
          }
        },
      });

      if (loadedSongs.length > 0) {
        return loadedSongs;
      }
      return songs;
    } catch (error) {
      console.error('[MusicApp] Failed to refresh songs:', error);
      return songs;
    }
  }, [songs]);

  // Refresh playlist data from cloud
  const refreshPlaylists = useCallback(async (): Promise<Playlist[]> => {
    try {
      const playlistFiles = await musicFileApi.listFiles(PLAYLISTS_DIR);
      const jsonFiles = playlistFiles.filter((f) => f.type === 'file' && f.name.endsWith('.json'));

      const loadedPlaylists: Playlist[] = [];

      await batchConcurrent(jsonFiles, (file) => musicFileApi.readFile(file.path), {
        onBatch: (batchResults, startIndex) => {
          batchResults.forEach((result, i) => {
            const fileIndex = startIndex + i;
            if (result.status === 'fulfilled' && result.value.content) {
              try {
                const playlist =
                  typeof result.value.content === 'string'
                    ? JSON.parse(result.value.content)
                    : result.value.content;
                loadedPlaylists.push(playlist as Playlist);
              } catch {
                console.warn('[MusicApp] Failed to parse playlist:', jsonFiles[fileIndex].path);
              }
            } else if (result.status === 'rejected') {
              console.warn(
                '[MusicApp] Failed to read playlist:',
                jsonFiles[fileIndex].path,
                result.reason,
              );
            }
          });
          // Update UI immediately after each batch for progressive rendering
          if (loadedPlaylists.length > 0) {
            setPlaylists([...loadedPlaylists]);
          }
        },
      });

      if (loadedPlaylists.length > 0) {
        return loadedPlaylists;
      }
      return playlists;
    } catch (error) {
      console.error('[MusicApp] Failed to refresh playlists:', error);
      return playlists;
    }
  }, [playlists]);

  // Load all data (for initialization)
  // Exit loading immediately after first batch arrives, subsequent batches continue appending
  const loadData = useCallback(async () => {
    let firstBatchRendered = false;

    try {
      // Concurrently load song and playlist directories
      const [songFiles, playlistFiles] = await Promise.all([
        musicFileApi.listFiles(SONGS_DIR),
        musicFileApi.listFiles(PLAYLISTS_DIR),
      ]);

      // Filter JSON files
      const songJsonFiles = songFiles.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
      const playlistJsonFiles = playlistFiles.filter(
        (f) => f.type === 'file' && f.name.endsWith('.json'),
      );

      // Merge all files to read, batch them uniformly (max 6 per batch), progressive rendering
      const allFiles = [
        ...songJsonFiles.map((f) => ({ file: f, collection: 'song' as const })),
        ...playlistJsonFiles.map((f) => ({ file: f, collection: 'playlist' as const })),
      ];

      const loadedSongs: Song[] = [];
      const loadedPlaylists: Playlist[] = [];

      await batchConcurrent(allFiles, (item) => musicFileApi.readFile(item.file.path), {
        onBatch: (batchResults, startIndex) => {
          batchResults.forEach((result, i) => {
            const item = allFiles[startIndex + i];
            if (result.status === 'fulfilled' && result.value.content) {
              try {
                const parsed =
                  typeof result.value.content === 'string'
                    ? JSON.parse(result.value.content)
                    : result.value.content;
                if (item.collection === 'song') {
                  loadedSongs.push(parsed as Song);
                } else {
                  loadedPlaylists.push(parsed as Playlist);
                }
              } catch {
                console.warn('[MusicApp] Failed to parse:', item.file.path);
              }
            } else if (result.status === 'rejected') {
              console.warn('[MusicApp] Failed to read:', item.file.path, result.reason);
            }
          });
          // Progressively update UI after each batch
          if (loadedSongs.length > 0) {
            setSongs([...loadedSongs]);
          }
          if (loadedPlaylists.length > 0) {
            setPlaylists([...loadedPlaylists]);
          }
          // Exit loading immediately after first batch has data, render what's available
          if (!firstBatchRendered && (loadedSongs.length > 0 || loadedPlaylists.length > 0)) {
            firstBatchRendered = true;
            setIsLoading(false);
          }
        },
      });

      // If no cloud data, use seed data
      if (loadedSongs.length === 0) {
        setSongs(SEED_SONGS);
        await batchConcurrent(SEED_SONGS, (song) =>
          musicFileApi.writeFile(`${SONGS_DIR}/${song.id}.json`, song),
        );
      }

      if (loadedPlaylists.length === 0) {
        setPlaylists(SEED_PLAYLISTS);
        await batchConcurrent(SEED_PLAYLISTS, (playlist) =>
          musicFileApi.writeFile(`${PLAYLISTS_DIR}/${playlist.id}.json`, playlist),
        );
      }

      // Also exit loading for seed data scenario
      if (!firstBatchRendered) {
        setIsLoading(false);
      }

      // Load state (check if state.json exists via listFiles before first access)
      const rootFiles = await musicFileApi.listFiles('/');
      const stateExists = rootFiles.some((f) => f.name === 'state.json');
      if (stateExists) {
        try {
          const stateResult = await musicFileApi.readFile(STATE_FILE);
          if (stateResult.content) {
            const savedState =
              typeof stateResult.content === 'string'
                ? JSON.parse(stateResult.content)
                : stateResult.content;
            if (savedState.activePlaylistId !== undefined) {
              setCurrentPlaylistId(savedState.activePlaylistId);
            } else if (savedState.currentPlaylistId !== undefined) {
              setCurrentPlaylistId(savedState.currentPlaylistId);
            }
          }
        } catch {
          // Read failed, ignore
        }
      } else {
        // state.json does not exist, initialize with default state and write
        await musicFileApi.writeFile(STATE_FILE, DEFAULT_APP_STATE).catch(() => {});
      }
    } catch (error) {
      console.error('[MusicApp] Failed to load data:', error);
      setSongs(SEED_SONGS);
      setPlaylists(SEED_PLAYLISTS);
      setIsLoading(false);
    }
  }, []);

  // Save state
  const saveState = useCallback(
    async (state: Partial<AppState>) => {
      try {
        const currentState: AppState = {
          currentView: currentPlaylistId ? 'playlist' : 'all-songs',
          activePlaylistId: currentPlaylistId,
          player: playerState,
          searchQuery: '',
          ...state,
        };
        await musicFileApi.writeFile(STATE_FILE, currentState);
      } catch (error) {
        console.error('[MusicApp] Failed to save state:', error);
      }
    },
    [currentPlaylistId, playerState],
  );

  // Play a song
  const handlePlaySong = useCallback(
    (songId: string, auto = false) => {
      const song = songs.find((s) => s.id === songId);
      if (!song || !audioRef.current) return;

      audioRef.current.src = song.audioUrl;
      audioRef.current.play().catch(console.error);

      setPlayerState((prev) => ({
        ...prev,
        currentSongId: songId,
        isPlaying: true,
        currentTime: 0,
      }));

      // Update play queue
      const currentSongs = getCurrentSongs();
      playQueueRef.current = currentSongs.map((s) => s.id);

      reportAction(
        APP_ID,
        'PLAY_SONG',
        { songId },
        auto ? ActionTriggerBy.System : ActionTriggerBy.User,
      );
    },
    [songs, getCurrentSongs],
  );

  // Play/Pause
  const handlePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (playerState.isPlaying) {
      audioRef.current.pause();
      setPlayerState((prev) => ({ ...prev, isPlaying: false }));
      reportAction(APP_ID, 'PAUSE', {});
    } else {
      audioRef.current.play().catch(console.error);
      setPlayerState((prev) => ({ ...prev, isPlaying: true }));
      reportAction(APP_ID, 'RESUME', {});
    }
  }, [playerState.isPlaying]);

  // Previous song
  const handlePrev = useCallback(() => {
    const queue = playQueueRef.current;
    const currentIndex = queue.indexOf(playerState.currentSongId || '');
    if (currentIndex > 0) {
      handlePlaySong(queue[currentIndex - 1]);
    } else if (queue.length > 0) {
      handlePlaySong(queue[queue.length - 1]);
    }
    reportAction(APP_ID, 'PREV_SONG', {});
  }, [playerState.currentSongId, handlePlaySong]);

  // Next song (auto=true means triggered by song ending naturally, false means user clicked manually)
  const handleNext = useCallback(
    (auto = false) => {
      const queue = playQueueRef.current;
      const currentIndex = queue.indexOf(playerState.currentSongId || '');

      // Repeat-one only replays when song ends naturally; manual click skips to next
      if (auto && playerState.playMode === 'repeat-one' && playerState.currentSongId) {
        handlePlaySong(playerState.currentSongId, true);
        return;
      }

      if (playerState.playMode === 'shuffle') {
        const randomIndex = Math.floor(Math.random() * queue.length);
        handlePlaySong(queue[randomIndex], auto);
      } else if (currentIndex < queue.length - 1) {
        handlePlaySong(queue[currentIndex + 1], auto);
      } else if (queue.length > 0) {
        handlePlaySong(queue[0], auto);
      } else {
        setPlayerState((prev) => ({ ...prev, isPlaying: false }));
      }
      reportAction(APP_ID, 'NEXT_SONG', {}, auto ? ActionTriggerBy.System : ActionTriggerBy.User);
    },
    [playerState.currentSongId, playerState.playMode, handlePlaySong],
  );

  // Keep handleNextRef always pointing to the latest handleNext
  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  // Seek
  const handleSeek = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setPlayerState((prev) => ({ ...prev, currentTime: time }));
    reportAction(APP_ID, 'SEEK', { time: String(time) });
  }, []);

  // Volume
  const handleVolumeChange = useCallback((volume: number) => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
    setPlayerState((prev) => ({ ...prev, volume }));
    reportAction(APP_ID, 'SET_VOLUME', { volume: String(volume) });
  }, []);

  // Toggle repeat-one
  const handleToggleRepeat = useCallback(() => {
    setPlayerState((prev) => ({
      ...prev,
      playMode: prev.playMode === 'repeat-one' ? ('sequential' as const) : ('repeat-one' as const),
    }));
  }, []);

  // Toggle shuffle
  const handleToggleShuffle = useCallback(() => {
    setPlayerState((prev) => ({
      ...prev,
      playMode: prev.playMode === 'shuffle' ? ('sequential' as const) : ('shuffle' as const),
    }));
  }, []);

  // Select playlist
  const handleSelectPlaylist = useCallback(
    (playlistId: string | null) => {
      setCurrentPlaylistId(playlistId);
      saveState({ activePlaylistId: playlistId });
      reportAction(APP_ID, 'SELECT_PLAYLIST', { playlistId: playlistId || '' });
    },
    [saveState],
  );

  // Play all
  const handlePlayAll = useCallback(() => {
    const currentSongs = getCurrentSongs();
    if (currentSongs.length > 0) {
      handlePlaySong(currentSongs[0].id);
    }
  }, [getCurrentSongs, handlePlaySong]);

  // ============ Agent Action Listener ============
  // Actions represent methods the Agent can invoke on the App
  // Operation: execute directly -> refresh related Repo on data mismatch -> retry -> return error
  // Mutation: Agent has completed writing, directly refresh Repo
  // Refresh: navigate + refresh Repo
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        // ---- Operation Actions: execute directly, refresh and retry on data mismatch ----
        case ActionTypes.PLAY_SONG: {
          const songId = action.params?.songId;
          if (!songId) return 'error: missing songId';
          // First attempt
          let song = songs.find((s) => s.id === songId);
          if (!song) {
            // Data mismatch, refresh songs Repo and retry
            const refreshed = await refreshSongs();
            song = refreshed.find((s) => s.id === songId);
            if (!song) return 'error: song not found after refresh';
          }
          handlePlaySong(songId);
          return 'success';
        }
        case ActionTypes.PAUSE:
          if (playerState.isPlaying) {
            handlePlayPause();
          }
          return 'success';
        case ActionTypes.RESUME:
          if (!playerState.isPlaying) {
            handlePlayPause();
          }
          return 'success';
        case ActionTypes.NEXT_SONG:
          handleNext();
          return 'success';
        case ActionTypes.PREV_SONG:
          handlePrev();
          return 'success';
        case ActionTypes.SET_VOLUME: {
          const vol = parseFloat(action.params?.volume || '0.8');
          handleVolumeChange(vol);
          return 'success';
        }
        case ActionTypes.SEEK: {
          const time = parseFloat(action.params?.time || '0');
          handleSeek(time);
          return 'success';
        }
        case ActionTypes.SELECT_PLAYLIST: {
          const playlistId = action.params?.playlistId;
          if (!playlistId) return 'error: missing playlistId';
          // First attempt
          let playlist = playlists.find((p) => p.id === playlistId);
          if (!playlist) {
            // Data mismatch, refresh playlists Repo and retry
            const refreshed = await refreshPlaylists();
            playlist = refreshed.find((p) => p.id === playlistId);
            if (!playlist) return 'error: playlist not found after refresh';
          }
          handleSelectPlaylist(playlistId);
          return 'success';
        }
        case ActionTypes.SET_PLAY_MODE: {
          const mode = action.params?.mode as PlayerState['playMode'];
          if (!mode) return 'error: missing mode';
          setPlayerState((prev) => ({ ...prev, playMode: mode }));
          return 'success';
        }

        // ---- Mutation Actions: Agent has completed writing, directly refresh Repo ----
        case ActionTypes.CREATE_SONG:
        case ActionTypes.UPDATE_SONG:
        case ActionTypes.DELETE_SONG: {
          await refreshSongs();
          return 'success';
        }
        case ActionTypes.CREATE_PLAYLIST:
        case ActionTypes.UPDATE_PLAYLIST:
        case ActionTypes.DELETE_PLAYLIST: {
          await refreshPlaylists();
          return 'success';
        }

        // ---- Refresh Actions: navigate + refresh Repo ----
        case ActionTypes.REFRESH_SONGS: {
          if (action.params?.navigateTo === 'all-songs') {
            setCurrentPlaylistId(null);
          }
          await refreshSongs();
          return 'success';
        }
        case ActionTypes.REFRESH_PLAYLISTS: {
          if (action.params?.navigateTo === 'playlist' && action.params?.focusId) {
            setCurrentPlaylistId(action.params.focusId);
          }
          await refreshPlaylists();
          return 'success';
        }

        // ---- System Action: SYNC_STATE ----
        case ActionTypes.SYNC_STATE: {
          try {
            const stateResult = await musicFileApi.readFile(STATE_FILE);
            if (stateResult.content) {
              const saved =
                typeof stateResult.content === 'string'
                  ? JSON.parse(stateResult.content)
                  : (stateResult.content as Record<string, unknown>);
              if (saved.currentView !== undefined || saved.activePlaylistId !== undefined) {
                setCurrentPlaylistId((saved.activePlaylistId as string) ?? null);
              }
              if (saved.player) {
                const p = saved.player as Record<string, unknown>;
                setPlayerState((prev) => ({
                  ...prev,
                  ...(p.volume !== undefined && { volume: p.volume as number }),
                  ...(p.playMode !== undefined && {
                    playMode: p.playMode as PlayerState['playMode'],
                  }),
                }));
                if (p.volume !== undefined && audioRef.current) {
                  audioRef.current.volume = p.volume as number;
                }
              }
            }
            return 'success';
          } catch (error) {
            console.error('[MusicApp] Failed to sync state:', error);
            return `error: ${String(error)}`;
          }
        }

        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [
      songs,
      playlists,
      playerState.isPlaying,
      handlePlaySong,
      handlePlayPause,
      handleNext,
      handlePrev,
      handleVolumeChange,
      handleSeek,
      handleSelectPlaylist,
      refreshSongs,
      refreshPlaylists,
    ],
  );

  useAgentActionListener(APP_ID, handleAgentAction);

  // Initialization
  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);

        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'MusicApp',
          windowStyle: { width: 1000, height: 700 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'MusicApp',
          windowStyle: { width: 1000, height: 700 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        // Fetch environment info (user, character, system settings), auto-sync language to i18n
        await fetchVibeInfo();

        // loadData internally sets setIsLoading(false) when first batch arrives
        await loadData();

        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[MusicApp] Init error:', error);
        setIsLoading(false);
        reportLifecycle(AppLifecycle.ERROR, String(error));
      }
    };

    init();

    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  if (isLoading) {
    return (
      <div className={styles.musicApp}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  const displaySongs = getCurrentSongs();

  return (
    <div className={styles.musicApp}>
      <div className={styles.mainContent}>
        <Sidebar
          playlists={playlists}
          currentPlaylistId={currentPlaylistId}
          onSelectPlaylist={handleSelectPlaylist}
        />
        <SongList
          songs={displaySongs}
          currentSongId={playerState.currentSongId}
          isPlaying={playerState.isPlaying}
          playlistName={currentPlaylistName}
          onPlaySong={handlePlaySong}
          onPlayAll={handlePlayAll}
        />
      </div>
      <PlayerBar
        currentSong={currentSong}
        playerState={playerState}
        onPlayPause={handlePlayPause}
        onPrev={handlePrev}
        onNext={handleNext}
        onSeek={handleSeek}
        onVolumeChange={handleVolumeChange}
        onToggleRepeat={handleToggleRepeat}
        onToggleShuffle={handleToggleShuffle}
      />
    </div>
  );
};

export default MusicApp;
