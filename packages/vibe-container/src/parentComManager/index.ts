/**
 * Vibe App Parent Communication Manager SDK
 * Manages communication with multiple iframe child apps
 */
import { AppConfig, AppLifecycle, EventType, MessageContent } from '../types';

/** App instance info */
export interface AppInstance {
  config: AppConfig;
  iframe: HTMLIFrameElement;
  window: Window;
  origin: string;
  lifecycle: AppLifecycle;
  registeredAt: number;
  lastActiveAt: number;
}

export type AppEventHandler<T = unknown> = (
  appId: number,
  payload: T,
  message: MessageContent,
) => void | Promise<void>;

export type FileOperationHandler = (
  appId: number,
  operationType: EventType,
  payload: string,
) => Promise<unknown>;

export type AgentMessageHandler = (appId: number, payload: string) => Promise<unknown>;

export type InfoQueryHandler = (appId: number, queryType: EventType) => Promise<unknown>;

export interface ParentComManagerConfig {
  allowedOrigins?: string[];
  fileOperationHandler: FileOperationHandler;
  agentMessageHandler: AgentMessageHandler;
  infoQueryHandler: InfoQueryHandler;
}

/**
 * Parent communication manager - stub for standalone mode.
 * In production, the real implementation manages iframe messaging.
 * In standalone/open-source mode, vibeContainerMock.ts handles everything.
 */
export class ParentComManager {
  private static instance: ParentComManager | null = null;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(_config: ParentComManagerConfig): ParentComManager {
    if (!ParentComManager.instance) {
      ParentComManager.instance = new ParentComManager();
    }
    return ParentComManager.instance;
  }

  static destroyInstance(): void {
    ParentComManager.instance = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  destroy(): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  updateConfig(_config: Partial<ParentComManagerConfig>): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  preRegisterIframe(_appId: number, _iframe: HTMLIFrameElement): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  unregisterApp(_appId: number): void {}

  getAppInstance(_appId: number): AppInstance | undefined {
    return undefined;
  }

  getAllAppInstances(): Map<number, AppInstance> {
    return new Map();
  }

  getAppsByLifecycle(_lifecycle: AppLifecycle): AppInstance[] {
    return [];
  }

  postMessageToApp(
    _appId: number,
    _message: MessageContent,
    _options?: { queueIfNotReady?: boolean },
  ): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  broadcast(_message: MessageContent): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  broadcastToLifecycle(_lifecycle: AppLifecycle, _message: MessageContent): void {}

  sendAgentMessageToApp(
    _appId: number,
    _content: string,
    _metadata?: Record<string, unknown>,
  ): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  broadcastAgentMessage(_content: string, _metadata?: Record<string, unknown>): void {}

  onAgentMessage(_handler: AgentMessageHandler): () => void {
    return () => {};
  }

  on<T = unknown>(_type: EventType, _handler: AppEventHandler<T>): () => void {
    return () => {};
  }

  once<T = unknown>(_type: EventType, _handler: AppEventHandler<T>): () => void {
    return () => {};
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  off<T = unknown>(_type: EventType, _handler: AppEventHandler<T>): void {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setDebug(_enabled: boolean): void {}

  onLifecycleChange(
    _handler: (appId: number, lifecycle: AppLifecycle, previousLifecycle?: AppLifecycle) => void,
  ): () => void {
    return () => {};
  }

  onAppReady(_handler: (appId: number, config: AppConfig) => void): () => void {
    return () => {};
  }

  onAppError(_handler: (appId: number, error?: string) => void): () => void {
    return () => {};
  }
}

export function getParentComManager(config: ParentComManagerConfig): ParentComManager {
  return ParentComManager.getInstance(config);
}

export function initParentComManager(config: ParentComManagerConfig): ParentComManager {
  return ParentComManager.getInstance(config);
}

export default ParentComManager.getInstance;
