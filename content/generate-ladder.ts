import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary, bandOf, type Band } from './lib/dictionary';
import { createRng, pick, type Rng } from '../src/engine/rng';
import { oneLetterApart, shortestLadderPath, type LadderPuzzle } from '../src/engine/puzzles/ladder';
import { gateOk, toneOk } from './generate-gate';
import type { Difficulty } from '../src/engine/types';

/**
 * Word-ladder generator for The Staircase.
 *
 * Ships ONE file: { words, solutionWords, puzzles }.
 *
 * `solutionWords` — the CLIMBING lexicon: a frequency-floored common-word
 * list (rank ≤ COMMON_RANK, tone + proper-noun gated via generate-gate.ts).
 * Endpoints, every solution rung, `par`, and the runtime "next stone" hint
 * all live inside it, Wordle-answer-list style — the game never shows the
 * player PACS, SHEW, or TITS as an answer, and par is honestly reachable
 * with words she knows (Koster-fairness, BENCHMARKS §2).
 *
 * `words` — the PROBE lexicon (everyday + familiar bands, tone-gated):
 * the generous dictionary the room accepts when SHE tries a rung. Probes
 * are free, so obscure-but-real words are honored; tone-gated words are
 * out entirely so the room never sings for one.
 *
 * Validation replays every puzzle: endpoints and rungs in solutionWords,
 * the shipped solution is a legal climb of exactly `par` steps, and an
 * independent BFS over solutionWords confirms no shorter climb exists.
 */

const TARGET_PER_DIFFICULTY = 60; // 240 total
const SEED = 20260806;
const WORD_LEN = 4;
/** Frequency floor for endpoints/rungs — everyday-common words only. */
const COMMON_RANK = 6_000;

interface DifficultySpec {
  par: number;
}

const SPECS: Record<Difficulty, DifficultySpec> = {
  easy: { par: 3 },
  medium: { par: 4 },
  hard: { par: 5 },
  expert: { par: 6 },
};

export interface LadderBundle {
  words: string[];
  solutionWords: string[];
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

  // Probe lexicon: 4-letter everyday+familiar words, tone-gated, sorted.
  const words = [...dict.words]
    .filter((w) => w.length === WORD_LEN
      && ['everyday', 'familiar'].includes(bandOf(dict.rankOf(w)) as Band)
      && toneOk(w))
    .map((w) => w.toUpperCase())
    .sort();

  // Climbing lexicon: common words she can fairly find, fully gated.
  const solutionWords = [...dict.words]
    .filter((w) => w.length === WORD_LEN
      && dict.rankOf(w) > 0 && dict.rankOf(w) <= COMMON_RANK
      && gateOk(w))
    .map((w) => w.toUpperCase())
    .sort();
  const solutionSet = new Set(solutionWords);
  for (const w of solutionWords) {
    if (!words.includes(w)) words.push(w); // probes must accept every rung
  }
  words.sort();
  const adj = buildAdjacency(solutionWords);
  console.log(`lexicon: ${words.length} probe words, ${solutionWords.length} climbing words`);

  const puzzles: LadderPuzzle[] = [];
  const seenPairs = new Set<string>();
  for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as Difficulty[]) {
    const spec = SPECS[difficulty];
    let made = 0;
    let attempts = 0;
    while (made < TARGET_PER_DIFFICULTY && attempts < TARGET_PER_DIFFICULTY * 200) {
      attempts++;
      const start = pick(rng, solutionWords);
      const dist = bfsDistances(start, adj);
      const targets = [...dist.entries()]
        .filter(([w, d]) => d === spec.par && w !== start)
        .map(([w]) => w);
      if (targets.length === 0) continue;
      const target = pick(rng, targets);
      const pairKey = [start, target].sort().join('>');
      if (seenPairs.has(pairKey)) continue;
      const solution = shortestLadderPath(start, target, solutionSet);
      if (!solution || solution.length !== spec.par + 1) continue;
      seenPairs.add(pairKey);
      puzzles.push({ id: `ladder-${difficulty}-${made + 1}`, difficulty, start, target, par: spec.par, solution });
      made++;
    }
    console.log(`${difficulty}: ${made} puzzles (${attempts} attempts)`);
    if (made < TARGET_PER_DIFFICULTY) {
      throw new Error(`ladder: only ${made}/${TARGET_PER_DIFFICULTY} ${difficulty} puzzles — raise COMMON_RANK`);
    }
  }

  validate({ words, solutionWords, puzzles }, solutionSet, new Set(words));
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'ladder.json');
  writeFileSync(outPath, JSON.stringify({ words, solutionWords, puzzles }));
  console.log(`ladder.json: ${puzzles.length} puzzles`);
}

/** Fail the build on any unsolvable, dishonest, sub-optimal, or gated puzzle. */
function validate(bundle: LadderBundle, solutionSet: Set<string>, wordSet: Set<string>) {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const w of bundle.words) {
    if (!toneOk(w)) problems.push(`probe word ${w} fails the tone gate`);
  }
  for (const w of bundle.solutionWords) {
    if (!gateOk(w)) problems.push(`climbing word ${w} fails the tone/proper-noun gate`);
    if (!wordSet.has(w)) problems.push(`climbing word ${w} missing from probe lexicon`);
  }
  for (const p of bundle.puzzles) {
    if (ids.has(p.id)) problems.push(`${p.id}: duplicate id`);
    ids.add(p.id);
    if (!solutionSet.has(p.start) || !solutionSet.has(p.target)) problems.push(`${p.id}: endpoint not in climbing lexicon`);
    if (p.solution.length !== p.par + 1) problems.push(`${p.id}: solution length ${p.solution.length} != par ${p.par} + 1`);
    if (p.solution[0] !== p.start || p.solution[p.solution.length - 1] !== p.target) {
      problems.push(`${p.id}: solution endpoints mismatch`);
    }
    for (let i = 1; i < p.solution.length; i++) {
      if (!oneLetterApart(p.solution[i - 1]!, p.solution[i]!)) problems.push(`${p.id}: illegal step ${i}`);
      if (!solutionSet.has(p.solution[i]!)) problems.push(`${p.id}: rung ${p.solution[i]} not in climbing lexicon`);
    }
    const best = shortestLadderPath(p.start, p.target, solutionSet);
    if (!best || best.length - 1 !== p.par) problems.push(`${p.id}: par ${p.par} is not optimal (${best ? best.length - 1 : 'none'})`);
  }
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`ladder validation failed with ${problems.length} problem(s)`);
  }
}

main();
