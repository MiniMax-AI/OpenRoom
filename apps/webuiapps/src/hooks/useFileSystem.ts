/**
 * useFileSystem - React Hook for FileSystemStore
 *
 * Provides React integration for the file system, including:
 * - In-memory file tree CRUD
 * - Cloud synchronization
 * - Common file operation helpers (ensureDir, saveFile)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FileSystemStore, createFileSystemStore } from '../lib/FileSystemStore';
import { fileApi as defaultFileApi } from '../lib/fileApi';
import { createLocalFileApi } from '../lib/localFileApi';
import type {
  FileNode,
  FileSystemEvent,
  CreateFileNodeParams,
  UpdateFileNodeParams,
  FileOperations,
} from '../types/fileSystem';

interface UseFileSystemOptions {
  /** Whether to use local mock API (for dev/testing) */
  useLocalApi?: boolean;
  /** Custom file API (highest priority) */
  fileApi?: FileOperations;
  /** Whether to load from cloud on initialization */
  loadFromCloud?: boolean;
}

interface UseFileSystemReturn {
  /** Store instance */
  store: FileSystemStore;
  /** Whether loading is in progress */
  isLoading: boolean;
  /** Error information */
  error: Error | null;
  /** All nodes */
  nodes: FileNode[];
  /** Root node */
  root: FileNode;

  // Query methods
  getById: (id: string) => FileNode | undefined;
  getByPath: (path: string) => FileNode | undefined;
  getChildren: (nodeId: string) => FileNode[];
  getChildrenByPath: (path: string) => FileNode[];
  exists: (path: string) => boolean;

  // Write methods
  addNode: (params: CreateFileNodeParams) => FileNode;
  updateNode: (id: string, updates: UpdateFileNodeParams) => FileNode | undefined;
  removeNode: (id: string) => boolean;
  removeByPath: (path: string) => boolean;
  moveNode: (id: string, newPath: string) => FileNode | undefined;

  // Batch operations
  loadFromNodes: (nodes: FileNode[]) => void;
  clear: () => void;

  // Cloud sync
  initFromCloud: () => Promise<void>;
  syncToCloud: (path: string, content: unknown) => Promise<void>;
  deleteFromCloud: (path: string) => Promise<void>;

  // Serialization
  toJSON: () => string;
  fromJSON: (json: string) => void;

  // ============ Common helper functions ============

  /** Ensure directory exists (local file system) */
  ensureDir: (dirPath: string) => void;
  /** Save file to local file system (auto-creates parent directory) */
  saveFile: (filePath: string, data: unknown) => void;
}

/**
 * File system Hook
 *
 * Connects to the real cloud API by default. Pass `useLocalApi: true` for local mock in dev/testing.
 *
 * @example
 * // Production (default, connects to cloud)
 * const fs = useFileSystem();
 *
 * // Development (local mock)
 * const fs = useFileSystem({ useLocalApi: true });
 */
export function useFileSystem(options: UseFileSystemOptions = {}): UseFileSystemReturn {
  const { useLocalApi = false, fileApi: customFileApi, loadFromCloud = false } = options;

  // Create store (only on first render)
  const storeRef = useRef<FileSystemStore | null>(null);
  if (!storeRef.current) {
    // Priority: customFileApi > useLocalApi > default real API
    const api = customFileApi || (useLocalApi ? createLocalFileApi() : defaultFileApi);
    storeRef.current = createFileSystemStore(api);
  }
  const store = storeRef.current;

  // State
  const [, forceUpdate] = useState({});
  const [isLoading, setIsLoading] = useState(loadFromCloud);
  const [error, setError] = useState<Error | null>(null);

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      forceUpdate({});
    });
    return unsubscribe;
  }, [store]);

  // Initialize from cloud
  useEffect(() => {
    if (loadFromCloud) {
      store
        .initFromCloud()
        .then(() => {
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err);
          setIsLoading(false);
        });
    }
  }, [store, loadFromCloud]);

  // Query methods
  const getById = useCallback((id: string) => store.getById(id), [store]);
  const getByPath = useCallback((path: string) => store.getByPath(path), [store]);
  const getChildren = useCallback((nodeId: string) => store.getChildren(nodeId), [store]);
  const getChildrenByPath = useCallback((path: string) => store.getChildrenByPath(path), [store]);
  const exists = useCallback((path: string) => store.exists(path), [store]);

  // Write methods
  const addNode = useCallback((params: CreateFileNodeParams) => store.addNode(params), [store]);
  const updateNode = useCallback(
    (id: string, updates: UpdateFileNodeParams) => store.updateNode(id, updates),
    [store],
  );
  const removeNode = useCallback((id: string) => store.removeNode(id), [store]);
  const removeByPath = useCallback((path: string) => store.removeByPath(path), [store]);
  const moveNode = useCallback(
    (id: string, newPath: string) => store.moveNode(id, newPath),
    [store],
  );

  // Batch operations
  const loadFromNodes = useCallback((nodes: FileNode[]) => store.loadFromNodes(nodes), [store]);
  const clear = useCallback(() => store.clear(), [store]);

  // Cloud sync
  const initFromCloud = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await store.initFromCloud();
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [store]);

  const syncToCloud = useCallback(
    async (path: string, content: unknown) => {
      await store.syncToCloud(path, content);
    },
    [store],
  );

  const deleteFromCloud = useCallback(
    async (path: string) => {
      await store.deleteFromCloud(path);
    },
    [store],
  );

  // Serialization
  const toJSON = useCallback(() => store.toJSON(), [store]);
  const fromJSON = useCallback((json: string) => store.fromJSON(json), [store]);

  // ============ Common helper functions ============

  /**
   * Ensure directory exists
   * Creates the directory in the local file system if it doesn't exist
   */
  const ensureDir = useCallback(
    (dirPath: string) => {
      if (!store.exists(dirPath)) {
        store.addNode({
          name: dirPath.split('/').pop() || '',
          path: dirPath,
          type: 'folder',
          parentId: null,
        });
      }
    },
    [store],
  );

  /**
   * Save file to local file system
   * Auto-creates parent directory. Updates content if file exists, otherwise creates a new file.
   */
  const saveFile = useCallback(
    (filePath: string, data: unknown) => {
      const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
      if (dirPath) {
        if (!store.exists(dirPath)) {
          store.addNode({
            name: dirPath.split('/').pop() || '',
            path: dirPath,
            type: 'folder',
            parentId: null,
          });
        }
      }

      if (store.exists(filePath)) {
        const node = store.getByPath(filePath);
        if (node) {
          store.updateNode(node.id, { content: data });
        }
      } else {
        const fileName = filePath.split('/').pop() || '';
        store.addNode({
          name: fileName,
          path: filePath,
          type: 'file',
          parentId: null,
          content: data,
        });
      }
    },
    [store],
  );

  // Derived state
  const nodes = useMemo(() => store.getAllNodes(), [store, forceUpdate]);
  const root = useMemo(() => store.getRoot(), [store, forceUpdate]);

  return {
    store,
    isLoading,
    error,
    nodes,
    root,
    getById,
    getByPath,
    getChildren,
    getChildrenByPath,
    exists,
    addNode,
    updateNode,
    removeNode,
    removeByPath,
    moveNode,
    loadFromNodes,
    clear,
    initFromCloud,
    syncToCloud,
    deleteFromCloud,
    toJSON,
    fromJSON,
    ensureDir,
    saveFile,
  };
}

/**
 * File path Hook
 * Watches for changes to a file at a specific path
 */
export function useFilePath(store: FileSystemStore, path: string) {
  const [node, setNode] = useState<FileNode | undefined>(() => store.getByPath(path));

  useEffect(() => {
    setNode(store.getByPath(path));

    const unsubscribe = store.subscribe((event: FileSystemEvent) => {
      if (event.path === path || event.type === 'store_reset') {
        setNode(store.getByPath(path));
      }
    });

    return unsubscribe;
  }, [store, path]);

  return node;
}

/**
 * Folder children Hook
 * Watches for changes to child nodes of a specific folder
 */
export function useFolderChildren(store: FileSystemStore, folderPath: string) {
  const [children, setChildren] = useState<FileNode[]>(() => store.getChildrenByPath(folderPath));

  useEffect(() => {
    setChildren(store.getChildrenByPath(folderPath));

    const unsubscribe = store.subscribe((event: FileSystemEvent) => {
      if (
        event.type === 'node_added' ||
        event.type === 'node_removed' ||
        event.type === 'store_reset'
      ) {
        setChildren(store.getChildrenByPath(folderPath));
      }
    });

    return unsubscribe;
  }, [store, folderPath]);

  return children;
}

export default useFileSystem;
