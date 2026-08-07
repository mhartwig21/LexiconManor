/**
 * tests/dist-guard.test.ts — REVIEW_AA §0 / §5.5.
 *
 * The guard that stops `vite preview` serving a dist built from other source.
 * Everything here runs against a synthetic repo root in a temp directory, so
 * the tests never depend on (or disturb) the real dist/ that sibling agents
 * may be building at the same moment.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  REPO_ROOT,
  WATCHED,
  STAMP_FILE,
  checkDist,
  changedSince,
  fingerprintSources,
  formatVerdict,
  makeStamp,
  readStamp,
  watchedFiles,
  writeStamp,
} from '../scripts/dist-guard';

let root = '';

/** A minimal but realistic repo: an entry document, a source tree, content. */
function seed(): void {
  writeFileSync(join(root, 'index.html'), '<!doctype html><div id="app"></div>');
  writeFileSync(join(root, 'package.json'), '{"name":"fake"}');
  mkdirSync(join(root, 'src', 'pages'), { recursive: true });
  writeFileSync(join(root, 'src', 'main.tsx'), 'export const x = 1;\n');
  writeFileSync(join(root, 'src', 'pages', 'Home.tsx'), 'export default () => null;\n');
  mkdirSync(join(root, 'content', 'generated'), { recursive: true });
  writeFileSync(join(root, 'content', 'generated', 'hive.json'), '{"puzzles":[]}');
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'public', 'sw.js'), '// sw\n');
}

/** Pretend a build ran: an index.html in dist plus a matching stamp. */
function build(via = 'npm run build'): void {
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html><script src="/a.js">');
  writeStamp(join(root, 'dist'), makeStamp({ root, via, base: '/LexiconManor/' }));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'manor-dist-guard-'));
  seed();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('source fingerprint', () => {
  it('only walks files that can affect the bundle', () => {
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'REVIEW.md'), '# not a source file');
    mkdirSync(join(root, 'tests'), { recursive: true });
    writeFileSync(join(root, 'tests', 'a.test.ts'), 'it("x", () => {});');

    const files = watchedFiles(root);
    expect(files).toContain('src/main.tsx');
    expect(files).toContain('content/generated/hive.json');
    expect(files).toContain('public/sw.js');
    expect(files).toContain('index.html');
    expect(files.some((f) => f.startsWith('docs/'))).toBe(false);
    expect(files.some((f) => f.startsWith('tests/'))).toBe(false);
  });

  it('is deterministic across calls', () => {
    expect(fingerprintSources(root).hash).toBe(fingerprintSources(root).hash);
  });

  it('is stable when only mtimes move (a shared checkout touches files)', () => {
    const before = fingerprintSources(root).hash;
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(root, 'src', 'main.tsx'), later, later);
    expect(fingerprintSources(root).hash).toBe(before);
  });

  it('changes when a source file changes', () => {
    const before = fingerprintSources(root).hash;
    writeFileSync(join(root, 'src', 'main.tsx'), 'export const x = 2;\n');
    expect(fingerprintSources(root).hash).not.toBe(before);
  });

  it('changes when generated content changes — the reviewers’ actual drift', () => {
    const before = fingerprintSources(root).hash;
    writeFileSync(join(root, 'content', 'generated', 'hive.json'), '{"puzzles":[1]}');
    expect(fingerprintSources(root).hash).not.toBe(before);
  });

  it('changes when a file is added or removed, not just edited', () => {
    const before = fingerprintSources(root).hash;
    writeFileSync(join(root, 'src', 'extra.ts'), 'export const y = 1;\n');
    const added = fingerprintSources(root).hash;
    expect(added).not.toBe(before);
    rmSync(join(root, 'src', 'extra.ts'));
    expect(fingerprintSources(root).hash).toBe(before);
  });

  it('watches the guard and the build script themselves', () => {
    expect(WATCHED).toContain('scripts/dist-guard.ts');
    expect(WATCHED).toContain('scripts/build.ts');
    expect(WATCHED).toContain('vite.config.ts');
  });
});

describe('checkDist', () => {
  it('refuses when there is no dist at all (a failed build cleaned up)', () => {
    const v = checkDist(root);
    expect(v.ok).toBe(false);
    expect(v.code).toBe('no-dist');
    expect(formatVerdict(v)).toContain('refusing to serve');
  });

  it('refuses an unstamped dist — provenance unknown', () => {
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html>');
    const v = checkDist(root);
    expect(v.ok).toBe(false);
    expect(v.code).toBe('no-stamp');
  });

  it('refuses a dist whose stamp does not match the source on disk', () => {
    build();
    expect(checkDist(root).ok).toBe(true);

    // The exact scenario from REVIEW_AA §0: source moved, dist did not.
    writeFileSync(join(root, 'src', 'pages', 'Home.tsx'), 'export default () => "fixed";\n');

    const v = checkDist(root);
    expect(v.ok).toBe(false);
    expect(v.code).toBe('stale');
    expect(formatVerdict(v)).toContain('STALE');
  });

  it('names the files that moved after the build', () => {
    build();
    const stamp = readStamp(join(root, 'dist'))!;
    // Write with an mtime comfortably after the stamp so the hint is stable
    // regardless of filesystem timestamp granularity.
    writeFileSync(join(root, 'src', 'pages', 'Home.tsx'), 'export default () => "fixed";\n');
    const later = new Date(Date.parse(stamp.builtAt) + 5_000);
    utimesSync(join(root, 'src', 'pages', 'Home.tsx'), later, later);

    const v = checkDist(root);
    expect(v.code).toBe('stale');
    expect(v.lines.join('\n')).toContain('src/pages/Home.tsx');
    expect(changedSince(Date.parse(stamp.builtAt), root)).toContain('src/pages/Home.tsx');
  });

  it('refuses a dist whose stamp is corrupt', () => {
    build();
    writeFileSync(join(root, 'dist', STAMP_FILE), '{ not json');
    expect(checkDist(root).code).toBe('no-stamp');
  });

  it('passes a matching dist and reports the edition', () => {
    build();
    const v = checkDist(root);
    expect(v.ok).toBe(true);
    expect(v.code).toBe('ok');
    expect(v.stamp!.id).toHaveLength(7);
    expect(v.stamp!.source).toBe(fingerprintSources(root).hash);
    expect(v.warnings).toEqual([]);
    expect(formatVerdict(v)).toContain(v.stamp!.id);
  });

  it('passes but warns when the dist came from a bare `vite build`', () => {
    build('vite');
    const v = checkDist(root);
    expect(v.ok).toBe(true);
    expect(v.warnings.join(' ')).toContain('typecheck');
  });
});

describe('__MANOR_BUILD__ (the constant Chronicles prints)', () => {
  it('is defined in every environment — dev, vitest and build', () => {
    // vite.config.ts `define`s this unconditionally. If it is ever gated on
    // command === 'build', ChroniclesPage throws a ReferenceError at runtime
    // in dev and this test is the thing that says so.
    expect(typeof __MANOR_BUILD__).toBe('object');
    expect(typeof __MANOR_BUILD__.id).toBe('string');
    expect(__MANOR_BUILD__.id.length).toBeGreaterThan(0);
    expect(typeof __MANOR_BUILD__.source).toBe('string');
    expect(typeof __MANOR_BUILD__.via).toBe('string');
    expect(typeof __MANOR_BUILD__.builtAt).toBe('string');
    expect('git' in __MANOR_BUILD__).toBe(true);
  });

  it('reports the dev stamp when there is no build behind it', () => {
    expect(__MANOR_BUILD__.via).toBe('dev');
    expect(__MANOR_BUILD__.id).toBe('dev');
  });
});

declare const __MANOR_BUILD__: {
  id: string;
  source: string;
  git: string | null;
  builtAt: string;
  via: string;
  base: string;
  files: number;
};

describe('stamp', () => {
  it('round-trips and carries a quotable 7-char edition id', () => {
    const stamp = makeStamp({ root, via: 'npm run build', base: '/LexiconManor/' });
    writeStamp(join(root, 'dist'), stamp);
    expect(readStamp(join(root, 'dist'))).toEqual(stamp);
    expect(stamp.id).toBe(stamp.source.slice(0, 7));
    expect(stamp.files).toBeGreaterThan(0);
    expect(Number.isFinite(Date.parse(stamp.builtAt))).toBe(true);
  });

  it('reads a git SHA from the environment when CI provides one', () => {
    const prev = process.env.MANOR_GIT_SHA;
    process.env.MANOR_GIT_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
    try {
      expect(makeStamp({ root, via: 'ci', base: '/' }).git).toBe('abcdef1');
    } finally {
      if (prev === undefined) delete process.env.MANOR_GIT_SHA;
      else process.env.MANOR_GIT_SHA = prev;
    }
  });

  it('never spawns a subprocess to find the SHA (shared checkout, no index lock)', () => {
    // Enforced by inspection rather than mocking: this module is loaded during
    // vite config resolution on a checkout several agents share, so it must not
    // import node:child_process at all.
    const src = readFileSync(join(REPO_ROOT, 'scripts', 'dist-guard.ts'), 'utf8');
    expect(src).not.toMatch(/child_process/);
  });
});
