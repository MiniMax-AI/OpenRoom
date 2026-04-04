import type { ToolDef } from './llmClient';

export interface McpBridgeServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpBridgeTool {
  server: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpBridgeToolIndex {
  toolDefs: ToolDef[];
  index: Record<string, McpBridgeTool>;
  tools: McpBridgeTool[];
  errors: Array<{ server: string; error: string }>;
}

const MCP_NAME_PREFIX = 'mcp__';

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function asObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function sanitizeName(value: string): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

export function toMcpToolName(server: string, tool: string): string {
  const s = sanitizeName(server) || 'server';
  const t = sanitizeName(tool) || 'tool';
  return `${MCP_NAME_PREFIX}${s}__${t}`;
}

export function isMcpToolName(toolName: string): boolean {
  return toolName.startsWith(MCP_NAME_PREFIX);
}

function toToolDef(item: McpBridgeTool): ToolDef {
  const schema = asObject(item.inputSchema);
  const toolName = toMcpToolName(item.server, item.name);
  const hasObjectSchema = schema.type === 'object';

  const normalizedParameters: ToolDef['function']['parameters'] = hasObjectSchema
    ? {
        type: 'object',
        properties:
          schema.properties &&
          typeof schema.properties === 'object' &&
          !Array.isArray(schema.properties)
            ? (schema.properties as Record<string, unknown>)
            : {},
        required: Array.isArray(schema.required) ? schema.required.map((v) => String(v)) : [],
      }
    : {
        type: 'object',
        properties: {
          payload_json: {
            type: 'string',
            description: 'JSON string payload for the MCP tool call',
          },
        },
        required: [],
      };

  return {
    type: 'function',
    function: {
      name: toolName,
      description: `[MCP:${item.server}] ${item.description || item.name}`,
      parameters: normalizedParameters,
    },
  };
}

export async function loadMcpBridgeToolIndex(): Promise<McpBridgeToolIndex> {
  try {
    const res = await fetch('/api/mcp-tools');
    const data = safeJsonParse<{
      ok?: boolean;
      tools?: McpBridgeTool[];
      errors?: Array<{ server: string; error: string }>;
    }>(await res.text(), {});

    const tools = Array.isArray(data.tools) ? data.tools : [];
    const index: Record<string, McpBridgeTool> = {};
    const toolDefs: ToolDef[] = [];

    for (const item of tools) {
      if (!item?.server || !item?.name) continue;
      const toolName = toMcpToolName(item.server, item.name);
      index[toolName] = item;
      toolDefs.push(toToolDef(item));
    }

    return {
      tools,
      index,
      toolDefs,
      errors: Array.isArray(data.errors) ? data.errors : [],
    };
  } catch {
    return { tools: [], index: {}, toolDefs: [], errors: [] };
  }
}

function normalizeMcpParams(input: Record<string, unknown>): Record<string, unknown> {
  if (typeof input.payload_json === 'string' && input.payload_json.trim()) {
    const parsed = safeJsonParse<Record<string, unknown>>(input.payload_json, {});
    return asObject(parsed);
  }

  const output: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === 'payload_json') continue;
    output[k] = v;
  }
  return output;
}

export async function executeMcpBridgeTool(
  toolName: string,
  params: Record<string, unknown>,
  index: Record<string, McpBridgeTool>,
): Promise<string> {
  const target = index[toolName];
  if (!target) {
    return `error: MCP tool not found for ${toolName}`;
  }

  const payload = {
    server: target.server,
    tool: target.name,
    arguments: normalizeMcpParams(params),
  };

  const res = await fetch('/api/mcp-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const data = safeJsonParse<{ ok?: boolean; result?: unknown; error?: string }>(text, {});
  if (!res.ok || !data.ok) {
    return `error: ${data.error || text || `HTTP ${res.status}`}`;
  }

  if (typeof data.result === 'string') {
    return data.result;
  }
  return JSON.stringify(data.result, null, 2);
}

export async function loadMcpBridgeServers(): Promise<McpBridgeServer[]> {
  try {
    const res = await fetch('/api/mcp-servers');
    const data = safeJsonParse<{ servers?: McpBridgeServer[] }>(await res.text(), {});
    return Array.isArray(data.servers) ? data.servers : [];
  } catch {
    return [];
  }
}

export async function saveMcpBridgeServers(servers: McpBridgeServer[]): Promise<boolean> {
  try {
    const res = await fetch('/api/mcp-servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servers }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
