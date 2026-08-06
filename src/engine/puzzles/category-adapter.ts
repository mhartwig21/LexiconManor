/**
 * The Pantry — category sprint behind the RoomPuzzle contract.
 * OWNER: A5. Pure TS; wraps engine/puzzles/category.ts.
 *
 * Economy mapping (AAA §0.3, 3.6 — the game's one timed pressure):
 *   - misses & repeats: weight 0 (generative room, free feedback);
 *   - the curated trap (TOMATO among the vegetables): weight 1, with an
 *     authored knowing line;
 *   - the pantry clock: the VIEW dispatches `tick` on its cadence
 *     (TICK_SECONDS); ticks are free until parTicks, then each costs a
 *     weight-1 mistake up to maxCostedTicks — after that the pantry stops
 *     charging. Steps only, never a real-time fail state;
 *   - finishing at or under par pays a gem (`reward`);
 *   - perfect = no traps struck and no costed ticks (hints don't exist here).
 */

import type { Tier } from '../types';
import { createRng, pick } from '../rng';
import {
  startCategory, submitCategory, tickCategory, underPar,
  type CategoryEngineState, type CategoryPuzzle, type CategoryResult,
} from './category';
import type { RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../rooms/room-puzzle';
import categoryData from '../../../content/generated/category.json';

export const CATEGORY_POOL = categoryData as CategoryPuzzle[];

/** The pantry clock's cadence — the ONE tunable of the game's one timer. */
export const TICK_SECONDS = 8;

const TIER_DIFFICULTY: Record<Tier, CategoryPuzzle['difficulty'][]> = {
  1: ['medium', 'easy'],
  2: ['hard', 'medium'],
  3: ['expert', 'hard'],
};

export type CategoryFeedback =
  | CategoryResult
  | { kind: 'tick'; costed: boolean; pastPar: boolean };

export interface CategoryRoomState {
  cat: CategoryEngineState;
  tier: Tier;
  attempts: number;
  lastFeedback: CategoryFeedback | null;
}

export type CategoryAction =
  | { type: 'submit'; word: string }
  | { type: 'tick' };

function isPerfect(s: CategoryRoomState): boolean {
  return s.cat.trapsHit.length === 0 && s.cat.costedTicks === 0;
}

function outcomeOf(s: CategoryRoomState): RoomOutcome {
  return s.cat.status === 'won'
    ? { status: 'solved', perfect: isPerfect(s) }
    : { status: 'active', perfect: isPerfect(s) };
}

export const categoryAdapter: RoomPuzzleAdapter<CategoryPuzzle, CategoryRoomState, CategoryAction> = {
  kind: 'category',
  size: 'micro',

  select({ tier, seed, seenIds }) {
    const rng = createRng(seed);
    const seen = new Set(seenIds);
    for (const difficulty of TIER_DIFFICULTY[tier]) {
      const fresh = CATEGORY_POOL.filter((p) => p.difficulty === difficulty && !seen.has(p.id));
      if (fresh.length > 0) return pick(rng, fresh);
    }
    const anyFresh = CATEGORY_POOL.filter((p) => !seen.has(p.id));
    return anyFresh.length > 0 ? pick(rng, anyFresh) : pick(rng, CATEGORY_POOL);
  },

  start(puzzle, ctx): CategoryRoomState {
    return { cat: startCategory(puzzle), tier: ctx.tier, attempts: 0, lastFeedback: null };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];

    if (action.type === 'tick') {
      const { state: cat, costed } = tickCategory(puzzle, state.cat);
      if (cat === state.cat) return { state, events, outcome: outcomeOf(state) };
      if (costed) events.push({ type: 'mistake', weight: 1 });
      const next: CategoryRoomState = {
        ...state,
        cat,
        // ticks are ambient — they don't bump attempts (toasts key off attempts)
        lastFeedback: { kind: 'tick', costed, pastPar: cat.ticks > puzzle.parTicks },
      };
      return { state: next, events, outcome: outcomeOf(next) };
    }

    const { state: cat, result } = submitCategory(puzzle, state.cat, action.word);
    const next: CategoryRoomState = {
      ...state, cat, attempts: state.attempts + 1, lastFeedback: result,
    };

    switch (result.kind) {
      case 'found':
        events.push({ type: 'progress', detail: result.won ? 'shelf-full' : 'shelved' });
        if (result.won) {
          if (underPar(puzzle, cat)) events.push({ type: 'reward', gems: 1 });
          events.push({ type: 'solved', perfect: isPerfect(next) });
          return { state: next, events, outcome: { status: 'solved', perfect: isPerfect(next) } };
        }
        break;
      case 'trap':
        events.push({ type: 'mistake', weight: 1 });
        break;
      case 'miss':
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
