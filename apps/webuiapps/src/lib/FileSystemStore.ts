/**
 * FileSystemStore - In-memory file system storage for the frontend
 *
 * Provides file tree CRUD operations, path indexing, and change subscriptions
 */

import type {
  FileNode,
  FileSystemStoreState,
  FileSystemSnapshot,
  FileSystemEvent,
  FileSystemEventType,
  FileSystemListener,
  CreateFileNodeParams,
  UpdateFileNodeParams,
  FileOperations,
} from '../types/fileSystem';
import { normalizePath, getFileName, getParentPath } from './path';

/**
 * Generate unique ID
 */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * FileSystemStore class
 * Manages in-memory file tree structure
 */
export class FileSystemStore {
  private nodes: Map<string, FileNode>;
  private pathIndex: Map<string, string>;
  private rootId: string;
  private listeners: Set<FileSystemListener>;
  private fileApi?: FileOperations;

  constructor(fileApi?: FileOperations) {
    this.nodes = new Map();
    this.pathIndex = new Map();
    this.rootId = 'root';
    this.listeners = new Set();
    this.fileApi = fileApi;

    // Initialize root node
    this.initRoot();
  }

  /**
   * Initialize root node
   */
  private initRoot(): void {
    const rootNode: FileNode = {
      id: this.rootId,
      name: '',
      path: '/',
      type: 'folder',
      parentId: null,
      children: [],
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
    this.nodes.set(this.rootId, rootNode);
    this.pathIndex.set('/', this.rootId);
  }

  // ============ Event System ============

  /**
   * Emit event
   */
  private emit(type: FileSystemEventType, nodeId?: string, path?: string): void {
    const event: FileSystemEvent = {
      type,
      nodeId,
      path,
      timestamp: Date.now(),
    };
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[FileSystemStore] Listener error:', error);
      }
    });
  }

  /**
   * Subscribe to change events
   * @returns Unsubscribe function
   */
  subscribe(listener: FileSystemListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ============ Query Operations ============

  /**
   * Get node by ID
   */
  getById(id: string): FileNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get node by path
   */
  getByPath(path: string): FileNode | undefined {
    const normalizedPath = normalizePath(path);
    const id = this.pathIndex.get(normalizedPath);
    return id ? this.nodes.get(id) : undefined;
  }

  /**
   * Get children of a node
   */
  getChildren(nodeId: string): FileNode[] {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== 'folder') {
      return [];
    }
    return (node.children || [])
      .map((id) => this.nodes.get(id))
      .filter((n): n is FileNode => n !== undefined);
  }

  /**
   * Get children by path
   */
  getChildrenByPath(path: string): FileNode[] {
    const node = this.getByPath(path);
    return node ? this.getChildren(node.id) : [];
  }

  /**
   * Get parent of a node
   */
  getParent(nodeId: string): FileNode | undefined {
    const node = this.nodes.get(nodeId);
    if (!node || !node.parentId) {
      return undefined;
    }
    return this.nodes.get(node.parentId);
  }

  /**
   * Get root node
   */
  getRoot(): FileNode {
    return this.nodes.get(this.rootId)!;
  }

  /**
   * Get all nodes
   */
  getAllNodes(): FileNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Check if a path exists
   */
  exists(path: string): boolean {
    return this.pathIndex.has(normalizePath(path));
  }

  /**
   * Get node count
   */
  get size(): number {
    return this.nodes.size;
  }

  // ============ Write Operations ============

  /**
   * Add a node
   */
  addNode(params: CreateFileNodeParams): FileNode {
    const normalizedPath = normalizePath(params.path);

    // Check if already exists
    if (this.pathIndex.has(normalizedPath)) {
      throw new Error(`Path already exists: ${normalizedPath}`);
    }

    // Get parent node
    const parentPath = getParentPath(normalizedPath);
    const parent = this.getByPath(parentPath);
    if (!parent) {
      throw new Error(`Parent not found: ${parentPath}`);
    }

    const nodeId = params.id || generateId();
    const now = Date.now();

    const node: FileNode = {
      id: nodeId,
      name: params.name || getFileName(normalizedPath),
      path: normalizedPath,
      type: params.type,
      parentId: parent.id,
      children: params.type === 'folder' ? [] : undefined,
      content: params.content,
      metadata: {
        createdAt: now,
        updatedAt: now,
        ...params.metadata,
      },
    };

    // Add to store
    this.nodes.set(nodeId, node);
    this.pathIndex.set(normalizedPath, nodeId);

    // Update parent's children
    parent.children = [...(parent.children || []), nodeId];

    this.emit('node_added', nodeId, normalizedPath);
    return node;
  }

  /**
   * Update a node
   */
  updateNode(id: string, updates: UpdateFileNodeParams): FileNode | undefined {
    const node = this.nodes.get(id);
    if (!node) {
      return undefined;
    }

    // Apply updates
    if (updates.name !== undefined) {
      node.name = updates.name;
    }
    if (updates.content !== undefined) {
      node.content = updates.content;
    }
    if (updates.metadata !== undefined) {
      node.metadata = {
        ...node.metadata,
        ...updates.metadata,
        updatedAt: Date.now(),
      };
    } else {
      node.metadata = {
        ...node.metadata,
        updatedAt: Date.now(),
      };
    }

    this.emit('node_updated', id, node.path);
    return node;
  }

  /**
   * Remove a node
   */
  removeNode(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) {
      return false;
    }

    // Cannot delete root node
    if (id === this.rootId) {
      throw new Error('Cannot remove root node');
    }

    // If it's a folder, recursively delete children
    if (node.type === 'folder' && node.children) {
      for (const childId of [...node.children]) {
        this.removeNode(childId);
      }
    }

    // Remove from parent's children
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent && parent.children) {
        parent.children = parent.children.filter((cid) => cid !== id);
      }
    }

    // Remove from store
    this.pathIndex.delete(node.path);
    this.nodes.delete(id);

    this.emit('node_removed', id, node.path);
    return true;
  }

  /**
   * Remove a node by path
   */
  removeByPath(path: string): boolean {
    const node = this.getByPath(path);
    return node ? this.removeNode(node.id) : false;
  }

  /**
   * Move a node
   */
  moveNode(id: string, newPath: string): FileNode | undefined {
    const node = this.nodes.get(id);
    if (!node) {
      return undefined;
    }

    const normalizedNewPath = normalizePath(newPath);

    // Check if target path already exists
    if (this.pathIndex.has(normalizedNewPath)) {
      throw new Error(`Target path already exists: ${normalizedNewPath}`);
    }

    // Get new parent node
    const newParentPath = getParentPath(normalizedNewPath);
    const newParent = this.getByPath(newParentPath);
    if (!newParent) {
      throw new Error(`New parent not found: ${newParentPath}`);
    }

    // Remove from old parent
    if (node.parentId) {
      const oldParent = this.nodes.get(node.parentId);
      if (oldParent && oldParent.children) {
        oldParent.children = oldParent.children.filter((cid) => cid !== id);
      }
    }

    // Update path index
    const oldPath = node.path;
    this.pathIndex.delete(oldPath);

    // Update node
    node.path = normalizedNewPath;
    node.name = getFileName(normalizedNewPath);
    node.parentId = newParent.id;

    this.pathIndex.set(normalizedNewPath, id);

    // Add to new parent
    newParent.children = [...(newParent.children || []), id];

    // If it's a folder, recursively update children paths
    if (node.type === 'folder' && node.children) {
      this.updateChildrenPaths(node);
    }

    this.emit('node_updated', id, normalizedNewPath);
    return node;
  }

  /**
   * Recursively update children paths
   */
  private updateChildrenPaths(parentNode: FileNode): void {
    for (const childId of parentNode.children || []) {
      const child = this.nodes.get(childId);
      if (child) {
        const oldPath = child.path;
        const newPath = `${parentNode.path}/${child.name}`;

        this.pathIndex.delete(oldPath);
        child.path = newPath;
        this.pathIndex.set(newPath, childId);

        if (child.type === 'folder') {
          this.updateChildrenPaths(child);
        }
      }
    }
  }

  // ============ Batch Operations ============

  /**
   * Bulk load from FileNode array
   * Typically used for cloud initialization
   */
  loadFromNodes(nodes: FileNode[]): void {
    // Clear existing data (preserve root node structure)
    this.clear();

    // Sort by path depth to ensure parent nodes are added first
    const sorted = [...nodes].sort((a, b) => {
      const depthA = a.path.split('/').length;
      const depthB = b.path.split('/').length;
      return depthA - depthB;
    });

    for (const node of sorted) {
      if (node.path === '/') {
        // Update root node
        const root = this.nodes.get(this.rootId)!;
        root.metadata = node.metadata;
        root.content = node.content;
      } else {
        try {
          this.addNode({
            id: node.id,
            name: node.name,
            path: node.path,
            type: node.type,
            parentId: node.parentId,
            content: node.content,
            metadata: node.metadata,
          });
        } catch (error) {
          console.warn(`[FileSystemStore] Failed to add node: ${node.path}`, error);
        }
      }
    }

    this.emit('store_reset');
  }

  /**
   * Clear storage (preserve root node)
   */
  clear(): void {
    this.nodes.clear();
    this.pathIndex.clear();
    this.initRoot();
    this.emit('store_reset');
  }

  // ============ Serialization ============

  /**
   * Export as snapshot
   */
  toSnapshot(): FileSystemSnapshot {
    return {
      nodes: Array.from(this.nodes.entries()),
      pathIndex: Array.from(this.pathIndex.entries()),
      rootId: this.rootId,
    };
  }

  /**
   * Restore from snapshot
   */
  fromSnapshot(snapshot: FileSystemSnapshot): void {
    this.nodes = new Map(snapshot.nodes);
    this.pathIndex = new Map(snapshot.pathIndex);
    this.rootId = snapshot.rootId;
    this.emit('store_reset');
  }

  /**
   * Export as JSON
   */
  toJSON(): string {
    const snapshot = this.toSnapshot();
    return JSON.stringify(snapshot);
  }

  /**
   * Restore from JSON
   */
  fromJSON(json: string): void {
    const snapshot = JSON.parse(json) as FileSystemSnapshot;
    this.fromSnapshot(snapshot);
  }

  // ============ Get State ============

  /**
   * Get current state
   */
  getState(): FileSystemStoreState {
    return {
      nodes: new Map(this.nodes),
      pathIndex: new Map(this.pathIndex),
      rootId: this.rootId,
    };
  }

  // ============ Cloud Sync ============

  /**
   * Initialize from cloud
   *
   * Full flow:
   *   1. listFiles('/') — list cloud root directory entries
   *   2. Recursively traverse directories — call listFiles on type='folder' nodes until all files are discovered
   *   3. Normalize nodes (handle TextFile / FileNode format differences, fill in missing intermediate directories)
   *   4. Concurrently fetch content for file nodes missing content via readFile
   *   5. Auto JSON.parse for .json files
   *   6. loadFromNodes — build local in-memory file tree
   */
  async initFromCloud(): Promise<void> {
    if (!this.fileApi) {
      throw new Error('FileApi not configured');
    }

    try {
      console.info('[FileSystemStore] Starting cloud initialization...');

      // Step 1: Recursively list all files and directories
      const rawNodes = await this.listAllFilesRecursively('/');
      console.info(`[FileSystemStore] Listed ${rawNodes.length} nodes from cloud`);

      if (rawNodes.length === 0) {
        this.clear();
        return;
      }

      // Step 2: Normalize nodes (ensure id / path / name / type are complete, fill in intermediate directories)
      const normalizedNodes = this.normalizeCloudNodes(rawNodes);

      // Step 3: Concurrently fetch files missing content
      const fileNodesNeedContent = normalizedNodes.filter(
        (n) => n.type === 'file' && n.content === undefined,
      );

      if (fileNodesNeedContent.length > 0) {
        console.info(
          `[FileSystemStore] Fetching content for ${fileNodesNeedContent.length} files (batch size: 6)...`,
        );
        const { batchConcurrent } = await import('./fileApi');
        await batchConcurrent(
          fileNodesNeedContent,
          async (node) => {
            const result = await this.fileApi!.readFile(node.path);
            if (result.content !== undefined) {
              node.content = FileSystemStore.tryParseContent(node.name, result.content);
            }
            if (result.metadata) {
              node.metadata = { ...node.metadata, ...result.metadata };
            }
          },
          {
            onBatch: (_, startIndex) => {
              const done = Math.min(startIndex + 6, fileNodesNeedContent.length);
              console.info(
                `[FileSystemStore] Fetched ${done}/${fileNodesNeedContent.length} files`,
              );
            },
          },
        );
      }

      // Step 4: Build local file tree
      this.loadFromNodes(normalizedNodes);
      console.info(`[FileSystemStore] Cloud init complete. ${this.size} nodes loaded.`);
    } catch (error) {
      console.error('[FileSystemStore] Failed to init from cloud:', error);
      throw error;
    }
  }

  /**
   * Recursively list all files and directories
   *
   * Calls listFiles in parallel on type='folder' nodes to get child entries,
   * recursing until all levels of files are discovered.
   */
  private async listAllFilesRecursively(path: string): Promise<FileNode[]> {
    const nodes = await this.fileApi!.listFiles(path);
    const allNodes: FileNode[] = [...nodes];

    // Filter directory nodes and recursively fetch their children in batches (max 6 per batch)
    const dirNodes = nodes.filter((n) => n.type === 'folder');
    if (dirNodes.length > 0) {
      const { batchConcurrent } = await import('./fileApi');
      const results = await batchConcurrent(dirNodes, (dir) =>
        this.listAllFilesRecursively(dir.path),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allNodes.push(...result.value);
        }
      }
    }

    return allNodes;
  }

  /**
   * Normalize the node list returned from cloud
   *
   * Compatible with two server response formats:
   *   - TextFile style: path is a directory (e.g. "posts"), name is the file name (e.g. "abc.json"), path does not start with "/"
   *   - FileNode style: path is the full path (e.g. "/posts/abc.json"), starts with "/"
   *
   * Also fills in missing intermediate directory nodes to ensure loadFromNodes can correctly build parent-child relationships.
   */
  private normalizeCloudNodes(rawNodes: FileNode[]): FileNode[] {
    const nodes: FileNode[] = [];
    const pathSet = new Set<string>();
    const missingDirs = new Set<string>();

    for (const raw of rawNodes) {
      // Determine format and build full path
      let fullPath: string;
      if (raw.path && raw.path.startsWith('/')) {
        // FileNode style: path is already the full path
        fullPath = normalizePath(raw.path);
      } else {
        // TextFile style: path is directory, name is file name
        const dir = (raw.path || '').replace(/^\/|\/$/g, '');
        const name = raw.name || '';
        fullPath = normalizePath(dir ? `/${dir}/${name}` : `/${name}`);
      }

      // Skip root path and duplicate paths
      if (fullPath === '/' || pathSet.has(fullPath)) continue;
      pathSet.add(fullPath);

      // Infer node type (files have extensions, otherwise folders)
      const name = raw.name || getFileName(fullPath);
      const type = raw.type || (name.includes('.') ? 'file' : 'folder');

      nodes.push({
        id: raw.id || generateId(),
        name,
        path: fullPath,
        type,
        parentId: null,
        children: type === 'folder' ? [] : undefined,
        content:
          raw.content !== undefined
            ? FileSystemStore.tryParseContent(name, raw.content)
            : undefined,
        metadata: raw.metadata,
      });

      // Collect intermediate directories that need to be added
      let parentPath = getParentPath(fullPath);
      while (parentPath !== '/') {
        if (pathSet.has(parentPath) || missingDirs.has(parentPath)) break;
        missingDirs.add(parentPath);
        parentPath = getParentPath(parentPath);
      }
    }

    // Add missing intermediate directory nodes
    for (const dirPath of missingDirs) {
      if (!pathSet.has(dirPath)) {
        nodes.push({
          id: generateId(),
          name: getFileName(dirPath),
          path: dirPath,
          type: 'folder',
          parentId: null,
          children: [],
        });
        pathSet.add(dirPath);
      }
    }

    return nodes;
  }

  /**
   * Try to parse file content
   * .json files are auto JSON.parsed, other files keep their raw value
   */
  private static tryParseContent(fileName: string, content: unknown): unknown {
    if (typeof content !== 'string') return content;
    if (!fileName.endsWith('.json')) return content;
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  /**
   * Sync write to cloud
   */
  async syncToCloud(path: string, content: unknown): Promise<void> {
    if (!this.fileApi) {
      console.warn('[FileSystemStore] FileApi not configured, skip cloud sync');
      return;
    }

    try {
      await this.fileApi.writeFile(path, content);
    } catch (error) {
      console.error('[FileSystemStore] Failed to sync to cloud:', error);
      throw error;
    }
  }

  /**
   * Delete from cloud
   */
  async deleteFromCloud(path: string): Promise<void> {
    if (!this.fileApi) {
      console.warn('[FileSystemStore] FileApi not configured, skip cloud delete');
      return;
    }

    try {
      await this.fileApi.deleteFile(path);
    } catch (error) {
      console.error('[FileSystemStore] Failed to delete from cloud:', error);
      throw error;
    }
  }
}

// ============ Convenience Factory Function ============

/**
 * Create a FileSystemStore instance
 */
export const createFileSystemStore = (fileApi?: FileOperations): FileSystemStore => {
  return new FileSystemStore(fileApi);
};

export default FileSystemStore;
