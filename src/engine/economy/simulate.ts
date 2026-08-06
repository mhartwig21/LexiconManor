/**
 * Economy simulation — OWNER: A2 (Economy/Day). Pure TS, seeded, replayable.
 *
 * AAA 4.10: the step economy is simulation-tested BEFORE any playtest. This
 * module plays abstract days through the REAL ledger + STEP_TABLE (so any
 * tuning change to engine/economy/steps.ts lands here first and the targets
 * in tests/economy-simulation.test.ts re-verify):
 *
 *   - a no-refund day (skip all puzzles) reaches row 4–5;
 *   - a decent/competent day (~70% solve) visits 8–12 rooms and reaches
 *     row 6–7 (1-based — the Sanctum row band);
 *   - a great day with refills (tea rank, snacks, high solve rate) reaches
 *     the Sanctum row reliably.
 *
 * Movement model: the grid/drafting engine is A1's; this simulation models
 * its COST SHAPE, not its geometry. Blue Prince's measured reality (~1.1
 * steps per cell drafted, most of them re-walking to frontier doors) is
 * encoded as: drafting the next new room costs 1 move plus a walk-back cost
 * that grows with current depth, and climbing one row consumes several new
 * rooms (dead doors, laterals). Both knobs live in MOVEMENT below, separate
 * from the player-skill profiles.
 *
 * Rows are 1-based here: entrance row 1, Sanctum row 7 (matches the design
 * docs' "reaches row 6–7" language).
 */

import { createRng } from '../rng';
import {
  appendEntry, createLedger, ledgerTotal, stepsRemaining, stepsRefunded, stepsSpent,
  teaBonus, STEP_TABLE,
} from './steps';
import type { StepLedger, Tier } from '../types';

/** The movement-cost model (the grid's shape, abstracted). */
export const MOVEMENT = {
  /** New rooms drafted per row climbed: dead doors, laterals, wandering. */
  roomsPerRow: 2.0,
  /** Extra moves per unit of current depth when pushing to the frontier. */
  walkbackPerRow: 1.6,
  /** Hard cap so a runaway profile terminates. */
  maxRoomsPerDay: 80,
} as const;

/**
 * The clock model (AAA 4.10's actual promise: a skipper day ends in ~5 min, a
 * competent day in 10–15). Seconds per player action, estimated from the
 * 30–90s micro / 2–6 min anchor design bands (room module headers) — REPLACE
 * with instrumented medians once 3.5's playtest lands. Ranges are sampled
 * from a SEPARATE rng stream so adding the clock never perturbs the seeded
 * step-economy results the 4.10 row/room targets are pinned to.
 */
export const TIME_TABLE = {
  /** One −1 move tap on the blueprint. */
  moveTap: 2,
  /** Open a door, read three cards, choose or step back. */
  draft: 10,
  /** Step into a puzzle room and decide not to play it today. */
  glance: 5,
  /** A parlor/utility/mystery beat: a line of dialogue, a snack, a fragment. */
  dialogueBeat: 20,
  /** Micro solves: the 30–90s design band, weighted toward the middle. */
  microSolve: [45, 90],
  /** Anchor solves: Hive/Twistle/Web/Study run long; 3–6 min at the tail. */
  anchorSolve: [180, 360],
  /** Attempted but left unsolved for tomorrow (AAA 4.13). */
  abandon: 120,
} as const;

const sampleSeconds = (range: readonly [number, number], timeRng?: () => number): number =>
  timeRng
    ? range[0] + timeRng() * (range[1] - range[0])
    : (range[0] + range[1]) / 2;

export interface SimProfile {
  name: string;
  /** Share of drafted rooms that are puzzle rooms (vs parlor/utility/mystery). */
  puzzleShare: number;
  /** Chance an entered puzzle room is attempted at all (vs walked through). */
  attemptRate: number;
  /** Chance an attempted puzzle is solved (the 4.10 "70%" knob). */
  solveRate: number;
  /** Share of puzzle rooms that are micro (+3) vs anchor (+6/+7/+8). */
  microShare: number;
  /** Of solves, share with zero costed mistakes (perfect, +2). */
  perfectRate: number;
  /** Costed mistakes on a non-perfect solve: [min, max] inclusive. */
  mistakesSolved: [number, number];
  /** Costed mistakes before leaving an unsolved room for tomorrow: [min, max]. */
  mistakesUnsolved: [number, number];
  /** Chance a non-puzzle room is a Kitchen (snack refill, +5..10). */
  kitchenChance: number;
  /** Bramble's tea rank (start-of-day refill via teaBonus). */
  brambleAffinity: number;
}

/** No refunds at all: walks the manor and never touches a puzzle (4.10a). */
export const PROFILE_SKIPPER: SimProfile = {
  name: 'skipper',
  puzzleShare: 0.7,
  attemptRate: 0,
  solveRate: 0,
  microShare: 0.55,
  perfectRate: 0,
  mistakesSolved: [0, 0],
  mistakesUnsolved: [0, 0],
  kitchenChance: 0,
  brambleAffinity: 0,
};

/** A decent, competent day: ~70% solve rate at the listed payouts (4.10b). */
export const PROFILE_DECENT: SimProfile = {
  name: 'decent',
  puzzleShare: 0.7,
  attemptRate: 0.92,
  solveRate: 0.7,
  microShare: 0.55,
  perfectRate: 0.18,
  mistakesSolved: [1, 3],
  mistakesUnsolved: [2, 4],
  kitchenChance: 0.35,
  brambleAffinity: 1,
};

/** A great day with refills: warm tea, snacks found, sharp solving (4.10c). */
export const PROFILE_GREAT: SimProfile = {
  name: 'great',
  puzzleShare: 0.7,
  attemptRate: 0.95,
  solveRate: 0.85,
  microShare: 0.5,
  perfectRate: 0.3,
  mistakesSolved: [0, 2],
  mistakesUnsolved: [1, 3],
  kitchenChance: 0.5,
  brambleAffinity: 5,
};

export interface SimDayResult {
  rooms: number;        // new rooms entered
  roomsSolved: number;
  maxRow: number;       // 1-based; 7 = the Sanctum row
  stepsLeft: number;    // stepsRemaining at day end (0 for exhausted days)
  spent: number;
  refunded: number;
  /** Estimated wall-clock length of the day (TIME_TABLE model), in minutes. */
  minutes: number;
  ledger: StepLedger;
}

const rowTier = (row: number): Tier => (row <= 3 ? 1 : row <= 5 ? 2 : 3);

const randInt = (rng: () => number, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

/**
 * Play one abstract day through the real ledger. Deterministic per rng.
 * `timeRng` (a separate stream) samples solve durations for the clock model;
 * without it, durations fall to range midpoints — the step economy's rng
 * stream is untouched either way, so 4.10's row/room targets never drift
 * because the clock exists.
 */
export function simulateDay(
  rng: () => number,
  profile: SimProfile,
  timeRng?: () => number,
): SimDayResult {
  let ledger = createLedger(STEP_TABLE.dayStart);
  const tea = teaBonus(profile.brambleAffinity);
  if (tea > 0) ledger = appendEntry(ledger, { reason: 'tea', delta: tea, at: 0 });

  let rooms = 0;
  let roomsSolved = 0;
  let rowProgress = 0;
  let row = 1;
  let seconds = 0;

  const move = () => {
    ledger = appendEntry(ledger, { reason: 'move', delta: STEP_TABLE.move, at: 0 });
    seconds += TIME_TABLE.moveTap;
  };

  outer: while (rooms < MOVEMENT.maxRoomsPerDay) {
    // --- Walk to the next frontier door: 1 move + depth-scaled walk-back. --
    const extra = MOVEMENT.walkbackPerRow * (row - 1);
    let moves = 1 + Math.floor(extra) + (rng() < extra % 1 ? 1 : 0);
    while (moves-- > 0) {
      move();
      // Steps ran out on the blueprint → dusk, mid-walk (AAA 4.12).
      if (ledgerTotal(ledger) <= 0) break outer;
    }

    // --- Draft & enter the new room. -------------------------------------
    rooms += 1;
    rowProgress += 1 / MOVEMENT.roomsPerRow;
    row = Math.min(7, 1 + Math.floor(rowProgress));
    const tier = rowTier(row);
    const roomKey = `sim-${rooms}`;
    seconds += TIME_TABLE.draft;

    if (rng() < profile.puzzleShare) {
      if (rng() < profile.attemptRate) {
        const solved = rng() < profile.solveRate;
        const perfect = solved && rng() < profile.perfectRate;
        const [mMin, mMax] = solved ? profile.mistakesSolved : profile.mistakesUnsolved;
        const mistakes = perfect ? 0 : randInt(rng, mMin, mMax);
        for (let m = 0; m < mistakes; m++) {
          ledger = appendEntry(ledger, {
            reason: 'mistake', delta: STEP_TABLE.mistake(1, tier), at: 0, roomKey,
          });
        }
        if (solved) {
          const size = rng() < profile.microShare ? 'micro' : 'anchor';
          seconds += sampleSeconds(
            size === 'micro' ? TIME_TABLE.microSolve : TIME_TABLE.anchorSolve, timeRng,
          );
          ledger = appendEntry(ledger, {
            reason: 'solve', delta: STEP_TABLE.solve(size, tier), at: 0, roomKey,
          });
          if (perfect) {
            ledger = appendEntry(ledger, {
              reason: 'perfect', delta: STEP_TABLE.perfect, at: 0, roomKey,
            });
          }
          roomsSolved += 1;
        } else {
          seconds += TIME_TABLE.abandon;
        }
      } else {
        seconds += TIME_TABLE.glance;
      }
    } else {
      seconds += TIME_TABLE.dialogueBeat;
      if (rng() < profile.kitchenChance) {
        ledger = appendEntry(ledger, {
          reason: 'snack',
          delta: randInt(rng, STEP_TABLE.snack.min, STEP_TABLE.snack.max),
          at: 0,
          roomKey,
        });
      }
    }

    // Dusk never fires inside a room; it fires on exit (AAA 4.12) — a
    // mid-puzzle overdraft is allowed, then the day ends out on the floor.
    if (ledgerTotal(ledger) <= 0) break;
  }

  return {
    rooms,
    roomsSolved,
    maxRow: row,
    stepsLeft: stepsRemaining(ledger),
    spent: stepsSpent(ledger),
    refunded: stepsRefunded(ledger),
    minutes: seconds / 60,
    ledger,
  };
}

/**
 * Simulate `days` seeded days; one continuous rng stream per run, plus an
 * independent stream for the clock model (so timing never perturbs economy).
 */
export function simulateDays(profile: SimProfile, days: number, seed: number): SimDayResult[] {
  const rng = createRng(seed);
  const timeRng = createRng((seed ^ 0x715e17) | 0);
  const out: SimDayResult[] = [];
  for (let i = 0; i < days; i++) out.push(simulateDay(rng, profile, timeRng));
  return out;
}

/** Median of a numeric projection over results. */
export function median(results: SimDayResult[], pick: (r: SimDayResult) => number): number {
  const xs = results.map(pick).sort((a, b) => a - b);
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/** Share of results satisfying a predicate. */
export function share(results: SimDayResult[], pred: (r: SimDayResult) => boolean): number {
  return results.filter(pred).length / results.length;
}

/** q-quantile (0..1, nearest-rank) of a numeric projection over results. */
export function quantile(
  results: SimDayResult[],
  q: number,
  pick: (r: SimDayResult) => number,
): number {
  const xs = results.map(pick).sort((a, b) => a - b);
  const i = Math.min(xs.length - 1, Math.max(0, Math.ceil(q * xs.length) - 1));
  return xs[i]!;
}
