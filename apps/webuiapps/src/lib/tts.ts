/**
 * Text-to-speech for character replies, using the browser's built-in
 * Web Speech API (free, offline, no server). Prefers a friendly female voice.
 */

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

/** Speak a character message aloud. Cancels anything currently speaking. */
export async function speak(content: string, lang = 'en'): Promise<void> {
  if (!isTtsSupported()) return;
  const text = textForSpeech(content);
  if (!text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new window.SpeechSynthesisUtterance(text);
  const voice = pickFemaleVoice(await getVoices(), lang);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  utterance.rate = 1;
  utterance.pitch = 1.1;
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (isTtsSupported()) window.speechSynthesis.cancel();
}

/**
 * Mobile browsers (iOS Safari) only allow speech that starts from a user
 * gesture. Call this from the toggle's click handler to unlock later speech.
 */
export function unlockSpeech(): void {
  if (!isTtsSupported()) return;
  const u = new window.SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}
