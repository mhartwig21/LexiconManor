import type { TwistlePuzzle, TwistleRules } from './types';

/**
 * Twistle (n×n grid word search) engine.
 * Words trace king-move-adjacent paths without reusing a tile. The same
 * path solver validates player submissions here and puzzle solvability
 * in the content generator.
 *
 * ROUND 4 — grid size is no longer a module constant. `TwistlePuzzle.size`
 * declares the side length (default 5) so a tier-3 Gallery can ship a 6×6
 * board. Nothing needs to be told the size twice: a square grid carries it in
 * `grid.length`, so `findPath` and the solver derive it and every existing
 * caller keeps its signature. GRID_SIZE / CENTER_INDEX remain exported as the
 * DEFAULT board's metrics — do not use them to index a puzzle whose `size`
 * you have not checked.
 */

/** Side length of the default board. */
export const GRID_SIZE = 5;
/** Centre tile of the DEFAULT 5×5 board. For any puzzle use `centerIndex()`. */
export const CENTER_INDEX = 12;

/** Side length of a square grid, derived from its tile count. */
export function gridSize(grid: string[]): number {
  return Math.round(Math.sqrt(grid.length));
}

/** Centre tile index of an n×n board (n is odd for a true centre). */
export function centerIndex(n: number): number {
  return Math.floor((n * n) / 2);
}

/** The board's side length: the declared `size`, else derived from the grid. */
export function puzzleSize(puzzle: Pick<TwistlePuzzle, 'grid' | 'size'>): number {
  return puzzle.size ?? gridSize(puzzle.grid);
}

export interface TwistleState {
  puzzleId: string;
  foundWords: string[];
  wrongAttempts: number;
  status: 'playing' | 'won';
}

export type TwistleSubmit =
  | { kind: 'valid'; word: string; won: boolean }
  | { kind: 'invalid'; reason: 'too-short' | 'not-on-grid' | 'breaks-rule' | 'not-a-word' | 'already-found' | 'finished' };

export function startTwistle(puzzle: TwistlePuzzle): TwistleState {
  return { puzzleId: puzzle.id, foundWords: [], wrongAttempts: 0, status: 'playing' };
}

/** King-move neighbours of `index` on an n×n board. */
export function neighbors(index: number, n: number = GRID_SIZE): number[] {
  const r = Math.floor(index / n);
  const c = index % n;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
    }
  }
  return out;
}

/**
 * Find a tile path spelling `word` under the given rules, or null.
 * Depth-first with tile-reuse prevention; grids are 25–36 tiles so this is fast.
 */
export function findPath(grid: string[], word: string, rules: TwistleRules): number[] | null {
  const target = word.toUpperCase();
  if (target.length < rules.minLength) return null;

  // Size comes from the grid itself, so 5×5 and 6×6 boards use one solver and
  // every existing caller keeps its three-argument signature.
  const size = gridSize(grid);
  const centre = centerIndex(size);

  const walk = (path: number[], depth: number): number[] | null => {
    if (depth === target.length) {
      if (rules.centerRequired && !path.includes(centre)) return null;
      return path;
    }
    const last = path[path.length - 1]!;
    for (const n of neighbors(last, size)) {
      if (path.includes(n)) continue;
      if (grid[n] !== target[depth]) continue;
      const found = walk([...path, n], depth + 1);
      if (found) return found;
    }
    return null;
  };

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== target[0]) continue;
    const found = walk([i], 1);
    if (found) return found;
  }
  return null;
}

export function submitTwistleWord(
  puzzle: TwistlePuzzle,
  state: TwistleState,
  rawWord: string,
): { state: TwistleState; result: TwistleSubmit } {
  if (state.status !== 'playing') return { state, result: { kind: 'invalid', reason: 'finished' } };
  const word = rawWord.toUpperCase().trim();

  if (word.length < puzzle.rules.minLength) {
    return { state, result: { kind: 'invalid', reason: 'too-short' } };
  }
  if (state.foundWords.includes(word)) {
    return { state, result: { kind: 'invalid', reason: 'already-found' } };
  }
  const path = findPath(puzzle.grid, word, puzzle.rules);
  if (!path) {
    const reason = findPath(puzzle.grid, word, { ...puzzle.rules, centerRequired: false })
      ? 'breaks-rule'
      : 'not-on-grid';
    return { state: { ...state, wrongAttempts: state.wrongAttempts + 1 }, result: { kind: 'invalid', reason } };
  }
  if (!puzzle.targetWords.includes(word)) {
    return { state: { ...state, wrongAttempts: state.wrongAttempts + 1 }, result: { kind: 'invalid', reason: 'not-a-word' } };
  }

  const foundWords = [...state.foundWords, word];
  const won = foundWords.length >= puzzle.targetCount;
  return {
    state: { ...state, foundWords, status: won ? 'won' : 'playing' },
    result: { kind: 'valid', word, won },
  };
}

/** Instant-solve support: fill with targets until the count is met. */
export function solveTwistle(puzzle: TwistlePuzzle, state: TwistleState): TwistleState {
  const needed = puzzle.targetCount - state.foundWords.length;
  const extra = puzzle.targetWords.filter((w) => !state.foundWords.includes(w)).slice(0, Math.max(0, needed));
  return { ...state, foundWords: [...state.foundWords, ...extra], status: 'won' };
}
