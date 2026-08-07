/**
 * The Darkroom — Substitution Cipher behind the RoomPuzzle contract. OWNER: A4.
 *
 * Wraps the pure engine (`startCipher`/`assignCipher`/`developCipher`/
 * `revealCipherLetter`). Mistake semantics (AAA §0.3): penciling is thinking
 * — free, no events. DEVELOPING the print is the claim: a murky develop
 * costs weight 1 but always reports "N of M letters ring true" (every wrong
 * guess yields information, AAA 2.10's principle). Developing with blanks is
 * malformed → weight 0. Re-developing an IDENTICAL mapping is also weight 0 —
 * the same claim answered twice is zero new information, so it is zero cost
 * (round 5; AAA 3.2, and the rule the Linen Closet already shipped). Reveals
 * are step-priced hints (`hint` weight 1). Penciled letters persist, locked
 * letters never regress, and every paid print stays on the paper in
 * `engine.prints` rather than in a 2s toast (AAA 3.3).
 */

import type { Tier } from '../types';
import {
  assignCipher, developCipher, revealCipherLetter, startCipher,
  type CipherEngineState, type CipherPuzzle,
} from './cipher';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../rooms/room-puzzle';
import { getPools, lazyContent } from '../../app/pools';
import { selectByTier } from '../rooms/adapters/tier-select';

/**
 * Round 4: the generator stamps a `tier` on every phrase, defined by the CRIB
 * it hands you — tier 1 contains a one-letter word and reveals three
 * high-frequency letters; tier 2 has no one-letter word and reveals a single
 * mid-frequency letter; tier 3 is the no-crib tier: every word is 3+ letters,
 * the phrase is long, its alphabet wide, and nothing at all is revealed.
 */
export type CipherPuzzleEx = CipherPuzzle & { tier?: Tier };

export const CIPHER_POOL = lazyContent<CipherPuzzleEx[]>(() => getPools().cipher as CipherPuzzleEx[]);

export type CipherFeedback =
  | { kind: 'developed' }
  | { kind: 'murky'; correct: number; total: number; charged: boolean }
  | { kind: 'incomplete'; missing: number }
  | { kind: 'letter-developed'; letter: string };

export interface CipherRoomState {
  engine: CipherEngineState;
  costedMistakes: number;
  hintsBought: number;
  attempts: number;
  lastFeedback: CipherFeedback | null;
}

export type CipherAction =
  | { type: 'pencil'; cipherLetter: string; plain: string | null }
  | { type: 'develop' }
  | { type: 'reveal-letter' };

function isPerfect(s: CipherRoomState): boolean {
  return s.costedMistakes === 0 && s.hintsBought === 0;
}

function outcomeOf(s: CipherRoomState): RoomOutcome {
  return {
    status: s.engine.status === 'won' ? 'solved' : 'active',
    perfect: isPerfect(s),
  };
}

export const cipherAdapter: RoomPuzzleAdapter<CipherPuzzleEx, CipherRoomState, CipherAction> = {
  kind: 'cipher',
  size: 'micro',

  select: (opts) => selectByTier(CIPHER_POOL, opts),

  // §5.3 — developed letters, the penciled mapping and every paid print are
  // plain JSON data on `CipherRoomState`.
  find: (id) => CIPHER_POOL.find((p) => p.id === id),
  stateVersion: 1,

  start(puzzle: CipherPuzzleEx, _ctx: RoomContext): CipherRoomState {
    return {
      engine: startCipher(puzzle),
      costedMistakes: 0,
      hintsBought: 0,
      attempts: 0,
      lastFeedback: null,
    };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];

    if (action.type === 'pencil') {
      // Penciling is thinking — free, silent, never an event.
      const engine = assignCipher(state.engine, action.cipherLetter, action.plain);
      if (engine === state.engine) return { state, events, outcome: outcomeOf(state) };
      return { state: { ...state, engine }, events, outcome: outcomeOf(state) };
    }

    if (action.type === 'reveal-letter') {
      const { state: engine, letter } = revealCipherLetter(puzzle, state.engine);
      if (letter === null) return { state, events, outcome: outcomeOf(state) };
      events.push({ type: 'hint', weight: 1 });
      const next: CipherRoomState = {
        ...state,
        engine,
        hintsBought: state.hintsBought + 1,
        attempts: state.attempts + 1,
        lastFeedback: { kind: 'letter-developed', letter },
      };
      return { state: next, events, outcome: outcomeOf(next) };
    }

    // Develop — the claim.
    const { state: engine, result } = developCipher(puzzle, state.engine);
    let next: CipherRoomState = { ...state, engine, attempts: state.attempts + 1 };

    switch (result.kind) {
      case 'developed': {
        next = { ...next, lastFeedback: { kind: 'developed' } };
        events.push({ type: 'progress', detail: 'print-developed' });
        events.push({ type: 'solved', perfect: isPerfect(next) });
        return { state: next, events, outcome: outcomeOf(next) };
      }
      case 'incomplete': {
        if (state.engine.status !== 'playing') return { state, events, outcome: outcomeOf(state) };
        next = { ...next, lastFeedback: { kind: 'incomplete', missing: result.missing } };
        events.push({ type: 'mistake', weight: 0 });   // malformed, free (AAA 3.2)
        return { state: next, events, outcome: outcomeOf(next) };
      }
      case 'murky': {
        next = {
          ...next,
          costedMistakes: result.charged ? next.costedMistakes + 1 : next.costedMistakes,
          lastFeedback: {
            kind: 'murky', correct: result.correct, total: result.total, charged: result.charged,
          },
        };
        // A full mapping is a claim (weight 1) — but the SAME mapping is the
        // same claim, and answering it twice yields nothing new, so it is
        // free (AAA 3.2; the Linen Closet's re-check rule).
        events.push({ type: 'mistake', weight: result.charged ? 1 : 0 });
        return { state: next, events, outcome: outcomeOf(next) };
      }
    }
  },

  puzzleId: (p) => p.id,
};
