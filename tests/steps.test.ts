import { describe, expect, it } from 'vitest';
import {
  appendEntry, climbKey, createLedger, dayStartTotal, doorLockedAt, fernMorningKeys,
  firstMorningPot, highestRowVisited, keyAccessFor, keyCardWeightMultiplier, ledgerTotal,
  moveAt, moveRowOf, priceEntry, rowName, solveKeys, stepsRefunded, stepsRemaining, stepsSpent,
  teaArcFloor, teaArcPoints, teaBonus,
  BASE_DAY_BUDGET, DOOR_LOCKS, FERN_ARC, FIRST_MORNING_POT, KEY_SUPPLY, MOVE_COST_BY_ROW,
  SANCTUM_GUESS_COST, STEP_TABLE, TEA_ARC, TEA_BY_POINTS,
} from '../src/engine/economy/steps';
import { draftCardStake } from '../src/engine/economy/preview';
import { REFILL_PAYOUTS } from '../src/engine/economy/simulate';
import { UTILITY_EFFECTS } from '../src/engine/manor/deck';
import { rowTier, SANCTUM_DOOR_CELL } from '../src/engine/manor/grid';
import { SANCTUM_CELL } from '../src/engine/types';
import { rankFor, AFFINITY_RANK_THRESHOLDS } from '../src/engine/dialogue/affinity';
import type { StepEntry, StepLedger, Tier } from '../src/engine/types';

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
    // Round 7: the two upper storeys carry the climb, because the ascent the
    // player must actually pay for ends at the Sanctum LANDING (0-based row
    // 5), not at the sealed Sanctum above it.
    expect(moveAt(5)).toBe(-9);                        // the Sanctum landing
    expect(moveAt(6)).toBe(moveAt(5));                 // the sealed room itself
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

  it('pays +2 for a perfect solve and keeps refills lean (+2..+6)', () => {
    expect(STEP_TABLE.perfect).toBe(2);
    expect(STEP_TABLE.snack.min).toBe(2);
    expect(STEP_TABLE.snack.max).toBe(6);
    // A refill extends a day; it never doubles it.
    expect(STEP_TABLE.snack.max).toBeLessThan(BASE_DAY_BUDGET / 2);
  });

  /**
   * ROUND-6 AUDIT — THE CONSTANT THAT DESCRIBED A GAME WE DO NOT SHIP.
   *
   * `STEP_TABLE.snack` declared 3..7 and NOTHING live sampled it: refills are
   * fixed authored numbers on the green cards (`UTILITY_EFFECTS`), and each
   * card prints its own number in its own toast. Its only reader was the
   * simulation, so the documented "scarce refills (+3..+7)" was verified
   * against a distribution the deck could not produce — the Still Room's +2
   * sat BELOW the declared floor, and nothing paid 7 at all.
   *
   * The constant is now a CONTRACT over the shipped deck, checked here, so a
   * deck edit that quietly lifts the Kitchen to +9 breaks this test instead of
   * the owner's evening.
   */
  it('CONTRACT: every shipped refill payout lies inside STEP_TABLE.snack', () => {
    const refills = Object.values(UTILITY_EFFECTS)
      .map((e) => e.steps ?? 0)
      .filter((n) => n > 0);
    expect(refills.length).toBeGreaterThan(0);
    for (const n of refills) {
      expect(n).toBeGreaterThanOrEqual(STEP_TABLE.snack.min);
      expect(n).toBeLessThanOrEqual(STEP_TABLE.snack.max);
    }
    // Not merely inside: the declared bounds are TIGHT — they are the deck's
    // own extremes, so the range cannot drift back into fiction unnoticed.
    expect(Math.min(...refills)).toBe(STEP_TABLE.snack.min);
    expect(Math.max(...refills)).toBe(STEP_TABLE.snack.max);
    // And the simulation draws from those very payouts (no parallel universe).
    expect([...REFILL_PAYOUTS].sort((a, b) => a - b))
      .toEqual([...refills].sort((a, b) => a - b));
  });

  it('CONTRACT: compounding hooks pay inside their own declared band', () => {
    const hooks = Object.values(UTILITY_EFFECTS)
      .filter((e) => e.compounding)
      .map((e) => e.compoundSteps ?? 0)
      .filter((n) => n > 0);
    expect(hooks.length).toBeGreaterThan(0);
    for (const n of hooks) {
      expect(n).toBeGreaterThanOrEqual(STEP_TABLE.compound.min);
      expect(n).toBeLessThanOrEqual(STEP_TABLE.compound.max);
    }
    expect(Math.min(...hooks)).toBe(STEP_TABLE.compound.min);
    expect(Math.max(...hooks)).toBe(STEP_TABLE.compound.max);
    // The classes are declared apart on purpose: a compounding rattle is
    // allowed to sit below the refill floor, and one shared constant would
    // have to lie about one of them.
    expect(STEP_TABLE.compound.min).toBeLessThan(STEP_TABLE.snack.min);
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
    // Row 6 is the sealed Sanctum: pre-placed, never drafted, so its rate is
    // never rolled. It stays at the landing's rate only so the table is total
    // — the ascent the player makes crosses rows 4 and 5, and THOSE two now
    // sum to the ~1.7 padlocks the design has always claimed for a climb.
    expect(DOOR_LOCKS.chanceByRow[6]!).toBeGreaterThanOrEqual(DOOR_LOCKS.chanceByRow[5]!);
    expect(DOOR_LOCKS.chanceByRow[4]! + DOOR_LOCKS.chanceByRow[5]!).toBeGreaterThan(1.5);
    // ROUND 10: a padlock takes TWO keys. Solved rooms pay keys now
    // (`solveKeys`), which roughly doubled the supply — measured on the old
    // 1-key door a skilled player stood at the Sanctum on day 1 in 29% of
    // campaigns against a published <8%. The DOOR was repriced rather than the
    // solve capped, so playing well still feels paid.
    expect(DOOR_LOCKS.keyCost).toBe(2);
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
    expect(l.entries[0]!.delta).toBe(moveAt(6));
    expect(stepsRemaining(l)).toBe(BASE_DAY_BUDGET - -moveAt(6));
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
    // ROUND 10: the card face names the KEY too, because from tier 2 up the
    // solve is what buys the padlocked door above it — and the price of the
    // climb is exactly the thing a draft decision is made on (AAA 1.17/4.6).
    expect(draftCardStake({ category: 'puzzle', puzzleKind: 'twistle' }, 2)!.label)
      .toBe('anchor · +5 steps · +1 key on solve');
    expect(draftCardStake({ category: 'puzzle', puzzleKind: 'word-web' }, 3)!.label)
      .toBe('anchor · +4 steps · +1 key on solve');
    // Derived from the table, never hand-copied: retuning solveKeys retunes
    // every card face.
    for (const tier of [1, 2, 3] as const) {
      const label = draftCardStake({ category: 'puzzle', puzzleKind: 'hive' }, tier)!.label;
      expect(label.includes('key')).toBe(solveKeys(tier) > 0);
    }
  });

  it('tells the player a mystery room yields a SEALED page on entry', () => {
    // Round 10: entering still hands over the document, unconditionally and
    // forever — but undeciphered, and the card must not promise a reading it
    // does not give. The word game is what makes it out.
    expect(draftCardStake({ category: 'mystery' }, 2)).toEqual({
      size: null, label: '+1 sealed page',
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
    expect(teaBonus(1)).toBe(TEA_BY_POINTS[1]);
    expect(teaBonus(3)).toBe(TEA_BY_POINTS[3]);
    expect(teaBonus(6)).toBe(TEA_BY_POINTS[6]);
    expect(teaBonus(99)).toBe(TEA_BY_POINTS[TEA_BY_POINTS.length - 1]);
    for (let r = 1; r < TEA_BY_POINTS.length; r++) {
      expect(TEA_BY_POINTS[r]!).toBeGreaterThan(TEA_BY_POINTS[r - 1]!);
    }
  });

  it('is worth a serious fraction of a day once earned — but only once earned', () => {
    const top = TEA_BY_POINTS[TEA_BY_POINTS.length - 1]!;
    expect(top / BASE_DAY_BUDGET).toBeGreaterThan(0.4);
    expect(teaBonus(1) / BASE_DAY_BUDGET).toBeLessThan(0.25);
  });
});

/**
 * ═══ UNITS: POINTS, NOT RANKS ═══════════════════════════════════════════
 *
 * The silent catastrophe this file exists to prevent. `TEA_BY_POINTS` and
 * `KEY_SUPPLY.fernMorningKeysByPoints` are indexed by RAW AFFINITY POINTS —
 * the integer `affinities.<character>` carries — on a 0..6 one-point-per-index
 * scale. Affinity RANKS are a different scale entirely: 0..4 on the thresholds
 * `[0, 2, 5, 9, 14]` (engine/dialogue/affinity.ts `rankFor`).
 *
 * Both tables were previously NAMED for ranks ("TEA_BY_RANK",
 * "fernMorningKeys"), which invited a maintainer to "correct" the call sites
 * to `teaBonus(rankFor(points))`. That edit compiles, reads like a bug fix,
 * caps the tea two entries below its published ceiling, pushes Fern's first
 * dawn key from 2 points out to 5 — past her entire authored budget of 3 —
 * and reshapes the whole campaign with every other test still green.
 *
 * These assertions fail loudly if anyone makes it. They are deliberately
 * written as *inequalities against the rank-indexed answer*, not merely as
 * value checks, so they cannot be satisfied by accident.
 */
describe('UNITS — the affinity tables are indexed by POINTS, never by rank', () => {
  it('the two scales really are different (else these tests prove nothing)', () => {
    expect([...AFFINITY_RANK_THRESHOLDS]).toEqual([0, 2, 5, 9, 14]);
    expect(TEA_BY_POINTS.length).toBeGreaterThan(AFFINITY_RANK_THRESHOLDS.length);
    expect(KEY_SUPPLY.fernMorningKeysByPoints.length)
      .toBeGreaterThan(AFFINITY_RANK_THRESHOLDS.length);
  });

  it('teaBonus(points) reads the POINTS index — rankFor() would cap the arc', () => {
    for (const points of [1, 2, 3, 4, 5, 6]) {
      expect(teaBonus(points)).toBe(TEA_BY_POINTS[points]);
    }
    // The exact values where the "fix" bites: at 2 and 3 points a rank lookup
    // answers with a smaller pot, and beyond 5 points it can never grow again.
    expect(teaBonus(2)).toBe(6);
    expect(TEA_BY_POINTS[rankFor(2)]).toBe(4);
    expect(teaBonus(2)).not.toBe(TEA_BY_POINTS[rankFor(2)]);
    expect(teaBonus(3)).not.toBe(TEA_BY_POINTS[rankFor(3)]);
    // Rank saturates at 4 (14 points), so a rank-indexed pot could never pay
    // the published ceiling (+13 since the round-12 retune) that AAA 4.10d's
    // day 6–10 curve is built on. Asserted against `TEA_BY_POINTS.at(-1)`
    // rather than the literal, so a tuning edit cannot outdate the assertion —
    // only this comment, which is why the number is named here and nowhere else.
    const topByRank = Math.max(
      ...[0, 1, 2, 3, 4, 5, 6].map((p) => TEA_BY_POINTS[rankFor(p)]!),
    );
    expect(topByRank).toBeLessThan(TEA_BY_POINTS.at(-1)!);
    expect(teaBonus(TEA_ARC.maxPoints)).toBe(TEA_BY_POINTS.at(-1));
  });

  it('fernMorningKeys(points) reads the POINTS index — rankFor() locks the gate', () => {
    const table = KEY_SUPPLY.fernMorningKeysByPoints;
    for (const points of [0, 1, 2, 3, 4, 5, 6]) {
      expect(fernMorningKeys(points)).toBe(table[points]);
    }
    // Her first dawn key lands at 2 points, INSIDE her authored lifetime
    // budget of 3 (FERN_ARC). A rank lookup answers 0 there and would not pay
    // a key until 5 points, which her dialogue can never grant.
    const authoredCeiling = FERN_ARC.meetPoints + FERN_ARC.questPoints;
    expect(fernMorningKeys(2)).toBe(1);
    expect(table[rankFor(2)]).toBe(0);
    expect(fernMorningKeys(authoredCeiling)).toBeGreaterThan(0);
    expect(table[rankFor(authoredCeiling)]).toBe(0);
  });

  it('the accessors saturate on the POINTS table, not on MAX_AFFINITY_RANK', () => {
    // A rank-indexed reader would have clamped at index 4; these clamp at 6.
    expect(teaBonus(999)).toBe(TEA_BY_POINTS.at(-1));
    expect(fernMorningKeys(999)).toBe(KEY_SUPPLY.fernMorningKeysByPoints.at(-1));
    expect(teaBonus(TEA_BY_POINTS.length - 1)).toBe(TEA_BY_POINTS.at(-1));
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
    // At least one source can pay a whole padlock on its own — otherwise a
    // 2-key door would be a wall for anyone who drew only the small hooks.
    expect(KEY_SUPPLY.cabinetKeys).toBeGreaterThanOrEqual(DOOR_LOCKS.keyCost);
    // …and the incidental sources are real, if partial: the Boot Room's hook,
    // Fern's sill, and (round 10) every solved room on the storey below a gate.
    expect(KEY_SUPPLY.bootRoomKeys).toBeGreaterThan(0);
    expect(Math.max(...KEY_SUPPLY.solveKeysByTier)).toBeGreaterThan(0);
    expect(Math.max(...KEY_SUPPLY.fernMorningKeysByPoints)).toBeGreaterThan(0);
  });

  /**
   * ROUND 10 — THE OWNER'S "SKILL, NOT JUST PERSISTENCE, EARNS THE CAMPAIGN".
   *
   * Every key in the game used to come off a green card or off Fern, so the
   * padlock arc was a DRAFTING-LUCK arc and playing the word games well bought
   * steps and nothing else. A solved room pays a key now, and the geometry is
   * the design: `DOOR_LOCKS` gates 0-based rows 4–5, rows 3–4 are tier 2, so
   * the storey below a padlock is the storey that pays for it.
   */
  describe('a solved room pays the climb (KEY_SUPPLY.solveKeysByTier)', () => {
    it('pays nothing on the ground floor, where nothing is locked', () => {
      expect(solveKeys(1)).toBe(0);
      // …and it is not an oversight: rows 0–2 (tier 1) have no gate above them
      // that a key could open, so a key there would be a key with nowhere to go.
      expect(DOOR_LOCKS.chanceByRow[0]).toBe(0);
      expect(DOOR_LOCKS.chanceByRow[1]).toBe(0);
      expect(DOOR_LOCKS.chanceByRow[2]).toBe(0);
    });

    it('pays on the storey directly below the first padlock', () => {
      // rowTier(3) === 2 and DOOR_LOCKS.chanceByRow[4] > 0: solving on row 3
      // is what buys the door into row 4.
      expect(rowTier(3)).toBe(2);
      expect(DOOR_LOCKS.chanceByRow[4]!).toBeGreaterThan(0);
      expect(solveKeys(2)).toBeGreaterThan(0);
    });

    it('never regresses with tier, and clamps outside the table', () => {
      expect(solveKeys(3)).toBeGreaterThanOrEqual(solveKeys(2));
      expect(solveKeys(2)).toBeGreaterThanOrEqual(solveKeys(1));
      expect(solveKeys(0 as Tier)).toBe(KEY_SUPPLY.solveKeysByTier[0]);
      expect(solveKeys(9 as Tier)).toBe(KEY_SUPPLY.solveKeysByTier.at(-1));
    });

    it('shortens the ascent without buying it — one room is never a whole climb', () => {
      // A full ascent crosses ≈1.85 padlocks at 2 keys each. One solve must
      // never cover that, or the gate stops being a gate the first good room.
      const ascent = [4, 5].reduce(
        (sum, row) => sum + DOOR_LOCKS.chanceByRow[row]! * DOOR_LOCKS.keyCost, 0);
      expect(Math.max(...KEY_SUPPLY.solveKeysByTier)).toBeLessThan(ascent);
    });
  });

  it("mirrors Bramble's tea: nothing on the first mornings, a key once trusted", () => {
    expect(fernMorningKeys(0)).toBe(0);
    expect(fernMorningKeys(1)).toBe(0);
    const table = KEY_SUPPLY.fernMorningKeysByPoints;
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
    expect(Math.max(...KEY_SUPPLY.fernMorningKeysByPoints)).toBeLessThan(lockedStoreys);
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
    // …and it names the right storey the Sanctum landing. Round 7: row 5 IS
    // the landing the word is spoken from (grid.ts SANCTUM_DOOR_CELL) and row
    // 6 is the sealed room; the names were one storey out, so the digest
    // congratulated her on reaching a floor she had not.
    expect(rowName(SANCTUM_DOOR_CELL.row)).toMatch(/Sanctum landing/);
    expect(rowName(SANCTUM_CELL.row)).not.toMatch(/landing/);
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
  it('warms one point every other morning, to a ceiling TEA_BY_POINTS can use', () => {
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

  it('is a CEILING mornings buy, with a floor one rung behind it', () => {
    // ROUND-7 FINDING: `teaArcPoints` was applied unconditionally at dawn, so
    // the arc was the calendar and the player had no agency in it. It is the
    // ceiling now — `DaySlice.shareMorningTea` grants against it when the
    // scene actually plays — and `teaArcFloor` is the mercy path for a player
    // who skipped her mornings (AAA 5.5: later and less, never lost).
    for (let day = 1; day < 40; day++) {
      expect(teaArcFloor(day)).toBeLessThanOrEqual(teaArcPoints(day));
      expect(teaArcFloor(day + 1)).toBeGreaterThanOrEqual(teaArcFloor(day));
    }
    // Exactly one rung behind, once the arc is running.
    expect(teaArcFloor(TEA_ARC.morningsPerPoint * 2)).toBe(teaArcPoints(TEA_ARC.morningsPerPoint * 2) - 1);
    expect(teaArcFloor(1)).toBe(0);
    expect(teaArcFloor(2)).toBe(0);
    // …and it still arrives at the same brim, for anyone who keeps playing.
    expect(teaArcFloor(999)).toBe(TEA_ARC.maxPoints);
  });

  it('reaches the full pot — which raw affinity points never could', () => {
    // TEA_BY_POINTS's top rank needs `maxPoints`; Bramble's authored file grants
    // 2 in its entire lifetime, so before this the published campaign curve was
    // measured against warmth the live game could not draw.
    expect(TEA_ARC.maxPoints).toBe(TEA_BY_POINTS.length - 1);
    expect(teaBonus(teaArcPoints(TEA_ARC.morningsPerPoint * TEA_ARC.maxPoints)))
      .toBe(TEA_BY_POINTS.at(-1));
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
