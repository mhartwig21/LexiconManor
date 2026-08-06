/**
 * The Sanctum's premise is the Sanctum's alone — OWNER: A7 (Mystery).
 *
 * The Study screen used to open with the Volume 1 claim verbatim ("A word was
 * struck from every dictionary") over forty-odd perfectly ordinary words —
 * SERENDIPITY, WANDERLUST, NOSTALGIA — which the player can look up on her
 * phone in ten seconds. That did two bad things at once: it cheapened the one
 * monstrous erasure Ellery's testimony and the Portrait's confession ("I did
 * not destroy it. I unhoused it") are built on, and it read on first contact
 * as a false lead the game invited her to chase, with no character wrongness
 * signal anywhere to close it off (AAA 4.16). The Study is now framed as the
 * lexicographer's own unfinished entries, which is true and which makes it
 * feed the Sanctum instead of competing with it (AAA 3.7).
 *
 * This lint keeps the claim where it belongs. It is deliberately a string
 * lint over shipped source, not a code assertion: the failure mode is a
 * writer reaching for a good line, and only a grep catches that.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

/** Only the volume machine and the authored volumes may make the claim. */
const OWNERS = [
  join('src', 'engine', 'volume.ts'),
  join('content', 'authored', 'volumes'),
];

const CLAIM = /struck from every dictionar|struck.{0,20}from every dictionar/i;

const SEARCH_ROOTS = [join(root, 'src'), join(root, 'content')];
const SKIP_DIRS = new Set(['node_modules', 'generated', 'dist']);
const EXTENSIONS = ['.ts', '.tsx', '.json', '.css'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

describe('the Sanctum keeps sole ownership of its crime (AAA 3.7 / 4.16)', () => {
  const files = SEARCH_ROOTS.flatMap((r) => walk(r));

  it('scans a real corpus (guard against a lint that greps nothing)', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('nothing outside the volume machine claims a word was struck from every dictionary', () => {
    const offenders = files
      .map((f) => relative(root, f))
      .filter((rel) => !OWNERS.some((o) => rel === o || rel.startsWith(o + sep)))
      .filter((rel) => CLAIM.test(readFileSync(join(root, rel), 'utf8')));
    expect(offenders, `the premise leaked into: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the Study frames its words as the lexicographer\'s own unfinished entries', () => {
    const study = readFileSync(
      join(root, 'src', 'ui', 'rooms', 'anchor', 'ForgottenWordView.tsx'), 'utf8',
    );
    expect(study).toMatch(/headword/i);
    // And the volume machine still owns the claim it is supposed to own.
    expect(readFileSync(join(root, 'src', 'engine', 'volume.ts'), 'utf8')).toMatch(CLAIM);
  });
});
