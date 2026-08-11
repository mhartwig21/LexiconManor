/**
 * The Gallery — Twistle behind the RoomPuzzle contract. OWNER: A3.
 *
 * Wraps the existing pure engine (`startTwistle`/`submitTwistleWord`).
 * Mistake semantics (AAA 3.2 + R.1's principle — a traced word is a probe,
 * not a claim; the Gallery's pressure is its targetCount, not step taxes):
 *   - STUDY (round 28: a real word she traced that the room did not ask for)
 *     → not a mistake at all. No `mistake` event, no weight, no strike: it
 *     hangs on the wall and it scores. See BENCHMARKS §8.
 *   - not-a-word (traceable, but the curator's list does not carry it — the
 *     corpus-obscure and the cozy gate's own refusals) → weight 0, remembered
 *     in `missedWords` so she never re-derives a miss (memory prosthetic 3.3)
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
 * The generator stamps a `tier` on every grid and the tiers differ structurally.
 * As of rounds 26 and 28: `minLength` is 5 everywhere and `centerRequired` from
 * tier 2 up (both carried in the board's own `rules`, so `findPath` needs no
 * runtime branch), while the corner floor climbs 1 → 2 → 4 and rides on
 * `minTurns` — which is deliberately NOT in `rules`, because it sorts the
 * board's accepted words into works and studies rather than deciding whether a
 * real word is a word. Round 17 enforced it as an acceptance rule and the room
 * refused a median 23 known words a board at tier 3 for it.
 */
/** @deprecated `tier` is now REQUIRED on TwistlePuzzle in engine/types.ts;
 *  this alias is kept so existing imports keep resolving. */
export type TwistlePuzzleEx = TwistlePuzzle;

export const TWISTLE_POOL = lazyContent<TwistlePuzzleEx[]>(
  () => getPools().twistle as TwistlePuzzleEx[],
);

export type TwistleFeedback =
  | { kind: 'valid'; word: string; found: number; target: number; won: boolean }
  /** ROUND 28 — a real word she traced that the room did not ask for. */
  | { kind: 'study'; word: string; points: number }
  | { kind: 'invalid'; reason: 'too-short' | 'not-on-grid' | 'breaks-rule' | 'not-a-word' | 'already-found'; word: string; costed: boolean };

export interface TwistleRoomState {
  twistle: TwistleState;
  costedMistakes: number;
  attempts: number;
  /**
   * Real paths the CURATOR'S LIST does not carry — shown struck-through, never
   * retried. Round 28 emptied most of this out: a traced word she plausibly
   * knows is a study now, and only what the board genuinely does not accept
   * (obscure corpus words, and the cozy gate's own refusals) lands here.
   */
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

  // §5.3 — traced words and the struck-through misses are plain JSON data.
  find: (id) => TWISTLE_POOL.find((p) => p.id === id),
  /**
   * 2 (round 28) — `TwistleState` grew `foundStudies`, and every board in the
   * pool was regenerated with it, so a snapshot written under version 1 names
   * an id whose grid has changed. Bumping discards those rather than restoring
   * a session onto a different board.
   */
  stateVersion: 2,

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

    // ROUND 28 — a STUDY is not a mistake and never was. It costs nothing, it
    // emits no `mistake` event, and it goes up on the wall beside the works.
    // (`stageFractionOf` returns null for this kind, so a new progress detail
    // cannot move a step payout — the Gallery is under `LADDER_MINUTES`.)
    if (result.kind === 'study') {
      next = { ...next, lastFeedback: { kind: 'study', word: result.word, points: result.points } };
      events.push({ type: 'progress', detail: `study-found:${(twistle.foundStudies ?? []).length}` });
      return { state: next, events, outcome: { status: 'active', perfect: isPerfect(next) } };
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
      events.push({ type: 'mistake', weight: costed ? 1 : 0, detail: result.reason });
    }

    return { state: next, events, outcome: { status: 'active', perfect: isPerfect(next) } };
  },

  puzzleId: (p) => p.id,
};
