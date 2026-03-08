/**
 * Chat History Persistence
 *
 * Persists chat history (display messages + LLM conversation history) to
 * ~/.openroom/history/chat.json via the dev-server API, with localStorage fallback.
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
}

const STORAGE_KEY = 'webuiapps-chat-history';
const API_PATH = '/api/chat-history';

/**
 * Load chat history — priority: local file > localStorage.
 */
export async function loadChatHistory(): Promise<ChatHistoryData | null> {
  // 1. Try local file via dev-server API
  try {
    const res = await fetch(API_PATH);
    if (res.ok) {
      const data: ChatHistoryData = await res.json();
      if (data && data.version === 1) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return data;
      }
    }
  } catch {
    // API not available — fall through
  }

  // 2. Fall back to localStorage
  return loadChatHistorySync();
}

/**
 * Synchronous read from localStorage cache.
 */
export function loadChatHistorySync(): ChatHistoryData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: ChatHistoryData = JSON.parse(raw);
    return data && data.version === 1 ? data : null;
  } catch {
    return null;
  }
}

/**
 * Save chat history — writes to both localStorage and local file.
 */
export async function saveChatHistory(
  messages: DisplayMessage[],
  chatHistory: ChatMessage[],
): Promise<void> {
  const data: ChatHistoryData = {
    version: 1,
    savedAt: Date.now(),
    messages,
    chatHistory,
  };

  // Always write localStorage (sync, instant)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  // Best-effort write to local file
  try {
    await fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    // Silently ignore if API is not available
  }
}

/**
 * Clear chat history from both localStorage and local file.
 */
export async function clearChatHistory(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);

  try {
    await fetch(API_PATH, { method: 'DELETE' });
  } catch {
    // Silently ignore
  }
}
