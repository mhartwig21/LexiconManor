/**
 * The Study — Forgotten Word behind the RoomPuzzle contract. OWNER: A3.
 *
 * Wraps the existing pure engine (`startForgottenWord`/`submitGuess`).
 * Manor rulings (AAA 3.7, §0.3, MANOR_DESIGN §11):
 *   - v1's TIMED hive trials for clues are retired (timed pressure is out of
 *     scope). Clues are unsealed by *spending steps* instead — a `hint` event
 *     with weight 1 (STEP_TABLE maps it: −2, tier 3 −3). One currency.
 *   - a wrong guess is a deliberate claim in a deduction room → weight 1.
 *   - out of guesses → auto-`abandoned`, never a fail screen; the word is
 *     revealed for closure (Wordle precedent) — the slice marks the puzzle
 *     seen on abandon so a revealed word can't be farmed on a later day.
 *   - definition clarity + guess allowance scale with room tier
 *     (tier 1 plain/5 → tier 2 poetic/4 → tier 3 riddle/3).
 */

import type { ForgottenWordPuzzle, Tier } from '../../types';
import { createRng, pick } from '../../rng';
import {
  startForgottenWord, submitGuess, unlockClue,
  type ClueId, type ForgottenWordState,
} from '../../forgotten-word';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../room-puzzle';
import forgottenWordData from '../../../../content/generated/forgotten-word.json';

export const FORGOTTEN_WORD_POOL = forgottenWordData as ForgottenWordPuzzle[];

const TIER_OBSCURITY: Record<Tier, ForgottenWordPuzzle['obscurity'][]> = {
  1: ['common', 'medium'],
  2: ['medium', 'rare'],
  3: ['rare', 'archaic', 'medium'],
};

export type ForgottenWordFeedback =
  | { kind: 'correct'; word: string }
  | { kind: 'wrong'; guess: string; guessesLeft: number }
  /** Out of guesses: warm auto-abandon, word revealed for closure. */
  | { kind: 'slipped'; word: string }
  | { kind: 'clue-unsealed'; clue: ClueId }
  | { kind: 'invalid'; reason: 'empty' | 'repeat' | 'finished' };

export interface ForgottenWordRoomState {
  fw: ForgottenWordState;
  /** Room tier, kept for the definition level and clue pricing display. */
  tier: Tier;
  costedMistakes: number;
  hintsBought: number;
  attempts: number;
  lastFeedback: ForgottenWordFeedback | null;
}

export type ForgottenWordAction =
  | { type: 'guess'; word: string }
  | { type: 'unseal-clue'; clue: ClueId };

function isPerfect(s: ForgottenWordRoomState): boolean {
  return s.costedMistakes === 0 && s.hintsBought === 0;
}

export const forgottenWordAdapter: RoomPuzzleAdapter<ForgottenWordPuzzle, ForgottenWordRoomState, ForgottenWordAction> = {
  kind: 'forgotten-word',
  size: 'anchor',

  select({ tier, seed, seenIds }) {
    const rng = createRng(seed);
    const seen = new Set(seenIds);
    for (const obscurity of TIER_OBSCURITY[tier]) {
      const fresh = FORGOTTEN_WORD_POOL.filter((p) => p.obscurity === obscurity && !seen.has(p.id));
      if (fresh.length > 0) return pick(rng, fresh);
    }
    const anyFresh = FORGOTTEN_WORD_POOL.filter((p) => !seen.has(p.id));
    return anyFresh.length > 0 ? pick(rng, anyFresh) : pick(rng, FORGOTTEN_WORD_POOL);
  },

  start(puzzle: ForgottenWordPuzzle, ctx: RoomContext): ForgottenWordRoomState {
    return {
      fw: startForgottenWord(puzzle, ctx.tier),
      tier: ctx.tier,
      costedMistakes: 0,
      hintsBought: 0,
      attempts: 0,
      lastFeedback: null,
    };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];

    if (action.type === 'unseal-clue') {
      if (state.fw.status !== 'playing' || state.fw.unlockedClues.includes(action.clue)) {
        return { state, events, outcome: outcomeOf(state) };
      }
      events.push({ type: 'hint', weight: 1 });
      const next: ForgottenWordRoomState = {
        ...state,
        fw: unlockClue(state.fw, action.clue),
        hintsBought: state.hintsBought + 1,
        lastFeedback: { kind: 'clue-unsealed', clue: action.clue },
      };
      return { state: next, events, outcome: outcomeOf(next) };
    }

    const { state: fw, result } = submitGuess(puzzle, state.fw, action.word);
    let next: ForgottenWordRoomState = { ...state, fw, attempts: state.attempts + 1 };

    switch (result.kind) {
      case 'correct': {
        next = { ...next, lastFeedback: { kind: 'correct', word: result.word } };
        events.push({ type: 'progress', detail: 'word-remembered' });
        events.push({ type: 'solved', perfect: isPerfect(next) });
        return { state: next, events, outcome: { status: 'solved', perfect: isPerfect(next) } };
      }
      case 'wrong': {
        next = { ...next, costedMistakes: next.costedMistakes + 1 };
        events.push({ type: 'mistake', weight: 1 });
        if (result.lost) {
          // Auto-abandon, never a fail (AAA 3.7): reveal for closure.
          next = { ...next, lastFeedback: { kind: 'slipped', word: puzzle.word } };
          events.push({ type: 'progress', detail: 'slipped-away' });
          return { state: next, events, outcome: { status: 'abandoned', perfect: false } };
        }
        next = {
          ...next,
          lastFeedback: { kind: 'wrong', guess: fw.guesses[fw.guesses.length - 1]!, guessesLeft: result.guessesLeft },
        };
        break;
      }
      case 'invalid': {
        next = { ...next, lastFeedback: { kind: 'invalid', reason: result.reason } };
        if (result.reason === 'repeat') events.push({ type: 'mistake', weight: 0 });
        break;
      }
    }

    return { state: next, events, outcome: outcomeOf(next) };
  },

  puzzleId: (p) => p.id,
};

function outcomeOf(s: ForgottenWordRoomState): RoomOutcome {
  const status = s.fw.status === 'won' ? 'solved' : s.fw.status === 'lost' ? 'abandoned' : 'active';
  return { status, perfect: status === 'abandoned' ? false : isPerfect(s) };
}
