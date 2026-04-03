/**
 * ChatPanel — main chat interface
 *
 * This is the "thin shell" that wires state to UI.
 * Core logic lives in:
 *   - toolDefinitions.ts    (tool defs, system prompt builder)
 *   - ChatSubComponents.tsx  (CharacterAvatar, StageIndicator, ActionsTaken)
 *   - SettingsModal.tsx      (LLM + image gen config UI)
 *   - useConversationEngine.ts (conversation loop + tool dispatch)
 */

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { Settings, Trash2, RotateCcw, Minus, Maximize2 } from 'lucide-react';
import { loadConfig, loadConfigSync, saveConfig, type ChatMessage } from '@/lib/llmClient';
import type { LLMConfig } from '@/lib/llmModels';
import {
  loadImageGenConfig,
  loadImageGenConfigSync,
  saveImageGenConfig,
  type ImageGenConfig,
} from '@/lib/imageGenClient';
// loadActionsFromMeta used by useConversationEngine
import { seedMetaFiles } from '@/lib/seedMeta';
import { onUserAction } from '@/lib/vibeContainerMock';
import { closeAllWindows } from '@/lib/windowManager';
import { setSessionPath } from '@/lib/sessionPath';
import { loadMemories, type MemoryEntry } from '@/lib/memoryManager';
import {
  loadChatHistory,
  loadChatHistorySync,
  saveChatHistory,
  clearChatHistory,
  buildSessionPath,
  type DisplayMessage,
} from '@/lib/chatHistoryStorage';
import {
  type CharacterCollection,
  DEFAULT_COLLECTION as DEFAULT_CHAR_COLLECTION,
  loadCharacterCollection,
  loadCharacterCollectionSync,
  saveCharacterCollection,
  getActiveCharacter,
} from '@/lib/characterManager';
import {
  type ModCollection,
  DEFAULT_MOD_COLLECTION,
  loadModCollection,
  loadModCollectionSync,
  saveModCollection,
  getActiveModEntry,
  ModManager,
} from '@/lib/modManager';
import { APP_REGISTRY } from '@/lib/appRegistry';
import { logger } from '@/lib/logger';
import CharacterPanel from './CharacterPanel';
import ModPanel from './ModPanel';
import { hasUsableLLMConfig } from './toolDefinitions';
import {
  CharacterAvatar,
  StageIndicator,
  ActionsTaken,
  renderMessageContent,
} from './ChatSubComponents';
import SettingsModal from './SettingsModal';
import { useConversationEngine, type ConversationDisplayMessage } from './useConversationEngine';
import styles from './index.module.scss';

// ---------------------------------------------------------------------------
// Extended DisplayMessage with character-specific fields
// ---------------------------------------------------------------------------

interface CharacterDisplayMessage extends DisplayMessage {
  emotion?: string;
  suggestedReplies?: string[];
  toolCalls?: string[];
}

interface PendingSaveSnapshot {
  path: string;
  messages: CharacterDisplayMessage[];
  history: ChatMessage[];
  replies: string[];
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

const ChatPanel: React.FC<{
  onClose: () => void;
  visible?: boolean;
  zIndex?: number;
  onFocus?: () => void;
}> = ({ onClose, visible = true, zIndex, onFocus }) => {
  // Character + Mod state
  const [charCollection, setCharCollection] = useState<CharacterCollection>(
    () => loadCharacterCollectionSync() ?? DEFAULT_CHAR_COLLECTION,
  );
  const character = getActiveCharacter(charCollection);

  const [modCollection, setModCollection] = useState<ModCollection>(
    () => loadModCollectionSync() ?? DEFAULT_MOD_COLLECTION,
  );
  const [modManager, setModManager] = useState<ModManager | null>(() => {
    const col = loadModCollectionSync() ?? DEFAULT_MOD_COLLECTION;
    const entry = getActiveModEntry(col);
    return new ModManager(entry.config, entry.state);
  });

  // Session key for chat history isolation (derived, not state)
  const sessionPath = buildSessionPath(charCollection.activeId, modCollection.activeId);

  // Keep the module-level session path in sync synchronously after DOM
  // mutations so tool execution always reads the latest path, even within the
  // same paint cycle as a character/mod switch.
  useLayoutEffect(() => {
    setSessionPath(sessionPath);
  }, [sessionPath]);

  // Chat state
  const [messages, setMessages] = useState<CharacterDisplayMessage[]>(() => {
    const cache = loadChatHistorySync(sessionPath);
    return (cache?.messages ?? []) as CharacterDisplayMessage[];
  });
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    const cache = loadChatHistorySync(sessionPath);
    return cache?.chatHistory ?? [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<LLMConfig | null>(loadConfigSync);
  const [imageGenConfig, setImageGenConfig] = useState<ImageGenConfig | null>(
    loadImageGenConfigSync,
  );
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [showCharacterPanel, setShowCharacterPanel] = useState(false);
  const [showModPanel, setShowModPanel] = useState(false);
  const [initialEditModId, setInitialEditModId] = useState<string | undefined>();
  const [currentEmotion, setCurrentEmotion] = useState<string | undefined>();
  const [memories, setMemories] = useState<MemoryEntry[]>([]);

  // Refs for stable access in callbacks
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const chatHistoryRef = useRef(chatHistory);
  chatHistoryRef.current = chatHistory;
  const suggestedRepliesRef = useRef(suggestedReplies);
  suggestedRepliesRef.current = suggestedReplies;

  const configRef = useRef(config);
  configRef.current = config;
  const imageGenConfigRef = useRef(imageGenConfig);
  imageGenConfigRef.current = imageGenConfig;
  const modManagerRef = useRef(modManager);
  modManagerRef.current = modManager;
  const characterRef = useRef(character);
  characterRef.current = character;
  const memoriesRef = useRef(memories);
  memoriesRef.current = memories;
  const sessionPathRef = useRef(sessionPath);
  sessionPathRef.current = sessionPath;

  // Conversation engine
  const { runConversation } = useConversationEngine({
    imageGenConfigRef,
    modManagerRef,
    characterRef,
    memoriesRef,
    sessionPathRef,
    callbacks: {
      addMessage: useCallback((msg: ConversationDisplayMessage) => {
        setMessages((prev) => [...prev, msg]);
      }, []),
      setChatHistory,
      setSuggestedReplies,
      setCurrentEmotion,
      setModCollection,
      setModManager,
      setMemories,
    },
  });

  // Debounced save — tracks the most recent snapshot to be persisted.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<PendingSaveSnapshot | null>(null);

  // Reschedule the debounce timer on every data change.  Never flush
  // synchronously here — flushing is handled by the session-switch effect below
  // so that rapid updates (e.g. streaming tokens) are genuinely batched.
  useEffect(() => {
    if (messages.length === 0 && chatHistory.length === 0) {
      pendingSaveRef.current = null;
      return;
    }
    pendingSaveRef.current = {
      path: sessionPath,
      messages,
      history: chatHistory,
      replies: suggestedReplies,
    };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (pendingSaveRef.current) {
        const { path, messages: m, history: h, replies: r } = pendingSaveRef.current;
        saveChatHistory(path, m, h, r);
        pendingSaveRef.current = null;
      }
      saveTimerRef.current = null;
    }, 500);
    return () => {
      // Cancel the timer so the next render's effect can reschedule it.
      // Do NOT flush here — that would fire a POST on every state update,
      // defeating the debounce.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [messages, chatHistory, suggestedReplies]);

  // Flush any pending save when the session path changes (character/mod switch)
  // or when the component unmounts, so no data is silently lost.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (pendingSaveRef.current) {
        const { path, messages: m, history: h, replies: r } = pendingSaveRef.current;
        saveChatHistory(path, m, h, r);
        pendingSaveRef.current = null;
      }
    };
  }, [sessionPath]);

  /** Seed prologue and opening replies from active mod */
  const seedPrologue = useCallback(() => {
    const entry = getActiveModEntry(modCollection);
    const prologue = entry.config.prologue;
    if (prologue) {
      const prologueMsg: CharacterDisplayMessage = {
        id: 'prologue',
        role: 'assistant',
        content: prologue,
      };
      setMessages([prologueMsg]);
      setChatHistory([{ role: 'assistant', content: prologue }]);
    } else {
      setMessages([]);
      setChatHistory([]);
    }
    const openingReplies = entry.config.opening_rec_replies;
    setSuggestedReplies(openingReplies?.length ? openingReplies.map((r) => r.reply_text) : []);
    setCurrentEmotion(undefined);
  }, [modCollection]);

  // Reload chat history when session changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const data = await loadChatHistory(sessionPath);
      if (cancelled) return;
      const loadedMessages = (data?.messages ?? []) as CharacterDisplayMessage[];
      const loadedHistory = data?.chatHistory ?? [];
      if (loadedMessages.length === 0 && loadedHistory.length === 0) {
        seedPrologue();
      } else {
        setMessages(loadedMessages);
        setChatHistory(loadedHistory);
        if (data?.suggestedReplies?.length) {
          setSuggestedReplies(data.suggestedReplies);
        } else {
          const onlyPrologue = loadedMessages.length === 1 && loadedMessages[0].id === 'prologue';
          if (onlyPrologue) {
            const entry = getActiveModEntry(modCollection);
            const openingReplies = entry.config.opening_rec_replies;
            setSuggestedReplies(
              openingReplies?.length ? openingReplies.map((r) => r.reply_text) : [],
            );
          } else {
            setSuggestedReplies([]);
          }
        }
        setCurrentEmotion(undefined);
      }
      if (cancelled) return;
      loadMemories(sessionPath)
        .then((mems) => {
          if (!cancelled) setMemories(mems);
        })
        .catch(() => {
          if (!cancelled) setMemories([]);
        });
    };
    load();
    return () => {
      cancelled = true;
    };
    // sessionPath is derived from charCollection.activeId + modCollection.activeId,
    // so it already captures session changes. seedPrologue reads modCollection via
    // closure but we only want to trigger on session identity change.
  }, [sessionPath]);

  // Load configs from file (async override)
  useEffect(() => {
    loadConfig().then((fileConfig) => {
      if (fileConfig) setConfig(fileConfig);
    });
    loadImageGenConfig().then((fileConfig) => {
      if (fileConfig) setImageGenConfig(fileConfig);
    });
    loadCharacterCollection().then((col) => {
      if (col) setCharCollection(col);
    });
    loadModCollection().then((col) => {
      if (col) {
        setModCollection(col);
        const entry = getActiveModEntry(col);
        setModManager(new ModManager(entry.config, entry.state));
      }
    });
  }, []);

  // Listen for mod collection changes from Shell
  useEffect(() => {
    const handler = (e: Event) => {
      const col = (e as CustomEvent<ModCollection>).detail;
      if (col) {
        setModCollection(col);
        const entry = getActiveModEntry(col);
        setModManager(new ModManager(entry.config, entry.state));
      }
    };
    window.addEventListener('mod-collection-changed', handler);
    return () => window.removeEventListener('mod-collection-changed', handler);
  }, []);

  // Open mod editor when triggered from Shell
  useEffect(() => {
    const handler = (e: Event) => {
      const modId = (e as CustomEvent<{ modId: string }>).detail?.modId;
      if (modId) {
        setInitialEditModId(modId);
        setShowModPanel(true);
      }
    };
    window.addEventListener('open-mod-editor', handler);
    return () => window.removeEventListener('open-mod-editor', handler);
  }, []);

  const handleClearHistory = useCallback(async () => {
    await clearChatHistory(sessionPathRef.current);
    seedPrologue();
  }, [seedPrologue]);

  const handleResetSession = useCallback(async () => {
    const sp = sessionPathRef.current;
    try {
      await fetch(`/api/session-reset?path=${encodeURIComponent(sp)}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
    localStorage.removeItem(`openroom_chat_${sp.replace(/\//g, '_')}`);
    setMessages([]);
    setChatHistory([]);
    setSuggestedReplies([]);
    setMemories([]);
    setCurrentEmotion(undefined);
    closeAllWindows();

    if (modManagerRef.current) {
      modManagerRef.current.reset();
      const mm = modManagerRef.current;
      setModManager(new ModManager(mm.getConfig(), mm.getState()));
      setModCollection((prev) => {
        const entry = getActiveModEntry(prev);
        const updated = {
          ...prev,
          items: {
            ...prev.items,
            [entry.config.id]: { config: entry.config, state: mm.getState() },
          },
        };
        saveModCollection(updated);
        return updated;
      });
    }

    seedPrologue();
    await seedMetaFiles();
  }, [seedPrologue]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const addMessage = useCallback((msg: CharacterDisplayMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // User action queue
  const actionQueueRef = useRef<string[]>([]);
  const processingRef = useRef(false);

  const processActionQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (actionQueueRef.current.length > 0) {
      const actionMsg = actionQueueRef.current.shift()!;
      const cfg = configRef.current;
      if (!hasUsableLLMConfig(cfg)) break;

      const newHistory: ChatMessage[] = [
        ...chatHistoryRef.current,
        { role: 'user', content: actionMsg },
      ];
      setChatHistory(newHistory);
      setLoading(true);
      try {
        await runConversation(newHistory, cfg);
      } catch (err) {
        logger.error('ChatPanel', 'User action error:', err);
      } finally {
        setLoading(false);
      }
    }
    processingRef.current = false;
  }, [runConversation]);

  // Listen for user actions from apps
  useEffect(() => {
    const unsubscribe = onUserAction((event: unknown) => {
      const cfg = configRef.current;
      if (!hasUsableLLMConfig(cfg)) return;

      const evt = event as {
        app_action?: {
          app_id: number;
          action_type: string;
          params?: Record<string, string>;
          trigger_by?: number;
        };
        action_result?: string;
      };
      logger.info('ChatPanel', 'onUserAction received:', evt);
      if (evt.action_result !== undefined) return;
      const action = evt.app_action;
      if (!action) return;
      if (action.trigger_by === 2) return;

      const app = APP_REGISTRY.find((a) => a.appId === action.app_id);
      if (!app) return;

      const actionMsg = `[User performed action in ${app.displayName} (appName: ${app.appName})] action_type: ${action.action_type}, params: ${JSON.stringify(action.params || {})}`;
      actionQueueRef.current.push(actionMsg);
      processActionQueue();
    });
    return unsubscribe;
  }, [processActionQueue]);

  // Send message
  const handleSend = useCallback(
    async (overrideText?: string) => {
      const text = overrideText ?? input.trim();
      if (!text || loading) return;
      if (!hasUsableLLMConfig(config)) {
        setShowSettings(true);
        return;
      }

      if (!overrideText) setInput('');
      setSuggestedReplies([]);

      const userDisplay: CharacterDisplayMessage = {
        id: String(Date.now()),
        role: 'user',
        content: text,
      };
      addMessage(userDisplay);

      const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: text }];
      setChatHistory(newHistory);

      setLoading(true);
      try {
        await runConversation(newHistory, config);
      } catch (err) {
        logger.error('ChatPanel', 'Error:', err);
        addMessage({
          id: String(Date.now()),
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        setLoading(false);
      }
    },
    [input, loading, config, chatHistory, addMessage, runConversation],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!visible) return null;

  return (
    <>
      <div
        className={styles.panel}
        data-testid="chat-panel"
        style={zIndex !== null && zIndex !== undefined ? { zIndex } : undefined}
        onMouseDown={onFocus}
      >
        {/* Left: Character Avatar */}
        <div className={styles.avatarSide}>
          <CharacterAvatar
            character={character}
            emotion={currentEmotion}
            onEmotionEnd={() => setCurrentEmotion(undefined)}
          />
        </div>

        {/* Right: Chat */}
        <div className={styles.chatSide}>
          <div className={styles.header}>
            <div
              className={styles.headerLeft}
              onClick={() => setShowCharacterPanel(true)}
              style={{ cursor: 'pointer' }}
            >
              <span className={styles.characterName}>{character.character_name}</span>
            </div>
            <div className={styles.headerActions}>
              <div onClick={() => setShowModPanel(true)} style={{ cursor: 'pointer' }}>
                <StageIndicator modManager={modManager} />
              </div>
              <button
                className={styles.iconBtn}
                onClick={handleResetSession}
                title="Reset session"
                data-testid="reset-session"
              >
                <RotateCcw size={16} />
              </button>
              <button
                className={styles.iconBtn}
                onClick={handleClearHistory}
                title="Clear chat"
                data-testid="clear-chat"
              >
                <Trash2 size={16} />
              </button>
              <button
                className={styles.iconBtn}
                onClick={() => setShowSettings(true)}
                title="Settings"
                data-testid="settings-btn"
              >
                <Settings size={16} />
              </button>
              <button className={styles.iconBtn} onClick={onClose} title="Minimize">
                <Minus size={16} />
              </button>
              <button className={styles.iconBtn} title="Maximize">
                <Maximize2 size={16} />
              </button>
            </div>
          </div>

          <div className={styles.messages} data-testid="chat-messages">
            {messages.length === 0 && (
              <div className={styles.emptyState}>
                {hasUsableLLMConfig(config)
                  ? `${character.character_name} is ready to chat...`
                  : 'Click the gear icon to configure your LLM connection'}
              </div>
            )}
            {messages.map((msg) => (
              <React.Fragment key={msg.id}>
                <div
                  data-testid="chat-message"
                  className={`${styles.message} ${
                    msg.role === 'user'
                      ? styles.user
                      : msg.role === 'tool'
                        ? styles.toolInfo
                        : styles.assistant
                  }`}
                >
                  {msg.role === 'assistant' ? renderMessageContent(msg.content) : msg.content}
                  {msg.imageUrl && (
                    <img src={msg.imageUrl} alt="Generated" className={styles.messageImage} />
                  )}
                </div>
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <ActionsTaken calls={msg.toolCalls} />
                )}
              </React.Fragment>
            ))}
            {loading && <div className={styles.loading}>Thinking...</div>}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Replies */}
          {suggestedReplies.length > 0 && !loading && (
            <div className={styles.suggestedReplies}>
              {suggestedReplies.map((reply, i) => (
                <button key={i} className={styles.suggestedReply} onClick={() => handleSend(reply)}>
                  {reply}
                </button>
              ))}
            </div>
          )}

          <div className={styles.inputArea}>
            <textarea
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              disabled={loading}
              data-testid="chat-input"
            />
            <button
              className={styles.sendBtn}
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              data-testid="send-btn"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          config={config}
          imageGenConfig={imageGenConfig}
          onSave={(c, igc) => {
            setConfig(c);
            setImageGenConfig(igc);
            saveConfig(c, igc);
            if (igc) saveImageGenConfig(igc);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showCharacterPanel && (
        <CharacterPanel
          collection={charCollection}
          onSave={(col) => {
            setCharCollection(col);
            saveCharacterCollection(col);
            setShowCharacterPanel(false);
          }}
          onClose={() => setShowCharacterPanel(false)}
        />
      )}

      {showModPanel && (
        <ModPanel
          collection={modCollection}
          initialEditId={initialEditModId}
          onSave={(col) => {
            setModCollection(col);
            saveModCollection(col);
            const entry = getActiveModEntry(col);
            setModManager(new ModManager(entry.config, entry.state));
            setShowModPanel(false);
            setInitialEditModId(undefined);
          }}
          onClose={() => {
            setShowModPanel(false);
            setInitialEditModId(undefined);
          }}
        />
      )}
    </>
  );
};

export default ChatPanel;
