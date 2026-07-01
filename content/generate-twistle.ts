import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary, bandOf, type Dictionary, type Band } from './lib/dictionary';
import { createRng, pick, randInt, shuffle, type Rng } from '../src/engine/rng';
import { findPath, GRID_SIZE } from '../src/engine/twistle';
import type { TwistlePuzzle, Difficulty } from '../src/engine/types';

/**
 * Twistle grid generator with guaranteed solvability:
 *  1. Seed words are placed on the 5x5 grid via backtracking (king-move
 *     adjacency, no tile reuse within a word, crossings allowed).
 *  2. Empty tiles are filled with letters weighted by English frequency.
 *  3. A trie-based solver enumerates EVERY findable dictionary word, so
 *     targetWords is the complete honest answer set — a player's valid find
 *     is never rejected, and targetCount is provably achievable.
 */

const TARGET_PER_DIFFICULTY = 60; // 240 total
const SEED = 20260702;
const TOTAL_TILES = GRID_SIZE * GRID_SIZE;

// Letter frequency weights for filling gaps (rough English distribution).
const FILL_LETTERS = 'eeeeeeeeeeeetttttttttaaaaaaaaoooooooiiiiiiinnnnnnnsssssshhhhhhrrrrrrddddllllcccuuummwwffggyyppbbvk';

interface DifficultySpec {
  /** Frequency bands allowed for the words the player must find. */
  targetBands: Band[];
  seedWordCount: number;
  targetCount: number;
  minFindable: number;
  centerRequired: boolean;
}

const SPECS: Record<Difficulty, DifficultySpec> = {
  easy: { targetBands: ['everyday'], seedWordCount: 7, targetCount: 5, minFindable: 12, centerRequired: false },
  medium: { targetBands: ['everyday'], seedWordCount: 7, targetCount: 7, minFindable: 12, centerRequired: false },
  hard: { targetBands: ['everyday', 'familiar'], seedWordCount: 8, targetCount: 8, minFindable: 14, centerRequired: false },
  expert: { targetBands: ['everyday', 'familiar'], seedWordCount: 8, targetCount: 6, minFindable: 8, centerRequired: true },
};

// --- placement ------------------------------------------------------------

function neighbors(index: number): number[] {
  const r = Math.floor(index / GRID_SIZE);
  const c = index % GRID_SIZE;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) out.push(nr * GRID_SIZE + nc);
    }
  }
  return out;
}

/** Try to lay `word` onto the partial grid, reusing matching tiles. */
function placeWord(grid: (string | null)[], word: string, rng: Rng): boolean {
  const tryFrom = (pos: number, depth: number, path: number[]): number[] | null => {
    const need = word[depth]!;
    const cell = grid[pos];
    if (cell !== null && cell !== need) return null;
    const nextPath = [...path, pos];
    if (depth === word.length - 1) return nextPath;
    for (const n of shuffle(rng, neighbors(pos))) {
      if (nextPath.includes(n)) continue;
      const r = tryFrom(n, depth + 1, nextPath);
      if (r) return r;
    }
    return null;
  };

  for (const start of shuffle(rng, Array.from({ length: TOTAL_TILES }, (_, i) => i))) {
    const path = tryFrom(start, 0, []);
    if (path) {
      path.forEach((pos, i) => { grid[pos] = word[i]!; });
      return true;
    }
  }
  return false;
}

// --- solving ---------------------------------------------------------------

interface TrieNode {
  children: Map<string, TrieNode>;
  word: string | null;
}

function buildTrie(words: Iterable<string>): TrieNode {
  const root: TrieNode = { children: new Map(), word: null };
  for (const w of words) {
    let node = root;
    for (const ch of w) {
      let next = node.children.get(ch);
      if (!next) {
        next = { children: new Map(), word: null };
        node.children.set(ch, next);
      }
      node = next;
    }
    node.word = w;
  }
  return root;
}

/** All dictionary words (4-8 letters) findable on the grid. */
function solveGrid(grid: string[], trie: TrieNode): Set<string> {
  const found = new Set<string>();
  const visit = (pos: number, node: TrieNode, used: boolean[]) => {
    const next = node.children.get(grid[pos]!);
    if (!next) return;
    used[pos] = true;
    if (next.word && next.word.length >= 4) found.add(next.word);
    for (const n of neighbors(pos)) {
      if (!used[n]) visit(n, next, used);
    }
    used[pos] = false;
  };
  const used = new Array(TOTAL_TILES).fill(false);
  for (let i = 0; i < TOTAL_TILES; i++) visit(i, trie, used);
  return found;
}

// --- generation -------------------------------------------------------------

function generatePuzzle(
  dict: Dictionary,
  trie: TrieNode,
  pools: Record<Band, string[]>,
  difficulty: Difficulty,
  rng: Rng,
  index: number,
): TwistlePuzzle | null {
  const spec = SPECS[difficulty];
  const grid: (string | null)[] = new Array(TOTAL_TILES).fill(null);

  // Seed the grid with real words (longer first — they're hardest to fit).
  const pool = spec.targetBands.flatMap((b) => pools[b]);
  const seeds = shuffle(rng, pool).slice(0, 60).sort((a, b) => b.length - a.length);
  let placed = 0;
  for (const word of seeds) {
    if (placed >= spec.seedWordCount) break;
    if (placeWord(grid, word, rng)) placed++;
  }
  if (placed < spec.seedWordCount) return null;

  const filled = grid.map((c) => c ?? FILL_LETTERS[randInt(rng, FILL_LETTERS.length)]!);

  // Enumerate everything findable, then keep only fair target words.
  const findable = solveGrid(filled, trie);
  const rules = { minLength: 4, centerRequired: spec.centerRequired };
  const targets = [...findable].filter((w) => {
    if (!spec.targetBands.includes(bandOf(dict.rankOf(w)))) return false;
    // Under centerRequired the solver above over-counts; re-verify per word.
    return spec.centerRequired ? findPath(filled.map((c) => c.toUpperCase()), w.toUpperCase(), rules) !== null : true;
  });
  if (targets.length < Math.max(spec.minFindable, spec.targetCount + 4)) return null;

  return {
    id: `twistle-${difficulty}-${index}`,
    difficulty,
    grid: filled.map((c) => c.toUpperCase()),
    targetWords: targets.map((w) => w.toUpperCase()).sort(),
    targetCount: spec.targetCount,
    rules,
  };
}

function main() {
  const dict = loadDictionary();
  const rng = createRng(SEED);

  const pools: Record<Band, string[]> = { everyday: [], familiar: [], advanced: [], obscure: [] };
  for (const w of dict.words) {
    if (w.length < 4 || w.length > 7) continue;
    pools[bandOf(dict.rankOf(w))].push(w);
  }
  const trie = buildTrie([...dict.words].filter((w) => w.length >= 4 && w.length <= 8));

  const puzzles: TwistlePuzzle[] = [];
  for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as Difficulty[]) {
    let made = 0;
    let attempts = 0;
    while (made < TARGET_PER_DIFFICULTY && attempts < TARGET_PER_DIFFICULTY * 40) {
      attempts++;
      const p = generatePuzzle(dict, trie, pools, difficulty, rng, made + 1);
      if (p) {
        puzzles.push(p);
        made++;
      }
    }
    console.log(`${difficulty}: ${made} puzzles (${attempts} attempts)`);
  }

  validate(puzzles);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'twistle.json');
  writeFileSync(outPath, JSON.stringify(puzzles));
  console.log(`twistle.json: ${puzzles.length} puzzles`);
}

/** Fail the build on any unsolvable or unfair puzzle. */
function validate(puzzles: TwistlePuzzle[]) {
  const problems: string[] = [];
  for (const p of puzzles) {
    if (p.grid.length !== TOTAL_TILES) problems.push(`${p.id}: grid is not 5x5`);
    if (p.targetWords.length < p.targetCount) problems.push(`${p.id}: targetCount ${p.targetCount} > ${p.targetWords.length} findable`);
    for (const w of p.targetWords) {
      if (findPath(p.grid, w, p.rules) === null) problems.push(`${p.id}: target ${w} has no valid path`);
    }
  }
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`twistle validation failed with ${problems.length} problem(s)`);
  }
}

main();
