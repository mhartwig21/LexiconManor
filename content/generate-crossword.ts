import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, pick, shuffle, type Rng } from '../src/engine/rng';
import {
  validateCrosswordPuzzle,
  type CrosswordDir, type CrosswordEntry, type CrosswordPuzzle,
} from '../src/engine/puzzles/crossword';
import { gateOk } from './generate-gate';
import { tierLabel } from '../src/engine/rooms/adapters/tier-select';
import type { Tier } from '../src/engine/types';

/**
 * Mini-crossword generator for The Linen Closet. OWNER: A5.
 *
 * Assembles criss-cross layouts from the hand-authored clue bank
 * (content/authored/crossword-clues.json). The solver check is structural
 * honesty: every maximal run of ≥2 letters in the finished grid is exactly
 * one clued entry (no accidental words the player is never clued about),
 * intersections agree, and the layout is one connected piece — enforced by
 * validateCrosswordPuzzle, the same routine the tests replay over the
 * shipped pool.
 *
 * Every clue-bank word must exist in enable1 (build fails otherwise): the
 * Closet never asks for a word the house dictionary would refuse.
 *
 * ---------------------------------------------------------------------------
 * THREE TIERS, MAPPED TO MANOR ROWS (owner directive, round 4: "5x5 tier 3
 * with harder clue styles")
 * ---------------------------------------------------------------------------
 *   tier 1 — a 4×4 closet, 3 entries, easy words with plain definition clues.
 *   tier 2 — the full 5×5, 4 entries, easy+medium words, plain clues.
 *   tier 3 — 5×5, 5 entries (a denser criss-cross), the whole bank including
 *            hard/expert words, and at least MIN_WRY_ENTRIES of the clues are
 *            drawn from the bank's `wry` column: misdirecting, double-meaning,
 *            manor-voiced clues rather than dictionary glosses. Difficulty here
 *            is a knob on how the CLUE reads, not on how much there is to do —
 *            AAA 3.8's hard-mode philosophy.
 */

const SEED = 20260806;
const dir = dirname(fileURLToPath(import.meta.url));

/**
 * Per-WORD authoring tag in content/authored/crossword-clues.json. This is a
 * property of the word+clue pair (how hard that answer is to see), NOT the
 * retired puzzle-level `difficulty` alias — a tier-3 closet is built FROM these
 * tags, it does not carry one.
 */
type ClueDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

interface ClueDef {
  word: string;
  clue: string;
  /** Optional harder clue style: misdirection / double meaning (tier 3). */
  wry?: string;
  difficulty: ClueDifficulty;
}

const DIFFS: ClueDifficulty[] = ['easy', 'medium', 'hard', 'expert'];
const TIERS: Tier[] = [1, 2, 3];

/** Grid side per tier — the closet itself grows. */
const SIZES: Record<Tier, number> = { 1: 4, 2: 5, 3: 5 };
const TARGET: Record<Tier, number> = { 1: 30, 2: 30, 3: 30 };
const ENTRIES: Record<Tier, number> = { 1: 3, 2: 4, 3: 5 };
/** Bank words a tier may draw on (by their authored difficulty). */
const BANK_DIFFS: Record<Tier, ClueDifficulty[]> = {
  1: ['easy'],
  2: ['easy', 'medium'],
  3: ['easy', 'medium', 'hard', 'expert'],
};
/** Every puzzle must headline at least one word of one of these difficulties. */
const HEADLINE_DIFFS: Record<Tier, ClueDifficulty[]> = {
  1: ['easy'], 2: ['medium'], 3: ['hard', 'expert'],
};
/** Tier 3 must read at least this many clues in the harder, wry style. */
const MIN_WRY_ENTRIES = 2;
/** Cap on how often one word may headline puzzles of a tier. */
const MAX_WORD_USES = 4;

type TieredCrosswordPuzzle = CrosswordPuzzle & { tier: Tier };

interface Placed { dir: CrosswordDir; row: number; col: number; word: ClueDef; }

function toPuzzle(id: string, tier: Tier, placed: Placed[], useWry: boolean): TieredCrosswordPuzzle {
  const SIZE = SIZES[tier];
  // Real-crossword numbering: entry starts in reading order.
  const sorted = [...placed].sort((a, b) => a.row - b.row || a.col - b.col || (a.dir === 'across' ? -1 : 1));
  const numberOf = new Map<string, number>();
  let n = 0;
  const entries: CrosswordEntry[] = sorted.map((p) => {
    const startKey = `${p.row},${p.col}`;
    let num = numberOf.get(startKey);
    if (num === undefined) {
      num = ++n;
      numberOf.set(startKey, num);
    }
    return {
      id: `${num}${p.dir === 'across' ? 'A' : 'D'}`,
      dir: p.dir,
      row: p.row,
      col: p.col,
      answer: p.word.word,
      clue: useWry && p.word.wry ? p.word.wry : p.word.clue,
    };
  });
  return { id, tier, size: SIZE, entries };
}

/** Structural problems, ignoring the entry-count rule while mid-build. */
function partialProblems(tier: Tier, placed: Placed[]): string[] {
  const puzzle = toPuzzle('partial', tier, placed, false);
  return validateCrosswordPuzzle(puzzle).filter((p) => !p.includes('entries (want'));
}

function tryBuild(rng: Rng, tier: Tier, bank: ClueDef[], exact: ClueDef[], count: number): Placed[] | null {
  const SIZE = SIZES[tier];
  const first = pick(rng, exact);
  if (first.word.length > SIZE) return null;
  const placed: Placed[] = [{
    dir: 'across',
    row: Math.floor((SIZE - 1) / 2),
    col: Math.floor((SIZE - first.word.length) / 2),
    word: first,
  }];
  const used = new Set([first.word]);

  let stalls = 0;
  while (placed.length < count && stalls < 40) {
    stalls++;
    const host = pick(rng, placed);
    const p = Math.floor(rng() * host.word.word.length);
    const letter = host.word.word[p]!;
    const hostRow = host.dir === 'down' ? host.row + p : host.row;
    const hostCol = host.dir === 'across' ? host.col + p : host.col;
    const newDir: CrosswordDir = host.dir === 'across' ? 'down' : 'across';

    const candidates = shuffle(rng, bank.filter((c) => !used.has(c.word) && c.word.includes(letter)));
    for (const cand of candidates.slice(0, 25)) {
      const positions = [...cand.word].map((ch, i) => (ch === letter ? i : -1)).filter((i) => i >= 0);
      const q = pick(rng, positions);
      const row = newDir === 'down' ? hostRow - q : hostRow;
      const col = newDir === 'across' ? hostCol - q : hostCol;
      if (row < 0 || col < 0) continue;
      if (newDir === 'down' && row + cand.word.length > SIZE) continue;
      if (newDir === 'across' && col + cand.word.length > SIZE) continue;
      const attempt: Placed[] = [...placed, { dir: newDir, row, col, word: cand }];
      if (partialProblems(tier, attempt).length > 0) continue;
      placed.push({ dir: newDir, row, col, word: cand });
      used.add(cand.word);
      stalls = 0;
      break;
    }
  }
  return placed.length === count ? placed : null;
}

function main() {
  const rng = createRng(SEED);
  const raw = JSON.parse(readFileSync(join(dir, 'authored', 'crossword-clues.json'), 'utf8')) as { clues: ClueDef[] };
  const enable1 = new Set(
    readFileSync(join(dir, 'data', 'enable1.txt'), 'utf8').split('\n').map((w) => w.trim().toUpperCase()),
  );

  // Bank validation: hard failures — the Closet never clues a non-word.
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of raw.clues) {
    if (seen.has(c.word)) problems.push(`${c.word}: duplicate bank word`);
    seen.add(c.word);
    if (!/^[A-Z]{3,5}$/.test(c.word)) problems.push(`${c.word}: not 3–5 uppercase letters`);
    if (!enable1.has(c.word)) problems.push(`${c.word}: not in enable1`);
    // The cozy gate: the Closet prints its answers in the manor's voice (task 2).
    if (!gateOk(c.word.toLowerCase())) problems.push(`${c.word}: fails the cozy gate`);
    if (!c.clue || c.clue.trim().length < 3) problems.push(`${c.word}: missing clue`);
    if (c.clue.length > 60) problems.push(`${c.word}: clue too long for the 390px clue bar`);
    if (c.wry !== undefined) {
      if (c.wry.trim().length < 3) problems.push(`${c.word}: empty wry clue`);
      if (c.wry.length > 60) problems.push(`${c.word}: wry clue too long for the 390px clue bar`);
      if (c.wry === c.clue) problems.push(`${c.word}: wry clue is the plain clue`);
    }
    if (!DIFFS.includes(c.difficulty)) problems.push(`${c.word}: bad difficulty ${c.difficulty}`);
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`crossword clue bank failed validation with ${problems.length} problem(s)`);
  }

  const puzzles: TieredCrosswordPuzzle[] = [];
  for (const tier of TIERS) {
    const size = SIZES[tier];
    const bank = raw.clues.filter(
      (c) => BANK_DIFFS[tier].includes(c.difficulty) && c.word.length <= size,
    );
    const exact = bank.filter((c) => HEADLINE_DIFFS[tier].includes(c.difficulty));
    const wryNeeded = tier === 3 ? MIN_WRY_ENTRIES : 0;
    const signatures = new Set<string>();
    const uses = new Map<string, number>();
    let made = 0;
    let attempts = 0;
    while (made < TARGET[tier] && attempts < TARGET[tier] * 600) {
      attempts++;
      const available = bank.filter((c) => (uses.get(c.word) ?? 0) < MAX_WORD_USES);
      const availableExact = exact.filter((c) => (uses.get(c.word) ?? 0) < MAX_WORD_USES);
      if (availableExact.length === 0) break;
      const placed = tryBuild(rng, tier, available, availableExact, ENTRIES[tier]);
      if (!placed) continue;
      if (!placed.some((p) => HEADLINE_DIFFS[tier].includes(p.word.difficulty))) continue;
      // Tier 3's promise: at least MIN_WRY_ENTRIES clues in the harder style.
      if (placed.filter((p) => p.word.wry).length < wryNeeded) continue;
      const sig = placed.map((p) => p.word.word).sort().join('|');
      if (signatures.has(sig)) continue;
      const puzzle = toPuzzle(`crossword-t${tier}-${made + 1}`, tier, placed, tier === 3);
      if (validateCrosswordPuzzle(puzzle).length > 0) continue;
      signatures.add(sig);
      for (const p of placed) uses.set(p.word.word, (uses.get(p.word.word) ?? 0) + 1);
      puzzles.push(puzzle);
      made++;
    }
    console.log(`tier ${tier} (${tierLabel(tier)}): ${made} puzzles, ${size}×${size}, ${ENTRIES[tier]} entries (${attempts} attempts)`);
  }

  // Final replay of the shipped pool + the tier gates.
  const finalProblems = puzzles.flatMap((p) => validateCrosswordPuzzle(p).map((m) => `${p.id}: ${m}`));
  const wryTexts = new Set(raw.clues.filter((c) => c.wry).map((c) => c.wry!));
  for (const p of puzzles) {
    if (p.size !== SIZES[p.tier]) finalProblems.push(`${p.id}: ${p.size}×${p.size} is not tier ${p.tier}'s grid`);
    if (p.entries.length !== ENTRIES[p.tier]) finalProblems.push(`${p.id}: ${p.entries.length} entries, tier ${p.tier} wants ${ENTRIES[p.tier]}`);
    if (p.tier === 3) {
      const wry = p.entries.filter((e) => wryTexts.has(e.clue)).length;
      if (wry < MIN_WRY_ENTRIES) finalProblems.push(`${p.id}: only ${wry} wry clues (tier 3 needs ${MIN_WRY_ENTRIES})`);
    }
  }
  if (finalProblems.length > 0) {
    console.error(finalProblems.slice(0, 20).join('\n'));
    throw new Error(`crossword validation failed with ${finalProblems.length} problem(s)`);
  }

  writeFileSync(join(dir, 'generated', 'crossword.json'), JSON.stringify(puzzles));
  console.log(`crossword.json: ${puzzles.length} puzzles`);
}

main();
