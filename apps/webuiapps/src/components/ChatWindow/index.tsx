/**
 * ChatWindow — floating, draggable, resizable wrapper around ChatPanel.
 *
 * Provides a real window chrome (header + min/max/close) so ChatPanel can
 * shed its own header in `windowed` mode. All chat wiring (useKayleyChannel,
 * local LLM fallback, tool calls, vibe_action round-trip) lives inside
 * ChatPanel; ChatWindow is a presentational shell.
 *
 * The window stays mounted even when hidden (visibility toggled via
 * `visible` prop / avatar orb) so chat history and the Kayley WebSocket
 * connection are preserved across show/hide.
 */

import React, { useState, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { Minus, Maximize2, X } from 'lucide-react';
import ChatPanel from '../ChatPanel';
import {
  loadCharacterCollectionSync,
  getActiveCharacter,
  DEFAULT_COLLECTION as DEFAULT_CHAR_COLLECTION,
} from '@/lib/characterManager';
import styles from './index.module.scss';

export interface ChatWindowProps {
  visible: boolean;
  onClose: () => void;
  zIndex?: number;
  onFocus?: () => void;
}

const DEFAULT_W = 720;
const DEFAULT_H = 560;
const MIN_W = 360;
const MIN_H = 400;
const MARGIN = 24;

function getDefaultPos() {
  if (typeof window === 'undefined') return { x: 100, y: 100 };
  return {
    x: Math.max(MARGIN, Math.floor((window.innerWidth - DEFAULT_W) / 2)),
    y: Math.max(MARGIN, Math.floor((window.innerHeight - DEFAULT_H) / 2)),
  };
}

const ChatWindow: React.FC<ChatWindowProps> = ({ visible, onClose, zIndex, onFocus }) => {
  const [pos, setPos] = useState(getDefaultPos);
  const [size, setSize] = useState({ width: DEFAULT_W, height: DEFAULT_H });
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [preMaxState, setPreMaxState] = useState<{
    pos: { x: number; y: number };
    size: { width: number; height: number };
  } | null>(null);

  // Pull character name for the header label so it matches Live's character.
  const charCollection = loadCharacterCollectionSync() ?? DEFAULT_CHAR_COLLECTION;
  const character = getActiveCharacter(charCollection);
  const characterName = character?.character_name ?? 'Chat';

  const toggleMax = useCallback(() => {
    if (maximized) {
      if (preMaxState) {
        setPos(preMaxState.pos);
        setSize(preMaxState.size);
      }
      setMaximized(false);
    } else {
      setMinimized(false);
      setPreMaxState({ pos, size });
      // Inset from viewport edges to keep react-rnd's bounds="window" happy
      // and leave room for the bottom dock/taskbar.
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
      data-testid="chat-window"
    >
      <div className={styles.window}>
        <div className={styles.header} data-testid="chat-window-header">
          <div className={styles.headerLeft}>
            <span>{characterName}</span>
          </div>
          <div className={styles.headerRight}>
            <button
              className={styles.iconBtn}
              onClick={() => setMinimized((v) => !v)}
              title={minimized ? 'Restore' : 'Minimize'}
              data-testid="chat-window-min"
            >
              <Minus size={14} />
            </button>
            <button
              className={styles.iconBtn}
              onClick={toggleMax}
              title={maximized ? 'Restore' : 'Maximize'}
              data-testid="chat-window-max"
            >
              <Maximize2 size={14} />
            </button>
            <button
              className={styles.iconBtn}
              onClick={onClose}
              title="Close"
              data-testid="chat-window-close"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {!minimized && (
          <div className={styles.body}>
            <ChatPanel
              onClose={onClose}
              visible={true}
              zIndex={undefined}
              onFocus={onFocus}
              windowed
            />
          </div>
        )}
      </div>
    </Rnd>
  );
};

export default ChatWindow;
