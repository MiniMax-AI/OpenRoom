/**
 * Ambient soundscapes synthesized with the Web Audio API (no audio files).
 *
 * Safari only allows audio that starts from a user gesture: call unlock() from
 * a click/tap handler before anything can play.
 */

import type { AmbientSound } from '../types';

export type NoiseColor = 'white' | 'pink' | 'brown';

/** Fill a buffer with noise. Exported for tests; rand is injectable. */
export function fillNoise(data: Float32Array, color: NoiseColor, rand: () => number = Math.random) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = rand() * 2 - 1;
    if (color === 'white') {
      data[i] = white * 0.5;
    } else if (color === 'pink') {
      // Paul Kellet's economy pink filter
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
    } else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

interface Voice {
  gain: GainNode;
  stop: () => void;
}

const FADE_S = 1.2;

export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voice: Voice | null = null;
  private noise = new Map<NoiseColor, AudioBuffer>();
  private sound: AmbientSound = 'none';
  private enabled = false;
  private volume = 0.6;

  static isSupported(): boolean {
    return getAudioContextCtor() !== null;
  }

  /** True once an AudioContext exists (created inside a user gesture). */
  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** Create/resume the AudioContext. Must run inside a user gesture on Safari. */
  unlock(): void {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.apply();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.apply();
  }

  setSound(sound: AmbientSound): void {
    if (sound === this.sound) return;
    this.sound = sound;
    this.stopVoice();
    this.apply();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
    }
  }

  dispose(): void {
    this.stopVoice();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.noise.clear();
  }

  private apply(): void {
    if (!this.ctx || !this.master) return;
    const shouldPlay = this.enabled && this.sound !== 'none';
    if (!shouldPlay) {
      this.stopVoice();
      return;
    }
    if (!this.voice) this.voice = this.startVoice(this.sound);
  }

  private stopVoice(): void {
    const voice = this.voice;
    if (!voice || !this.ctx) {
      this.voice = null;
      return;
    }
    this.voice = null;
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + FADE_S);
    setTimeout(voice.stop, FADE_S * 1000 + 100);
  }

  private noiseBuffer(color: NoiseColor): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    let buffer = this.noise.get(color);
    if (!buffer) {
      buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      fillNoise(buffer.getChannelData(0), color);
      this.noise.set(color, buffer);
    }
    return buffer;
  }

  private startVoice(sound: AmbientSound): Voice {
    const ctx = this.ctx as AudioContext;
    const out = ctx.createGain();
    out.connect(this.master as GainNode);
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_S);

    const sources: AudioScheduledSourceNode[] = [];
    const timers: ReturnType<typeof setInterval>[] = [];

    const noise = (color: NoiseColor) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(color);
      src.loop = true;
      sources.push(src);
      return src;
    };
    const filter = (type: BiquadFilterType, frequency: number, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = q;
      return f;
    };
    const gain = (value: number) => {
      const g = ctx.createGain();
      g.gain.value = value;
      return g;
    };
    /** Slow sine modulation of an AudioParam around its current value. */
    const lfo = (param: AudioParam, rate: number, depth: number) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = rate;
      const amount = gain(depth);
      osc.connect(amount).connect(param);
      sources.push(osc);
    };
    const chain = (...nodes: AudioNode[]) => {
      for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
      nodes[nodes.length - 1].connect(out);
    };

    switch (sound) {
      case 'rain': {
        chain(noise('pink'), filter('highpass', 500), filter('lowpass', 7000), gain(0.55));
        chain(noise('brown'), filter('lowpass', 300), gain(0.18));
        break;
      }
      case 'wind': {
        const band = filter('bandpass', 500, 0.8);
        const level = gain(0.45);
        chain(noise('brown'), band, level);
        lfo(band.frequency, 0.07, 300);
        lfo(level.gain, 0.11, 0.25);
        break;
      }
      case 'ocean': {
        const level = gain(0.45);
        chain(noise('brown'), filter('lowpass', 900), level);
        lfo(level.gain, 0.09, 0.35);
        break;
      }
      case 'night': {
        chain(noise('brown'), filter('lowpass', 400), gain(0.12));
        const cricket = ctx.createOscillator();
        cricket.frequency.value = 4400;
        const chirp = gain(0);
        cricket.connect(chirp).connect(out);
        sources.push(cricket);
        const chirpOnce = () => {
          const t = ctx.currentTime + 0.05;
          for (let i = 0; i < 3; i++) {
            const start = t + i * 0.09;
            chirp.gain.setValueAtTime(0, start);
            chirp.gain.linearRampToValueAtTime(0.035, start + 0.015);
            chirp.gain.linearRampToValueAtTime(0, start + 0.05);
          }
        };
        timers.push(setInterval(() => (Math.random() < 0.75 ? chirpOnce() : undefined), 1400));
        break;
      }
      case 'drone': {
        const lp = filter('lowpass', 900);
        const level = gain(0.16);
        lp.connect(level).connect(out);
        for (const [freq, type] of [
          [110, 'sine'],
          [164.81, 'sine'],
          [220.5, 'triangle'],
        ] as const) {
          const osc = ctx.createOscillator();
          osc.type = type;
          osc.frequency.value = freq;
          osc.connect(lp);
          sources.push(osc);
        }
        lfo(lp.frequency, 0.05, 400);
        break;
      }
      default:
        break;
    }

    sources.forEach((s) => s.start());
    return {
      gain: out,
      stop: () => {
        timers.forEach(clearInterval);
        sources.forEach((s) => {
          try {
            s.stop();
          } catch {
            // already stopped
          }
        });
        out.disconnect();
      },
    };
  }
}
