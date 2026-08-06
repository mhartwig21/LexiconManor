/**
 * The Darkroom — Substitution Cipher behind the RoomPuzzle contract. OWNER: A4.
 *
 * Wraps the pure engine (`startCipher`/`assignCipher`/`developCipher`/
 * `revealCipherLetter`). Mistake semantics (AAA §0.3): penciling is thinking
 * — free, no events. DEVELOPING the print is the claim: a murky develop
 * costs weight 1 but always reports "N of M letters ring true" (every wrong
 * guess yields information, AAA 2.10's principle). Developing with blanks is
 * malformed → weight 0. Reveals are step-priced hints (`hint` weight 1).
 * Penciled letters persist and locked letters never regress (AAA 3.3).
 */

import type { Difficulty, Tier } from '../types';
import { createRng, pick } from '../rng';
import {
  assignCipher, developCipher, revealCipherLetter, startCipher,
  type CipherEngineState, type CipherPuzzle,
} from './cipher';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../rooms/room-puzzle';
import cipherData from '../../../content/generated/cipher.json';

export const CIPHER_POOL = cipherData as CipherPuzzle[];

const TIER_DIFFICULTY: Record<Tier, Difficulty[]> = {
  1: ['medium', 'easy'],
  2: ['hard', 'medium'],
  3: ['expert', 'hard'],
};

export type CipherFeedback =
  | { kind: 'developed' }
  | { kind: 'murky'; correct: number; total: number }
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

export const cipherAdapter: RoomPuzzleAdapter<CipherPuzzle, CipherRoomState, CipherAction> = {
  kind: 'cipher',
  size: 'micro',

  select({ tier, seed, seenIds }) {
    const rng = createRng(seed);
    const seen = new Set(seenIds);
    for (const difficulty of TIER_DIFFICULTY[tier]) {
      const fresh = CIPHER_POOL.filter((p) => p.difficulty === difficulty && !seen.has(p.id));
      if (fresh.length > 0) return pick(rng, fresh);
    }
    const anyFresh = CIPHER_POOL.filter((p) => !seen.has(p.id));
    return anyFresh.length > 0 ? pick(rng, anyFresh) : pick(rng, CIPHER_POOL);
  },

  start(puzzle: CipherPuzzle, _ctx: RoomContext): CipherRoomState {
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
          costedMistakes: next.costedMistakes + 1,
          lastFeedback: { kind: 'murky', correct: result.correct, total: result.total },
        };
        events.push({ type: 'mistake', weight: 1 });   // a full mapping is a claim
        return { state: next, events, outcome: outcomeOf(next) };
      }
    }
  },

  puzzleId: (p) => p.id,
};
