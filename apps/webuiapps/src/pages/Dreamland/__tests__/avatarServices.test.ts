import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib', () => ({
  appFileUrl: (p: string) => `/api/session-data?path=apps%2F${encodeURIComponent(p)}`,
  deleteAppBinaryFile: vi.fn(async () => undefined),
  isServerFileStorageAvailable: vi.fn(async () => true),
  putAppBinaryFile: vi.fn(async () => undefined),
}));

import * as lib from '@/lib';
import {
  MAX_MODEL_BYTES,
  MODEL_PATH,
  ModelFileError,
  createAvatarModelStore,
  createBrowserFiles,
  readMagic,
  serverFiles,
  validateModelFile,
  type BrowserFiles,
  type ServerFiles,
} from '../services/avatarModelStore';
import {
  isTiltSupported,
  isTouchDevice,
  listenTilt,
  needsMotionPermission,
  requestMotionPermission,
  screenAngle,
} from '../services/motionInput';

const glb = (name = 'Aoi.vrm') => {
  const blob = new Blob([new TextEncoder().encode('glTF'), new Uint8Array(60)]);
  return Object.assign(blob, { name }) as Blob & { name: string };
};

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as ModelFileError).code;
  }
};

describe('validateModelFile', () => {
  it('accepts glTF binaries named .vrm or .glb', async () => {
    expect(await readMagic(glb())).toBe('glTF');
    await expect(validateModelFile(glb('a.VRM'))).resolves.toBeUndefined();
    await expect(validateModelFile(glb('a.glb'))).resolves.toBeUndefined();
  });

  it('refuses other types, huge files and fake models', async () => {
    expect(await code(validateModelFile(glb('a.txt')))).toBe('type');
    const blob = glb();
    const huge = { name: 'a.vrm', size: MAX_MODEL_BYTES + 1, slice: blob.slice.bind(blob) };
    expect(await code(validateModelFile(huge))).toBe('size');
    const fake = Object.assign(new Blob([new Uint8Array(64)]), { name: 'x.vrm' });
    expect(await code(validateModelFile(fake))).toBe('format');
    const tiny = Object.assign(new Blob([new TextEncoder().encode('glTF')]), { name: 'x.vrm' });
    expect(await code(validateModelFile(tiny))).toBe('format');
  });

  it('reads the header with FileReader when Blob.arrayBuffer is missing', async () => {
    const blob = glb();
    const slice = blob.slice(0, 4);
    Object.defineProperty(slice, 'arrayBuffer', { value: undefined });
    const file = { name: 'a.vrm', size: 64, slice: () => slice };
    expect(await readMagic(file)).toBe('glTF');
  });
});

function fakeServer(available = true) {
  return {
    available: vi.fn(async () => available),
    put: vi.fn(async (_path: string, _data: Blob, _mimeType: string): Promise<void> => undefined),
    remove: vi.fn(async (_path: string): Promise<void> => undefined),
    url: (p: string) => `/files?path=${p}`,
  } satisfies ServerFiles;
}

function fakeBrowser(): BrowserFiles & { data: Map<string, Blob> } {
  const data = new Map<string, Blob>();
  return {
    data,
    get: vi.fn(async (k: string) => data.get(k) ?? null),
    put: vi.fn(async (k: string, v: Blob) => {
      data.set(k, v);
    }),
    remove: vi.fn(async (k: string) => {
      data.delete(k);
    }),
  };
}

describe('avatarModelStore', () => {
  it('saves on the server and serves it with a cache-busting URL', async () => {
    const server = fakeServer();
    const store = createAvatarModelStore({ server, browser: fakeBrowser(), now: () => 42 });
    const info = await store.save(glb());
    expect(info).toEqual({ fileName: 'Aoi.vrm', size: 64, updatedAt: 42, storage: 'server' });
    expect(server.put).toHaveBeenCalledWith(
      MODEL_PATH,
      expect.any(Blob),
      'application/octet-stream',
    );
    expect(await store.resolveUrl(info)).toBe(`/files?path=${MODEL_PATH}&v=42`);
    await store.remove(info);
    expect(server.remove).toHaveBeenCalledWith(MODEL_PATH);
  });

  it('falls back to the browser when the server is missing or refuses', async () => {
    const browser = fakeBrowser();
    const urls: string[] = [];
    const revoked: string[] = [];
    const store = createAvatarModelStore({
      server: fakeServer(false),
      browser,
      now: () => 1,
      createObjectUrl: () => {
        urls.push(`blob:${urls.length}`);
        return urls[urls.length - 1];
      },
      revokeObjectUrl: (u) => revoked.push(u),
    });
    const info = await store.save(glb());
    expect(info.storage).toBe('browser');
    expect(await store.resolveUrl(info)).toBe('blob:0');
    store.release();
    expect(revoked).toEqual(['blob:0']);
    await store.remove(info);
    expect(await store.resolveUrl(info)).toBeNull();

    const refusing = fakeServer(true);
    refusing.put.mockRejectedValueOnce(new Error('413'));
    const store2 = createAvatarModelStore({ server: refusing, browser: fakeBrowser() });
    expect((await store2.save(glb())).storage).toBe('browser');
  });

  it('reports a storage error when nothing can keep the file', async () => {
    const browser = fakeBrowser();
    (browser.put as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('quota'));
    const store = createAvatarModelStore({ server: fakeServer(false), browser });
    expect(await code(store.save(glb()))).toBe('storage');
    // a broken browser store reads as "no file"
    (browser.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('idb'));
    expect(
      await store.resolveUrl({ fileName: 'a', size: 1, updatedAt: 1, storage: 'browser' }),
    ).toBeNull();
  });

  it('uses the platform file helpers by default', async () => {
    expect(await serverFiles.available()).toBe(true);
    await serverFiles.put('a/b.vrm', new Blob(['x']), 'application/octet-stream');
    expect(lib.putAppBinaryFile).toHaveBeenCalledWith(
      'a/b.vrm',
      expect.any(Blob),
      'application/octet-stream',
    );
    await serverFiles.remove('a/b.vrm');
    expect(lib.deleteAppBinaryFile).toHaveBeenCalledWith('a/b.vrm');
    expect(serverFiles.url('a/b.vrm')).toContain('a%2Fb.vrm');
    expect(createAvatarModelStore()).toBeTruthy();
  });
});

// ---------------------------------------------------------------- fake IndexedDB

function fakeIndexedDb(options: { failOpen?: boolean; failRequest?: boolean } = {}) {
  const stores = new Map<string, Map<string, unknown>>();
  const request = <T>(fn: () => T) => {
    const req: Record<string, unknown> = {};
    setTimeout(() => {
      if (options.failRequest) {
        req.error = new Error('request failed');
        (req.onerror as () => void)?.();
        return;
      }
      req.result = fn();
      (req.onsuccess as () => void)?.();
    }, 0);
    return req;
  };
  const db = {
    objectStoreNames: { contains: (n: string) => stores.has(n) },
    createObjectStore: (n: string) => stores.set(n, new Map()),
    transaction: (n: string) => ({
      objectStore: () => {
        const store = stores.get(n) as Map<string, unknown>;
        return {
          get: (k: string) => request(() => store.get(k)),
          put: (v: unknown, k: string) => request(() => store.set(k, v)),
          delete: (k: string) => request(() => store.delete(k)),
        };
      },
    }),
  };
  let opens = 0;
  const factory = {
    open: () => {
      opens++;
      const req: Record<string, unknown> = { result: db };
      setTimeout(() => {
        if (options.failOpen) {
          (req.onerror as () => void)?.();
          return;
        }
        (req.onupgradeneeded as () => void)?.();
        (req.onsuccess as () => void)?.();
      }, 0);
      return req;
    },
  };
  return { factory: factory as unknown as IDBFactory, opens: () => opens };
}

describe('createBrowserFiles (IndexedDB)', () => {
  it('stores, reads and deletes blobs', async () => {
    const { factory, opens } = fakeIndexedDb();
    const files = createBrowserFiles(factory);
    const blob = new Blob(['model']);
    await files.put('k', blob);
    expect(await files.get('k')).toBe(blob);
    await files.remove('k');
    expect(await files.get('k')).toBeNull();
    expect(opens()).toBe(1);
  });

  it('rejects when IndexedDB is missing or fails', async () => {
    await expect(createBrowserFiles(undefined).get('k')).rejects.toThrow(/not available/);
    const broken = createBrowserFiles(fakeIndexedDb({ failOpen: true }).factory);
    await expect(broken.get('k')).rejects.toThrow(/open failed/);
    const failing = createBrowserFiles(fakeIndexedDb({ failRequest: true }).factory);
    await expect(failing.put('k', new Blob(['x']))).rejects.toThrow(/request failed/);
  });
});

// ---------------------------------------------------------------- tilt input

describe('motionInput', () => {
  const w = window as unknown as Record<string, unknown>;
  const original = w.DeviceOrientationEvent;
  afterEach(() => {
    w.DeviceOrientationEvent = original;
    delete w.orientation;
  });

  it('detects support and the iOS permission prompt', async () => {
    w.DeviceOrientationEvent = class {};
    expect(isTiltSupported()).toBe(true);
    expect(needsMotionPermission()).toBe(false);
    expect(await requestMotionPermission()).toBe(true);

    w.DeviceOrientationEvent = { requestPermission: vi.fn(async () => 'granted') };
    expect(needsMotionPermission()).toBe(true);
    expect(await requestMotionPermission()).toBe(true);
    w.DeviceOrientationEvent = { requestPermission: vi.fn(async () => 'denied') };
    expect(await requestMotionPermission()).toBe(false);
    w.DeviceOrientationEvent = {
      requestPermission: vi.fn(async () => Promise.reject(new Error('gesture'))),
    };
    expect(await requestMotionPermission()).toBe(false);

    w.DeviceOrientationEvent = undefined;
    expect(isTiltSupported()).toBe(false);
    expect(await requestMotionPermission()).toBe(false);
  });

  it('reads touch devices and the screen rotation', () => {
    const mm = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    expect(isTouchDevice()).toBe(true);
    mm.mockRestore();
    expect(typeof screenAngle()).toBe('number');
    const orientation = Object.getOwnPropertyDescriptor(window.screen, 'orientation');
    Object.defineProperty(window.screen, 'orientation', { value: undefined, configurable: true });
    w.orientation = 90;
    expect(screenAngle()).toBe(90);
    delete w.orientation;
    expect(screenAngle()).toBe(0);
    if (orientation) Object.defineProperty(window.screen, 'orientation', orientation);
    else delete (window.screen as unknown as Record<string, unknown>).orientation;
  });

  it('forwards tilt readings with values and stops listening', () => {
    const seen: unknown[] = [];
    const stop = listenTilt((t) => seen.push(t));
    const fire = (props: Record<string, unknown>) =>
      window.dispatchEvent(Object.assign(new Event('deviceorientation'), props));
    fire({ beta: 10, gamma: -5 });
    fire({ beta: null, gamma: null });
    stop();
    fire({ beta: 1, gamma: 1 });
    expect(seen).toEqual([{ beta: 10, gamma: -5 }]);
  });
});
