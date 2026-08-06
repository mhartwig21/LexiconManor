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
import {
  startForgottenWord, submitGuess, unlockClue,
  type ClueId, type ForgottenWordState,
} from '../../forgotten-word';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../room-puzzle';
import { getPools, lazyContent } from '../../../app/pools';
import { selectByTier } from './tier-select';

/**
 * Round 4: the generator stamps a `tier` on every entry (common → 1,
 * medium → 2, rare/archaic → 3) AND build-lints that the three definition
 * registers are three different kinds of sentence — plain gloss, third-person
 * image, first-person riddle — with a content-word overlap gate between them.
 * The old selector let tier 3 fall back to 'medium' obscurity, which is how a
 * row-6 Study ended up reading like a row-3 one; tier is now honoured exactly.
 */
/** @deprecated `tier` is now REQUIRED on ForgottenWordPuzzle in engine/types.ts;
 *  this alias is kept so existing imports keep resolving. */
export type ForgottenWordPuzzleEx = ForgottenWordPuzzle;

export const FORGOTTEN_WORD_POOL = lazyContent<ForgottenWordPuzzleEx[]>(
  () => getPools().forgottenWord as ForgottenWordPuzzleEx[],
);

export type ForgottenWordFeedback =
  | { kind: 'correct'; word: string }
  | { kind: 'wrong'; guess: string; guessesLeft: number }
  /** Out of guesses: warm auto-abandon, word revealed for closure. */
  | { kind: 'slipped'; word: string }
  | { kind: 'clue-unsealed'; clue: ClueId }
  /** 'wrong-length' is malformed input — free, no whisper consumed (AAA 3.2). */
  | { kind: 'invalid'; reason: 'empty' | 'repeat' | 'wrong-length' | 'finished' };

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

export const forgottenWordAdapter: RoomPuzzleAdapter<ForgottenWordPuzzleEx, ForgottenWordRoomState, ForgottenWordAction> = {
  kind: 'forgotten-word',
  size: 'anchor',

  select: (opts) => selectByTier(FORGOTTEN_WORD_POOL, opts),

  start(puzzle: ForgottenWordPuzzleEx, ctx: RoomContext): ForgottenWordRoomState {
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
        // Malformed input is a free feedback moment (AAA 3.2) — never costed.
        if (result.reason === 'repeat' || result.reason === 'wrong-length') {
          events.push({ type: 'mistake', weight: 0 });
        }
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
