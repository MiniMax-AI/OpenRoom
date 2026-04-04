import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { LLMConfig } from '@/lib/llmModels';
import type { ChatMessage, ToolCall } from '@/lib/llmClient';

const {
  chatMock,
  seedMetaFilesMock,
  loadActionsFromMetaMock,
  executeFileToolMock,
  getImageGenToolDefinitionsMock,
  buildSystemPromptMock,
  clearEmotionVideoCacheMock,
  loadMemoriesMock,
} = vi.hoisted(() => ({
  chatMock: vi.fn(),
  seedMetaFilesMock: vi.fn().mockResolvedValue(undefined),
  loadActionsFromMetaMock: vi.fn().mockResolvedValue(undefined),
  executeFileToolMock: vi.fn(),
  getImageGenToolDefinitionsMock: vi.fn(() => [
    { type: 'function', function: { name: 'generate_image' } },
  ]),
  buildSystemPromptMock: vi.fn(() => 'system prompt'),
  clearEmotionVideoCacheMock: vi.fn(),
  loadMemoriesMock: vi.fn(),
}));

vi.mock('@/lib/llmClient', () => ({
  chat: chatMock,
}));

vi.mock('@/lib/seedMeta', () => ({
  seedMetaFiles: seedMetaFilesMock,
}));

vi.mock('@/lib/appRegistry', () => ({
  getAppActionToolDefinition: () => ({ type: 'function', function: { name: 'app_action' } }),
  resolveAppAction: vi.fn(),
  getListAppsToolDefinition: () => ({ type: 'function', function: { name: 'list_apps' } }),
  executeListApps: vi.fn(() => '[]'),
  loadActionsFromMeta: loadActionsFromMetaMock,
}));

vi.mock('@/lib/fileTools', () => ({
  getFileToolDefinitions: () => [{ type: 'function', function: { name: 'file_write' } }],
  isFileTool: (name: string) => name.startsWith('file_'),
  executeFileTool: executeFileToolMock,
}));

vi.mock('@/lib/imageGenTools', () => ({
  getImageGenToolDefinitions: getImageGenToolDefinitionsMock,
  isImageGenTool: (name: string) => name === 'generate_image',
  executeImageGenTool: vi.fn(),
}));

vi.mock('@/lib/memoryManager', () => ({
  getMemoryToolDefinitions: () => [],
  isMemoryTool: () => false,
  executeMemoryTool: vi.fn(),
  loadMemories: loadMemoriesMock,
}));

vi.mock('@/lib/characterManager', () => ({
  clearEmotionVideoCache: clearEmotionVideoCacheMock,
}));

vi.mock('@/lib/modManager', () => ({
  ModManager: class ModManager {},
  saveModCollection: vi.fn(),
}));

vi.mock('@/lib/vibeContainerMock', () => ({
  dispatchAgentAction: vi.fn(),
}));

vi.mock('./toolDefinitions', () => ({
  getRespondToUserToolDef: () => ({ type: 'function', function: { name: 'respond_to_user' } }),
  getFinishTargetToolDef: () => ({ type: 'function', function: { name: 'finish_target' } }),
  buildSystemPrompt: buildSystemPromptMock,
}));

import {
  useConversationEngine,
  type ConversationCallbacks,
  type ConversationDisplayMessage,
} from './useConversationEngine';

const CFG: LLMConfig = {
  provider: 'openai',
  apiKey: 'sk-test',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1',
};

type HookApi = ReturnType<typeof useConversationEngine>;

function makeToolCall(name: string, args: Record<string, unknown>, id = `${name}-1`): ToolCall {
  return {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

function renderHookWithDeps(options?: { imageApiKey?: string | null }) {
  const addMessage = vi.fn<(msg: ConversationDisplayMessage) => void>();
  const chatHistorySetters: ChatMessage[][] = [];

  const callbacks: ConversationCallbacks = {
    addMessage,
    setChatHistory: vi.fn((updater) => {
      const next = typeof updater === 'function' ? updater([]) : updater;
      chatHistorySetters.push(next as ChatMessage[]);
      return next;
    }),
    setSuggestedReplies: vi.fn(),
    setCurrentEmotion: vi.fn(),
    setModCollection: vi.fn(),
    setModManager: vi.fn(),
    setMemories: vi.fn(),
  };

  const deps = {
    imageGenConfigRef: {
      current: options?.imageApiKey === null ? null : { apiKey: options?.imageApiKey ?? 'img-key' },
    },
    modManagerRef: { current: null },
    characterRef: { current: { id: 'char-1' } },
    memoriesRef: { current: [] },
    sessionPathRef: { current: 'session/a' },
    callbacks,
  } as Parameters<typeof useConversationEngine>[0];

  const host = document.createElement('div');
  let root: Root | null = createRoot(host);
  const api: { current: HookApi | null } = { current: null };

  function Harness() {
    api.current = useConversationEngine(deps);
    return null;
  }

  act(() => {
    root!.render(<Harness />);
  });

  return {
    api,
    callbacks,
    addMessage,
    chatHistorySetters,
    cleanup: () => {
      if (root) {
        act(() => {
          root!.unmount();
        });
        root = null;
      }
    },
  };
}

describe('useConversationEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeFileToolMock.mockResolvedValue('ok');
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the provided AbortSignal through to chat()', async () => {
    chatMock.mockResolvedValueOnce({ content: 'hello', toolCalls: [] });
    const harness = renderHookWithDeps();
    const controller = new AbortController();

    await harness.api.current!.runConversation(
      [{ role: 'user', content: 'hi' }],
      CFG,
      controller.signal,
    );

    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(chatMock.mock.calls[0][3]).toBe(controller.signal);
    expect(seedMetaFilesMock).toHaveBeenCalledTimes(1);
    expect(loadActionsFromMetaMock).toHaveBeenCalledTimes(1);

    harness.cleanup();
  });

  it('redacts file tool summaries to tool name and file path only', async () => {
    chatMock
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          makeToolCall('file_write', {
            file_path: 'notes/secret.txt',
            content: 'TOP SECRET CONTENT',
            password: 'hunter2',
          }),
        ],
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          makeToolCall('respond_to_user', {
            character_expression: { content: 'Saved it.', emotion: 'calm' },
            user_interaction: { suggested_replies: ['Nice'] },
          }),
        ],
      });

    const harness = renderHookWithDeps();

    await harness.api.current!.runConversation([{ role: 'user', content: 'save this' }], CFG);

    expect(executeFileToolMock).toHaveBeenCalledWith('file_write', {
      file_path: 'notes/secret.txt',
      content: 'TOP SECRET CONTENT',
      password: 'hunter2',
    });
    expect(harness.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Saved it.',
        toolCalls: ['file_write(file_path: notes/secret.txt)'],
      }),
    );
    expect(JSON.stringify(harness.addMessage.mock.calls)).not.toContain('TOP SECRET CONTENT');
    expect(JSON.stringify(harness.addMessage.mock.calls)).not.toContain('hunter2');

    harness.cleanup();
  });

  it('treats whitespace-only image generation keys as disabled', async () => {
    chatMock.mockResolvedValueOnce({ content: 'no image tools', toolCalls: [] });
    const harness = renderHookWithDeps({ imageApiKey: '   ' });

    await harness.api.current!.runConversation([{ role: 'user', content: 'hi' }], CFG);

    expect(buildSystemPromptMock).toHaveBeenCalledWith(expect.anything(), null, false, []);
    expect(getImageGenToolDefinitionsMock).not.toHaveBeenCalled();
    const toolsArg = chatMock.mock.calls[0][1] as Array<{ function: { name: string } }>;
    expect(toolsArg.map((tool) => tool.function.name)).not.toContain('generate_image');

    harness.cleanup();
  });

  it('stops after tool execution when the signal is aborted mid-loop', async () => {
    const controller = new AbortController();
    executeFileToolMock.mockImplementationOnce(async () => {
      controller.abort();
      return 'ok';
    });
    chatMock.mockResolvedValueOnce({
      content: '',
      toolCalls: [makeToolCall('file_write', { file_path: 'notes/a.txt', content: 'a' })],
    });

    const harness = renderHookWithDeps();

    await harness.api.current!.runConversation(
      [{ role: 'user', content: 'save' }],
      CFG,
      controller.signal,
    );

    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(executeFileToolMock).toHaveBeenCalledTimes(1);

    harness.cleanup();
  });
});
