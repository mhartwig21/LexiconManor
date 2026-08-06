/**
 * The Vestibule — Anagram behind the RoomPuzzle contract. OWNER: A4.
 *
 * Wraps the pure engine (`startAnagram`/`submitAnagram`/`revealAnagramLetter`).
 * Mistake semantics (AAA §0.3 + 3.2 + R.1's principle — free probes for
 * dictionary misses): in a single-answer anagram nearly every wrong
 * arrangement is a non-word, so an arrangement that isn't in the dictionary
 * is a PROBE, not a claim — weight 0, Wordle's gentle refusal, matching the
 * Staircase/Music Room/Pantry register. Wrong letters and re-submitting a
 * known miss are likewise free. Letter reveals are the room's only priced
 * action (`hint` weight 1) and forfeit perfect. Wrong tries stay listed
 * (memory prosthetic, AAA 3.3).
 */

import type { Difficulty, Tier } from '../types';
import { createRng, pick } from '../rng';
import {
  currentRound, revealAnagramLetter, startAnagram, submitAnagram,
  type AnagramEngineState, type AnagramPuzzle,
} from './anagram';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../rooms/room-puzzle';
import anagramData from '../../../content/generated/anagram.json';

export const ANAGRAM_POOL = anagramData as AnagramPuzzle[];

const TIER_DIFFICULTY: Record<Tier, Difficulty[]> = {
  1: ['medium', 'easy'],
  2: ['hard', 'medium'],
  3: ['expert', 'hard'],
};

export type AnagramFeedback =
  | { kind: 'valid'; word: string; round: number; totalRounds: number; won: boolean }
  | { kind: 'invalid'; reason: 'wrong-letters' | 'not-a-word' | 'already-tried' | 'finished'; word: string; costed: boolean }
  | { kind: 'letter-revealed'; letter: string };

export interface AnagramRoomState {
  engine: AnagramEngineState;
  costedMistakes: number;
  hintsBought: number;
  /** Monotonic action counter — views key one-shot juice off it. */
  attempts: number;
  lastFeedback: AnagramFeedback | null;
}

export type AnagramAction =
  | { type: 'submit'; word: string }
  | { type: 'reveal-letter' };

function isPerfect(s: AnagramRoomState): boolean {
  return s.costedMistakes === 0 && s.hintsBought === 0;
}

function outcomeOf(s: AnagramRoomState): RoomOutcome {
  return {
    status: s.engine.status === 'won' ? 'solved' : 'active',
    perfect: isPerfect(s),
  };
}

export const anagramAdapter: RoomPuzzleAdapter<AnagramPuzzle, AnagramRoomState, AnagramAction> = {
  kind: 'anagram',
  size: 'micro',

  select({ tier, seed, seenIds }) {
    const rng = createRng(seed);
    const seen = new Set(seenIds);
    for (const difficulty of TIER_DIFFICULTY[tier]) {
      const fresh = ANAGRAM_POOL.filter((p) => p.difficulty === difficulty && !seen.has(p.id));
      if (fresh.length > 0) return pick(rng, fresh);
    }
    const anyFresh = ANAGRAM_POOL.filter((p) => !seen.has(p.id));
    return anyFresh.length > 0 ? pick(rng, anyFresh) : pick(rng, ANAGRAM_POOL);
  },

  start(puzzle: AnagramPuzzle, _ctx: RoomContext): AnagramRoomState {
    return {
      engine: startAnagram(puzzle),
      costedMistakes: 0,
      hintsBought: 0,
      attempts: 0,
      lastFeedback: null,
    };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];

    if (action.type === 'reveal-letter') {
      const { state: engine, letter } = revealAnagramLetter(puzzle, state.engine);
      if (letter === null) return { state, events, outcome: outcomeOf(state) };
      events.push({ type: 'hint', weight: 1 });
      const next: AnagramRoomState = {
        ...state,
        engine,
        hintsBought: state.hintsBought + 1,
        attempts: state.attempts + 1,
        lastFeedback: { kind: 'letter-revealed', letter },
      };
      return { state: next, events, outcome: outcomeOf(next) };
    }

    const { state: engine, result } = submitAnagram(puzzle, state.engine, action.word);
    let next: AnagramRoomState = { ...state, engine, attempts: state.attempts + 1 };

    if (result.kind === 'valid') {
      next = {
        ...next,
        lastFeedback: {
          kind: 'valid',
          word: result.word,
          round: result.roundSolved,
          totalRounds: puzzle.rounds.length,
          won: result.won,
        },
      };
      events.push({ type: 'progress', detail: `round-solved:${result.roundSolved + 1}/${puzzle.rounds.length}` });
      if (result.won) events.push({ type: 'solved', perfect: isPerfect(next) });
      return { state: next, events, outcome: outcomeOf(next) };
    }

    if (result.reason !== 'finished') {
      // Every refusal is free: a non-word arrangement is a probe (R.1),
      // not a claim — the Vestibule is the front door, not a toll booth.
      next = {
        ...next,
        lastFeedback: { kind: 'invalid', reason: result.reason, word: result.word, costed: false },
      };
      events.push({ type: 'mistake', weight: 0 });
    }

    return { state: next, events, outcome: outcomeOf(next) };
  },

  puzzleId: (p) => p.id,
};

export { currentRound };
