/**
 * The Music Room — rhyme chain behind the RoomPuzzle contract.
 * OWNER: A5. Pure TS; wraps engine/puzzles/rhyme.ts. All rhyme judgement is
 * exact-set lookup against build-time phonetics (no phonetics in the bundle).
 *
 * Economy mapping (AAA §0.3 — generative room, R.1's principle):
 *   - misses, near-rhymes, homophones, repeats: weight 0 (free feedback);
 *   - the planted eye-rhyme decoy: weight 1 — the room's pre-warned trap;
 *   - "hum a bar" silhouette hint: `hint` weight 1;
 *   - perfect = no decoys struck, no hints.
 */

import type { Tier } from '../types';
import { createRng, pick } from '../rng';
import {
  humRhymeHint, startRhyme, submitRhyme,
  type RhymeEngineState, type RhymePuzzle, type RhymeResult,
} from './rhyme';
import type { RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../rooms/room-puzzle';
import rhymeData from '../../../content/generated/rhyme.json';

export const RHYME_POOL = rhymeData as RhymePuzzle[];

const TIER_DIFFICULTY: Record<Tier, RhymePuzzle['difficulty'][]> = {
  1: ['medium', 'easy'],
  2: ['hard', 'medium'],
  3: ['expert', 'hard'],
};

export type RhymeFeedback = RhymeResult | { kind: 'hummed' } | { kind: 'nothing-to-hum' };

export interface RhymeRoomState {
  rh: RhymeEngineState;
  tier: Tier;
  attempts: number;
  lastFeedback: RhymeFeedback | null;
}

export type RhymeAction =
  | { type: 'submit'; word: string }
  | { type: 'hum' };

function isPerfect(s: RhymeRoomState): boolean {
  return s.rh.decoysHit.length === 0 && s.rh.hintsUsed === 0;
}

function outcomeOf(s: RhymeRoomState): RoomOutcome {
  return s.rh.status === 'won'
    ? { status: 'solved', perfect: isPerfect(s) }
    : { status: 'active', perfect: isPerfect(s) };
}

export const rhymeAdapter: RoomPuzzleAdapter<RhymePuzzle, RhymeRoomState, RhymeAction> = {
  kind: 'rhyme',
  size: 'micro',

  select({ tier, seed, seenIds }) {
    const rng = createRng(seed);
    const seen = new Set(seenIds);
    for (const difficulty of TIER_DIFFICULTY[tier]) {
      const fresh = RHYME_POOL.filter((p) => p.difficulty === difficulty && !seen.has(p.id));
      if (fresh.length > 0) return pick(rng, fresh);
    }
    const anyFresh = RHYME_POOL.filter((p) => !seen.has(p.id));
    return anyFresh.length > 0 ? pick(rng, anyFresh) : pick(rng, RHYME_POOL);
  },

  start(puzzle, ctx): RhymeRoomState {
    return { rh: startRhyme(puzzle), tier: ctx.tier, attempts: 0, lastFeedback: null };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];

    if (action.type === 'hum') {
      const { state: rh, silhouette } = humRhymeHint(puzzle, state.rh);
      if (silhouette === null) {
        const next: RhymeRoomState = {
          ...state, attempts: state.attempts + 1, lastFeedback: { kind: 'nothing-to-hum' },
        };
        return { state: next, events, outcome: outcomeOf(next) };
      }
      events.push({ type: 'hint', weight: 1 });
      const next: RhymeRoomState = {
        ...state, rh, attempts: state.attempts + 1, lastFeedback: { kind: 'hummed' },
      };
      return { state: next, events, outcome: outcomeOf(next) };
    }

    const { state: rh, result } = submitRhyme(puzzle, state.rh, action.word);
    const next: RhymeRoomState = {
      ...state, rh, attempts: state.attempts + 1, lastFeedback: result,
    };

    switch (result.kind) {
      case 'found':
        events.push({ type: 'progress', detail: result.roundComplete ? 'verse-complete' : 'rhyme-found' });
        if (result.won) {
          events.push({ type: 'solved', perfect: isPerfect(next) });
          return { state: next, events, outcome: { status: 'solved', perfect: isPerfect(next) } };
        }
        break;
      case 'decoy':
        events.push({ type: 'mistake', weight: 1 });
        break;
      case 'near':
      case 'homophone':
      case 'miss':
      case 'prompt':
      case 'already-found':
      case 'already-tried':
        events.push({ type: 'mistake', weight: 0 });
        break;
      case 'finished':
        break;
    }
    return { state: next, events, outcome: outcomeOf(next) };
  },

  puzzleId: (p) => p.id,
};
