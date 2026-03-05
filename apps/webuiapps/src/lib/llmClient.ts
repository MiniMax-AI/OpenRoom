/**
 * Minimal LLM API Client
 * Supports OpenAI / DeepSeek / Anthropic formats
 */

export type LLMProvider = 'openai' | 'anthropic' | 'deepseek' | 'minimax';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Custom headers, format "Key: Value", one per line */
  customHeaders?: string;
}

/** Parse custom headers string into Record, adding x-custom- prefix for proxy forwarding */
function parseCustomHeaders(raw?: string): Record<string, string> {
  if (!raw) return {};
  const headers: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim().toLowerCase();
      const val = trimmed.slice(idx + 1).trim();
      headers[`x-custom-${key}`] = val;
    }
  }
  return headers;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
}

const CONFIG_KEY = 'webuiapps-llm-config';

const DEFAULT_CONFIGS: Record<LLMProvider, Omit<LLMConfig, 'apiKey'>> = {
  openai: { provider: 'openai', baseUrl: 'https://api.openai.com', model: 'gpt-4o' },
  deepseek: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  anthropic: {
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
  },
  minimax: {
    provider: 'minimax',
    baseUrl: 'https://api.minimax.io/anthropic',
    model: 'MiniMax-M2.5',
  },
};

export function getDefaultConfig(provider: LLMProvider): Omit<LLMConfig, 'apiKey'> {
  return DEFAULT_CONFIGS[provider];
}

export function loadConfig(): LLMConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveConfig(config: LLMConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/**
 * Call LLM API (non-streaming, simple version)
 */
export async function chat(
  messages: ChatMessage[],
  tools: ToolDef[],
  config: LLMConfig,
): Promise<LLMResponse> {
  console.info(
    '[LLM] chat() called, provider:',
    config.provider,
    'model:',
    config.model,
    'messages:',
    messages.length,
  );
  if (config.provider === 'anthropic' || config.provider === 'minimax') {
    return chatAnthropic(messages, tools, config);
  }
  return chatOpenAI(messages, tools, config);
}

async function chatOpenAI(
  messages: ChatMessage[],
  tools: ToolDef[],
  config: LLMConfig,
): Promise<LLMResponse> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
  };
  if (tools.length > 0) {
    body.tools = tools;
  }

  const targetUrl = `${config.baseUrl}/v1/chat/completions`;
  const toolNames = Array.isArray(tools)
    ? tools.map((t: { function?: { name?: string } }) => t.function?.name).filter(Boolean)
    : [];
  console.info('[ToolLog] LLM Request: toolCount=', tools.length, 'toolNames=', toolNames);
  console.info('[LLM] Request:', {
    targetUrl,
    model: config.model,
    messageCount: messages.length,
    toolCount: tools.length,
  });
  const res = await fetch('/api/llm-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'X-LLM-Target-URL': targetUrl,
      ...parseCustomHeaders(config.customHeaders),
    },
    body: JSON.stringify(body),
  });

  console.info('[LLM] Response status:', res.status);
  const text = await res.text();
  console.info('[LLM] Response body:', text.slice(0, 500));

  if (!res.ok) {
    throw new Error(`LLM API error ${res.status}: ${text}`);
  }

  const data = JSON.parse(text);
  const choice = data.choices?.[0]?.message;
  const toolCalls = choice?.tool_calls || [];
  const calledNames = toolCalls
    .map((tc: { function?: { name?: string } }) => tc.function?.name)
    .filter(Boolean);
  console.info(
    '[ToolLog] LLM Response: toolCalls count=',
    toolCalls.length,
    'calledNames=',
    calledNames,
  );
  return {
    content: choice?.content || '',
    toolCalls,
  };
}

async function chatAnthropic(
  messages: ChatMessage[],
  tools: ToolDef[],
  config: LLMConfig,
): Promise<LLMResponse> {
  // Extract system message
  const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  // Convert message format
  const anthropicMessages = nonSystemMessages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'user' as const,
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: m.tool_call_id,
            content: m.content,
          },
        ],
      };
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: 'assistant' as const,
        content: [
          ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
          ...m.tool_calls.map((tc) => ({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          })),
        ],
      };
    }
    return { role: m.role as 'user' | 'assistant', content: m.content };
  });

  // Convert tools
  const anthropicTools = tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 4096,
    messages: anthropicMessages,
  };
  if (systemMsg) body.system = systemMsg;
  if (anthropicTools.length > 0) body.tools = anthropicTools;

  const anthropicToolNames = anthropicTools.map((t: { name?: string }) => t.name).filter(Boolean);
  console.info(
    '[ToolLog] Anthropic Request: toolCount=',
    anthropicTools.length,
    'toolNames=',
    anthropicToolNames,
  );
  const targetUrl = `${config.baseUrl}/v1/messages`;
  console.info('[LLM] Anthropic Request:', {
    targetUrl,
    model: config.model,
    messageCount: anthropicMessages.length,
    toolCount: anthropicTools.length,
  });
  const res = await fetch('/api/llm-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'X-LLM-Target-URL': targetUrl,
      ...parseCustomHeaders(config.customHeaders),
    },
    body: JSON.stringify(body),
  });

  console.info('[LLM] Anthropic Response status:', res.status);
  if (!res.ok) {
    const text = await res.text();
    console.error('[LLM] Anthropic Error body:', text.slice(0, 500));
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  console.info('[LLM] Anthropic Response data:', JSON.stringify(data).slice(0, 500));
  let content = '';
  const toolCalls: ToolCall[] = [];

  for (const block of data.content || []) {
    if (block.type === 'text') {
      content += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  const calledNames = toolCalls.map((tc) => tc.function.name).filter(Boolean);
  console.info(
    '[ToolLog] Anthropic Response: toolCalls count=',
    toolCalls.length,
    'calledNames=',
    calledNames,
  );
  return { content, toolCalls };
}
