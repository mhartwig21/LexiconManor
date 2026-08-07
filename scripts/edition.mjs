/**
 * scripts/edition.mjs — OWNER: build-integrity (REVIEW_AA §0 / §5.5).
 *
 * For live probes that ATTACH to a server someone else started (the pattern in
 * scripts/round6-headline.mjs, which defaults to http://localhost:4173/…).
 *
 * Probes that spawn their own `vite preview` are already safe: vite.config.ts
 * refuses to start on a dist that doesn't match src, so the server simply
 * never comes up. A probe that attaches to a pre-existing URL has no such
 * protection — it cannot know what that server is serving, or how old it is.
 * That is precisely how two hostile reviews came to describe strings that had
 * already been fixed.
 *
 * Every build writes dist/build-stamp.json, so the server serves it at
 * `${BASE}build-stamp.json`. One fetch turns "I played the game" into "I
 * played edition 1575998, built 2026-08-07T10:03Z" — which is checkable.
 *
 *   import { fetchEdition, requireFreshEdition } from './edition.mjs';
 *   console.log(await fetchEdition(BASE));     // one line for the report header
 *   await requireFreshEdition(BASE);           // or refuse to measure at all
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Read the stamp the SERVER is actually serving. Returns null if unstamped. */
export async function readServedStamp(baseUrl) {
  const url = `${baseUrl.replace(/\/?$/, '/')}build-stamp.json`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const stamp = await res.json();
    return typeof stamp?.source === 'string' ? stamp : null;
  } catch {
    return null;
  }
}

/** The stamp of the dist sitting in this checkout, or null. */
export function readLocalStamp() {
  const p = join(ROOT, 'dist', 'build-stamp.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** A single quotable line for the top of any report. Never throws. */
export async function fetchEdition(baseUrl) {
  const s = await readServedStamp(baseUrl);
  if (!s) {
    return `edition UNKNOWN — ${baseUrl} serves no build-stamp.json. ` +
      'Anything measured here is unattributable (REVIEW_AA §0).';
  }
  return `edition ${s.id}${s.git ? ` · git ${s.git}` : ''} · built ${s.builtAt} · via ${s.via}`;
}

/**
 * Refuse to measure an unknown or foreign server. Exits non-zero rather than
 * producing a report nobody can trust.
 */
export async function requireFreshEdition(baseUrl) {
  const served = await readServedStamp(baseUrl);
  const local = readLocalStamp();
  const rule = '─'.repeat(72);
  const refuse = (lines) => {
    console.error(['', rule, '  EDITION GUARD — refusing to measure', rule,
      ...lines.map((l) => `  ${l}`), rule, ''].join('\n'));
    process.exit(1);
  };

  if (!served) {
    refuse([
      `${baseUrl} serves no build-stamp.json.`,
      'It is not a build of this repo, or it predates the build guard.',
      'Start the server with `npm run preview` (which cannot serve a stale dist).',
    ]);
  }
  if (local && local.source !== served.source) {
    refuse([
      'The server is serving a DIFFERENT build than this checkout has.',
      `  served : ${served.id}  (built ${served.builtAt})`,
      `  local  : ${local.id}  (built ${local.builtAt})`,
      'Someone left an old preview running. Kill it and `npm run preview` again.',
    ]);
  }
  console.log(`✓ ${await fetchEdition(baseUrl)}`);
  return served;
}
