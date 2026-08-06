import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, pick, shuffle, type Rng } from '../src/engine/rng';
import {
  validateCrosswordPuzzle,
  type CrosswordDir, type CrosswordEntry, type CrosswordPuzzle,
} from '../src/engine/puzzles/crossword';
import type { Difficulty } from '../src/engine/types';

/**
 * Mini-crossword generator for The Linen Closet. OWNER: A5.
 *
 * Assembles criss-cross layouts (3–5 clued words, grid ≤5×5) from the
 * hand-authored clue bank (content/authored/crossword-clues.json). The
 * solver check is structural honesty: every maximal run of ≥2 letters in
 * the finished grid is exactly one clued entry (no accidental words the
 * player is never clued about), intersections agree, and the layout is one
 * connected piece — enforced by validateCrosswordPuzzle, the same routine
 * the tests replay over the shipped pool.
 *
 * Every clue-bank word must exist in enable1 (build fails otherwise): the
 * Closet never asks for a word the house dictionary would refuse.
 */

const SEED = 20260806;
const SIZE = 5;
const dir = dirname(fileURLToPath(import.meta.url));

interface ClueDef { word: string; clue: string; difficulty: Difficulty; }

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const TARGET: Record<Difficulty, number> = { easy: 30, medium: 30, hard: 24, expert: 18 };
const ENTRIES: Record<Difficulty, number> = { easy: 3, medium: 4, hard: 4, expert: 5 };
/** Cap on how often one word may headline puzzles of a difficulty. */
const MAX_WORD_USES = 4;

interface Placed { dir: CrosswordDir; row: number; col: number; word: ClueDef; }

function toPuzzle(id: string, difficulty: Difficulty, placed: Placed[]): CrosswordPuzzle {
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
      clue: p.word.clue,
    };
  });
  return { id, difficulty, size: SIZE, entries };
}

/** Structural problems, ignoring the entry-count rule while mid-build. */
function partialProblems(placed: Placed[]): string[] {
  const puzzle = toPuzzle('partial', 'easy', placed);
  return validateCrosswordPuzzle(puzzle).filter((p) => !p.includes('entries (want'));
}

function tryBuild(rng: Rng, bank: ClueDef[], exact: ClueDef[], count: number): Placed[] | null {
  const first = pick(rng, exact);
  const placed: Placed[] = [{
    dir: 'across',
    row: 2,
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
      if (partialProblems(attempt).length > 0) continue;
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
    if (!c.clue || c.clue.trim().length < 3) problems.push(`${c.word}: missing clue`);
    if (c.clue.length > 60) problems.push(`${c.word}: clue too long for the 390px clue bar`);
    if (!DIFFS.includes(c.difficulty)) problems.push(`${c.word}: bad difficulty ${c.difficulty}`);
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`crossword clue bank failed validation with ${problems.length} problem(s)`);
  }

  const puzzles: CrosswordPuzzle[] = [];
  for (const difficulty of DIFFS) {
    const maxTier = DIFFS.indexOf(difficulty);
    const bank = raw.clues.filter((c) => DIFFS.indexOf(c.difficulty) <= maxTier);
    const exact = raw.clues.filter((c) => c.difficulty === difficulty);
    const signatures = new Set<string>();
    const uses = new Map<string, number>();
    let made = 0;
    let attempts = 0;
    while (made < TARGET[difficulty] && attempts < TARGET[difficulty] * 400) {
      attempts++;
      const available = bank.filter((c) => (uses.get(c.word) ?? 0) < MAX_WORD_USES);
      const availableExact = exact.filter((c) => (uses.get(c.word) ?? 0) < MAX_WORD_USES);
      if (availableExact.length === 0) break;
      const placed = tryBuild(rng, available, availableExact, ENTRIES[difficulty]);
      if (!placed) continue;
      if (!placed.some((p) => p.word.difficulty === difficulty)) continue;
      const sig = placed.map((p) => p.word.word).sort().join('|');
      if (signatures.has(sig)) continue;
      const puzzle = toPuzzle(`crossword-${difficulty}-${made + 1}`, difficulty, placed);
      if (validateCrosswordPuzzle(puzzle).length > 0) continue;
      signatures.add(sig);
      for (const p of placed) uses.set(p.word.word, (uses.get(p.word.word) ?? 0) + 1);
      puzzles.push(puzzle);
      made++;
    }
    console.log(`${difficulty}: ${made} puzzles (${attempts} attempts)`);
  }

  // Final replay of the shipped pool.
  const finalProblems = puzzles.flatMap((p) => validateCrosswordPuzzle(p).map((m) => `${p.id}: ${m}`));
  if (finalProblems.length > 0) {
    console.error(finalProblems.slice(0, 20).join('\n'));
    throw new Error(`crossword validation failed with ${finalProblems.length} problem(s)`);
  }

  writeFileSync(join(dir, 'generated', 'crossword.json'), JSON.stringify(puzzles));
  console.log(`crossword.json: ${puzzles.length} puzzles`);
}

main();
