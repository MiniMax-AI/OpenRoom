/**
 * Text-to-speech for character replies, using the browser's built-in
 * Web Speech API (free, offline, no server). Prefers a friendly female voice.
 */

import { logger } from './logger';

const LS_TTS_ENABLED = 'openroom_tts_enabled';

/** Well-known female system voices across macOS/iOS, Windows, Chrome and Android. */
const FEMALE_VOICE_NAMES = [
  'samantha',
  'ava',
  'allison',
  'susan',
  'zoe',
  'victoria',
  'karen',
  'moira',
  'tessa',
  'fiona',
  'serena',
  'kate',
  'nicky',
  'google us english',
  'google uk english female',
  'zira',
  'aria',
  'jenny',
  'michelle',
  'libby',
  'sonia',
  'natasha',
  'female',
];

export function isTtsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

/** Rank of a voice name in the female list (lower is better), or -1 if not listed. */
function femaleRank(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  return FEMALE_VOICE_NAMES.findIndex((n) => new RegExp(`\\b${n}\\b`).test(name));
}

/**
 * Pick the best female voice for a language (e.g. "en"). Falls back to any
 * voice in that language, then to the first voice. Returns null if none.
 */
export function pickFemaleVoice(
  voices: SpeechSynthesisVoice[],
  lang = 'en',
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const prefix = lang.toLowerCase().split(/[-_]/)[0];
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const ranked = sameLang
    .map((v) => ({ v, rank: femaleRank(v) }))
    .filter((x) => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank || Number(b.v.localService) - Number(a.v.localService));
  if (ranked.length > 0) return ranked[0].v;
  return sameLang[0] ?? voices[0];
}

/**
 * Turn a character message into speakable text: drop (stage directions) and
 * *actions*, strip markdown, collapse whitespace.
 */
export function textForSpeech(content: string): string {
  return content
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*?\([^)]*\)\*?/g, ' ')
    .replace(/\*[^*]+\*/g, ' ')
    .replace(/[*_#`>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadTtsEnabled(): boolean {
  try {
    return localStorage.getItem(LS_TTS_ENABLED) === 'true';
  } catch {
    return false;
  }
}

export function saveTtsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LS_TTS_ENABLED, String(enabled));
  } catch {
    // storage unavailable — keep in-memory only
  }
}

/** Resolve the voice list, waiting briefly for the async 'voiceschanged' load. */
function getVoices(timeoutMs = 1000): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      synth.removeEventListener?.('voiceschanged', done);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    synth.addEventListener?.('voiceschanged', done);
  });
}

/**
 * Split text into sentence groups of at most ~maxLen characters. Chrome stops
 * speaking a single long utterance after ~15 seconds, so long replies are
 * queued as several shorter ones.
 */
export function splitForSpeech(text: string, maxLen = 200): string[] {
  const sentences = (text.match(/[^.!?\u2026]+(?:[.!?\u2026]+["')\]]*|$)/g) ?? [])
    .map((x) => x.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + 1 + sentence.length > maxLen) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** What the voice is doing, for lip movement in avatars. */
export type SpeechEvent =
  | { type: 'start' }
  /** A word starts (browsers that support boundary events) */
  | { type: 'boundary' }
  | { type: 'end' };

const speechListeners = new Set<(event: SpeechEvent) => void>();

/** Listen to the character's voice: start, word boundaries, end. Returns an unsubscribe function. */
export function subscribeSpeech(listener: (event: SpeechEvent) => void): () => void {
  speechListeners.add(listener);
  return () => {
    speechListeners.delete(listener);
  };
}

function emitSpeech(event: SpeechEvent): void {
  speechListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      logger.warn('TTS', 'speech listener failed:', err);
    }
  });
}

/** Utterances in flight. Holding references stops Chrome from garbage-collecting them mid-speech. */
const activeUtterances = new Set<SpeechSynthesisUtterance>();

/** Number of utterances still queued or speaking (for tests/diagnostics). */
export function activeUtteranceCount(): number {
  return activeUtterances.size;
}

function queueSpeech(text: string, voices: SpeechSynthesisVoice[], lang: string): void {
  const synth = window.speechSynthesis;
  // Chrome can silently drop an utterance queued straight after cancel(), so only cancel when busy.
  if (synth.speaking || synth.pending) synth.cancel();
  if (synth.paused) synth.resume();
  const voice = pickFemaleVoice(voices, lang);
  for (const chunk of splitForSpeech(text)) {
    const utterance = new window.SpeechSynthesisUtterance(chunk);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = 1;
    utterance.pitch = 1.1;
    activeUtterances.add(utterance);
    utterance.onstart = () => emitSpeech({ type: 'start' });
    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (event.name === 'word' || event.name === undefined) emitSpeech({ type: 'boundary' });
    };
    const finish = () => {
      activeUtterances.delete(utterance);
      if (activeUtterances.size === 0) emitSpeech({ type: 'end' });
    };
    utterance.onend = finish;
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      finish();
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        logger.warn('TTS', 'speech failed:', event.error);
      }
    };
    synth.speak(utterance);
  }
}

/** Speak a character message aloud, replacing anything currently speaking. */
export async function speak(content: string, lang = 'en'): Promise<void> {
  if (!isTtsSupported()) return;
  const text = textForSpeech(content);
  if (!text) return;
  queueSpeech(text, await getVoices(), lang);
}

export function stopSpeaking(): void {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
  const wasSpeaking = activeUtterances.size > 0;
  activeUtterances.clear();
  if (wasSpeaking) emitSpeech({ type: 'end' });
}

/**
 * Say a short confirmation when the voice is switched on. It runs synchronously
 * inside the click, which also unlocks later speech on mobile browsers (iOS
 * Safari only allows speech that starts from a user gesture), and lets the user
 * hear straight away whether their browser can speak.
 */
export function announceVoiceOn(lang = 'en'): void {
  if (!isTtsSupported()) return;
  primed = true;
  queueSpeech('Voice on.', window.speechSynthesis.getVoices(), lang);
}

let primed = false;

/** Whether speech has been unlocked by a user gesture in this page load. */
export function isSpeechPrimed(): boolean {
  return primed;
}

/** Forget the unlock (for tests). */
export function resetSpeechPrimed(): void {
  primed = false;
}

/**
 * Unlock speech for the rest of this page load. Safari (iOS especially) only
 * lets a page speak after speech has been started inside a user gesture
 * (click/tap/key), and replies arrive seconds after the tap. Call this
 * synchronously from a gesture handler; it speaks a silent utterance once.
 */
export function primeSpeech(): void {
  if (primed || !isTtsSupported()) return;
  primed = true;
  const utterance = new window.SpeechSynthesisUtterance(' ');
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
}
