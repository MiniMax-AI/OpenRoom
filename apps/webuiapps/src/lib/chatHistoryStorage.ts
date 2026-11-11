/**
 * Chat History Persistence
 *
 * Persists chat history per session (character × mod).
 * Uses dev-server API (~/.openroom/sessions/) when available,
 * falls back to localStorage for static/production builds.
 */

import type { ChatMessage } from './llmClient';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  imageUrl?: string;
}

export interface ChatHistoryData {
  version: 1;
  savedAt: number;
  messages: DisplayMessage[];
  chatHistory: ChatMessage[];
  suggestedReplies?: string[];
}

/** Build session path segment from character and mod IDs */
export function buildSessionPath(charId: string, modId: string): string {
  return `${charId}/${modId}`;
}

const API_PATH = '/api/session-data';
const LS_PREFIX = 'openroom_chat_';

function apiUrl(sessionPath: string, file: string): string {
  return `${API_PATH}?path=${encodeURIComponent(`${sessionPath}/chat/${file}`)}`;
}

function lsKey(sessionPath: string): string {
  return `${LS_PREFIX}${sessionPath.replace(/\//g, '_')}`;
}

export async function loadChatHistory(sessionPath: string): Promise<ChatHistoryData | null> {
  // Try server API first (dev mode)
  try {
    const res = await fetch(apiUrl(sessionPath, 'chat.json'));
    if (res.ok) {
      const data: ChatHistoryData = await res.json();
      if (data && data.version === 1) {
        return data;
      }
    }
  } catch {
    // API not available — fall through to localStorage
  }

  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(lsKey(sessionPath));
    if (raw) {
      const data: ChatHistoryData = JSON.parse(raw);
      if (data && data.version === 1) return data;
    }
  } catch {
    // corrupted data
  }
  return null;
}

/** @deprecated kept for backward compat, always returns null now */
export function loadChatHistorySync(_sessionPath: string): ChatHistoryData | null {
  return null;
}

export async function saveChatHistory(
  sessionPath: string,
  messages: DisplayMessage[],
  chatHistory: ChatMessage[],
  suggestedReplies?: string[],
): Promise<void> {
  const data: ChatHistoryData = {
    version: 1,
    savedAt: Date.now(),
    messages,
    chatHistory,
    suggestedReplies,
  };

  // Always save to localStorage (works everywhere)
  try {
    localStorage.setItem(lsKey(sessionPath), JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }

  // Also try server API (dev mode)
  try {
    await fetch(apiUrl(sessionPath, 'chat.json'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    // Silently ignore
  }
}

export async function clearChatHistory(sessionPath: string): Promise<void> {
  // Clear localStorage
  try {
    localStorage.removeItem(lsKey(sessionPath));
  } catch {
    // ignore
  }

  // Also try server API
  try {
    await fetch(apiUrl(sessionPath, 'chat.json'), { method: 'DELETE' });
  } catch {
    // Silently ignore
  }
}
