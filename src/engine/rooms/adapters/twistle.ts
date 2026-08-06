/**
 * The Gallery — Twistle behind the RoomPuzzle contract. OWNER: A3.
 *
 * Wraps the existing pure engine (`startTwistle`/`submitTwistleWord`).
 * Mistake semantics (AAA 3.2 + R.1's principle — a traced word is a probe,
 * not a claim; the Gallery's pressure is its targetCount, not step taxes):
 *   - not-a-word (real path, not a target) → weight 0, remembered in
 *     `missedWords` so she never re-derives a miss (memory prosthetic 3.3)
 *   - breaks-rule (path exists but skips the marked center tile — a rule the
 *     board visibly pre-warns) → weight 1
 *   - everything malformed (too short, impossible path, already found) → weight 0
 */

import type { Tier, TwistlePuzzle } from '../../types';
import { startTwistle, submitTwistleWord, type TwistleState } from '../../twistle';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../room-puzzle';
import { getPools, lazyContent } from '../../../app/pools';
import { selectByTier } from './tier-select';

/**
 * Round 4: the generator stamps a `tier` on every grid and the tiers differ
 * structurally — tier 1 offers five near-straight everyday traces at
 * minLength 4; tier 2 requires every target to turn at least twice; tier 3
 * raises minLength to 5, sets `centerRequired`, and ships only targets whose
 * straightest trace already corkscrews three times. The board's own `rules`
 * carry the escalation into the engine, so no runtime branch is needed.
 */
/** @deprecated `tier` is now REQUIRED on TwistlePuzzle in engine/types.ts;
 *  this alias is kept so existing imports keep resolving. */
export type TwistlePuzzleEx = TwistlePuzzle;

export const TWISTLE_POOL = lazyContent<TwistlePuzzleEx[]>(
  () => getPools().twistle as TwistlePuzzleEx[],
);

export type TwistleFeedback =
  | { kind: 'valid'; word: string; found: number; target: number; won: boolean }
  | { kind: 'invalid'; reason: 'too-short' | 'not-on-grid' | 'breaks-rule' | 'not-a-word' | 'already-found'; word: string; costed: boolean };

export interface TwistleRoomState {
  twistle: TwistleState;
  costedMistakes: number;
  attempts: number;
  /** Real paths that weren't targets — shown struck-through, never retried. */
  missedWords: string[];
  lastFeedback: TwistleFeedback | null;
}

export type TwistleAction = { type: 'submit'; word: string };

function isPerfect(s: TwistleRoomState): boolean {
  return s.costedMistakes === 0;
}

export const twistleAdapter: RoomPuzzleAdapter<TwistlePuzzleEx, TwistleRoomState, TwistleAction> = {
  kind: 'twistle',
  size: 'anchor',

  select: (opts) => selectByTier(TWISTLE_POOL, opts),

  start(_puzzle: TwistlePuzzleEx, _ctx: RoomContext): TwistleRoomState {
    return {
      twistle: startTwistle(_puzzle),
      costedMistakes: 0,
      attempts: 0,
      missedWords: [],
      lastFeedback: null,
    };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];
    const word = action.word.toUpperCase().trim();
    const { state: twistle, result } = submitTwistleWord(puzzle, state.twistle, word);
    let next: TwistleRoomState = { ...state, twistle, attempts: state.attempts + 1 };

    if (result.kind === 'valid') {
      next = {
        ...next,
        lastFeedback: {
          kind: 'valid',
          word: result.word,
          found: twistle.foundWords.length,
          target: puzzle.targetCount,
          won: result.won,
        },
      };
      events.push({ type: 'progress', detail: `word-found:${twistle.foundWords.length}/${puzzle.targetCount}` });
      if (result.won) events.push({ type: 'solved', perfect: isPerfect(next) });
      return {
        state: next,
        events,
        outcome: { status: result.won ? 'solved' : 'active', perfect: isPerfect(next) },
      };
    }

    if (result.reason !== 'finished') {
      const costed = result.reason === 'breaks-rule';
      const missed = result.reason === 'not-a-word' && !state.missedWords.includes(word);
      next = {
        ...next,
        costedMistakes: costed ? next.costedMistakes + 1 : next.costedMistakes,
        missedWords: missed ? [...state.missedWords, word] : state.missedWords,
        lastFeedback: { kind: 'invalid', reason: result.reason, word, costed },
      };
      events.push({ type: 'mistake', weight: costed ? 1 : 0 });
    }

    return { state: next, events, outcome: { status: 'active', perfect: isPerfect(next) } };
  },

  puzzleId: (p) => p.id,
};
