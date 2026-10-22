#!/usr/bin/env node
/**
 * Refresh Kayley email index for the Vibe Email app.
 *
 * Calls the `gog` Google Workspace CLI to list Steven's Gmail INBOX,
 * then fetches snippet + body for each, and writes a static snapshot to:
 *   apps/webuiapps/public/kayley-email-index.json
 *
 * Shape (per entry):
 *   { id, threadId, from: {name, address}, subject, snippet, body,
 *     date (ISO), timestamp (ms), labels, unread, isRead }
 *
 * Idempotent: safe to re-run. On gog failure, writes an empty snapshot.
 *
 * Usage:
 *   node scripts/refresh-email-index.mjs            # default: 50 messages
 *   node scripts/refresh-email-index.mjs --max 30   # override
 *
 * NOTE: Output JSON contains PII and is gitignored.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const OUT_PATH = resolve(PROJECT_ROOT, 'apps/webuiapps/public/kayley-email-index.json');

// ============ Args ============
const args = process.argv.slice(2);
const maxIdx = args.indexOf('--max');
const MAX = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) || 50 : 50;

// ============ gog helpers ============
function runGog(gogArgs, timeoutMs = 30_000) {
  try {
    const out = execFileSync('gog', gogArgs, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32', // Windows needs shell for .cmd shim
    });
    return out;
  } catch (err) {
    const msg = err?.stderr?.toString?.() || err?.message || String(err);
    throw new Error(`gog ${gogArgs.join(' ')} failed: ${msg.slice(0, 500)}`);
  }
}

function parseJson(text, context) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse JSON from ${context}: ${err.message}`);
  }
}

// ============ Address parsing ============
function parseAddress(raw) {
  if (!raw) return { name: 'Unknown Sender', address: 'unknown@example.com' };
  // Format: "Name" <addr@x> OR Name <addr@x> OR addr@x
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) {
    return { name: (m[1] || '').trim() || m[2].trim(), address: m[2].trim() };
  }
  const trimmed = raw.trim();
  return { name: trimmed, address: trimmed };
}

// ============ Main ============
function buildSnapshot() {
  console.log(`[refresh-email-index] Listing INBOX (max=${MAX})...`);
  const listRaw = runGog([
    'gmail', 'search', 'in:inbox', '--max', String(MAX),
    '-j', '--results-only',
  ]);
  const listings = parseJson(listRaw, 'gmail search');
  if (!Array.isArray(listings)) {
    throw new Error('Unexpected gmail search shape (not an array)');
  }
  console.log(`[refresh-email-index] Got ${listings.length} messages from search`);

  const messages = [];
  for (let i = 0; i < listings.length; i++) {
    const item = listings[i];
    const id = item.id;
    if (!id) continue;

    let snippet = '';
    let body = '';
    try {
      const detailRaw = runGog(['gmail', 'get', id, '-j', '--results-only']);
      const detail = parseJson(detailRaw, `gmail get ${id}`);
      snippet = detail?.message?.snippet || '';
      body = typeof detail?.body === 'string' ? detail.body : '';
    } catch (err) {
      console.warn(`[refresh-email-index] get ${id} failed: ${err.message}`);
    }

    const labels = Array.isArray(item.labels) ? item.labels : [];
    const unread = labels.includes('UNREAD');

    // Parse date. gog emits "YYYY-MM-DD HH:MM" in local TZ by default.
    let timestamp = Date.parse(item.date);
    if (!Number.isFinite(timestamp)) timestamp = Date.now();

    const from = parseAddress(item.from);

    messages.push({
      id,
      threadId: item.id,
      from,
      to: [{ name: 'Steven', address: 'gates.steven@gmail.com' }],
      cc: [],
      subject: item.subject || '(no subject)',
      snippet,
      content: body || snippet, // Email app component reads `content`
      timestamp,
      date: new Date(timestamp).toISOString(),
      labels,
      unread,
      isRead: !unread,
      isStarred: labels.includes('STARRED'),
      folder: 'inbox',
    });

    if ((i + 1) % 10 === 0) {
      console.log(`[refresh-email-index] ${i + 1}/${listings.length} fetched`);
    }
  }

  return messages;
}

function writeSnapshot(messages) {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    count: messages.length,
    messages,
  };
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[refresh-email-index] Wrote ${messages.length} → ${OUT_PATH}`);
}

try {
  const messages = buildSnapshot();
  writeSnapshot(messages);
  process.exit(0);
} catch (err) {
  console.error(`[refresh-email-index] FATAL: ${err.message}`);
  // Write empty snapshot so frontend can still render a graceful empty state.
  writeSnapshot([]);
  process.exit(1);
}
