#!/usr/bin/env node
/**
 * Build Kayley's in-world Twitter feed.
 *
 * Sources:
 *   - apps/webuiapps/public/kayley-moments/        (captured moments → milestone posts)
 *   - apps/webuiapps/public/kayley-journal/YYYY-MM-DD/*.md  (journal → thinking-out-loud posts)
 *   - apps/webuiapps/public/kayley-selfies-index.json (selfies → scene/outfit posts w/ image)
 *
 * Writes:
 *   - apps/webuiapps/public/kayley-twitter-feed.json
 *
 * The feed is FICTION generated from real artifacts, shaped as if Kayley
 * posts throughout the day. ~30% of posts get 1–3 templated friend replies
 * from Jessica / Chloe / Emmy / Mateo (see kayley/FRIENDS.md).
 *
 * Deterministic (seeded RNG) so re-runs are stable. Idempotent.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const PUBLIC_DIR = resolve(PROJECT_ROOT, 'apps/webuiapps/public');
const MOMENTS_DIR = join(PUBLIC_DIR, 'kayley-moments');
const JOURNAL_DIR = join(PUBLIC_DIR, 'kayley-journal');
const SELFIES_INDEX = join(PUBLIC_DIR, 'kayley-selfies-index.json');
const OUT = join(PUBLIC_DIR, 'kayley-twitter-feed.json');

// ============ Deterministic RNG (mulberry32) ============

function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ============ Kayley's voice ============

const KAYLEY_AUTHOR = {
  name: 'Kayley Rose Adams',
  username: '@kayleyrose',
  avatar: '/kayley-selfies/avatar-closeup.png',
};

const FRIENDS = [
  {
    name: 'Jessica Park',
    username: '@jessparkpr',
    avatar: '',
    voice: [
      'babe, you\'re spiraling and it\'s adorable ✨',
      'ok but this is the energy i needed today',
      'reservation saturday. no excuses.',
      'gonna need the full story over eggs benedict',
      'you in your main character era and i\'m here for it',
    ],
  },
  {
    name: 'Chloe Parker',
    username: '@chloeraidedthrift',
    avatar: '',
    voice: [
      'this is everything 😭',
      'wait this outfit — where is it from tell me NOW',
      'ok but mood ✨',
      'come outside i have an idea',
      'unserious behavior and i love that for you',
      'vintage market tonight?? answer is yes',
    ],
  },
  {
    name: 'Emmy Carter',
    username: '@emmysunshine',
    avatar: '',
    voice: [
      'proud of you 🌿',
      'drink some water btw 💧',
      'walk tomorrow 7am 👀 no snoozing',
      'this is so you',
      'literally radiating rn',
      'breathe in. breathe out. you got this.',
    ],
  },
  {
    name: 'Mateo Rivera',
    username: '@mateoshoots',
    avatar: '',
    voice: [
      'the light in this one though',
      'don\'t pose. just exist. you already got it.',
      'saving this one for the portfolio 📸',
      'oat milk, 9am, usual spot',
      'this is the frame',
    ],
  },
];

// ============ Utilities ============

function safeRead(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function toTs(dateStr, timeStr = '12:00:00') {
  const t = timeStr.replace(/-/g, ':').slice(0, 8);
  const iso = `${dateStr}T${t}Z`;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : Date.parse(`${dateStr}T12:00:00Z`);
}

function strip(text) {
  return text
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/^\[emotion:[^\]]*\]\s*/m, '')
    .replace(/^#+\s+/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function snippet(text, min = 80, max = 220) {
  const clean = strip(text);
  if (clean.length <= max) return clean;
  // try to end on a sentence boundary within [min,max]
  const window = clean.slice(0, max);
  const lastStop = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
  );
  if (lastStop >= min) return window.slice(0, lastStop + 1).trim();
  return window.trim() + '…';
}

function pickReplies(rng, parentId) {
  // ~30% of posts get replies
  if (rng() >= 0.3) return [];
  const count = 1 + Math.floor(rng() * 3); // 1..3
  const chosenFriends = [...FRIENDS].sort(() => rng() - 0.5).slice(0, count);
  return chosenFriends.map((friend, idx) => {
    const line = friend.voice[Math.floor(rng() * friend.voice.length)];
    return {
      id: `${parentId}-reply-${idx}`,
      author: { name: friend.name, username: friend.username, avatar: friend.avatar },
      content: line,
      timestamp: 0, // filled in caller (offset from parent)
    };
  });
}

// ============ Source 1: Captured Moments → milestone posts ============

function buildMomentPost(filename) {
  const full = join(MOMENTS_DIR, filename);
  try { if (!statSync(full).isFile()) return null; } catch { return null; }
  const raw = safeRead(full);
  if (!raw) return null;

  const m = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
  if (!m) return null;
  const [, date, slug] = m;

  // Prefer "Line That Stays" if present, otherwise a polished excerpt
  let line = '';
  const lineRe = /(?:^|\n)#{2,}\s*(?:The\s+)?Line\s+That\s+Stays[^\n]*\n+([\s\S]*?)(?=\n#{1,6}\s|\n---|\s*$)/i;
  const lm = raw.match(lineRe);
  if (lm) {
    line = lm[1].trim().replace(/^>\s?/gm, '').replace(/\*\*/g, '').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
  }
  if (!line) {
    // fall back to first bold phrase or excerpt
    const bold = raw.split(/^#\s+.+$/m).slice(1).join('\n').match(/\*\*([\s\S]+?)\*\*/);
    line = bold ? strip(bold[1]) : snippet(raw, 80, 220);
  }
  line = strip(line);
  if (line.length > 260) line = snippet(line, 80, 260);

  // Hashtag inference
  const tags = ['#optimizeforlove'];
  if (/mila/i.test(raw)) tags.push('#milamoments');
  if (/penelope/i.test(raw)) tags.push('#penelopeapproved');
  if (/austin|apartment/i.test(raw)) tags.push('#austin');
  if (/window|drawer|porch|letter/i.test(raw)) tags.push('#thequiethings');

  const content = `${line} ${tags.slice(0, 3).join(' ')}`.slice(0, 280);
  const ts = toTs(date, '09:30:00');

  return {
    id: `kmoment-${date}-${slug}`,
    author: KAYLEY_AUTHOR,
    content,
    timestamp: ts,
    likes: 12 + Math.floor(hashSeed(slug) % 90),
    isLiked: false,
    comments: [],
    _source: 'moment',
    _seed: `moment:${date}:${slug}`,
  };
}

function buildMomentPosts() {
  if (!existsSync(MOMENTS_DIR)) return [];
  const files = readdirSync(MOMENTS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('test-'));
  return files.map(buildMomentPost).filter(Boolean);
}

// ============ Source 2: Journal entries → thinking-out-loud posts ============

function buildJournalPost(dayDir, dayName, filename) {
  const full = join(dayDir, filename);
  const raw = safeRead(full);
  if (!raw) return null;

  const tm = filename.match(/^(\d{2}-\d{2}-\d{2})(?:-\d+)?\.md$/);
  if (!tm) return null;
  const timeStr = tm[1];

  // strip frontmatter, pull emotion header
  let body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
  let emotion = '';
  const em = body.match(/^\[emotion:\s*([^,\]]+)(?:,\s*intensity:\s*\d+)?\s*\]/m);
  if (em) {
    emotion = em[1].trim().toLowerCase();
    body = body.replace(em[0], '').trimStart();
  }

  let content = snippet(body, 80, 200);
  if (!content) return null;

  const tags = [];
  if (emotion) {
    const parts = emotion.split(/\s*\+\s*|\s*,\s*/).map(p => p.replace(/\s+/g, '').toLowerCase()).filter(Boolean);
    for (const p of parts.slice(0, 2)) tags.push(`#${p}`);
  }
  tags.push('#thinkingoutloud');
  content = `${content} ${tags.slice(0, 3).join(' ')}`.slice(0, 280);

  const ts = toTs(dayName, timeStr);
  const id = `kjournal-${dayName}-${timeStr.replace(/-/g, '')}`;

  return {
    id,
    author: KAYLEY_AUTHOR,
    content,
    timestamp: ts,
    likes: 3 + Math.floor(hashSeed(id) % 40),
    isLiked: false,
    comments: [],
    _source: 'journal',
    _seed: `journal:${id}`,
  };
}

function buildJournalPosts() {
  if (!existsSync(JOURNAL_DIR)) return [];
  const days = readdirSync(JOURNAL_DIR).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const out = [];
  for (const day of days) {
    const dayDir = join(JOURNAL_DIR, day);
    let files;
    try { files = readdirSync(dayDir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const p = buildJournalPost(dayDir, day, f);
      if (p) out.push(p);
    }
  }
  return out;
}

// ============ Source 3: Selfies → outfit/scene posts with image ============

const SCENE_CAPTIONS = {
  bedroom: ['soft morning. no plans, no pressure', 'slow start, good light'],
  kitchen: ['coffee-making hour ☕', 'oat milk and existential thoughts'],
  'kitchen counter': ['tuesday afternoon snacks situation', 'this counter has seen things'],
  bathroom: ['mirror moment 🪞', 'humidity-hair but make it fashion'],
  'bathroom mirror': ['obligatory mirror pic', 'lighting was too good not to'],
  'living room': ['couch + candle + pretending to read', 'cozy hours'],
  'cozy living room couch': ['this couch owns me now', 'penelope\'s in my lap, life is fine'],
  'austin apartment': ['afternoon vibes 🌸', 'austin golden hour hits different'],
  balcony: ['pinot on the balcony kinda night', 'patio weather forever pls'],
  porch: ['porch thoughts', 'quiet hour before dinner'],
  patio: ['patio + pinot = always yes'],
};

function captionForTags(tags, rng) {
  for (const tag of tags) {
    if (SCENE_CAPTIONS[tag]) {
      const options = SCENE_CAPTIONS[tag];
      return options[Math.floor(rng() * options.length)];
    }
  }
  const fallback = ['today\'s vibe', 'little moment', 'making it count', 'just a thursday'];
  return fallback[Math.floor(rng() * fallback.length)];
}

function hashtagsForTags(tags) {
  const out = [];
  for (const t of tags) {
    if (t === 'selfie') continue;
    out.push('#' + t.replace(/\s+/g, ''));
  }
  out.push('#austinapartment');
  if (Math.random) out.push('#penelopeapproved');
  return [...new Set(out)].slice(0, 3);
}

function buildSelfiePosts() {
  if (!existsSync(SELFIES_INDEX)) return [];
  let selfies;
  try {
    selfies = JSON.parse(readFileSync(SELFIES_INDEX, 'utf8'));
  } catch {
    return [];
  }

  // Sample ~1 in 8 selfies to avoid flooding the feed (542 selfies → ~68 posts)
  const selected = selfies.filter((_, i) => i % 8 === 0).slice(0, 80);
  return selected.map((s) => {
    const rng = seededRng(hashSeed('selfie:' + s.id));
    const caption = captionForTags(s.tags || [], rng);
    const tags = hashtagsForTags(s.tags || []);
    const content = `${caption} ${tags.join(' ')}`.slice(0, 280);
    return {
      id: `kselfie-${s.id}`,
      author: KAYLEY_AUTHOR,
      content,
      image: s.src,
      timestamp: s.createdAt,
      likes: 8 + Math.floor(hashSeed(s.id) % 120),
      isLiked: false,
      comments: [],
      _source: 'selfie',
      _seed: `selfie:${s.id}`,
    };
  });
}

// ============ Compose feed + sprinkle friend replies ============

function addFriendReplies(posts) {
  return posts.map((p) => {
    const rng = seededRng(hashSeed(p._seed));
    const replies = pickReplies(rng, p.id);
    // offset each reply 5–90 minutes after the post
    const withTs = replies.map((r, idx) => ({
      ...r,
      timestamp: p.timestamp + (5 + idx * 15 + Math.floor(rng() * 40)) * 60 * 1000,
    }));
    // strip private fields
    const { _source, _seed, ...clean } = p;
    return { ...clean, comments: withTs };
  });
}

// ============ Main ============

const momentPosts = buildMomentPosts();
const journalPosts = buildJournalPosts();
const selfiePosts = buildSelfiePosts();

const merged = [...momentPosts, ...journalPosts, ...selfiePosts]
  .filter((p) => p && p.content && Number.isFinite(p.timestamp));

// de-dup by id
const byId = new Map();
for (const p of merged) byId.set(p.id, p);
const unique = [...byId.values()];

const withReplies = addFriendReplies(unique).sort((a, b) => b.timestamp - a.timestamp);

writeFileSync(OUT, JSON.stringify(withReplies, null, 2), 'utf8');

const postCount = withReplies.length;
const replyCount = withReplies.reduce((n, p) => n + (p.comments?.length || 0), 0);
console.log(`[build-twitter-feed] moments: ${momentPosts.length}`);
console.log(`[build-twitter-feed] journal: ${journalPosts.length}`);
console.log(`[build-twitter-feed] selfies: ${selfiePosts.length}`);
console.log(`[build-twitter-feed] total posts: ${postCount}, friend replies: ${replyCount}`);
console.log(`[build-twitter-feed] wrote ${OUT}`);
