/**
 * Volume generator/verifier — OWNER: A7 (Mystery).
 *
 * Volume 1 is hand-authored end-to-end (content/authored/volumes/volume-1.json).
 * Later volumes lean on this tool (MANOR_DESIGN §7): given a forgotten word it
 * derives a set of letter-constraint engravings that are individually soft but
 * jointly sufficient (exactly one dictionary answer), verifies them with the
 * real dictionary, and emits a volume skeleton whose poetry slots are
 * hand-authored afterwards — the pipeline never writes the poems (AAA 3.7:
 * the Study/mystery writing stays human).
 *
 * Usage:
 *   npx tsx content/generate-volume.ts --word lacuna --id volume-2 [--out file]
 *   npx tsx content/generate-volume.ts --check content/authored/volumes/volume-1.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { loadDictionary } from './lib/dictionary';
import {
  constraintAdmits, solveConstraints,
  type EngravingConstraint, type VolumeContent,
} from '../src/engine/volume';

/** A constraint is "soft" if it admits at least this many words alone. */
const SOFT_FLOOR = 100;

// ---------------------------------------------------------------------------
// Constraint derivation
// ---------------------------------------------------------------------------

/** Thematic candidates for the shares-no-letter engraving, best first. */
const DISJOINT_CANDIDATES = [
  'wordsmith', 'dictionary', 'lexicon', 'bookshelves', 'manuscript',
  'threshold', 'inkstands', 'copyist', 'porchlight', 'doorstep',
];

export function deriveConstraints(word: string): EngravingConstraint[] {
  const w = word.toLowerCase();
  const out: EngravingConstraint[] = [];

  out.push({ kind: 'length', length: w.length });
  out.push({ kind: 'starts-with', letter: w[0]!.toUpperCase() });

  const vowels = [...w].filter((ch) => 'aeiou'.includes(ch)).join('');
  if (vowels.length > 0) out.push({ kind: 'vowel-sequence', vowels: vowels.toUpperCase() });

  const counts = new Map<string, number>();
  for (const ch of w) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const values = [...counts.values()];
  if (values.filter((n) => n === 2).length === 1 && values.every((n) => n <= 2)) {
    out.push({ kind: 'one-letter-twice' });
  }

  // A distinctive consonant to require (prefer scrabble-hard letters).
  const HARD = 'qzjxkvwcfgbp';
  const consonants = [...new Set([...w])].filter((ch) => !'aeiou'.includes(ch));
  const hard = consonants.sort((a, b) => {
    const ia = HARD.indexOf(a); const ib = HARD.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  })[0];
  if (hard) out.push({ kind: 'contains-letter', letter: hard.toUpperCase() });

  const letters = new Set(w);
  const disjoint = DISJOINT_CANDIDATES.find((c) => ![...c].some((ch) => letters.has(ch)));
  if (disjoint) out.push({ kind: 'shares-no-letter', word: disjoint.toUpperCase() });

  return out;
}

// ---------------------------------------------------------------------------
// Verification (shared by --word and --check)
// ---------------------------------------------------------------------------

interface Verification {
  ok: boolean;
  admitted: string[];
  softness: { constraint: EngravingConstraint; admits: number; soft: boolean }[];
  loadBearing: EngravingConstraint[];
}

export function verify(
  answer: string,
  constraints: EngravingConstraint[],
  words: readonly string[],
): Verification {
  const a = answer.toLowerCase();
  const admitted = solveConstraints(constraints, words);
  const softness = constraints.map((c) => {
    let admits = 0;
    for (const w of words) if (constraintAdmits(c, w)) admits++;
    return { constraint: c, admits, soft: admits >= SOFT_FLOOR };
  });
  // Which constraints are load-bearing (removal breaks uniqueness)?
  const loadBearing = constraints.filter((c) => {
    const rest = constraints.filter((x) => x !== c);
    return solveConstraints(rest, words).length > 1;
  });
  return {
    ok: admitted.length === 1 && admitted[0] === a && softness.every((s) => s.soft),
    admitted,
    softness,
    loadBearing,
  };
}

function report(answer: string, constraints: EngravingConstraint[], words: readonly string[]): Verification {
  const v = verify(answer, constraints, words);
  console.log(`\nAnswer: ${answer.toUpperCase()}`);
  for (const s of v.softness) {
    console.log(
      `  ${JSON.stringify(s.constraint)} → admits ${s.admits}${s.soft ? '' : '  ⚠ TOO SHARP (<' + SOFT_FLOOR + ')'}`,
    );
  }
  console.log(`  jointly admit: [${v.admitted.slice(0, 10).join(', ')}]${v.admitted.length > 10 ? '…' : ''}`);
  console.log(`  load-bearing: ${v.loadBearing.map((c) => c.kind).join(', ') || '(fully redundant set)'}`);
  console.log(v.ok ? '  ✓ individually soft, jointly sufficient' : '  ✗ NOT SHIPPABLE');
  return v;
}

// ---------------------------------------------------------------------------
// Skeleton emission
// ---------------------------------------------------------------------------

function skeleton(id: string, answer: string, constraints: EngravingConstraint[]): VolumeContent {
  const A = answer.toUpperCase();
  const frags: VolumeContent['fragments'] = [];
  let order = 1;
  const defLines = 6;
  const cats = ['mystery', 'puzzle', 'parlor'] as const;
  for (let i = 0; i < Math.max(defLines, constraints.length); i++) {
    if (i < defLines) {
      frags.push({
        id: `${id}-d${i + 1}`,
        kind: 'definition-line',
        group: 'definition',
        sourceRoomCategory: 'mystery',
        revealOrder: order++,
        source: 'TODO: where this leaf was found',
        text: `TODO(hand-author): definition line ${i + 1} of the ${A} poem — the best writing in the game`,
        interpretation: 'TODO(hand-author): Ellery’s reading',
      });
    }
    if (i < constraints.length) {
      frags.push({
        id: `${id}-e${i + 1}`,
        kind: 'engraving',
        group: 'engravings',
        sourceRoomCategory: cats[i % 2 === 0 ? 0 : 1],
        revealOrder: order++,
        source: 'TODO: which lintel/inkstand/arch',
        text: `TODO(hand-author): in-world engraving for ${JSON.stringify(constraints[i])}`,
        constraint: constraints[i],
        interpretation: 'TODO(hand-author): Ellery’s plain reading',
      });
    }
  }
  return {
    id,
    title: 'TODO: volume title',
    epigraph: 'TODO: epigraph',
    answer: A,
    accepted: [A],
    fragments: frags,
    letters: [
      {
        id: 'pity-1', from: 'posy', earliestDay: 4, pity: true,
        subject: 'Found under the mail tray, dear',
        body: 'TODO(hand-author): pity letter — grants the next unfound fragment automatically.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const dict = loadDictionary();
  const words = [...dict.words];

  const checkPath = arg('check');
  if (checkPath) {
    const vol = JSON.parse(readFileSync(checkPath, 'utf8')) as VolumeContent;
    const constraints = vol.fragments
      .filter((f) => f.kind === 'engraving' && f.constraint)
      .map((f) => f.constraint!);
    const v = report(vol.answer, constraints, words);
    process.exit(v.ok ? 0 : 1);
  }

  const word = arg('word');
  const id = arg('id') ?? 'volume-next';
  if (!word) {
    console.error('Usage: --word <answer> --id <volumeId> [--out <file>] | --check <volume.json>');
    process.exit(2);
  }
  if (!dict.words.has(word.toLowerCase())) {
    console.error(`"${word}" is not in the dictionary — the Sanctum only accepts real words.`);
    process.exit(1);
  }

  const constraints = deriveConstraints(word);
  const v = report(word, constraints, words);
  if (!v.ok) process.exit(1);

  const out = arg('out');
  if (out) {
    writeFileSync(out, JSON.stringify(skeleton(id, word, constraints), null, 2) + '\n');
    console.log(`\nSkeleton written to ${out} — now hand-author every TODO before shipping.`);
  }
}

main();
