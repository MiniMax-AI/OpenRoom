import { describe, it, expect } from 'vitest';
import { dreamPath } from '../repositories/dreamspaceRepository';
import { ModelFileError } from '../services/avatarModelStore';
import { dreamFile, fakeMotion, makeDream, setupController } from './helpers';

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const file = (name = 'Aoi.vrm', size = 2048) => ({ name, size }) as unknown as File;

describe('automatic painting', () => {
  it('paints the active dream once when it has no picture', async () => {
    const { controller, generator, report } = setupController({
      ...dreamFile(makeDream({ id: 'a', autoBackground: true, updatedAt: 9 })),
      ...dreamFile(makeDream({ id: 'b', autoBackground: true, updatedAt: 1 })),
    });
    await controller.init();
    await wait();
    await controller.idle();
    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().active?.backgroundUrl).toBe('/api/session-data?path=x.jpg');
    // quiet: no toast and nothing reported to the Agent
    expect(controller.getSnapshot().toast).toBeNull();
    expect(report).not.toHaveBeenCalledWith('REGENERATE_BACKGROUND', expect.anything());

    // switching to another dream without a picture paints that one too
    controller.switchDream('b');
    await wait();
    await controller.idle();
    expect(generator.generate).toHaveBeenCalledTimes(2);

    // nothing more: both have pictures now
    controller.switchDream('a');
    await wait();
    expect(generator.generate).toHaveBeenCalledTimes(2);
  });

  it('never retries a failed automatic paint in the same visit', async () => {
    const { controller, generator } = setupController(
      dreamFile(makeDream({ id: 'a', autoBackground: true })),
    );
    generator.generate.mockRejectedValueOnce(new Error('offline'));
    await controller.init();
    await wait();
    await controller.idle();
    expect(controller.getSnapshot().toast).toMatchObject({ error: true });
    controller.switchDream('a');
    controller.showToast('poke');
    await wait();
    expect(generator.generate).toHaveBeenCalledTimes(1);
  });

  it('skips dreams that use the painted sky, and works without image generation', async () => {
    const { controller, generator } = setupController(
      dreamFile(makeDream({ id: 'a', autoBackground: false })),
    );
    await controller.init();
    await wait();
    expect(generator.generate).not.toHaveBeenCalled();

    const off = setupController(dreamFile(makeDream({ id: 'a', autoBackground: true })));
    off.generator.isAvailable.mockResolvedValue(false);
    await off.controller.init();
    await wait();
    expect(off.generator.generate).not.toHaveBeenCalled();
    // and an auto paint without image generation stays quiet
    expect(await off.controller.regenerate('a', 'auto')).toMatch(/not configured/);
    expect(off.controller.getSnapshot().toast).toBeNull();
  });

  it('a manual paint during an automatic one waits for it', async () => {
    const { controller, generator } = setupController(
      dreamFile(makeDream({ id: 'a', autoBackground: true })),
    );
    let release: (v: string) => void = () => {};
    generator.generate.mockImplementationOnce(() => new Promise<string>((r) => (release = r)));
    await controller.init();
    await wait();
    expect(generator.generate).toHaveBeenCalledTimes(1);
    // a second auto request joins the running one
    const joined = controller.regenerate('a', 'auto');
    const manual = controller.regenerate('a');
    release('https://x.test/auto.jpg');
    expect(await joined).toBe('success');
    expect(await manual).toBe('success');
    expect(generator.generate).toHaveBeenCalledTimes(2);
  });

  it('usePaintedSky clears the picture and stops automatic painting', async () => {
    const { controller, api, report } = setupController(
      dreamFile(makeDream({ id: 'a', backgroundUrl: 'https://x.test/a.jpg' })),
    );
    await controller.init();
    controller.usePaintedSky('a');
    await controller.saveNow('a');
    expect(api.files.get(dreamPath('a'))).toMatchObject({
      backgroundUrl: null,
      autoBackground: false,
    });
    expect(report).toHaveBeenCalledWith('UPDATE_DREAMSPACE', {
      dreamspaceId: 'a',
      backgroundUrl: '',
    });
  });
});

describe('3D companion', () => {
  it('uploads a model, saves it in state.json and shows it', async () => {
    const { controller, api, avatarModels, report } = setupController(
      dreamFile(makeDream({ id: 'a' })),
    );
    await controller.init();
    expect(controller.getSnapshot().avatarModelUrl).toBeNull();

    const upload = controller.uploadAvatarModel(file());
    expect(controller.getSnapshot().avatarBusy).toBe(true);
    // a second upload while busy is ignored
    expect(await controller.uploadAvatarModel(file())).toBe(false);
    expect(await upload).toBe(true);

    const snap = controller.getSnapshot();
    expect(snap.avatarBusy).toBe(false);
    expect(snap.avatarModel).toMatchObject({ fileName: 'Aoi.vrm', storage: 'server' });
    expect(snap.avatarModelUrl).toBe('model://Aoi.vrm');
    expect(snap.toast?.message).toBe('companion.uploaded');
    expect(api.files.get('/state.json')).toMatchObject({
      avatarModel: { fileName: 'Aoi.vrm', storage: 'server' },
    });
    expect(report).toHaveBeenCalledWith('SET_AVATAR_MODEL', { fileName: 'Aoi.vrm' });
    expect(avatarModels.release).toHaveBeenCalled();
  });

  it('shows why an upload was refused', async () => {
    const { controller, avatarModels } = setupController();
    await controller.init();
    avatarModels.save.mockRejectedValueOnce(new ModelFileError('size', 'too big'));
    expect(await controller.uploadAvatarModel(file())).toBe(false);
    expect(controller.getSnapshot().toast).toMatchObject({
      message: 'companion.error.size',
      error: true,
    });
    avatarModels.save.mockRejectedValueOnce(new Error('disk full'));
    await controller.uploadAvatarModel(file());
    expect(controller.getSnapshot().toast?.message).toBe('companion.error.storage');
    expect(controller.getSnapshot().avatarModel).toBeNull();
  });

  it('replacing a model kept elsewhere removes the old file', async () => {
    const old = { fileName: 'old.vrm', size: 1, updatedAt: 1, storage: 'browser' as const };
    const { controller, avatarModels } = setupController({
      '/state.json': { avatarModel: old },
    });
    await controller.init();
    expect(controller.getSnapshot().avatarModelUrl).toBe('model://old.vrm');
    avatarModels.remove.mockRejectedValueOnce(new Error('gone'));
    expect(await controller.uploadAvatarModel(file('new.vrm'))).toBe(true);
    expect(avatarModels.remove).toHaveBeenCalledWith(old);
    expect(controller.getSnapshot().avatarModel?.fileName).toBe('new.vrm');
  });

  it('removes the model and goes back to the dream sprite', async () => {
    const model = { fileName: 'a.vrm', size: 1, updatedAt: 1, storage: 'server' as const };
    const { controller, api, avatarModels, report } = setupController({
      '/state.json': { avatarModel: model },
    });
    await controller.init();
    await controller.removeAvatarModel();
    expect(avatarModels.remove).toHaveBeenCalledWith(model);
    expect(controller.getSnapshot().avatarModel).toBeNull();
    expect(controller.getSnapshot().avatarModelUrl).toBeNull();
    expect(api.files.get('/state.json')).toMatchObject({ avatarModel: null });
    expect(report).toHaveBeenCalledWith('CLEAR_AVATAR_MODEL', {});
    // nothing to remove
    await controller.removeAvatarModel();
    expect(avatarModels.remove).toHaveBeenCalledTimes(1);
  });

  it('falls back when the model file is missing or cannot be shown', async () => {
    const model = { fileName: 'a.vrm', size: 1, updatedAt: 1, storage: 'browser' as const };
    const { controller, avatarModels } = setupController({ '/state.json': { avatarModel: model } });
    avatarModels.resolveUrl.mockResolvedValueOnce(null);
    await controller.init();
    expect(controller.getSnapshot().avatarModelFailed).toBe(true);

    const second = setupController({ '/state.json': { avatarModel: model } });
    second.avatarModels.resolveUrl.mockRejectedValueOnce(new Error('idb'));
    await second.controller.init();
    expect(second.controller.getSnapshot().avatarModelFailed).toBe(true);

    const third = setupController({ '/state.json': { avatarModel: model } });
    await third.controller.init();
    third.controller.avatarFailed('WebGL missing');
    third.controller.avatarFailed('again');
    const snap = third.controller.getSnapshot();
    expect(snap.avatarModelFailed).toBe(true);
    expect(snap.toast?.message).toContain('WebGL missing');
  });

  it('SYNC_STATE reloads the model only when it changed', async () => {
    const model = { fileName: 'a.vrm', size: 1, updatedAt: 1, storage: 'server' as const };
    const { controller, api, avatarModels } = setupController({
      '/state.json': { avatarModel: model },
    });
    await controller.init();
    avatarModels.resolveUrl.mockClear();
    await controller.syncState();
    expect(avatarModels.resolveUrl).not.toHaveBeenCalled();
    api.files.set('/state.json', { avatarModel: { ...model, updatedAt: 2 } });
    await controller.syncState();
    expect(avatarModels.resolveUrl).toHaveBeenCalledTimes(1);
    api.files.set('/state.json', { avatarModel: null });
    await controller.syncState();
    expect(controller.getSnapshot().avatarModelUrl).toBeNull();
  });

  it('releases object URLs on dispose', () => {
    const { controller, avatarModels } = setupController();
    controller.dispose();
    expect(avatarModels.release).toHaveBeenCalled();
  });
});

describe('tilt', () => {
  it('turns tilt on without a prompt where none is needed, and off again', async () => {
    const { controller, api } = setupController();
    await controller.init();
    expect(controller.getSnapshot().tiltActive).toBe(false);
    expect(await controller.setMotionEnabled(true)).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ motionEnabled: true, tiltActive: true });
    await controller.flush();
    expect(api.files.get('/state.json')).toMatchObject({ motionEnabled: true });
    expect(await controller.setMotionEnabled(false)).toBe(false);
    expect(controller.getSnapshot().tiltActive).toBe(false);
  });

  it('on iOS asks permission and explains a refusal', async () => {
    const motion = fakeMotion(true, false);
    const { controller } = setupController({}, { motion });
    await controller.init();
    expect(await controller.setMotionEnabled(true)).toBe(false);
    expect(motion.request).toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ motionEnabled: false, tiltActive: false });
    expect(controller.getSnapshot().toast).toMatchObject({ message: 'motion.denied', error: true });
  });

  it('on iOS asks again on the first tap after a reload', async () => {
    const motion = fakeMotion(true, true);
    const { controller } = setupController({ '/state.json': { motionEnabled: true } }, { motion });
    await controller.init();
    expect(controller.getSnapshot()).toMatchObject({ motionEnabled: true, tiltActive: false });
    controller.unlockMotionIfNeeded();
    await wait();
    expect(controller.getSnapshot().tiltActive).toBe(true);
    // granted now: no more prompts
    controller.unlockMotionIfNeeded();
    expect(motion.request).toHaveBeenCalledTimes(1);
  });

  it('does not ask when tilt is off or no permission is needed', async () => {
    const motion = fakeMotion(false);
    const { controller } = setupController({}, { motion });
    await controller.init();
    controller.unlockMotionIfNeeded();
    expect(motion.request).not.toHaveBeenCalled();
    await controller.setMotionEnabled(true);
    controller.unlockMotionIfNeeded();
    expect(motion.request).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().tiltActive).toBe(true);
  });
});
