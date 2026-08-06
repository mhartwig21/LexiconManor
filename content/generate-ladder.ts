import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary, bandOf, type Band } from './lib/dictionary';
import { createRng, pick, type Rng } from '../src/engine/rng';
import { oneLetterApart, shortestLadderPath, type LadderPuzzle } from '../src/engine/puzzles/ladder';
import type { Difficulty } from '../src/engine/types';

/**
 * Word-ladder generator for The Staircase.
 *
 * Ships ONE file: { words, puzzles }. `words` is the complete 4-letter
 * ladder lexicon (everyday + familiar bands) that both this generator's BFS
 * and the runtime adapter validate against — so any climb the player finds
 * is honest, and `par` is provably the fewest possible steps within the
 * very dictionary the room accepts.
 *
 * Validation replays every puzzle: endpoints in the lexicon, the shipped
 * solution is a legal climb of exactly `par` steps, and an independent BFS
 * confirms no shorter climb exists.
 */

const TARGET_PER_DIFFICULTY = 60; // 240 total
const SEED = 20260806;
const WORD_LEN = 4;

interface DifficultySpec {
  par: number;
  /** Band both endpoints must come from (rungs may use the whole lexicon). */
  endpointBands: Band[];
}

const SPECS: Record<Difficulty, DifficultySpec> = {
  easy: { par: 3, endpointBands: ['everyday'] },
  medium: { par: 4, endpointBands: ['everyday'] },
  hard: { par: 5, endpointBands: ['everyday'] },
  expert: { par: 6, endpointBands: ['everyday', 'familiar'] },
};

export interface LadderBundle {
  words: string[];
  puzzles: LadderPuzzle[];
}

/** BFS distances from `start` over the pattern-bucketed adjacency. */
function bfsDistances(start: string, adj: Map<string, string[]>): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  let frontier = [start];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const w of frontier) {
      const d = dist.get(w)!;
      for (const n of adj.get(w) ?? []) {
        if (!dist.has(n)) {
          dist.set(n, d + 1);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

function buildAdjacency(words: string[]): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  for (const w of words) {
    for (let i = 0; i < w.length; i++) {
      const pat = w.slice(0, i) + '*' + w.slice(i + 1);
      const b = buckets.get(pat);
      if (b) b.push(w);
      else buckets.set(pat, [w]);
    }
  }
  const adj = new Map<string, string[]>();
  for (const w of words) {
    const set = new Set<string>();
    for (let i = 0; i < w.length; i++) {
      const pat = w.slice(0, i) + '*' + w.slice(i + 1);
      for (const n of buckets.get(pat) ?? []) {
        if (n !== w) set.add(n);
      }
    }
    adj.set(w, [...set].sort());
  }
  return adj;
}

function main() {
  const dict = loadDictionary();
  const rng: Rng = createRng(SEED);

  // The ladder lexicon: 4-letter everyday+familiar words, sorted (stable output).
  const words = [...dict.words]
    .filter((w) => w.length === WORD_LEN && ['everyday', 'familiar'].includes(bandOf(dict.rankOf(w))))
    .map((w) => w.toUpperCase())
    .sort();
  const wordSet = new Set(words);
  const adj = buildAdjacency(words);
  const everyday = words.filter((w) => bandOf(dict.rankOf(w)) === 'everyday');
  console.log(`lexicon: ${words.length} words (${everyday.length} everyday)`);

  const puzzles: LadderPuzzle[] = [];
  const seenPairs = new Set<string>();
  for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as Difficulty[]) {
    const spec = SPECS[difficulty];
    const startPool = spec.endpointBands.includes('familiar') ? words : everyday;
    let made = 0;
    let attempts = 0;
    while (made < TARGET_PER_DIFFICULTY && attempts < TARGET_PER_DIFFICULTY * 100) {
      attempts++;
      const start = pick(rng, startPool);
      const dist = bfsDistances(start, adj);
      const targets = [...dist.entries()]
        .filter(([w, d]) => d === spec.par && startPool.includes(w) && w !== start)
        .map(([w]) => w);
      if (targets.length === 0) continue;
      const target = pick(rng, targets);
      const pairKey = [start, target].sort().join('>');
      if (seenPairs.has(pairKey)) continue;
      const solution = shortestLadderPath(start, target, wordSet);
      if (!solution || solution.length !== spec.par + 1) continue;
      seenPairs.add(pairKey);
      puzzles.push({ id: `ladder-${difficulty}-${made + 1}`, difficulty, start, target, par: spec.par, solution });
      made++;
    }
    console.log(`${difficulty}: ${made} puzzles (${attempts} attempts)`);
  }

  validate({ words, puzzles }, wordSet);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'ladder.json');
  writeFileSync(outPath, JSON.stringify({ words, puzzles }));
  console.log(`ladder.json: ${puzzles.length} puzzles`);
}

/** Fail the build on any unsolvable, dishonest, or sub-optimal puzzle. */
function validate(bundle: LadderBundle, wordSet: Set<string>) {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of bundle.puzzles) {
    if (ids.has(p.id)) problems.push(`${p.id}: duplicate id`);
    ids.add(p.id);
    if (!wordSet.has(p.start) || !wordSet.has(p.target)) problems.push(`${p.id}: endpoint not in lexicon`);
    if (p.solution.length !== p.par + 1) problems.push(`${p.id}: solution length ${p.solution.length} != par ${p.par} + 1`);
    if (p.solution[0] !== p.start || p.solution[p.solution.length - 1] !== p.target) {
      problems.push(`${p.id}: solution endpoints mismatch`);
    }
    for (let i = 1; i < p.solution.length; i++) {
      if (!oneLetterApart(p.solution[i - 1]!, p.solution[i]!)) problems.push(`${p.id}: illegal step ${i}`);
      if (!wordSet.has(p.solution[i]!)) problems.push(`${p.id}: rung ${p.solution[i]} not in lexicon`);
    }
    const best = shortestLadderPath(p.start, p.target, wordSet);
    if (!best || best.length - 1 !== p.par) problems.push(`${p.id}: par ${p.par} is not optimal (${best ? best.length - 1 : 'none'})`);
  }
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`ladder validation failed with ${problems.length} problem(s)`);
  }
}

main();
