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

/**
 * Centre tile index of an n×n board.
 *
 * Odd n has a true centre and this returns it (n=5 → 12, n=7 → 24), so the
 * default board is unchanged. Even n has no single centre tile, so we name one
 * of the four middle tiles — the upper-left of them (n=6 → 14, i.e. row 2,
 * col 2). The naive `floor(n²/2)` lands on the LEFT WALL for even n (n=6 → 18,
 * row 3 col 0), which would turn tier 3's centre rule into an edge-hugging
 * rule; this is the fix that makes a 6×6 `centerRequired` board honest.
 * Generator, solver and view all read this one function, so the marked tile
 * and the enforced tile can never disagree.
 */
export function centerIndex(n: number): number {
  const mid = Math.floor((n - 1) / 2);
  return mid * n + mid;
}

/** The board's side length: the declared `size`, else derived from the grid. */
export function puzzleSize(puzzle: Pick<TwistlePuzzle, 'grid' | 'size'>): number {
  return puzzle.size ?? gridSize(puzzle.grid);
}

/**
 * ═══ THE ASK IS NEVER THINNER THAN ONE WORD IN FIVE (round 26) ═════════════
 *
 * The Gallery's defect was a RATIO, not a count. Measured over the 210 boards
 * shipped before this round, tier 1 asked **5 target words of a median 106-word
 * findable pool** — need/pool 0.047 — and the fifth-commonest of those words
 * sat at Norvig rank 305, i.e. inside the three hundred commonest words in
 * English. Five of 106 is a rounding error of a board however many minutes it
 * takes, so the room could be cleared out of reflex without ever reading the
 * grid as a grid.
 *
 * So the generator now rejects any board whose findable pool is fat enough to
 * make its own ask trivial, at a ceiling DERIVED from that board's
 * `targetCount` (`maxFindableFor`) rather than typed in per tier: raising an
 * ask automatically permits a proportionally larger board, and lowering one
 * cannot quietly re-open the gap.
 *
 * ONE IN FIVE, AND WHY THAT RATHER THAN A BIGGER ASK. It is tier 3's own
 * shipped share — the one tier both hostile reviewers left alone — so the
 * bottom of the manor is now held to the standard the top already met. Working
 * it as a SHARE is what lets the Gallery stay short: the room is fixed by
 * shrinking the board's answer space (a 5-letter floor, a turn floor on every
 * target, the centre rule from tier 2 up), not by asking for twelve words. A
 * word search is not a puzzle because it is long.
 *
 * Measured on the pool this ships: the tier-1 board went from a median 106
 * findable words to 23, the thinnest ask on any of the 210 boards from 0.029 to
 * 0.200, and the fattest board in the house from 173 findable words to 30.
 *
 * It lives here rather than in `content/generate-twistle.ts` because that file
 * runs `main()` on import; the shipped-pool test needs the number, not the
 * generator.
 */
export const MIN_ASK_SHARE = 1 / 5;

/** The fattest findable pool a board asking `targetCount` words may ship. */
export function maxFindableFor(targetCount: number): number {
  return Math.floor(targetCount / MIN_ASK_SHARE);
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
