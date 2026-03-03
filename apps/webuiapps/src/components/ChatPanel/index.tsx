import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, X } from 'lucide-react';
import {
  chat,
  loadConfig,
  saveConfig,
  getDefaultConfig,
  type LLMConfig,
  type LLMProvider,
  type ChatMessage,
} from '@/lib/llmClient';
import {
  loadImageGenConfig,
  saveImageGenConfig,
  getDefaultImageGenConfig,
  type ImageGenConfig,
  type ImageGenProvider,
} from '@/lib/imageGenClient';
import {
  getToolDefinitions,
  parseToolName,
  APP_REGISTRY,
  loadActionsFromMeta,
} from '@/lib/appRegistry';
import { dispatchAgentAction, onUserAction } from '@/lib/vibeContainerMock';
import { getFileToolDefinitions, isFileTool, executeFileTool } from '@/lib/fileTools';
import {
  getImageGenToolDefinitions,
  isImageGenTool,
  executeImageGenTool,
} from '@/lib/imageGenTools';
import styles from './index.module.scss';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  imageUrl?: string;
}

function buildSystemPrompt(): string {
  const appRows = APP_REGISTRY.filter((a) => a.appName !== 'os')
    .map((a) => `| ${a.displayName} | ${a.appName} |`)
    .join('\n');

  return `You are a helpful assistant that can interact with various apps on the user's device.
You have two types of tools:

## App Action Tools
Tool names formatted as "{appName}__{ACTION_TYPE}". Use these to trigger app actions (e.g. refresh UI, play music).
All parameters are strings.

## File Tools
- file_list: List files in a directory. Path relative to workspace root.
- file_read: Read a file's content. Path relative to workspace root.
- file_write: Write content to a file. Path relative to workspace root.
- file_delete: Delete a file from storage. Path relative to workspace root.

App data is stored at "apps/{appName}/data/". Each app also has "apps/{appName}/meta.yaml" (capabilities) and "apps/{appName}/guide.md" (data schema).

App name mapping (use these exact names in file paths and tool prefixes):
| Display Name | appName |
|---|---|
${appRows}

## Workflow
Use file tools to read/write app data, then use the app action tool to notify the app to reload.

### Steps:
1. file_read("apps/{appName}/meta.yaml") to understand the app's capabilities and actions
2. file_read("apps/{appName}/guide.md") to learn the data structure and JSON schema
3. file_list / file_read to explore existing data in "apps/{appName}/data/"
4. file_write to create or modify data, file_delete to remove data (follow the JSON schema from guide.md)
5. Use the app action tool (REFRESH_*, SYNC_STATE, AGENT_MOVE) to notify the app to reload

### Example - Game move:
1. file_read("apps/{appName}/data/state.json") → get current game state
2. Calculate your move, update the state JSON
3. file_write("apps/{appName}/data/state.json", updatedState) → save
4. {appName}__AGENT_MOVE → app refreshes UI

### Important:
- ALWAYS read meta.yaml and guide.md first before operating on an unfamiliar app.
- After writing data, ALWAYS call the corresponding REFRESH action so the app picks up changes.
- All NAS file operations mentioned in guide.md (read, write, delete, list) map directly to file tools (file_read, file_write, file_delete, file_list). NAS paths like "/articles/xxx.json" translate to "apps/{appName}/data/articles/xxx.json".

## Rules
- Always respond in the same language the user uses.
- When you receive a "[User performed action in ...]" message, it means the user interacted with an app.
- For games, you MUST respond with your own move. Think strategically and play to win, but keep the game fun.
- When the user asks you to generate/draw/create an image, use the generate_image tool with a detailed English prompt.
- When creating content that needs an image, first generate the image with savePath pointing to the app's data directory (e.g. savePath="apps/{appName}/data/images/img-{timestamp}.json"), then reference the relative path "/images/img-{timestamp}.json" in the content's imageUrl field.`;
}

const ChatPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<LLMConfig | null>(loadConfig);
  const [imageGenConfig, setImageGenConfig] = useState<ImageGenConfig | null>(loadImageGenConfig);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const addMessage = useCallback((msg: DisplayMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Use refs to keep latest state for user action listener
  const chatHistoryRef = useRef(chatHistory);
  chatHistoryRef.current = chatHistory;
  const configRef = useRef(config);
  configRef.current = config;
  const imageGenConfigRef = useRef(imageGenConfig);
  imageGenConfigRef.current = imageGenConfig;

  // User action queue + serial processing
  const actionQueueRef = useRef<string[]>([]);
  const processingRef = useRef(false);

  const processActionQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (actionQueueRef.current.length > 0) {
      const actionMsg = actionQueueRef.current.shift()!;
      const cfg = configRef.current;
      if (!cfg?.apiKey) break;

      const newHistory: ChatMessage[] = [
        ...chatHistoryRef.current,
        { role: 'user', content: actionMsg },
      ];
      setChatHistory(newHistory);
      setLoading(true);
      try {
        await runConversation(newHistory, cfg);
      } catch (err) {
        console.error('[ChatPanel] User action error:', err);
      } finally {
        setLoading(false);
      }
    }
    processingRef.current = false;
  }, []);

  // Listen for user actions reported by apps, auto-send to LLM (e.g. AI needs to respond during a game)
  useEffect(() => {
    const unsubscribe = onUserAction((event: unknown) => {
      const cfg = configRef.current;
      if (!cfg?.apiKey) return;

      const evt = event as {
        app_action?: {
          app_id: number;
          action_type: string;
          params?: Record<string, string>;
          trigger_by?: number;
        };
        action_result?: string;
      };
      console.info('[ChatPanel] onUserAction received:', evt);
      // Ignore action_result callbacks (result callbacks triggered by Agent)
      if (evt.action_result !== undefined) {
        console.info('[ChatPanel] Ignored: action_result event');
        return;
      }
      const action = evt.app_action;
      if (!action) {
        console.info('[ChatPanel] Ignored: no app_action');
        return;
      }
      // Ignore actions triggered by Agent (trigger_by=2)
      if (action.trigger_by === 2) {
        console.info('[ChatPanel] Ignored: Agent triggered');
        return;
      }

      const app = APP_REGISTRY.find((a) => a.appId === action.app_id);
      if (!app) return;

      const actionMsg = `[User performed action in ${app.displayName}] action_type: ${action.action_type}, params: ${JSON.stringify(action.params || {})}`;
      actionQueueRef.current.push(actionMsg);
      processActionQueue();
    });
    return unsubscribe;
  }, [processActionQueue]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    if (!config?.apiKey) {
      setShowSettings(true);
      return;
    }

    const userMsg = input.trim();
    setInput('');

    const userDisplay: DisplayMessage = {
      id: String(Date.now()),
      role: 'user',
      content: userMsg,
    };
    addMessage(userDisplay);

    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: userMsg }];
    setChatHistory(newHistory);

    setLoading(true);
    try {
      await runConversation(newHistory, config);
    } catch (err) {
      console.error('[ChatPanel] Error:', err);
      addMessage({
        id: String(Date.now()),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, config, chatHistory, addMessage]);

  const runConversation = async (history: ChatMessage[], cfg: LLMConfig) => {
    console.info(
      '[ChatPanel] runConversation called, history length:',
      history.length,
      'provider:',
      cfg.provider,
    );
    await loadActionsFromMeta();
    const tools = [
      ...getToolDefinitions(),
      ...getFileToolDefinitions(),
      ...getImageGenToolDefinitions(),
    ];
    console.info('[ToolLog] ChatPanel: tools passed to chat(), count=', tools.length);
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt() },
      ...history,
    ];

    let currentMessages = fullMessages;
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      iterations++;
      const response = await chat(currentMessages, tools, cfg);

      if (response.toolCalls.length === 0) {
        // No tool calls, just text response
        if (response.content) {
          addMessage({
            id: String(Date.now()),
            role: 'assistant',
            content: response.content,
          });
          setChatHistory((prev) => [...prev, { role: 'assistant', content: response.content }]);
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

      if (response.content) {
        addMessage({
          id: String(Date.now()),
          role: 'assistant',
          content: response.content,
        });
      }

      // Execute each tool call
      console.info(
        '[ToolLog] ChatPanel: executing toolCalls count=',
        response.toolCalls.length,
        'names=',
        response.toolCalls.map((tc) => tc.function.name),
      );
      for (const tc of response.toolCalls) {
        console.info('[ToolLog] ChatPanel: processing tool name=', tc.function.name);
        let params: Record<string, string> = {};
        try {
          params = JSON.parse(tc.function.arguments);
        } catch {
          // ignore parse error
        }

        // File tool calls — direct file operations
        if (isFileTool(tc.function.name)) {
          addMessage({
            id: String(Date.now()) + tc.id,
            role: 'tool',
            content: `Calling ${tc.function.name}...`,
          });
          try {
            const result = await executeFileTool(tc.function.name, params);
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

        // Image generation tool call
        if (isImageGenTool(tc.function.name)) {
          addMessage({
            id: String(Date.now()) + tc.id,
            role: 'tool',
            content: 'Generating image...',
          });
          try {
            const { result, dataUrl } = await executeImageGenTool(
              params,
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

        const parsed = parseToolName(tc.function.name);
        if (!parsed) {
          currentMessages = [
            ...currentMessages,
            { role: 'tool', content: 'error: unknown tool', tool_call_id: tc.id },
          ];
          continue;
        }

        // Regular App tool call
        addMessage({
          id: String(Date.now()) + tc.id,
          role: 'tool',
          content: `Calling ${tc.function.name}...`,
        });

        try {
          const result = await dispatchAgentAction({
            app_id: parsed.appId,
            action_type: parsed.actionType,
            params,
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
      }

      // Update chat history with tool interactions
      setChatHistory(currentMessages.slice(1)); // Remove system message
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.header}>
          <span>Chat</span>
          <div className={styles.headerActions}>
            <button
              className={styles.iconBtn}
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <Settings size={16} />
            </button>
            <button className={styles.iconBtn} onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className={styles.messages}>
          {messages.length === 0 && (
            <div className={styles.emptyState}>
              {config?.apiKey ? 'Start a conversation...' : 'Click ⚙ to configure your LLM API key'}
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.message} ${
                msg.role === 'user'
                  ? styles.user
                  : msg.role === 'tool'
                    ? styles.toolInfo
                    : styles.assistant
              }`}
            >
              {msg.content}
              {msg.imageUrl && (
                <img src={msg.imageUrl} alt="Generated" className={styles.messageImage} />
              )}
            </div>
          ))}
          {loading && <div className={styles.loading}>Thinking...</div>}
          <div ref={messagesEndRef} />
        </div>

        <div className={styles.inputArea}>
          <textarea
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            disabled={loading}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          config={config}
          imageGenConfig={imageGenConfig}
          onSave={(c, igc) => {
            setConfig(c);
            saveConfig(c);
            setImageGenConfig(igc);
            if (igc) {
              saveImageGenConfig(igc);
            }
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
};

const SettingsModal: React.FC<{
  config: LLMConfig | null;
  imageGenConfig: ImageGenConfig | null;
  onSave: (_config: LLMConfig, _igConfig: ImageGenConfig | null) => void;
  onClose: () => void;
}> = ({ config, imageGenConfig, onSave, onClose }) => {
  const [provider, setProvider] = useState<LLMProvider>(config?.provider || 'openai');
  const [apiKey, setApiKey] = useState(config?.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl || getDefaultConfig('openai').baseUrl);
  const [model, setModel] = useState(config?.model || getDefaultConfig('openai').model);
  const [customHeaders, setCustomHeaders] = useState(config?.customHeaders || '');

  // Image generation settings
  const [igProvider, setIgProvider] = useState<ImageGenProvider>(
    imageGenConfig?.provider || 'openai',
  );
  const [igApiKey, setIgApiKey] = useState(imageGenConfig?.apiKey || '');
  const [igBaseUrl, setIgBaseUrl] = useState(
    imageGenConfig?.baseUrl || getDefaultImageGenConfig('openai').baseUrl,
  );
  const [igModel, setIgModel] = useState(
    imageGenConfig?.model || getDefaultImageGenConfig('openai').model,
  );
  const [igCustomHeaders, setIgCustomHeaders] = useState(imageGenConfig?.customHeaders || '');

  const handleProviderChange = (p: LLMProvider) => {
    setProvider(p);
    const defaults = getDefaultConfig(p);
    setBaseUrl(defaults.baseUrl);
    setModel(defaults.model);
  };

  const handleIgProviderChange = (p: ImageGenProvider) => {
    setIgProvider(p);
    const defaults = getDefaultImageGenConfig(p);
    setIgBaseUrl(defaults.baseUrl);
    setIgModel(defaults.model);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.settingsModal}>
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
            <option value="minimax">MiniMax</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>API Key</label>
          <input
            className={styles.fieldInput}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
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
          <input
            className={styles.fieldInput}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
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
            <option value="openai">OpenAI (DALL-E)</option>
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
