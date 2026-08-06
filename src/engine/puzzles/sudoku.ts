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
 * Play model (economy semantics live in sudoku-adapter.ts): pencil marks are
 * thinking — free, unlimited. INKING a figure is the claim; a figure that
 * contradicts the (unique) solution is a costed mistake and never lands on
 * the leaf — the ledger refuses to hold a false entry (AAA 3.3: earned
 * information persists; a known-wrong digit is anti-information).
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
  /** Cells filled via a purchased reveal (view styles them as 'developed'). */
  revealed: number[];
  status: 'playing' | 'won';
}

export type InkResult = 'placed' | 'won' | 'contradiction' | 'ignored';

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

/** One technique application: mutates the board, returns true if it changed anything. */
type Technique = (b: Board) => boolean;

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
      return true;
    }
  }
  return false;
};

const hiddenSingle: Technique = (b) => {
  for (const unit of UNITS) {
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
        return true;
      }
    }
  }
  return false;
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
      const lines: number[][] = [];
      if (rows.size === 1) lines.push(UNITS[[...rows][0]!]! as number[]);
      if (cols.size === 1) lines.push(UNITS[9 + [...cols][0]!]! as number[]);
      for (const line of lines) {
        let changed = false;
        for (const c of line) {
          if (!UNITS[u]!.includes(c) && b.values[c] === 0 && (b.cands[c]! & bit)) {
            b.cands[c] = b.cands[c]! & ~bit;
            changed = true;
          }
        }
        if (changed) return true;
      }
    }
    // Claiming: within a row/col, candidates for d confined to one box.
    for (let u = 0; u < 18; u++) {
      const spots = UNITS[u]!.filter((c) => b.values[c] === 0 && (b.cands[c]! & bit));
      if (spots.length < 2) continue;
      const boxes = new Set(spots.map((c) => 18 + Math.floor(Math.floor(c / 9) / 3) * 3 + Math.floor((c % 9) / 3)));
      if (boxes.size !== 1) continue;
      const box = UNITS[[...boxes][0]!]!;
      let changed = false;
      for (const c of box) {
        if (!UNITS[u]!.includes(c) && b.values[c] === 0 && (b.cands[c]! & bit)) {
          b.cands[c] = b.cands[c]! & ~bit;
          changed = true;
        }
      }
      if (changed) return true;
    }
  }
  return false;
};

/** Naked subsets of size n (pair/triple): n cells whose candidate union has n digits. */
function nakedSubset(n: 2 | 3): Technique {
  return (b) => {
    for (const unit of UNITS) {
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
        if (changed) return true;
      }
    }
    return false;
  };
}

/** Hidden subsets of size n: n digits confined to the same n cells of a unit. */
function hiddenSubset(n: 2 | 3): Technique {
  return (b) => {
    for (const unit of UNITS) {
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
        if (changed) return true;
      }
    }
    return false;
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
          if (changed) return true;
        }
      }
    }
    return false;
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
        if (changed) return true;
      }
    }
  }
  return false;
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
        if (changed) return true;
      }
    }
  }
  return false;
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
        if (changed) return true;
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
      if (changed) return true;
    }
  }
  return false;
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
    revealed: [],
    status: 'playing',
  };
}

export function isGiven(puzzle: SudokuPuzzle, cell: number): boolean {
  return puzzle.givens[cell] !== '.';
}

/** Pencil a figure in/out of a blank cell. Free — penciling is thinking. */
export function togglePencil(state: SudokuEngineState, cell: number, digit: number): SudokuEngineState {
  if (state.status !== 'playing' || digit < 1 || digit > 9) return state;
  if (state.values[cell] !== 0) return state;
  const pencil = [...state.pencil];
  pencil[cell] = pencil[cell]! ^ (1 << (digit - 1));
  return { ...state, pencil };
}

/** Clear every pencil mark in a cell. Free. */
export function clearPencil(state: SudokuEngineState, cell: number): SudokuEngineState {
  if (state.status !== 'playing' || state.pencil[cell] === 0) return state;
  const pencil = [...state.pencil];
  pencil[cell] = 0;
  return { ...state, pencil };
}

/**
 * Ink a figure — the claim. Correct: it lands, and the same figure is swept
 * from peers' pencil marks (the ledger tidies itself). A contradiction of the
 * unique solution NEVER lands (a known-false entry is anti-information,
 * AAA 3.3) — the adapter prices it as a weight-1 mistake.
 */
export function inkCell(
  puzzle: SudokuPuzzle,
  state: SudokuEngineState,
  cell: number,
  digit: number,
): { state: SudokuEngineState; result: InkResult } {
  if (state.status !== 'playing' || digit < 1 || digit > 9) return { state, result: 'ignored' };
  if (state.values[cell] !== 0) return { state, result: 'ignored' };
  const truth = puzzle.solution.charCodeAt(cell) - 48;
  if (digit !== truth) return { state, result: 'contradiction' };

  const values = [...state.values];
  values[cell] = digit;
  const pencil = [...state.pencil];
  pencil[cell] = 0;
  const bit = 1 << (digit - 1);
  for (const p of PEERS[cell]!) pencil[p] = pencil[p]! & ~bit;

  const won = values.every((v) => v !== 0);
  return {
    state: { ...state, values, pencil, status: won ? 'won' : 'playing' },
    result: won ? 'won' : 'placed',
  };
}

/**
 * Reveal the correct figure in a cell (priced by the adapter as a hint).
 * Prefers the given cell; falls back to the most-constrained blank —
 * highest information per step spent.
 */
export function revealCell(
  puzzle: SudokuPuzzle,
  state: SudokuEngineState,
  preferred?: number,
): { state: SudokuEngineState; cell: number | null } {
  if (state.status !== 'playing') return { state, cell: null };
  let cell = preferred !== undefined && state.values[preferred] === 0 ? preferred : -1;
  if (cell === -1) {
    // Most-constrained blank: fewest possible figures given current entries.
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (state.values[i] !== 0) continue;
      let mask = ALL;
      for (const p of PEERS[i]!) {
        const v = state.values[p]!;
        if (v !== 0) mask &= ~(1 << (v - 1));
      }
      const n = popcount(mask);
      if (n < bestCount) { bestCount = n; cell = i; }
    }
  }
  if (cell === -1) return { state, cell: null };
  const digit = puzzle.solution.charCodeAt(cell) - 48;
  const { state: next } = inkCell(puzzle, state, cell, digit);
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
