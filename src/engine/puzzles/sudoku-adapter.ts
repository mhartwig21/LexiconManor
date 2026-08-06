/**
 * The Counting House — Sudoku behind the RoomPuzzle contract.
 * OWNER: sudoku room agent. Pure TS; wraps engine/puzzles/sudoku.ts.
 *
 * ═══ ECONOMY MAPPING (round 5 rewrite — AAA §0.3, R.1's principle) ═══
 * The old mapping priced an INK: a figure that disagreed with the solution was
 * refused and charged. That sold a correctness oracle at the price of the
 * sanctioned hint, and at a bivalue cell it resolved the cell outright — which
 * is exactly where XY-wing, XYZ-wing and colouring live, so every level-2/3
 * technique the tier ladder is built on could be bisected instead of deduced.
 * The claim has moved off the ink and onto a verb:
 *
 *   - pencil marks, "pencil what fits", and lifting her own figure: FREE. All
 *     exploration is thinking, and thinking is never priced;
 *   - inking a figure that duplicates a visible peer: MALFORMED — weight 0,
 *     free shake + reason toast, nothing lands (AAA 3.2);
 *   - inking a board-legal figure: FREE, and it LANDS, unsettled. A wrong one
 *     is a hypothesis she is allowed to hold, exactly as on NYT Hard;
 *   - "Balance the books": the one priced CLAIM — weight-1 `mistake`, reports
 *     "N of M figures are astray" without naming them. An identical re-balance
 *     is free (the Linen Closet's `checkedSignatures` rule);
 *   - "A word from the clerk": a weight-1 `hint` that names the next real
 *     deduction and its unit — priced help that teaches (AAA 3.2 / 3.8). It is
 *     tracked in `nudgesBought` and does NOT forfeit `perfect`: it derives
 *     nothing, it only points;
 *   - "Consult the ledger": the expensive dead-end button — a weight-2 `hint`
 *     that buys an actual figure, strictly dearer than the nudge, and it does
 *     forfeit `perfect`;
 *   - perfect = no charged balance and no bought figure.
 *
 * Size: 'anchor'. An expert-baseline sudoku is a 10-minute-class solve —
 * pricing it as a +3 micro would misprice the wife-playtest economy; the
 * anchor payout row (+6/+5/+4 by tier) is the honest bin. (The VIEW lives in
 * ui/rooms/micro/ per this round's task layout — directory ≠ economy size.)
 */

import type { Tier } from '../types';
import { createRng, pick } from '../rng';
import {
  balanceBooks, blanksRemaining, clearPencil, fillPencil, inkCell, nextTechniqueNudge,
  revealCell, startSudoku, togglePencil, uninkCell,
  type SudokuEngineState, type SudokuPuzzle, type TechniqueId,
} from './sudoku';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../rooms/room-puzzle';
import { getPools, lazyContent } from '../../app/pools';

export const SUDOKU_POOL = lazyContent<SudokuPuzzle[]>(() => getPools().sudoku as SudokuPuzzle[]);

/**
 * Row-band tier → puzzle technique-tier preference order. EXPERT BASELINE
 * (owner directive): even manor tier 1 draws technique-tier 1 (which the room
 * now labels "Tough" — see TIER_NAME in SudokuView; the label was the thing
 * that overclaimed, never the boards). There is no "easy" bin anywhere.
 */
const TIER_PREFERENCE: Record<Tier, (1 | 2 | 3)[]> = {
  1: [1, 2],
  2: [2, 1],
  3: [3, 2],
};

export type SudokuFeedback =
  | { kind: 'malformed'; cell: number; digit: number; conflict: number }
  | { kind: 'balanced'; astray: number; settled: number; charged: boolean }
  | { kind: 'nudge'; technique: TechniqueId; unit: number | null; singlesPending: number }
  | { kind: 'no-nudge' }
  | { kind: 'revealed'; cell: number }
  | { kind: 'solved' };

export interface SudokuRoomState {
  engine: SudokuEngineState;
  /** Charged balances — the room's only costed claim. */
  costedMistakes: number;
  /** Bought FIGURES only (the dead-end button). Forfeits perfect. */
  hintsBought: number;
  /** Bought technique nudges. Priced, but perfect-neutral: they teach. */
  nudgesBought: number;
  /** Bumped per feedback-worthy action so the view can key its effects. */
  attempts: number;
  lastFeedback: SudokuFeedback | null;
}

export type SudokuAction =
  | { type: 'pencil'; cell: number; digit: number }
  | { type: 'clear-pencil'; cell: number }
  | { type: 'fill-pencil' }
  | { type: 'ink'; cell: number; digit: number }
  | { type: 'unink'; cell: number }
  | { type: 'balance' }
  | { type: 'nudge' }
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
      nudgesBought: 0,
      attempts: 0,
      lastFeedback: null,
    };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];
    const quiet = (engine: SudokuEngineState) => {
      if (engine === state.engine) return { state, events, outcome: outcomeOf(state) };
      const next: SudokuRoomState = { ...state, engine };
      return { state: next, events, outcome: outcomeOf(next) };
    };

    // ── Free: everything that is thinking ────────────────────────────────
    if (action.type === 'pencil') return quiet(togglePencil(state.engine, action.cell, action.digit));
    if (action.type === 'clear-pencil') return quiet(clearPencil(state.engine, action.cell));
    if (action.type === 'fill-pencil') return quiet(fillPencil(state.engine));
    if (action.type === 'unink') return quiet(uninkCell(puzzle, state.engine, action.cell));

    // ── The priced claim: how many of her own figures are astray ─────────
    if (action.type === 'balance') {
      const { state: engine, report } = balanceBooks(puzzle, state.engine);
      const next: SudokuRoomState = {
        ...state,
        engine,
        costedMistakes: report.charged ? state.costedMistakes + 1 : state.costedMistakes,
        attempts: state.attempts + 1,
        lastFeedback: {
          kind: 'balanced', astray: report.astray, settled: report.settled, charged: report.charged,
        },
      };
      // Nothing to weigh, or the identical leaf weighed twice: zero new
      // information, therefore zero cost (AAA 3.2).
      events.push({ type: 'mistake', weight: report.charged ? 1 : 0 });
      return { state: next, events, outcome: outcomeOf(next) };
    }

    // ── Priced help that teaches (perfect-neutral) ───────────────────────
    if (action.type === 'nudge') {
      const nudge = nextTechniqueNudge(state.engine.values);
      if (!nudge) {
        // The leaf yields nothing to the ladder from here — no charge.
        return {
          state: { ...state, attempts: state.attempts + 1, lastFeedback: { kind: 'no-nudge' } },
          events,
          outcome: outcomeOf(state),
        };
      }
      events.push({ type: 'hint', weight: 1 });
      const next: SudokuRoomState = {
        ...state,
        nudgesBought: state.nudgesBought + 1,
        attempts: state.attempts + 1,
        lastFeedback: {
          kind: 'nudge', technique: nudge.id, unit: nudge.unit, singlesPending: nudge.singlesPending,
        },
      };
      return { state: next, events, outcome: outcomeOf(next) };
    }

    // ── The dead-end button: buy an actual figure, dearer than the nudge ──
    if (action.type === 'reveal-cell') {
      const { state: engine, cell } = revealCell(puzzle, state.engine, action.cell);
      if (cell === null) return { state, events, outcome: outcomeOf(state) };
      events.push({ type: 'hint', weight: 2 });
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

    // ── Ink: free, and it lands unless the leaf already showed the clash ──
    const { state: engine, result, conflict } = inkCell(puzzle, state.engine, action.cell, action.digit);
    switch (result) {
      case 'ignored':
        // Nothing to write (a given, a bought figure, the same figure again,
        // an out-of-range key) — free, silent, no event (AAA 3.2).
        return { state, events, outcome: outcomeOf(state) };
      case 'malformed': {
        const next: SudokuRoomState = {
          ...state,
          attempts: state.attempts + 1,
          lastFeedback: {
            kind: 'malformed', cell: action.cell, digit: action.digit, conflict: conflict ?? -1,
          },
        };
        // The board warned her before she pressed. Dead letter: shake, reason,
        // no ledger entry (AAA R.1 / 3.2).
        events.push({ type: 'mistake', weight: 0 });
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
