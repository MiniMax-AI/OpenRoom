/**
 * Tool Definitions & System Prompt for ChatPanel
 *
 * Pure functions with no React dependency — easily testable in isolation.
 */

import type { CharacterConfig } from '@/lib/characterManager';
import { getCharacterPromptContext } from '@/lib/characterManager';
import type { ModManager } from '@/lib/modManager';
import type { MemoryEntry } from '@/lib/memoryManager';
import { buildMemoryPrompt } from '@/lib/memoryManager';
import type { LLMConfig } from '@/lib/llmModels';

// ---------------------------------------------------------------------------
// Config guard
// ---------------------------------------------------------------------------

export function hasUsableLLMConfig(config: LLMConfig | null | undefined): config is LLMConfig {
  const baseUrl = typeof config?.baseUrl === 'string' ? config.baseUrl.trim() : '';
  const model = typeof config?.model === 'string' ? config.model.trim() : '';
  return !!baseUrl && !!model;
}

// ---------------------------------------------------------------------------
// Tool definitions for character system
// ---------------------------------------------------------------------------

export function getRespondToUserToolDef() {
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
                description:
                  "Character emotion — use one of the active character's defined emotion keys",
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

export function getFinishTargetToolDef() {
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
// System prompt builder
// ---------------------------------------------------------------------------

export function buildSystemPrompt(
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
