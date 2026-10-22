import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useAgentActionListener,
  reportLifecycle,
  fetchVibeInfo,
  type CharacterAppAction,
} from '@/lib';
import './i18n';
import { ArrowLeft, Search, Youtube } from 'lucide-react';
import type { YouTubeSearchResult, YTPlayer } from './types';
import { getYouTubeApiKey, searchYouTubeDataApi } from './youtubeApi';
import {
  APP_ID,
  ActionTypes,
  DEFAULT_MAX_RESULTS,
  MAX_MAX_RESULTS,
  DEFAULT_QUEUE_SIZE,
  MAX_QUEUE_SIZE,
} from './actions/constants';
import styles from './index.module.scss';

// ============ YouTube Search ============
//
// Strategy: prefer `youtube-search-api` (battle-tested, no API key, ~1k
// weekly downloads). It's designed for Node — when bundled for the browser
// it may hit CORS or polyfill issues at runtime. We guard every call and
// fall back to a deterministic stub so the vibe_action round-trip is
// always observable end-to-end. Kayley cares more about the action
// dispatching than perfect search fidelity.

type SearchBackend = 'youtube-data-api' | 'stub';

/**
 * Stub results used when the real scraper fails in the browser. Five fixed
 * videos so the UI is always populated and Kayley can still demo the flow.
 */
const STUB_RESULTS: YouTubeSearchResult[] = [
  {
    video_id: 'dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
    channel: 'Rick Astley',
    thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    duration: '3:33',
  },
  {
    video_id: 'Zi_XLOBDo_Y',
    title: 'Fleetwood Mac - Landslide (Live)',
    channel: 'Fleetwood Mac',
    thumbnail_url: 'https://i.ytimg.com/vi/Zi_XLOBDo_Y/hqdefault.jpg',
    duration: '4:28',
  },
  {
    video_id: '9bZkp7q19f0',
    title: 'PSY - GANGNAM STYLE (강남스타일) M/V',
    channel: 'officialpsy',
    thumbnail_url: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg',
    duration: '4:13',
  },
  {
    video_id: 'kJQP7kiw5Fk',
    title: 'Luis Fonsi - Despacito ft. Daddy Yankee',
    channel: 'Luis Fonsi',
    thumbnail_url: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
    duration: '4:42',
  },
  {
    video_id: 'JGwWNGJdvx8',
    title: 'Ed Sheeran - Shape of You (Official Music Video)',
    channel: 'Ed Sheeran',
    thumbnail_url: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg',
    duration: '4:24',
  },
];

async function searchYouTube(
  query: string,
  maxResults: number,
): Promise<{ results: YouTubeSearchResult[]; backend: SearchBackend }> {
  const cap = Math.min(Math.max(1, maxResults), MAX_MAX_RESULTS);

  try {
    // Prefer official API when a key is present; fall through to stub on any failure.
    if (getYouTubeApiKey()) {
      return await searchYouTubeDataApi(query, cap);
    }
    throw new Error('Missing VITE_YOUTUBE_API_KEY');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[YouTubeApp] Real search failed, using stub:', message);
    // Mark each stub with the query so the UI is at least query-aware.
    const results = STUB_RESULTS.slice(0, cap).map((r) => ({
      ...r,
      title: `[${query}] ${r.title}`,
    }));
    return { results, backend: 'stub' };
  }
}

// ============ IFrame Player API Loader ============
//
// The YT IFrame Player API ships as a single script tag. Loading it is a
// global, one-shot side effect: once it calls `onYouTubeIframeAPIReady`,
// `window.YT` is available. We serialize all loaders behind a single
// module-level promise so React StrictMode's double-mount can't race.

const YT_SCRIPT_SRC = 'https://www.youtube.com/iframe_api';
let ytApiReady: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YT IFrame API unavailable in SSR context'));
  }
  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve();
  }
  if (ytApiReady) return ytApiReady;

  ytApiReady = new Promise<void>((resolve, reject) => {
    // If a prior onYouTubeIframeAPIReady exists (hot reload), preserve it
    // by chaining our resolve *after* whatever it was.
    const priorReadyCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        priorReadyCallback?.();
      } catch (err) {
        console.warn('[YouTubeApp] prior onYouTubeIframeAPIReady threw', err);
      }
      resolve();
    };

    // Avoid injecting duplicate script tags.
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${YT_SCRIPT_SRC}"]`,
    );
    if (existing) return; // API will fire the callback once it loads.

    const tag = document.createElement('script');
    tag.src = YT_SCRIPT_SRC;
    tag.async = true;
    tag.onerror = () => {
      ytApiReady = null;
      reject(new Error('Failed to load YT IFrame API script'));
    };
    document.head.appendChild(tag);
  });

  return ytApiReady;
}

// ============ Main Component ============

const YouTubeApp: React.FC = () => {
  const { t } = useTranslation('youtubeApp');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBackend, setLastBackend] = useState<SearchBackend | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [queue, setQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  // IFrame Player API references — keep mutable across renders/actions.
  const playerRef = useRef<YTPlayer | null>(null);
  const playerReadyRef = useRef(false);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const queueRef = useRef<string[]>([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const runSearch = useCallback(
    async (
      q: string,
      maxResults: number,
    ): Promise<{ status: string; results: YouTubeSearchResult[] }> => {
      if (!q.trim()) return { status: 'error: empty query', results: [] };
      setIsSearching(true);
      setError(null);
      setLastQuery(q);
      try {
        const { results: items, backend } = await searchYouTube(q, maxResults);
        setLastBackend(backend);
        setResults(items);
        setIsSearching(false);
        return {
          status: `success: ${items.length} results (backend=${backend})`,
          results: items,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setResults([]);
        setIsSearching(false);
        return { status: `error: ${message}`, results: [] };
      }
    },
    [],
  );

  /**
   * Effect: when playingVideoId is set, make sure a YT Player is bound to
   * the container div. When it's cleared, destroy any existing player.
   */
  useEffect(() => {
    if (!playingVideoId) {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (err) {
          console.warn('[YouTubeApp] player.destroy() failed', err);
        }
      }
      playerRef.current = null;
      playerReadyRef.current = false;
      return;
    }

    // Player already exists and is ready — just load the new video id.
    if (playerRef.current && playerReadyRef.current) {
      try {
        playerRef.current.loadVideoById(playingVideoId);
        return;
      } catch (err) {
        console.warn('[YouTubeApp] loadVideoById failed, rebuilding player', err);
        try {
          playerRef.current.destroy();
        } catch (destroyErr) {
          console.warn('[YouTubeApp] destroy during rebuild failed', destroyErr);
        }
        playerRef.current = null;
        playerReadyRef.current = false;
      }
    }

    const container = playerContainerRef.current;
    if (!container) return;

    let cancelled = false;
    loadYouTubeIframeApi()
      .then(() => {
        if (cancelled) return;
        const YT = window.YT;
        if (!YT || typeof YT.Player !== 'function') {
          throw new Error('YT IFrame API not available after load');
        }
        const player = new YT.Player(container, {
          videoId: playingVideoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              playerReadyRef.current = true;
            },
            onStateChange: (event) => {
              // PlayerState.ENDED === 0 — auto-advance through the queue.
              if (event.data === 0) {
                setQueueIndex((prev) => {
                  const q = queueRef.current;
                  const nextIdx = prev + 1;
                  if (nextIdx < q.length) {
                    setPlayingVideoId(q[nextIdx]);
                    return nextIdx;
                  }
                  return prev;
                });
              }
            },
            onError: (event) => {
              console.warn('[YouTubeApp] player error code', event.data);
            },
          },
        });
        playerRef.current = player;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[YouTubeApp] YT Player init failed:', message);
        setError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [playingVideoId]);

  /**
   * Wait for the player ref to become ready. Used by command actions that
   * may fire right after PLAY (the iframe API isn't synchronous).
   */
  const waitForPlayer = useCallback(async (timeoutMs = 5000): Promise<YTPlayer> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (playerRef.current && playerReadyRef.current) {
        return playerRef.current;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('no active player — call PLAY first');
  }, []);

  /**
   * Start (or switch to) playback of a specific video id, updating the
   * queue cursor if the id is in the current queue.
   */
  const playVideoId = useCallback(async (videoId: string): Promise<string> => {
    setPlayingVideoId(videoId);
    setQueueIndex((prev) => {
      const idx = queueRef.current.indexOf(videoId);
      return idx >= 0 ? idx : prev;
    });
    // Give the iframe a chance to come online, but return quickly — the
    // action result doesn't need to block on player-ready.
    try {
      await waitForPlayer(3000);
      return `success: playing ${videoId}`;
    } catch {
      // Not ready within the window is still "success: dispatched" — the
      // iframe may need another tick. The UI will show the player.
      return `success: playing ${videoId} (player still initializing)`;
    }
  }, [waitForPlayer]);

  // ============ Agent Action Listener ============
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case ActionTypes.SEARCH: {
          const q = action.params?.query;
          if (!q) return 'error: missing query';
          const rawMax = action.params?.max_results;
          const parsedMax = rawMax ? parseInt(rawMax, 10) : DEFAULT_MAX_RESULTS;
          const maxResults =
            Number.isFinite(parsedMax) && parsedMax > 0
              ? parsedMax
              : DEFAULT_MAX_RESULTS;
          setQuery(q);
          setPlayingVideoId(null);
          const { status } = await runSearch(q, maxResults);
          return status;
        }

        case ActionTypes.PLAY: {
          const directId = action.params?.video_id;
          if (directId) {
            return playVideoId(directId);
          }
          const q = action.params?.query;
          if (!q) return 'error: PLAY requires video_id or query';
          setQuery(q);
          const { results: items, status } = await runSearch(q, 1);
          if (items.length === 0) return status;
          const first = items[0];
          setQueue([first.video_id]);
          setQueueIndex(0);
          return playVideoId(first.video_id);
        }

        case ActionTypes.PAUSE: {
          try {
            const p = await waitForPlayer(1000);
            p.pauseVideo();
            return 'success: paused';
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return `error: ${message}`;
          }
        }

        case ActionTypes.RESUME: {
          try {
            const p = await waitForPlayer(1000);
            p.playVideo();
            return 'success: resumed';
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return `error: ${message}`;
          }
        }

        case ActionTypes.NEXT: {
          // If the queue has a next entry, advance. Otherwise, search
          // "related" using the current query as a seed.
          const currentQueue = queueRef.current;
          if (currentQueue.length > 0 && queueIndex + 1 < currentQueue.length) {
            const nextIdx = queueIndex + 1;
            const nextId = currentQueue[nextIdx];
            setQueueIndex(nextIdx);
            return playVideoId(nextId);
          }
          // No queued next — fall back to a fresh search from the last query.
          const seed = lastQuery || query;
          if (!seed) return 'error: no queue and no prior query to advance from';
          const { results: items, status } = await runSearch(seed, 5);
          if (items.length === 0) return status;
          const current = playingVideoId;
          const next = items.find((r) => r.video_id !== current) ?? items[0];
          setQueue([next.video_id]);
          setQueueIndex(0);
          return playVideoId(next.video_id);
        }

        case ActionTypes.SET_VOLUME: {
          const raw = action.params?.volume;
          if (raw === undefined || raw === null || raw === '') {
            return 'error: missing volume';
          }
          const parsed = parseInt(String(raw), 10);
          if (!Number.isFinite(parsed)) return 'error: volume must be a number';
          const clamped = Math.min(100, Math.max(0, parsed));
          try {
            const p = await waitForPlayer(1000);
            p.setVolume(clamped);
            return `success: volume=${clamped}`;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return `error: ${message}`;
          }
        }

        case ActionTypes.QUEUE: {
          const rawIds = action.params?.video_ids;
          const q = action.params?.query;

          let ids: string[] = [];

          if (rawIds) {
            // rawIds may be a JSON array string or a comma-separated list —
            // the MCP tool passes params as JSON strings, so both shapes
            // need to be tolerated here.
            try {
              const parsed = JSON.parse(String(rawIds));
              if (Array.isArray(parsed)) {
                ids = parsed.map((v) => String(v)).filter(Boolean);
              }
            } catch {
              // Not JSON — treat as CSV.
              ids = String(rawIds)
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean);
            }
          } else if (q) {
            setQuery(q);
            const { results: items, status } = await runSearch(q, DEFAULT_QUEUE_SIZE);
            if (items.length === 0) return status;
            ids = items.map((r) => r.video_id);
          } else {
            return 'error: QUEUE requires video_ids or query';
          }

          if (ids.length === 0) return 'error: no video ids resolved';
          const capped = ids.slice(0, MAX_QUEUE_SIZE);
          setQueue(capped);
          setQueueIndex(0);
          const first = capped[0];
          const playResult = await playVideoId(first);
          if (playResult.startsWith('error')) return playResult;
          return `success: queued ${capped.length} videos, playing first`;
        }

        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [runSearch, playVideoId, waitForPlayer, queueIndex, lastQuery, query, playingVideoId],
  );

  useAgentActionListener(APP_ID, handleAgentAction);

  // ============ Initialization ============
  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);
        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'YouTubeApp',
          windowStyle: { width: 960, height: 640 },
        });
        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'YouTubeApp',
          windowStyle: { width: 960, height: 640 },
        });
        reportLifecycle(AppLifecycle.DOM_READY);
        await fetchVibeInfo();
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[YouTubeApp] Init error:', error);
        reportLifecycle(AppLifecycle.ERROR, String(error));
      }
    };
    init();
    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (err) {
          console.warn('[YouTubeApp] teardown destroy failed', err);
        }
      }
    };
  }, []);

  const handleManualSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        runSearch(query.trim(), DEFAULT_MAX_RESULTS);
      }
    },
    [query, runSearch],
  );

  const handleCardClick = useCallback(
    (videoId: string) => {
      // Treat a manual click as starting a fresh single-video queue.
      setQueue([videoId]);
      setQueueIndex(0);
      playVideoId(videoId);
    },
    [playVideoId],
  );

  return (
    <div className={styles.youtubeApp}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Youtube size={24} className={styles.brandIcon} />
          <span className={styles.brandName}>{t('header.title')}</span>
        </div>
        <form className={styles.searchForm} onSubmit={handleManualSearch}>
          <Search size={18} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            data-testid="youtube-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('header.placeholder')}
            type="text"
          />
          <button
            className={styles.searchBtn}
            data-testid="youtube-search-submit"
            type="submit"
            disabled={!query.trim()}
          >
            {t('header.search')}
          </button>
        </form>
      </header>

      <main className={styles.content}>
        {playingVideoId ? (
          <div className={styles.player}>
            <button
              className={styles.backBtn}
              onClick={() => setPlayingVideoId(null)}
              type="button"
            >
              <ArrowLeft size={18} />
              {t('player.back')}
            </button>
            <div className={styles.playerFrame}>
              <div ref={playerContainerRef} />
            </div>
          </div>
        ) : isSearching ? (
          <div className={styles.statusMessage}>{t('results.searching')}</div>
        ) : error ? (
          <div className={styles.statusMessage}>{t('results.error', { message: error })}</div>
        ) : results.length === 0 ? (
          <div className={styles.statusMessage}>
            {lastQuery ? t('results.noResults', { query: lastQuery }) : t('results.empty')}
          </div>
        ) : (
          <>
            {lastBackend === 'stub' ? (
              <div className={styles.statusMessage}>
                Using stub results. Set <code>VITE_YOUTUBE_API_KEY</code> in{' '}
                <code>apps/webuiapps/.env.local</code> and restart the dev server.
              </div>
            ) : null}
            <div className={styles.resultsMeta}>
              {t('results.count', { count: results.length, query: lastQuery })}
            </div>
            <div className={styles.grid} data-testid="youtube-results">
              {results.map((r) => (
                <button
                  key={r.video_id}
                  className={styles.card}
                  data-testid={`youtube-result-${r.video_id}`}
                  onClick={() => handleCardClick(r.video_id)}
                  type="button"
                >
                  <div className={styles.thumbWrap}>
                    <img
                      className={styles.thumb}
                      src={r.thumbnail_url}
                      alt={r.title}
                      loading="lazy"
                    />
                    {r.duration ? (
                      <span className={styles.duration}>{r.duration}</span>
                    ) : null}
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardTitle} title={r.title}>
                      {r.title}
                    </div>
                    <div className={styles.cardChannel}>{r.channel}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default YouTubeApp;
