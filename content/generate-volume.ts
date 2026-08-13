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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadDictionary } from './lib/dictionary';
import {
  constraintAdmits, solveConstraints,
  type EngravingConstraint, type VolumeContent, type VolumePlate, type VolumePlateTable,
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
// THE PLATE — how many words are still standing, for every set she can hold
// ---------------------------------------------------------------------------

/**
 * ═══ ROUND 47 — THE NUMBER THE DEDUCTION WAS MISSING ═══════════════════════
 *
 * The journal has always drawn the alphabet plate (engine/journal.alphabetFacts)
 * and never once said what it BOUGHT her. Volume 1's ten engravings narrow the
 * dictionary 171,755 → 15,232 → 6,575 → 208 → 146 → 56 → 11 → 5 → 3 → 2 → 1 and
 * that chain — the spine of the whole mystery, and the reason twenty-eight pages
 * exist rather than six — was visible only in a test file.
 *
 * The count cannot be computed in the app: the dictionary is 171,755 words and
 * 3.2 MB and is deliberately not shipped to the browser (nothing under src/
 * imports it). So it is precomputed HERE, against the same dictionary every
 * other gate reads, for every subset of the volume's engravings — 2^n numbers,
 * indexed by a bitmask in revealOrder. Ten engravings is 1,024 integers.
 *
 * It is a COUNT and never a LIST, and that is a design line rather than a
 * storage decision: telling her five words are left is the pleasure of a
 * closing field; telling her WHICH five is the answer, four pages early, to a
 * player who may spend one free word a day at the speaking tube.
 *
 * The submask sum below is not the same algorithm the test that verifies it
 * uses (tests/volume-plate.test.ts re-filters the raw dictionary with
 * `solveConstraints`), on purpose — this repo's standing rule is that a fix is
 * never verified by an instrument that shares its assumptions.
 */
export function standingTable(constraints: readonly EngravingConstraint[], words: readonly string[]): number[] {
  const n = constraints.length;
  const size = 1 << n;
  // How many words satisfy EXACTLY this set of constraints…
  const exact = new Array<number>(size).fill(0);
  for (const w of words) {
    let mask = 0;
    for (let i = 0; i < n; i++) if (constraintAdmits(constraints[i]!, w)) mask |= 1 << i;
    exact[mask]! += 1;
  }
  // …then a word stands against a set S iff its own mask is a superset of S.
  const standing = new Array<number>(size).fill(0);
  for (let mask = 0; mask < size; mask++) {
    if (exact[mask] === 0) continue;
    let sub = mask;
    for (;;) {
      standing[sub]! += exact[mask]!;
      if (sub === 0) break;
      sub = (sub - 1) & mask;
    }
  }
  return standing;
}

/** The engravings of a volume, in the order the volume reveals them — the bit
 *  order of every mask in the table above. */
export function plateEngravings(vol: VolumeContent): { id: string; constraint: EngravingConstraint }[] {
  return vol.fragments
    .filter((f) => f.kind === 'engraving' && f.constraint)
    .sort((a, b) => a.revealOrder - b.revealOrder)
    .map((f) => ({ id: f.id, constraint: f.constraint! }));
}

/**
 * THE PLATE'S CORPUS IS THE SHIPPED DICTIONARY, NOT THE GENERATOR'S.
 *
 * `loadDictionary()` drops every entry under four letters — a PUZZLE rule (no
 * three-letter answers in a hive), and 61 words wide. `tests/volume-solvability`
 * and the chain published in MANOR_DESIGN §7 both count the raw file, so a
 * plate built on the generator's filtered set would print 171,694 where every
 * other instrument in the repo says 171,755. Every engraving in volume 1 fixes
 * a length, so the two agree on every mask that matters — which is exactly why
 * this would have gone unnoticed.
 */
export function plateCorpus(): string[] {
  const path = fileURLToPath(new URL('./data/dictionary.json', import.meta.url));
  return (JSON.parse(readFileSync(path, 'utf8')) as [string, number][]).map(([w]) => w);
}

export function buildPlate(vol: VolumeContent, words: readonly string[]): VolumePlate {
  const engravings = plateEngravings(vol);
  return {
    engravingIds: engravings.map((e) => e.id),
    standing: standingTable(engravings.map((e) => e.constraint), words),
  };
}

const PLATE_PATH = fileURLToPath(new URL('./generated/volume-plate.json', import.meta.url));

function readPlateTable(): VolumePlateTable | null {
  if (!existsSync(PLATE_PATH)) return null;
  return JSON.parse(readFileSync(PLATE_PATH, 'utf8')) as VolumePlateTable;
}

function writePlate(vol: VolumeContent, plate: VolumePlate): void {
  const table: VolumePlateTable = { ...(readPlateTable() ?? {}), [vol.id]: plate };
  writeFileSync(PLATE_PATH, JSON.stringify(table, null, 2) + '\n');
  console.log(`  plate written to content/generated/volume-plate.json (${plate.standing.length} sets)`);
}

/** Does the shipped table still describe this volume? Stale is worse than
 *  missing: a plate built against yesterday's engravings prints a number the
 *  journal's own alphabet contradicts. */
function checkPlate(vol: VolumeContent): boolean {
  const shipped = readPlateTable()?.[vol.id];
  const fresh = buildPlate(vol, plateCorpus());
  if (!shipped) {
    console.log('  ✗ no plate for this volume — run: npm run content:volume-plate');
    return false;
  }
  const same =
    shipped.engravingIds.length === fresh.engravingIds.length &&
    shipped.engravingIds.every((id, i) => id === fresh.engravingIds[i]) &&
    shipped.standing.length === fresh.standing.length &&
    shipped.standing.every((n, i) => n === fresh.standing[i]);
  console.log(
    same
      ? `  ✓ plate current: ${fresh.standing[0]} words before a single engraving, ` +
        `${fresh.standing[fresh.standing.length - 1]} after all ${fresh.engravingIds.length}`
      : '  ✗ plate is STALE — run: npm run content:volume-plate',
  );
  return same;
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

  const platePath = arg('plate');
  if (platePath) {
    const vol = JSON.parse(readFileSync(platePath, 'utf8')) as VolumeContent;
    writePlate(vol, buildPlate(vol, plateCorpus()));
    return;
  }

  const checkPath = arg('check');
  if (checkPath) {
    const vol = JSON.parse(readFileSync(checkPath, 'utf8')) as VolumeContent;
    const constraints = plateEngravings(vol).map((e) => e.constraint);
    const v = report(vol.answer, constraints, words);
    const plateOk = checkPlate(vol);
    process.exit(v.ok && plateOk ? 0 : 1);
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
