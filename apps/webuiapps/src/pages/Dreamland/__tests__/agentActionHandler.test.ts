import { describe, it, expect } from 'vitest';
import { createAgentActionHandler } from '../actions/agentActionHandler';
import { dreamPath } from '../repositories/dreamspaceRepository';
import { dreamFile, makeDream, setupController } from './helpers';

async function ready() {
  const ctx = setupController({
    ...dreamFile(makeDream({ id: 'a', updatedAt: 9 })),
    ...dreamFile(makeDream({ id: 'b', updatedAt: 1 })),
    '/state.json': { activeDreamspaceId: 'a' },
  });
  await ctx.controller.init();
  ctx.report.mockClear();
  const handle = createAgentActionHandler(ctx.controller);
  const run = (action_type: string, params?: Record<string, string>) =>
    handle({ app_id: 15, action_type, params });
  return { ...ctx, run };
}

const saved = (api: { files: Map<string, unknown> }, id: string) =>
  api.files.get(dreamPath(id)) as Record<string, unknown>;

describe('agent operations', () => {
  it('sets enum fields on the active dream, saves immediately and never reports', async () => {
    const { run, api, controller, report } = await ready();
    expect(await run('SET_WEATHER', { weather: 'Snowy' })).toBe('success');
    expect(await run('SET_TIME_OF_DAY', { timeOfDay: 'night' })).toBe('success');
    expect(await run('SET_MOOD', { mood: 'mystical' })).toBe('success');
    expect(await run('SET_AMBIENT_SOUND', { sound: 'waves' })).toBe('success');
    expect(await run('SET_EXPRESSION', { expression: 'sad' })).toBe('success');
    expect(saved(api, 'a')).toMatchObject({
      weather: 'snow',
      timeOfDay: 'night',
      mood: 'mystical',
      ambientSound: 'ocean',
      expression: 'depressing',
    });
    expect(controller.getSnapshot().active?.weather).toBe('snow');
    expect(report).not.toHaveBeenCalled();
  });

  it('rejects invalid values with the allowed list', async () => {
    const { run } = await ready();
    expect(await run('SET_WEATHER', { weather: 'lava' })).toBe(
      'error: invalid weather "lava", use one of: clear, rain, snow, fog, fireflies, stars, petals',
    );
    expect(await run('SET_MOOD', {})).toMatch(/invalid mood ""/);
  });

  it('targets another dream by id and refreshes once for unknown ids', async () => {
    const { run, api } = await ready();
    expect(await run('SET_EXPRESSION', { expression: 'angry', dreamspaceId: 'b' })).toBe('success');
    expect(saved(api, 'b').expression).toBe('angry');

    api.files.set(dreamPath('late'), makeDream({ id: 'late' }));
    expect(await run('SET_WEATHER', { weather: 'rain', dreamspaceId: 'late' })).toBe('success');
    expect(saved(api, 'late').weather).toBe('rain');

    expect(await run('SET_WEATHER', { weather: 'rain', dreamspaceId: 'ghost' })).toBe(
      'error: dreamspace "ghost" not found',
    );
  });

  it('sets and clears the caption', async () => {
    const { run, api } = await ready();
    expect(await run('SET_CAPTION', { text: '  Look at the stars  ' })).toBe('success');
    expect(saved(api, 'a').caption).toBe('Look at the stars');
    expect(await run('SET_CAPTION', {})).toBe('success');
    expect(saved(api, 'a').caption).toBe('');
  });

  it('sets the scene and paints a background unless regenerate=false', async () => {
    const { run, api, generator, controller } = await ready();
    expect(await run('SET_SCENE', {})).toBe('error: missing prompt');
    expect(await run('SET_SCENE', { prompt: 'A glass forest', regenerate: 'FALSE' })).toBe(
      'success',
    );
    expect(saved(api, 'a').scenePrompt).toBe('A glass forest');
    expect(generator.generate).not.toHaveBeenCalled();

    expect(await run('SET_SCENE', { prompt: 'A coral city' })).toMatch(/^success: painting/);
    await controller.idle();
    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({ scenePrompt: 'A coral city' }),
    );
    expect(saved(api, 'a').backgroundUrl).toBe('/api/session-data?path=x.jpg');
    expect(await run('SET_SCENE', { prompt: 'x', dreamspaceId: 'ghost' })).toMatch(/not found/);
  });

  it('regenerates backgrounds', async () => {
    const { run, generator } = await ready();
    expect(await run('REGENERATE_BACKGROUND')).toMatch(/^success: painting/);
    generator.isAvailable.mockResolvedValueOnce(false);
    expect(await run('REGENERATE_BACKGROUND', { dreamspaceId: 'b' })).toMatch(/not configured/);
    expect(await run('REGENERATE_BACKGROUND', { dreamspaceId: 'ghost' })).toMatch(/not found/);
  });

  it('switches dreams', async () => {
    const { run, controller } = await ready();
    expect(await run('SWITCH_DREAMSPACE')).toBe('error: missing dreamspaceId');
    expect(await run('SWITCH_DREAMSPACE', { dreamspaceId: 'b' })).toBe('success');
    expect(controller.getSnapshot().active?.id).toBe('b');
    expect(await run('SWITCH_DREAMSPACE', { dreamspaceId: 'ghost' })).toMatch(/not found/);
  });

  it('reports a missing dream when there are none', async () => {
    const ctx = setupController({ '/state.json': {} });
    await ctx.controller.init();
    const handle = createAgentActionHandler(ctx.controller);
    expect(
      await handle({ app_id: 15, action_type: 'SET_WEATHER', params: { weather: 'rain' } }),
    ).toBe('error: there is no dream yet');
  });
});

describe('agent mutations, refresh and system', () => {
  it('creates dreams from a written file (filePath or id) and switches to them', async () => {
    const { run, api, controller } = await ready();
    expect(await run('CREATE_DREAMSPACE')).toMatch(/missing filePath/);
    api.files.set(dreamPath('n1'), makeDream({ id: 'n1', name: 'Agent dream' }));
    expect(await run('CREATE_DREAMSPACE', { filePath: '/dreamspaces/n1.json' })).toBe('success');
    expect(controller.getSnapshot().active?.name).toBe('Agent dream');
    expect(await run('CREATE_DREAMSPACE', { dreamspaceId: 'ghost' })).toBe(
      'error: could not read /dreamspaces/ghost.json',
    );
  });

  it('updates dreams without switching', async () => {
    const { run, api, controller } = await ready();
    api.files.set(dreamPath('b'), makeDream({ id: 'b', name: 'Renamed', updatedAt: 1 }));
    expect(await run('UPDATE_DREAMSPACE', { filePath: '/dreamspaces/b.json' })).toBe('success');
    expect(controller.getSnapshot().dreams.find((d) => d.id === 'b')?.name).toBe('Renamed');
    expect(controller.getSnapshot().active?.id).toBe('a');
  });

  it('removes deleted dreams', async () => {
    const { run, api, controller } = await ready();
    expect(await run('DELETE_DREAMSPACE')).toBe('error: missing dreamspaceId');
    api.files.delete(dreamPath('a'));
    expect(await run('DELETE_DREAMSPACE', { dreamspaceId: 'a' })).toBe('success');
    expect(controller.getSnapshot().active?.id).toBe('b');
    expect(await run('DELETE_DREAMSPACE', { filePath: '/dreamspaces/b.json' })).toBe('success');
    expect(controller.getSnapshot().active).toBeNull();
  });

  it('refreshes all dreams with an optional focus', async () => {
    const { run, api, controller } = await ready();
    api.files.set(dreamPath('r'), makeDream({ id: 'r', updatedAt: 0 }));
    expect(await run('REFRESH_DREAMSPACES', { focusId: ' r ' })).toBe('success');
    expect(controller.getSnapshot().active?.id).toBe('r');
    expect(await run('REFRESH_DREAMSPACES')).toBe('success');
  });

  it('syncs state.json', async () => {
    const { run, api, controller } = await ready();
    api.files.set('/state.json', { activeDreamspaceId: 'b', soundEnabled: true });
    expect(await run('SYNC_STATE')).toBe('success');
    expect(controller.getSnapshot()).toMatchObject({ soundEnabled: true });
    expect(controller.getSnapshot().active?.id).toBe('b');
  });

  it('rejects unknown actions and turns exceptions into error results', async () => {
    const { run, api } = await ready();
    expect(await run('DANCE')).toBe('error: unknown action_type DANCE');
    const handle = createAgentActionHandler((await ready()).controller);
    expect(await handle({ app_id: 15 })).toBe('error: unknown action_type ');
    api.listFiles.mockRejectedValueOnce(new Error('offline'));
    expect(await run('REFRESH_DREAMSPACES')).toBe('error: offline');
    api.listFiles.mockRejectedValueOnce('weird');
    expect(await run('REFRESH_DREAMSPACES')).toBe('error: weird');
  });
});
