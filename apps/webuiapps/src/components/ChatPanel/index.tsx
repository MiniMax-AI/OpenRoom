import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  Settings,
  Trash2,
  RotateCcw,
  Minus,
  Maximize2,
  ChevronDown,
  ChevronRight,
  Pencil,
  List,
} from 'lucide-react';
import { chat, loadConfig, loadConfigSync, saveConfig, type ChatMessage } from '@/lib/llmClient';
import {
  PROVIDER_MODELS,
  getDefaultProviderConfig,
  type LLMConfig,
  type LLMProvider,
} from '@/lib/llmModels';
import {
  loadImageGenConfig,
  loadImageGenConfigSync,
  saveImageGenConfig,
  getDefaultImageGenConfig,
  type ImageGenConfig,
  type ImageGenProvider,
} from '@/lib/imageGenClient';
import {
  getAppActionToolDefinition,
  resolveAppAction,
  getListAppsToolDefinition,
  executeListApps,
  APP_REGISTRY,
  loadActionsFromMeta,
} from '@/lib/appRegistry';
import { seedMetaFiles } from '@/lib/seedMeta';
import { dispatchAgentAction, onUserAction } from '@/lib/vibeContainerMock';
import { closeAllWindows } from '@/lib/windowManager';
import { getFileToolDefinitions, isFileTool, executeFileTool } from '@/lib/fileTools';
import { setSessionPath } from '@/lib/sessionPath';
import {
  getMemoryToolDefinitions,
  isMemoryTool,
  executeMemoryTool,
  loadMemories,
  buildMemoryPrompt,
  type MemoryEntry,
} from '@/lib/memoryManager';
import { logger } from '@/lib/logger';
import {
  getImageGenToolDefinitions,
  isImageGenTool,
  executeImageGenTool,
} from '@/lib/imageGenTools';
import {
  loadChatHistory,
  loadChatHistorySync,
  saveChatHistory,
  clearChatHistory,
  buildSessionPath,
  type DisplayMessage,
} from '@/lib/chatHistoryStorage';
import {
  type CharacterConfig,
  type CharacterCollection,
  DEFAULT_COLLECTION as DEFAULT_CHAR_COLLECTION,
  loadCharacterCollection,
  loadCharacterCollectionSync,
  saveCharacterCollection,
  getActiveCharacter,
  getCharacterPromptContext,
  resolveEmotionMedia,
  clearEmotionVideoCache,
} from '@/lib/characterManager';
import {
  ModManager,
  type ModCollection,
  DEFAULT_MOD_COLLECTION,
  loadModCollection,
  loadModCollectionSync,
  saveModCollection,
  getActiveModEntry,
} from '@/lib/modManager';
import CharacterPanel from './CharacterPanel';
import ModPanel from './ModPanel';
import styles from './index.module.scss';

// ---------------------------------------------------------------------------
// Extended DisplayMessage with character-specific fields
// ---------------------------------------------------------------------------

interface CharacterDisplayMessage extends DisplayMessage {
  emotion?: string;
  suggestedReplies?: string[];
  toolCalls?: string[]; // collapsed tool call summaries
}

function hasUsableLLMConfig(config: LLMConfig | null | undefined): config is LLMConfig {
  return !!config?.baseUrl.trim() && !!config.model.trim();
}

// ---------------------------------------------------------------------------
// Tool definitions for character system
// ---------------------------------------------------------------------------

function getRespondToUserToolDef() {
  return {
    type: 'function' as const,
    function: {
      name: 'respond_to_user',
      description:
        'Send a message to the user as the character. ALWAYS use this tool to respond — never output plain text.',
      parameters: {
        type: 'object' as const,
        properties: {
          character_expression: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description:
                  'The message text (dialogue with optional action descriptions in parentheses)',
              },
              emotion: {
                type: 'string',
                description: 'Character emotion: happy, shy, peaceful, depressing, angry',
              },
            },
            required: ['content'],
          },
          user_interaction: {
            type: 'object',
            properties: {
              suggested_replies: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of 3 suggested user replies (under 25 chars each)',
              },
            },
          },
        },
        required: ['character_expression'],
      },
    },
  };
}

function getFinishTargetToolDef() {
  return {
    type: 'function' as const,
    function: {
      name: 'finish_target',
      description:
        'Mark story targets as completed when achieved through conversation. Do not announce this to the user.',
      parameters: {
        type: 'object' as const,
        properties: {
          target_ids: {
            type: 'array',
            items: { type: 'number' },
            description: 'IDs of targets to mark as completed',
          },
        },
        required: ['target_ids'],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Build system prompt with Character + Mod context
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  character: CharacterConfig,
  modManager: ModManager | null,
  hasImageGen: boolean,
  memories: MemoryEntry[] = [],
): string {
  let prompt = getCharacterPromptContext(character);

  if (modManager) {
    prompt += '\n' + modManager.buildStageReminder();
  }

  prompt += `
You can interact with apps on the user's device using tools.

When the user wants to interact with an app, first identify the target app from the user's intent, then follow ALL steps in order:
1. list_apps — discover available apps
2. file_read("apps/{appName}/meta.yaml") — learn the target app's available actions
3. file_read("apps/{appName}/guide.md") — learn its data structure and JSON schema
4. file_list/file_read — explore existing data in "apps/{appName}/data/"
5. file_write/file_delete — create/modify/delete data following the JSON schema from step 3
6. app_action — notify the app to reload (ONLY use actions defined in meta.yaml)

Rules:
- Always operate on the app the user specified. Do not redirect the operation to a different app or OS action.
- Data mutations MUST go through file_write/file_delete. app_action only notifies the app to reload, it cannot write data.
- After file_write, ALWAYS call app_action with the corresponding REFRESH action.
- Do NOT skip step 5. If the user asked to save/create/add something, you must file_write the data. file_list alone does not save anything.
- Do NOT skip steps 2-3. You MUST read guide.md before ANY file_write. The guide defines the ONLY valid directory structure and file schemas. Writing to paths not defined in guide.md will cause data loss — the app will not see the files.
- NEVER invent or guess file paths. ALL file_write paths MUST exactly follow the directory structure in guide.md. For example, if guide.md defines entries under "/entries/{id}.json", you MUST write to "apps/{appName}/data/entries/{id}.json" — NOT to "apps/{appName}/data/{id}.json" or any other path.
- NAS paths in guide.md like "/articles/xxx.json" map to "apps/{appName}/data/articles/xxx.json". This prefix rule applies to ALL paths — always preserve the full subdirectory structure from guide.md.

When you receive "[User performed action in ... (appName: xxx)]", the appName is already provided. Read its meta.yaml to understand available actions, then respond accordingly. For games, respond with your own move — think strategically.

IMPORTANT: You MUST use the respond_to_user tool to send all messages to the user. Do NOT output plain text responses. Include your emotion and 3 suggested replies.${hasImageGen ? '\n\nYou can use generate_image to create images from text prompts. The generated image will be displayed in chat.' : ''}`;

  prompt += buildMemoryPrompt(memories);

  return prompt;
}

// ---------------------------------------------------------------------------
// Helper: parse action text in parentheses as emotion markers
// ---------------------------------------------------------------------------

function renderMessageContent(content: string): React.ReactNode {
  // Match (action text) patterns and render them as styled spans
  const parts = content.split(/(\([^)]+\))/g);
  return parts.map((part, i) => {
    if (/^\([^)]+\)$/.test(part)) {
      return (
        <span key={i} className={styles.emotion}>
          {part}
        </span>
      );
    }
    return part;
  });
}

// ---------------------------------------------------------------------------
// Stage Indicator Component
// ---------------------------------------------------------------------------

const StageIndicator: React.FC<{ modManager: ModManager | null }> = ({ modManager }) => {
  if (!modManager) return null;

  const total = modManager.stageCount;
  const current = modManager.currentStageIndex;
  const finished = modManager.isFinished;

  return (
    <div className={styles.stageIndicator}>
      <span className={styles.stageText}>
        Stage {finished ? total : current + 1}/{total}
      </span>
      <div className={styles.stageDots}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`${styles.stageDot} ${
              i < current || finished
                ? styles.stageDotCompleted
                : i === current
                  ? styles.stageDotCurrent
                  : ''
            }`}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Actions Taken (collapsible)
// ---------------------------------------------------------------------------

const ActionsTaken: React.FC<{ calls: string[] }> = ({ calls }) => {
  const [open, setOpen] = useState(false);
  if (calls.length === 0) return null;

  return (
    <div className={styles.actionsTaken}>
      <button className={styles.actionsTakenToggle} onClick={() => setOpen(!open)}>
        Actions taken
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className={styles.actionsTakenList}>
          {calls.map((c, i) => (
            <div key={i}>{c}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// CharacterAvatar – crossfade between emotion media without flashing
// ---------------------------------------------------------------------------

interface AvatarLayer {
  url: string;
  type: 'video' | 'image';
  active: boolean;
}

const CharacterAvatar: React.FC<{
  character: CharacterConfig;
  emotion?: string;
  onEmotionEnd: () => void;
}> = memo(({ character, emotion, onEmotionEnd }) => {
  const isIdle = !emotion;
  const media = resolveEmotionMedia(character, emotion || 'default');

  const [layers, setLayers] = useState<AvatarLayer[]>(() =>
    media ? [{ url: media.url, type: media.type, active: true }] : [],
  );
  const activeUrl = layers.find((l) => l.active)?.url;

  useEffect(() => {
    if (!media) {
      setLayers([]);
      return;
    }
    if (media.url === activeUrl) return;
    setLayers((prev) => {
      if (prev.some((l) => l.url === media.url)) return prev;
      return [...prev, { url: media.url, type: media.type, active: false }];
    });
  }, [media?.url, activeUrl]);

  const handleMediaReady = useCallback((readyUrl: string) => {
    setLayers((prev) => {
      const staleUrls = prev.filter((l) => l.url !== readyUrl).map((l) => l.url);
      setTimeout(() => {
        setLayers((curr) => curr.filter((l) => !staleUrls.includes(l.url)));
      }, 300);
      return prev.map((l) => ({ ...l, active: l.url === readyUrl }));
    });
  }, []);

  if (layers.length === 0) {
    return <div className={styles.avatarPlaceholder}>{character.character_name.charAt(0)}</div>;
  }

  return (
    <>
      {layers.map((layer) => {
        const layerStyle: React.CSSProperties = {
          position: 'absolute',
          inset: 0,
          opacity: layer.active ? 1 : 0,
          transition: 'opacity 0.25s ease-out',
        };
        if (layer.type === 'video') {
          return (
            <video
              key={layer.url}
              className={styles.avatarImage}
              style={layerStyle}
              src={layer.url}
              autoPlay
              loop={layer.active ? isIdle : false}
              muted
              playsInline
              onCanPlay={!layer.active ? () => handleMediaReady(layer.url) : undefined}
              onEnded={layer.active && !isIdle ? onEmotionEnd : undefined}
            />
          );
        }
        return (
          <img
            key={layer.url}
            className={styles.avatarImage}
            style={layerStyle}
            src={layer.url}
            alt={character.character_name}
            onLoad={!layer.active ? () => handleMediaReady(layer.url) : undefined}
          />
        );
      })}
    </>
  );
});

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

const ChatPanel: React.FC<{
  onClose: () => void;
  visible?: boolean;
  zIndex?: number;
  onFocus?: () => void;
}> = ({ onClose, visible = true, zIndex, onFocus }) => {
  // Character + Mod state (collection-based)
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

  // Session key for chat history isolation (character × mod)
  const sessionPath = buildSessionPath(charCollection.activeId, modCollection.activeId);
  setSessionPath(sessionPath);

  // Chat state — initialized from session-scoped cache
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

  // Suggested replies from latest assistant message
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [showCharacterPanel, setShowCharacterPanel] = useState(false);
  const [showModPanel, setShowModPanel] = useState(false);
  const [initialEditModId, setInitialEditModId] = useState<string | undefined>();
  const [currentEmotion, setCurrentEmotion] = useState<string | undefined>();

  // Open mod editor when triggered from Shell (e.g. after card import mod generation)
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

  // Memories loaded for SP injection
  const [memories, setMemories] = useState<MemoryEntry[]>([]);

  // Pending tool calls for current response (grouped per assistant turn)
  const pendingToolCallsRef = useRef<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const chatHistoryRef = useRef(chatHistory);
  chatHistoryRef.current = chatHistory;
  const suggestedRepliesRef = useRef(suggestedReplies);
  suggestedRepliesRef.current = suggestedReplies;

  // Debounced save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionPathRef = useRef(sessionPath);
  sessionPathRef.current = sessionPath;

  useEffect(() => {
    if (messages.length === 0 && chatHistory.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveChatHistory(
        sessionPathRef.current,
        messagesRef.current,
        chatHistoryRef.current,
        suggestedRepliesRef.current,
      );
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [messages, chatHistory, suggestedReplies]);

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

  // Reload chat history when session (character × mod) changes
  useEffect(() => {
    loadChatHistory(sessionPath).then((data) => {
      const loadedMessages = (data?.messages ?? []) as CharacterDisplayMessage[];
      const loadedHistory = data?.chatHistory ?? [];
      if (loadedMessages.length === 0 && loadedHistory.length === 0) {
        // No history — seed prologue
        seedPrologue();
      } else {
        setMessages(loadedMessages);
        setChatHistory(loadedHistory);
        // Restore suggested replies from saved data, or from mod config if only prologue
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
    });
    // Load memories for SP injection
    loadMemories(sessionPath).then(setMemories);
  }, [sessionPath, modCollection, seedPrologue]);

  // Load configs from file (async override).
  // Empty deps [] is intentional: configs (character collection, mod collection,
  // chat config, image-gen config) are loaded inside the effect and written to
  // state — they are not external dependencies that should trigger re-runs.
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

  // Listen for mod collection changes from Shell (e.g. after mod generation)
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

  const handleClearHistory = useCallback(async () => {
    await clearChatHistory(sessionPathRef.current);
    seedPrologue();
  }, [seedPrologue]);

  /** Reset entire session — clears chat, memories, app data, and mod state */
  const handleResetSession = useCallback(async () => {
    const sp = sessionPathRef.current;
    // Clear server-side session directory
    try {
      await fetch(`/api/session-reset?path=${encodeURIComponent(sp)}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
    // Clear local state
    localStorage.removeItem(`openroom_chat_${sp.replace(/\//g, '_')}`);
    setMessages([]);
    setChatHistory([]);
    setSuggestedReplies([]);
    setMemories([]);
    setCurrentEmotion(undefined);

    // Close all open app windows
    closeAllWindows();

    // Reset mod state
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

    // Re-seed prologue and opening replies
    seedPrologue();

    // Re-seed meta files
    await seedMetaFiles();
  }, [modCollection, seedPrologue]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const addMessage = useCallback((msg: CharacterDisplayMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

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
  }, []);

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
    [input, loading, config, chatHistory, addMessage],
  );

  // Core conversation loop
  const runConversation = async (history: ChatMessage[], cfg: LLMConfig) => {
    await seedMetaFiles();
    await loadActionsFromMeta();
    const hasImageGen = !!imageGenConfigRef.current?.apiKey;
    const mm = modManagerRef.current;
    const char = characterRef.current;

    const tools = [
      getRespondToUserToolDef(),
      getFinishTargetToolDef(),
      getListAppsToolDefinition(),
      getAppActionToolDefinition(),
      ...getFileToolDefinitions(),
      ...getMemoryToolDefinitions(),
      ...(hasImageGen ? getImageGenToolDefinitions() : []),
    ];

    const currentMemories = memoriesRef.current;
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(char, mm, hasImageGen, currentMemories) },
      ...history,
    ];

    let currentMessages = fullMessages;
    let iterations = 0;
    const maxIterations = 10;
    pendingToolCallsRef.current = [];

    while (iterations < maxIterations) {
      iterations++;
      const response = await chat(currentMessages, tools, cfg);

      if (response.toolCalls.length === 0) {
        // No tool calls — fallback plain text (shouldn't happen with respond_to_user requirement)
        if (response.content) {
          addMessage({
            id: String(Date.now()),
            role: 'assistant',
            content: response.content,
            toolCalls:
              pendingToolCallsRef.current.length > 0 ? [...pendingToolCallsRef.current] : undefined,
          });
          setChatHistory((prev) => [...prev, { role: 'assistant', content: response.content }]);
          pendingToolCallsRef.current = [];
        }
        break;
      }

      // Has tool calls
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls,
      };
      currentMessages = [...currentMessages, assistantMsg];

      // Execute each tool call
      for (const tc of response.toolCalls) {
        let params: Record<string, unknown> = {};
        try {
          params = JSON.parse(tc.function.arguments);
        } catch {
          // ignore
        }

        // ---- respond_to_user ----
        if (tc.function.name === 'respond_to_user') {
          const expr =
            (params.character_expression as { content?: string; emotion?: string }) ?? {};
          const interaction = (params.user_interaction as { suggested_replies?: string[] }) ?? {};

          const content = expr.content ?? '';
          const emotion = expr.emotion;
          const replies = interaction.suggested_replies ?? [];

          addMessage({
            id: String(Date.now()),
            role: 'assistant',
            content,
            emotion,
            suggestedReplies: replies,
            toolCalls:
              pendingToolCallsRef.current.length > 0 ? [...pendingToolCallsRef.current] : undefined,
          });
          setSuggestedReplies(replies);
          if (emotion) {
            clearEmotionVideoCache(character.id);
            setCurrentEmotion(emotion);
          }
          pendingToolCallsRef.current = [];

          setChatHistory((prev) => [...prev, { role: 'assistant', content }]);
          currentMessages = [
            ...currentMessages,
            { role: 'tool', content: 'Message delivered.', tool_call_id: tc.id },
          ];
          continue;
        }

        // ---- finish_target ----
        if (tc.function.name === 'finish_target') {
          const targetIds = (params.target_ids as number[]) ?? [];
          if (mm) {
            const result = mm.finishTarget(targetIds);
            // Persist state via collection
            const updatedEntry = { config: mm.getConfig(), state: mm.getState() };
            setModCollection((prev) => {
              const updated = {
                ...prev,
                items: { ...prev.items, [updatedEntry.config.id]: updatedEntry },
              };
              saveModCollection(updated);
              return updated;
            });
            setModManager(new ModManager(mm.getConfig(), mm.getState()));

            currentMessages = [
              ...currentMessages,
              { role: 'tool', content: JSON.stringify(result), tool_call_id: tc.id },
            ];
          } else {
            currentMessages = [
              ...currentMessages,
              { role: 'tool', content: 'No mod loaded.', tool_call_id: tc.id },
            ];
          }
          continue;
        }

        // ---- list_apps ----
        if (tc.function.name === 'list_apps') {
          const result = executeListApps();
          pendingToolCallsRef.current.push(`list_apps`);
          currentMessages = [
            ...currentMessages,
            { role: 'tool', content: result, tool_call_id: tc.id },
          ];
          continue;
        }

        // ---- File tools ----
        if (isFileTool(tc.function.name)) {
          pendingToolCallsRef.current.push(
            `${tc.function.name}(${JSON.stringify(params).slice(0, 60)})`,
          );
          try {
            const result = await executeFileTool(
              tc.function.name,
              params as Record<string, string>,
            );
            currentMessages = [
              ...currentMessages,
              { role: 'tool', content: result, tool_call_id: tc.id },
            ];
          } catch (err) {
            currentMessages = [
              ...currentMessages,
              {
                role: 'tool',
                content: `error: ${err instanceof Error ? err.message : String(err)}`,
                tool_call_id: tc.id,
              },
            ];
          }
          continue;
        }

        // ---- Image gen ----
        if (isImageGenTool(tc.function.name)) {
          pendingToolCallsRef.current.push('generate_image');
          try {
            const { result, dataUrl } = await executeImageGenTool(
              params as Record<string, string>,
              imageGenConfigRef.current,
            );
            if (dataUrl) {
              addMessage({
                id: String(Date.now()) + '-img',
                role: 'assistant',
                content: '',
                imageUrl: dataUrl,
              });
            }
            currentMessages = [
              ...currentMessages,
              { role: 'tool', content: result, tool_call_id: tc.id },
            ];
          } catch (err) {
            currentMessages = [
              ...currentMessages,
              {
                role: 'tool',
                content: `error: ${err instanceof Error ? err.message : String(err)}`,
                tool_call_id: tc.id,
              },
            ];
          }
          continue;
        }

        // ---- Memory tools ----
        if (isMemoryTool(tc.function.name)) {
          pendingToolCallsRef.current.push(`save_memory`);
          try {
            const result = await executeMemoryTool(
              sessionPathRef.current,
              params as Record<string, string>,
            );
            // Refresh memories for next turn's SP
            loadMemories(sessionPathRef.current).then(setMemories);
            currentMessages = [
              ...currentMessages,
              { role: 'tool', content: result, tool_call_id: tc.id },
            ];
          } catch (err) {
            currentMessages = [
              ...currentMessages,
              {
                role: 'tool',
                content: `error: ${err instanceof Error ? err.message : String(err)}`,
                tool_call_id: tc.id,
              },
            ];
          }
          continue;
        }

        // ---- app_action ----
        if (tc.function.name === 'app_action') {
          const strParams = params as Record<string, string>;
          const resolved = resolveAppAction(strParams.app_name, strParams.action_type);
          if (typeof resolved === 'string') {
            currentMessages = [
              ...currentMessages,
              { role: 'tool', content: resolved, tool_call_id: tc.id },
            ];
            continue;
          }

          pendingToolCallsRef.current.push(`${strParams.app_name}/${strParams.action_type}`);

          let actionParams: Record<string, string> = {};
          if (strParams.params) {
            try {
              actionParams = JSON.parse(strParams.params);
            } catch {
              // empty
            }
          }

          try {
            const result = await dispatchAgentAction({
              app_id: resolved.appId,
              action_type: resolved.actionType,
              params: actionParams,
            });
            currentMessages = [
              ...currentMessages,
              { role: 'tool', content: result, tool_call_id: tc.id },
            ];
          } catch (err) {
            currentMessages = [
              ...currentMessages,
              {
                role: 'tool',
                content: `error: ${err instanceof Error ? err.message : String(err)}`,
                tool_call_id: tc.id,
              },
            ];
          }
          continue;
        }

        // Unknown tool
        currentMessages = [
          ...currentMessages,
          { role: 'tool', content: 'error: unknown tool', tool_call_id: tc.id },
        ];
      }

      // Update chat history
      setChatHistory(currentMessages.slice(1));
    }
  };

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
              <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
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

// ---------------------------------------------------------------------------
// Settings Modal (extended with Character + Mod)
// ---------------------------------------------------------------------------

const SettingsModal: React.FC<{
  config: LLMConfig | null;
  imageGenConfig: ImageGenConfig | null;
  onSave: (_config: LLMConfig, _igConfig: ImageGenConfig | null) => void;
  onClose: () => void;
}> = ({ config, imageGenConfig, onSave, onClose }) => {
  // LLM settings
  const [provider, setProvider] = useState<LLMProvider>(config?.provider || 'minimax');
  const [apiKey, setApiKey] = useState(config?.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(
    config?.baseUrl || getDefaultProviderConfig('minimax').baseUrl,
  );
  const [model, setModel] = useState(config?.model || getDefaultProviderConfig('minimax').model);
  const [customHeaders, setCustomHeaders] = useState(config?.customHeaders || '');
  const [manualModelMode, setManualModelMode] = useState(false);

  const isPresetModel = PROVIDER_MODELS[provider]?.includes(model) ?? false;
  const showDropdown = !manualModelMode && isPresetModel;

  // Image gen settings
  const [igProvider, setIgProvider] = useState<ImageGenProvider>(
    imageGenConfig?.provider || 'gemini',
  );
  const [igApiKey, setIgApiKey] = useState(imageGenConfig?.apiKey || '');
  const [igBaseUrl, setIgBaseUrl] = useState(
    imageGenConfig?.baseUrl || getDefaultImageGenConfig('gemini').baseUrl,
  );
  const [igModel, setIgModel] = useState(
    imageGenConfig?.model || getDefaultImageGenConfig('gemini').model,
  );
  const [igCustomHeaders, setIgCustomHeaders] = useState(imageGenConfig?.customHeaders || '');

  const handleProviderChange = (p: LLMProvider) => {
    setProvider(p);
    const defaults = getDefaultProviderConfig(p);
    setBaseUrl(defaults.baseUrl);
    setModel(defaults.model);
    setManualModelMode(false);
  };

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    setManualModelMode(false);
  };

  const handleIgProviderChange = (p: ImageGenProvider) => {
    setIgProvider(p);
    const defaults = getDefaultImageGenConfig(p);
    setIgBaseUrl(defaults.baseUrl);
    setIgModel(defaults.model);
  };

  return (
    <div className={styles.overlay} data-testid="settings-overlay">
      <div className={styles.settingsModal} data-testid="settings-modal">
        <div className={styles.settingsTitle}>LLM Settings</div>

        <div className={styles.field}>
          <label className={styles.label}>Provider</label>
          <select
            className={styles.select}
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
            <option value="llama.cpp">llama.cpp</option>
            <option value="minimax">MiniMax</option>
            <option value="z.ai">Z.ai</option>
            <option value="kimi">Kimi</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>API Key</label>
          <input
            className={styles.fieldInput}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Optional for local servers"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Base URL</label>
          <input
            className={styles.fieldInput}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Model</label>
          <div className={styles.modelSelectorWrapper}>
            {showDropdown ? (
              <>
                <select
                  className={styles.select}
                  value={model}
                  onChange={(e) => handleModelChange(e.target.value)}
                >
                  {PROVIDER_MODELS[provider]?.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setManualModelMode(true)}
                  className={styles.manualToggleBtn}
                  title="Enter custom model name"
                >
                  <Pencil size={14} />
                </button>
              </>
            ) : (
              <>
                <input
                  className={styles.fieldInput}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. gpt-4-turbo"
                />
                {isPresetModel && (
                  <button
                    type="button"
                    onClick={() => setManualModelMode(false)}
                    className={styles.manualToggleBtn}
                    title="Back to model list"
                  >
                    <List size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Custom Headers (one per line, Key: Value)</label>
          <textarea
            className={styles.fieldInput}
            value={customHeaders}
            onChange={(e) => setCustomHeaders(e.target.value)}
            placeholder={'X-Custom-Header: value\nAnother-Header: value'}
            rows={3}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
          />
        </div>

        <div className={styles.settingsDivider} />
        <div className={styles.settingsTitle}>Image Generation</div>

        <div className={styles.field}>
          <label className={styles.label}>Provider</label>
          <select
            className={styles.select}
            value={igProvider}
            onChange={(e) => handleIgProviderChange(e.target.value as ImageGenProvider)}
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>API Key</label>
          <input
            className={styles.fieldInput}
            type="password"
            value={igApiKey}
            onChange={(e) => setIgApiKey(e.target.value)}
            placeholder="API Key..."
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Base URL</label>
          <input
            className={styles.fieldInput}
            value={igBaseUrl}
            onChange={(e) => setIgBaseUrl(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Model</label>
          <input
            className={styles.fieldInput}
            value={igModel}
            onChange={(e) => setIgModel(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Custom Headers</label>
          <textarea
            className={styles.fieldInput}
            value={igCustomHeaders}
            onChange={(e) => setIgCustomHeaders(e.target.value)}
            placeholder={'X-Custom-Header: value'}
            rows={2}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
          />
        </div>

        <div className={styles.settingsActions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            className={styles.saveBtn}
            onClick={() => {
              const llmCfg: LLMConfig = {
                provider,
                apiKey,
                baseUrl,
                model,
                ...(customHeaders.trim() ? { customHeaders } : {}),
              };
              const igCfg: ImageGenConfig | null = igApiKey.trim()
                ? {
                    provider: igProvider,
                    apiKey: igApiKey,
                    baseUrl: igBaseUrl,
                    model: igModel,
                    ...(igCustomHeaders.trim() ? { customHeaders: igCustomHeaders } : {}),
                  }
                : null;
              onSave(llmCfg, igCfg);
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
