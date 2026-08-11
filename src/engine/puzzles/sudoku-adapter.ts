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
 *   - pencil marks, "pencil what fits", rubbing out ONE mark, lifting her own
 *     figure, and UNDO: FREE. All exploration is thinking, never priced;
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
 * ═══ ROUND 6: UNDO (AAA 3.3, NYT-Sudoku parity) ═══
 * Every board edit is remembered in a bounded `history`, and `{type:'undo'}`
 * walks it back — free, unlimited within UNDO_DEPTH, and the one thing that
 * makes a free "pencil what fits" button safe to sit next to the pencil
 * toggle. It restores the BOARD only: steps already spent stay spent, the
 * weighed-leaf memory stays monotone (never charge twice for the same claim
 * because the board walked back to it), a bought figure is sealed in (it
 * clears the stack — she paid for it), and a won leaf is final.
 *
 * Size: 'anchor'. An expert-baseline sudoku is a 10-minute-class solve —
 * pricing it as a +3 micro would misprice the wife-playtest economy; the
 * anchor payout row (+6/+5/+4 by tier) is the honest bin. (The VIEW lives in
 * ui/rooms/micro/ per this round's task layout — directory ≠ economy size.)
 */

import type { Tier } from '../types';
import { createRng, pick } from '../rng';
import {
  balanceBooks, blanksRemaining, clearPencil, erasePencilMark, fillPencil, inkCell, isGiven,
  nextTechniqueNudge, revealCell, startSudoku, togglePencil, uninkCell,
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
  /**
   * Board states before each undoable edit, oldest first — the room's UNDO
   * (round 6). Bounded at UNDO_DEPTH, which is now also a save-size bound:
   * as of §5.3 the whole room state IS persisted, so undo survives a reload
   * along with the board it can walk back.
   */
  history: SudokuEngineState[];
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
  /** Round 10: lift the LAST mark in a cell — the eraser's surgical verb. */
  | { type: 'erase-mark'; cell: number }
  /** The whole-cell sweep. Engine verb; no free tap in the room reaches it. */
  | { type: 'clear-pencil'; cell: number }
  | { type: 'fill-pencil' }
  | { type: 'ink'; cell: number; digit: number }
  | { type: 'unink'; cell: number }
  | { type: 'undo' }
  | { type: 'balance' }
  | { type: 'nudge' }
  | { type: 'reveal-cell'; cell?: number };

/**
 * How many board edits UNDO can walk back. Deep enough to survive a long
 * pencilling run, bounded so a two-hour Diabolical session cannot grow a
 * memory leak out of 81-cell snapshots (AAA 9.4).
 */
export const UNDO_DEPTH = 64;

/** Blank cells on a leaf when it is dealt — the ladder's own denominator. */
function blanksOf(puzzle: SudokuPuzzle): number {
  return 81 - [...puzzle.givens].filter((c) => c !== '.').length;
}

/**
 * Record the board she is leaving, then move to the new one. Every undoable
 * edit goes through here; the priced CLAIM (balance) does not, because it
 * changes no cell — only the room's memory of which leaves it has already
 * weighed, which must stay monotone so undo can never make a leaf chargeable
 * a second time.
 */
function remember(state: SudokuRoomState, engine: SudokuEngineState): SudokuRoomState {
  const history = state.history.length >= UNDO_DEPTH
    ? [...state.history.slice(state.history.length - UNDO_DEPTH + 1), state.engine]
    : [...state.history, state.engine];
  return { ...state, engine, history };
}

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

  // §5.3 — pencil marks, their write order, inked figures and the undo stack
  // are all plain JSON data (numbers and arrays of numbers), so the whole
  // `SudokuRoomState` — history included — rides the save verbatim. The
  // "session-only, never reaches the save file" note on `history` and on
  // `SudokuEngineState.pencilOrder` was true of the old build and is not now:
  // an evicted tab used to cost the player a 20-minute expert board.
  find: (id) => SUDOKU_POOL.find((p) => p.id === id),
  stateVersion: 1,

  start(puzzle: SudokuPuzzle, _ctx: RoomContext): SudokuRoomState {
    return {
      engine: startSudoku(puzzle),
      history: [],
      costedMistakes: 0,
      hintsBought: 0,
      nudgesBought: 0,
      attempts: 0,
      lastFeedback: null,
    };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];
    /** A free, silent board edit — remembered, so UNDO can walk it back. */
    const quiet = (engine: SudokuEngineState) => {
      if (engine === state.engine) return { state, events, outcome: outcomeOf(state) };
      const next = remember(state, engine);
      return { state: next, events, outcome: outcomeOf(next) };
    };

    // ── Free: everything that is thinking ────────────────────────────────
    if (action.type === 'pencil') return quiet(togglePencil(state.engine, action.cell, action.digit));
    if (action.type === 'erase-mark') return quiet(erasePencilMark(state.engine, action.cell));
    if (action.type === 'clear-pencil') return quiet(clearPencil(state.engine, action.cell));
    if (action.type === 'fill-pencil') return quiet(fillPencil(state.engine));
    if (action.type === 'unink') return quiet(uninkCell(puzzle, state.engine, action.cell));

    // ── UNDO — free, and the reason every other verb here can be free ────
    // Pencil work IS the solve (AAA 3.3), so the room owes the player a way
    // back from any board edit, exactly as NYT Sudoku's permanent Undo does.
    // It restores the previous BOARD only: charges already paid stay paid
    // (steps are spending, never rewound), `balancedSignatures` stays at its
    // current, monotone value so an already-weighed leaf is never charged
    // twice, and a won leaf is final — the room has already reported `solved`.
    if (action.type === 'undo') {
      if (state.engine.status !== 'playing' || state.history.length === 0) {
        return { state, events, outcome: outcomeOf(state) };
      }
      const prev = state.history[state.history.length - 1]!;
      const engine: SudokuEngineState = prev.balancedSignatures === state.engine.balancedSignatures
        ? prev
        : { ...prev, balancedSignatures: state.engine.balancedSignatures };
      const next: SudokuRoomState = {
        ...state, engine, history: state.history.slice(0, -1),
      };
      return { state: next, events, outcome: outcomeOf(next) };
    }

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
      // TWO priced weighings, not one (round 28). A charged balance whose
      // figures are all TRUE is the commonest one in the pool — the clerk is
      // paid for the answer, not for an error — and a float reading "wrong
      // number" over a leaf the room just called true is a false rule of
      // exactly the kind the price tag exists to kill. The room's two lines
      // get the room's two keys.
      events.push({
        type: 'mistake',
        weight: report.charged ? 1 : 0,
        detail: report.astray > 0 ? 'balanced-astray' : 'balanced-true',
      });
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
        // A purchase SEALS the leaf: undo may not walk back over a figure she
        // paid steps for (the engine already treats a bought figure as
        // immutable — `uninkCell` refuses it). Everything she does after this
        // is undoable again from the next edit onward.
        history: [],
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
        const next = remember(state, engine);
        // ROUND 27 — THE MARKER NAMES THE WHOLE LEAF, NOT JUST WHAT IS LEFT.
        // It used to be `inked:N-left`, and the ladder that reads it had to
        // guess the denominator from a pool median. That was survivable while
        // every shipped board was the same length; it stopped being survivable
        // when the tiers were regraded to 51/55/57 blanks — and it was ALREADY
        // wrong before that, because a row-band tier-1 cell may deal a
        // technique-tier-2 board (`TIER_PREFERENCE`), so the row's median was
        // never a fact about the leaf on the table. The board says how big it
        // is; nothing downstream has to assume.
        events.push({
          type: 'progress',
          detail: `inked:${blanksRemaining(engine)}-of-${blanksOf(puzzle)}`,
        });
        return { state: next, events, outcome: outcomeOf(next) };
      }
      case 'won': {
        const next: SudokuRoomState = {
          ...remember(state, engine),
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

  /**
   * ── THE OPEN LEDGER (round 27) ───────────────────────────────────────────
   * Real work on this leaf is a figure she inked or a mark she penciled —
   * either one. PENCIL COUNTS, and that is the point rather than a nicety: a
   * complete candidate pass over fifty-odd blanks is twenty minutes and no
   * placements, and it is exactly the state a tier-2 or tier-3 board has to be
   * in before the deduction that cracks it is even visible. Banking placements
   * only would have thrown away the half of the solve this room's own play
   * model calls "thinking" (see the header, and AAA 3.3).
   *
   * A figure she BOUGHT is not her work, so a leaf whose only mark is a
   * consulted cell does not hold the ledger open.
   */
  hasWork: (puzzle, state) =>
    state.engine.pencil.some((mask) => mask !== 0)
    || state.engine.values.some((v, cell) =>
      v !== 0 && !isGiven(puzzle, cell) && !state.engine.revealed.includes(cell)),
};
