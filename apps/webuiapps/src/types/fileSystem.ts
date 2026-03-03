/**
 * File system type definitions
 * For in-memory file tree storage and cloud synchronization
 */

// ============ File node types ============

/**
 * File node metadata
 */
export interface FileMetadata {
  /** File size (bytes) */
  size?: number;
  /** Creation timestamp (milliseconds) */
  createdAt?: number;
  /** Update timestamp (milliseconds) */
  updatedAt?: number;
  /** MIME type */
  mimeType?: string;
}

/**
 * File node type
 */
export type FileNodeType = 'file' | 'folder';

/**
 * File node
 */
export interface FileNode {
  /** Unique identifier */
  id: string;
  /** File/folder name */
  name: string;
  /** Full path, e.g. "/photos/2024/img.jpg" */
  path: string;
  /** Node type */
  type: FileNodeType;
  /** Parent node ID, null for root node */
  parentId: string | null;
  /** Child node ID list (folder type only) */
  children?: string[];
  /** File content (optional, loaded on demand) */
  content?: unknown;
  /** Metadata */
  metadata?: FileMetadata;
}

// ============ File system store types ============

/**
 * File system store state
 */
export interface FileSystemStoreState {
  /** Node map: id -> FileNode */
  nodes: Map<string, FileNode>;
  /** Path index: path -> id */
  pathIndex: Map<string, string>;
  /** Root node ID */
  rootId: string;
}

/**
 * File system store snapshot (for serialization)
 */
export interface FileSystemSnapshot {
  nodes: Array<[string, FileNode]>;
  pathIndex: Array<[string, string]>;
  rootId: string;
}

// ============ File operation types ============

/**
 * Read file result
 */
export interface ReadFileResult {
  content: unknown;
  metadata: FileMetadata;
}

/**
 * Write file options
 */
export interface WriteFileOptions {
  /** Whether to overwrite existing file */
  overwrite?: boolean;
  /** Metadata */
  metadata?: Partial<FileMetadata>;
}

/**
 * File operations interface (for cloud communication)
 */
export interface FileOperations {
  /** List files (all or in a specific directory) */
  listFiles(path?: string): Promise<FileNode[]>;
  /** Read a single file's content */
  readFile(path: string): Promise<ReadFileResult>;
  /** Write file */
  writeFile(path: string, content: unknown, options?: WriteFileOptions): Promise<void>;
  /** Delete file */
  deleteFile(path: string): Promise<void>;
}

// ============ Event types ============

/**
 * File system change event type
 */
export type FileSystemEventType =
  | 'node_added'
  | 'node_removed'
  | 'node_updated'
  | 'content_changed'
  | 'store_reset';

/**
 * File system change event
 */
export interface FileSystemEvent {
  type: FileSystemEventType;
  nodeId?: string;
  path?: string;
  timestamp: number;
}

/**
 * File system change listener
 */
export type FileSystemListener = (event: FileSystemEvent) => void;

// ============ Utility types ============

/**
 * Parameters for creating a file node (some fields optional)
 */
export type CreateFileNodeParams = Omit<FileNode, 'id' | 'children' | 'metadata'> & {
  id?: string;
  metadata?: FileMetadata;
};

/**
 * Parameters for updating a file node
 */
export type UpdateFileNodeParams = Partial<Omit<FileNode, 'id' | 'path'>>;
