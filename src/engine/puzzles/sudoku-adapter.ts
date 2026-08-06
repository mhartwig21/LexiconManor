/**
 * The Counting House — Sudoku behind the RoomPuzzle contract.
 * OWNER: sudoku room agent. Pure TS; wraps engine/puzzles/sudoku.ts.
 *
 * Economy mapping (AAA §0.3, R.1's principle; OWNER DIRECTIVE this round):
 *   - pencil marks are FREE — exploration is thinking, never priced;
 *   - INKING a figure is a deliberate claim: a contradiction of the unique
 *     solution costs one weight-1 mistake (−2 steps, −3 at tier 3 via
 *     STEP_TABLE) and the false figure never lands on the leaf;
 *   - inking onto a filled cell / out-of-range input is malformed → ignored,
 *     never costed (AAA 3.2);
 *   - revealing a cell is a step-priced `hint` (weight 1);
 *   - perfect = solved with zero contradictions and zero reveals.
 *
 * Size: 'anchor'. An expert-baseline sudoku is a 10-minute-class solve —
 * pricing it as a +3 micro would misprice the wife-playtest economy; the
 * anchor payout row (+6/+7/+8 by tier) is the honest bin. (The VIEW lives in
 * ui/rooms/micro/ per this round's task layout — directory ≠ economy size.)
 */

import type { Tier } from '../types';
import { createRng, pick } from '../rng';
import {
  blanksRemaining, clearPencil, inkCell, revealCell, startSudoku, togglePencil,
  type SudokuEngineState, type SudokuPuzzle,
} from './sudoku';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../rooms/room-puzzle';
import { getPools, lazyContent } from '../../app/pools';

export const SUDOKU_POOL = lazyContent<SudokuPuzzle[]>(() => getPools().sudoku as SudokuPuzzle[]);

/**
 * Row-band tier → puzzle technique-tier preference order. EXPERT BASELINE
 * (owner directive): even manor tier 1 draws technique-tier-1 (≈ NYT
 * hard/expert) first; there is no "easy" bin anywhere in the pool.
 */
const TIER_PREFERENCE: Record<Tier, (1 | 2 | 3)[]> = {
  1: [1, 2],
  2: [2, 1],
  3: [3, 2],
};

export type SudokuFeedback =
  | { kind: 'contradiction'; cell: number; digit: number }
  | { kind: 'revealed'; cell: number }
  | { kind: 'solved' };

export interface SudokuRoomState {
  engine: SudokuEngineState;
  costedMistakes: number;
  hintsBought: number;
  /** Bumped per feedback-worthy action so the view can key its effects. */
  attempts: number;
  lastFeedback: SudokuFeedback | null;
}

export type SudokuAction =
  | { type: 'pencil'; cell: number; digit: number }
  | { type: 'clear-pencil'; cell: number }
  | { type: 'ink'; cell: number; digit: number }
  | { type: 'reveal-cell'; cell?: number };

function isPerfect(s: SudokuRoomState): boolean {
  return s.costedMistakes === 0 && s.hintsBought === 0;
}

function outcomeOf(s: SudokuRoomState): RoomOutcome {
  return {
    status: s.engine.status === 'won' ? 'solved' : 'active',
    perfect: isPerfect(s),
  };
}

export const sudokuAdapter: RoomPuzzleAdapter<SudokuPuzzle, SudokuRoomState, SudokuAction> = {
  kind: 'sudoku',
  size: 'anchor',

  select({ tier, seed, seenIds }) {
    const rng = createRng(seed);
    const seen = new Set(seenIds);
    for (const t of TIER_PREFERENCE[tier]) {
      const fresh = SUDOKU_POOL.filter((p) => p.tier === t && !seen.has(p.id));
      if (fresh.length > 0) return pick(rng, fresh);
    }
    const anyFresh = SUDOKU_POOL.filter((p) => !seen.has(p.id));
    return anyFresh.length > 0 ? pick(rng, anyFresh) : pick(rng, SUDOKU_POOL);
  },

  start(puzzle: SudokuPuzzle, _ctx: RoomContext): SudokuRoomState {
    return {
      engine: startSudoku(puzzle),
      costedMistakes: 0,
      hintsBought: 0,
      attempts: 0,
      lastFeedback: null,
    };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];

    if (action.type === 'pencil') {
      // Free, silent, never an event — penciling is thinking.
      const engine = togglePencil(state.engine, action.cell, action.digit);
      if (engine === state.engine) return { state, events, outcome: outcomeOf(state) };
      return { state: { ...state, engine }, events, outcome: outcomeOf(state) };
    }

    if (action.type === 'clear-pencil') {
      const engine = clearPencil(state.engine, action.cell);
      if (engine === state.engine) return { state, events, outcome: outcomeOf(state) };
      return { state: { ...state, engine }, events, outcome: outcomeOf(state) };
    }

    if (action.type === 'reveal-cell') {
      const { state: engine, cell } = revealCell(puzzle, state.engine, action.cell);
      if (cell === null) return { state, events, outcome: outcomeOf(state) };
      events.push({ type: 'hint', weight: 1 });
      let next: SudokuRoomState = {
        ...state,
        engine,
        hintsBought: state.hintsBought + 1,
        attempts: state.attempts + 1,
        lastFeedback: { kind: 'revealed', cell },
      };
      if (engine.status === 'won') {
        next = { ...next, lastFeedback: { kind: 'solved' } };
        events.push({ type: 'solved', perfect: isPerfect(next) });
      }
      return { state: next, events, outcome: outcomeOf(next) };
    }

    // Ink — the claim.
    const { state: engine, result } = inkCell(puzzle, state.engine, action.cell, action.digit);
    switch (result) {
      case 'ignored':
        // Malformed (filled cell / bad digit) — free, no event (AAA 3.2).
        return { state, events, outcome: outcomeOf(state) };
      case 'contradiction': {
        const next: SudokuRoomState = {
          ...state,
          costedMistakes: state.costedMistakes + 1,
          attempts: state.attempts + 1,
          lastFeedback: { kind: 'contradiction', cell: action.cell, digit: action.digit },
        };
        events.push({ type: 'mistake', weight: 1 });
        return { state: next, events, outcome: outcomeOf(next) };
      }
      case 'placed': {
        const next: SudokuRoomState = { ...state, engine };
        events.push({ type: 'progress', detail: `inked:${blanksRemaining(engine)}-left` });
        return { state: next, events, outcome: outcomeOf(next) };
      }
      case 'won': {
        const next: SudokuRoomState = {
          ...state,
          engine,
          attempts: state.attempts + 1,
          lastFeedback: { kind: 'solved' },
        };
        events.push({ type: 'progress', detail: 'ledger-balanced' });
        events.push({ type: 'solved', perfect: isPerfect(next) });
        return { state: next, events, outcome: outcomeOf(next) };
      }
    }
  },

  puzzleId: (p) => p.id,
};
