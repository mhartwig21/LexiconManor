/**
 * Sudoku — The Counting House's ledger puzzle. OWNER: sudoku room agent.
 *
 * Pure engine: no React, no DOM, no audio. The lexicographer balanced the
 * household books on 9x9 ledger leaves — every row, column, and quarter must
 * carry all nine figures exactly once.
 *
 * OWNER DIRECTIVE (playtest round): the player is an EXPERT solver — expert
 * difficulty is the BASELINE. Difficulty is rated by SOLVER TECHNIQUE TIERS,
 * not by given count (given count is a famously bad proxy):
 *   level 0  naked/hidden singles              (below the bar — never shipped)
 *   level 1  locked candidates, naked/hidden pairs   ≈ NYT hard/expert (tier 1)
 *   level 2  naked/hidden triples, X-wing, XY-wing   (tier 2)
 *   level 3  swordfish, XYZ-wing, simple colouring   ≈ diabolical (tier 3)
 * A shipped tier-N puzzle REQUIRES at least one level-N technique (lower
 * ladders stall) and is fully solvable with the ladder — verified offline by
 * content/generate-sudoku.ts and replayed in tests/puzzles/sudoku.test.ts.
 *
 * The band boundaries were set from the measured ceiling distribution over
 * ~1500 dug boards, not from taste: with XY-wing sitting at level 3 the
 * middle band was empty (a board that needs a triple or an X-wing almost
 * always needs an XY-wing too), and with no chain technique on the ladder the
 * top band was ~0.2% (swordfish alone). Colouring pulls genuinely diabolical
 * boards — the ones that stall every subset and wing — into a verifiable
 * tier 3 instead of the discard pile.
 *
 * ═══ PLAY MODEL (round 5 rewrite — economy semantics in sudoku-adapter.ts) ═══
 * The previous model checked every ink against `puzzle.solution` and refused
 * anything that disagreed. That made an ink a *paid correctness oracle*: at a
 * bivalue cell a refusal fully resolved the cell for the price of the
 * sanctioned hint, so XY-wing, XYZ-wing and colouring — every level-2/3
 * technique the tier system is built on — could be bisected instead of
 * deduced, and the Diabolical band was unenforceable in play. Beside NYT Hard,
 * where you may enter a wrong digit and live with it, an expert noticed in ten
 * seconds that the board would not let her be wrong.
 *
 * The refusal is now SPLIT (AAA 3.2 / R.1's principle):
 *   - pencil marks are thinking: free, unlimited;
 *   - a figure that DUPLICATES A VISIBLE PEER is MALFORMED — the board already
 *     showed her the clash, so it is a dead letter: free shake + reason toast,
 *     no ledger entry, nothing lands;
 *   - a board-legal figure LANDS, unsettled, and costs NOTHING at placement.
 *     It is a hypothesis, and hypotheses are what sudoku is made of. It can be
 *     lifted again with `uninkCell` — earned information persists (AAA 3.3),
 *     and so does earned error;
 *   - the one priced claim is BALANCING THE BOOKS: "N of M figures are astray"
 *     without naming them — the same claim grammar as the Darkroom's "N of M
 *     letters ring true" and the Linen Closet's full-grid check. An identical
 *     re-balance is free (never charge twice for the same claim).
 *
 * Because a malformed ink never lands, a leaf with all 81 cells filled has no
 * duplicate in any unit; with a generator-verified UNIQUE solution that grid
 * IS the solution. "Full" and "won" are therefore the same event, honestly.
 *
 * Board encoding: 81-char strings, row-major, '1'..'9' or '.' for blank.
 */

import { createRng, shuffle, type Rng } from '../rng';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SudokuTier = 1 | 2 | 3;

export type TechniqueId =
  | 'naked-single' | 'hidden-single'
  | 'locked-candidates' | 'naked-pair' | 'hidden-pair'
  | 'naked-triple' | 'hidden-triple' | 'x-wing' | 'xy-wing'
  | 'swordfish' | 'xyz-wing' | 'simple-colouring';

export type TechniqueLevel = 0 | 1 | 2 | 3;

export const TECHNIQUE_LEVEL: Record<TechniqueId, TechniqueLevel> = {
  'naked-single': 0,
  'hidden-single': 0,
  'locked-candidates': 1,
  'naked-pair': 1,
  'hidden-pair': 1,
  'naked-triple': 2,
  'hidden-triple': 2,
  'x-wing': 2,
  'xy-wing': 2,
  'swordfish': 3,
  'xyz-wing': 3,
  'simple-colouring': 3,
};

/** Player-facing names for the journal / room copy (never a bare id). */
export const TECHNIQUE_NAMES: Record<TechniqueId, string> = {
  'naked-single': 'naked single',
  'hidden-single': 'hidden single',
  'locked-candidates': 'locked candidates',
  'naked-pair': 'naked pair',
  'hidden-pair': 'hidden pair',
  'naked-triple': 'naked triple',
  'hidden-triple': 'hidden triple',
  'x-wing': 'X-wing',
  'xy-wing': 'XY-wing',
  'swordfish': 'swordfish',
  'xyz-wing': 'XYZ-wing',
  'simple-colouring': 'colouring chain',
};

export interface SudokuPuzzle {
  id: string;
  tier: SudokuTier;
  /** 81 chars, '1'..'9' or '.' — row-major. */
  givens: string;
  /** 81 chars, the unique solution — generator-verified. */
  solution: string;
  /** Techniques the rating solver actually used (for lint/review). */
  techniques: TechniqueId[];
}

export interface SudokuEngineState {
  /** 81 values, 0 = blank. Givens are pre-filled and immutable. */
  values: number[];
  /** 81 bitmasks (bit d-1 = figure d penciled). Cleared on ink. */
  pencil: number[];
  /**
   * ROUND 10 — the order the marks in each cell were written, oldest first.
   * Exactly mirrors `pencil` (a digit is in the trail iff its bit is set), and
   * exists for ONE reason: the eraser has to be able to take back the LAST
   * mark rather than the whole cell (AAA 3.3 — the room may not throw away
   * derived work in one tap). It rides the save with the rest of the room
   * state as of REVIEW_AA §5.3 — pencil work IS the solve, and an evicted iOS
   * tab may not be allowed to throw it away either.
   */
  pencilOrder: number[][];
  /** Cells filled via a purchased reveal (view styles them as 'developed'). */
  revealed: number[];
  /**
   * Board signatures already balanced — an identical re-balance is free, so
   * the room never charges twice for the same claim (the Linen Closet's
   * `checkedSignatures` rule, AAA 3.2).
   */
  balancedSignatures: string[];
  status: 'playing' | 'won';
}

/**
 * `malformed` = duplicates a visible peer; the board warned her, so it is a
 * free dead letter (AAA 3.2). `placed` = a board-legal figure landed; it may
 * still be astray, and that is the player's business, not the ledger's.
 */
export type InkResult = 'placed' | 'won' | 'malformed' | 'ignored';

/** Report from `balanceBooks` — the room's one priced claim. */
export interface BalanceReport {
  /** Player-set figures that disagree with the ledger's own solution. */
  astray: number;
  /** Player-set figures on the leaf (givens and bought figures excluded). */
  settled: number;
  /** False when there was nothing to weigh, or this exact leaf was weighed before. */
  charged: boolean;
}

// ---------------------------------------------------------------------------
// Grid geometry (precomputed once)
// ---------------------------------------------------------------------------

/** 27 units: rows 0-8, cols 9-17, boxes 18-26. Each is 9 cell indices. */
export const UNITS: readonly (readonly number[])[] = (() => {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const box: number[] = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) box.push((br * 3 + r) * 9 + bc * 3 + c);
      units.push(box);
    }
  }
  return units;
})();

/** For each cell, the 20 peers sharing a row/col/box. */
export const PEERS: readonly (readonly number[])[] = (() => {
  const peers: number[][] = Array.from({ length: 81 }, () => []);
  for (const unit of UNITS) {
    for (const a of unit) {
      for (const b of unit) {
        if (a !== b && !peers[a]!.includes(b)) peers[a]!.push(b);
      }
    }
  }
  return peers;
})();

const ALL = 0x1ff; // 9 candidate bits

/** UNITS index of the 3x3 quarter a cell sits in. */
export const boxUnitOf = (cell: number): number =>
  18 + Math.floor(Math.floor(cell / 9) / 3) * 3 + Math.floor((cell % 9) / 3);

const ORDINALS = [
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth',
] as const;

/**
 * In-world name for a UNITS index — "the fourth row", "the second column",
 * "the third quarter". The clerk's nudge (see `nextTechniqueNudge`) names a
 * place, never a figure.
 */
export function unitName(unit: number): string {
  if (unit < 0 || unit > 26) return 'the leaf';
  if (unit < 9) return `the ${ORDINALS[unit]} row`;
  if (unit < 18) return `the ${ORDINALS[unit - 9]} column`;
  return `the ${ORDINALS[unit - 18]} quarter`;
}

export function parseGrid(s: string): number[] {
  if (s.length !== 81) throw new Error(`grid string must be 81 chars, got ${s.length}`);
  return [...s].map((ch) => (ch >= '1' && ch <= '9' ? ch.charCodeAt(0) - 48 : 0));
}

export function gridToString(values: readonly number[]): string {
  return values.map((v) => (v === 0 ? '.' : String(v))).join('');
}

// ---------------------------------------------------------------------------
// Backtracking solver (bitmask MRV) — uniqueness ground truth
// ---------------------------------------------------------------------------

interface Board {
  values: number[];
  /** Candidate bitmask per cell; meaningful only where values[i] === 0. */
  cands: number[];
}

function boardFrom(values: readonly number[]): Board | null {
  const b: Board = { values: [...values], cands: Array.from({ length: 81 }, () => ALL) };
  for (let i = 0; i < 81; i++) {
    const v = b.values[i]!;
    if (v === 0) continue;
    for (const p of PEERS[i]!) {
      if (b.values[p] === v) return null; // givens conflict
    }
  }
  for (let i = 0; i < 81; i++) {
    if (b.values[i] !== 0) continue;
    let mask = ALL;
    for (const p of PEERS[i]!) {
      const v = b.values[p]!;
      if (v !== 0) mask &= ~(1 << (v - 1));
    }
    if (mask === 0) return null;
    b.cands[i] = mask;
  }
  return b;
}

const popcount = (m: number): number => {
  let n = 0;
  while (m) { m &= m - 1; n++; }
  return n;
};

const bitDigits = (m: number): number[] => {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (m & (1 << (d - 1))) out.push(d);
  return out;
};

/**
 * Count solutions up to `cap` (default 2 — enough to prove uniqueness).
 * Digit probe order is optionally seeded so the generator's first-found
 * solution is deterministic.
 */
export function countSolutions(givens: string, cap = 2, rng?: Rng): number {
  const board = boardFrom(parseGrid(givens));
  if (!board) return 0;
  const order = rng ? shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]) : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  let found = 0;

  const search = (b: Board): boolean => {
    // MRV: pick the blank cell with fewest candidates.
    let best = -1;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (b.values[i] !== 0) continue;
      const n = popcount(b.cands[i]!);
      if (n === 0) return false;
      if (n < bestCount) { bestCount = n; best = i; if (n === 1) break; }
    }
    if (best === -1) {
      found++;
      return found >= cap;
    }
    for (const d of order) {
      const bit = 1 << (d - 1);
      if (!(b.cands[best]! & bit)) continue;
      const values = [...b.values];
      const cands = [...b.cands];
      values[best] = d;
      let dead = false;
      for (const p of PEERS[best]!) {
        if (values[p] === 0) {
          cands[p] = cands[p]! & ~bit;
          if (cands[p] === 0) { dead = true; break; }
        }
      }
      if (!dead && search({ values, cands })) return true;
    }
    return false;
  };

  search(board);
  return found;
}

/** First solution found (seeded order if rng given), or null. */
export function solveOne(givens: string, rng?: Rng): string | null {
  const board = boardFrom(parseGrid(givens));
  if (!board) return null;
  const order = rng ? shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]) : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  let solution: string | null = null;

  const search = (b: Board): boolean => {
    let best = -1;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (b.values[i] !== 0) continue;
      const n = popcount(b.cands[i]!);
      if (n === 0) return false;
      if (n < bestCount) { bestCount = n; best = i; if (n === 1) break; }
    }
    if (best === -1) {
      solution = gridToString(b.values);
      return true;
    }
    for (const d of order) {
      const bit = 1 << (d - 1);
      if (!(b.cands[best]! & bit)) continue;
      const values = [...b.values];
      const cands = [...b.cands];
      values[best] = d;
      let dead = false;
      for (const p of PEERS[best]!) {
        if (values[p] === 0) {
          cands[p] = cands[p]! & ~bit;
          if (cands[p] === 0) { dead = true; break; }
        }
      }
      if (!dead && search({ values, cands })) return true;
    }
    return false;
  };

  search(board);
  return solution;
}

// ---------------------------------------------------------------------------
// Human-technique solver — the difficulty rater
// ---------------------------------------------------------------------------

/**
 * One technique application: mutates the board and reports WHERE it fired, or
 * null when it found nothing. The locus is what makes a bought nudge worth its
 * price — the clerk names a place and a method, never a figure (AAA 3.2/3.8:
 * priced help teaches, it does not solve). `unit` is a UNITS index, or null
 * for the techniques that genuinely span the leaf (fish, colouring chains).
 */
interface TechniqueHit { unit: number | null }
type Technique = (b: Board) => TechniqueHit | null;

function assign(b: Board, cell: number, d: number): void {
  b.values[cell] = d;
  b.cands[cell] = 0;
  const bit = 1 << (d - 1);
  for (const p of PEERS[cell]!) b.cands[p] = b.cands[p]! & ~bit;
}

const nakedSingle: Technique = (b) => {
  for (let i = 0; i < 81; i++) {
    if (b.values[i] === 0 && popcount(b.cands[i]!) === 1) {
      assign(b, i, bitDigits(b.cands[i]!)[0]!);
      return { unit: boxUnitOf(i) };
    }
  }
  return null;
};

const hiddenSingle: Technique = (b) => {
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u]!;
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      let spot = -1;
      let n = 0;
      let placed = false;
      for (const c of unit) {
        if (b.values[c] === d) { placed = true; break; }
        if (b.values[c] === 0 && (b.cands[c]! & bit)) { spot = c; n++; }
      }
      if (!placed && n === 1) {
        assign(b, spot, d);
        return { unit: u };
      }
    }
  }
  return null;
};

/** Pointing (box→line) and claiming (line→box). */
const lockedCandidates: Technique = (b) => {
  for (let d = 1; d <= 9; d++) {
    const bit = 1 << (d - 1);
    // Pointing: within a box, candidates for d confined to one row/col.
    for (let u = 18; u < 27; u++) {
      const spots = UNITS[u]!.filter((c) => b.values[c] === 0 && (b.cands[c]! & bit));
      if (spots.length < 2) continue;
      const rows = new Set(spots.map((c) => Math.floor(c / 9)));
      const cols = new Set(spots.map((c) => c % 9));
      const lines: number[] = [];
      if (rows.size === 1) lines.push([...rows][0]!);
      if (cols.size === 1) lines.push(9 + [...cols][0]!);
      for (const lineUnit of lines) {
        let changed = false;
        for (const c of UNITS[lineUnit]!) {
          if (!UNITS[u]!.includes(c) && b.values[c] === 0 && (b.cands[c]! & bit)) {
            b.cands[c] = b.cands[c]! & ~bit;
            changed = true;
          }
        }
        // The deduction lives in the BOX (that is where the digit is locked).
        if (changed) return { unit: u };
      }
    }
    // Claiming: within a row/col, candidates for d confined to one box.
    for (let u = 0; u < 18; u++) {
      const spots = UNITS[u]!.filter((c) => b.values[c] === 0 && (b.cands[c]! & bit));
      if (spots.length < 2) continue;
      const boxes = new Set(spots.map((c) => boxUnitOf(c)));
      if (boxes.size !== 1) continue;
      const box = UNITS[[...boxes][0]!]!;
      let changed = false;
      for (const c of box) {
        if (!UNITS[u]!.includes(c) && b.values[c] === 0 && (b.cands[c]! & bit)) {
          b.cands[c] = b.cands[c]! & ~bit;
          changed = true;
        }
      }
      if (changed) return { unit: u };
    }
  }
  return null;
};

/** Naked subsets of size n (pair/triple): n cells whose candidate union has n digits. */
function nakedSubset(n: 2 | 3): Technique {
  return (b) => {
    for (let u = 0; u < UNITS.length; u++) {
      const unit = UNITS[u]!;
      const blanks = unit.filter((c) => b.values[c] === 0 && popcount(b.cands[c]!) <= n && popcount(b.cands[c]!) >= 2);
      const combos = kCombinations(blanks, n);
      for (const combo of combos) {
        let union = 0;
        for (const c of combo) union |= b.cands[c]!;
        if (popcount(union) !== n) continue;
        let changed = false;
        for (const c of unit) {
          if (b.values[c] !== 0 || combo.includes(c)) continue;
          if (b.cands[c]! & union) {
            b.cands[c] = b.cands[c]! & ~union;
            changed = true;
          }
        }
        if (changed) return { unit: u };
      }
    }
    return null;
  };
}

/** Hidden subsets of size n: n digits confined to the same n cells of a unit. */
function hiddenSubset(n: 2 | 3): Technique {
  return (b) => {
    for (let u = 0; u < UNITS.length; u++) {
      const unit = UNITS[u]!;
      const spotsOf: number[][] = [];
      const digits: number[] = [];
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1);
        if (unit.some((c) => b.values[c] === d)) continue;
        const spots = unit.filter((c) => b.values[c] === 0 && (b.cands[c]! & bit));
        if (spots.length >= 2 && spots.length <= n) { spotsOf.push(spots); digits.push(d); }
      }
      const combos = kCombinations(digits.map((_, i) => i), n);
      for (const combo of combos) {
        const cellSet = new Set<number>();
        for (const i of combo) for (const c of spotsOf[i]!) cellSet.add(c);
        if (cellSet.size !== n) continue;
        let keepMask = 0;
        for (const i of combo) keepMask |= 1 << (digits[i]! - 1);
        let changed = false;
        for (const c of cellSet) {
          if (b.cands[c]! & ~keepMask) {
            b.cands[c] = b.cands[c]! & keepMask;
            changed = true;
          }
        }
        if (changed) return { unit: u };
      }
    }
    return null;
  };
}

/**
 * Basic fish of size n on rows or cols (X-wing n=2, swordfish n=3):
 * n base lines whose candidate positions for d cover exactly n cross lines →
 * eliminate d from those cross lines outside the base set.
 */
function fish(n: 2 | 3): Technique {
  return (b) => {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      for (const byRow of [true, false]) {
        const lineSpots: number[][] = [];
        const lineIdx: number[] = [];
        for (let l = 0; l < 9; l++) {
          const unit = UNITS[byRow ? l : 9 + l]!;
          if (unit.some((c) => b.values[c] === d)) continue;
          const spots = unit.filter((c) => b.values[c] === 0 && (b.cands[c]! & bit));
          if (spots.length >= 2 && spots.length <= n) { lineSpots.push(spots); lineIdx.push(l); }
        }
        const combos = kCombinations(lineIdx.map((_, i) => i), n);
        for (const combo of combos) {
          const cross = new Set<number>();
          for (const i of combo) {
            for (const c of lineSpots[i]!) cross.add(byRow ? c % 9 : Math.floor(c / 9));
          }
          if (cross.size !== n) continue;
          const baseLines = new Set(combo.map((i) => lineIdx[i]!));
          let changed = false;
          for (const x of cross) {
            const unit = UNITS[byRow ? 9 + x : x]!;
            for (const c of unit) {
              const base = byRow ? Math.floor(c / 9) : c % 9;
              if (baseLines.has(base)) continue;
              if (b.values[c] === 0 && (b.cands[c]! & bit)) {
                b.cands[c] = b.cands[c]! & ~bit;
                changed = true;
              }
            }
          }
          // A fish spans the leaf — there is no one unit to point at.
          if (changed) return { unit: null };
        }
      }
    }
    return null;
  };
}

/** XY-wing: pivot {x,y}; pincers {x,z} and {y,z} seen by the pivot → z falls
 *  from every cell seen by both pincers. */
const xyWing: Technique = (b) => {
  const bivalue: number[] = [];
  for (let i = 0; i < 81; i++) {
    if (b.values[i] === 0 && popcount(b.cands[i]!) === 2) bivalue.push(i);
  }
  for (const pivot of bivalue) {
    const pm = b.cands[pivot]!;
    const pincers = PEERS[pivot]!.filter((c) => b.values[c] === 0 && popcount(b.cands[c]!) === 2);
    for (let a = 0; a < pincers.length; a++) {
      for (let c2 = a + 1; c2 < pincers.length; c2++) {
        const ma = b.cands[pincers[a]!]!;
        const mb = b.cands[pincers[c2]!]!;
        // pivot {x,y}: pincer A shares exactly one digit with pivot, pincer B
        // shares the other, and A∩B is a single digit z not in the pivot.
        if (popcount(ma & pm) !== 1 || popcount(mb & pm) !== 1) continue;
        if ((ma & pm) === (mb & pm)) continue;
        const z = ma & mb & ~pm;
        if (popcount(z) !== 1) continue;
        if ((ma | mb | pm) !== (pm | z)) continue;
        const seenA = new Set(PEERS[pincers[a]!]!);
        let changed = false;
        for (const cell of PEERS[pincers[c2]!]!) {
          if (cell !== pivot && cell !== pincers[a]! && seenA.has(cell)
            && b.values[cell] === 0 && (b.cands[cell]! & z)) {
            b.cands[cell] = b.cands[cell]! & ~z;
            changed = true;
          }
        }
        // The pivot is where she should start looking.
        if (changed) return { unit: boxUnitOf(pivot) };
      }
    }
  }
  return null;
};

/** XYZ-wing: pivot {x,y,z} (three candidates) with bivalue pincers {x,z} and
 *  {y,z} among its peers → z falls from every cell seeing ALL THREE. */
const xyzWing: Technique = (b) => {
  for (let pivot = 0; pivot < 81; pivot++) {
    if (b.values[pivot] !== 0 || popcount(b.cands[pivot]!) !== 3) continue;
    const pm = b.cands[pivot]!;
    const pincers = PEERS[pivot]!.filter(
      (c) => b.values[c] === 0 && popcount(b.cands[c]!) === 2 && (b.cands[c]! & pm) === b.cands[c]!,
    );
    for (let a = 0; a < pincers.length; a++) {
      for (let c2 = a + 1; c2 < pincers.length; c2++) {
        const ma = b.cands[pincers[a]!]!;
        const mb = b.cands[pincers[c2]!]!;
        if (ma === mb) continue;                 // both pincers must differ
        if ((ma | mb) !== pm) continue;          // together they cover the pivot
        const z = ma & mb;                       // the shared digit
        if (popcount(z) !== 1) continue;
        const seenPivot = new Set(PEERS[pivot]!);
        const seenA = new Set(PEERS[pincers[a]!]!);
        let changed = false;
        for (const cell of PEERS[pincers[c2]!]!) {
          if (cell === pivot || cell === pincers[a]!) continue;
          if (!seenPivot.has(cell) || !seenA.has(cell)) continue;
          if (b.values[cell] === 0 && (b.cands[cell]! & z)) {
            b.cands[cell] = b.cands[cell]! & ~z;
            changed = true;
          }
        }
        if (changed) return { unit: boxUnitOf(pivot) };
      }
    }
  }
  return null;
};

/**
 * Simple colouring (single-digit chains) — the first genuinely chained
 * inference on the ladder, and the technique that makes the diabolical band
 * verifiable instead of "needs a guess".
 *
 * For one digit: every unit where the digit has exactly two candidate cells
 * is a STRONG link (exactly one of the pair is true). Two-colour each
 * connected component of that link graph, then:
 *   Rule 2 — two cells of the same colour share a unit → that whole colour
 *            is false → the digit falls from every cell wearing it;
 *   Rule 4 — an outside cell that sees both colours cannot hold the digit
 *            (one of the two colours is true, whichever it is).
 */
const simpleColouring: Technique = (b) => {
  for (let d = 1; d <= 9; d++) {
    const bit = 1 << (d - 1);
    const has = (c: number) => b.values[c] === 0 && (b.cands[c]! & bit) !== 0;

    // Strong links: units where d has exactly two homes.
    const links: number[][] = Array.from({ length: 81 }, () => []);
    for (const unit of UNITS) {
      if (unit.some((c) => b.values[c] === d)) continue;
      const spots = unit.filter(has);
      if (spots.length !== 2) continue;
      const [p, q] = spots as [number, number];
      if (!links[p]!.includes(q)) links[p]!.push(q);
      if (!links[q]!.includes(p)) links[q]!.push(p);
    }

    const colour = new Int8Array(81).fill(-1);
    for (let start = 0; start < 81; start++) {
      if (!has(start) || colour[start] !== -1 || links[start]!.length === 0) continue;

      // BFS 2-colouring of this component.
      const component: number[] = [start];
      colour[start] = 0;
      for (let head = 0; head < component.length; head++) {
        const cell = component[head]!;
        for (const next of links[cell]!) {
          if (colour[next] === -1) {
            colour[next] = colour[cell] === 0 ? 1 : 0;
            component.push(next);
          }
        }
      }
      if (component.length < 4) continue; // too short to say anything

      const wearing = (k: 0 | 1) => component.filter((c) => colour[c] === k);

      // Rule 2: a colour that appears twice in one unit is false outright.
      for (const k of [0, 1] as const) {
        const cells = wearing(k);
        const clash = cells.some((a, i) => cells.slice(i + 1).some((z) => PEERS[a]!.includes(z)));
        if (!clash) continue;
        let changed = false;
        for (const c of cells) {
          if (b.cands[c]! & bit) { b.cands[c] = b.cands[c]! & ~bit; changed = true; }
        }
        // A colouring chain is a whole-leaf argument.
        if (changed) return { unit: null };
      }

      // Rule 4: an outside cell seeing both colours loses the digit.
      const zero = new Set(wearing(0));
      const one = new Set(wearing(1));
      let changed = false;
      for (let c = 0; c < 81; c++) {
        if (!has(c) || colour[c] !== -1) continue;
        const peers = PEERS[c]!;
        if (peers.some((p) => zero.has(p)) && peers.some((p) => one.has(p))) {
          b.cands[c] = b.cands[c]! & ~bit;
          changed = true;
        }
      }
      if (changed) return { unit: null };
    }
  }
  return null;
};

function kCombinations(items: readonly number[], k: number): number[][] {
  const out: number[][] = [];
  const combo: number[] = [];
  const rec = (start: number) => {
    if (combo.length === k) { out.push([...combo]); return; }
    for (let i = start; i <= items.length - (k - combo.length); i++) {
      combo.push(items[i]!);
      rec(i + 1);
      combo.pop();
    }
  };
  rec(0);
  return out;
}

/** The ladder, strictly ordered easiest-first. Rating applies the LOWEST
 *  technique that makes progress, so `maxLevel` is an honest requirement. */
const LADDER: readonly { id: TechniqueId; apply: Technique }[] = [
  { id: 'naked-single', apply: nakedSingle },
  { id: 'hidden-single', apply: hiddenSingle },
  { id: 'locked-candidates', apply: lockedCandidates },
  { id: 'naked-pair', apply: nakedSubset(2) },
  { id: 'hidden-pair', apply: hiddenSubset(2) },
  { id: 'naked-triple', apply: nakedSubset(3) },
  { id: 'hidden-triple', apply: hiddenSubset(3) },
  { id: 'x-wing', apply: fish(2) },
  { id: 'xy-wing', apply: xyWing },
  { id: 'swordfish', apply: fish(3) },
  { id: 'xyz-wing', apply: xyzWing },
  { id: 'simple-colouring', apply: simpleColouring },
];

export interface Rating {
  solved: boolean;
  /** Highest technique level the lowest-first solve needed. */
  maxLevel: TechniqueLevel;
  /** Distinct techniques used, in first-use order. */
  techniques: TechniqueId[];
  /** Solved grid when solved. */
  grid: string | null;
  /**
   * Candidate bitmasks where the ladder stopped (solved or stalled). Exposed
   * for the SOUNDNESS test: a technique that ever eliminates a true digit is
   * a lying rater, and this is the state that proves it didn't (see
   * tests/puzzles/sudoku.test.ts).
   */
  cands: number[];
  /** Cell values where the ladder stopped (0 = still blank). */
  values: number[];
}

/**
 * Solve with human techniques only, lowest-first, capped at `maxLevel`.
 * The rating of a puzzle is the smallest cap under which it solves.
 */
export function solveWithTechniques(givens: string, maxLevel: TechniqueLevel = 3): Rating {
  const board = boardFrom(parseGrid(givens));
  if (!board) return { solved: false, maxLevel: 0, techniques: [], grid: null, cands: [], values: [] };
  const used: TechniqueId[] = [];
  let level: TechniqueLevel = 0;

  for (;;) {
    if (board.values.every((v) => v !== 0)) {
      return {
        solved: true, maxLevel: level, techniques: used,
        grid: gridToString(board.values), cands: board.cands, values: board.values,
      };
    }
    let progressed = false;
    for (const t of LADDER) {
      if (TECHNIQUE_LEVEL[t.id] > maxLevel) continue;
      if (t.apply(board)) {
        if (!used.includes(t.id)) used.push(t.id);
        if (TECHNIQUE_LEVEL[t.id] > level) level = TECHNIQUE_LEVEL[t.id];
        progressed = true;
        break;
      }
    }
    if (!progressed) {
      return {
        solved: false, maxLevel: level, techniques: used, grid: null,
        cands: board.cands, values: board.values,
      };
    }
  }
}

/**
 * Technique-tier rating: 1..3 when the puzzle both requires a level-N
 * technique AND solves with the full ladder; 0 = singles-only (below the
 * expert bar); null = beyond the ladder (needs chains/guessing) or invalid.
 */
export function rateSudoku(givens: string): { tier: SudokuTier | 0; techniques: TechniqueId[] } | null {
  const full = solveWithTechniques(givens, 3);
  if (!full.solved) return null;
  if (full.maxLevel === 0) return { tier: 0, techniques: full.techniques };
  // Confirm the requirement: the ladder capped one level below must stall.
  const below = solveWithTechniques(givens, (full.maxLevel - 1) as TechniqueLevel);
  if (below.solved) {
    // Lowest-first ordering makes this near-impossible, but stay honest.
    return { tier: below.maxLevel === 0 ? 0 : (below.maxLevel as SudokuTier), techniques: below.techniques };
  }
  return { tier: full.maxLevel as SudokuTier, techniques: full.techniques };
}

// ---------------------------------------------------------------------------
// Generation helpers (used offline by content/generate-sudoku.ts)
// ---------------------------------------------------------------------------

/** A full valid grid, seeded. */
export function generateSolvedGrid(rng: Rng): string {
  const empty = '.'.repeat(81);
  const grid = solveOne(empty, rng);
  if (!grid) throw new Error('unreachable: empty grid unsolvable');
  return grid;
}

/**
 * Dig a puzzle out of a solved grid: remove 180°-symmetric pairs (classic
 * newspaper aesthetic) while the solution stays unique. Digs to minimal
 * (no further symmetric removal keeps uniqueness) unless `minGivens` stops
 * it sooner.
 */
export function digPuzzle(rng: Rng, solution: string, minGivens = 0): string {
  const values = parseGrid(solution);
  const pairs: number[][] = [];
  for (let i = 0; i < 40; i++) pairs.push([i, 80 - i]);
  pairs.push([40]); // the center cell pairs with itself
  let givens = 81;
  for (const pair of shuffle(rng, pairs)) {
    if (givens - pair.length < Math.max(minGivens, 17)) continue;
    const saved = pair.map((i) => values[i]!);
    for (const i of pair) values[i] = 0;
    if (countSolutions(gridToString(values)) === 1) {
      givens -= pair.length;
    } else {
      pair.forEach((i, k) => { values[i] = saved[k]!; });
    }
  }
  return gridToString(values);
}

// ---------------------------------------------------------------------------
// Play state (pure reducers; economy semantics live in the adapter)
// ---------------------------------------------------------------------------

export function startSudoku(puzzle: SudokuPuzzle): SudokuEngineState {
  return {
    values: parseGrid(puzzle.givens),
    pencil: Array.from({ length: 81 }, () => 0),
    pencilOrder: Array.from({ length: 81 }, () => [] as number[]),
    revealed: [],
    balancedSignatures: [],
    status: 'playing',
  };
}

export function isGiven(puzzle: SudokuPuzzle, cell: number): boolean {
  return puzzle.givens[cell] !== '.';
}

/**
 * The trail a cell's mask implies when nobody wrote it by hand (a machine
 * fill, or any pre-round-10 state that reaches these reducers without one):
 * ascending figures. Keeping the two representations reconcilable here means
 * no caller has to remember to maintain both.
 */
function trailOf(mask: number, existing?: readonly number[]): number[] {
  const kept = (existing ?? []).filter((d) => mask & (1 << (d - 1)));
  for (let d = 1; d <= 9; d++) if ((mask & (1 << (d - 1))) && !kept.includes(d)) kept.push(d);
  return kept;
}

/** Pencil a figure in/out of a blank cell. Free — penciling is thinking. */
export function togglePencil(state: SudokuEngineState, cell: number, digit: number): SudokuEngineState {
  if (state.status !== 'playing' || digit < 1 || digit > 9) return state;
  if (state.values[cell] !== 0) return state;
  const pencil = [...state.pencil];
  const bit = 1 << (digit - 1);
  const on = (pencil[cell]! & bit) === 0;
  pencil[cell] = pencil[cell]! ^ bit;
  const pencilOrder = [...state.pencilOrder];
  const trail = trailOf(state.pencil[cell]!, state.pencilOrder[cell]);
  // Written → it becomes the newest mark in the cell; rubbed out → it simply
  // leaves, and the marks around it keep the order she wrote them in.
  pencilOrder[cell] = on ? [...trail, digit] : trail.filter((d) => d !== digit);
  return { ...state, pencil, pencilOrder };
}

/** Clear every pencil mark in a cell. Free. */
export function clearPencil(state: SudokuEngineState, cell: number): SudokuEngineState {
  if (state.status !== 'playing' || state.pencil[cell] === 0) return state;
  const pencil = [...state.pencil];
  pencil[cell] = 0;
  const pencilOrder = [...state.pencilOrder];
  pencilOrder[cell] = [];
  return { ...state, pencil, pencilOrder };
}

/**
 * The last mark written in a cell, or 0. The eraser NAMES its next victim on
 * the key ("Rub out 7"), so a surgical erase is never a guess about what a
 * tap will take (AAA 3.2's principle: the reason is on the glass before the
 * press, not in a toast after it).
 */
export function lastPencilMark(state: SudokuEngineState, cell: number): number {
  if (cell < 0 || cell > 80 || state.pencil[cell] === 0) return 0;
  const trail = trailOf(state.pencil[cell]!, state.pencilOrder[cell]);
  return trail[trail.length - 1] ?? 0;
}

/**
 * ROUND 10 — THE SURGICAL ERASER (AAA 3.3 [PARITY]).
 *
 * The eraser used to be `clearPencil`: one tap on a cell holding six
 * hard-won candidates and all six were gone. Candidate marks ARE the solve at
 * this room's tier ladder — a naked triple or an X-wing is nothing but marks
 * — so a single free tap that deletes an arbitrary amount of derived work is
 * a memory prosthetic that forgets, which is exactly what 3.3 forbids.
 *
 * It now lifts ONE mark, the most recent one, and the key says which. Nothing
 * is ever thrown away wholesale, each peel is separately undoable, and the
 * player who really does want the cell empty taps it out mark by mark and can
 * hand the cell straight back to "Pencil what fits" (which only fills cells
 * that carry no marks at all). `clearPencil` survives as the engine's
 * whole-cell verb — `inkCell` uses that shape — but no free tap reaches it.
 */
export function erasePencilMark(state: SudokuEngineState, cell: number): SudokuEngineState {
  const digit = lastPencilMark(state, cell);
  if (state.status !== 'playing' || digit === 0) return state;
  const pencil = [...state.pencil];
  pencil[cell] = pencil[cell]! & ~(1 << (digit - 1));
  const pencilOrder = [...state.pencilOrder];
  pencilOrder[cell] = trailOf(state.pencil[cell]!, state.pencilOrder[cell]).filter((d) => d !== digit);
  return { ...state, pencil, pencilOrder };
}

/** Candidate bitmask for a cell from the figures currently standing on the leaf. */
function visibleMask(values: readonly number[], cell: number): number {
  let mask = ALL;
  for (const p of PEERS[cell]!) {
    const v = values[p]!;
    if (v !== 0) mask &= ~(1 << (v - 1));
  }
  return mask;
}

/**
 * "Pencil what fits" — give every blank cell the figures its placed peers
 * still allow. NYT ships this as Auto Candidate Mode directly under the pad,
 * and the tier-2/3 bins are DEFINED by techniques (naked triple, X-wing,
 * swordfish, colouring) that are unreachable without complete candidate marks
 * — so hand-pencilling ~250 taps is not difficulty, it is a toll gate in front
 * of the puzzle's own design. Free, idempotent, never a hint, never touches
 * `perfect`: it derives nothing the player could not read off the grid.
 *
 * ═══ ROUND 6 FIX — IT MAY NEVER DESTROY HAND WORK (AAA 3.3) ═══
 * It used to ASSIGN the naive mask to every blank, so a second tap restored
 * the naive fill byte-identical and ten minutes of eliminations died to one
 * mis-tap 5px off the pencil toggle. Pencil work IS the solve; a free button
 * that can silently delete it is a memory prosthetic that forgets.
 *
 * Note the shape of the fix, because the obvious one is a no-op: UNIONING the
 * naive set with her marks changes nothing at all, since a hand-pruned set is
 * a SUBSET of the naive set and `prune ∪ naive === naive` — the wipe would
 * survive verbatim. Additivity has to be per CELL, not per mark: the button
 * fills the blanks she has NOT marked, and does not touch a cell she has.
 * That is the whole job it was ever for ("pencil the board for me"), and it
 * makes the button strictly monotone — it can only ever add marks where there
 * were none.
 *
 * It needs no tidying pass: `inkCell` already sweeps a landed figure out of
 * its peers' marks, so the marks stay true as the leaf fills. Erasing a cell
 * (free) hands it back to this button, and UNDO (see sudoku-adapter.ts) covers
 * everything else.
 */
export function fillPencil(state: SudokuEngineState): SudokuEngineState {
  if (state.status !== 'playing') return state;
  const pencil = [...state.pencil];
  const pencilOrder = [...state.pencilOrder];
  let changed = false;
  for (let i = 0; i < 81; i++) {
    if (state.values[i] !== 0 || pencil[i] !== 0) continue;
    pencil[i] = visibleMask(state.values, i);
    // A machine fill has no hand-order, so the trail is simply ascending —
    // the eraser then peels the highest figure first, which is the reading
    // order of the cell's own nine slots, back to front.
    pencilOrder[i] = trailOf(pencil[i]!);
    changed = true;
  }
  return changed ? { ...state, pencil, pencilOrder } : state;
}

/** True while the figure standing in `cell` is the player's own unsettled ink. */
export function isUnsettled(puzzle: SudokuPuzzle, state: SudokuEngineState, cell: number): boolean {
  return state.values[cell] !== 0 && !isGiven(puzzle, cell) && !state.revealed.includes(cell);
}

/**
 * Ink a figure — a CLAIM, not a question put to the ledger.
 *
 * A figure that duplicates a visible peer is MALFORMED: the leaf already
 * showed her the clash, so it is a dead letter — free shake, free reason
 * toast, nothing lands, no ledger entry (AAA 3.2, the hive dead-letter rule).
 * Anything else LANDS, free, and stays as her own unsettled ink even when it
 * disagrees with the solution; `uninkCell` lifts it again. The same figure is
 * swept from peers' pencil marks (the ledger tidies itself).
 *
 * Re-inking over her own unsettled figure is an edit, not a new claim, and is
 * likewise free.
 */
export function inkCell(
  puzzle: SudokuPuzzle,
  state: SudokuEngineState,
  cell: number,
  digit: number,
): { state: SudokuEngineState; result: InkResult; conflict?: number } {
  if (state.status !== 'playing' || digit < 1 || digit > 9) return { state, result: 'ignored' };
  if (cell < 0 || cell > 80) return { state, result: 'ignored' };
  // The ledger's own hand and bought figures are immutable.
  if (state.values[cell] !== 0 && !isUnsettled(puzzle, state, cell)) {
    return { state, result: 'ignored' };
  }
  if (state.values[cell] === digit) return { state, result: 'ignored' };

  const conflict = PEERS[cell]!.find((p) => state.values[p] === digit);
  if (conflict !== undefined) return { state, result: 'malformed', conflict };

  const values = [...state.values];
  values[cell] = digit;
  const pencil = [...state.pencil];
  const pencilOrder = [...state.pencilOrder];
  pencil[cell] = 0;
  pencilOrder[cell] = [];
  const bit = 1 << (digit - 1);
  for (const p of PEERS[cell]!) {
    if ((pencil[p]! & bit) === 0) continue;
    pencil[p] = pencil[p]! & ~bit;
    pencilOrder[p] = (pencilOrder[p] ?? []).filter((d) => d !== digit);
  }

  // A full leaf with no duplicate in any unit is a valid grid; the board's
  // solution is generator-verified UNIQUE, so a full leaf IS that solution.
  const won = values.every((v) => v !== 0);
  return {
    state: { ...state, values, pencil, pencilOrder, status: won ? 'won' : 'playing' },
    result: won ? 'won' : 'placed',
  };
}

/** Lift her own unsettled figure back off the leaf. Free — it was never a debt. */
export function uninkCell(
  puzzle: SudokuPuzzle,
  state: SudokuEngineState,
  cell: number,
): SudokuEngineState {
  if (state.status !== 'playing' || !isUnsettled(puzzle, state, cell)) return state;
  const values = [...state.values];
  values[cell] = 0;
  return { ...state, values };
}

/** Her own figures currently standing on the leaf (givens and bought ones excluded). */
export function unsettledCells(puzzle: SudokuPuzzle, state: SudokuEngineState): number[] {
  const out: number[] = [];
  for (let i = 0; i < 81; i++) if (isUnsettled(puzzle, state, i)) out.push(i);
  return out;
}

/**
 * BALANCE THE BOOKS — the room's one priced claim, and the only correctness
 * oracle it sells. Reports how many of her own figures are astray WITHOUT
 * naming them: the same claim grammar as the Darkroom's "N of M letters ring
 * true" and the Linen Closet's full-grid check, so all three micro-rooms
 * finally agree.
 *
 * Weighing an empty leaf, or weighing the identical leaf twice, is free: the
 * room never charges for zero information (AAA 3.2).
 */
export function balanceBooks(
  puzzle: SudokuPuzzle,
  state: SudokuEngineState,
): { state: SudokuEngineState; report: BalanceReport } {
  const mine = unsettledCells(puzzle, state);
  if (state.status !== 'playing' || mine.length === 0) {
    return { state, report: { astray: 0, settled: mine.length, charged: false } };
  }
  const astray = mine.filter((c) => state.values[c] !== puzzle.solution.charCodeAt(c) - 48).length;
  const sig = gridToString(state.values);
  const charged = !state.balancedSignatures.includes(sig);
  return {
    state: charged ? { ...state, balancedSignatures: [...state.balancedSignatures, sig] } : state,
    report: { astray, settled: mine.length, charged },
  };
}

/**
 * A WORD FROM THE CLERK — the technique nudge (AAA 3.2: priced help must be
 * worth its price; 3.8: a knob that teaches rather than one that solves).
 *
 * Buying a single figure out of ~55 blanks was 1.8% of the board for the same
 * price as a mistake, so no rational player ever bought it and the longest
 * room in the game shipped with no usable way out. This names the NEXT REAL
 * DEDUCTION on her live leaf — method and place, never a figure — which is
 * worth several cells of progress and teaches the ladder the tiers are built
 * on. Computed from `state.values`, so it tracks her actual board, wrong ink
 * and all.
 *
 * Returns null when the leaf yields nothing (including when her own figures
 * have made it insoluble) — the adapter charges nothing for that.
 */
export interface TechniqueNudge {
  id: TechniqueId;
  /** UNITS index to point at, or null for a whole-leaf argument. */
  unit: number | null;
  /** Forced figures still waiting on the leaf before this step applies. */
  singlesPending: number;
}

export function nextTechniqueNudge(values: readonly number[]): TechniqueNudge | null {
  const board = boardFrom(values);
  if (!board) return null;
  let singlesPending = 0;
  let firstSingle: TechniqueNudge | null = null;

  for (let guard = 0; guard < 100; guard++) {
    if (board.values.every((v) => v !== 0)) break;
    let fired: { id: TechniqueId; hit: TechniqueHit } | null = null;
    for (const t of LADDER) {
      const hit = t.apply(board);
      if (hit) { fired = { id: t.id, hit }; break; }
    }
    if (!fired) break;
    if (TECHNIQUE_LEVEL[fired.id] >= 1) {
      return { id: fired.id, unit: fired.hit.unit, singlesPending };
    }
    // Singles are figures the paper already forces; take them on the copy and
    // keep looking for a step that is actually worth two steps of her day.
    if (!firstSingle) firstSingle = { id: fired.id, unit: fired.hit.unit, singlesPending: 0 };
    singlesPending++;
  }
  return firstSingle;
}

/**
 * Reveal the correct figure in a cell — the expensive second button, for a
 * genuine dead end (the adapter prices it as a weight-2 hint, strictly dearer
 * than the nudge). Prefers the selected cell; with none selected it falls back
 * to the blank with the MOST candidates — the cell she is least likely to
 * crack unaided. (It used to pick the most-constrained blank, i.e. a naked
 * single: the cell she was about to fill anyway.)
 */
export function revealCell(
  puzzle: SudokuPuzzle,
  state: SudokuEngineState,
  preferred?: number,
): { state: SudokuEngineState; cell: number | null } {
  if (state.status !== 'playing') return { state, cell: null };
  let cell = preferred !== undefined && state.values[preferred] === 0 ? preferred : -1;
  if (cell === -1) {
    let bestCount = -1;
    for (let i = 0; i < 81; i++) {
      if (state.values[i] !== 0) continue;
      const n = popcount(visibleMask(state.values, i));
      if (n > bestCount) { bestCount = n; cell = i; }
    }
  }
  if (cell === -1) return { state, cell: null };
  const digit = puzzle.solution.charCodeAt(cell) - 48;
  // Her own wrong ink can be standing where the true figure needs to go. A
  // given or a bought figure can never conflict with the truth, so any peer
  // holding this digit is unsettled — lift it, then set the true figure. The
  // ledger says what belongs here; it does not say which of hers was wrong.
  let base = state;
  for (const p of PEERS[cell]!) {
    if (base.values[p] === digit) base = uninkCell(puzzle, base, p);
  }
  const { state: next } = inkCell(puzzle, base, cell, digit);
  // A bought figure is immutable: it must never be lifted back off by accident.
  return { state: { ...next, revealed: [...next.revealed, cell] }, cell };
}

/** Figures still to ink. */
export function blanksRemaining(state: SudokuEngineState): number {
  return state.values.filter((v) => v === 0).length;
}

/** How many of figure d are already inked (for dimming exhausted pad keys). */
export function digitCount(state: SudokuEngineState, digit: number): number {
  return state.values.filter((v) => v === digit).length;
}
