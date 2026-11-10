import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isTtsSupported,
  pickFemaleVoice,
  textForSpeech,
  loadTtsEnabled,
  saveTtsEnabled,
  speak,
  stopSpeaking,
  unlockSpeech,
} from '../tts';

function voice(name: string, lang = 'en-US', localService = true): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name } as SpeechSynthesisVoice;
}

class FakeUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  constructor(text: string) {
    this.text = text;
  }
}

interface FakeSynth {
  voices: SpeechSynthesisVoice[];
  listeners: Array<() => void>;
  getVoices: () => SpeechSynthesisVoice[];
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

function installSynth(voices: SpeechSynthesisVoice[]): FakeSynth {
  const synth: FakeSynth = {
    voices,
    listeners: [],
    getVoices: () => synth.voices,
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: (_t, fn) => synth.listeners.push(fn),
    removeEventListener: (_t, fn) => {
      synth.listeners = synth.listeners.filter((l) => l !== fn);
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: FakeUtterance,
    configurable: true,
  });
  return synth;
}

function uninstallSynth() {
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
}

describe('pickFemaleVoice', () => {
  it('returns null for an empty list', () => {
    expect(pickFemaleVoice([])).toBeNull();
  });

  it('prefers a known female voice in the requested language', () => {
    const v = pickFemaleVoice([voice('Daniel', 'en-GB'), voice('Samantha'), voice('Fred')]);
    expect(v?.name).toBe('Samantha');
  });

  it('ranks by list order and then local voices', () => {
    const v = pickFemaleVoice([
      voice('Karen', 'en-AU'),
      voice('Microsoft Zira', 'en-US', false),
      voice('Samantha', 'en-US', false),
      voice('Samantha (Enhanced)', 'en-US', true),
    ]);
    expect(v?.name).toBe('Samantha (Enhanced)');
  });

  it('does not match a female name inside another word', () => {
    // "Avatar" must not count as "Ava"
    const v = pickFemaleVoice([voice('Avatar'), voice('Google US English')]);
    expect(v?.name).toBe('Google US English');
  });

  it('falls back to any voice in the language, then to the first voice', () => {
    expect(pickFemaleVoice([voice('Thomas', 'fr-FR'), voice('Fred', 'en-US')])?.name).toBe('Fred');
    expect(pickFemaleVoice([voice('Thomas', 'fr-FR')], 'en')?.name).toBe('Thomas');
  });

  it('matches language codes with region and underscores', () => {
    const v = pickFemaleVoice([voice('Samantha', 'en-US'), voice('Anna', 'de_DE')], 'de-AT');
    expect(v?.name).toBe('Anna');
  });
});

describe('textForSpeech', () => {
  it('removes stage directions, actions and markdown', () => {
    expect(
      textForSpeech(
        "*(leans in, voice dropping)* You noticed, *smirks* didn't you? (winks) **Yes**.",
      ),
    ).toBe("You noticed, didn't you? Yes.");
  });

  it('strips markdown symbols and collapses whitespace', () => {
    expect(textForSpeech('# Hi\n\n> `there`  _friend_')).toBe('Hi there friend');
  });

  it('returns an empty string for action-only messages', () => {
    expect(textForSpeech('(smiles)')).toBe('');
  });
});

describe('enabled preference', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to off and round-trips', () => {
    expect(loadTtsEnabled()).toBe(false);
    saveTtsEnabled(true);
    expect(loadTtsEnabled()).toBe(true);
    saveTtsEnabled(false);
    expect(loadTtsEnabled()).toBe(false);
  });

  it('survives unavailable storage', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadTtsEnabled()).toBe(false);
    expect(() => saveTtsEnabled(true)).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });
});

describe('speech (unsupported browser)', () => {
  beforeEach(uninstallSynth);

  it('reports unsupported and does nothing', async () => {
    expect(isTtsSupported()).toBe(false);
    await expect(speak('Hello')).resolves.toBeUndefined();
    expect(() => stopSpeaking()).not.toThrow();
    expect(() => unlockSpeech()).not.toThrow();
  });
});

describe('speech (supported browser)', () => {
  afterEach(() => {
    uninstallSynth();
    vi.useRealTimers();
  });

  it('speaks the cleaned text with a female voice', async () => {
    const synth = installSynth([voice('Fred'), voice('Samantha')]);
    expect(isTtsSupported()).toBe(true);
    await speak('(smiles) Hello there!');
    expect(synth.cancel).toHaveBeenCalled();
    const u = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(u.text).toBe('Hello there!');
    expect(u.voice?.name).toBe('Samantha');
    expect(u.lang).toBe('en-US');
    expect(u.pitch).toBeGreaterThan(1);
  });

  it('skips messages with nothing to say', async () => {
    const synth = installSynth([voice('Samantha')]);
    await speak('(nods)');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('waits for voices to load via voiceschanged', async () => {
    const synth = installSynth([]);
    const p = speak('Hi');
    await Promise.resolve();
    synth.voices = [voice('Samantha')];
    synth.listeners.forEach((l) => l());
    await p;
    expect((synth.speak.mock.calls[0][0] as FakeUtterance).voice?.name).toBe('Samantha');
    expect(synth.listeners).toHaveLength(0);
  });

  it('speaks with the default voice when no voices ever load', async () => {
    vi.useFakeTimers();
    const synth = installSynth([]);
    const p = speak('Hi');
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    const u = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(u.text).toBe('Hi');
    expect(u.voice).toBeNull();
  });

  it('stops speaking and unlocks with a silent utterance', () => {
    const synth = installSynth([voice('Samantha')]);
    stopSpeaking();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    unlockSpeech();
    const u = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(u.volume).toBe(0);
  });
});
