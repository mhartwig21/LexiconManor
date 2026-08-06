/**
 * Day lifecycle FSM — OWNER: A2 (Economy/Day). Pure TS, no React/DOM.
 *
 * morning → exploring → dusk → night → (next) morning        (ARCHITECTURE §4)
 *
 * A run ending is "the day is over", never a defeat (MANOR_DESIGN §1). Dusk
 * NEVER fires inside an active puzzle: hitting 0 steps mid-puzzle lets the
 * puzzle finish and dusk fires on exit (AAA 4.12). The dusk fade is ≤4s and
 * wordless-gentle; night banks the DayRecord, resets the manor, and rolls to
 * the next morning.
 *
 * All functions are pure: (state, inputs) → state. The day slice
 * (app/slices/day.ts) is the only caller that mutates the store.
 */

import type { DayPhase, DayRecord, DayState, DraftOffer, StepLedger } from './types';
import type { DayEndCause, RecordedEvent } from './events';
import { createRng } from './rng';
import { createLedger, ledgerTotal, stepsSpent, teaBonus, STEP_TABLE } from './economy/steps';

/** Dusk fade budget — chrome must complete (or be tap-skipped) within this. */
export const DUSK_FADE_MS = 4000;

/** Legal forward transitions. exploring → dusk goes through endDay (banking). */
export const DAY_FLOW: Readonly<Record<DayPhase, DayPhase | null>> = {
  morning: 'exploring',
  exploring: 'dusk',
  dusk: 'night',
  night: null, // a new day begins via beginDay, not a phase step
};

export function canAdvancePhase(from: DayPhase, to: DayPhase): boolean {
  return DAY_FLOW[from] === to;
}

/** Deterministic per-day seed from caller-supplied entropy (engine stays pure). */
export function daySeedFor(dayNumber: number, entropy: number): number {
  const h = (Math.imul(entropy | 0, 2654435761) ^ Math.imul(dayNumber, 40503)) | 0;
  return Math.floor(createRng(h)() * 2 ** 31);
}

export interface BeginDayResult {
  day: DayState;
  ledger: StepLedger;
  /** Bramble's tea, to be applied as a 'tea' entry through the audited path. */
  teaSteps: number;
}

/**
 * Roll to a new morning. Legal from a fresh save (prev null) or from 'night'.
 * Budget = 40; the affinity tea bonus arrives as a ledger entry so it renders
 * as a floating +N during the morning scene (AAA 4.9).
 */
export function beginDay(
  prev: DayState | null,
  opts: { brambleAffinity: number; entropy: number },
): BeginDayResult | null {
  if (prev && prev.phase !== 'night') return null;
  const dayNumber = (prev?.day ?? 0) + 1;
  return {
    day: {
      day: dayNumber,
      phase: 'morning',
      daySeed: daySeedFor(dayNumber, opts.entropy),
      activeRoom: null,
    },
    ledger: createLedger(STEP_TABLE.dayStart),
    teaSteps: teaBonus(opts.brambleAffinity),
  };
}

/** May the day end right now? Never inside an active puzzle (AAA 4.12). */
export function canEndDay(day: DayState | null): day is DayState {
  return (
    day !== null &&
    (day.phase === 'morning' || day.phase === 'exploring') &&
    day.activeRoom === null
  );
}

/**
 * Dusk trigger predicate: steps exhausted, out on the blueprint, mid-day.
 * `ledgerTotal` (not the floored remaining) so a mid-puzzle overdraft that
 * resolved back above 0 does not end the day.
 *
 * An OPEN DRAFT OFFER suspends dusk exactly like an active room (AAA 4.6 +
 * 4.12/R.3): the step spent opening a door buys the look at the three cards —
 * drafting must never charge for a look it refuses to give. Spending the last
 * step on a door therefore shows the offer; the day ends only after the draft
 * resolves (cancel → dusk; choose a puzzle room → the mid-room-overdraft rule
 * applies and dusk fires on exit).
 */
export function shouldTriggerDusk(
  day: DayState | null,
  ledger: StepLedger,
  draftOffer?: DraftOffer | null,
): boolean {
  return (
    day !== null &&
    day.phase === 'exploring' &&
    day.activeRoom === null &&
    draftOffer == null &&
    ledgerTotal(ledger) <= 0
  );
}

/** Bank the day into the chronicles (AAA 4.10 fields). */
export function buildDayRecord(
  day: DayState,
  ledger: StepLedger,
  recentEvents: readonly RecordedEvent[],
  cause: DayEndCause,
  endedAt: number,
): DayRecord {
  const today = recentEvents.filter((e) => e.day === day.day);
  const count = (type: string) => today.filter((e) => e.event.type === type).length;
  return {
    day: day.day,
    endedAt,
    cause,
    roomsDrafted: count('room-drafted'),
    roomsSolved: count('room-solved'),
    stepsSpent: stepsSpent(ledger),
    fragmentsFound: count('fragment-found'),
  };
}

/**
 * What survives dusk on the recent-events stream: ALL of the closing day's
 * events (older days age off), so the morning's reactions can key off
 * yesterday's room events — dry archetypes, recap buckets, the day-ended
 * cause (AAA 5.2, `withinDays: 1`). The stream stays exactly one day deep;
 * lifetime counters are untouched. (Integration: widened from day-ended-only
 * per A6's shared-file request — the Hypnos recap bucket needs yesterday's
 * room events, not just the cause.)
 */
export function pruneEventsAtDusk(
  recentEvents: readonly RecordedEvent[],
  closingDay: number,
): RecordedEvent[] {
  return recentEvents.filter((e) => e.day === closingDay);
}
