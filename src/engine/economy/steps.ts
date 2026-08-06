/**
 * Step economy — OWNER: A2 (Economy/Day). Pure TS, no React/DOM.
 *
 * THE single audited ledger (AAA 4.9): every step delta in the game flows
 * through `STEP_TABLE` + `appendEntry`. No slice writes steps directly; the
 * UI renders each entry as a floating +N/−N on the counter.
 *
 * STEP_TABLE is the one tunable const wife-playtest tuning touches
 * (ARCHITECTURE §4, AAA §10.2–3). Values encode the economy rulings:
 *   - weight 0 → free feedback moment, never ledgered (AAA R.1 / 3.2)
 *   - weight 1 → −2 (tier 3 rooms −3); weight 2 doubles (reserved risk rooms)
 *   - hint purchases price through the same row as mistakes (A3's revision)
 *   - solve: micro +3, anchor +6/+7/+8 by tier, perfect +2 (MANOR_DESIGN §4)
 * Costs read as *spending*, never dying (R.3) — the ledger has no concept of
 * failure, only entries.
 */

import type { StepEntry, StepLedger, Tier } from '../types';

/** Start-of-day step budget (MANOR_DESIGN §4; open question AAA §10.2). */
export const BASE_DAY_BUDGET = 40;

/** Mistake / hint pricing row: a deliberate wrong claim in a deduction room. */
function mistakeDelta(weight: 1 | 2, tier: Tier): number {
  return (tier === 3 ? -3 : -2) * weight;
}

export const STEP_TABLE = {
  /** Start-of-day budget — the ledger's `budget` field. */
  dayStart: BASE_DAY_BUDGET,
  /** Enter a room / move one cell. Re-entry costs again (BP rule). */
  move: -1,
  /** −1, worth it. */
  petDewey: -1,
  /** Deliberate wrong claim (Library group, Study guess, cipher letter…). */
  mistake: mistakeDelta,
  /** Step-priced hint/clue purchase — same row as mistake (RoomEvent 'hint'). */
  hint: mistakeDelta,
  /** Solve payout by room size and row-band tier: micro +3, anchor +6/+7/+8. */
  solve(size: 'micro' | 'anchor', tier: Tier): number {
    return size === 'micro' ? 3 : 5 + tier;
  },
  /** No costed mistakes and no purchased hints → bonus. */
  perfect: 2,
  /** Kitchen snack range (utility rooms roll inside this, reason 'snack'). */
  snack: { min: 5, max: 10 },
  /** Gifting a bookmark is a small walk to find them (reason 'gift'). */
  gift: -1,
} as const;

/**
 * Bramble's morning tea: start-of-day bonus scaling with her affinity rank
 * (MANOR_DESIGN §8). Rank 0 (just met) is a plain, kind cup — the +5..+10
 * band opens as the friendship warms. Applied as a 'tea' ledger entry so it
 * renders as a floating +N in the morning, not silently folded into budget.
 */
export function teaBonus(brambleAffinity: number): number {
  if (brambleAffinity <= 0) return 0;
  return Math.min(10, 4 + brambleAffinity);
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
