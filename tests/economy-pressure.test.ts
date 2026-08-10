/**
 * ═══ AAA 4.10i — THE GROUND FLOOR IS A RESOURCE, NOT A FORMALITY ══════════
 *
 * REVIEW_AA §5.10, in the review's own words: *"STEP PRESSURE BELOW ROW 4. The
 * ground floor has no tension. If a resource is never scarce it is not a
 * resource, it is a formality."*
 *
 * ROUND 23 MEASURED IT, and the review was right by a wider margin than it
 * claimed. Over 300 campaigns × 45 days × 2 profiles, on the tier-1 band
 * (0-based rows 0–2 — 62% of the rooms the median player enters):
 *
 *   steps in hand while walking it   median 28 (median player) / 30 (skilled)
 *                                    against an 18-step budget, p10 20 / 26
 *   net steps per room entered       −0.84 / −0.36 — a wash, not a cost
 *   evenings with a moment under 4   0.2% / 0.0%
 *   in hand entering the first
 *     PADLOCKED storey (row 4)       15 / 21 — the skilled player arrived at
 *                                    the gate richer than she started the day
 *
 * TWO CAUSES, and this file gates both. The band charged ONE step a room
 * against a solve worth up to twelve (`MOVE_COST_BY_ROW`, now −2 across the
 * band), and every rung of Bramble's arc landed at dawn, so the floor got
 * richer every week while never getting dearer (`TEA_POUR`, now a cup at the
 * door and the rest of the pot on the second landing).
 *
 * WHAT THIS FILE IS FOR. The numbers below are a RATCHET in the same spirit as
 * 4.10h's wage spread: they are measurements with headroom, they may be
 * tightened, and they may not be loosened without a finding to point at. If
 * the ground floor goes slack again — a fatter dawn purse, a cheaper walk, a
 * refill that lands before the second landing — this file fails before the
 * owner's evening does.
 *
 * It deliberately does NOT gate the campaign: 4.10a–h own that, and
 * tests/economy-simulation.test.ts re-measures every band against these
 * numbers. What is asserted here is only what §5.10 is about.
 */
import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import {
  medianOf, quantileOf, simulateCampaigns, simulateDays,
  FIRST_LOCKED_ROW, GROUND_ROWS, PROFILE_DECENT, PROFILE_GREAT, PROFILE_SKILLED, RETIREMENT,
  SESSION_WIND_DOWN, type SimDayResult, type SimProfile,
} from '../src/engine/economy/simulate';
import {
  moveAt, solvePayout, teaBonus, teaDawnPour, teaLandingPour,
  BASE_DAY_BUDGET, DOOR_LOCKS, FIRST_MORNING_POT, MOVE_COST_BY_ROW, TEA_ARC, TEA_BY_POINTS,
  TEA_POUR,
} from '../src/engine/economy/steps';
import { ROOM_PUZZLE_KINDS } from '../src/engine/rooms/room-puzzle';
import { createManor, rowTier } from '../src/engine/manor/grid';
import { createEmptySaveV2 } from '../src/app/save';
import type { ManorStore } from '../src/app/store';
import { createDaySlice } from '../src/app/slices/day';
import { createManorSlice, ensureManor } from '../src/app/slices/manor';
import { createRoomSlice } from '../src/app/slices/room';
import { createDialogueSlice } from '../src/app/slices/dialogue';
import { createJournalSlice } from '../src/app/slices/journal';
import { createMetaSlice } from '../src/app/slices/meta';
import type { PlacedRoom } from '../src/engine/types';

/** The day-1 purse — the leanest evening the game has ever had. */
const DAY_ONE_PURSE = BASE_DAY_BUDGET + FIRST_MORNING_POT;

const CAMPAIGNS = 120;
const DAYS = 45;
const SEED = 0x5a10;

const cached = new Map<string, SimDayResult[]>();
const play = (profile: SimProfile): SimDayResult[] => {
  const hit = cached.get(profile.name);
  if (hit) return hit;
  const days = simulateCampaigns(profile, CAMPAIGNS, DAYS, SEED).flatMap((c) => c.days);
  cached.set(profile.name, days);
  return days;
};

/** Her purse at every moment she spent on the ground floor, pooled. */
const purse = (profile: SimProfile) => play(profile).flatMap((d) => [...d.pressure.inHand]);

/** Mean net steps per room she entered on the ground floor. */
const drain = (profile: SimProfile) => {
  const days = play(profile);
  const net = days.reduce((s, d) => s + d.pressure.groundNet, 0);
  const rooms = days.reduce((s, d) => s + d.pressure.groundRooms, 0);
  expect(rooms, 'no ground-floor rooms were entered at all').toBeGreaterThan(days.length);
  return net / rooms;
};

describe('4.10i — the band this is measured over is derived, not asserted', () => {
  it('is the tier-1 band, and it is what the review means by "below row 4"', () => {
    for (let r = 0; r <= GROUND_ROWS; r++) expect(rowTier(r)).toBe(rowTier(0));
    expect(rowTier(GROUND_ROWS + 1)).not.toBe(rowTier(0));
    // …and it sits strictly below the first storey a padlock can stand on, so
    // "the ground floor" and "the storeys she can reach without a key" agree.
    expect(FIRST_LOCKED_ROW).toBe(DOOR_LOCKS.chanceByRow.findIndex((c) => c > 0));
    expect(GROUND_ROWS).toBeLessThan(FIRST_LOCKED_ROW);
  });

  it('charges one price across the whole band, and more above it', () => {
    for (let r = 0; r <= GROUND_ROWS; r++) expect(moveAt(r)).toBe(moveAt(0));
    expect(moveAt(FIRST_LOCKED_ROW)).toBeLessThan(moveAt(GROUND_ROWS));
    // The lever itself: a ground-floor room is not free. −1 is what §5.10 was
    // written about; if this ever goes back to −1, the whole file is a lie.
    expect(-moveAt(0)).toBeGreaterThanOrEqual(2);
  });
});

describe('4.10i — the ground floor is a purse she can run down', () => {
  for (const profile of [PROFILE_DECENT, PROFILE_SKILLED]) {
    it(`${profile.name}: never carries more of a purse than day 1 gave her`, () => {
      // THE HEADLINE. Before: 28 (decent) / 30 (skilled) against an 18-step
      // budget. The bound is the day-1 purse because that is the real defect —
      // the arc was slackening the floor, so by day 12 the ground floor was a
      // third richer than it had ever been. Measured after: 18 / 20.
      const p = purse(profile);
      expect(p.length).toBeGreaterThan(10_000);
      const median = medianOf(p);
      expect(median, `${profile.name} ground-floor purse median ${median}`)
        .toBeLessThanOrEqual(DAY_ONE_PURSE);
      // …and it is not scraping in on a tail: the top decile of moments down
      // there is inside a day's worth of steps too.
      expect(quantileOf(p, 0.9)).toBeLessThanOrEqual(DAY_ONE_PURSE + 4);
    });

    it(`${profile.name}: does not arrive at the first padlock richer than she started`, () => {
      // The economy critic's sharpest line: "she arrives at the first real gate
      // median 20 steps in hand against an 18-step dawn budget — richer than
      // she started." Measured before: 15 (decent) / 21 (skilled). After: 13 / 18.
      const at = play(profile)
        .map((d) => d.pressure.atFirstLock)
        .filter((n): n is number => n !== null);
      expect(at.length).toBeGreaterThan(1000);
      expect(medianOf(at), `${profile.name} at row ${FIRST_LOCKED_ROW}`)
        .toBeLessThanOrEqual(BASE_DAY_BUDGET);
    });
  }

  it('costs her something every time she crosses it', () => {
    // Before: −0.84 (decent) / −0.36 (skilled) net steps per room entered — a
    // wash. After: −2.55 / −0.96. The skilled player's floor is still close to
    // self-funding and that is the design (she solves 90% of what she sits
    // for); what it may never be again is POSITIVE, which is what the economy
    // critic measured on the shipped table (+1.61 on row 0).
    expect(drain(PROFILE_DECENT)).toBeLessThanOrEqual(-2);
    expect(drain(PROFILE_SKILLED)).toBeLessThanOrEqual(-0.5);
    expect(drain(PROFILE_GREAT)).toBeLessThan(0);
  });

  it('keeps the solve:walk ratio on the ground floor inside 6:1', () => {
    // The ratio §5.10 is really about: what the longest tier-1 room pays
    // against what the storey it stands on charges. It ran 12:1 (a wage-capped
    // Conservatory against a −1 walk). The payout side is locked by 4.10h —
    // re-opening the 36× wage spread to fix this would be a worse trade — so
    // the walk is the half that moved.
    const best = Math.max(...ROOM_PUZZLE_KINDS.map((k) => solvePayout(k, 1)));
    expect(best / -moveAt(0)).toBeLessThanOrEqual(6);
  });
});

describe('4.10i — the arc funds the climb, not the floor (TEA_POUR)', () => {
  it('never loses a step: the cup plus the pot is the pot', () => {
    for (let p = 0; p <= TEA_BY_POINTS.length + 2; p++) {
      expect(teaDawnPour(p) + teaLandingPour(p)).toBe(teaBonus(p));
      expect(teaDawnPour(p)).toBeLessThanOrEqual(TEA_POUR.dawnCup);
    }
    // The arc is untouched in size — this round moved WHERE it is drinkable.
    expect(teaBonus(TEA_ARC.maxPoints)).toBe(TEA_BY_POINTS.at(-1));
  });

  it('leaves the ground floor the same purse on day 30 as on day 1', () => {
    // The invariant the whole item turns on. A warmer Bramble is worth exactly
    // what she always was — over the course of an EVENING. She is worth
    // nothing extra on the ground floor, on any day of the campaign.
    const coldest = BASE_DAY_BUDGET + teaDawnPour(0) + FIRST_MORNING_POT;
    const warmest = BASE_DAY_BUDGET + teaDawnPour(TEA_ARC.maxPoints);
    expect(warmest).toBe(coldest);
    expect(warmest).toBe(DAY_ONE_PURSE);
  });

  it('sets the pot down above the band and below the first padlock', () => {
    expect(TEA_POUR.landingRow0).toBeGreaterThan(GROUND_ROWS);
    expect(TEA_POUR.landingRow0).toBeLessThan(FIRST_LOCKED_ROW);
    // …and she can always afford to walk to it, on the leanest evening in the
    // game, with steps to spare. A pour she could be denied would be a trap.
    let bare = 0;
    for (let r = 1; r <= TEA_POUR.landingRow0; r++) bare += -moveAt(r);
    expect(bare).toBeLessThan(DAY_ONE_PURSE / 2);
  });

  it('cannot touch day 1, by construction (AAA 4.10d)', () => {
    // teaBonus(0) is 0, so on the first evening there is no pot to split and
    // the "<8% day-1 landing reach" cannot move because of this at all.
    expect(teaDawnPour(0)).toBe(0);
    expect(teaLandingPour(0)).toBe(0);
  });
});

describe('4.10i — the live pour is REACHABLE (built, then checked)', () => {
  const makeStore = () => {
    const save = createEmptySaveV2('Bramble');
    return create<ManorStore>()((...a) => ({
      ...createDaySlice(save)(...a),
      ...createManorSlice(save)(...a),
      ...createRoomSlice(save)(...a),
      ...createDialogueSlice(save)(...a),
      ...createJournalSlice(save)(...a),
      ...createMetaSlice(save)(...a),
    }));
  };

  /** Stand her one storey under the pot, warm, with a plan to draft into. */
  const belowTheLanding = (bramble: number) => {
    const store = makeStore();
    store.getState().startDay();
    store.getState().advanceDayPhase();
    ensureManor();
    const base = createManor(31);
    const row = TEA_POUR.landingRow0 - 1;
    const here: PlacedRoom = {
      cardId: 'gallery', cell: { col: 2, row }, doors: ['N', 'S'],
      solved: true, kind: 'twistle',
    };
    store.setState({
      manor: {
        ...base,
        rooms: { ...base.rooms, [`2,${row}`]: here },
        playerCell: { col: 2, row },
      },
      day: { ...store.getState().day!, day: 20, daySeed: 31 },
      affinities: { ...store.getState().affinities, bramble },
      currencies: { ...store.getState().currencies, keys: 4, gems: 4 },
      ledger: { budget: BASE_DAY_BUDGET, entries: [] },
    });
    return store;
  };

  const pourOf = (store: ReturnType<typeof makeStore>) =>
    store.getState().ledger.entries.filter((e) => e.roomKey === TEA_POUR.key);

  it('pours the rest of the pot when she reaches the second landing', () => {
    const warm = TEA_ARC.maxPoints;
    const store = belowTheLanding(warm);
    expect(pourOf(store)).toHaveLength(0);          // not before she gets there
    store.getState().openDraft('N');
    const offer = store.getState().draftOffer;
    expect(offer, 'no draft offer — the probe never reached the landing').not.toBeNull();
    const card = offer!.cards.find((c) => c.gemCost === 0) ?? offer!.cards[0]!;
    store.getState().chooseDraftCard(card.id);
    expect(store.getState().manor!.playerCell.row).toBe(TEA_POUR.landingRow0);

    const poured = pourOf(store);
    expect(poured, 'Bramble never brought the pot up').toHaveLength(1);
    expect(poured[0]!.reason).toBe('tea');
    expect(poured[0]!.delta).toBe(teaLandingPour(warm));
    expect(poured[0]!.delta).toBeGreaterThan(0);
  });

  it('pours it once an evening, however far she climbs after', () => {
    const store = belowTheLanding(TEA_ARC.maxPoints);
    store.getState().openDraft('N');
    store.getState().chooseDraftCard(store.getState().draftOffer!.cards[0]!.id);
    const first = pourOf(store).length;
    expect(first).toBe(1);
    for (const dir of ['N', 'E', 'W'] as const) {
      store.getState().openDraft(dir);
      const offer = store.getState().draftOffer;
      if (offer) store.getState().chooseDraftCard(offer.cards[0]!.id);
    }
    expect(pourOf(store)).toHaveLength(first);
  });

  it('pours nothing at all before the friendship has a pot to give', () => {
    const store = belowTheLanding(0);
    store.getState().openDraft('N');
    store.getState().chooseDraftCard(store.getState().draftOffer!.cards[0]!.id);
    expect(pourOf(store)).toHaveLength(0);
    expect(teaLandingPour(0)).toBe(0);
  });
});

describe('4.10i — the evening can END with steps in hand (the vacuous gate)', () => {
  it('no longer answers itself: days end both ways', () => {
    // REVIEW_AA §8's third gate is "no day ending with more than ~20% of the
    // budget unspent", and `metrics:review` printed 0.0% / 0.0% as a PASS —
    // by construction, because `simulateDay`'s only exit was an empty ledger.
    // 100.0% of days ended at exactly 0. A gate whose answer is fixed by the
    // loop condition is worse than no gate.
    const days = play(PROFILE_DECENT);
    const reasons = new Set(days.map((d) => d.endReason));
    expect(reasons.has('broke')).toBe(true);
    expect(reasons.has('retired')).toBe(true);
    const retired = days.filter((d) => d.endReason === 'retired');
    expect(retired.length / days.length).toBeGreaterThan(0.01);
    // …and a retired evening really does keep something back.
    expect(medianOf(retired.map((d) => d.stepsLeft))).toBeGreaterThan(0);
    // The broke ones are still the common ending, which is the honest answer
    // to §8: the model's evenings mostly do spend out.
    expect(days.filter((d) => d.endReason === 'broke').length / days.length)
      .toBeGreaterThan(0.5);
  });

  it('describes the tail of an evening, never the shape of one', () => {
    // The appetite clock must sit well above 4.10b's published 10–15 minute
    // median, or it would be the thing making 4.10b pass rather than a
    // description of the evening that got away from her.
    for (const p of [PROFILE_DECENT, PROFILE_SKILLED, PROFILE_GREAT]) {
      expect(p.sessionMinutes, `${p.name} has no appetite`).toBeDefined();
      expect(p.sessionMinutes!)
        .toBeGreaterThanOrEqual(SESSION_WIND_DOWN.afterMinutes * RETIREMENT.minSessionFactor);
      const days = simulateDays(p, 600, 0x9e3);
      expect(medianOf(days.map((d) => d.minutes))).toBeLessThan(p.sessionMinutes!);
    }
  });
});

describe('4.10i — the movement table still says what the docs say', () => {
  it('keeps the bare ascent at the number three files quote', () => {
    // Round 7's lesson, applied to round 23's retune: the ascent sum is quoted
    // in steps.ts, MANOR_DESIGN §4 and tests/economy-simulation.test.ts, and a
    // retune that moved it in one place only survived three rounds. The GROUND
    // FLOOR moved this time and the ascent deliberately did not.
    let bare = 0;
    for (let r = 1; r < MOVE_COST_BY_ROW.length - 1; r++) bare += -moveAt(r);
    expect(bare).toBe(22);
    expect(bare).toBeGreaterThanOrEqual(DAY_ONE_PURSE);
  });
});
