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

import type {
  DayPhase, DayRecord, DayState, DraftOffer, ManorState, StepLedger,
} from './types';
import type { DayEndCause, RecordedEvent } from './events';
import { createRng } from './rng';
import { wingCharacterOf } from './manor/wings';
import {
  createLedger, firstMorningPot, highestRowVisited, ledgerTotal, rowName, stepsGivenBack,
  stepsSpent, teaDawnPour, STEP_TABLE,
} from './economy/steps';

/**
 * ── THE DAY'S STORY, WRITTEN DOWN (AAA 4.10 / R.3, round-5 audit) ──────────
 *
 * The economy was rebuilt around climbing, and the climb was never recorded:
 * `DayRecord` carried rooms/steps-spent/fragments only, and `stepsRefunded()`
 * — documented "for the night digest" — had no callers anywhere. So the first
 * night of the game closed on a scoreboard of zeros and hid the one number
 * that makes the retune legible: how much the manor gave back.
 *
 * `stepsRefunded` and `highestRow` now live on `DayRecord` in
 * `engine/types.ts` (folded in round 5). Both are optional, so every
 * already-banked record still type-checks and old saves read fine.
 */

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
  /**
   * The scripted first-morning pot (`FIRST_MORNING_POT`), day 1 only. Day 1
   * starts at 0 affinity, so without it the very first evening ran on the bare
   * 18 and measured ~9 minutes — under the 10–15 floor AAA 4.10b promises for
   * the median day (round-5 audit). The economy's twin of the scripted first
   * draft; ledgered as 'tea' through the same audited path.
   */
  potSteps: number;
}

/**
 * Roll to a new morning. Legal from a fresh save (prev null) or from 'night'.
 *
 * Budget = `STEP_TABLE.dayStart` (18 after the 2026-08 owner-playtest
 * overhaul), and Bramble's tea arrives SEPARATELY as a ledger entry so it
 * renders as a floating +N during the morning scene (AAA 4.9). That split is
 * load-bearing now: the base budget is deliberately too small to reach the
 * Sanctum row, and the tea — which grows with her affinity across weeks — is
 * the campaign arc that eventually makes the climb affordable (AAA 4.10).
 * Day 1 therefore starts at a bare 18 and cannot buy the top of the house.
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
    // ROUND 23 (REVIEW_AA §5.10) — the CUP at the door. The rest of the pot is
    // carried up to the second landing by app/slices/manor.ts on the placement
    // that takes her there (`TEA_POUR`), so the arc funds the climb it exists
    // for instead of slackening the ground floor it was never about.
    teaSteps: teaDawnPour(opts.brambleAffinity),
    potSteps: firstMorningPot(dayNumber),
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
  /**
   * The floorplan as she leaves it (REVIEW_AA §5.7). Optional so every existing
   * caller — and every test fixture written before the wings — still compiles
   * and simply records a house with no wings argued.
   */
  manor?: ManorState | null,
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
    // The climb, written down (see the augmentation at the top of this file):
    // what the manor gave back, and how high she got. The night digest reads
    // both back as prose and prints neither when it is zero.
    //
    // ROUND 45 — `stepsGivenBack`, not `stepsRefunded`. The morning's grants are
    // positive ledger entries AND are already inside the figure on the candle
    // when she walks out, so counting them here printed the dawn cup twice and
    // put every night digest in the game over by exactly that. See
    // `engine/economy/steps.ts stepsGivenBack` for the identity this closes.
    stepsGivenBack: stepsGivenBack(ledger),
    highestRow: highestRowVisited(ledger),
    // ── THE ONE THING THE NIGHT DOES NOT TAKE (REVIEW_AA §5.7) ────────────
    // The manor itself is wiped four lines later in `endDay`. What is written
    // down here is not the house, it is the ARGUMENT she made about it: which
    // wing she kept the working rooms in, which one she read in. Tomorrow's
    // deck reads the series back (engine/manor/wings.ts `rememberedWings`), so
    // the floorplan resets and the knowledge of it does not — the Blue Prince
    // property the review says we do not attempt (§7).
    wings: wingCharacterOf(manor ?? null),
  };
}

/** "You reached the second landing" — the digest's prose, or null on the ground. */
export function highestRowLine(record: DayRecord): string | null {
  const row = record.highestRow ?? 0;
  return row > 0 ? `You reached ${rowName(row)}.` : null;
}

/**
 * ── THE NUMBER ALL THREE TESTERS CHASED (docs/COMPREHENSION.md, fix 10) ─────
 *
 * This used to be `refundLine`, and it led the digest as prose: "The manor
 * gave back +20." Three strangers who played the live build read that as a
 * PAYOUT — a climb bonus, a score, steps banked toward tomorrow — and all
 * three went looking for the twenty in their inventory. One built a whole
 * false model of a height bonus on it; the systems player called it "the one
 * that bothers me most, because it looks like the game's main scoring signal."
 *
 * It is `stepsRefunded(ledger)`: a retrospective sum of everything today's
 * ledger paid IN — solves, perfect bonuses, tea, snacks. Nothing is banked.
 * It is a STAT, and the fix is to file it where the other stats live rather
 * than to explain it: it is now a tally row directly under "Steps spent", in
 * the same type, with the same weight, and the tally carries one line saying
 * out loud that none of it survives the night. A number standing among five
 * other numbers under the word "tally" is not a transaction, and the digest's
 * prose goes back to being the day's story — the climb — which is the only
 * thing on that screen that was ever meant to lead.
 *
 * The labels live here rather than in the scene because the FIT GATE counts
 * them (ui/chrome/night-fit.ts): the digest's height budget is derived from
 * this list's length, so a seventh row cannot be added without the gate
 * re-deriving what is left for Mrs. Bramble to say.
 */
export const NIGHT_TALLY_LABELS = [
  'Rooms drafted', 'Rooms solved', 'Steps spent', 'Steps given back',
  'Fragments found', 'Letters read',
] as const;

/** What the tally is, said plainly — the half of fix 10 that is a sentence. */
export const NIGHT_TALLY_NOTE = 'Today’s tally. None of it carries to tomorrow.';

/**
 * The digest's rows, in print order, with every zero suppressed — a quiet day
 * says less, it never says you scored nothing (round-5 audit).
 */
export function nightTallyRows(
  record: DayRecord,
  lettersOpened: number,
): Array<readonly [string, number]> {
  const values: Record<(typeof NIGHT_TALLY_LABELS)[number], number> = {
    'Rooms drafted': record.roomsDrafted,
    'Rooms solved': record.roomsSolved,
    'Steps spent': record.stepsSpent,
    // `stepsRefunded` is the pre-round-45 field, read only so a night banked
    // under the old sum still shows a number in the Chronicles.
    'Steps given back': record.stepsGivenBack ?? record.stepsRefunded ?? 0,
    'Fragments found': record.fragmentsFound,
    'Letters read': lettersOpened,
  };
  return NIGHT_TALLY_LABELS
    .map((label) => [label, values[label]] as const)
    .filter(([, n]) => n > 0);
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
