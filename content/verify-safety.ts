/**
 * content/verify-safety.ts — the gate, run over EVERYTHING that ships.
 *
 * Wired into `npm run content:verify` (and therefore into `build:pages`), and
 * mirrored by `tests/content-safety.test.ts` so it fails in CI too.
 *
 * The escape this closes: every generator applied the gate to its OWN output,
 * so a generator that forgot (generate-forgotten-word.ts never called it at
 * all) shipped ungated content, and no single place ever looked at the union.
 * This walks every shipped file, classifies every string by SURFACE, and
 * applies the right standard to each:
 *
 *   DISPLAY  — a bare word the manor sets in its own type (hive validWords,
 *              twistle targetWords, word-web tiles, crossword answers,
 *              Forgotten Word headwords). Full gate: safety + tone (+ names
 *              and artifacts where a proper noun is not authored intent).
 *   PROSE    — an authored sentence (dialogue, clues, definitions, etymology,
 *              usage, themes, volume fragments, cipher plaintext). Absolute
 *              safety standard only.
 *
 * Numeric content (sudoku) has no strings and is skipped by construction.
 *
 * Exit code 1 on any finding, with the file, path and offending word printed.
 * LOUD BY DESIGN: a red build is the correct outcome (see generate-gate.ts).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gateOk, toneOk } from './generate-gate';
import { scanProse } from './lib/safety';

const here = dirname(fileURLToPath(import.meta.url));

export interface Finding {
  readonly file: string;
  readonly path: string;
  readonly word: string;
  readonly surface: 'display' | 'prose';
  readonly why: string;
}

type Json = unknown;

const read = (rel: string): Json => JSON.parse(readFileSync(join(here, rel), 'utf8'));

/** Walk an arbitrary JSON tree, applying `visit` to every string leaf. */
function walk(node: Json, path: string, visit: (s: string, path: string) => void): void {
  if (typeof node === 'string') visit(node, path);
  else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, Json>)) walk(v, `${path}.${k}`, visit);
  }
}

/** JSON paths whose leaves are DISPLAY WORDS rather than prose, per file. */
const DISPLAY_KEYS: Record<string, RegExp> = {
  'generated/hive.json': /\.(validWords|pangrams)\[/,
  // ROUND 28 — `extraWords` (the Gallery's STUDIES) is a display surface too:
  // every one of them can be traced, accepted, and printed as a chip on the
  // deck. It is ~2,000 new printed words at tier 3, and it must be held to the
  // same gate as the ask — this repo has shipped a slur in these pools once.
  'generated/twistle.json': /\.(targetWords|extraWords)\[/,
  'generated/word-web.json': /\.(words|layout|ambiguousWords)\[/,
  'generated/crossword.json': /\.answer$/,
  'generated/forgotten-word.json': /\.word$/,
  'authored/word-web-boards.json': /\.words\[/,
  'authored/crossword-clues.json': /\.word$/,
};

/**
 * Files whose display words are AUTHORED trivia and may legitimately be proper
 * nouns (AAA 2.9 allows one trivia category per Library board). They get the
 * tone gate, not the name gate.
 */
const PROPER_NOUNS_OK = new Set(['generated/word-web.json', 'authored/word-web-boards.json']);

const FILES = [
  'generated/cipher.json',
  'generated/crossword.json',
  'generated/forgotten-word.json',
  'generated/hive.json',
  'generated/twistle.json',
  'generated/word-web.json',
  'authored/crossword-clues.json',
  'authored/word-web-boards.json',
  'authored/dialogue/bramble.json',
  'authored/dialogue/dewey.json',
  'authored/dialogue/ellery.json',
  'authored/dialogue/fern.json',
  'authored/dialogue/portrait.json',
  'authored/dialogue/posy.json',
  'authored/volumes/volume-1.json',
];

/** Every shipped file this verifier knows about. */
export const SHIPPED_FILES: readonly string[] = FILES;

/**
 * Scan one parsed tree as if it were `file`. EXPORTED so the safety test can
 * inject a synthetic pool carrying a known-bad word and prove the verifier
 * rejects it on every generator's surface — the gate is proven, not assumed.
 */
export function scanTree(file: string, tree: Json): Finding[] {
  const findings: Finding[] = [];
  const displayKey = DISPLAY_KEYS[file];
  const namesOk = PROPER_NOUNS_OK.has(file);
  walk(tree, '', (s, path) => {
    if (displayKey?.test(path)) {
      // A bare display word. `layout`/`ambiguousWords` repeat tiles; still checked.
      for (const w of s.split(/[^A-Za-z']+/).filter(Boolean)) {
        const ok = namesOk ? toneOk(w) : gateOk(w);
        if (!ok) {
          findings.push({ file, path, word: w.toUpperCase(), surface: 'display', why: 'fails the display gate' });
        }
      }
      return;
    }
    for (const { word, rule } of scanProse(s)) {
      findings.push({
        file, path, word: word.toUpperCase(), surface: 'prose',
        why: `${rule.category} (absolute standard)`,
      });
    }
  });
  return findings;
}

/** Every shipped string, checked at the right strength. */
export function verifySafety(): Finding[] {
  const findings: Finding[] = [];
  for (const file of FILES) {
    if (!existsSync(join(here, file))) continue;
    findings.push(...scanTree(file, read(file)));
  }
  return findings;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('verify-safety.ts');
if (invokedDirectly) {
  const findings = verifySafety();
  if (findings.length > 0) {
    console.error(`\nCONTENT SAFETY: ${findings.length} finding(s).\n`);
    for (const f of findings.slice(0, 200)) {
      console.error(`  ${f.file}  ${f.path}\n    ${f.word} — ${f.surface}: ${f.why}`);
    }
    if (findings.length > 200) console.error(`  ...and ${findings.length - 200} more.`);
    console.error('\nA red build is the correct outcome. Gate the family in');
    console.error('content/lib/safety.ts AND regenerate the affected pool in the same change.\n');
    process.exit(1);
  }
  console.log('content safety: clean across every shipped pool and authored file.');
}
