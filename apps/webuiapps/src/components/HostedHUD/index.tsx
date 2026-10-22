/**
 * HostedHUD — overlay that recreates the hosted openroom.ai layout elements
 * that are NOT in the open-source OpenRoom repo:
 *
 *   - Centered-bottom yellow pill prompt input ("[Character] awaits your response…")
 *   - Bottom-dock suggested prompts (stubs for v1 — 3 canned prompts)
 *   - Avatar orb bottom-right (floating mini-portrait; clicking toggles ChatPanel)
 *   - Live/Chat tab header (top-right; Live is stubbed for v1)
 *
 * The existing right-side ChatPanel (full chat history + character PiP) continues
 * to serve as the "Chat" tab drawer — collapsible via the avatar orb.
 *
 * All submissions route through the SAME Kayley channel (useKayleyChannel),
 * falling back to local LLM via the standard `chat()` path when Kayley isn't
 * connected. Behavior matches ChatPanel's handleSend exactly.
 *
 * Live tab content, dual-character stage, and dynamic suggested prompts are
 * explicitly stubbed for v1 — see README in apps/webuiapps for roadmap.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Radio, Send, GripHorizontal } from 'lucide-react';
import { useKayleyChannel } from '@/hooks/useKayleyChannel';
import { loadCharacterConfigSync } from '@/lib/characterManager';
import { logger } from '@/lib/logger';
import LiveWindow from '../LiveWindow';
import styles from './index.module.scss';

export interface HostedHUDProps {
  /** True when the right-side ChatPanel drawer is visible. */
  chatOpen: boolean;
  /** Toggle the right-side ChatPanel drawer. */
  onToggleChat: () => void;
}

// Stub prompts for v1. Real hosted build generates these dynamically from
// character context; replace with a fetch/derive call when that lands.
const STUB_PROMPTS = [
  'How are you feeling right now?',
  "Tell me something I don't know about you.",
  'What should we do tonight?',
];

type Tab = 'live' | 'chat';

const HostedHUD: React.FC<HostedHUDProps> = ({ chatOpen, onToggleChat }) => {
  const [tab, setTab] = useState<Tab>('chat');
  const [liveOpen, setLiveOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pillPos, setPillPos] = useState<{ x: number; y: number } | null>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  const kayley = useKayleyChannel();
  const kayleyRef = useRef(kayley);
  kayleyRef.current = kayley;

  const character = loadCharacterConfigSync();
  const characterName = character?.character_name ?? 'Aoi';
  const avatarUrl = character?.character_meta_info?.base_image_url ?? '';

  // Release the sending lock when a Kayley reply arrives.
  useEffect(() => {
    if (kayley.latestMessage) setSending(false);
  }, [kayley.latestMessage]);

  const handleSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const kRef = kayleyRef.current;
      if (kRef.connected) {
        setSending(true);
        kRef.sendText(trimmed);
        setInput('');
        // Auto-clear lock after 90s as a safety net — ChatPanel's own timeout
        // handles UI-level messaging; we just release the pill.
        setTimeout(() => setSending(false), 90_000);
        return;
      }
      // Kayley not connected — pass through to ChatPanel's send path by
      // dispatching a window event. ChatPanel listens via a new handler.
      window.dispatchEvent(
        new CustomEvent('hosted-hud-send', { detail: { text: trimmed } }),
      );
      setInput('');
    },
    [sending],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(input);
      }
    },
    [handleSubmit, input],
  );

  const handlePillDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = pillRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const startPosX = rect.left;
    const startPosY = rect.top;
    setPillPos({ x: startPosX, y: startPosY });
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: MouseEvent) => {
      setPillPos({
        x: startPosX + ev.clientX - startX,
        y: startPosY + ev.clientY - startY,
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Log view for debug parity with ChatPanel.
  useEffect(() => {
    logger.info('HostedHUD', 'mounted', { character: characterName });
  }, [characterName]);

  return (
    <>
      {/* Live / Chat tabs — top right */}
      <div className={styles.tabs} data-testid="hosted-hud-tabs">
        <button
          className={`${styles.tab} ${tab === 'live' ? styles.active : ''}`}
          onClick={() => {
            setTab('live');
            setLiveOpen(true);
          }}
          data-testid="tab-live"
        >
          <Radio size={13} />
          <span>Live</span>
          <span className={styles.viewerCount}>· 1.2k</span>
        </button>
        <button
          className={`${styles.tab} ${tab === 'chat' ? styles.active : ''}`}
          onClick={() => {
            setTab('chat');
            if (!chatOpen) onToggleChat();
          }}
          data-testid="tab-chat"
        >
          <MessageCircle size={13} />
          <span>Chat</span>
        </button>
      </div>

      {/* Live floating window — draggable + resizable. Visibility is driven
          by the Live tab toggle; closing the window drops back to Chat tab. */}
      <LiveWindow
        visible={liveOpen}
        onClose={() => {
          setLiveOpen(false);
          setTab('chat');
        }}
      />

      {/* Suggested prompts dock removed per Steven's preference 2026-04-15 —
          he wanted a minimal centered-bottom UI with just the pill input.
          Stub prompt array kept above so it's easy to re-enable later. */}

      {/* Centered-bottom yellow pill input.
          Only show when the Live panel is open — the Chat window has its own
          input inside the panel, so the pill is exclusively a Live-mode control. */}
      {liveOpen && (
        <div
          ref={pillRef}
          className={styles.pillWrap}
          style={
            pillPos
              ? { left: pillPos.x, top: pillPos.y, transform: 'none', bottom: 'auto' }
              : undefined
          }
        >
          <div className={styles.pillDragHandle} onMouseDown={handlePillDragStart} title="Drag to move">
            <GripHorizontal size={14} />
          </div>
          <div className={styles.pill}>
            <input
              type="text"
              className={styles.pillInput}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`${characterName} awaits your response...`}
              disabled={sending}
              data-testid="hosted-hud-input"
            />
            <button
              className={styles.pillSend}
              onClick={() => handleSubmit(input)}
              disabled={!input.trim() || sending}
              title="Send"
              data-testid="hosted-hud-send"
            >
              <Send size={16} />
            </button>
          </div>
          {kayley.connected && (
            <span className={styles.connectedDot} title="Connected to Kayley brain" />
          )}
        </div>
      )}

      {/* Avatar orb — bottom right, toggles ChatPanel */}
      <button
        className={styles.avatarOrb}
        onClick={onToggleChat}
        title={chatOpen ? 'Hide chat' : 'Show chat'}
        data-testid="avatar-orb"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={characterName} />
        ) : (
          <span className={styles.avatarInitial}>
            {characterName.charAt(0).toUpperCase()}
          </span>
        )}
      </button>
    </>
  );
};

export default HostedHUD;
