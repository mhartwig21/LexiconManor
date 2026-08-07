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
 *
 * ROUND 7 — the closeness taxonomy (AAA 4.17, applied to the same verb at a
 * higher price). A whisper cost 3 steps and bought exactly one bit: "not that
 * word". The Sanctum's own criterion mandates shared letters / right length /
 * repeat guess for the identical act, so the Study — the most expensive
 * deduction room in the house — was returning strictly less than the criterion
 * that governs it. `closenessOf()` now rides along with every costed wrong
 * guess and is remembered per guess (AAA 3.3).
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

/**
 * AAA 4.17 — the Sanctum's closeness taxonomy ("shared letters / right length /
 * repeat guess"), which the Study owed and did not pay. The Study charges 2–3
 * steps for the identical verb at a *higher* price and used to return exactly
 * one bit ("not that word"), while the room we benchmark for reveal juice
 * (Wordle) is built entirely out of closeness. The adapter already knows the
 * answer; this is free with the guess it has already charged for.
 */
export interface GuessCloseness {
  guess: string;
  /** Letters of the headword the guess contains, counted as a multiset. */
  shared: number;
  /** …of those, how many stand in the right place. */
  exact: number;
}

/**
 * Multiset overlap + positional matches against the headword. Wordle's two
 * signals, computed once and remembered (AAA 3.3: she never re-derives what
 * the game already told her).
 */
export function closenessOf(answer: string, guess: string): { shared: number; exact: number } {
  const a = answer.toUpperCase().replace(/[^A-Z]/g, '');
  const g = guess.toUpperCase().replace(/[^A-Z]/g, '');
  const pool = new Map<string, number>();
  for (const ch of a) pool.set(ch, (pool.get(ch) ?? 0) + 1);
  let shared = 0;
  for (const ch of g) {
    const n = pool.get(ch) ?? 0;
    if (n > 0) {
      shared += 1;
      pool.set(ch, n - 1);
    }
  }
  let exact = 0;
  for (let i = 0; i < Math.min(a.length, g.length); i++) if (a[i] === g[i]) exact += 1;
  return { shared, exact };
}

export type ForgottenWordFeedback =
  | { kind: 'correct'; word: string }
  /**
   * A costed claim, answered with closeness rather than a bare refusal:
   * `rightLength` is always true here (a wrong length is refused for free
   * upstream), and `shared`/`exact` are the two Wordle signals.
   */
  | {
      kind: 'wrong';
      guess: string;
      guessesLeft: number;
      shared: number;
      exact: number;
      rightLength: boolean;
    }
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
  /**
   * AAA 3.3 [PARITY] — the elimination history keeps its closeness. The struck
   * chips told her only *that* she had tried a word; the count she paid for
   * stays attached to it so she never re-derives it.
   */
  closeness: GuessCloseness[];
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

  // §5.3 — whispers spent, unsealed clues and the closeness history are plain
  // JSON data. Restoring by id also keeps a REVEALED word from being re-rolled
  // into a fresh one at the same cell.
  find: (id) => FORGOTTEN_WORD_POOL.find((p) => p.id === id),
  stateVersion: 1,

  start(puzzle: ForgottenWordPuzzleEx, ctx: RoomContext): ForgottenWordRoomState {
    return {
      fw: startForgottenWord(puzzle, ctx.tier),
      tier: ctx.tier,
      costedMistakes: 0,
      hintsBought: 0,
      attempts: 0,
      closeness: [],
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
        const guess = fw.guesses[fw.guesses.length - 1]!;
        const { shared, exact } = closenessOf(puzzle.word, guess);
        next = {
          ...next,
          costedMistakes: next.costedMistakes + 1,
          closeness: [...next.closeness, { guess, shared, exact }],
        };
        events.push({ type: 'mistake', weight: 1 });
        if (result.lost) {
          // Auto-abandon, never a fail (AAA 3.7): reveal for closure.
          next = { ...next, lastFeedback: { kind: 'slipped', word: puzzle.word } };
          events.push({ type: 'progress', detail: 'slipped-away' });
          return { state: next, events, outcome: { status: 'abandoned', perfect: false } };
        }
        next = {
          ...next,
          lastFeedback: {
            kind: 'wrong',
            guess,
            guessesLeft: result.guessesLeft,
            shared,
            exact,
            // The card announces the count and a wrong length is refused free
            // upstream, so a costed claim is always the right length — and the
            // room now says so out loud instead of leaving her to infer it.
            rightLength: true,
          },
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
