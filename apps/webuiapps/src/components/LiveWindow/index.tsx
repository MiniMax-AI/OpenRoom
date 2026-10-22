/**
 * LiveWindow — floating, draggable, resizable "livestream" window.
 *
 * Matches the LEFT panel of the hosted openroom.ai layout:
 *   - "Live" badge + viewer count (top-left)
 *   - "Add my Agent" button (top-right, stub no-op for v1)
 *   - Min / Max / Close icon buttons (top-right)
 *   - Body split: LEFT = scrolling viewer-comment list (stub),
 *                 RIGHT = character full-body art
 *
 * V1 scope: fake static comments, no live simulation, no viewer-count feed.
 * The character image comes from the active character config (the same
 * source ChatPanel uses).
 */

import React, { useState, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { Radio, Minus, Maximize2, X } from 'lucide-react';
import {
  loadCharacterCollectionSync,
  getActiveCharacter,
  resolveEmotionMedia,
  DEFAULT_COLLECTION as DEFAULT_CHAR_COLLECTION,
} from '@/lib/characterManager';
import styles from './index.module.scss';

export interface LiveWindowProps {
  visible: boolean;
  onClose: () => void;
  zIndex?: number;
  onFocus?: () => void;
}

const DEFAULT_W = 560;
const DEFAULT_H = 480;
const MIN_W = 320;
const MIN_H = 240;
const MARGIN = 24;

// Static fake viewer comments for v1. Real build streams these from a
// live feed; swap this array for a websocket-backed hook when that lands.
const STUB_COMMENTS: Array<{ user: string; text: string }> = [
  { user: '@iyleRunner', text: 'love this ✨' },
  { user: '@moonkid', text: 'she is SO pretty' },
  { user: '@pxl_ghost', text: 'first time here, instantly hooked' },
  { user: '@aoi_stan', text: 'the outfit today 🔥' },
  { user: '@nightowl', text: 'hi aoi' },
  { user: '@steffi.b', text: 'this stream is a vibe' },
  { user: '@tk_devv', text: 'what is she reading?' },
  { user: '@lemonlime', text: 'OMG waving at me' },
  { user: '@justme22', text: 'can we play a game?' },
  { user: '@curious_cat', text: 'she seems so real' },
];

const STUB_VIEWER_COUNT = 180;

function getDefaultPos() {
  if (typeof window === 'undefined') return { x: 50, y: 50 };
  return {
    x: Math.max(MARGIN, Math.floor((window.innerWidth - DEFAULT_W) / 2)),
    y: Math.max(MARGIN, Math.floor((window.innerHeight - DEFAULT_H) / 2)),
  };
}

const LiveWindow: React.FC<LiveWindowProps> = ({ visible, onClose, zIndex, onFocus }) => {
  const [pos, setPos] = useState(getDefaultPos);
  const [size, setSize] = useState({ width: DEFAULT_W, height: DEFAULT_H });
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [preMaxState, setPreMaxState] = useState<{
    pos: { x: number; y: number };
    size: { width: number; height: number };
  } | null>(null);

  // Match ChatPanel's load pattern: get the collection with DEFAULT fallback,
  // then pull the active character. loadCharacterConfigSync alone returns null
  // when localStorage is empty (fresh install) — that's why the placeholder
  // was firing here while ChatWindow rendered Aoi fine.
  const charCollection = loadCharacterCollectionSync() ?? DEFAULT_CHAR_COLLECTION;
  const character = getActiveCharacter(charCollection);
  const characterName = character?.character_name ?? 'Aoi';

  // Live-stream "all-in-one" video — full-frame VTuber loop (the Rea_allinone
  // pattern). Default to the local /public/live-stream/aoi-live.mp4 asset so
  // the Live tab feels like watching a real stream. Falls back to the
  // emotion resolver for characters that ship their own loop in
  // emotion_videos['live'] or 'default'.
  const liveLoopUrl =
    character?.character_meta_info?.emotion_videos?.live?.[0] ??
    '/live-stream/aoi-live.mp4';
  const fallbackMedia = character
    ? resolveEmotionMedia(character, 'default')
    : undefined;
  const characterMedia: { url: string; type: 'video' | 'image' } | undefined =
    liveLoopUrl
      ? { url: liveLoopUrl, type: 'video' }
      : fallbackMedia;

  const toggleMax = useCallback(() => {
    if (maximized) {
      if (preMaxState) {
        setPos(preMaxState.pos);
        setSize(preMaxState.size);
      }
      setMaximized(false);
    } else {
      setPreMaxState({ pos, size });
      // Subtract a small inset from viewport dims — react-rnd's bounds="window"
      // pushes the window off-screen if size exactly equals viewport (no slack
      // for the bounds check). Also leave room for the dock/taskbar at the
      // bottom (~80px) so the window doesn't cover OpenRoom's app launcher.
      const inset = 8;
      const dockHeight = 80;
      setPos({ x: inset, y: inset });
      setSize({
        width: Math.max(MIN_W, window.innerWidth - inset * 2),
        height: Math.max(MIN_H, window.innerHeight - inset * 2 - dockHeight),
      });
      setMaximized(true);
    }
  }, [maximized, preMaxState, pos, size]);

  if (!visible) return null;

  const effectiveSize = minimized
    ? { width: size.width, height: 40 }
    : size;

  return (
    <Rnd
      className={styles.wrapper}
      size={effectiveSize}
      position={pos}
      minWidth={MIN_W}
      minHeight={minimized ? 40 : MIN_H}
      bounds="window"
      dragHandleClassName={styles.header}
      enableResizing={!minimized}
      onDragStop={(_, d) => setPos({ x: d.x, y: d.y })}
      onResizeStop={(_, __, ref, ___, position) => {
        setSize({ width: ref.offsetWidth, height: ref.offsetHeight });
        setPos(position);
      }}
      onMouseDown={onFocus}
      style={{ zIndex: zIndex ?? 1000 }}
      data-testid="live-window"
    >
      <div className={styles.window}>
        <div className={styles.header} data-testid="live-window-header">
          <div className={styles.headerLeft}>
            <span className={styles.liveBadge}>
              <Radio size={12} />
              <span>Live</span>
            </span>
            <span className={styles.viewerCount}>{STUB_VIEWER_COUNT}</span>
          </div>
          <div className={styles.headerRight}>
            <button
              className={styles.iconBtn}
              onClick={() => setMinimized((v) => !v)}
              title={minimized ? 'Restore' : 'Minimize'}
              data-testid="live-window-min"
            >
              <Minus size={14} />
            </button>
            <button
              className={styles.iconBtn}
              onClick={toggleMax}
              title={maximized ? 'Restore' : 'Maximize'}
              data-testid="live-window-max"
            >
              <Maximize2 size={14} />
            </button>
            <button
              className={styles.iconBtn}
              onClick={onClose}
              title="Close"
              data-testid="live-window-close"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {!minimized && (
          <div className={styles.body}>
            {/* LEFT: scrolling viewer-comment list */}
            <div className={styles.commentList} data-testid="live-comment-list">
              {STUB_COMMENTS.map((c, i) => (
                <div key={i} className={styles.comment}>
                  <span className={styles.commentUser}>{c.user}</span>
                  <span className={styles.commentText}>{c.text}</span>
                </div>
              ))}
            </div>

            {/* RIGHT: character full-body art (video if available, else image) */}
            <div className={styles.characterSide}>
              {characterMedia?.type === 'video' ? (
                <video
                  src={characterMedia.url}
                  className={styles.characterImg}
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : characterMedia?.url ? (
                <img
                  src={characterMedia.url}
                  alt={characterName}
                  className={styles.characterImg}
                />
              ) : (
                <div className={styles.characterPlaceholder}>
                  {characterName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Rnd>
  );
};

export default LiveWindow;
