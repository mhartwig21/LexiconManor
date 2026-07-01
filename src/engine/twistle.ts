import type { TwistlePuzzle, TwistleRules } from './types';

/**
 * Twistle (5x5 grid word search) engine.
 * Words trace king-move-adjacent paths without reusing a tile. The same
 * path solver validates player submissions here and puzzle solvability
 * in the content generator.
 */

export const GRID_SIZE = 5;
export const CENTER_INDEX = 12;

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

function neighbors(index: number): number[] {
  const r = Math.floor(index / GRID_SIZE);
  const c = index % GRID_SIZE;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) out.push(nr * GRID_SIZE + nc);
    }
  }
  return out;
}

/**
 * Find a tile path spelling `word` under the given rules, or null.
 * Depth-first with tile-reuse prevention; grids are 25 tiles so this is fast.
 */
export function findPath(grid: string[], word: string, rules: TwistleRules): number[] | null {
  const target = word.toUpperCase();
  if (target.length < rules.minLength) return null;

  const walk = (path: number[], depth: number): number[] | null => {
    if (depth === target.length) {
      if (rules.centerRequired && !path.includes(CENTER_INDEX)) return null;
      return path;
    }
    const last = path[path.length - 1]!;
    for (const n of neighbors(last)) {
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
