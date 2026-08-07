/**
 * The Linen Closet — mini crossword behind the RoomPuzzle contract.
 * OWNER: A5. Pure TS; wraps engine/puzzles/crossword.ts.
 *
 * Economy mapping (AAA §0.3, 3.2/3.3):
 *   - placing/erasing letters is FREE — letters are probes;
 *   - the auto-check when the grid fills is the claim: a wrong full grid
 *     costs one weight-1 mistake — but an IDENTICAL fill re-checked is
 *     weight 0 (never double-charge the same claim);
 *   - revealing a cell is a step-priced `hint` (weight 1);
 *   - perfect = solved with zero costed checks and zero reveals.
 */

import type { Tier } from '../types';
import {
  checkCrossword, isGridFull, revealCrosswordCell, setCrosswordCell, startCrossword,
  type CrosswordEngineState, type CrosswordPuzzle,
} from './crossword';
import type { RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../rooms/room-puzzle';
import { getPools, lazyContent } from '../../app/pools';
import { selectByTier } from '../rooms/adapters/tier-select';

/**
 * Round 4: the generator stamps a `tier` on every puzzle and the closet itself
 * grows with the row — tier 1 is a 4×4 with three easy, plainly-clued entries;
 * tier 2 the full 5×5 with four; tier 3 a 5×5 with five entries, the hard and
 * expert words in play, and at least two clues written in the bank's `wry`
 * style (misdirection and double meaning rather than a dictionary gloss).
 * The grid size travels in `puzzle.size`, which the engine and view already
 * read, so nothing outside the content needed to change.
 */
export type CrosswordPuzzleEx = CrosswordPuzzle & { tier?: Tier };

export const CROSSWORD_POOL = lazyContent<CrosswordPuzzleEx[]>(
  () => getPools().crossword as CrosswordPuzzleEx[],
);

export type CrosswordFeedback =
  | { kind: 'checked-wrong'; wrongCount: number; charged: boolean }
  | { kind: 'revealed'; index: number }
  | { kind: 'solved' };

export interface CrosswordRoomState {
  cw: CrosswordEngineState;
  tier: Tier;
  attempts: number;                    // bump per feedback-worthy action
  lastFeedback: CrosswordFeedback | null;
}

export type CrosswordAction =
  | { type: 'set-cell'; index: number; letter: string | null }
  | { type: 'reveal-cell'; index: number };

function isPerfect(s: CrosswordRoomState): boolean {
  return s.cw.costedChecks === 0 && s.cw.hintsUsed === 0;
}

function outcomeOf(s: CrosswordRoomState): RoomOutcome {
  return s.cw.status === 'won'
    ? { status: 'solved', perfect: isPerfect(s) }
    : { status: 'active', perfect: isPerfect(s) };
}

export const crosswordAdapter: RoomPuzzleAdapter<CrosswordPuzzleEx, CrosswordRoomState, CrosswordAction> = {
  kind: 'crossword',
  size: 'micro',

  select: (opts) => selectByTier(CROSSWORD_POOL, opts),

  // §5.3 — filled squares, revealed cells and the charged-check signatures are
  // plain JSON data. (`letters` is a Record<number,string>; JSON stringifies
  // the keys, and JS reads them back the same either way.)
  find: (id) => CROSSWORD_POOL.find((p) => p.id === id),
  stateVersion: 1,

  start(puzzle, ctx): CrosswordRoomState {
    return { cw: startCrossword(puzzle), tier: ctx.tier, attempts: 0, lastFeedback: null };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];

    if (action.type === 'reveal-cell') {
      const { state: cw, letter } = revealCrosswordCell(puzzle, state.cw, action.index);
      if (letter === null) return { state, events, outcome: outcomeOf(state) };
      events.push({ type: 'hint', weight: 1 });
      let next: CrosswordRoomState = {
        ...state,
        cw,
        attempts: state.attempts + 1,
        lastFeedback: { kind: 'revealed', index: action.index },
      };
      // A reveal can complete the grid — evaluate the claim (reveals are true).
      if (cw.status === 'playing' && isGridFull(puzzle, cw)) {
        next = evaluate(puzzle, next, events);
      }
      return { state: next, events, outcome: outcomeOf(next) };
    }

    const cw = setCrosswordCell(puzzle, state.cw, action.index, action.letter);
    if (cw === state.cw) return { state, events, outcome: outcomeOf(state) };
    let next: CrosswordRoomState = { ...state, cw };
    if (isGridFull(puzzle, cw)) {
      next = { ...next, attempts: next.attempts + 1 };
      next = evaluate(puzzle, next, events);
    }
    return { state: next, events, outcome: outcomeOf(next) };
  },

  puzzleId: (p) => p.id,
};

function evaluate(
  puzzle: CrosswordPuzzle,
  state: CrosswordRoomState,
  events: RoomEvent[],
): CrosswordRoomState {
  const { state: cw, result } = checkCrossword(puzzle, state.cw);
  if (result.kind === 'solved') {
    const next: CrosswordRoomState = { ...state, cw, lastFeedback: { kind: 'solved' } };
    events.push({ type: 'progress', detail: 'closet-folded' });
    events.push({ type: 'solved', perfect: isPerfect(next) });
    return next;
  }
  events.push({ type: 'mistake', weight: result.charged ? 1 : 0 });
  return {
    ...state,
    cw,
    lastFeedback: { kind: 'checked-wrong', wrongCount: result.wrongCells.length, charged: result.charged },
  };
}
