import { describe, expect, it } from 'vitest';
import {
  appendEntry, createLedger, dayStartTotal, ledgerTotal, stepsRefunded, stepsRemaining,
  stepsSpent, teaBonus, BASE_DAY_BUDGET, STEP_TABLE,
} from '../src/engine/economy/steps';
import { draftCardStake } from '../src/engine/economy/preview';
import type { StepEntry, StepLedger } from '../src/engine/types';

/**
 * A2 — the single audited step ledger (AAA 4.9). Every delta in the game
 * flows through STEP_TABLE + appendEntry; these tests freeze the tuning
 * values (MANOR_DESIGN §4, rulings AAA §0.3) and the ledger invariants.
 */

const entry = (reason: StepEntry['reason'], delta: number): StepEntry => ({
  reason, delta, at: 0,
});

describe('STEP_TABLE (the one tunable const)', () => {
  it('starts the day at 40 steps', () => {
    expect(STEP_TABLE.dayStart).toBe(40);
    expect(BASE_DAY_BUDGET).toBe(40);
  });

  it('prices moves and Dewey at −1 (worth it)', () => {
    expect(STEP_TABLE.move).toBe(-1);
    expect(STEP_TABLE.petDewey).toBe(-1);
  });

  it('prices weight-1 mistakes at −2, tier 3 at −3 (deliberate claims only)', () => {
    expect(STEP_TABLE.mistake(1, 1)).toBe(-2);
    expect(STEP_TABLE.mistake(1, 2)).toBe(-2);
    expect(STEP_TABLE.mistake(1, 3)).toBe(-3);
  });

  it('doubles for weight 2 (reserved risk rooms)', () => {
    expect(STEP_TABLE.mistake(2, 1)).toBe(-4);
    expect(STEP_TABLE.mistake(2, 3)).toBe(-6);
  });

  it("prices hints through the same row as mistakes (A3's contract revision)", () => {
    expect(STEP_TABLE.hint(1, 1)).toBe(STEP_TABLE.mistake(1, 1));
    expect(STEP_TABLE.hint(1, 3)).toBe(STEP_TABLE.mistake(1, 3));
    expect(STEP_TABLE.hint(2, 2)).toBe(STEP_TABLE.mistake(2, 2));
  });

  it('pays micro +3 and anchors +6/+7/+8 by tier', () => {
    expect(STEP_TABLE.solve('micro', 1)).toBe(3);
    expect(STEP_TABLE.solve('micro', 3)).toBe(3);
    expect(STEP_TABLE.solve('anchor', 1)).toBe(6);
    expect(STEP_TABLE.solve('anchor', 2)).toBe(7);
    expect(STEP_TABLE.solve('anchor', 3)).toBe(8);
  });

  it('pays +2 for a perfect solve and keeps snacks in the 5..10 band', () => {
    expect(STEP_TABLE.perfect).toBe(2);
    expect(STEP_TABLE.snack.min).toBe(5);
    expect(STEP_TABLE.snack.max).toBe(10);
  });

  it('prices the bookmark gift at −1 (a small walk to find them)', () => {
    expect(STEP_TABLE.gift).toBe(-1);
  });
});

describe('draftCardStake (the economy line on draft cards, AAA 4.10/1.17)', () => {
  it('states micro payouts in numbers, from STEP_TABLE not hand-copy', () => {
    const stake = draftCardStake({ category: 'puzzle', puzzleKind: 'anagram' }, 1);
    expect(stake).toEqual({ size: 'micro', label: 'micro · +3 steps on solve' });
    expect(stake!.label).toContain(String(STEP_TABLE.solve('micro', 1)));
  });

  it('states anchor payouts at the target row tier (+6/+7/+8)', () => {
    expect(draftCardStake({ category: 'puzzle', puzzleKind: 'hive' }, 1)!.label)
      .toBe('anchor · +6 steps on solve');
    expect(draftCardStake({ category: 'puzzle', puzzleKind: 'twistle' }, 2)!.label)
      .toBe('anchor · +7 steps on solve');
    expect(draftCardStake({ category: 'puzzle', puzzleKind: 'word-web' }, 3)!.label)
      .toBe('anchor · +8 steps on solve');
  });

  it('tells the player mystery rooms yield a fragment on entry', () => {
    expect(draftCardStake({ category: 'mystery' }, 2)).toEqual({
      size: null, label: '+1 fragment',
    });
  });

  it('stays quiet where the numbers are not the story (parlor/utility)', () => {
    expect(draftCardStake({ category: 'parlor' }, 1)).toBeNull();
    expect(draftCardStake({ category: 'utility' }, 1)).toBeNull();
  });
});

describe("Bramble's tea (start-of-day affinity refill)", () => {
  it('is a plain kind cup before the friendship warms', () => {
    expect(teaBonus(0)).toBe(0);
    expect(teaBonus(-1)).toBe(0);
  });

  it('scales with affinity inside the design band and caps at +10', () => {
    expect(teaBonus(1)).toBe(5);
    expect(teaBonus(2)).toBe(6);
    expect(teaBonus(5)).toBe(9);
    expect(teaBonus(6)).toBe(10);
    expect(teaBonus(99)).toBe(10);
  });
});

describe('ledger invariants (AAA 4.9)', () => {
  it('creates a fresh ledger at the day budget', () => {
    const l = createLedger();
    expect(l.budget).toBe(40);
    expect(l.entries).toEqual([]);
    expect(stepsRemaining(l)).toBe(40);
  });

  it('appendEntry is pure — the original ledger is untouched', () => {
    const a = createLedger();
    const b = appendEntry(a, entry('move', -1));
    expect(a.entries).toHaveLength(0);
    expect(b.entries).toHaveLength(1);
    expect(stepsRemaining(a)).toBe(40);
    expect(stepsRemaining(b)).toBe(39);
  });

  it('stepsRemaining never renders negative, even in overdraft', () => {
    let l: StepLedger = createLedger(2);
    l = appendEntry(l, entry('mistake', -3));
    l = appendEntry(l, entry('mistake', -3));
    expect(ledgerTotal(l)).toBe(-4);
    expect(stepsRemaining(l)).toBe(0);
  });

  it('an overdraft can be earned back (mid-puzzle dip then a solve)', () => {
    let l: StepLedger = createLedger(1);
    l = appendEntry(l, entry('mistake', -3)); // total −2
    l = appendEntry(l, entry('solve', 6));    // total +4
    expect(ledgerTotal(l)).toBe(4);
    expect(stepsRemaining(l)).toBe(4);
  });

  it('splits spend and refund totals for the night digest', () => {
    let l: StepLedger = createLedger();
    l = appendEntry(l, entry('tea', 6));
    l = appendEntry(l, entry('move', -1));
    l = appendEntry(l, entry('mistake', -2));
    l = appendEntry(l, entry('solve', 7));
    l = appendEntry(l, entry('perfect', 2));
    l = appendEntry(l, entry('pet-dewey', -1));
    expect(stepsSpent(l)).toBe(4);
    expect(stepsRefunded(l)).toBe(15);
    expect(ledgerTotal(l)).toBe(40 + 15 - 4);
  });

  it('dayStartTotal counts budget + tea only (the burn-down reference)', () => {
    let l: StepLedger = createLedger();
    expect(dayStartTotal(l)).toBe(40);
    l = appendEntry(l, entry('tea', 8));
    l = appendEntry(l, entry('snack', 9));   // refill, not part of the morning total
    l = appendEntry(l, entry('solve', 6));
    l = appendEntry(l, entry('move', -1));
    expect(dayStartTotal(l)).toBe(48);
  });
});
