import { describe, expect, it } from 'vitest';
import {
  appendEntry, climbKey, createLedger, dayStartTotal, doorLockedAt, fernMorningKeys,
  firstMorningPot, highestRowVisited, keyAccessFor, keyCardWeightMultiplier, ledgerTotal,
  moveAt, moveRowOf, priceEntry, rowName, stepsRefunded, stepsRemaining, stepsSpent,
  teaArcPoints, teaBonus,
  BASE_DAY_BUDGET, DOOR_LOCKS, FERN_ARC, FIRST_MORNING_POT, KEY_SUPPLY, MOVE_COST_BY_ROW,
  SANCTUM_GUESS_COST, STEP_TABLE, TEA_ARC, TEA_BY_RANK,
} from '../src/engine/economy/steps';
import { draftCardStake } from '../src/engine/economy/preview';
import type { StepEntry, StepLedger } from '../src/engine/types';

/**
 * A2 — the single audited step ledger (AAA 4.9). Every delta in the game
 * flows through STEP_TABLE + appendEntry; these tests freeze the tuning
 * values after the 2026-08 OWNER PLAYTEST OVERHAUL ("way too easy — I reached
 * the Forgotten Word on my first day") and the ledger invariants.
 *
 * The five levers, each pinned below: lean budget, per-row movement pricing,
 * leaner-as-you-climb refunds, locked upper-row doors, and a tea arc that
 * takes weeks. Campaign-scale consequences live in economy-simulation.test.ts.
 */

const entry = (reason: StepEntry['reason'], delta: number): StepEntry => ({
  reason, delta, at: 0,
});

describe('STEP_TABLE (the one tunable const)', () => {
  it('starts the day at a lean 18 steps (owner retune: was 40)', () => {
    expect(STEP_TABLE.dayStart).toBe(18);
    expect(BASE_DAY_BUDGET).toBe(18);
  });

  it('prices movement per row — climbing IS the expense', () => {
    expect(moveAt(0)).toBe(-1);                        // the ground floor stroll
    expect(moveAt(3)).toBe(-3);
    expect(moveAt(6)).toBe(-5);                        // the Sanctum storey
    expect(STEP_TABLE.moveAt).toBe(moveAt);
    // Monotone, and out-of-range rows clamp rather than throw.
    for (let r = 1; r < MOVE_COST_BY_ROW.length; r++) {
      expect(moveAt(r)).toBeLessThanOrEqual(moveAt(r - 1));
    }
    expect(moveAt(-4)).toBe(moveAt(0));
    expect(moveAt(99)).toBe(moveAt(6));
  });

  it('makes a bare ascent cost more than a whole day of budget', () => {
    const ascent = [1, 2, 3, 4, 5, 6].reduce((sum, row) => sum - moveAt(row), 0);
    expect(ascent).toBeGreaterThan(BASE_DAY_BUDGET);
  });

  it('keeps the deprecated flat move price equal to the ground floor', () => {
    expect(STEP_TABLE.move).toBe(moveAt(0));
    expect(STEP_TABLE.petDewey).toBe(-1);              // worth it
  });

  it('prices weight-1 mistakes at −2, tier 3 at −3 (deliberate claims only)', () => {
    expect(STEP_TABLE.mistake(1, 1)).toBe(-2);
    expect(STEP_TABLE.mistake(1, 2)).toBe(-2);
    expect(STEP_TABLE.mistake(1, 3)).toBe(-3);
  });

  it('charges a flat −1 for a pre-warned structural slip (AAA R.1)', () => {
    expect(STEP_TABLE.mistake('structural', 1)).toBe(-1);
    expect(STEP_TABLE.mistake('structural', 3)).toBe(-1);
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

  it('pays LEANER as you climb: micro +3/+3/+2, anchors +6/+5/+4', () => {
    expect(STEP_TABLE.solve('micro', 1)).toBe(3);
    expect(STEP_TABLE.solve('micro', 2)).toBe(3);
    expect(STEP_TABLE.solve('micro', 3)).toBe(2);
    expect(STEP_TABLE.solve('anchor', 1)).toBe(6);
    expect(STEP_TABLE.solve('anchor', 2)).toBe(5);
    expect(STEP_TABLE.solve('anchor', 3)).toBe(4);
    // The whole point of the retune: a tier-3 solve no longer funds the climb
    // that reached it — it costs more to get up there than the room pays back.
    expect(STEP_TABLE.solve('anchor', 3)).toBeLessThan(-moveAt(6));
  });

  it('pays +2 for a perfect solve and keeps snacks lean (+3..+7)', () => {
    expect(STEP_TABLE.perfect).toBe(2);
    expect(STEP_TABLE.snack.min).toBe(3);
    expect(STEP_TABLE.snack.max).toBe(7);
    // A refill extends a day; it never doubles it.
    expect(STEP_TABLE.snack.max).toBeLessThan(BASE_DAY_BUDGET / 2);
  });

  it('prices the bookmark gift at −1 (a small walk to find them)', () => {
    expect(STEP_TABLE.gift).toBe(-1);
  });

  it('keeps a wrong Sanctum guess FREE, forever (AAA 4.17)', () => {
    expect(SANCTUM_GUESS_COST).toBe(0);
    expect(STEP_TABLE.sanctumGuess).toBe(0);
  });
});

describe('locked doors on the upper storeys (the prepared-ascent gate)', () => {
  it('never locks the lower four rows, always threatens the upper three', () => {
    expect(DOOR_LOCKS.chanceByRow.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(DOOR_LOCKS.chanceByRow[4]!).toBeGreaterThan(0);
    expect(DOOR_LOCKS.chanceByRow[5]!).toBeGreaterThan(DOOR_LOCKS.chanceByRow[4]!);
    expect(DOOR_LOCKS.chanceByRow[6]!).toBeGreaterThan(DOOR_LOCKS.chanceByRow[5]!);
    expect(DOOR_LOCKS.keyCost).toBe(1);
  });

  it('answers the same way all day for the same door (AAA 4.6/4.8)', () => {
    for (const key of ['0,5', '2,6', '4,4']) {
      const row = Number(key.split(',')[1]);
      const first = doorLockedAt(20260806, key, row);
      expect(doorLockedAt(20260806, key, row)).toBe(first);
      expect(doorLockedAt(20260806, key, row)).toBe(first);
    }
  });

  it('is a real gate, not decoration: some doors up top do lock', () => {
    const locks = Array.from({ length: 200 }, (_, seed) =>
      doorLockedAt(seed * 2654435761, '2,6', 6));
    expect(locks.filter(Boolean).length).toBeGreaterThan(100);
    expect(locks.filter((l) => !l).length).toBeGreaterThan(5);
  });
});

describe('priceEntry (movement cannot be mispriced by a caller)', () => {
  it('re-prices a move by the row named in its cell key', () => {
    const flat: StepEntry = { reason: 'move', delta: -1, at: 0, roomKey: '3,5' };
    expect(priceEntry(flat).delta).toBe(moveAt(5));
  });

  it('re-prices through appendEntry, so the ledger is always the truth', () => {
    let l = createLedger();
    // A caller still passing the deprecated flat STEP_TABLE.move…
    l = appendEntry(l, { reason: 'move', delta: STEP_TABLE.move, at: 0, roomKey: '2,6' });
    expect(l.entries[0]!.delta).toBe(-5);
    expect(stepsRemaining(l)).toBe(BASE_DAY_BUDGET - 5);
  });

  it('leaves every other reason exactly as written', () => {
    for (const reason of ['solve', 'mistake', 'tea', 'snack', 'perfect', 'gift'] as const) {
      const e: StepEntry = { reason, delta: 7, at: 0, roomKey: '2,6' };
      expect(priceEntry(e)).toBe(e);
    }
  });

  it('leaves a move with no cell key alone (non-grid movement)', () => {
    const e: StepEntry = { reason: 'move', delta: -1, at: 0 };
    expect(priceEntry(e)).toBe(e);
    const odd: StepEntry = { reason: 'move', delta: -1, at: 0, roomKey: 'sim-3' };
    expect(priceEntry(odd)).toBe(odd);
  });
});

describe('draftCardStake (the economy line on draft cards, AAA 4.10/1.17)', () => {
  it('states micro payouts in numbers, from STEP_TABLE not hand-copy', () => {
    const stake = draftCardStake({ category: 'puzzle', puzzleKind: 'cipher' }, 1);
    expect(stake).toEqual({ size: 'micro', label: 'micro · +3 steps on solve' });
    expect(stake!.label).toContain(String(STEP_TABLE.solve('micro', 1)));
  });

  it('states anchor payouts at the target row tier (+6/+5/+4)', () => {
    expect(draftCardStake({ category: 'puzzle', puzzleKind: 'hive' }, 1)!.label)
      .toBe('anchor · +6 steps on solve');
    expect(draftCardStake({ category: 'puzzle', puzzleKind: 'twistle' }, 2)!.label)
      .toBe('anchor · +5 steps on solve');
    expect(draftCardStake({ category: 'puzzle', puzzleKind: 'word-web' }, 3)!.label)
      .toBe('anchor · +4 steps on solve');
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

describe("Bramble's tea (the campaign's economic arc)", () => {
  it('is a plain kind cup before the friendship warms', () => {
    expect(teaBonus(0)).toBe(0);
    expect(teaBonus(-1)).toBe(0);
    expect(teaBonus(Number.NaN)).toBe(0);
  });

  it('climbs one rank at a time and caps at the published ceiling', () => {
    expect(teaBonus(1)).toBe(TEA_BY_RANK[1]);
    expect(teaBonus(3)).toBe(TEA_BY_RANK[3]);
    expect(teaBonus(6)).toBe(TEA_BY_RANK[6]);
    expect(teaBonus(99)).toBe(TEA_BY_RANK[TEA_BY_RANK.length - 1]);
    for (let r = 1; r < TEA_BY_RANK.length; r++) {
      expect(TEA_BY_RANK[r]!).toBeGreaterThan(TEA_BY_RANK[r - 1]!);
    }
  });

  it('is worth a serious fraction of a day once earned — but only once earned', () => {
    const top = TEA_BY_RANK[TEA_BY_RANK.length - 1]!;
    expect(top / BASE_DAY_BUDGET).toBeGreaterThan(0.4);
    expect(teaBonus(1) / BASE_DAY_BUDGET).toBeLessThan(0.25);
  });
});

describe('ledger invariants (AAA 4.9)', () => {
  it('creates a fresh ledger at the day budget', () => {
    const l = createLedger();
    expect(l.budget).toBe(18);
    expect(l.entries).toEqual([]);
    expect(stepsRemaining(l)).toBe(18);
  });

  it('appendEntry is pure — the original ledger is untouched', () => {
    const a = createLedger();
    const b = appendEntry(a, entry('move', -1));
    expect(a.entries).toHaveLength(0);
    expect(b.entries).toHaveLength(1);
    expect(stepsRemaining(a)).toBe(18);
    expect(stepsRemaining(b)).toBe(17);
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
    l = appendEntry(l, entry('solve', 5));
    l = appendEntry(l, entry('perfect', 2));
    l = appendEntry(l, entry('pet-dewey', -1));
    expect(stepsSpent(l)).toBe(4);
    expect(stepsRefunded(l)).toBe(13);
    expect(ledgerTotal(l)).toBe(18 + 13 - 4);
  });

  it('dayStartTotal counts budget + tea only (the burn-down reference)', () => {
    let l: StepLedger = createLedger();
    expect(dayStartTotal(l)).toBe(18);
    l = appendEntry(l, entry('tea', 8));
    l = appendEntry(l, entry('snack', 5));   // refill, not part of the morning total
    l = appendEntry(l, entry('solve', 6));
    l = appendEntry(l, entry('move', -1));
    expect(dayStartTotal(l)).toBe(26);
  });
});

describe('the key supply — the padlock arc (AAA 4.10d)', () => {
  it('gives a locked door an answer at all: keys exist in more than one place', () => {
    expect(KEY_SUPPLY.cabinetKeys).toBeGreaterThanOrEqual(DOOR_LOCKS.keyCost);
    expect(KEY_SUPPLY.bootRoomKeys).toBeGreaterThanOrEqual(DOOR_LOCKS.keyCost);
  });

  it("mirrors Bramble's tea: nothing on the first mornings, a key once trusted", () => {
    expect(fernMorningKeys(0)).toBe(0);
    expect(fernMorningKeys(1)).toBe(0);
    const table = KEY_SUPPLY.fernMorningKeys;
    for (let i = 1; i < table.length; i++) {
      expect(table[i]!).toBeGreaterThanOrEqual(table[i - 1]!);   // never regresses
    }
    expect(fernMorningKeys(table.length + 20)).toBe(table.at(-1));
    expect(fernMorningKeys(-3)).toBe(0);
    expect(fernMorningKeys(Number.NaN)).toBe(0);
  });

  it('opens at an affinity she can actually reach (the round-5 audit)', () => {
    // A gate whose key is unreachable is a wall. The table used to open at 4
    // points and Fern's whole authored dialogue grants 3 (FERN_ARC, asserted
    // against her JSON in tests/economy-simulation.test.ts) — so the first
    // dawn key now lands inside that budget.
    const authoredCeiling = FERN_ARC.meetPoints + FERN_ARC.questPoints;
    expect(fernMorningKeys(authoredCeiling)).toBeGreaterThan(0);
    expect(fernMorningKeys(2)).toBe(1);
  });

  it('shortens the climb and never buys it: dawn keys open fewer gates than an ascent needs', () => {
    // A straight ascent drafts into rows 4, 5 and 6 once each, so it needs
    // 0.35 + 0.55 + 0.8 ≈ 1.7 keys on average. What her AUTHORED friendship
    // can reach must never cover that, or the padlock stops being a gate the
    // day she warms up.
    const expectedGates = [4, 5, 6]
      .reduce((sum, row) => sum + DOOR_LOCKS.chanceByRow[row]! * DOOR_LOCKS.keyCost, 0);
    const authoredCeiling = FERN_ARC.meetPoints + FERN_ARC.questPoints;
    expect(fernMorningKeys(authoredCeiling)).toBeLessThan(expectedGates);
    // Past it — weeks of bookmarks, deep into a campaign — the sill can hold a
    // second key, and even then never more than the ascent has locked storeys.
    const lockedStoreys = [4, 5, 6].filter((r) => DOOR_LOCKS.chanceByRow[r]! > 0).length;
    expect(Math.max(...KEY_SUPPLY.fernMorningKeys)).toBeLessThan(lockedStoreys);
  });

  it('keeps the gate real on day one: no key arrives before the friendship does', () => {
    expect(fernMorningKeys(0)).toBe(0);
    expect(teaBonus(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ROUND-5 AUDIT — the four economy findings, pinned at the ledger level.
// ---------------------------------------------------------------------------

describe('the two-part walk: a declined look costs the LOCAL rate (AAA 4.6)', () => {
  it('prices the walk to a door at the row she is standing on', () => {
    // Before the audit, `openDraft` ledgered the move at the TARGET cell's
    // rate before the offer even opened, so backing out of a look at an upper
    // door burned a whole storey — 28% of the base budget — while the modal
    // promised "step back". The door-step is now local, always.
    for (let row = 0; row < MOVE_COST_BY_ROW.length; row++) {
      const priced = priceEntry({ reason: 'move', delta: -1, at: 0, roomKey: `2,${row}` });
      expect(priced.delta).toBe(moveAt(row));
    }
  });

  it('charges the climb as a differential, so a completed climb costs the same', () => {
    for (let from = 0; from < MOVE_COST_BY_ROW.length - 1; from++) {
      const to = from + 1;
      const door = priceEntry({ reason: 'move', delta: 0, at: 0, roomKey: `2,${from}` });
      const climb = priceEntry({
        reason: 'move', delta: 0, at: 0, roomKey: climbKey(`2,${from}`, `2,${to}`),
      });
      // The invariant the retune's pinned simulation targets depend on: the
      // two entries together are exactly what one move into `to` always cost.
      expect(door.delta + climb.delta).toBe(moveAt(to));
      // …and the look on its own is only ever the local rate.
      expect(door.delta).toBe(moveAt(from));
    }
  });

  it('never pays her to walk downstairs', () => {
    const down = priceEntry({
      reason: 'move', delta: 0, at: 0, roomKey: climbKey('2,5', '2,2'),
    });
    expect(down.delta).toBe(0);
  });

  it('reads the destination row back out of either key shape', () => {
    expect(moveRowOf('2,4')).toBe(4);
    expect(moveRowOf(climbKey('2,3', '2,4'))).toBe(4);
    expect(moveRowOf(undefined)).toBeNull();
    expect(moveRowOf('sim-7')).toBeNull();
  });
});

describe("the night digest's two missing numbers (AAA 4.10 / R.3)", () => {
  it('derives the highest storey she stood on from the move entries', () => {
    let l = createLedger();
    expect(highestRowVisited(l)).toBe(0);
    l = appendEntry(l, { reason: 'move', delta: 0, at: 0, roomKey: '2,1' });
    l = appendEntry(l, { reason: 'move', delta: 0, at: 0, roomKey: climbKey('2,1', '2,2') });
    l = appendEntry(l, { reason: 'solve', delta: 6, at: 0, roomKey: '2,2' });
    l = appendEntry(l, { reason: 'move', delta: 0, at: 0, roomKey: '2,1' });  // walked back
    expect(highestRowVisited(l)).toBe(2);
  });

  it('names every storey, so the digest never speaks in grid coordinates', () => {
    for (let row = 0; row < MOVE_COST_BY_ROW.length; row++) {
      expect(rowName(row)).toMatch(/[a-z]/);
      expect(rowName(row)).not.toMatch(/\d/);
    }
    expect(new Set(MOVE_COST_BY_ROW.map((_, r) => rowName(r))).size)
      .toBe(MOVE_COST_BY_ROW.length);
  });

  it('counts everything the manor gave back', () => {
    let l = createLedger();
    l = appendEntry(l, { reason: 'tea', delta: 5, at: 0 });
    l = appendEntry(l, { reason: 'move', delta: -3, at: 0, roomKey: '2,3' });
    l = appendEntry(l, { reason: 'solve', delta: 6, at: 0 });
    l = appendEntry(l, { reason: 'perfect', delta: 2, at: 0 });
    expect(stepsRefunded(l)).toBe(13);
  });
});

describe('the tea arc has a LIVE source (AAA 4.10d, round-5 audit)', () => {
  it('warms one point every other morning, to a ceiling TEA_BY_RANK can use', () => {
    expect(teaArcPoints(1)).toBe(0);                 // day 1: they have just met
    expect(teaArcPoints(2)).toBe(1);
    expect(teaArcPoints(TEA_ARC.morningsPerPoint * TEA_ARC.maxPoints)).toBe(TEA_ARC.maxPoints);
    expect(teaArcPoints(999)).toBe(TEA_ARC.maxPoints);
    expect(teaArcPoints(0)).toBe(0);
    expect(teaArcPoints(-4)).toBe(0);
    for (let day = 1; day < 40; day++) {
      expect(teaArcPoints(day + 1)).toBeGreaterThanOrEqual(teaArcPoints(day));
    }
  });

  it('reaches the full pot — which raw affinity points never could', () => {
    // TEA_BY_RANK's top rank needs `maxPoints`; Bramble's authored file grants
    // 2 in its entire lifetime, so before this the published campaign curve was
    // measured against warmth the live game could not draw.
    expect(TEA_ARC.maxPoints).toBe(TEA_BY_RANK.length - 1);
    expect(teaBonus(teaArcPoints(TEA_ARC.morningsPerPoint * TEA_ARC.maxPoints)))
      .toBe(TEA_BY_RANK.at(-1));
  });

  it('lifts the FIRST evening without touching the base budget', () => {
    // AAA 4.10b: day 1 starts at 0 affinity, so the very first evening ran on
    // the bare 18 and measured under the 10–15 floor. A scripted welcome pot
    // fixes it; raising BASE_DAY_BUDGET to 20 would equal the bare ascent cost
    // and break the headline invariant, so it stays at 18.
    expect(firstMorningPot(1)).toBe(FIRST_MORNING_POT);
    expect(firstMorningPot(2)).toBe(0);
    expect(firstMorningPot(30)).toBe(0);
    expect(BASE_DAY_BUDGET).toBe(18);
    // The pot is a REFILL, ledgered like tea — the headline invariant is about
    // the base budget, and the base budget is untouched. A bare, perfectly
    // efficient ascent (rows 1…6) still costs more than a day's budget.
    const bareAscent = [1, 2, 3, 4, 5, 6].reduce((sum, row) => sum - moveAt(row), 0);
    expect(bareAscent).toBeGreaterThan(BASE_DAY_BUDGET);
    // …and the welcome pot must not, on its own, turn day 1 into a Sanctum run:
    // it lifts the first evening's LENGTH, not its ceiling. (The campaign
    // consequence — under 8% of day 1s reach the top — is pinned in
    // tests/economy-simulation.test.ts.)
    expect(FIRST_MORNING_POT).toBeLessThan(teaBonus(TEA_ARC.maxPoints));
  });
});

describe('key ACCESS is a live ramp, not a flat line (AAA 4.10d)', () => {
  it('is neutral before the friendship and multiplies after it', () => {
    expect(keyAccessFor(0)).toBe(0);
    expect(keyAccessFor(-2)).toBe(0);
    expect(keyCardWeightMultiplier(0)).toBe(1);
    expect(keyCardWeightMultiplier(keyAccessFor(FERN_ARC.meetPoints + FERN_ARC.questPoints)))
      .toBeGreaterThan(1);
    expect(keyAccessFor(99)).toBe(1);                 // clamped
    expect(keyCardWeightMultiplier(5)).toBe(keyCardWeightMultiplier(1));
  });

  it('is fully warmed by the points her authored dialogue can actually reach', () => {
    expect(keyAccessFor(FERN_ARC.meetPoints + FERN_ARC.questPoints)).toBe(1);
  });
});
