/**
 * Local mock file operations API
 * Used for local development and testing without cloud support
 */

import type {
  FileNode,
  FileOperations,
  ReadFileResult,
  WriteFileOptions,
} from '../types/fileSystem';
import { normalizePath, getFileName, getParentPath } from './path';
import { generateId } from './generateId';

/**
 * Create a local mock file operations interface
 */
export const createLocalFileApi = (): FileOperations & {
  getStore: () => Map<string, FileNode>;
} => {
  const store = new Map<string, FileNode>();

  // Initialize root node
  store.set('root', {
    id: 'root',
    name: '',
    path: '/',
    type: 'folder',
    parentId: null,
    children: [],
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });

  const findNodeByPath = (path: string): FileNode | undefined => {
    for (const node of store.values()) {
      if (node.path === path) {
        return node;
      }
    }
    return undefined;
  };

  const listFiles = async (path = '/'): Promise<FileNode[]> => {
    const normalizedPath = normalizePath(path);
    const parentNode = findNodeByPath(normalizedPath);

    if (!parentNode) {
      return [];
    }

    if (parentNode.type !== 'folder') {
      return [parentNode];
    }

    const children: FileNode[] = [];
    for (const childId of parentNode.children || []) {
      const child = store.get(childId);
      if (child) {
        children.push(child);
      }
    }
    return children;
  };

  const readFile = async (path: string): Promise<ReadFileResult> => {
    const normalizedPath = normalizePath(path);
    const node = findNodeByPath(normalizedPath);

    if (!node) {
      throw new Error(`File not found: ${path}`);
    }

    return {
      content: node.content,
      metadata: node.metadata || {},
    };
  };

  const writeFile = async (
    path: string,
    content: unknown,
    options?: WriteFileOptions,
  ): Promise<void> => {
    const normalizedPath = normalizePath(path);
    const existingNode = findNodeByPath(normalizedPath);

    if (existingNode) {
      if (!options?.overwrite) {
        throw new Error(`File already exists: ${path}`);
      }
      existingNode.content = content;
      existingNode.metadata = {
        ...existingNode.metadata,
        ...options?.metadata,
        updatedAt: Date.now(),
      };
      return;
    }

    const parentPath = getParentPath(normalizedPath);
    const parentNode = findNodeByPath(parentPath);

    if (!parentNode) {
      throw new Error(`Parent directory not found: ${parentPath}`);
    }

    const nodeId = generateId();
    const newNode: FileNode = {
      id: nodeId,
      name: getFileName(normalizedPath),
      path: normalizedPath,
      type: 'file',
      parentId: parentNode.id,
      content,
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...options?.metadata,
      },
    };

    store.set(nodeId, newNode);
    parentNode.children = [...(parentNode.children || []), nodeId];
  };

  const deleteFile = async (path: string): Promise<void> => {
    const normalizedPath = normalizePath(path);
    const node = findNodeByPath(normalizedPath);

    if (!node) {
      throw new Error(`File not found: ${path}`);
    }

    if (node.parentId) {
      const parentNode = store.get(node.parentId);
      if (parentNode && parentNode.children) {
        parentNode.children = parentNode.children.filter((id) => id !== node.id);
      }
    }

    if (node.type === 'folder' && node.children) {
      for (const childId of node.children) {
        const child = store.get(childId);
        if (child) {
          await deleteFile(child.path);
        }
      }
    }

    store.delete(node.id);
  };

  return {
    listFiles,
    readFile,
    writeFile,
    deleteFile,
    getStore: () => store,
  };
};
