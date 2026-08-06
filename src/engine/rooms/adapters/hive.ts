/**
 * The Conservatory — Hive Builder behind the RoomPuzzle contract. OWNER: A3.
 *
 * Wraps the existing pure engine (`startHive`/`submitHiveWord`).
 * Manor rulings applied here (ARCHITECTURE §2, AAA §0.3 R.1, §1):
 *   - v1's entropy/fade/lose mechanic is retired: the engine is always called
 *     `entropyImmune`, letters never fade, the hive can never be "lost".
 *   - invalid dictionary word / too short / already found → mistake weight 0
 *     (free feedback moment — spam-guessing is the fun, AAA R.1 / 1.10).
 *   - structural violations the live entry-coloring already warned about
 *     (missing center, bad letters) → mistake weight 'structural' (flat −1 at
 *     every tier via STEP_TABLE — AAA R.1, never the −2/−3 deduction row).
 *   - the in-room rank ladder (AAA 1.11) lives in this adapter's state:
 *     SB curve ≈2/5/8/15/25/40/50/70% of the room max, garden-themed.
 *     `solved` fires at Full Bloom (70%); the hidden Every Petal tier (100%)
 *     pays a gem via a `reward` event.
 */

import type { Difficulty, HivePuzzle, Tier } from '../../types';
import { createRng, pick } from '../../rng';
import { startHive, submitHiveWord, type HiveState } from '../../hive';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../room-puzzle';
import { getPools, lazyContent } from '../../../app/pools';

export const HIVE_POOL = lazyContent<HivePuzzle[]>(() => getPools().hive);

const TIER_DIFFICULTY: Record<Tier, Difficulty[]> = {
  1: ['medium', 'easy'],
  2: ['hard', 'medium'],
  3: ['expert', 'hard'],
};

/**
 * Garden-themed rank ladder on the SB curve shape (AAA 1.11), with the early
 * rungs front-loaded so a 50th-percentile finding rate (~6 words in the first
 * two minutes of a curated 45–80 word hive) crosses ≥3 rungs (AAA 1.13 —
 * verified by simulation over the shipped pool in content/generate-hive.ts).
 */
export interface HiveLadderTier { name: string; pct: number }
export const HIVE_LADDER: readonly HiveLadderTier[] = [
  { name: 'Seed', pct: 0 },
  { name: 'Sprout', pct: 1 },
  { name: 'Bud', pct: 3 },
  { name: 'Shoot', pct: 5 },
  { name: 'Leaf', pct: 12 },
  { name: 'Blossom', pct: 25 },
  { name: 'Bower', pct: 40 },
  { name: 'Garden', pct: 50 },
  { name: 'Full Bloom', pct: 70 },   // the room is SOLVED here (AAA 1.12)
];
/** Hidden tier — never advertised, pays a gem (AAA 1.11). */
export const EVERY_PETAL_PCT = 100;

export function ladderThreshold(maxScore: number, pct: number): number {
  return pct === 0 ? 0 : Math.max(1, Math.ceil((maxScore * pct) / 100));
}

/** Highest ladder index reached at `score` (0 = Seed). */
export function ladderIndex(maxScore: number, score: number): number {
  let idx = 0;
  for (let i = 0; i < HIVE_LADDER.length; i++) {
    if (score >= ladderThreshold(maxScore, HIVE_LADDER[i]!.pct)) idx = i;
  }
  return idx;
}

/** The AAA 1.6 five-message toast taxonomy (plus finished, which is silent). */
export type HiveToastReason =
  | 'too-short' | 'missing-center' | 'bad-letters' | 'not-in-word-list' | 'already-found';

export type HiveFeedback =
  | { kind: 'valid'; word: string; points: number; isPangram: boolean; tierUps: string[] }
  | { kind: 'invalid'; reason: HiveToastReason; costed: boolean };

export interface HiveRoomState {
  hive: HiveState;
  /** Room max = total points across all valid words; the ladder's 100%. */
  maxScore: number;
  tierIndex: number;
  costedMistakes: number;
  attempts: number;
  pangramsFound: string[];
  lastFeedback: HiveFeedback | null;
}

export type HiveAction = { type: 'submit'; word: string };

function isPerfect(s: HiveRoomState): boolean {
  return s.costedMistakes === 0;
}

export const hiveAdapter: RoomPuzzleAdapter<HivePuzzle, HiveRoomState, HiveAction> = {
  kind: 'hive',
  size: 'anchor',

  select({ tier, seed, seenIds }) {
    const rng = createRng(seed);
    const seen = new Set(seenIds);
    for (const difficulty of TIER_DIFFICULTY[tier]) {
      const fresh = HIVE_POOL.filter((p) => p.difficulty === difficulty && !seen.has(p.id));
      if (fresh.length > 0) return pick(rng, fresh);
    }
    const anyFresh = HIVE_POOL.filter((p) => !seen.has(p.id));
    return anyFresh.length > 0 ? pick(rng, anyFresh) : pick(rng, HIVE_POOL);
  },

  start(puzzle: HivePuzzle, _ctx: RoomContext): HiveRoomState {
    // The v1 win gate (puzzle.pointThreshold) is retired: raise the engine's
    // threshold to the full total so it never blocks play; the manor's solve
    // point is the ladder's Full Bloom (70% of totalPoints), managed below.
    return {
      hive: { ...startHive(puzzle), pointThreshold: puzzle.totalPoints },
      maxScore: puzzle.totalPoints,
      tierIndex: 0,
      costedMistakes: 0,
      attempts: 0,
      pangramsFound: [],
      lastFeedback: null,
    };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];
    const { state: hive, result } = submitHiveWord(puzzle, state.hive, action.word, {
      entropyImmune: true,                    // entropy is retired in the Manor
      fadePick: (candidates) => candidates[0]!,
    });
    let next: HiveRoomState = { ...state, hive, attempts: state.attempts + 1 };

    if (result.kind === 'valid') {
      const newIndex = ladderIndex(next.maxScore, hive.score);
      const tierUps = HIVE_LADDER.slice(state.tierIndex + 1, newIndex + 1).map((t) => t.name);
      next = {
        ...next,
        tierIndex: newIndex,
        pangramsFound: result.isPangram ? [...state.pangramsFound, result.word] : state.pangramsFound,
        lastFeedback: { kind: 'valid', word: result.word, points: result.points, isPangram: result.isPangram, tierUps },
      };
      events.push({ type: 'progress', detail: result.isPangram ? 'pangram' : 'word-found' });
      for (const name of tierUps) events.push({ type: 'progress', detail: `tier-up:${name}` });

      const solveAt = ladderThreshold(next.maxScore, 70);
      const wasSolved = state.hive.score >= solveAt;
      const nowSolved = hive.score >= solveAt;
      if (hive.score >= next.maxScore) {
        // Every Petal — the hidden 100% tier pays a gem (AAA 1.11).
        events.push({ type: 'progress', detail: 'every-petal' });
        events.push({ type: 'reward', gems: 1 });
      }
      // Emit `solved` exactly once, on the Full Bloom crossing (AAA 1.12).
      if (!wasSolved && nowSolved) events.push({ type: 'solved', perfect: isPerfect(next) });
      return {
        state: next,
        events,
        outcome: { status: nowSolved ? 'solved' : 'active', perfect: isPerfect(next) },
      };
    }

    // Invalid: map the engine's reason enum onto the AAA 1.6 toast taxonomy.
    // 'faded-letter' is unreachable (entropy immune ⇒ nothing ever fades);
    // 'finished' is silent.
    if (result.reason !== 'finished') {
      const reason: HiveToastReason =
        result.reason === 'bad-letter' ? 'bad-letters'
        : result.reason === 'faded-letter' ? 'bad-letters'
        : result.reason === 'not-a-word' ? 'not-in-word-list'
        : result.reason;
      const costed = result.reason === 'bad-letter' || result.reason === 'missing-center';
      next = {
        ...next,
        costedMistakes: costed ? next.costedMistakes + 1 : next.costedMistakes,
        lastFeedback: { kind: 'invalid', reason, costed },
      };
      events.push({ type: 'mistake', weight: costed ? 'structural' : 0 });
    }

    return { state: next, events, outcome: { status: 'active', perfect: isPerfect(next) } };
  },

  puzzleId: (p) => p.id,
};
