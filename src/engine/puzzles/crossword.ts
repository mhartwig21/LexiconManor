/**
 * Mini Crossword — The Linen Closet's 30–90s micro game. OWNER: A5.
 *
 * Pure engine: no React, no DOM, no audio. A criss-cross of 3–5 clued words
 * in a grid of at most 5×5. Letters are probes and cost nothing to place or
 * erase (AAA 3.2/3.3). The single costed moment is a full-grid claim: when
 * every cell is filled the grid auto-checks — a miss shakes the wrong cells
 * and costs one weight-1 mistake. Re-checking an *identical* fill is free
 * (the game never double-charges the same claim), and wrong-cell marks
 * persist until the player edits them (memory prosthetic, AAA 3.3).
 * Revealing a cell is a step-priced hint; hints and costed checks forfeit
 * "perfect".
 */

import type { Difficulty } from '../types';

export type CrosswordDir = 'across' | 'down';

export interface CrosswordEntry {
  id: string;              // e.g. "1A", "2D" — unique within the puzzle
  dir: CrosswordDir;
  row: number;             // 0-based, top row = 0
  col: number;             // 0-based, left col = 0
  answer: string;          // uppercase A–Z
  clue: string;
}

export interface CrosswordPuzzle {
  id: string;
  difficulty: Difficulty;
  size: number;            // grid is size×size; cells outside entries are linen
  entries: CrosswordEntry[]; // 3–5, solver-verified by the generator
}

export interface CrosswordEngineState {
  /** Player letters by cell index (row * size + col). */
  letters: Record<number, string>;
  /** Cells the last full check marked wrong — cleared as they are edited. */
  wrongCells: number[];
  /** Cells revealed by step-priced hints (locked; count toward the fill). */
  revealedCells: number[];
  /** Fill signatures already charged — identical re-checks are free. */
  checkedSignatures: string[];
  /** Costed (wrong, newly-charged) checks. */
  costedChecks: number;
  hintsUsed: number;
  status: 'playing' | 'won';
}

export type CrosswordCheckResult =
  | { kind: 'solved' }
  /** charged=false when this exact fill was already checked (free re-shake). */
  | { kind: 'miss'; wrongCells: number[]; charged: boolean };

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export function entryCells(puzzle: CrosswordPuzzle, entry: CrosswordEntry): number[] {
  const cells: number[] = [];
  for (let i = 0; i < entry.answer.length; i++) {
    const row = entry.dir === 'down' ? entry.row + i : entry.row;
    const col = entry.dir === 'across' ? entry.col + i : entry.col;
    cells.push(row * puzzle.size + col);
  }
  return cells;
}

/** All open (playable) cell indices, ascending. */
export function openCells(puzzle: CrosswordPuzzle): number[] {
  const set = new Set<number>();
  for (const e of puzzle.entries) for (const c of entryCells(puzzle, e)) set.add(c);
  return [...set].sort((a, b) => a - b);
}

/** The solution letter for every open cell (generator-verified consistent). */
export function solutionLetters(puzzle: CrosswordPuzzle): Map<number, string> {
  const sol = new Map<number, string>();
  for (const e of puzzle.entries) {
    const cells = entryCells(puzzle, e);
    for (let i = 0; i < cells.length; i++) sol.set(cells[i]!, e.answer[i]!);
  }
  return sol;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function startCrossword(_puzzle: CrosswordPuzzle): CrosswordEngineState {
  return {
    letters: {},
    wrongCells: [],
    revealedCells: [],
    checkedSignatures: [],
    costedChecks: 0,
    hintsUsed: 0,
    status: 'playing',
  };
}

export function isOpenCell(puzzle: CrosswordPuzzle, index: number): boolean {
  return openCells(puzzle).includes(index);
}

/**
 * Place (letter) or erase (null) at an open cell. Free, always. Revealed
 * cells are locked; editing a wrong-marked cell lifts its mark.
 */
export function setCrosswordCell(
  puzzle: CrosswordPuzzle,
  state: CrosswordEngineState,
  index: number,
  letter: string | null,
): CrosswordEngineState {
  if (state.status !== 'playing') return state;
  if (!isOpenCell(puzzle, index)) return state;
  if (state.revealedCells.includes(index)) return state;
  const letters = { ...state.letters };
  if (letter === null) delete letters[index];
  else {
    const ch = letter.toUpperCase();
    if (!/^[A-Z]$/.test(ch)) return state;
    letters[index] = ch;
  }
  return {
    ...state,
    letters,
    wrongCells: state.wrongCells.filter((c) => c !== index),
  };
}

export function isGridFull(puzzle: CrosswordPuzzle, state: CrosswordEngineState): boolean {
  return openCells(puzzle).every((c) => state.letters[c] !== undefined);
}

export function fillSignature(puzzle: CrosswordPuzzle, state: CrosswordEngineState): string {
  return openCells(puzzle).map((c) => state.letters[c] ?? '.').join('');
}

/** Full-grid claim. Call only when the grid is full (adapter guards). */
export function checkCrossword(
  puzzle: CrosswordPuzzle,
  state: CrosswordEngineState,
): { state: CrosswordEngineState; result: CrosswordCheckResult } {
  if (state.status !== 'playing' || !isGridFull(puzzle, state)) {
    return { state, result: { kind: 'miss', wrongCells: [], charged: false } };
  }
  const sol = solutionLetters(puzzle);
  const wrong = openCells(puzzle).filter((c) => state.letters[c] !== sol.get(c));
  if (wrong.length === 0) {
    return { state: { ...state, wrongCells: [], status: 'won' }, result: { kind: 'solved' } };
  }
  const sig = fillSignature(puzzle, state);
  const charged = !state.checkedSignatures.includes(sig);
  return {
    state: {
      ...state,
      wrongCells: wrong,
      checkedSignatures: charged ? [...state.checkedSignatures, sig] : state.checkedSignatures,
      costedChecks: charged ? state.costedChecks + 1 : state.costedChecks,
    },
    result: { kind: 'miss', wrongCells: wrong, charged },
  };
}

/** Step-priced hint: reveal and lock the solution letter of one open cell. */
export function revealCrosswordCell(
  puzzle: CrosswordPuzzle,
  state: CrosswordEngineState,
  index: number,
): { state: CrosswordEngineState; letter: string | null } {
  if (state.status !== 'playing') return { state, letter: null };
  if (!isOpenCell(puzzle, index) || state.revealedCells.includes(index)) {
    return { state, letter: null };
  }
  const letter = solutionLetters(puzzle).get(index)!;
  const next: CrosswordEngineState = {
    ...state,
    letters: { ...state.letters, [index]: letter },
    revealedCells: [...state.revealedCells, index],
    wrongCells: state.wrongCells.filter((c) => c !== index),
    hintsUsed: state.hintsUsed + 1,
  };
  return { state: next, letter };
}

// ---------------------------------------------------------------------------
// Structural validation (generator + tests) — the "solver" for a criss-cross:
// every maximal run of ≥2 letters in the solution grid must be exactly one
// entry, intersections must agree, and the puzzle must be one connected piece.
// ---------------------------------------------------------------------------

export function validateCrosswordPuzzle(puzzle: CrosswordPuzzle): string[] {
  const problems: string[] = [];
  const { size, entries } = puzzle;
  if (size < 3 || size > 5) problems.push(`size ${size} out of range 3–5`);
  if (entries.length < 3 || entries.length > 5) problems.push(`${entries.length} entries (want 3–5)`);

  const ids = new Set<string>();
  const answers = new Set<string>();
  const sol = new Map<number, string>();
  for (const e of entries) {
    if (ids.has(e.id)) problems.push(`duplicate entry id ${e.id}`);
    ids.add(e.id);
    if (answers.has(e.answer)) problems.push(`duplicate answer ${e.answer}`);
    answers.add(e.answer);
    if (!/^[A-Z]{3,}$/.test(e.answer)) problems.push(`${e.id}: bad answer "${e.answer}"`);
    if (!e.clue || e.clue.trim().length === 0) problems.push(`${e.id}: empty clue`);
    const endRow = e.dir === 'down' ? e.row + e.answer.length - 1 : e.row;
    const endCol = e.dir === 'across' ? e.col + e.answer.length - 1 : e.col;
    if (e.row < 0 || e.col < 0 || endRow >= size || endCol >= size) {
      problems.push(`${e.id}: out of bounds`);
      continue;
    }
    const cells = entryCells(puzzle, e);
    for (let i = 0; i < cells.length; i++) {
      const existing = sol.get(cells[i]!);
      if (existing !== undefined && existing !== e.answer[i]) {
        problems.push(`${e.id}: intersection conflict at cell ${cells[i]}`);
      }
      sol.set(cells[i]!, e.answer[i]!);
    }
  }

  // Runs: every maximal horizontal/vertical run of >=2 letters is an entry.
  const runKeys = new Set(entries.map((e) => `${e.dir}:${e.row}:${e.col}:${e.answer.length}`));
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= size || c >= size ? undefined : sol.get(r * size + c));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (at(r, c) === undefined) continue;
      if (at(r, c - 1) === undefined && at(r, c + 1) !== undefined) {
        let len = 0;
        while (at(r, c + len) !== undefined) len++;
        if (!runKeys.has(`across:${r}:${c}:${len}`)) problems.push(`unintended across run at (${r},${c}) len ${len}`);
      }
      if (at(r - 1, c) === undefined && at(r + 1, c) !== undefined) {
        let len = 0;
        while (at(r + len, c) !== undefined) len++;
        if (!runKeys.has(`down:${r}:${c}:${len}`)) problems.push(`unintended down run at (${r},${c}) len ${len}`);
      }
    }
  }
  // Every entry of length >=2 must itself be a maximal run (no extensions).
  for (const e of entries) {
    const before = e.dir === 'across' ? at(e.row, e.col - 1) : at(e.row - 1, e.col);
    const after = e.dir === 'across'
      ? at(e.row, e.col + e.answer.length)
      : at(e.row + e.answer.length, e.col);
    if (before !== undefined || after !== undefined) problems.push(`${e.id}: run extends beyond entry`);
  }

  // Connectivity: entries form one piece via shared cells.
  if (entries.length > 1) {
    const cellsOf = entries.map((e) => new Set(entryCells(puzzle, e)));
    const joined = new Set<number>([0]);
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < entries.length; i++) {
        if (joined.has(i)) continue;
        for (const j of joined) {
          if ([...cellsOf[i]!].some((c) => cellsOf[j]!.has(c))) {
            joined.add(i);
            grew = true;
            break;
          }
        }
      }
    }
    if (joined.size !== entries.length) problems.push('entries are not connected');
  }

  return problems;
}
