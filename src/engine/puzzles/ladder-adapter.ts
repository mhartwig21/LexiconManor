/**
 * The Staircase — Word Ladder behind the RoomPuzzle contract. OWNER: A4.
 *
 * Wraps the pure engine (`startLadder`/`submitLadderRung`/`stepBack`), with
 * the shipped ladder lexicon injected as the dictionary predicate — the same
 * word list the generator's BFS verified `par` against, so any climb the
 * player finds is honest.
 *
 * Mistake semantics (AAA R.1's principle): a traced rung is a PROBE, not a
 * claim — every refusal is weight 0 (Wordle's gentle refusal; the word is
 * not consumed). The only step-priced action is buying the next stone
 * (`hint` weight 1, BFS-optimal from where she stands). Refused words stay
 * listed (memory prosthetic 3.3); stepping back down is free.
 *
 * Perfect = reached the target at par with no purchased stones. Wandering
 * above par still solves — perfect is a bonus withheld, never a sting.
 */

import type { Difficulty, Tier } from '../types';
import { createRng, pick } from '../rng';
import {
  shortestLadderPath, startLadder, stepBack, submitLadderRung,
  type LadderEngineState, type LadderPuzzle,
} from './ladder';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../rooms/room-puzzle';
import { getPools, lazyContent } from '../../app/pools';

interface LadderBundle { words: string[]; solutionWords: string[]; puzzles: LadderPuzzle[] }
const bundle = (): LadderBundle => getPools().ladder as LadderBundle;
export const LADDER_POOL = lazyContent<LadderPuzzle[]>(() => bundle().puzzles);
/** The shipped probe lexicon — the generous dictionary of the room. */
export const LADDER_WORDS: ReadonlySet<string> = lazyContent<Set<string>>(
  () => new Set(bundle().words), new Set(),
);
/**
 * The climbing lexicon: frequency-floored common words the generator built
 * endpoints, solutions, and par from. The "next stone" hint routes through
 * THIS list first, so a bought stone is always a word she knows — never
 * PACS or SHEW (Koster-fairness; Wordle's curated answer list).
 */
export const LADDER_SOLUTION_WORDS: ReadonlySet<string> = lazyContent<Set<string>>(
  () => new Set(bundle().solutionWords), new Set(),
);

const TIER_DIFFICULTY: Record<Tier, Difficulty[]> = {
  1: ['medium', 'easy'],
  2: ['hard', 'medium'],
  3: ['expert', 'hard'],
};

export type LadderFeedback =
  | { kind: 'valid'; word: string; steps: number; par: number; won: boolean; atPar: boolean }
  | { kind: 'invalid'; reason: 'wrong-length' | 'not-one-step' | 'already-used' | 'not-a-word' | 'finished'; word: string }
  | { kind: 'stone-bought'; word: string; won: boolean }
  | { kind: 'stepped-back'; toWord: string };

export interface LadderRoomState {
  engine: LadderEngineState;
  /** Indices into engine.rungs that were purchased, for gilt display. */
  boughtRungs: number[];
  hintsBought: number;
  /** Refused probes, kept visible — never re-derived (AAA 3.3). */
  missedWords: string[];
  attempts: number;
  lastFeedback: LadderFeedback | null;
}

export type LadderAction =
  | { type: 'step'; word: string }
  | { type: 'step-back' }
  | { type: 'buy-stone' };

function isPerfect(puzzle: LadderPuzzle, s: LadderRoomState): boolean {
  // At-or-under par: par is optimal within the climbing lexicon, but a probe
  // through the wider dictionary may legitimately beat it — still perfect.
  return s.hintsBought === 0
    && (s.engine.status !== 'won' || s.engine.rungs.length - 1 <= puzzle.par);
}

function outcomeOf(puzzle: LadderPuzzle, s: LadderRoomState): RoomOutcome {
  return {
    status: s.engine.status === 'won' ? 'solved' : 'active',
    perfect: isPerfect(puzzle, s),
  };
}

export const ladderAdapter: RoomPuzzleAdapter<LadderPuzzle, LadderRoomState, LadderAction> = {
  kind: 'ladder',
  size: 'micro',

  select({ tier, seed, seenIds }) {
    const rng = createRng(seed);
    const seen = new Set(seenIds);
    for (const difficulty of TIER_DIFFICULTY[tier]) {
      const fresh = LADDER_POOL.filter((p) => p.difficulty === difficulty && !seen.has(p.id));
      if (fresh.length > 0) return pick(rng, fresh);
    }
    const anyFresh = LADDER_POOL.filter((p) => !seen.has(p.id));
    return anyFresh.length > 0 ? pick(rng, anyFresh) : pick(rng, LADDER_POOL);
  },

  start(puzzle: LadderPuzzle, _ctx: RoomContext): LadderRoomState {
    return {
      engine: startLadder(puzzle),
      boughtRungs: [],
      hintsBought: 0,
      missedWords: [],
      attempts: 0,
      lastFeedback: null,
    };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];

    if (action.type === 'step-back') {
      const engine = stepBack(state.engine);
      if (engine === state.engine) return { state, events, outcome: outcomeOf(puzzle, state) };
      const droppedIndex = state.engine.rungs.length - 1;
      const next: LadderRoomState = {
        ...state,
        engine,
        boughtRungs: state.boughtRungs.filter((i) => i !== droppedIndex),
        attempts: state.attempts + 1,
        lastFeedback: { kind: 'stepped-back', toWord: engine.rungs[engine.rungs.length - 1]! },
      };
      return { state: next, events, outcome: outcomeOf(puzzle, next) };
    }

    if (action.type === 'buy-stone') {
      if (state.engine.status !== 'playing') return { state, events, outcome: outcomeOf(puzzle, state) };
      const current = state.engine.rungs[state.engine.rungs.length - 1]!;
      // Sell common stones first: BFS over the climbing lexicon (plus where
      // she stands, which may be an off-list probe). Only if no common route
      // exists does the room fall back to the full probe dictionary.
      const path = shortestLadderPath(current, puzzle.target, new Set([...LADDER_SOLUTION_WORDS, current]))
        ?? shortestLadderPath(current, puzzle.target, LADDER_WORDS);
      const stone = path?.[1];
      if (!stone) return { state, events, outcome: outcomeOf(puzzle, state) };
      const { state: engine, result } = submitLadderRung(puzzle, state.engine, stone, (w) => LADDER_WORDS.has(w));
      if (result.kind !== 'valid') return { state, events, outcome: outcomeOf(puzzle, state) };
      events.push({ type: 'hint', weight: 1 });
      const next: LadderRoomState = {
        ...state,
        engine,
        boughtRungs: [...state.boughtRungs, engine.rungs.length - 1],
        hintsBought: state.hintsBought + 1,
        attempts: state.attempts + 1,
        lastFeedback: { kind: 'stone-bought', word: stone, won: result.won },
      };
      events.push({ type: 'progress', detail: `rung:${engine.rungs.length - 1}` });
      if (result.won) events.push({ type: 'solved', perfect: false });
      return { state: next, events, outcome: outcomeOf(puzzle, next) };
    }

    const { state: engine, result } = submitLadderRung(
      puzzle, state.engine, action.word, (w) => LADDER_WORDS.has(w),
    );
    let next: LadderRoomState = { ...state, engine, attempts: state.attempts + 1 };

    if (result.kind === 'valid') {
      const atPar = result.won && engine.rungs.length - 1 === puzzle.par;
      next = {
        ...next,
        lastFeedback: { kind: 'valid', word: result.word, steps: result.steps, par: puzzle.par, won: result.won, atPar },
      };
      events.push({ type: 'progress', detail: `rung:${result.steps}` });
      if (result.won) events.push({ type: 'solved', perfect: isPerfect(puzzle, next) });
      return { state: next, events, outcome: outcomeOf(puzzle, next) };
    }

    if (result.reason !== 'finished') {
      const missed = result.reason === 'not-a-word' && !state.missedWords.includes(result.word);
      next = {
        ...next,
        missedWords: missed ? [...state.missedWords, result.word] : state.missedWords,
        lastFeedback: { kind: 'invalid', reason: result.reason, word: result.word },
      };
      events.push({ type: 'mistake', weight: 0 });   // probes are free, always
    }

    return { state: next, events, outcome: outcomeOf(puzzle, next) };
  },

  puzzleId: (p) => p.id,
};
