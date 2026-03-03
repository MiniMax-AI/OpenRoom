/**
 * Shared Infrastructure Layer - Unified Exports
 *
 * New apps only need to import required capabilities from '@/lib':
 *
 * @example
 * import {
 *   // Hooks
 *   useFileSystem, useFilePath, useFolderChildren,
 *   // Action
 *   reportAction, reportLifecycle, useAgentActionListener,
 *   ActionTriggerBy, OsEventType,
 *   // Vibe Info (User / Character / System Settings)
 *   fetchVibeInfo, getVibeInfo, useVibeInfo,
 *   // Utilities
 *   generateId,
 *   // Types
 *   type CharacterAppAction, type CharacterOsEvent, type FileNode, type VibeInfo,
 * } from '@/lib';
 */

// ============ Types ============
export type {
  FileMetadata,
  FileNodeType,
  FileNode,
  FileSystemStoreState,
  FileSystemSnapshot,
  ReadFileResult,
  WriteFileOptions,
  FileOperations,
  FileSystemEventType,
  FileSystemEvent,
  FileSystemListener,
  CreateFileNodeParams,
  UpdateFileNodeParams,
} from '../types/fileSystem';

// ============ Action & Lifecycle ============
export {
  ActionTriggerBy,
  OsEventType,
  reportAction,
  reportLifecycle,
  setReportUserActions,
  useAgentActionListener,
} from './action';
export type { CharacterAppAction, CharacterOsEvent } from './action';

// ============ File System Hooks ============
export { useFileSystem, useFilePath, useFolderChildren } from '../hooks/useFileSystem';

// ============ File API ============
export {
  fileApi,
  createAppFileApi,
  batchConcurrent,
  listFiles,
  readFile,
  writeFile,
  deleteFile,
  deleteFiles,
  searchFiles,
  putTextFiles,
} from './fileApi';

// ============ File System Store ============
export { FileSystemStore, createFileSystemStore } from './FileSystemStore';

// ============ Local Mock (Development) ============
export { createLocalFileApi } from './localFileApi';

// ============ Vibe Info (User / Character / System Settings) ============
export { fetchVibeInfo, getVibeInfo, isVibeInfoFetched, useVibeInfo } from './vibeInfo';
export type { VibeInfo } from './vibeInfo';

// ============ Utilities ============
export { generateId } from './generateId';
export { normalizePath, getFileName, getParentPath, getDirPath } from './path';
