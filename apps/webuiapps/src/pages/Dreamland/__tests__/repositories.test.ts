import { describe, it, expect } from 'vitest';
import { createDreamspaceRepository, dreamPath } from '../repositories/dreamspaceRepository';
import { createStateRepository } from '../repositories/stateRepository';
import { dreamFile, makeDream, memoryApi } from './helpers';

describe('dreamspaceRepository', () => {
  it('loads all dream files progressively, normalizing and skipping bad ones', async () => {
    const files: Record<string, unknown> = {
      ...dreamFile(makeDream({ id: 'a', updatedAt: 1 })),
      '/dreamspaces/b.json': JSON.stringify(makeDream({ id: 'b', updatedAt: 2 })),
      '/dreamspaces/noid.json': { name: 'No id in file', timeOfDay: 'bogus' },
      '/dreamspaces/broken.json': '{not json',
      '/dreamspaces/readme.txt': 'ignore me',
    };
    for (let i = 0; i < 6; i++) files[`/dreamspaces/x${i}.json`] = makeDream({ id: `x${i}` });
    const api = memoryApi(files);
    const repo = createDreamspaceRepository(api);
    const batches: number[] = [];
    const dreams = await repo.refresh((loaded) => batches.push(loaded.length));

    expect(dreams.map((d) => d.id)).toContain('noid');
    expect(dreams.find((d) => d.id === 'noid')?.timeOfDay).toBe('dusk');
    expect(dreams.some((d) => d.id === 'broken')).toBe(false);
    expect(dreams).toHaveLength(9);
    // newest first: b (updatedAt 2) before a (updatedAt 1)
    expect(dreams.findIndex((d) => d.id === 'b')).toBeLessThan(
      dreams.findIndex((d) => d.id === 'a'),
    );
    expect(batches.length).toBe(2); // 10 json files, batches of 6
    expect(repo.getAll()).toEqual(dreams);
    expect(repo.getById('a')?.id).toBe('a');
  });

  it('returns an empty list when the folder does not exist', async () => {
    const repo = createDreamspaceRepository(memoryApi());
    expect(await repo.refresh()).toEqual([]);
  });

  it('saves, fetches, forgets and removes dreams', async () => {
    const api = memoryApi();
    const repo = createDreamspaceRepository(api);
    const d = makeDream({ id: 'z' });
    await repo.save(d);
    expect(api.files.get(dreamPath('z'))).toEqual(d);

    api.files.set(dreamPath('z'), { ...d, name: 'Changed by agent' });
    expect((await repo.fetchOne('z'))?.name).toBe('Changed by agent');
    expect(repo.getById('z')?.name).toBe('Changed by agent');
    expect(await repo.fetchOne('missing')).toBeNull();

    repo.forget('z');
    expect(repo.getById('z')).toBeUndefined();

    await repo.saveMany([makeDream({ id: 'm1' }), makeDream({ id: 'm2' })]);
    expect(api.files.has(dreamPath('m2'))).toBe(true);
    await repo.remove('m1');
    expect(api.files.has(dreamPath('m1'))).toBe(false);
    expect(repo.getById('m1')).toBeUndefined();
  });
});

describe('stateRepository', () => {
  it('creates state.json with defaults on first launch', async () => {
    const api = memoryApi();
    const result = await createStateRepository(api).refresh();
    expect(result).toEqual({
      existed: false,
      state: { activeDreamspaceId: null, soundEnabled: false, volume: 0.6 },
      fields: {},
    });
    expect(api.files.get('/state.json')).toEqual(result.state);
    expect(api.readFile).not.toHaveBeenCalled();
  });

  it('reads existing state (string or object) and reports present fields', async () => {
    const api = memoryApi({ '/state.json': '{"soundEnabled":true}' });
    const result = await createStateRepository(api).refresh();
    expect(result.existed).toBe(true);
    expect(result.fields).toEqual({ soundEnabled: true });
    expect(result.state.volume).toBe(0.6);
  });

  it('falls back to defaults when the file cannot be read', async () => {
    const api = memoryApi({ '/state.json': {} });
    api.readFile.mockRejectedValueOnce(new Error('io'));
    const result = await createStateRepository(api).refresh();
    expect(result).toMatchObject({ existed: true, fields: {} });
  });

  it('saves state', async () => {
    const api = memoryApi();
    const state = { activeDreamspaceId: 'a', soundEnabled: true, volume: 0.3 };
    await createStateRepository(api).save(state);
    expect(api.files.get('/state.json')).toEqual(state);
  });
});
