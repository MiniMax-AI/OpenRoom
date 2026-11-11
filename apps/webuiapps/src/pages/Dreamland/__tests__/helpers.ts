import { vi } from 'vitest';
import type { FileNode, FileOperations } from '@/lib';
import type { AvatarModelInfo, Dreamspace } from '../types';
import type { AudioPort, ControllerDeps, MotionPort } from '../store/controller';
import type { AvatarModelStore } from '../services/avatarModelStore';
import { DreamlandController } from '../store/controller';
import { createDreamspaceRepository } from '../repositories/dreamspaceRepository';
import { createStateRepository } from '../repositories/stateRepository';

/** In-memory FileOperations keyed by absolute app-relative paths ("/dreamspaces/a.json"). */
export function memoryApi(initial: Record<string, unknown> = {}) {
  const files = new Map<string, unknown>(Object.entries(initial));
  const api = {
    files,
    listFiles: vi.fn(async (dir = '/'): Promise<FileNode[]> => {
      const prefix = dir === '/' ? '/' : `${dir.replace(/\/$/, '')}/`;
      const seen = new Map<string, FileNode>();
      for (const key of files.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const name = rest.split('/')[0];
        const isFolder = rest.includes('/');
        seen.set(name, {
          id: '',
          name,
          path: `${prefix}${name}`,
          type: isFolder ? 'folder' : 'file',
          parentId: null,
        } as FileNode);
      }
      return [...seen.values()];
    }),
    readFile: vi.fn(async (path: string) => {
      if (!files.has(path)) throw new Error(`not found: ${path}`);
      return { content: files.get(path), metadata: {} as never };
    }),
    writeFile: vi.fn(async (path: string, content: unknown) => {
      files.set(path, JSON.parse(JSON.stringify(content)));
    }),
    deleteFile: vi.fn(async (path: string) => {
      files.delete(path);
    }),
  };
  return api as typeof api & FileOperations;
}

export function makeDream(overrides: Partial<Dreamspace> = {}): Dreamspace {
  return {
    id: 'd1',
    name: 'Dream one',
    scenePrompt: 'A meadow',
    backgroundUrl: null,
    timeOfDay: 'day',
    weather: 'clear',
    mood: 'serene',
    ambientSound: 'wind',
    expression: 'happy',
    caption: '',
    // Off by default so tests opt in to automatic painting
    autoBackground: false,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

export function fakeAudio(): AudioPort & {
  calls: { sound: string[]; enabled: boolean[]; volume: number[] };
} {
  const calls = { sound: [] as string[], enabled: [] as boolean[], volume: [] as number[] };
  const audio = {
    calls,
    unlocked: false,
    unlock: vi.fn(() => {
      audio.unlocked = true;
    }),
    setEnabled: vi.fn((e: boolean) => calls.enabled.push(e)),
    setSound: vi.fn((s: string) => calls.sound.push(s)),
    setVolume: vi.fn((v: number) => calls.volume.push(v)),
  };
  return audio;
}

export function fakeGenerator(url = '/api/session-data?path=x.jpg') {
  return {
    isAvailable: vi.fn(async () => true),
    generate: vi.fn(async () => url),
  };
}

export function fakeModelStore(storage: AvatarModelInfo['storage'] = 'server') {
  const store = {
    save: vi.fn(async (file: { name: string; size: number }) => ({
      fileName: file.name,
      size: file.size,
      updatedAt: 777,
      storage,
    })),
    resolveUrl: vi.fn(
      async (info: AvatarModelInfo): Promise<string | null> => `model://${info.fileName}`,
    ),
    remove: vi.fn(async () => undefined),
    release: vi.fn(),
  };
  return store as typeof store & AvatarModelStore;
}

export function fakeMotion(needsPermission = false, granted = true) {
  const motion = {
    needsPermission: vi.fn(() => needsPermission),
    request: vi.fn(async () => granted),
  };
  return motion as typeof motion & MotionPort;
}

export function setupController(
  files: Record<string, unknown> = {},
  overrides: Partial<ControllerDeps> = {},
) {
  const api = memoryApi(files);
  const audio = fakeAudio();
  const generator = fakeGenerator();
  const report = vi.fn();
  const avatarModels = fakeModelStore();
  const motion = fakeMotion();
  let clock = 5000;
  let ids = 0;
  const deps: ControllerDeps = {
    dreams: createDreamspaceRepository(api),
    state: createStateRepository(api),
    generator,
    audio,
    avatarModels,
    motion,
    report,
    t: (key, options) => (options ? `${key} ${JSON.stringify(options)}` : key),
    seeds: [],
    now: () => ++clock,
    newId: () => `new-${++ids}`,
    saveDelayMs: 5,
    toastMs: 50,
    ...overrides,
  };
  const controller = new DreamlandController(deps);
  return {
    controller,
    api,
    audio,
    generator,
    report,
    deps,
    avatarModels: deps.avatarModels as ReturnType<typeof fakeModelStore>,
    motion: deps.motion as ReturnType<typeof fakeMotion>,
  };
}

export const dreamFile = (d: Dreamspace) => ({ [`/dreamspaces/${d.id}.json`]: d });
