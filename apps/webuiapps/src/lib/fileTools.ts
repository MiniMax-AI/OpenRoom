/**
 * File Tools - Allow Agent to directly read/write IndexedDB file storage
 * Simulates chat-agent's nas_file_read / nas_file_write capabilities
 */

import * as idb from './indexedDbStorage';

/**
 * Extract valid JSON string from LLM output.
 * Handles common cases: markdown code block wrapping, extra text around JSON.
 */
function extractJson(raw: string): string {
  const trimmed = raw.trim();

  // 1. Already valid JSON, return directly
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // continue
  }

  // 2. Wrapped in markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    try {
      JSON.parse(inner);
      return inner;
    } catch {
      // continue
    }
  }

  // 3. Extract the first { ... } or [ ... ] structure
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  let start = -1;
  let open = '{';
  let close = '}';
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    start = firstBrace;
  } else if (firstBracket >= 0) {
    start = firstBracket;
    open = '[';
    close = ']';
  }
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === open) depth++;
      else if (ch === close) depth--;
      if (depth === 0) {
        const candidate = trimmed.slice(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          break;
        }
      }
    }
  }

  // 4. Cannot extract, return raw content
  console.warn('[fileTools] extractJson: could not extract valid JSON, using raw content');
  return trimmed;
}

// ============ Tool Definitions ============

export function getFileToolDefinitions(): Array<{
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
}> {
  return [
    {
      type: 'function',
      function: {
        name: 'file_read',
        description:
          'Read a file from storage. Returns the file content. Path is relative to workspace root, e.g. "apps/{appName}/data/state.json"',
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'File path relative to workspace root',
            },
          },
          required: ['file_path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_write',
        description:
          'Write content to a file in storage. Creates parent directories automatically. Path is relative to workspace root, e.g. "apps/{appName}/data/state.json"',
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'File path relative to workspace root',
            },
            content: {
              type: 'string',
              description: 'File content to write (string or JSON string)',
            },
          },
          required: ['file_path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_list',
        description:
          'List files and directories at a given path. Returns file names and types. Path is relative to workspace root, e.g. "apps/{appName}/data"',
        parameters: {
          type: 'object',
          properties: {
            directory: {
              type: 'string',
              description: 'Directory path relative to workspace root. Use "/" or "" for root.',
            },
          },
          required: ['directory'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_delete',
        description:
          'Delete a file from storage. Path is relative to workspace root, e.g. "apps/{appName}/data/articles/article-001.json"',
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'File path relative to workspace root',
            },
          },
          required: ['file_path'],
        },
      },
    },
  ];
}

// ============ Tool Execution ============

export function isFileTool(toolName: string): boolean {
  return (
    toolName === 'file_read' ||
    toolName === 'file_write' ||
    toolName === 'file_list' ||
    toolName === 'file_delete'
  );
}

export async function executeFileTool(
  toolName: string,
  params: Record<string, string>,
): Promise<string> {
  switch (toolName) {
    case 'file_read': {
      const filePath = (params.file_path || '').replace(/^\/+/, '');
      if (!filePath) return 'error: file_path is required';
      try {
        const content = await idb.getFile(filePath);
        if (content === null || content === undefined) {
          return 'error: file not found';
        }
        return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      } catch (e) {
        return `error: ${String(e)}`;
      }
    }

    case 'file_write': {
      const filePath = (params.file_path || '').replace(/^\/+/, '');
      let content = params.content;
      if (!filePath) return 'error: file_path is required';
      if (content === undefined) return 'error: content is required';
      // For JSON files, extract JSON (strip markdown wrapping) and validate
      if (filePath.endsWith('.json')) {
        content = extractJson(content);
        try {
          JSON.parse(content);
        } catch (e) {
          return `error: invalid JSON — ${String(e)}. Please regenerate valid JSON.`;
        }
      }
      try {
        const parts = filePath.split('/');
        const name = parts.pop()!;
        const dir = parts.join('/');
        await idb.putTextFilesByJSON({
          files: [{ path: dir || undefined, name, content }],
        });
        return 'success';
      } catch (e) {
        return `error: ${String(e)}`;
      }
    }

    case 'file_list': {
      const dir = (params.directory || '').replace(/^\/+/, '').replace(/\/+$/, '');
      try {
        const result = await idb.listFiles(dir || '/');
        const items = result.files.map((f) => {
          const name = f.path.split('/').pop() || f.path;
          return f.type === 1 ? `[dir]  ${name}` : `[file] ${name}`;
        });
        if (items.length === 0) return 'empty directory';
        return items.join('\n');
      } catch (e) {
        return `error: ${String(e)}`;
      }
    }

    case 'file_delete': {
      const filePath = (params.file_path || '').replace(/^\/+/, '');
      if (!filePath) return 'error: file_path is required';
      try {
        await idb.deleteFilesByPaths({ file_paths: [filePath] });
        return 'success';
      } catch (e) {
        return `error: ${String(e)}`;
      }
    }

    default:
      return `error: unknown file tool ${toolName}`;
  }
}
