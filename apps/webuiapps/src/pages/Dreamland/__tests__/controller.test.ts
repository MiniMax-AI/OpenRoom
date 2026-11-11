import { describe, it, expect, vi, afterEach } from 'vitest';
import { dreamPath } from '../repositories/dreamspaceRepository';
import { dreamFile, makeDream, setupController } from './helpers';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.useRealTimers();
});

describe('DreamlandController init', () => {
  it('seeds starter dreams on first launch and checks image generation', async () => {
    const seeds = [
      makeDream({ id: 's1', updatedAt: 2 }),
      makeDream({ id: 's2', updatedAt: 1 }),
      'bad',
    ];
    const { controller, api, generator } = setupController({}, { seeds });
    await controller.init();
    const snap = controller.getSnapshot();
    expect(snap.dreams.map((d) => d.id)).toEqual(['s1', 's2']);
    expect(snap.active?.id).toBe('s1');
    expect(snap.loading).toBe(false);
    expect(snap.imageGenAvailable).toBe(true);
    expect(api.files.has(dreamPath('s1'))).toBe(true);
    expect(generator.isAvailable).toHaveBeenCalled();
  });

  it('does not reseed when state.json exists but all dreams were deleted', async () => {
    const { controller } = setupController({ '/state.json': {} }, { seeds: [makeDream()] });
    await controller.init();
    expect(controller.getSnapshot().dreams).toEqual([]);
    expect(controller.getSnapshot().active).toBeNull();
  });

  it('restores the active dream and sound preferences', async () => {
    const { controller, audio } = setupController({
      ...dreamFile(makeDream({ id: 'a', updatedAt: 9 })),
      ...dreamFile(makeDream({ id: 'b', updatedAt: 1, ambientSound: 'ocean' })),
      '/state.json': { activeDreamspaceId: 'b', soundEnabled: true, volume: 0.3 },
    });
    await controller.init();
    const snap = controller.getSnapshot();
    expect(snap.active?.id).toBe('b');
    expect(snap.soundEnabled).toBe(true);
    expect(snap.volume).toBe(0.3);
    expect(audio.calls.volume).toContain(0.3);
    expect(audio.calls.sound.at(-1)).toBe('ocean');
    expect(audio.calls.enabled.at(-1)).toBe(true);
  });

  it('shows an error state when loading fails', async () => {
    const { controller, api } = setupController();
    api.listFiles.mockRejectedValue(new Error('offline'));
    await controller.init();
    const snap = controller.getSnapshot();
    expect(snap.loadError).toBe(true);
    expect(snap.loading).toBe(false);
    expect(snap.toast).toMatchObject({ message: 'toast.loadFailed', error: true });
  });

  it('treats a failing availability check as unavailable', async () => {
    const { controller, generator } = setupController({ '/state.json': {} });
    generator.isAvailable.mockRejectedValue(new Error('x'));
    await controller.init();
    expect(controller.getSnapshot().imageGenAvailable).toBe(false);
  });
});

describe('DreamlandController user operations', () => {
  async function ready(extra: Record<string, unknown> = {}) {
    const ctx = setupController({
      ...dreamFile(makeDream({ id: 'a', updatedAt: 9 })),
      ...dreamFile(makeDream({ id: 'b', updatedAt: 1 })),
      '/state.json': { activeDreamspaceId: 'a' },
      ...extra,
    });
    await ctx.controller.init();
    ctx.report.mockClear();
    return ctx;
  }

  it('applies edits live, autosaves after a delay and reports each change', async () => {
    const { controller, api, report } = await ready();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.updateDream('a', { weather: 'rain', expression: 'shy', caption: 'hi' });
    expect(controller.getSnapshot().active).toMatchObject({ weather: 'rain', expression: 'shy' });
    expect(listener).toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith('SET_WEATHER', { dreamspaceId: 'a', weather: 'rain' });
    expect(report).toHaveBeenCalledWith('SET_EXPRESSION', { dreamspaceId: 'a', expression: 'shy' });
    expect(report).toHaveBeenCalledWith('SET_CAPTION', { dreamspaceId: 'a', text: 'hi' });
    expect((api.files.get(dreamPath('a')) as { weather: string }).weather).toBe('clear');
    await wait(20);
    expect((api.files.get(dreamPath('a')) as { weather: string }).weather).toBe('rain');
    unsubscribe();
    expect(controller.updateDream('missing', { weather: 'rain' })).toBeNull();
  });

  it('reports clearing the background image', async () => {
    const { controller, report } = await ready();
    controller.updateDream('a', { backgroundUrl: null });
    expect(report).toHaveBeenCalledWith('UPDATE_DREAMSPACE', {
      dreamspaceId: 'a',
      backgroundUrl: '',
    });
  });

  it('does not report agent-originated edits', async () => {
    const { controller, report } = await ready();
    controller.updateDream('a', { mood: 'warm' }, { fromAgent: true });
    expect(report).not.toHaveBeenCalled();
  });

  it('edits text without reporting per keystroke, then reports on commit', async () => {
    const { controller, report } = await ready();
    controller.editText('a', 'name', 'x'.repeat(80));
    controller.editText('a', 'scenePrompt', 'A cave');
    expect(controller.getSnapshot().active?.name).toHaveLength(60);
    expect(report).not.toHaveBeenCalled();
    controller.commitText('a', 'name');
    controller.commitText('a', 'scenePrompt');
    controller.commitText('missing', 'name');
    expect(report).toHaveBeenCalledWith('RENAME_DREAMSPACE', {
      dreamspaceId: 'a',
      name: 'x'.repeat(60),
    });
    expect(report).toHaveBeenCalledWith('SET_SCENE', {
      dreamspaceId: 'a',
      prompt: 'A cave',
      regenerate: 'false',
    });
  });

  it('switches dreams and persists the active id in state.json', async () => {
    const { controller, api, report } = await ready();
    expect(controller.switchDream('b')).toBe(true);
    expect(controller.switchDream('missing')).toBe(false);
    expect(report).toHaveBeenCalledWith('SWITCH_DREAMSPACE', { dreamspaceId: 'b' });
    await wait(20);
    expect(api.files.get('/state.json')).toMatchObject({ activeDreamspaceId: 'b' });
    controller.switchDream('a', true);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('creates and deletes dreams', async () => {
    const { controller, api, report } = await ready();
    const created = await controller.createDream();
    expect(created.id).toBe('new-1');
    expect(created.name).toBe('library.newDreamName');
    expect(controller.getSnapshot().active?.id).toBe('new-1');
    expect(api.files.has(dreamPath('new-1'))).toBe(true);
    expect(report).toHaveBeenCalledWith('CREATE_DREAMSPACE', {
      dreamspaceId: 'new-1',
      name: 'library.newDreamName',
    });
    expect(controller.getSnapshot().toast?.message).toBe('toast.created');

    controller.updateDream('new-1', { weather: 'snow' });
    await controller.deleteDream('new-1');
    expect(api.files.has(dreamPath('new-1'))).toBe(false);
    expect(controller.hasDream('new-1')).toBe(false);
    expect(report).toHaveBeenCalledWith('DELETE_DREAMSPACE', {
      dreamspaceId: 'new-1',
      name: 'library.newDreamName',
    });
    await wait(20);
    // the pending autosave was cancelled, so the file was not recreated
    expect(api.files.has(dreamPath('new-1'))).toBe(false);
    await controller.deleteDream('missing');
  });

  it('regenerates the background and saves it', async () => {
    const { controller, api, generator, report } = await ready();
    const result = await controller.regenerate('a');
    expect(result).toBe('success');
    expect(generator.generate).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(controller.getSnapshot().active?.backgroundUrl).toBe('/api/session-data?path=x.jpg');
    expect((api.files.get(dreamPath('a')) as { backgroundUrl: string }).backgroundUrl).toBe(
      '/api/session-data?path=x.jpg',
    );
    expect(report).toHaveBeenCalledWith('REGENERATE_BACKGROUND', { dreamspaceId: 'a' });
    expect(controller.getSnapshot().generatingIds).toEqual([]);
    expect(controller.getSnapshot().toast?.message).toBe('toast.generated');
  });

  it('waits for a running paint, then paints again; refuses unknown dreams or no image generation', async () => {
    const { controller, generator } = await ready();
    let release: (v: string) => void = () => {};
    generator.generate.mockImplementationOnce(() => new Promise<string>((r) => (release = r)));
    const first = controller.regenerate('a');
    await wait(0);
    expect(controller.getSnapshot().generatingIds).toEqual(['a']);
    const second = controller.regenerate('a');
    await wait(0);
    expect(generator.generate).toHaveBeenCalledTimes(1);
    release('https://x.test/new.jpg');
    expect(await first).toBe('success');
    expect(await second).toBe('success');
    expect(generator.generate).toHaveBeenCalledTimes(2);

    expect(await controller.regenerate('missing')).toBe('error: dreamspace not found');

    generator.isAvailable.mockResolvedValueOnce(false);
    expect(await controller.regenerate('a')).toMatch(/not configured/);
    expect(controller.getSnapshot().toast).toMatchObject({ error: true });
  });

  it('answers the Agent right away and paints in the background', async () => {
    const { controller, generator, report } = await ready();
    let release: (v: string) => void = () => {};
    generator.generate.mockImplementationOnce(() => new Promise<string>((r) => (release = r)));
    expect(await controller.regenerate('a', 'agent')).toMatch(/^success: painting/);
    expect(report).not.toHaveBeenCalledWith('REGENERATE_BACKGROUND', expect.anything());
    await wait(0);
    expect(controller.getSnapshot().generatingIds).toEqual(['a']);
    release('https://x.test/agent.jpg');
    await controller.idle();
    expect(controller.getSnapshot().active?.backgroundUrl).toBe('https://x.test/agent.jpg');
    expect(controller.getSnapshot().toast?.message).toBe('toast.generated');

    generator.isAvailable.mockResolvedValueOnce(false);
    expect(await controller.regenerate('a', 'agent')).toMatch(/not configured/);
  });

  it('reports generation failures and dreams deleted while generating', async () => {
    const { controller, generator } = await ready();
    generator.generate.mockRejectedValueOnce(new Error('Pollinations error 500'));
    expect(await controller.regenerate('a')).toBe('error: Pollinations error 500');
    expect(controller.getSnapshot().toast?.message).toContain('Pollinations error 500');

    generator.generate.mockRejectedValueOnce('plain failure');
    expect(await controller.regenerate('a')).toBe('error: plain failure');

    generator.generate.mockImplementationOnce(async () => {
      await controller.deleteDream('b');
      return 'https://x.test/late.jpg';
    });
    expect(await controller.regenerate('b')).toMatch(/deleted while generating/);

    // Deleted before a queued paint starts
    let release: (v: string) => void = () => {};
    generator.generate.mockImplementationOnce(() => new Promise<string>((r) => (release = r)));
    const first = controller.regenerate('a');
    await wait(0);
    const queued = controller.regenerate('a');
    await controller.deleteDream('a');
    release('https://x.test/x.jpg');
    await first;
    expect(await queued).toBe('error: dreamspace was deleted');
  });

  it('toggles sound (unlocking audio in the gesture) and sets volume', async () => {
    const { controller, audio, report } = await ready();
    controller.toggleSound();
    expect(audio.unlock).toHaveBeenCalled();
    expect(controller.getSnapshot().soundEnabled).toBe(true);
    expect(report).toHaveBeenCalledWith('TOGGLE_SOUND', { enabled: 'true' });
    controller.toggleSound();
    expect(controller.getSnapshot().soundEnabled).toBe(false);
    expect(audio.unlock).toHaveBeenCalledTimes(1);
    controller.setVolume(0.2);
    expect(audio.calls.volume.at(-1)).toBe(0.2);
    expect(controller.getSnapshot().volume).toBe(0.2);
  });

  it('unlocks audio on the first gesture when sound was on from a previous visit', async () => {
    const { controller, audio } = await ready({
      '/state.json': { activeDreamspaceId: 'a', soundEnabled: true },
    });
    controller.unlockAudioIfNeeded();
    expect(audio.unlock).toHaveBeenCalledTimes(1);
    controller.unlockAudioIfNeeded();
    expect(audio.unlock).toHaveBeenCalledTimes(1);
  });

  it('reports pokes on the avatar', async () => {
    const { controller, report } = await ready();
    controller.pokeAvatar();
    expect(report).toHaveBeenCalledWith('POKE_AVATAR', { dreamspaceId: 'a', expression: 'happy' });
  });

  it('flushes pending saves and state, and hides toasts after a while', async () => {
    const { controller, api } = await ready();
    controller.updateDream('a', { mood: 'warm' });
    controller.switchDream('b');
    await controller.flush();
    expect((api.files.get(dreamPath('a')) as { mood: string }).mood).toBe('warm');
    expect(api.files.get('/state.json')).toMatchObject({ activeDreamspaceId: 'b' });
    controller.showToast('hello');
    controller.showToast('again');
    expect(controller.getSnapshot().toast?.message).toBe('again');
    await wait(80);
    expect(controller.getSnapshot().toast).toBeNull();
    controller.dispose();
  });

  it('ignores state save failures', async () => {
    const { controller, api } = await ready();
    api.writeFile.mockRejectedValue(new Error('disk full'));
    controller.switchDream('b');
    await expect(controller.flush()).resolves.toBeUndefined();
    expect(api.writeFile).toHaveBeenCalledWith('/state.json', expect.anything());
  });
});

describe('DreamlandController agent sync', () => {
  async function ready() {
    const ctx = setupController({
      ...dreamFile(makeDream({ id: 'a', updatedAt: 9 })),
      '/state.json': { activeDreamspaceId: 'a' },
    });
    await ctx.controller.init();
    return ctx;
  }

  it('syncs dreams written by the agent and removes deleted ones', async () => {
    const { controller, api } = await ready();
    api.files.set(dreamPath('n'), makeDream({ id: 'n', name: 'From agent', updatedAt: 99 }));
    expect((await controller.syncDream('n'))?.name).toBe('From agent');
    expect(controller.hasDream('n')).toBe(true);
    expect(await controller.syncDream('ghost')).toBeNull();

    controller.updateDream('n', { mood: 'warm' }, { fromAgent: true });
    expect(controller.removeLocal('n')).toBe(true);
    expect(controller.removeLocal('n')).toBe(false);
  });

  it('refreshes all dreams and focuses one', async () => {
    const { controller, api } = await ready();
    api.files.set(dreamPath('f'), makeDream({ id: 'f', updatedAt: 1 }));
    await controller.refreshAll('f');
    expect(controller.getSnapshot().active?.id).toBe('f');
    await controller.refreshAll('nope');
    expect(controller.getSnapshot().active?.id).toBe('f');
  });

  it('applies state.json written by the agent', async () => {
    const { controller, api, audio } = await ready();
    api.files.set(dreamPath('b'), makeDream({ id: 'b' }));
    await controller.refreshAll();
    api.files.set('/state.json', { activeDreamspaceId: 'b', volume: 0.1 });
    await controller.syncState();
    expect(controller.getSnapshot()).toMatchObject({ volume: 0.1, soundEnabled: false });
    expect(controller.getSnapshot().active?.id).toBe('b');
    expect(audio.calls.volume.at(-1)).toBe(0.1);
    api.files.set('/state.json', { soundEnabled: true });
    await controller.syncState();
    expect(controller.getSnapshot()).toMatchObject({ volume: 0.1, soundEnabled: true });
  });
});
