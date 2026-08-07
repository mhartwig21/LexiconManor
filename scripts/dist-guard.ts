/**
 * scripts/dist-guard.ts — OWNER: build-integrity (REVIEW_AA §0 / §5.5).
 *
 * WHY THIS FILE EXISTS.
 * `npm run build` used to be `tsc --noEmit && vite build`. When `tsc` went red,
 * `vite build` never ran — and `vite preview` then cheerfully served whatever
 * `dist/` happened to be lying in the working tree. Two full hostile reviews
 * were spent on a build that was days old: cited line numbers ~20 lines off
 * current source, content counts 2-5% under current, and defects filed against
 * strings that had already been fixed. The reviews were not wrong about what
 * they saw. They were measuring yesterday's game.
 *
 * The class of bug is general: **a failure upstream leaves a stale artifact
 * that a later step happily consumes.** This module is the instrument that
 * makes that impossible for `dist/`.
 *
 * THE THREE MOVES (all three, because each closes a hole the others don't):
 *
 *  1. CLEAN FIRST. `scripts/build.ts` deletes `dist/` before it runs anything,
 *     and deletes it again if any step fails. A red build therefore leaves
 *     NOTHING to serve. This closes "the build failed and I didn't notice".
 *
 *  2. STAMP + VERIFY. Every `vite build` writes `dist/build-stamp.json`
 *     carrying a sha256 fingerprint of every source file that can affect the
 *     bundle. `vite preview` recomputes that fingerprint and REFUSES TO START
 *     if it differs. This closes the bigger hole: a build that succeeded
 *     yesterday, source edited today, nobody rebuilt. Clean-first cannot catch
 *     that one — the dist is perfectly valid, just not of this source.
 *
 *  3. SURFACE IT. The same stamp is compiled into the app (`__MANOR_BUILD__`)
 *     and printed at the foot of Chronicles, so any reviewer — human or agent
 *     — can state which build they played. A report that names its edition is
 *     auditable; one that doesn't is a rumour.
 *
 * WHY THE GUARD LIVES IN `vite.config.ts` AND NOT IN AN npm SCRIPT.
 * A wrapper script (`"preview": "node scripts/check && vite preview"`) is
 * bypassed by `npx vite preview`, by `vite preview --port 5000`, by an IDE
 * task, and by any agent that reaches for the binary directly — which is
 * exactly how the poisoned reviews happened. `vite.config.ts` is loaded by
 * *every* invocation of vite, no matter who spawns it. Putting the assertion
 * there is the only version that cannot be forgotten.
 *
 * WHY A CONTENT HASH AND NOT AN mtime COMPARISON.
 * mtime ("refuse if any src file is newer than dist/index.html") is cheaper,
 * but on a shared checkout mtimes move for reasons that are not edits — a
 * sibling agent's tool touching a file, a branch switch, a clock skew — and a
 * guard that cries wolf gets disabled within a day. A sha256 over ~3.6MB of
 * watched sources costs ~40ms and is exact. mtimes are still read, but only to
 * *explain* a failure ("these 6 files changed after the build"), never to
 * decide it.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Everything that can change what `vite build` emits. A file outside this list
 * cannot invalidate a dist, so keep it honest:
 *  - `src/`                — the app
 *  - `content/generated`   — the puzzle pools the bundle imports
 *  - `content/authored`    — dialogue, volumes, letters
 *  - `public/`             — copied verbatim into dist
 *  - `index.html`          — the entry document
 *  - config + lockfile     — a dependency bump changes the output
 *  - the build scripts      — including this one; changing the guard
 *                            invalidates the build the guard blessed
 *
 * NOT watched: `tests/` (never bundled), `docs/`, `.playtest/`, screenshots.
 */
export const WATCHED: readonly string[] = [
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'src',
  'public',
  'content/generated',
  'content/authored',
  'scripts/build.ts',
  'scripts/build-sw-precache.ts',
  'scripts/dist-guard.ts',
];

export const STAMP_FILE = 'build-stamp.json';

export interface SourceFingerprint {
  /** sha256 over (relative path + bytes) of every watched file, sorted. */
  hash: string;
  files: number;
  bytes: number;
  /** Diagnostic only — never used to decide freshness. */
  newest: { path: string; mtimeMs: number } | null;
}

export interface BuildStamp {
  /** Short, human-quotable edition id — the first 7 of `source`. */
  id: string;
  /** Full source fingerprint. This is what freshness is decided on. */
  source: string;
  /** Short git SHA if one could be read, else null. Context, not identity. */
  git: string | null;
  /** ISO timestamp of the build. */
  builtAt: string;
  /** How the build was invoked — 'npm run build', 'vite' (bare), 'dev'. */
  via: string;
  /** Deploy base the bundle was built for. */
  base: string;
  files: number;
}

/** What the app compiles in when there is no build — i.e. the dev server. */
export const DEV_STAMP: BuildStamp = {
  id: 'dev',
  source: 'dev',
  git: null,
  builtAt: '',
  via: 'dev',
  base: '',
  files: 0,
};

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

function walk(dir: string, root: string, out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, root, out);
    else out.push(relative(root, p).split('\\').join('/'));
  }
}

/** List every watched file under `root`, as sorted POSIX-relative paths. */
export function watchedFiles(root: string = REPO_ROOT): string[] {
  const out: string[] = [];
  for (const entry of WATCHED) {
    const abs = join(root, entry);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) walk(abs, root, out);
    else out.push(entry.split('\\').join('/'));
  }
  return out.sort();
}

export function fingerprintSources(root: string = REPO_ROOT): SourceFingerprint {
  const files = watchedFiles(root);
  const hash = createHash('sha256');
  let bytes = 0;
  let newest: { path: string; mtimeMs: number } | null = null;

  for (const rel of files) {
    const abs = join(root, rel);
    const buf = readFileSync(abs);
    hash.update(rel);
    hash.update('\0');
    hash.update(buf);
    bytes += buf.length;
    const { mtimeMs } = statSync(abs);
    if (!newest || mtimeMs > newest.mtimeMs) newest = { path: rel, mtimeMs };
  }

  return { hash: hash.digest('hex'), files: files.length, bytes, newest };
}

/** Watched files touched after `sinceMs` — the "what changed" hint on failure. */
export function changedSince(sinceMs: number, root: string = REPO_ROOT, limit = 8): string[] {
  const hits: Array<{ rel: string; mtimeMs: number }> = [];
  for (const rel of watchedFiles(root)) {
    const { mtimeMs } = statSync(join(root, rel));
    if (mtimeMs > sinceMs) hits.push({ rel, mtimeMs });
  }
  hits.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return hits.slice(0, limit).map((h) => h.rel);
}

// ---------------------------------------------------------------------------
// Git SHA — read from .git/ directly. No `git` process is ever spawned: this
// runs inside vite config load on a checkout several agents share, and a
// subprocess that can take an index lock has no business there.
// ---------------------------------------------------------------------------

export function gitSha(root: string = REPO_ROOT): string | null {
  const fromEnv = process.env.MANOR_GIT_SHA ?? process.env.GITHUB_SHA;
  if (fromEnv && /^[0-9a-f]{7,40}$/i.test(fromEnv)) return fromEnv.slice(0, 7);
  try {
    const headPath = join(root, '.git', 'HEAD');
    if (!existsSync(headPath)) return null;
    const head = readFileSync(headPath, 'utf8').trim();
    if (!head.startsWith('ref: ')) return /^[0-9a-f]{40}$/i.test(head) ? head.slice(0, 7) : null;
    const ref = head.slice(5).trim();
    const loose = join(root, '.git', ...ref.split('/'));
    if (existsSync(loose)) return readFileSync(loose, 'utf8').trim().slice(0, 7);
    const packed = join(root, '.git', 'packed-refs');
    if (existsSync(packed)) {
      for (const line of readFileSync(packed, 'utf8').split('\n')) {
        const m = /^([0-9a-f]{40})\s+(.+)$/.exec(line.trim());
        if (m && m[2] === ref) return m[1]!.slice(0, 7);
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stamp read / write
// ---------------------------------------------------------------------------

export function makeStamp(opts: { root?: string; via: string; base: string }): BuildStamp {
  const root = opts.root ?? REPO_ROOT;
  const fp = fingerprintSources(root);
  return {
    id: fp.hash.slice(0, 7),
    source: fp.hash,
    git: gitSha(root),
    builtAt: new Date().toISOString(),
    via: opts.via,
    base: opts.base,
    files: fp.files,
  };
}

export function writeStamp(distDir: string, stamp: BuildStamp): void {
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, STAMP_FILE), JSON.stringify(stamp, null, 2) + '\n');
}

export function readStamp(distDir: string): BuildStamp | null {
  const p = join(distDir, STAMP_FILE);
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<BuildStamp>;
    if (typeof raw.source !== 'string' || typeof raw.builtAt !== 'string') return null;
    return raw as BuildStamp;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

export type DistVerdictCode = 'ok' | 'no-dist' | 'no-stamp' | 'stale';

export interface DistVerdict {
  ok: boolean;
  code: DistVerdictCode;
  /** Lines to print. First line is the headline. */
  lines: string[];
  stamp: BuildStamp | null;
  warnings: string[];
}

export function checkDist(root: string = REPO_ROOT, distDir: string = join(root, 'dist')): DistVerdict {
  const index = join(distDir, 'index.html');
  if (!existsSync(index)) {
    return {
      ok: false,
      code: 'no-dist',
      stamp: null,
      warnings: [],
      lines: [
        'There is no build to serve.',
        `  ${relative(root, index).split('\\').join('/')} does not exist.`,
        '  This is the guard working: a failed `npm run build` deletes dist/ so',
        '  nothing stale can be served in its place. Fix the build, then rerun it.',
        '',
        '  npm run build',
      ],
    };
  }

  const stamp = readStamp(distDir);
  if (!stamp) {
    return {
      ok: false,
      code: 'no-stamp',
      stamp: null,
      warnings: [],
      lines: [
        'This dist/ carries no build stamp — its provenance is unknown.',
        `  Expected dist/${STAMP_FILE}, written by every vite build.`,
        '  An unstamped dist predates the build guard, or was assembled by hand.',
        '  Either way nothing can prove it matches this source. Rebuild:',
        '',
        '  npm run build',
      ],
    };
  }

  const fp = fingerprintSources(root);
  if (fp.hash !== stamp.source) {
    const since = Date.parse(stamp.builtAt);
    const changed = Number.isFinite(since) ? changedSince(since, root) : [];
    const lines = [
      'This dist/ is STALE — it was built from different source than is on disk.',
      `  dist edition : ${stamp.id}  (built ${stamp.builtAt || 'unknown'}${stamp.git ? `, git ${stamp.git}` : ''})`,
      `  source now   : ${fp.hash.slice(0, 7)}  (${fp.files} watched files)`,
      '',
      '  Serving it would measure a game that no longer exists. Two hostile',
      '  reviews were spent that way (REVIEW_AA §0). Rebuild first:',
      '',
      '  npm run build',
    ];
    if (changed.length > 0) {
      lines.splice(3, 0, '  changed since that build:', ...changed.map((c) => `    ${c}`));
    }
    return { ok: false, code: 'stale', stamp, warnings: [], lines };
  }

  const warnings: string[] = [];
  if (stamp.via === 'vite') {
    warnings.push(
      'this dist came from a bare `vite build` — vite strips types without checking them, ' +
        'so it may contain code `tsc --noEmit` would reject. `npm run build` typechecks first.',
    );
  }

  return {
    ok: true,
    code: 'ok',
    stamp,
    warnings,
    lines: [
      `dist matches source — edition ${stamp.id}${stamp.git ? ` · git ${stamp.git}` : ''} · built ${stamp.builtAt}`,
    ],
  };
}

// ---------------------------------------------------------------------------
// The assertion vite calls
// ---------------------------------------------------------------------------

let memo: DistVerdict | null = null;

export function formatVerdict(v: DistVerdict): string {
  const rule = '─'.repeat(72);
  if (v.ok) {
    const warn = v.warnings.map((w) => `\n  ! ${w}`).join('');
    return `✓ ${v.lines[0]}${warn}`;
  }
  return [
    '',
    rule,
    `  STALE BUILD GUARD — refusing to serve  [${v.code}]`,
    rule,
    ...v.lines.map((l) => (l ? `  ${l}` : '')),
    rule,
    '',
  ].join('\n');
}

/**
 * Refuse to continue unless dist/ provably matches the source on disk.
 * Called from vite.config.ts on every `vite preview`, however it was spawned.
 * Exits the process rather than throwing: a thrown error inside config load
 * gets wrapped in a stack trace and the headline scrolls away.
 */
export function assertFreshDist(root: string = REPO_ROOT): DistVerdict {
  // The config function and the configurePreviewServer backstop both call this
  // in a single `vite preview`. Memoise so it costs one fingerprint and prints
  // one line, while either call alone is still sufficient to refuse.
  const first = memo === null;
  const v = memo ?? (memo = checkDist(root));
  if (!v.ok) {
    if (first) console.error(formatVerdict(v));
    process.exit(1);
  }
  if (first) console.log(formatVerdict(v));
  return v;
}

// Runnable directly: `npx tsx scripts/dist-guard.ts` (used by CI and by hand).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  assertFreshDist();
}
