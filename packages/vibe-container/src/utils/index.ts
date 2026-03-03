/**
 * Vibe App Communication - Utility Functions
 */

/** Generate unique message ID */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/** Safe JSON parse */
export function safeParseJSON<T>(json: string, fallback?: T): T | undefined {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export type LoggerRole = 'client' | 'parent';

/**
 * Debug logger utility
 */
export class Logger {
  private static instances: Map<LoggerRole, Logger> = new Map();
  private prefix: string;
  private enabled: boolean = false;

  private constructor(role: LoggerRole) {
    this.prefix = role === 'client' ? '[ClientComManager]' : '[ParentComManager]';
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      this.enabled = localStorage.getItem('vibe_debug') === 'true';
    }
  }

  static getInstance(role: LoggerRole): Logger {
    if (!Logger.instances.has(role)) {
      Logger.instances.set(role, new Logger(role));
    }
    return Logger.instances.get(role)!;
  }

  static setDebugEnabled(enabled: boolean): void {
    Logger.instances.forEach((logger) => {
      logger.enabled = enabled;
    });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vibe_debug', String(enabled));
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private log(level: string, message: string, data?: unknown): void {
    if (!this.enabled) return;
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    if (data !== undefined) {
      console.log(`${this.prefix} ${timestamp} [${level}] ${message}`, data);
    } else {
      console.log(`${this.prefix} ${timestamp} [${level}] ${message}`);
    }
  }

  send(type: string, messageId?: string, data?: unknown): void {
    const idStr = messageId ? ` [${messageId.slice(-8)}]` : '';
    this.log('SEND', `${type}${idStr}`, data);
  }

  receive(type: string, messageId?: string, data?: unknown): void {
    const idStr = messageId ? ` [${messageId.slice(-8)}]` : '';
    this.log('RECV', `${type}${idStr}`, data);
  }

  handshakeStart(appId?: number): void {
    const idStr = appId ? ` (${appId})` : '';
    this.log('INFO', `Handshake started${idStr}`);
  }

  handshakeSuccess(appId?: number): void {
    const idStr = appId ? ` (${appId})` : '';
    this.log('INFO', `Handshake successful${idStr}`);
  }

  handshakeFailed(reason: string, appId?: number): void {
    const idStr = appId ? ` (${appId})` : '';
    this.log('ERROR', `Handshake failed${idStr}: ${reason}`);
  }

  lifecycleChange(from: string, to: string, appId?: number): void {
    const idStr = appId ? ` [${appId}]` : '';
    this.log('INFO', `Lifecycle${idStr}: ${from} -> ${to}`);
  }

  requestStart(type: string, messageId: string, data?: unknown): void {
    this.log('REQ', `${type} [${messageId.slice(-8)}]`, data);
  }

  requestResponse(messageId: string, success: boolean, data?: unknown): void {
    const status = success ? 'OK' : 'FAIL';
    this.log('RES', `[${messageId.slice(-8)}] ${status}`, data);
  }

  requestTimeout(type: string, messageId: string): void {
    this.log('WARN', `Timeout: ${type} [${messageId.slice(-8)}]`);
  }

  error(message: string, data?: unknown): void {
    this.log('ERROR', message, data);
  }
  warn(message: string, data?: unknown): void {
    this.log('WARN', message, data);
  }
  info(message: string, data?: unknown): void {
    this.log('INFO', message, data);
  }
  debug(message: string, data?: unknown): void {
    this.log('DEBUG', message, data);
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__VIBE_DEBUG__ = (enabled = true) => {
    Logger.setDebugEnabled(enabled);
    console.log(`[Vibe] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  };
}
