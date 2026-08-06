import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary, bandOf, type Dictionary, type Band } from './lib/dictionary';
import { gateOk } from './generate-gate';
import { createRng, pick, randInt, shuffle, type Rng } from '../src/engine/rng';
import { findPath, centerIndex, gridSize } from '../src/engine/twistle';
import { tierLabel } from '../src/engine/rooms/adapters/tier-select';
import type { TwistlePuzzle, Tier } from '../src/engine/types';

/**
 * Twistle grid generator with guaranteed solvability:
 *  1. Seed words are placed on the board via backtracking (king-move
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
 * `tier` (1|2|3 ⇢ rows 0–2 / 3–4 / 5–6) is the one authoritative field. (The
 * old `difficulty` display alias is retired — derive a word from the tier with
 * `tierLabel()` if one is ever wanted.)
 *
 * The escalation is now carried by BOTH halves of the directive:
 *
 *   0. BOARD SIZE. Tiers 1–2 keep the classic 5×5; TIER 3 IS A 6×6. Eleven
 *      extra tiles is a materially different room to read — the eye can no
 *      longer take the whole board in one fixation — and it is what makes the
 *      tortuosity floors below reachable at all: a 5×5 simply does not have
 *      room for many 5+ letter words that turn four times through one tile.
 *      `size` ships on every puzzle; engine/twistle.ts and TwistleView derive
 *      their metrics from the board, so nothing is told the size twice.
 *   1. TORTUOSITY FLOOR. Every target's shortest valid trace is measured for
 *      *turns* (direction changes between consecutive steps). Tier 1 targets
 *      are mostly straight runs (≤1 turn); tier 3 demands FOUR turns from every
 *      target — no straight-line gimme exists on the board at all, and the
 *      word genuinely corkscrews.
 *   2. LENGTH FLOOR. minLength climbs 4 → 4 → 5, so tier 3 refuses the
 *      four-letter chaff the eye finds for free.
 *   3. THE CENTRE CONSTRAINT. Tier 3 alone sets `centerRequired`, forcing
 *      every trace through the board's centre tile — a Wordle-hard-mode-shaped
 *      knob that constrains the player rather than adding content (AAA 3.8).
 *      On the 6×6 the centre is `centerIndex(6)` = tile 14 (row 2, col 2): one
 *      of the four middle tiles, chosen by the engine so the generator, the
 *      solver and the marked tile in the view can never disagree.
 */

const TARGET_PER_TIER = 70; // 3 tiers => 210 total
const SEED = 20260702;

/** Board side length per tier — the Gallery itself grows at the top. */
const SIZES: Record<Tier, number> = { 1: 5, 2: 5, 3: 6 };

// Letter frequency weights for filling gaps (rough English distribution).
const FILL_LETTERS = 'eeeeeeeeeeeetttttttttaaaaaaaaoooooooiiiiiiinnnnnnnsssssshhhhhhrrrrrrddddllllcccuuummwwffggyyppbbvk';

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
  // 6×6: more tiles to seed (10 words; the rest of the board fills with
  // frequency noise), and the twist bar goes up a notch now that there is room
  // for it — EVERY tier-3 target turns at least four times (the old 5×5 tier 3
  // asked for three), so the entry twist is ≥4 by construction. minFindable
  // rises to the lower rows' floor as well: the top of the manor should offer
  // no less CHOICE than the ground floor, only harder traces.
  3: { targetBands: ['everyday', 'familiar'], seedWordCount: 10, targetCount: 6, minFindable: 12,
       centerRequired: true, minLength: 5, minTurns: 4, minEntryTurns: 4, maxEntryTurns: 99 },
};

// --- path tortuosity --------------------------------------------------------

/**
 * The straightest trace this word has on the grid, in turns — or null if the
 * word cannot be traced under the rules at all. A word is only as easy as its
 * easiest reading, so we gate on the LEAST twisted path available: a word with
 * any straight reading counts as straight. That keeps the tier-3 promise
 * honest.
 *
 * Branch-and-bound rather than "enumerate every trace and take the min": on a
 * 6×6 board a common word can have hundreds of readings and this runs for every
 * candidate of every attempt, which is what made the naive version too slow to
 * generate the tier-3 pool at all. Pruning at `turns >= best` (and bailing the
 * moment a 0-turn reading is found) collapses it.
 */
function straightestTurns(grid: string[], word: string, rules: TwistlePuzzle['rules']): number | null {
  const target = word.toUpperCase();
  if (target.length < rules.minLength) return null;
  const n = gridSize(grid);
  const centre = centerIndex(n);
  const used = new Array<boolean>(grid.length).fill(false);
  let best = Infinity;

  const walk = (pos: number, depth: number, prevStep: number, turns: number, hitCentre: boolean) => {
    if (depth === target.length) {
      if (rules.centerRequired && !hitCentre) return;
      best = turns;
      return;
    }
    for (const nb of neighbors(pos, n)) {
      if (used[nb]) continue;
      if (grid[nb] !== target[depth]) continue;
      // Direction as a small integer: (dr+1)*3 + (dc+1).
      const step = (Math.floor(nb / n) - Math.floor(pos / n) + 1) * 3 + ((nb % n) - (pos % n) + 1);
      const t = prevStep >= 0 && step !== prevStep ? turns + 1 : turns;
      if (t >= best) continue;
      used[nb] = true;
      walk(nb, depth + 1, step, t, hitCentre || nb === centre);
      used[nb] = false;
      if (best === 0) return;
    }
  };

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== target[0]) continue;
    used[i] = true;
    walk(i, 1, -1, 0, i === centre);
    used[i] = false;
    if (best === 0) break;
  }
  return best === Infinity ? null : best;
}

// --- placement ------------------------------------------------------------

function neighbors(index: number, n: number): number[] {
  const r = Math.floor(index / n);
  const c = index % n;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
    }
  }
  return out;
}

/**
 * Try to lay `word` onto the partial grid, reusing matching tiles.
 * `through` (tier 3's centre tile) forces the placed path to cross a given
 * tile — seeding real words through the marked tile is what gives a
 * `centerRequired` board enough centre-crossing targets to be worth shipping.
 */
function placeWord(grid: (string | null)[], word: string, rng: Rng, n: number, through?: number): boolean {
  const tryFrom = (pos: number, depth: number, path: number[]): number[] | null => {
    const need = word[depth]!;
    const cell = grid[pos];
    if (cell !== null && cell !== need) return null;
    const nextPath = [...path, pos];
    if (depth === word.length - 1) {
      return through === undefined || nextPath.includes(through) ? nextPath : null;
    }
    for (const nb of shuffle(rng, neighbors(pos, n))) {
      if (nextPath.includes(nb)) continue;
      const r = tryFrom(nb, depth + 1, nextPath);
      if (r) return r;
    }
    return null;
  };

  for (const start of shuffle(rng, Array.from({ length: n * n }, (_, i) => i))) {
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
function solveGrid(grid: string[], trie: TrieNode, n: number): Set<string> {
  const found = new Set<string>();
  const visit = (pos: number, node: TrieNode, used: boolean[]) => {
    const next = node.children.get(grid[pos]!);
    if (!next) return;
    used[pos] = true;
    if (next.word && next.word.length >= 4) found.add(next.word);
    for (const nb of neighbors(pos, n)) {
      if (!used[nb]) visit(nb, next, used);
    }
    used[pos] = false;
  };
  const used = new Array(n * n).fill(false);
  for (let i = 0; i < n * n; i++) visit(i, trie, used);
  return found;
}

// --- generation -------------------------------------------------------------

/**
 * Shipped shape. `tier` is authoritative and `size` is explicit on every board
 * so the view never has to infer a 6×6 from a tile count.
 */
type GeneratedTwistlePuzzle = TwistlePuzzle & { tier: Tier; size: number };

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
): GeneratedTwistlePuzzle | null {
  const spec = SPECS[tier];
  const n = SIZES[tier];
  const total = n * n;
  const centre = centerIndex(n);
  const grid: (string | null)[] = new Array(total).fill(null);

  // Seed the grid with real words (longer first — they're hardest to fit).
  // On a centre-ruled board the first few seeds are forced through the marked
  // tile, so the solver has centre-crossing material to find.
  const pool = spec.targetBands.flatMap((b) => pools[b]);
  const seeds = shuffle(rng, pool).slice(0, 90).sort((a, b) => b.length - a.length);
  const throughCentre = spec.centerRequired ? Math.ceil(spec.seedWordCount / 2) : 0;
  let placed = 0;
  for (const word of seeds) {
    if (placed >= spec.seedWordCount) break;
    const through = placed < throughCentre ? centre : undefined;
    if (placeWord(grid, word, rng, n, through)) placed++;
  }
  if (placed < spec.seedWordCount) return null;

  const filled = grid.map((c) => c ?? FILL_LETTERS[randInt(rng, FILL_LETTERS.length)]!);
  const upper = filled.map((c) => c.toUpperCase());

  // Enumerate everything findable, then keep only fair target words.
  const findable = solveGrid(filled, trie, n);
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
    size: n,
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

  const puzzles: GeneratedTwistlePuzzle[] = [];
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
    const n = SIZES[tier];
    console.log(`tier ${tier} (${tierLabel(tier)}): ${made} puzzles, ${n}×${n} (${attempts} attempts)`);
    // A half-filled tier is a content bug, not a smaller pool: the manor's rows
    // would quietly start serving a neighbouring tier's boards.
    if (made < TARGET_PER_TIER) {
      throw new Error(`twistle tier ${tier}: only ${made}/${TARGET_PER_TIER} boards in ${attempts} attempts — loosen the tier ${tier} spec`);
    }
  }

  validate(puzzles);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'twistle.json');
  writeFileSync(outPath, JSON.stringify(puzzles));
  console.log(`twistle.json: ${puzzles.length} puzzles`);
}

/** Fail the build on any unsolvable, unfair, or off-tier puzzle. */
function validate(puzzles: GeneratedTwistlePuzzle[]) {
  const problems: string[] = [];
  for (const p of puzzles) {
    const spec = SPECS[p.tier];
    const n = SIZES[p.tier];
    if (p.size !== n) problems.push(`${p.id}: size ${p.size} is not tier ${p.tier}'s board (${n})`);
    if (p.grid.length !== n * n) problems.push(`${p.id}: grid is ${p.grid.length} tiles, not ${n}×${n}`);
    if (gridSize(p.grid) !== p.size) problems.push(`${p.id}: declared size disagrees with the grid`);
    if (p.targetWords.length < p.targetCount) problems.push(`${p.id}: targetCount ${p.targetCount} > ${p.targetWords.length} findable`);
    if (p.rules.minLength !== spec.minLength) problems.push(`${p.id}: minLength ${p.rules.minLength} != tier ${p.tier} floor ${spec.minLength}`);
    if (p.rules.centerRequired !== spec.centerRequired) problems.push(`${p.id}: centerRequired != tier ${p.tier} rule`);
    const turns: number[] = [];
    for (const w of p.targetWords) {
      const path = findPath(p.grid, w, p.rules);
      if (path === null) problems.push(`${p.id}: target ${w} has no valid path`);
      else if (p.rules.centerRequired && !path.includes(centerIndex(n))) {
        problems.push(`${p.id}: target ${w} misses the marked centre tile`);
      }
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
