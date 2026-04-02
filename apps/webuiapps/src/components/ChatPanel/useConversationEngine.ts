/**
 * useConversationEngine — extracted conversation loop from ChatPanel
 *
 * Encapsulates the LLM tool-call loop and dispatch logic.
 * All side effects (state updates) are expressed as callbacks, keeping
 * the engine itself pure and testable.
 */

import {
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from 'react';
import { chat, type ChatMessage, type ToolCall } from '@/lib/llmClient';
import type { LLMConfig } from '@/lib/llmModels';
import { hasUsableImageGenConfig, type ImageGenConfig } from '@/lib/imageGenClient';
import type { CharacterConfig } from '@/lib/characterManager';
import { clearEmotionVideoCache } from '@/lib/characterManager';
import type { MemoryEntry } from '@/lib/memoryManager';
import { loadMemories } from '@/lib/memoryManager';
import {
  getAppActionToolDefinition,
  resolveAppAction,
  getListAppsToolDefinition,
  executeListApps,
  loadActionsFromMeta,
} from '@/lib/appRegistry';
import { getFileToolDefinitions, isFileTool, executeFileTool } from '@/lib/fileTools';
import { seedMetaFiles } from '@/lib/seedMeta';
import { dispatchAgentAction } from '@/lib/vibeContainerMock';
import {
  getImageGenToolDefinitions,
  isImageGenTool,
  executeImageGenTool,
} from '@/lib/imageGenTools';
import { getMemoryToolDefinitions, isMemoryTool, executeMemoryTool } from '@/lib/memoryManager';
import { ModManager, saveModCollection } from '@/lib/modManager';
import {
  getRespondToUserToolDef,
  getFinishTargetToolDef,
  buildSystemPrompt,
} from './toolDefinitions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationCallbacks {
  addMessage: (msg: ConversationDisplayMessage) => void;
  setChatHistory: Dispatch<SetStateAction<ChatMessage[]>>;
  setSuggestedReplies: Dispatch<SetStateAction<string[]>>;
  setCurrentEmotion: Dispatch<SetStateAction<string | undefined>>;
  setModCollection: Dispatch<SetStateAction<import('@/lib/modManager').ModCollection>>;
  setModManager: Dispatch<SetStateAction<ModManager | null>>;
  setMemories: Dispatch<SetStateAction<MemoryEntry[]>>;
}

export interface ConversationDisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  emotion?: string;
  suggestedReplies?: string[];
  toolCalls?: string[];
  imageUrl?: string;
}

export interface ConversationEngineDeps {
  /** Refs to current values (avoids stale closures) */
  imageGenConfigRef: MutableRefObject<ImageGenConfig | null>;
  modManagerRef: MutableRefObject<ModManager | null>;
  characterRef: MutableRefObject<CharacterConfig>;
  memoriesRef: MutableRefObject<MemoryEntry[]>;
  sessionPathRef: MutableRefObject<string>;

  /** Side-effect callbacks */
  callbacks: ConversationCallbacks;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConversationEngine(deps: ConversationEngineDeps) {
  const { imageGenConfigRef, modManagerRef, characterRef, memoriesRef, sessionPathRef } = deps;

  // Keep callbacks in a ref so the stabilized runConversation always reads the
  // latest versions without needing them in its dependency array.
  const callbacksRef = useRef(deps.callbacks);
  callbacksRef.current = deps.callbacks;

  const pendingToolCallsRef = useRef<string[]>([]);

  // Abort controller for the current conversation — allows cancellation when
  // the user switches sessions or triggers a new request.
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Core conversation loop — sends messages to LLM, executes tool calls,
   * and loops until the model responds via respond_to_user or produces plain text.
   *
   * Stabilized with useCallback — all inputs are refs, so this identity never
   * changes, preventing unsubscribe/subscribe churn in the onUserAction listener.
   *
   * @param signal AbortSignal to cancel the conversation mid-loop
   */
  const runConversation = useCallback(
    async (history: ChatMessage[], cfg: LLMConfig, signal?: AbortSignal) => {
      await seedMetaFiles();
      await loadActionsFromMeta();
      const hasImageGen = hasUsableImageGenConfig(imageGenConfigRef.current);
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
        if (signal?.aborted) break;
        iterations++;
        const response = await chat(currentMessages, tools, cfg);

        if (response.toolCalls.length === 0) {
          // No tool calls — fallback plain text
          if (response.content) {
            callbacksRef.current.addMessage({
              id: String(Date.now()),
              role: 'assistant',
              content: response.content,
              toolCalls:
                pendingToolCallsRef.current.length > 0
                  ? [...pendingToolCallsRef.current]
                  : undefined,
            });
            callbacksRef.current.setChatHistory((prev) => [
              ...prev,
              { role: 'assistant', content: response.content },
            ]);
            pendingToolCallsRef.current = [];
          }
          break;
        }

        // Has tool calls — build assistant message
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls,
        };
        currentMessages = [...currentMessages, assistantMsg];

        // Execute each tool call
        const hasRespondToUser = response.toolCalls.some(
          (tc) => tc.function.name === 'respond_to_user',
        );
        for (const tc of response.toolCalls) {
          const result = await executeToolCall(tc, {
            mm,
            hasImageGen,
            pendingToolCallsRef,
            sessionPathRef,
            imageGenConfigRef,
            characterRef,
            callbacks: callbacksRef.current,
          });
          currentMessages = [...currentMessages, result];
        }

        // Update chat history (skip system message)
        callbacksRef.current.setChatHistory(currentMessages.slice(1));

        // Only break when respond_to_user was the sole tool call — if other
        // tools ran in the same batch the model may still need a follow-up
        // round-trip (e.g. finish_target) to commit state updates.
        if (hasRespondToUser && response.toolCalls.length === 1) break;
        if (signal?.aborted) break;
      }
    },
    [],
  );

  return { runConversation, pendingToolCallsRef, abortRef };
}

// ---------------------------------------------------------------------------
// Tool dispatch — each branch returns a tool-result ChatMessage
// ---------------------------------------------------------------------------

async function executeToolCall(
  tc: ToolCall,
  ctx: {
    mm: ModManager | null;
    hasImageGen: boolean;
    pendingToolCallsRef: MutableRefObject<string[]>;
    sessionPathRef: MutableRefObject<string>;
    imageGenConfigRef: MutableRefObject<ImageGenConfig | null>;
    characterRef: MutableRefObject<CharacterConfig>;
    callbacks: ConversationCallbacks;
  },
): Promise<ChatMessage> {
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(tc.function.arguments);
  } catch (e) {
    console.warn('Failed to parse tool call arguments for tool:', tc.function.name, e);
  }

  const toolResult = (content: string): ChatMessage => ({
    role: 'tool',
    content,
    tool_call_id: tc.id,
  });

  // ---- respond_to_user ----
  if (tc.function.name === 'respond_to_user') {
    const expr = (params.character_expression as { content?: string; emotion?: string }) ?? {};
    const interaction = (params.user_interaction as { suggested_replies?: string[] }) ?? {};

    const content = expr.content ?? '';
    const emotion = expr.emotion;
    const replies = interaction.suggested_replies ?? [];

    ctx.callbacks.addMessage({
      id: String(Date.now()),
      role: 'assistant',
      content,
      emotion,
      suggestedReplies: replies,
      toolCalls:
        ctx.pendingToolCallsRef.current.length > 0
          ? [...ctx.pendingToolCallsRef.current]
          : undefined,
    });
    ctx.callbacks.setSuggestedReplies(replies);
    if (emotion) {
      clearEmotionVideoCache(ctx.characterRef.current.id);
      ctx.callbacks.setCurrentEmotion(emotion);
    }
    ctx.pendingToolCallsRef.current = [];
    ctx.callbacks.setChatHistory((prev) => [...prev, { role: 'assistant', content }]);
    return toolResult('Message delivered.');
  }

  // ---- finish_target ----
  if (tc.function.name === 'finish_target') {
    const targetIds = (params.target_ids as number[]) ?? [];
    if (ctx.mm) {
      const result = ctx.mm.finishTarget(targetIds);
      const updatedEntry = { config: ctx.mm.getConfig(), state: ctx.mm.getState() };
      ctx.callbacks.setModCollection((prev) => {
        const updated = {
          ...prev,
          items: { ...prev.items, [updatedEntry.config.id]: updatedEntry },
        };
        saveModCollection(updated);
        return updated;
      });
      ctx.callbacks.setModManager(new ModManager(ctx.mm.getConfig(), ctx.mm.getState()));
      return toolResult(JSON.stringify(result));
    }
    return toolResult('No mod loaded.');
  }

  // ---- list_apps ----
  if (tc.function.name === 'list_apps') {
    const result = executeListApps();
    ctx.pendingToolCallsRef.current.push('list_apps');
    return toolResult(result);
  }

  // ---- File tools ----
  if (isFileTool(tc.function.name)) {
    ctx.pendingToolCallsRef.current.push(
      `${tc.function.name}(${JSON.stringify(params).slice(0, 60)})`,
    );
    try {
      const result = await executeFileTool(tc.function.name, params as Record<string, string>);
      return toolResult(result);
    } catch (err) {
      return toolResult(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---- Image gen ----
  if (isImageGenTool(tc.function.name)) {
    ctx.pendingToolCallsRef.current.push('generate_image');
    try {
      const { result, dataUrl } = await executeImageGenTool(
        params as Record<string, string>,
        ctx.imageGenConfigRef.current,
      );
      if (dataUrl) {
        ctx.callbacks.addMessage({
          id: String(Date.now()) + '-img',
          role: 'assistant',
          content: '',
          imageUrl: dataUrl,
        });
      }
      return toolResult(result);
    } catch (err) {
      return toolResult(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---- Memory tools ----
  if (isMemoryTool(tc.function.name)) {
    ctx.pendingToolCallsRef.current.push('save_memory');
    try {
      const result = await executeMemoryTool(
        ctx.sessionPathRef.current,
        params as Record<string, string>,
      );
      const capturedSession = ctx.sessionPathRef.current;
      loadMemories(capturedSession)
        .then((mems) => {
          if (ctx.sessionPathRef.current === capturedSession) {
            ctx.callbacks.setMemories(mems);
          }
        })
        .catch((err) => {
          console.warn('Failed to reload memories after save:', err);
          if (ctx.sessionPathRef.current === capturedSession) {
            ctx.callbacks.setMemories([]);
          }
        });
      return toolResult(result);
    } catch (err) {
      return toolResult(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---- app_action ----
  if (tc.function.name === 'app_action') {
    const strParams = params as Record<string, string>;
    const resolved = resolveAppAction(strParams.app_name, strParams.action_type);
    if (typeof resolved === 'string') {
      return toolResult(resolved);
    }

    ctx.pendingToolCallsRef.current.push(`${strParams.app_name}/${strParams.action_type}`);

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
      return toolResult(result);
    } catch (err) {
      return toolResult(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Unknown tool
  return toolResult('error: unknown tool');
}
