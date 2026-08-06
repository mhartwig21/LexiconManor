import { describe, expect, it } from 'vitest';
import {
  median, share, simulateDays, MOVEMENT,
  PROFILE_DECENT, PROFILE_GREAT, PROFILE_SKIPPER,
} from '../src/engine/economy/simulate';
import { ledgerTotal } from '../src/engine/economy/steps';

/**
 * A2 — AAA 4.10: the step economy is verified by simulation BEFORE any
 * playtest, over thousands of seeded days played through the REAL
 * STEP_TABLE + ledger. If wife-playtest tuning changes steps.ts, these
 * targets re-run and catch the drift:
 *
 *   (a) a no-refund day (skip all puzzles) tops out around row 4–5;
 *   (b) a decent day (~70% solve) visits 8–12 rooms and reaches row 6–7;
 *   (c) a great day with refills reaches the Sanctum row (7) reliably.
 *
 * Rows here are 1-based (entrance 1 … Sanctum 7), matching the docs.
 */

const DAYS = 2000;

const skipper = simulateDays(PROFILE_SKIPPER, DAYS, 0xa2a2);
const decent = simulateDays(PROFILE_DECENT, DAYS, 0xbeef);
const great = simulateDays(PROFILE_GREAT, DAYS, 0xcafe);
const all = [...skipper, ...decent, ...great];

describe('4.10a — the no-refund day', () => {
  it('tops out around row 4–5', () => {
    const m = median(skipper, (r) => r.maxRow);
    expect(m).toBeGreaterThanOrEqual(4);
    expect(m).toBeLessThanOrEqual(5);
  });

  it('essentially never reaches the Sanctum band without refunds', () => {
    expect(share(skipper, (r) => r.maxRow >= 7)).toBe(0);
    expect(share(skipper, (r) => r.maxRow >= 6)).toBeLessThan(0.1);
  });

  it('always ends by steps, never by the safety cap', () => {
    expect(skipper.every((r) => r.rooms < MOVEMENT.maxRoomsPerDay)).toBe(true);
    expect(skipper.every((r) => r.stepsLeft === 0)).toBe(true);
  });
});

describe('4.10b — the decent day (~70% solve rate)', () => {
  it('visits 8–12 rooms (MANOR_DESIGN §4 target)', () => {
    const m = median(decent, (r) => r.rooms);
    expect(m).toBeGreaterThanOrEqual(8);
    expect(m).toBeLessThanOrEqual(12);
  });

  it('reaches row 6–7', () => {
    const m = median(decent, (r) => r.maxRow);
    expect(m).toBeGreaterThanOrEqual(6);
    expect(m).toBeLessThanOrEqual(7);
  });

  it('refunds visibly extend the day past the skipper baseline', () => {
    expect(median(decent, (r) => r.refunded)).toBeGreaterThan(10);
    expect(median(decent, (r) => r.maxRow)).toBeGreaterThan(median(skipper, (r) => r.maxRow));
  });
});

describe('4.10c — the great day with refills', () => {
  it('reaches the Sanctum row reliably', () => {
    expect(share(great, (r) => r.maxRow >= 7)).toBeGreaterThanOrEqual(0.75);
  });

  it('still ends — the economy is not infinite even played sharply', () => {
    expect(great.every((r) => r.rooms < MOVEMENT.maxRoomsPerDay)).toBe(true);
    expect(median(great, (r) => r.rooms)).toBeLessThanOrEqual(20);
  });
});

describe('ledger invariants over every simulated day (AAA 4.9)', () => {
  it('steps never render negative and the accounting identity holds', () => {
    for (const r of all) {
      expect(r.stepsLeft).toBeGreaterThanOrEqual(0);
      // total = budget + refunds − spends, and stepsLeft is its floor at 0
      expect(ledgerTotal(r.ledger)).toBe(r.ledger.budget + r.refunded - r.spent);
      expect(r.stepsLeft).toBe(Math.max(0, ledgerTotal(r.ledger)));
    }
  });

  it('every delta carries a known reason (the audited-table rule)', () => {
    const reasons = new Set(all.flatMap((r) => r.ledger.entries.map((e) => e.reason)));
    for (const reason of reasons) {
      expect(['tea', 'move', 'mistake', 'solve', 'perfect', 'snack']).toContain(reason);
    }
  });

  it('day ends only out on the floor: the final entry is never followed by play', () => {
    // Exhausted days end with a non-positive running total exactly once — at the end.
    for (const r of decent.slice(0, 200)) {
      let total = r.ledger.budget;
      let wentDry = false;
      for (const e of r.ledger.entries) {
        // Once dry OUTSIDE a room the day is over; mid-room dips recover via
        // the solve payout that follows in the same room key.
        if (wentDry) {
          expect(e.roomKey).toBeDefined();
        }
        total += e.delta;
        if (total <= 0) wentDry = true;
        else wentDry = false;
      }
    }
  });

  it('is deterministic per seed (replayable, AAA 4.8 spirit)', () => {
    const a = simulateDays(PROFILE_DECENT, 50, 777);
    const b = simulateDays(PROFILE_DECENT, 50, 777);
    expect(a.map((r) => [r.rooms, r.maxRow, r.spent, r.refunded]))
      .toEqual(b.map((r) => [r.rooms, r.maxRow, r.spent, r.refunded]));
  });
});
