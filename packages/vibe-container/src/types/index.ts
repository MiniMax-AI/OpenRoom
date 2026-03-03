/**
 * Vibe App Communication - Shared Type Definitions
 */

/** App basic configuration */
export interface AppConfig {
  id: number;
  url: string;
  type: string;
  name: string;
  windowStyle: {
    width: number;
    height: number;
  };
}

/** Lifecycle enum */
export enum AppLifecycle {
  CREATED = 'created',
  LOADING = 'loading',
  DOM_READY = 'dom_ready',
  LOADED = 'loaded',
  REGISTERING = 'registering',
  REGISTERED = 'registered',
  READY = 'ready',
  ERROR = 'error',
  UNLOADING = 'unloading',
  DESTROYED = 'destroyed',
}

/** Event type enum */
export enum EventType {
  Handshake = 'handshake',
  HandshakeAck = 'handshake_ack',
  LifecycleChange = 'lifecycle_change',
  StateChange = 'state_change',
  SendAgentMessage = 'send_agent_message',
  ReceiveAgentMessage = 'receive_agent_message',
  GetFile = 'get_file',
  ListFiles = 'list_files',
  SearchFiles = 'search_file',
  PutTextFilesByJSON = 'put_text_files_by_json',
  DeleteFilesByPaths = 'delete_files_by_paths',
  GetUserInfo = 'get_user_info',
  GetCharacterInfo = 'get_character_info',
  GetSystemSettings = 'get_system_settings',
  Response = 'response',
}

/** Message content format */
export interface MessageContent<T = unknown> {
  type: EventType;
  payload: string;
  messageId?: string;
  requestId?: string;
  _parsedPayload?: T;
}

/** State change payload */
export interface StateChangePayload {
  lifecycle: AppLifecycle;
  previousLifecycle?: AppLifecycle;
  timestamp: number;
  error?: string;
}

/** Agent message payload */
export interface AgentMessagePayload {
  content: string;
  metadata?: Record<string, unknown>;
}

/** File operation payload */
export interface FileOperationPayload {
  data?: string;
}

/** File operation response payload */
export interface FileOperationResponsePayload {
  statusCode: number;
  statusMsg?: string;
  data?: unknown;
}

/** Handshake payload */
export interface HandshakePayload {
  appConfig: AppConfig;
  timestamp: number;
}

/** Lifecycle change payload */
export interface LifecycleChangePayload {
  lifecycle: AppLifecycle;
  error?: string;
  timestamp: number;
}

/** User info response */
export interface UserInfoResponse {
  userId: number;
  nickname: string;
  avatarUrl: string;
  isAnonymous: boolean;
}

/** Character info response */
export interface CharacterInfoResponse {
  id: number;
  name: string;
  avatarUrl: string;
  description: string;
}

/** Language info */
export interface LanguageInfo {
  code: string;
  name: string;
}

/** System settings response */
export interface SystemSettingsResponse {
  language: {
    current: string;
    list: LanguageInfo[];
  };
}

/** Request options */
export interface RequestOptions {
  timeout?: number;
}

/** Event handler type */
export type EventHandler<T = unknown> = (
  payload: T,
  message: MessageContent,
) => void | Promise<void>;
