/**
 * Step economy — OWNER: A2 (Economy/Day). Pure TS, no React/DOM.
 *
 * THE single audited ledger (AAA 4.9): every step delta in the game flows
 * through `STEP_TABLE` + `appendEntry`. No slice writes steps directly; the
 * UI renders each entry as a floating +N/−N on the counter.
 *
 * ECONOMY OVERHAUL (2026-08 owner playtest): "way too easy — I reached the
 * Forgotten Word on my first day; Blue Prince took me 28 days." The retune
 * turns the manor into a push-your-luck CLIMB (AAA 4.10 targets):
 *   - climbing IS the expense: movement is priced per row band via `moveAt`
 *     (−1 low / −2 middle / −3 upper rows), not a flat −1;
 *   - refunds get LEANER as you climb: anchor +6/+5/+4 by tier (was
 *     +6/+7/+8), micro +3/+2/+2 — a tier-3 solve no longer funds the climb
 *     that reached it;
 *   - the day budget drops to 28 (was 40) — a decent day is 6–9 rooms and
 *     10–15 minutes, not 8–12 and twenty;
 *   - upper-row doors can be LOCKED (DOOR_LOCKS): drafting into rows 5+
 *     (1-based) may require a key — deep pushes need preparation;
 *   - Bramble's tea ramps slower and caps lower (+3..+8) so the refill
 *     growth curve is a campaign arc, not a day-1 windfall.
 * First Sanctum-row reach for a skilled player lands day 6–10; the volume is
 * typically won in 14–28 days (verified in tests/economy-simulation.test.ts).
 *
 * Unchanged rulings:
 *   - weight 0 → free feedback moment, never ledgered (AAA R.1 / 3.2)
 *   - weight 1 → −2 (tier 3 rooms −3); weight 2 doubles (reserved risk rooms)
 *   - hint purchases price through the same row as mistakes (A3's revision)
 *   - wrong guess at the Sanctum: once per day, always FREE (AAA 4.17)
 * Costs read as *spending*, never dying (R.3) — the ledger has no concept of
 * failure, only entries.
 */

import type { StepEntry, StepLedger, Tier } from '../types';

/**
 * Start-of-day step budget (AAA 4.10; owner retune 2026-08: 40 → 28 so a
 * decent day lands the 10–15 minute median).
 */
export const BASE_DAY_BUDGET = 28;

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
 * Per-row movement pricing — the overhaul's core lever. `row` is the 0-based
 * grid row of the cell being STEPPED INTO (engine/types.ts Cell.row): the
 * ground floor is an easy stroll, the upper storeys are a climb, every
 * traverse of them included. Matches the tier bands (rows 0–2 / 3–4 / 5–6).
 */
export function moveAt(row: number): number {
  return row <= 2 ? -1 : row <= 4 ? -2 : -3;
}

export const STEP_TABLE = {
  /** Start-of-day budget — the ledger's `budget` field. */
  dayStart: BASE_DAY_BUDGET,
  /**
   * DEPRECATED flat move price — kept so existing callers compile; the day
   * slice re-prices every 'move' entry through `moveAt(row)` (the audited
   * ledger normalizes movement, so per-row pricing holds even for callers
   * still passing this). Equals moveAt(0). A1: prefer moveAt(cell.row).
   */
  move: -1,
  /** Row-priced move (see moveAt): −1 rows 0–2, −2 rows 3–4, −3 rows 5–6. */
  moveAt,
  /** −1, worth it. */
  petDewey: -1,
  /** Deliberate wrong claim (Library group, Study guess, cipher letter…). */
  mistake: mistakeDelta,
  /** Step-priced hint/clue purchase — same row as mistake (RoomEvent 'hint'). */
  hint: mistakeDelta,
  /**
   * Solve payout by room size and row-band tier — LEANER AS YOU CLIMB
   * (owner retune): micro +3/+2/+2, anchor +6/+5/+4. High-tier rooms are
   * climbed TO, not climbed FROM: their payout softens the next mistake, it
   * no longer bankrolls the next storey.
   */
  solve(size: 'micro' | 'anchor', tier: Tier): number {
    return size === 'micro' ? (tier === 1 ? 3 : 2) : 7 - tier;
  },
  /** No costed mistakes and no purchased hints → bonus. */
  perfect: 2,
  /** Kitchen snack range (utility rooms roll inside this, reason 'snack').
   *  Owner retune: 5..10 → 4..8 — refills extend a day, never double it. */
  snack: { min: 4, max: 8 },
  /** Gifting a bookmark is a small walk to find them (reason 'gift'). */
  gift: -1,
} as const;

/**
 * Locked doors on the upper rows (owner retune): drafting into a high cell
 * may need a key — deep pushes are PREPARED for (Key Cabinet, gem trades),
 * not stumbled into. Deterministic per (daySeed, cell) so re-approaching the
 * same door gives the same answer all day (AAA 4.8 spirit).
 *
 * A1 wiring (requested): consult `doorLockedAt` in openDraft for the target
 * cell; a locked target needs `keyCost` keys to open (spend on placement).
 * The blueprint shows the padlock on the door — never a surprise charge.
 */
export const DOOR_LOCKS = {
  /** P(a door into this 0-based row is locked); rows 0–4 never lock. */
  chanceByRow: [0, 0, 0, 0, 0.4, 0.55, 0.7] as readonly number[],
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
 * Bramble's morning tea: start-of-day bonus scaling with her affinity rank
 * (MANOR_DESIGN §8). Rank 0 (just met) is a plain, kind cup. Owner retune:
 * the band is now +3..+8 (was +5..+10) and ramps one step per rank — the
 * warming friendship is a CAMPAIGN arc that helps push the first Sanctum
 * reach toward day 6–10, not a day-2 rocket. Applied as a 'tea' ledger entry
 * so it renders as a floating +N in the morning.
 */
export function teaBonus(brambleAffinity: number): number {
  if (brambleAffinity <= 0) return 0;
  return Math.min(8, 2 + brambleAffinity);
}

/** Fresh ledger for a new day. */
export function createLedger(budget: number = STEP_TABLE.dayStart): StepLedger {
  return { budget, entries: [] };
}

/** Pure append — the only way a delta enters the economy. */
export function appendEntry(ledger: StepLedger, entry: StepEntry): StepLedger {
  return { budget: ledger.budget, entries: [...ledger.entries, entry] };
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
