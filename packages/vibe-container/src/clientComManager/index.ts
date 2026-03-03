/**
 * Vibe App Client Communication Manager SDK
 */
import {
  AppConfig,
  AppLifecycle,
  EventType,
  MessageContent,
  AgentMessagePayload,
  EventHandler,
  RequestOptions,
  UserInfoResponse,
  CharacterInfoResponse,
  SystemSettingsResponse,
} from '../types';
import { generateMessageId, safeParseJSON, Logger } from '../utils';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Client communication manager for iframe child apps
 */
export class ClientComManager {
  private static instance: ClientComManager | null = null;
  private logger = Logger.getInstance('client');
  private lifecycle: AppLifecycle = AppLifecycle.CREATED;
  private appConfig: AppConfig | null = null;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private parentWindow: Window | null = null;
  private parentOrigin: string = '*';
  private isHandshaked: boolean = false;
  private defaultTimeout: number = 30000;
  private boundMessageHandler: (event: MessageEvent) => void;

  private constructor() {
    this.boundMessageHandler = this.handleMessage.bind(this);
    this.init();
  }

  setDebug(enabled: boolean): void {
    this.logger.setEnabled(enabled);
  }

  static getInstance(): ClientComManager {
    if (!ClientComManager.instance) {
      ClientComManager.instance = new ClientComManager();
    }
    return ClientComManager.instance;
  }

  static destroyInstance(): void {
    if (ClientComManager.instance) {
      ClientComManager.instance.destroy();
      ClientComManager.instance = null;
    }
  }

  private init(): void {
    if (window === window.parent) {
      this.logger.warn('Not running in iframe, some features may not work');
    }
    this.parentWindow = window.parent;
    window.addEventListener('message', this.boundMessageHandler);
    this.logger.info('Initialized', { origin: this.parentOrigin });
    this.setLifecycle(AppLifecycle.LOADING);
  }

  async handshake(appConfig: AppConfig, origin?: string): Promise<void> {
    this.appConfig = appConfig;
    if (origin) {
      this.parentOrigin = origin;
    }
    this.logger.handshakeStart(appConfig.id);
    this.setLifecycle(AppLifecycle.REGISTERING);
    return new Promise((resolve, reject) => {
      const messageId = generateMessageId();
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        this.logger.handshakeFailed('timeout', appConfig.id);
        reject(new Error('Handshake timeout'));
      }, this.defaultTimeout);
      this.pendingRequests.set(messageId, {
        resolve: () => {
          this.isHandshaked = true;
          this.logger.handshakeSuccess(appConfig.id);
          this.setLifecycle(AppLifecycle.REGISTERED);
          resolve();
        },
        reject: (err: Error) => {
          this.logger.handshakeFailed(err.message, appConfig.id);
          reject(err);
        },
        timer: timeout,
      });
      this.postMessageToParent({
        type: EventType.Handshake,
        payload: JSON.stringify({ appConfig, timestamp: Date.now() }),
        messageId,
      });
    });
  }

  ready(): void {
    this.setLifecycle(AppLifecycle.READY);
    this.notifyLifecycleChange();
  }

  destroy(): void {
    this.setLifecycle(AppLifecycle.UNLOADING);
    this.notifyLifecycleChange();
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(new Error('Manager destroyed'));
    });
    this.pendingRequests.clear();
    window.removeEventListener('message', this.boundMessageHandler);
    this.eventHandlers.clear();
    this.setLifecycle(AppLifecycle.DESTROYED);
  }

  getLifecycle(): AppLifecycle {
    return this.lifecycle;
  }

  private setLifecycle(lifecycle: AppLifecycle): void {
    const previousLifecycle = this.lifecycle;
    this.lifecycle = lifecycle;
    this.logger.lifecycleChange(previousLifecycle, lifecycle);
    this.emit(EventType.StateChange, {
      lifecycle,
      previousLifecycle,
      timestamp: Date.now(),
    });
  }

  private notifyLifecycleChange(): void {
    this.postMessageToParent({
      type: EventType.LifecycleChange,
      payload: JSON.stringify({
        lifecycle: this.lifecycle,
        timestamp: Date.now(),
      }),
    });
  }

  setError(error: string): void {
    this.setLifecycle(AppLifecycle.ERROR);
    this.postMessageToParent({
      type: EventType.LifecycleChange,
      payload: JSON.stringify({
        lifecycle: AppLifecycle.ERROR,
        error,
        timestamp: Date.now(),
      }),
    });
  }

  private postMessageToParent(message: MessageContent): void {
    if (!this.parentWindow) {
      this.logger.error('Parent window not available');
      return;
    }
    try {
      this.logger.send(message.type, message.messageId, safeParseJSON(message.payload));
      this.parentWindow.postMessage(message, this.parentOrigin);
    } catch (error) {
      this.logger.error('Failed to post message', error);
    }
  }

  private handleMessage(event: MessageEvent): void {
    if (this.parentOrigin !== '*' && event.origin !== this.parentOrigin) {
      this.logger.warn(`Ignored message from unknown origin: ${event.origin}`);
      return;
    }
    const message = event.data as MessageContent;
    if (!message || typeof message.type !== 'string') return;
    if (message.payload) {
      message._parsedPayload = safeParseJSON(message.payload);
    }
    this.logger.receive(
      message.type,
      message.requestId || message.messageId,
      message._parsedPayload,
    );
    if (message.type === EventType.Response && message.requestId) {
      this.handleResponse(message);
      return;
    }
    if (message.type === EventType.HandshakeAck && message.requestId) {
      this.handleHandshakeAck(message);
      return;
    }
    this.emit(message.type, message._parsedPayload, message);
  }

  private handleResponse(message: MessageContent): void {
    const pending = this.pendingRequests.get(message.requestId!);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(message.requestId!);
      const response = message._parsedPayload as {
        statusCode: number;
        statusMsg?: string;
        data?: unknown;
      };
      const success = response?.statusCode === 0;
      this.logger.requestResponse(message.requestId!, success, response);
      if (!success) {
        pending.reject(new Error(response?.statusMsg ?? 'File operation failed'));
      } else {
        pending.resolve(response?.data);
      }
    }
  }

  private handleHandshakeAck(message: MessageContent): void {
    const pending = this.pendingRequests.get(message.requestId!);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(message.requestId!);
      pending.resolve(message._parsedPayload);
    }
  }

  private async request<T>(
    type: EventType,
    payload: unknown,
    options?: RequestOptions,
  ): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const messageId = generateMessageId();
      const timeout = options?.timeout ?? this.defaultTimeout;
      this.logger.requestStart(type, messageId, payload);
      const timer = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        this.logger.requestTimeout(type, messageId);
        reject(new Error(`Request timeout: ${type}`));
      }, timeout);
      this.pendingRequests.set(messageId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.postMessageToParent({
        type,
        payload: JSON.stringify(payload),
        messageId,
      });
    });
  }

  on<T = unknown>(type: EventType, handler: EventHandler<T>): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }
    this.eventHandlers.get(type)!.add(handler as EventHandler);
    return () => this.off(type, handler);
  }

  once<T = unknown>(type: EventType, handler: EventHandler<T>): () => void {
    const onceHandler: EventHandler<T> = (payload, message) => {
      this.off(type, onceHandler);
      handler(payload, message);
    };
    return this.on(type, onceHandler);
  }

  off<T = unknown>(type: EventType, handler: EventHandler<T>): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.delete(handler as EventHandler);
    }
  }

  private emit(type: EventType, payload?: unknown, message?: MessageContent): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload, message ?? { type, payload: JSON.stringify(payload) });
        } catch (error) {
          console.error(`[ClientComManager] Error in event handler for ${type}:`, error);
        }
      });
    }
  }

  sendAgentMessage(data: unknown): void {
    this.postMessageToParent({
      type: EventType.SendAgentMessage,
      payload: JSON.stringify(data),
      messageId: generateMessageId(),
    });
  }

  onAgentMessage(handler: EventHandler<AgentMessagePayload>): () => void {
    return this.on(EventType.ReceiveAgentMessage, handler);
  }

  async getFile<T = unknown>(data?: unknown): Promise<T | undefined> {
    return this.request(EventType.GetFile, data);
  }

  async listFiles<T = unknown>(data?: unknown): Promise<T | undefined> {
    return this.request(EventType.ListFiles, data);
  }

  async searchFiles<T = unknown>(data?: unknown): Promise<T | undefined> {
    return this.request(EventType.SearchFiles, data);
  }

  async putTextFilesByJSON<T = unknown>(data?: unknown): Promise<T | undefined> {
    return this.request(EventType.PutTextFilesByJSON, data);
  }

  async deleteFilesByPaths<T = unknown>(data?: unknown): Promise<T | undefined> {
    return this.request(EventType.DeleteFilesByPaths, data);
  }

  async getUserInfo(): Promise<UserInfoResponse | undefined> {
    return this.request(EventType.GetUserInfo, null);
  }

  async getCharacterInfo(): Promise<CharacterInfoResponse | null | undefined> {
    return this.request(EventType.GetCharacterInfo, null);
  }

  async getSystemSettings(): Promise<SystemSettingsResponse | undefined> {
    return this.request(EventType.GetSystemSettings, null);
  }

  getAppConfig(): AppConfig | null {
    return this.appConfig;
  }

  isReady(): boolean {
    return this.isHandshaked && this.lifecycle === AppLifecycle.READY;
  }

  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }

  setParentOrigin(origin: string): void {
    this.parentOrigin = origin;
  }
}

/** Get communication manager instance */
export function getClientComManager(): ClientComManager {
  return ClientComManager.getInstance();
}

/** Quick init and handshake */
export async function initVibeApp(
  appConfig: AppConfig,
  origin?: string,
): Promise<ClientComManager> {
  const manager = ClientComManager.getInstance();
  await manager.handshake(appConfig, origin);
  return manager;
}

export default ClientComManager.getInstance;
