import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AmbientAudio, fillNoise } from '../services/ambientAudio';
import { makeDream } from './helpers';

// ---------------------------------------------------------------- fake Web Audio

class FakeParam {
  value = 0;
  events: string[] = [];
  setValueAtTime(v: number) {
    this.value = v;
    this.events.push('set');
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    this.events.push('ramp');
  }
  setTargetAtTime(v: number) {
    this.value = v;
    this.events.push('target');
  }
  cancelScheduledValues() {
    this.events.push('cancel');
  }
}

class FakeNode {
  connections: unknown[] = [];
  connect(node: unknown) {
    this.connections.push(node);
    return node;
  }
  disconnect = vi.fn();
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeSource extends FakeNode {
  started = false;
  stopped = false;
  frequency = new FakeParam();
  type = 'sine';
  buffer: unknown = null;
  loop = false;
  start() {
    this.started = true;
  }
  stop() {
    if (this.stopped) throw new Error('already stopped');
    this.stopped = true;
  }
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam();
  Q = new FakeParam();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate = 100;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => undefined);
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createOscillator() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createBiquadFilter() {
    return new FakeFilter();
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
}

function install(ctor: unknown, key: 'AudioContext' | 'webkitAudioContext' = 'AudioContext') {
  Object.defineProperty(window, key, { value: ctor, configurable: true, writable: true });
}

function uninstall() {
  delete (window as unknown as Record<string, unknown>).AudioContext;
  delete (window as unknown as Record<string, unknown>).webkitAudioContext;
}

describe('fillNoise', () => {
  it('fills white, pink and brown noise within range', () => {
    let x = 0;
    const rand = () => (x = (x * 9301 + 49297) % 233280) / 233280;
    for (const color of ['white', 'pink', 'brown'] as const) {
      const data = new Float32Array(2000);
      fillNoise(data, color, rand);
      expect(data.some((v) => v !== 0)).toBe(true);
      expect(Math.max(...data.map(Math.abs))).toBeLessThan(2);
    }
    const d = new Float32Array(4);
    fillNoise(d, 'white');
    expect(d.every((v) => Math.abs(v) <= 0.5)).toBe(true);
  });
});

describe('AmbientAudio', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudioContext.instances = [];
    uninstall();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstall();
  });

  it('is a no-op without Web Audio support', () => {
    expect(AmbientAudio.isSupported()).toBe(false);
    const audio = new AmbientAudio();
    audio.unlock();
    audio.setEnabled(true);
    audio.setSound('rain');
    audio.setVolume(2);
    expect(audio.unlocked).toBe(false);
    audio.dispose();
  });

  it('plays nothing until unlocked, then starts the selected sound', () => {
    install(FakeAudioContext);
    expect(AmbientAudio.isSupported()).toBe(true);
    const audio = new AmbientAudio();
    audio.setSound('rain');
    audio.setEnabled(true);
    expect(FakeAudioContext.instances).toHaveLength(0);

    audio.unlock();
    const ctx = FakeAudioContext.instances[0];
    expect(audio.unlocked).toBe(true);
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.sources.length).toBeGreaterThan(0);
    expect(ctx.sources.every((s) => s.started)).toBe(true);
    audio.unlock(); // second unlock reuses the context
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('builds every soundscape and cross-fades when switching', () => {
    install(FakeAudioContext);
    const audio = new AmbientAudio();
    audio.setEnabled(true);
    audio.unlock();
    const ctx = FakeAudioContext.instances[0];
    for (const sound of ['rain', 'wind', 'ocean', 'night', 'drone'] as const) {
      const before = ctx.sources.length;
      audio.setSound(sound);
      expect(ctx.sources.length).toBeGreaterThan(before);
    }
    audio.setSound('drone'); // same sound: nothing new
    const count = ctx.sources.length;
    audio.setSound('drone');
    expect(ctx.sources.length).toBe(count);

    // night crickets chirp on a timer
    audio.setSound('night');
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    vi.advanceTimersByTime(3000);
    random.mockRestore();

    // old voices are stopped after the fade
    vi.advanceTimersByTime(2000);
    expect(ctx.sources.filter((s) => s.stopped).length).toBeGreaterThan(0);
  });

  it('stops when disabled or set to none, and handles volume and dispose', () => {
    install(FakeAudioContext, 'webkitAudioContext');
    const audio = new AmbientAudio();
    audio.setSound('ocean');
    audio.setEnabled(true);
    audio.unlock();
    const ctx = FakeAudioContext.instances[0];
    audio.setEnabled(false);
    vi.advanceTimersByTime(2000);
    expect(ctx.sources.every((s) => s.stopped)).toBe(true);

    audio.setEnabled(true);
    audio.setSound('none');
    audio.setEnabled(false); // stopping with no voice is fine

    audio.setVolume(0.25);
    expect(ctx.gains[0].gain.value).toBe(0.25);
    audio.setSound('wind');
    audio.setEnabled(true);
    audio.dispose();
    expect(ctx.close).toHaveBeenCalled();
    expect(audio.unlocked).toBe(false);
    vi.advanceTimersByTime(2000); // stopping already-stopped sources must not throw
  });
});

describe('backgroundGenerator', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/lib');
  });

  async function load(stored: { url: string; dataUrl: string }) {
    vi.doMock('@/lib', () => ({
      generateImageFile: vi.fn(async () => ({ ...stored, mimeType: 'image/jpeg', filePath: 'x' })),
      isImageGenAvailable: vi.fn(async () => true),
    }));
    const mod = await import('../services/backgroundGenerator');
    const lib = await import('@/lib');
    return { ...mod, lib };
  }

  it('generates with the built prompt into the app images folder', async () => {
    const { backgroundGenerator, lib } = await load({
      url: '/api/session-data?path=a',
      dataUrl: 'data:x',
    });
    const OriginalImage = globalThis.Image;
    globalThis.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    } as unknown as typeof Image;
    const url = await backgroundGenerator.generate(makeDream({ id: 'd9', scenePrompt: 'A reef' }));
    globalThis.Image = OriginalImage;
    expect(url).toBe('/api/session-data?path=a');
    const [prompt, basePath] = (lib.generateImageFile as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prompt).toMatch(/^A reef, in bright daylight/);
    expect(basePath).toMatch(/^dreamland\/data\/images\/d9-\d+$/);
    expect(await backgroundGenerator.isAvailable()).toBe(true);
  });

  it('falls back to the inline image when the saved file cannot load', async () => {
    const { backgroundGenerator } = await load({
      url: '/api/broken',
      dataUrl: 'data:image/jpeg;base64,AA',
    });
    const OriginalImage = globalThis.Image;
    globalThis.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    } as unknown as typeof Image;
    expect(await backgroundGenerator.generate(makeDream())).toBe('data:image/jpeg;base64,AA');
    globalThis.Image = OriginalImage;
  });

  it('preloadImage times out', async () => {
    const { preloadImage } = await load({ url: 'u', dataUrl: 'd' });
    const OriginalImage = globalThis.Image;
    globalThis.Image = class {
      set src(_v: string) {}
    } as unknown as typeof Image;
    await expect(preloadImage('x', 5)).rejects.toThrow('timed out');
    globalThis.Image = OriginalImage;
  });
});
