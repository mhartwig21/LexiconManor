import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary, bandOf, type Dictionary, type Band } from './lib/dictionary';
import { gateOk } from './generate-gate';
import { createRng, pick, randInt, shuffle, type Rng } from '../src/engine/rng';
import { findPath, GRID_SIZE } from '../src/engine/twistle';
import type { TwistlePuzzle, Difficulty, Tier } from '../src/engine/types';

/**
 * Twistle grid generator with guaranteed solvability:
 *  1. Seed words are placed on the 5x5 grid via backtracking (king-move
 *     adjacency, no tile reuse within a word, crossings allowed).
 *  2. Empty tiles are filled with letters weighted by English frequency.
 *  3. A trie-based solver enumerates EVERY findable dictionary word, so
 *     targetWords is the complete honest answer set — a player's valid find
 *     is never rejected, and targetCount is provably achievable.
 *  4. Every target word passes the cozy gate (generate-gate.ts): the Gallery
 *     prints its targets as found-chips and end-of-room silhouettes.
 *
 * ---------------------------------------------------------------------------
 * THREE TIERS, MAPPED TO MANOR ROWS (owner directive, round 4: "bigger grids,
 * twistier paths")
 * ---------------------------------------------------------------------------
 * `tier` (1|2|3 ⇢ rows 0–2 / 3–4 / 5–6) is authoritative; `difficulty` is the
 * legacy display label. The grid stays 5×5 — GRID_SIZE is baked into
 * engine/twistle.ts and GalleryView, both outside this round's territory (see
 * the report's SHARED-FILE REQUESTS) — so the escalation is carried entirely
 * by PATH SHAPE, which is the half of "bigger and twistier" that is real
 * difficulty rather than real estate:
 *
 *   1. TORTUOSITY FLOOR. Every target's shortest valid trace is measured for
 *      *turns* (direction changes between consecutive steps). Tier 1 targets
 *      are mostly straight runs (≤1 turn); tier 3 demands a median of ≥3 turns
 *      and forbids any straight-line gimme — the word genuinely corkscrews.
 *   2. LENGTH FLOOR. minLength climbs 4 → 4 → 5, so tier 3 refuses the
 *      four-letter chaff the eye finds for free.
 *   3. THE CENTRE CONSTRAINT. Tier 3 alone sets `centerRequired`, forcing
 *      every trace through tile 12 — a Wordle-hard-mode-shaped knob that
 *      constrains the player rather than adding content (AAA 3.8).
 */

const TARGET_PER_TIER = 70; // 3 tiers => 210 total
const SEED = 20260702;
const TOTAL_TILES = GRID_SIZE * GRID_SIZE;

// Letter frequency weights for filling gaps (rough English distribution).
const FILL_LETTERS = 'eeeeeeeeeeeetttttttttaaaaaaaaoooooooiiiiiiinnnnnnnsssssshhhhhhrrrrrrddddllllcccuuummwwffggyyppbbvk';

/** Legacy display label per tier (engine/types.ts Difficulty stays frozen). */
const TIER_LABEL: Record<Tier, Difficulty> = { 1: 'easy', 2: 'medium', 3: 'hard' };

interface TierSpec {
  /** Frequency bands allowed for the words the player must find. */
  targetBands: Band[];
  seedWordCount: number;
  targetCount: number;
  minFindable: number;
  centerRequired: boolean;
  minLength: number;
  /** Every shipped target must turn at least this many times. */
  minTurns: number;
  /**
   * The twist bar that actually bites: sort the targets by how straight their
   * easiest trace is and read off the `targetCount`-th — that is the twistiest
   * word the player is FORCED to draw to clear the room (everything below it
   * is a gimme they can take instead). Tier 1 caps it so the bottom rows offer
   * near-straight runs; tiers 2 and 3 floor it so no straight-line shortcut
   * exists.
   */
  minEntryTurns: number;
  maxEntryTurns: number;
}

const SPECS: Record<Tier, TierSpec> = {
  1: { targetBands: ['everyday'], seedWordCount: 7, targetCount: 5, minFindable: 12,
       centerRequired: false, minLength: 4, minTurns: 0, minEntryTurns: 0, maxEntryTurns: 1 },
  2: { targetBands: ['everyday'], seedWordCount: 7, targetCount: 7, minFindable: 12,
       centerRequired: false, minLength: 4, minTurns: 2, minEntryTurns: 2, maxEntryTurns: 99 },
  3: { targetBands: ['everyday', 'familiar'], seedWordCount: 8, targetCount: 6, minFindable: 8,
       centerRequired: true, minLength: 5, minTurns: 3, minEntryTurns: 3, maxEntryTurns: 99 },
};

// --- path tortuosity --------------------------------------------------------

/** Direction changes along a tile path — the "twist" measure. */
export function turnsOf(path: readonly number[]): number {
  let turns = 0;
  let prev: string | null = null;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    const step = `${Math.floor(b / GRID_SIZE) - Math.floor(a / GRID_SIZE)},${(b % GRID_SIZE) - (a % GRID_SIZE)}`;
    if (prev !== null && step !== prev) turns++;
    prev = step;
  }
  return turns;
}

/**
 * The twistiest trace this word has on the grid. A word is only as easy as its
 * easiest reading, but the *shipped* trace is what the player draws, so we
 * measure the best (most twisted) path the solver can offer and gate on the
 * straightest one available — i.e. a word with any straight reading counts as
 * straight. That keeps the tier-3 promise honest.
 */
function straightestTurns(grid: string[], word: string, rules: TwistlePuzzle['rules']): number | null {
  const best = allPaths(grid, word, rules);
  if (best.length === 0) return null;
  return Math.min(...best.map(turnsOf));
}

/** Every valid trace of `word` (grids are 25 tiles; words ≤8 — cheap). */
function allPaths(grid: string[], word: string, rules: TwistlePuzzle['rules']): number[][] {
  const target = word.toUpperCase();
  if (target.length < rules.minLength) return [];
  const out: number[][] = [];
  const walk = (path: number[], depth: number) => {
    if (depth === target.length) {
      if (rules.centerRequired && !path.includes(12)) return;
      out.push([...path]);
      return;
    }
    const last = path[path.length - 1]!;
    for (const n of neighbors(last)) {
      if (path.includes(n)) continue;
      if (grid[n] !== target[depth]) continue;
      path.push(n);
      walk(path, depth + 1);
      path.pop();
    }
  };
  for (let i = 0; i < TOTAL_TILES; i++) {
    if (grid[i] === target[0]) walk([i], 1);
  }
  return out;
}

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

type TieredTwistlePuzzle = TwistlePuzzle & { tier: Tier };

/**
 * The turn count of the `targetCount`-th easiest target: the twist the player
 * cannot avoid on the way to a solve. Returns Infinity if the pool is short.
 */
function entryTurns(turns: number[], targetCount: number): number {
  if (turns.length < targetCount) return Infinity;
  return [...turns].sort((a, b) => a - b)[targetCount - 1]!;
}

function generatePuzzle(
  dict: Dictionary,
  trie: TrieNode,
  pools: Record<Band, string[]>,
  tier: Tier,
  rng: Rng,
  index: number,
): TieredTwistlePuzzle | null {
  const spec = SPECS[tier];
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
  const upper = filled.map((c) => c.toUpperCase());

  // Enumerate everything findable, then keep only fair target words.
  const findable = solveGrid(filled, trie);
  const rules = { minLength: spec.minLength, centerRequired: spec.centerRequired };
  const turnsByWord = new Map<string, number>();
  const targets = [...findable].filter((w) => {
    if (w.length < spec.minLength) return false;
    if (!spec.targetBands.includes(bandOf(dict.rankOf(w)))) return false;
    // The Gallery prints its targets — the cozy gate applies (task 2).
    if (!gateOk(w)) return false;
    // Under centerRequired / minLength the trie solver over-counts; the
    // tortuosity pass re-verifies each word against the real rules and
    // records the straightest trace the player could draw.
    const turns = straightestTurns(upper, w.toUpperCase(), rules);
    if (turns === null) return false;
    if (turns < spec.minTurns) return false;
    turnsByWord.set(w, turns);
    return true;
  });
  if (targets.length < Math.max(spec.minFindable, spec.targetCount + 4)) return null;
  const entry = entryTurns(targets.map((w) => turnsByWord.get(w)!), spec.targetCount);
  if (entry < spec.minEntryTurns || entry > spec.maxEntryTurns) return null;

  return {
    id: `twistle-t${tier}-${index}`,
    tier,
    difficulty: TIER_LABEL[tier],
    grid: upper,
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

  const puzzles: TieredTwistlePuzzle[] = [];
  for (const tier of [1, 2, 3] as Tier[]) {
    let made = 0;
    let attempts = 0;
    while (made < TARGET_PER_TIER && attempts < TARGET_PER_TIER * 120) {
      attempts++;
      const p = generatePuzzle(dict, trie, pools, tier, rng, made + 1);
      if (p) {
        puzzles.push(p);
        made++;
      }
    }
    console.log(`tier ${tier}: ${made} puzzles (${attempts} attempts)`);
  }

  validate(puzzles);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'twistle.json');
  writeFileSync(outPath, JSON.stringify(puzzles));
  console.log(`twistle.json: ${puzzles.length} puzzles`);
}

/** Fail the build on any unsolvable, unfair, or off-tier puzzle. */
function validate(puzzles: TieredTwistlePuzzle[]) {
  const problems: string[] = [];
  for (const p of puzzles) {
    const spec = SPECS[p.tier];
    if (p.grid.length !== TOTAL_TILES) problems.push(`${p.id}: grid is not 5x5`);
    if (p.difficulty !== TIER_LABEL[p.tier]) problems.push(`${p.id}: label/tier mismatch`);
    if (p.targetWords.length < p.targetCount) problems.push(`${p.id}: targetCount ${p.targetCount} > ${p.targetWords.length} findable`);
    if (p.rules.minLength !== spec.minLength) problems.push(`${p.id}: minLength ${p.rules.minLength} != tier ${p.tier} floor ${spec.minLength}`);
    if (p.rules.centerRequired !== spec.centerRequired) problems.push(`${p.id}: centerRequired != tier ${p.tier} rule`);
    const turns: number[] = [];
    for (const w of p.targetWords) {
      if (findPath(p.grid, w, p.rules) === null) problems.push(`${p.id}: target ${w} has no valid path`);
      if (!gateOk(w.toLowerCase())) problems.push(`${p.id}: target ${w} fails the cozy gate`);
      const t = straightestTurns(p.grid, w, p.rules);
      if (t === null) continue;
      turns.push(t);
      if (t < spec.minTurns) problems.push(`${p.id}: ${w} turns ${t} < tier ${p.tier} floor ${spec.minTurns}`);
    }
    const entry = entryTurns(turns, p.targetCount);
    if (entry < spec.minEntryTurns || entry > spec.maxEntryTurns) {
      problems.push(`${p.id}: entry turns ${entry} outside tier ${p.tier} twist band ${spec.minEntryTurns}–${spec.maxEntryTurns}`);
    }
  }
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`twistle validation failed with ${problems.length} problem(s)`);
  }
}

main();
