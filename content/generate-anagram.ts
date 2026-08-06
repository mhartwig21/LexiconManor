import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary, bandOf, type Band } from './lib/dictionary';
import { createRng, pick, shuffle, type Rng } from '../src/engine/rng';
import { signatureOf, type AnagramPuzzle, type AnagramRound } from '../src/engine/puzzles/anagram';
import type { Difficulty } from '../src/engine/types';

/**
 * Anagram generator for The Vestibule (same honesty pattern as twistle):
 *  1. Words are grouped by letter signature; a round's accepted set is the
 *     COMPLETE dictionary anagram class of its letters — a player's real
 *     word is never rejected because it wasn't the seed.
 *  2. The scramble is seeded-shuffled and re-rolled until it spells no
 *     accepted word (the mat never hands you the answer).
 *  3. Validation replays every puzzle: signature integrity, answer
 *     membership, scramble not a solution, round-count bounds.
 */

const TARGET_PER_DIFFICULTY = 60; // 240 total
const SEED = 20260805;

interface DifficultySpec {
  /** Length of each round's word, in play order. */
  roundLengths: number[];
  /** Frequency bands the SEED word may come from. */
  seedBands: Band[];
  /** Cap on anagram-class size — huge classes are guess-spam, not deduction. */
  maxAccepted: number;
}

const SPECS: Record<Difficulty, DifficultySpec> = {
  easy: { roundLengths: [5], seedBands: ['everyday'], maxAccepted: 4 },
  medium: { roundLengths: [5, 6], seedBands: ['everyday'], maxAccepted: 4 },
  hard: { roundLengths: [6, 6], seedBands: ['everyday', 'familiar'], maxAccepted: 3 },
  expert: { roundLengths: [6, 7, 7], seedBands: ['everyday', 'familiar'], maxAccepted: 3 },
};

function scrambleFor(rng: Rng, answer: string, accepted: string[]): string[] | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const letters = shuffle(rng, [...answer]);
    const asWord = letters.join('');
    if (!accepted.includes(asWord)) return letters;
  }
  return null; // pathological class (e.g. all arrangements are words) — skip
}

function main() {
  const dict = loadDictionary();
  const rng = createRng(SEED);

  // signature → anagram class, for word lengths 5–7.
  const classes = new Map<string, string[]>();
  for (const w of dict.words) {
    if (w.length < 5 || w.length > 7) continue;
    const sig = signatureOf(w);
    const cls = classes.get(sig);
    if (cls) cls.push(w.toUpperCase());
    else classes.set(sig, [w.toUpperCase()]);
  }

  // Seed pools per (length, band) — deterministic order for reproducibility.
  const pools = new Map<string, string[]>();
  for (const w of [...dict.words].sort()) {
    if (w.length < 5 || w.length > 7) continue;
    const key = `${w.length}:${bandOf(dict.rankOf(w))}`;
    const pool = pools.get(key);
    if (pool) pool.push(w.toUpperCase());
    else pools.set(key, [w.toUpperCase()]);
  }

  const puzzles: AnagramPuzzle[] = [];
  for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as Difficulty[]) {
    const spec = SPECS[difficulty];
    const usedAnswers = new Set<string>();
    let made = 0;
    let attempts = 0;
    while (made < TARGET_PER_DIFFICULTY && attempts < TARGET_PER_DIFFICULTY * 200) {
      attempts++;
      const rounds: AnagramRound[] = [];
      for (const len of spec.roundLengths) {
        const pool = spec.seedBands.flatMap((b) => pools.get(`${len}:${b}`) ?? []);
        if (pool.length === 0) break;
        const answer = pick(rng, pool);
        if (usedAnswers.has(answer)) break;
        const accepted = [...(classes.get(signatureOf(answer)) ?? [])].sort();
        if (accepted.length === 0 || accepted.length > spec.maxAccepted) break;
        const scramble = scrambleFor(rng, answer, accepted);
        if (!scramble) break;
        rounds.push({ scramble, accepted, answer });
      }
      if (rounds.length !== spec.roundLengths.length) continue;
      for (const r of rounds) usedAnswers.add(r.answer);
      puzzles.push({ id: `anagram-${difficulty}-${made + 1}`, difficulty, rounds });
      made++;
    }
    console.log(`${difficulty}: ${made} puzzles (${attempts} attempts)`);
  }

  validate(puzzles);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'anagram.json');
  writeFileSync(outPath, JSON.stringify(puzzles));
  console.log(`anagram.json: ${puzzles.length} puzzles`);
}

/** Fail the build on any dishonest or degenerate puzzle. */
function validate(puzzles: AnagramPuzzle[]) {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of puzzles) {
    if (ids.has(p.id)) problems.push(`${p.id}: duplicate id`);
    ids.add(p.id);
    if (p.rounds.length < 1 || p.rounds.length > 3) problems.push(`${p.id}: ${p.rounds.length} rounds`);
    for (const r of p.rounds) {
      const sig = signatureOf(r.scramble);
      if (!r.accepted.includes(r.answer)) problems.push(`${p.id}: answer ${r.answer} not accepted`);
      for (const w of r.accepted) {
        if (signatureOf(w) !== sig) problems.push(`${p.id}: accepted ${w} has different letters`);
      }
      if (r.accepted.includes(r.scramble.join(''))) problems.push(`${p.id}: scramble spells a solution`);
    }
  }
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`anagram validation failed with ${problems.length} problem(s)`);
  }
}

main();
