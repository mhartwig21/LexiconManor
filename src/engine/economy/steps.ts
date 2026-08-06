/**
 * Step economy — OWNER: A2 (Economy/Day). Pure TS, no React/DOM.
 *
 * THE single audited ledger (AAA 4.9): every step delta in the game flows
 * through `STEP_TABLE` + `appendEntry`. No slice writes steps directly; the
 * UI renders each entry as a floating +N/−N on the counter.
 *
 * ═══ ECONOMY OVERHAUL — DIRECT OWNER FEEDBACK, 2026-08 playtest ═══
 * "Way too easy — I reached the Forgotten Word on my first day; Blue Prince
 * took me 28 days." The campaign arc was missing: day 1 played like day 30.
 * This retune turns the manor into a push-your-luck CLIMB whose ceiling rises
 * across weeks, not minutes (targets in AAA 4.10, verified in
 * tests/economy-simulation.test.ts):
 *
 *   1. CLIMBING IS THE EXPENSE. Movement is priced per row band
 *      (`MOVE_COST_BY_ROW`): −1 on the ground floor, −5 up top. A single
 *      minimum-length ascent to the Sanctum row costs 20 steps of pure
 *      walking — more than the entire base budget — and every walk-back to a
 *      frontier door up there is charged at the same top rate.
 *   2. REFUNDS GET LEANER AS YOU CLIMB. anchor +6/+5/+4 by tier (was
 *      +6/+7/+8 — the old curve literally paid you to be high up), micro
 *      +3/+3/+2. A tier-3 solve softens the next mistake; it no longer
 *      bankrolls the next storey.
 *   3. LEAN DAY BUDGET. 40 → 18. A decent day is 5–8 rooms and 10–15 minutes
 *      (AAA 4.10), not 8–12 rooms and twenty-plus.
 *   4. LOCKED DOORS UP TOP. `DOOR_LOCKS`: drafting into 0-based rows 4+ can
 *      demand a key. Deep pushes are PREPARED for (Key Cabinet, Fern's
 *      trades) — you cannot stumble into the Sanctum row.
 *   5. THE REFILL CURVE IS A CAMPAIGN ARC. Bramble's tea (`TEA_BY_RANK`)
 *      climbs 0 → +10 across her friendship, and snacks shrink to +3..+7.
 *      The budget that makes the Sanctum reachable is EARNED over days.
 *
 * Net effect (simulated, not hoped): a skilled player first reaches the
 * Sanctum row around day 6–10 and typically wins the volume in 14–28 days of
 * daily play — Blue Prince's shape, at cozy scale.
 *
 * Unchanged rulings:
 *   - weight 0 → free feedback moment, never ledgered (AAA R.1 / 3.2)
 *   - weight 1 → −2 (tier 3 rooms −3); weight 2 doubles (reserved risk rooms)
 *   - hint purchases price through the same row as mistakes (A3's revision)
 *   - a wrong guess at the Sanctum: once per day, always FREE (AAA 4.17) —
 *     `SANCTUM_GUESS_COST`, kept explicit so no future retune quietly prices it
 * Costs read as *spending*, never dying (R.3) — the ledger has no concept of
 * failure, only entries.
 */

import type { StepEntry, StepLedger, Tier } from '../types';

/**
 * Start-of-day step budget (AAA 4.10). Owner retune: 40 → 18. Read this
 * together with `MOVE_COST_BY_ROW` — the two numbers are one lever. 18 buys a
 * comfortable ramble around the lower floors, or a deliberate, prepared,
 * refill-funded assault on the upper ones. It does not buy both.
 */
export const BASE_DAY_BUDGET = 18;

/**
 * Mistake / hint pricing row: a deliberate wrong claim in a deduction room.
 * Weight 'structural' is the AAA R.1 ruling: a structural slip the live
 * entry-coloring already warned about (hive dead letter / missing center)
 * costs a flat −1 at every tier — spending, never a sting.
 */
function mistakeDelta(weight: 1 | 2 | 'structural', tier: Tier): number {
  if (weight === 'structural') return -1;
  return (tier === 3 ? -3 : -2) * weight;
}

/**
 * Per-row movement pricing — the overhaul's core lever, indexed by the
 * 0-based grid row of the cell being STEPPED INTO (engine/types.ts Cell.row).
 * The ground floor is a stroll; the upper storeys are a climb, and every
 * traverse of them is charged, including the walk back to a frontier door.
 *
 * Minimum pure ascent, entrance (row 0) → Sanctum row (row 6):
 *   1 + 2 + 3 + 4 + 5 + 5 = 20 steps — MORE than the whole base budget, in a
 *   straight line, before a single card is drafted or a single door is
 *   re-walked. The Sanctum row is therefore never reachable on the budget
 *   alone: it has to be paid for with tea, snacks and solves. That is the
 *   push-your-luck, and it is why day 1 is not day 30.
 */
export const MOVE_COST_BY_ROW: readonly number[] = [-1, -1, -2, -3, -4, -5, -5];

export function moveAt(row: number): number {
  const i = Math.max(0, Math.min(MOVE_COST_BY_ROW.length - 1, Math.floor(row)));
  return MOVE_COST_BY_ROW[i]!;
}

/**
 * A wrong guess at the Sanctum door costs nothing but the day's one guess
 * (AAA 4.17, MANOR_DESIGN §7). Exported as a named zero so the rule is
 * grep-able and a future economy pass has to delete a documented constant
 * rather than silently add a price.
 */
export const SANCTUM_GUESS_COST = 0;

export const STEP_TABLE = {
  /** Start-of-day budget — the ledger's `budget` field. */
  dayStart: BASE_DAY_BUDGET,
  /**
   * DEPRECATED flat move price — kept so existing callers compile. The day
   * slice re-prices EVERY 'move' entry through `moveAt(row)` using the
   * entry's `roomKey` ("col,row"), so per-row pricing holds even for callers
   * still passing this. Equals moveAt(0). A1: prefer `moveAt(cell.row)`.
   */
  move: -1,
  /** Row-priced move (see moveAt / MOVE_COST_BY_ROW). */
  moveAt,
  /** −1, worth it. */
  petDewey: -1,
  /** Deliberate wrong claim (Library group, Study guess, cipher letter…). */
  mistake: mistakeDelta,
  /** Step-priced hint/clue purchase — same row as mistake (RoomEvent 'hint'). */
  hint: mistakeDelta,
  /**
   * Solve payout by room size and row-band tier — LEANER AS YOU CLIMB
   * (owner retune): micro +3/+3/+2, anchor +6/+5/+4. High-tier rooms are
   * climbed TO, not climbed FROM: their payout softens the next mistake, it
   * no longer bankrolls the next storey.
   */
  solve(size: 'micro' | 'anchor', tier: Tier): number {
    return size === 'micro' ? (tier === 3 ? 2 : 3) : 7 - tier;
  },
  /** No costed mistakes and no purchased hints → bonus. */
  perfect: 2,
  /** Kitchen snack range (utility rooms roll inside this, reason 'snack').
   *  Owner retune: 5..10 → 3..7 — a refill extends a day, never doubles it. */
  snack: { min: 3, max: 7 },
  /** Gifting a bookmark is a small walk to find them (reason 'gift'). */
  gift: -1,
  /** A wrong Sanctum guess is free, forever (AAA 4.17). */
  sanctumGuess: SANCTUM_GUESS_COST,
} as const;

/**
 * Locked doors on the upper rows (owner retune): drafting into a high cell
 * may need a key — deep pushes are PREPARED for (Key Cabinet, Fern's trades),
 * not stumbled into. This is the hard gate that makes a day-1 Sanctum run
 * impossible no matter how well the puzzles go: keys reset nightly, so every
 * ascent has to re-earn its own way up.
 *
 * Deterministic per (daySeed, cell) so re-approaching the same door gives the
 * same answer all day (AAA 4.8 spirit) and the blueprint can draw the padlock
 * from the moment the row is visible — never a surprise charge (AAA 4.6).
 *
 * A1 wiring (requested): consult `doorLockedAt` in openDraft for the target
 * cell; a locked target needs `keyCost` keys, spent on placement.
 */
export const DOOR_LOCKS = {
  /** P(a door into this 0-based row is locked); rows 0–3 never lock. */
  chanceByRow: [0, 0, 0, 0, 0.35, 0.55, 0.8] as readonly number[],
  keyCost: 1,
} as const;

/** Deterministic lock roll for a draft target cell (0-based row). */
export function doorLockedAt(daySeed: number, cellKey: string, row: number): boolean {
  const chance = DOOR_LOCKS.chanceByRow[row] ?? 0;
  if (chance <= 0) return false;
  let h = (daySeed ^ 0x10c4ed) | 0;
  for (const ch of cellKey) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 1000) / 1000 < chance;
}

/**
 * Bramble's morning tea by affinity rank (MANOR_DESIGN §8) — the campaign's
 * main economic arc. Rank 0 (just met) is a plain, kind cup worth nothing but
 * the scene; by the time she trusts you, the pot is worth nearly half a day
 * again. THIS is what turns "the Sanctum row is out of reach" into "the
 * Sanctum row is reachable if today goes well" somewhere around day 6–10,
 * and it cannot be rushed — affinity is one conversation a day (AAA 5.9).
 * Applied as a 'tea' ledger entry so it renders as a floating +N.
 */
export const TEA_BY_RANK: readonly number[] = [0, 3, 5, 7, 9, 10, 11];

export function teaBonus(brambleAffinity: number): number {
  if (!Number.isFinite(brambleAffinity) || brambleAffinity <= 0) return 0;
  const rank = Math.floor(brambleAffinity);
  return TEA_BY_RANK[Math.min(rank, TEA_BY_RANK.length - 1)]!;
}

/** Fresh ledger for a new day. */
export function createLedger(budget: number = STEP_TABLE.dayStart): StepLedger {
  return { budget, entries: [] };
}

/**
 * Normalize an entry before it enters the ledger. Movement is the one reason
 * whose price depends on WHERE it happened: callers pass `roomKey` ("col,row"
 * — engine/manor/grid.ts `cellKey`) and the audited path re-prices the delta
 * through `moveAt(row)`. Keeping this here (rather than at each call site)
 * means per-row movement pricing cannot be bypassed by a caller that still
 * passes the deprecated flat `STEP_TABLE.move`.
 */
export function priceEntry(entry: StepEntry): StepEntry {
  if (entry.reason !== 'move' || !entry.roomKey) return entry;
  const row = Number(entry.roomKey.split(',')[1]);
  if (!Number.isFinite(row)) return entry;
  const delta = moveAt(row);
  return delta === entry.delta ? entry : { ...entry, delta };
}

/** Pure append — the only way a delta enters the economy. */
export function appendEntry(ledger: StepLedger, entry: StepEntry): StepLedger {
  return { budget: ledger.budget, entries: [...ledger.entries, priceEntry(entry)] };
}

/** Raw signed total (may be negative mid-puzzle; never rendered negative). */
export function ledgerTotal(ledger: StepLedger): number {
  return ledger.budget + ledger.entries.reduce((sum, e) => sum + e.delta, 0);
}

/** Steps left to spend. Never negative (AAA 4.9). */
export function stepsRemaining(ledger: StepLedger): number {
  return Math.max(0, ledgerTotal(ledger));
}

/** Magnitude of everything spent today (for the day record / chronicles). */
export function stepsSpent(ledger: StepLedger): number {
  return ledger.entries.reduce((sum, e) => (e.delta < 0 ? sum - e.delta : sum), 0);
}

/** Everything refunded today: solves, tea, snacks (for the night digest). */
export function stepsRefunded(ledger: StepLedger): number {
  return ledger.entries.reduce((sum, e) => (e.delta > 0 ? sum + e.delta : sum), 0);
}

/**
 * The day's starting total (budget + morning tea) — the reference the chrome
 * burn-down bar measures against so the wick reads as "how much day is left".
 */
export function dayStartTotal(ledger: StepLedger): number {
  return ledger.budget + ledger.entries.reduce(
    (sum, e) => (e.reason === 'tea' ? sum + e.delta : sum), 0);
}
