/**
 * Stores the user's 3D companion model (a .vrm file, usually 5–30 MB).
 *
 * Primary: the app's server storage (/avatar/companion.vrm), so every device
 * that opens OpenRoom gets the same companion. Fallback when the server can't
 * store files: this browser's IndexedDB.
 */

import {
  appFileUrl,
  deleteAppBinaryFile,
  isServerFileStorageAvailable,
  putAppBinaryFile,
} from '@/lib';
import { APP_NAME, AVATAR_FILE } from '../actions/constants';
import type { AvatarModelInfo } from '../types';

export const MAX_MODEL_BYTES = 60 * 1024 * 1024;
export const MODEL_EXTENSIONS = ['.vrm', '.glb'];

export type ModelErrorCode = 'type' | 'size' | 'format' | 'storage';

export class ModelFileError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ModelFileError';
  }
}

/** What we need from an uploaded file. */
export interface ModelFile {
  name: string;
  size: number;
  slice(start?: number, end?: number): Blob;
}

/** glTF binary files start with the ASCII magic "glTF". */
export async function readMagic(file: ModelFile): Promise<string> {
  const head = file.slice(0, 4);
  const buffer = await blobToArrayBuffer(head);
  return String.fromCharCode(...new Uint8Array(buffer));
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Reject files that can't be a VRM model before uploading anything. */
export async function validateModelFile(file: ModelFile): Promise<void> {
  const lower = file.name.toLowerCase();
  if (!MODEL_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new ModelFileError('type', 'Choose a .vrm file');
  }
  if (file.size > MAX_MODEL_BYTES) {
    throw new ModelFileError('size', 'The file is larger than 60 MB');
  }
  if (file.size < 20 || (await readMagic(file)) !== 'glTF') {
    throw new ModelFileError('format', 'This is not a VRM model');
  }
}

// ---------------------------------------------------------------- storage backends

export interface ServerFiles {
  available(): Promise<boolean>;
  put(path: string, data: Blob, mimeType: string): Promise<void>;
  remove(path: string): Promise<void>;
  url(path: string): string;
}

export interface BrowserFiles {
  get(key: string): Promise<Blob | null>;
  put(key: string, data: Blob): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Path of the model relative to the session's apps/ directory. */
export const MODEL_PATH = `${APP_NAME}/data${AVATAR_FILE}`;
const BROWSER_KEY = 'companion-model';

export const serverFiles: ServerFiles = {
  available: () => isServerFileStorageAvailable(),
  put: (path, data, mimeType) => putAppBinaryFile(path, data, mimeType),
  remove: (path) => deleteAppBinaryFile(path),
  url: (path) => appFileUrl(path),
};

/** Minimal IndexedDB blob store. `factory` is injectable for tests. */
export function createBrowserFiles(
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
  dbName = 'openroom-dreamland',
  storeName = 'files',
): BrowserFiles {
  let dbPromise: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = factory.open(dbName, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName)) {
            request.result.createObjectStore(storeName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          dbPromise = null;
          reject(request.error ?? new Error('IndexedDB open failed'));
        };
      });
    }
    return dbPromise;
  };

  const run = async <T>(
    mode: IDBTransactionMode,
    op: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = op(tx.objectStore(storeName));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  };

  return {
    async get(key) {
      const value = await run<unknown>('readonly', (s) => s.get(key));
      return value instanceof Blob ? value : null;
    },
    async put(key, data) {
      await run('readwrite', (s) => s.put(data, key));
    },
    async remove(key) {
      await run('readwrite', (s) => s.delete(key));
    },
  };
}

// ---------------------------------------------------------------- store

export interface AvatarModelStore {
  /** Validate and store a new model; returns the info to keep in state.json. */
  save(file: ModelFile & Blob): Promise<AvatarModelInfo>;
  /** URL the 3D renderer can load, or null when the file is gone. */
  resolveUrl(info: AvatarModelInfo): Promise<string | null>;
  remove(info: AvatarModelInfo): Promise<void>;
  /** Release object URLs created by resolveUrl. */
  release(): void;
}

export interface AvatarModelStoreDeps {
  server?: ServerFiles;
  browser?: BrowserFiles;
  now?: () => number;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

export function createAvatarModelStore(deps: AvatarModelStoreDeps = {}): AvatarModelStore {
  const server = deps.server ?? serverFiles;
  const browser = deps.browser ?? createBrowserFiles();
  const now = deps.now ?? Date.now;
  const createObjectUrl = deps.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectUrl = deps.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const objectUrls: string[] = [];

  return {
    async save(file) {
      await validateModelFile(file);
      const base = { fileName: file.name, size: file.size, updatedAt: now() };
      if (await server.available()) {
        try {
          await server.put(MODEL_PATH, file, 'application/octet-stream');
          return { ...base, storage: 'server' };
        } catch {
          // Fall through to browser storage
        }
      }
      try {
        await browser.put(BROWSER_KEY, file);
      } catch {
        throw new ModelFileError('storage', 'The model could not be saved');
      }
      return { ...base, storage: 'browser' };
    },

    async resolveUrl(info) {
      if (info.storage === 'server') {
        return `${server.url(MODEL_PATH)}&v=${info.updatedAt}`;
      }
      const blob = await browser.get(BROWSER_KEY).catch(() => null);
      if (!blob) return null;
      const url = createObjectUrl(blob);
      objectUrls.push(url);
      return url;
    },

    async remove(info) {
      if (info.storage === 'server') await server.remove(MODEL_PATH);
      else await browser.remove(BROWSER_KEY);
    },

    release() {
      objectUrls.splice(0).forEach(revokeObjectUrl);
    },
  };
}
