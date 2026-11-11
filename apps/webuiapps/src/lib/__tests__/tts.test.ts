import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isTtsSupported,
  pickFemaleVoice,
  textForSpeech,
  loadTtsEnabled,
  saveTtsEnabled,
  speak,
  stopSpeaking,
  announceVoiceOn,
  splitForSpeech,
  activeUtteranceCount,
  primeSpeech,
  isSpeechPrimed,
  resetSpeechPrimed,
  subscribeSpeech,
  type SpeechEvent,
} from '../tts';
import { logger } from '../logger';

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
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onboundary: ((e: { name?: string }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
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
  resume: ReturnType<typeof vi.fn>;
  speaking: boolean;
  pending: boolean;
  paused: boolean;
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
    resume: vi.fn(),
    speaking: false,
    pending: false,
    paused: false,
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
    expect(() => announceVoiceOn()).not.toThrow();
    primeSpeech();
    expect(isSpeechPrimed()).toBe(false);
  });
});

describe('speech (supported browser)', () => {
  afterEach(() => {
    stopSpeaking();
    resetSpeechPrimed();
    uninstallSynth();
    vi.useRealTimers();
  });

  it('speaks the cleaned text with a female voice', async () => {
    const synth = installSynth([voice('Fred'), voice('Samantha')]);
    expect(isTtsSupported()).toBe(true);
    await speak('(smiles) Hello there!');
    expect(synth.cancel).not.toHaveBeenCalled();
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

  it('interrupts current speech and resumes a paused engine before speaking', async () => {
    const synth = installSynth([voice('Samantha')]);
    synth.speaking = true;
    synth.paused = true;
    await speak('Next line.');
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(synth.resume).toHaveBeenCalledTimes(1);
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('queues long replies as several chunks and tracks them until done', async () => {
    const synth = installSynth([voice('Samantha')]);
    const sentence = 'This is a fairly long sentence that keeps going for a while. ';
    await speak(sentence.repeat(8));
    const calls = synth.speak.mock.calls.map((c) => c[0] as FakeUtterance);
    expect(calls.length).toBeGreaterThan(1);
    calls.forEach((u) => expect(u.text.length).toBeLessThanOrEqual(200));
    expect(activeUtteranceCount()).toBe(calls.length);
    calls[0].onend?.();
    expect(activeUtteranceCount()).toBe(calls.length - 1);
    stopSpeaking();
    expect(activeUtteranceCount()).toBe(0);
  });

  it('logs real speech errors but not interruptions', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const synth = installSynth([voice('Samantha')]);
    await speak('One. Two.');
    await speak('Three.');
    const [a, b] = synth.speak.mock.calls.map((c) => c[0] as FakeUtterance);
    a.onerror?.({ error: 'interrupted' });
    expect(warn).not.toHaveBeenCalled();
    b.onerror?.({ error: 'not-allowed' });
    expect(warn).toHaveBeenCalledWith('TTS', 'speech failed:', 'not-allowed');
    expect(activeUtteranceCount()).toBe(0);
    warn.mockRestore();
  });

  it('announces "Voice on." synchronously with the available voice', () => {
    const synth = installSynth([voice('Samantha')]);
    announceVoiceOn();
    const u = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(u.text).toBe('Voice on.');
    expect(u.voice?.name).toBe('Samantha');
    stopSpeaking();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });
});

describe('subscribeSpeech', () => {
  afterEach(() => {
    stopSpeaking();
    uninstallSynth();
  });

  it('reports start, word boundaries and the end of all queued speech', async () => {
    const synth = installSynth([voice('Samantha')]);
    const events: SpeechEvent['type'][] = [];
    const unsubscribe = subscribeSpeech((e) => events.push(e.type));
    await speak('One. Two.');
    await speak('Three. Four.');
    const [a, b] = synth.speak.mock.calls.map((c) => c[0] as FakeUtterance);
    a.onstart?.();
    a.onboundary?.({ name: 'word' });
    a.onboundary?.({ name: 'sentence' });
    a.onboundary?.({});
    a.onend?.();
    // still one utterance queued: no end yet
    expect(events).toEqual(['start', 'boundary', 'boundary']);
    b.onerror?.({ error: 'interrupted' });
    expect(events).toEqual(['start', 'boundary', 'boundary', 'end']);

    unsubscribe();
    await speak('Five.');
    (synth.speak.mock.calls.at(-1)?.[0] as FakeUtterance).onstart?.();
    expect(events).toHaveLength(4);
  });

  it('reports the end when speech is stopped, and survives a failing listener', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    installSynth([voice('Samantha')]);
    const events: string[] = [];
    const offBad = subscribeSpeech(() => {
      throw new Error('boom');
    });
    const off = subscribeSpeech((e) => events.push(e.type));
    await speak('Hello.');
    stopSpeaking();
    stopSpeaking(); // nothing speaking: no second end
    expect(events).toEqual(['end']);
    expect(warn).toHaveBeenCalledWith('TTS', 'speech listener failed:', expect.any(Error));
    off();
    offBad();
    warn.mockRestore();
  });
});

describe('primeSpeech', () => {
  afterEach(() => {
    resetSpeechPrimed();
    uninstallSynth();
  });

  it('speaks one silent utterance per page load', () => {
    const synth = installSynth([voice('Samantha')]);
    expect(isSpeechPrimed()).toBe(false);
    primeSpeech();
    primeSpeech();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect((synth.speak.mock.calls[0][0] as FakeUtterance).volume).toBe(0);
    expect(isSpeechPrimed()).toBe(true);
  });

  it('counts the "Voice on." announcement as the unlock', () => {
    const synth = installSynth([voice('Samantha')]);
    announceVoiceOn();
    primeSpeech();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(isSpeechPrimed()).toBe(true);
  });
});

describe('splitForSpeech', () => {
  it('keeps short text as one chunk', () => {
    expect(splitForSpeech('Hi there. How are you?')).toEqual(['Hi there. How are you?']);
  });

  it('groups sentences up to the limit and keeps trailing text without punctuation', () => {
    expect(splitForSpeech('One two. Three four! Five six', 12)).toEqual([
      'One two.',
      'Three four!',
      'Five six',
    ]);
  });

  it('keeps closing quotes with their sentence and handles empty input', () => {
    expect(splitForSpeech('"Stay." she said.', 8)).toEqual(['"Stay."', 'she said.']);
    expect(splitForSpeech('')).toEqual([]);
  });
});
