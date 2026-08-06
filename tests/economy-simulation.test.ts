import { describe, expect, it } from 'vitest';
import {
  climbStepCost, deckMixAt, median, medianOf, microShareAt, quantile, quantileOf, share,
  reserveToTop, simulateDay, simulateDays, simulateCampaigns,
  MOVEMENT, SANCTUM_ROW, TIME_TABLE,
  PROFILE_DECENT, PROFILE_GREAT, PROFILE_SKILLED, PROFILE_SKIPPER,
} from '../src/engine/economy/simulate';
import {
  doorLockedAt, fernMorningKeys, ledgerTotal, BASE_DAY_BUDGET, DOOR_LOCKS, KEY_SUPPLY,
  MOVE_COST_BY_ROW, TEA_BY_RANK,
} from '../src/engine/economy/steps';
import { createRng } from '../src/engine/rng';
import { BASE_DECK, deckFor, UTILITY_EFFECTS } from '../src/engine/manor/deck';
import { rollCards } from '../src/engine/manor/drafting';
import { createManor } from '../src/engine/manor/grid';
import { getRoomAdapter, registeredRoomKinds } from '../src/engine/rooms/registry';

/**
 * A2 — AAA 4.10, rewritten for the 2026-08 OWNER PLAYTEST directive:
 * "way too easy — I reached the Forgotten Word on my first day; Blue Prince
 * took me 28 days." The push-your-luck campaign arc was missing, and the day
 * ran ~20 minutes instead of 10–15. Every number the criterion now publishes
 * is verified here over thousands of seeded days and hundreds of seeded
 * multi-week campaigns played through the REAL STEP_TABLE + ledger:
 *
 *   (a) a no-refund day tops out on the middle floors in a couple of minutes;
 *   (b) a decent day is 10–15 MINUTES at the median, p90 ≤ 23;
 *   (c) a skilled player FIRST REACHES the Sanctum row on day 6–10;
 *   (d) she typically WINS THE VOLUME in 14–28 days of daily play.
 *
 * The old `it.fails` tripwire on (b) is gone: it is a passing gate now.
 *
 * Rows are 1-based here (entrance 1 … Sanctum 7), matching the docs.
 */

const DAYS = 3000;
const CAMPAIGNS = 400;
const CAMPAIGN_LENGTH = 45;

const skipper = simulateDays(PROFILE_SKIPPER, DAYS, 0xa2a2);
const decent = simulateDays(PROFILE_DECENT, DAYS, 0xbeef);
const great = simulateDays(PROFILE_GREAT, DAYS, 0xcafe);
const allDays = [...skipper, ...decent, ...great];

const campaigns = simulateCampaigns(PROFILE_SKILLED, CAMPAIGNS, CAMPAIGN_LENGTH, 0x1234);
const reachDays = campaigns.map((c) => c.firstSanctumReachDay);
const winDays = campaigns.map((c) => c.volumeWinDay);
const NEVER = CAMPAIGN_LENGTH + 1;
const reachOrNever = reachDays.map((d) => d ?? NEVER);
const winOrNever = winDays.map((d) => d ?? NEVER);

// ---------------------------------------------------------------------------

describe('the simulation models the REAL post-cull deck (not a remembered one)', () => {
  it('splits puzzle cards micro/anchor off the live adapter registry', () => {
    const micro = BASE_DECK.filter(
      (c) => c.category === 'puzzle' && getRoomAdapter(c.puzzleKind!)?.size === 'micro');
    const anchor = BASE_DECK.filter(
      (c) => c.category === 'puzzle' && getRoomAdapter(c.puzzleKind!)?.size === 'anchor');
    // The owner cull retired the Vestibule/Staircase/Music Room/Pantry; the
    // deck is anchor-heavy now, and the clock below is calibrated for that.
    expect(micro.length).toBeGreaterThanOrEqual(2);
    expect(anchor.length).toBeGreaterThan(micro.length * 2);
  });

  it('counts sudoku (the Counting House) as an ANCHOR-weight room', () => {
    expect(registeredRoomKinds()).toContain('sudoku');
    expect(getRoomAdapter('sudoku')?.size).toBe('anchor');
  });

  it('every registered puzzle kind resolves to a size the clock knows', () => {
    for (const kind of registeredRoomKinds()) {
      expect(['micro', 'anchor']).toContain(getRoomAdapter(kind)!.size);
    }
  });

  it('is anchor-heavy overall and strictly more so as you climb', () => {
    const low = microShareAt(0);
    const mid = microShareAt(4);
    const top = microShareAt(6);
    expect(low).toBeLessThan(0.6);
    expect(mid).toBeLessThan(low);
    expect(top).toBeLessThan(mid);
  });

  it('mirrors A1 drafting weights: violet ramps with row, green fades', () => {
    const bottom = deckMixAt(0);
    const top = deckMixAt(6);
    expect(top.mystery).toBeGreaterThan(bottom.mystery);
    expect(top.utility).toBeLessThan(bottom.utility);
    for (const row of [0, 2, 4, 6]) {
      const mix = deckMixAt(row);
      const total = Object.values(mix).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });
});

describe('4.10 — climbing IS the expense', () => {
  it('prices movement strictly upward by row band', () => {
    for (let r = 1; r < MOVE_COST_BY_ROW.length; r++) {
      expect(MOVE_COST_BY_ROW[r]!).toBeLessThanOrEqual(MOVE_COST_BY_ROW[r - 1]!);
    }
    expect(MOVE_COST_BY_ROW[0]).toBe(-1);
    expect(MOVE_COST_BY_ROW[6]).toBeLessThanOrEqual(-4);
  });

  it('makes a bare, perfect ascent cost MORE than the whole day budget', () => {
    // The headline of the overhaul: the Sanctum row can never be reached on
    // the budget alone — it has to be paid for with tea, snacks and solves.
    const bare = reserveToTop(1, { walkbackPerRow: 0 });
    expect(bare).toBeGreaterThan(BASE_DAY_BUDGET);
    const realistic = reserveToTop(1, PROFILE_SKILLED);
    expect(realistic).toBeGreaterThan(bare);
    expect(realistic).toBeGreaterThan(BASE_DAY_BUDGET * 1.3);
  });

  it('charges more for each storey than the one below it', () => {
    for (let row = 2; row < SANCTUM_ROW; row++) {
      expect(climbStepCost(row, PROFILE_SKILLED))
        .toBeGreaterThan(climbStepCost(row - 1, PROFILE_SKILLED));
    }
  });

  it('locks upper-row doors only, deterministically', () => {
    for (const row of [0, 1, 2, 3]) {
      expect(DOOR_LOCKS.chanceByRow[row]).toBe(0);
      expect(doorLockedAt(1234, `2,${row}`, row)).toBe(false);
    }
    for (const row of [4, 5, 6]) expect(DOOR_LOCKS.chanceByRow[row]!).toBeGreaterThan(0.3);
    // Same door, same day → same answer all day (AAA 4.6: never a surprise).
    for (const key of ['0,5', '2,6', '4,4']) {
      expect(doorLockedAt(99, key, Number(key.split(',')[1]))).toBe(
        doorLockedAt(99, key, Number(key.split(',')[1])));
    }
    // …and across days and cells the roll honours the published chance, so
    // "how locked is the top" is a tuning number, not an accident.
    for (const row of [4, 5, 6]) {
      let locked = 0;
      let n = 0;
      for (let seed = 0; seed < 500; seed++) {
        for (let col = 0; col < 5; col++) {
          n += 1;
          if (doorLockedAt(seed * 2654435761, `${col},${row}`, row)) locked += 1;
        }
      }
      expect(locked / n).toBeCloseTo(DOOR_LOCKS.chanceByRow[row]!, 1);
    }
  });

  it("makes Bramble's tea a campaign arc, not a day-2 windfall", () => {
    expect(TEA_BY_RANK[0]).toBe(0);                       // day 1: a kind cup
    for (let r = 1; r < TEA_BY_RANK.length; r++) {
      expect(TEA_BY_RANK[r]!).toBeGreaterThan(TEA_BY_RANK[r - 1]!);
    }
    // Fully warmed she is worth roughly half a day again — earned over weeks.
    const top = TEA_BY_RANK[TEA_BY_RANK.length - 1]!;
    expect(top).toBeGreaterThanOrEqual(BASE_DAY_BUDGET * 0.45);
    expect(top).toBeLessThanOrEqual(BASE_DAY_BUDGET * 0.75);
  });
});

describe('4.10a — the no-refund day', () => {
  it('tops out on the middle floors, never the Sanctum row', () => {
    const m = median(skipper, (r) => r.maxRow);
    expect(m).toBeGreaterThanOrEqual(3);
    expect(m).toBeLessThanOrEqual(5);
    expect(share(skipper, (r) => r.reachedSanctum)).toBe(0);
  });

  it('is over in a couple of minutes — nothing was played', () => {
    const m = median(skipper, (r) => r.minutes);
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThanOrEqual(5);
  });

  it('always ends by steps, never by the safety cap', () => {
    expect(skipper.every((r) => r.rooms < MOVEMENT.maxRoomsPerDay)).toBe(true);
    expect(skipper.every((r) => r.stepsLeft === 0)).toBe(true);
  });
});

describe('4.10b — the decent day is 10–15 MINUTES (the owner-playtest fix)', () => {
  it('lands its median inside the promised window', () => {
    const m = median(decent, (r) => r.minutes);
    expect(m).toBeGreaterThanOrEqual(10);
    expect(m).toBeLessThanOrEqual(15);
  });

  it('keeps the long-evening tail bounded (p90 ≤ 23 min; measured ~21.5)', () => {
    expect(quantile(decent, 0.9, (r) => r.minutes)).toBeLessThanOrEqual(23);
  });

  it('is a 5–8 room day with a few real puzzles in it', () => {
    const rooms = median(decent, (r) => r.rooms);
    expect(rooms).toBeGreaterThanOrEqual(5);
    expect(rooms).toBeLessThanOrEqual(8);
    expect(median(decent, (r) => r.roomsSolved)).toBeGreaterThanOrEqual(2);
  });

  it('holds the window across independent seeds (not a lucky stream)', () => {
    for (const seed of [0xbeef, 0x1111, 0x7777, 0x51de]) {
      const days = simulateDays(PROFILE_DECENT, 1500, seed);
      const m = median(days, (r) => r.minutes);
      expect(m).toBeGreaterThanOrEqual(10);
      expect(m).toBeLessThanOrEqual(15);
      expect(quantile(days, 0.9, (r) => r.minutes)).toBeLessThanOrEqual(23);
    }
  });

  it('refunds visibly extend the day past the skipper baseline', () => {
    expect(median(decent, (r) => r.refunded)).toBeGreaterThan(10);
    expect(median(decent, (r) => r.maxRow)).toBeGreaterThanOrEqual(
      median(skipper, (r) => r.maxRow));
  });

  it('samples time from a separate stream — the economy never drifts because the clock exists', () => {
    const a = simulateDay(createRng(4242), PROFILE_DECENT);
    const b = simulateDay(createRng(4242), PROFILE_DECENT, createRng(777));
    expect([a.rooms, a.maxRow, a.spent, a.refunded])
      .toEqual([b.rooms, b.maxRow, b.spent, b.refunded]);
    expect(TIME_TABLE.anchorSolve[0]).toBeGreaterThan(TIME_TABLE.microSolve[1]);
  });
});

describe('4.10c — a great single day still only flirts with the Sanctum row', () => {
  it('reaches the upper floors but not the top as a matter of course', () => {
    const m = median(great, (r) => r.maxRow);
    expect(m).toBeGreaterThanOrEqual(5);
    expect(m).toBeLessThanOrEqual(6);
    // A one-off great day is NOT a Sanctum run: the top is a campaign event.
    expect(share(great, (r) => r.reachedSanctum)).toBeLessThan(0.25);
  });

  it('still ends — the economy is not infinite even played sharply', () => {
    expect(great.every((r) => r.rooms < MOVEMENT.maxRoomsPerDay)).toBe(true);
    expect(median(great, (r) => r.rooms)).toBeLessThanOrEqual(20);
  });
});

describe('4.10d — the CAMPAIGN: first Sanctum reach lands on day 6–10', () => {
  it('puts the median first reach inside the published band', () => {
    const m = medianOf(reachOrNever);
    expect(m).toBeGreaterThanOrEqual(6);
    expect(m).toBeLessThanOrEqual(10);
  });

  it('essentially never happens on day 1 (the owner-playtest complaint)', () => {
    expect(share(reachOrNever, (d) => d === 1)).toBeLessThan(0.08);
    expect(share(reachOrNever, (d) => d <= 2)).toBeLessThan(0.15);
  });

  it('does happen for everyone eventually — the arc is a ramp, not a wall', () => {
    expect(share(reachOrNever, (d) => d <= 21)).toBeGreaterThan(0.9);
    expect(share(reachOrNever, (d) => d === NEVER)).toBeLessThan(0.02);
  });

  it('is stable across independent campaign seeds', () => {
    for (const seed of [0x1234, 0x9911, 0x2f2f, 0xabc1]) {
      const runs = simulateCampaigns(PROFILE_SKILLED, 200, CAMPAIGN_LENGTH, seed);
      const m = medianOf(runs.map((c) => c.firstSanctumReachDay ?? NEVER));
      expect(m).toBeGreaterThanOrEqual(6);
      expect(m).toBeLessThanOrEqual(10);
    }
  });

  it('is driven by the META arcs, not by the player suddenly getting better', () => {
    // Same hands every day: the profile's puzzle skill is constant, so the
    // only thing that changed between day 1 and day 10 is the manor's warmth.
    const early = campaigns.flatMap((c) => c.days.slice(0, 3));
    const late = campaigns.flatMap((c) => c.days.slice(14, 21));
    expect(share(early, (d) => d.reachedSanctum))
      .toBeLessThan(share(late, (d) => d.reachedSanctum) / 2);
  });
});

describe('4.10e — the VOLUME is typically won in 14–28 days', () => {
  it('puts the median win inside the published band', () => {
    const m = medianOf(winOrNever);
    expect(m).toBeGreaterThanOrEqual(14);
    expect(m).toBeLessThanOrEqual(28);
  });

  it('needs BOTH gates: knowing the word and reaching the door', () => {
    for (const c of campaigns) {
      if (c.volumeWinDay === null) continue;
      expect(c.deductionDay).not.toBeNull();
      expect(c.volumeWinDay).toBeGreaterThanOrEqual(c.deductionDay!);
      expect(c.firstSanctumReachDay).not.toBeNull();
      expect(c.days[c.volumeWinDay - 1]!.reachedSanctum).toBe(true);
    }
  });

  it('is never a first-week walkover, and never an endless grind', () => {
    expect(share(winOrNever, (d) => d <= 7)).toBeLessThan(0.02);
    expect(share(winOrNever, (d) => d <= 35)).toBeGreaterThan(0.9);
  });

  it('keeps the evening 10–15 minutes for the whole campaign, start to finish', () => {
    // The tea arc must not turn week 3 into hour-long sessions: the extra
    // budget goes into the CLIMB (cheap in minutes), not into more puzzles.
    const early = campaigns.flatMap((c) => c.days.slice(0, 10)).map((d) => d.minutes);
    const late = campaigns.flatMap((c) => c.days.slice(19, 30)).map((d) => d.minutes);
    for (const window of [early, late]) {
      expect(medianOf(window)).toBeGreaterThanOrEqual(10);
      expect(medianOf(window)).toBeLessThanOrEqual(15);
      expect(quantileOf(window, 0.9)).toBeLessThanOrEqual(25);
    }
  });

  it('is deterministic per seed (replayable, AAA 4.8 spirit)', () => {
    const a = simulateCampaigns(PROFILE_SKILLED, 25, 30, 909);
    const b = simulateCampaigns(PROFILE_SKILLED, 25, 30, 909);
    expect(a.map((c) => [c.firstSanctumReachDay, c.deductionDay, c.volumeWinDay]))
      .toEqual(b.map((c) => [c.firstSanctumReachDay, c.deductionDay, c.volumeWinDay]));
  });
});

describe('ledger invariants over every simulated day (AAA 4.9)', () => {
  it('steps never render negative and the accounting identity holds', () => {
    for (const r of allDays) {
      expect(r.stepsLeft).toBeGreaterThanOrEqual(0);
      expect(ledgerTotal(r.ledger)).toBe(r.ledger.budget + r.refunded - r.spent);
      expect(r.stepsLeft).toBe(Math.max(0, ledgerTotal(r.ledger)));
    }
  });

  it('every delta carries a known reason (the audited-table rule)', () => {
    const reasons = new Set(allDays.flatMap((r) => r.ledger.entries.map((e) => e.reason)));
    for (const reason of reasons) {
      expect(['tea', 'move', 'mistake', 'solve', 'perfect', 'snack']).toContain(reason);
    }
  });

  it('every move was priced by the row it walked into', () => {
    for (const r of decent.slice(0, 300)) {
      for (const e of r.ledger.entries) {
        if (e.reason !== 'move') continue;
        const row = Number(e.roomKey!.split(',')[1]);
        expect(e.delta).toBe(MOVE_COST_BY_ROW[row]);
      }
    }
  });

  it('day ends only out on the floor: the final entry is never followed by play', () => {
    for (const r of decent.slice(0, 200)) {
      let total = r.ledger.budget;
      let wentDry = false;
      for (const e of r.ledger.entries) {
        if (wentDry) expect(e.roomKey).toBeDefined();
        total += e.delta;
        wentDry = total <= 0;
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

describe('the padlock is LIVE, and the live key supply can pay for it', () => {
  it('bites: the gate refuses a real climb on a real share of days', () => {
    const early = campaigns.flatMap((c) => c.days.slice(0, 5));
    expect(share(early, (d) => d.lockedOut > 0)).toBeGreaterThan(0.25);
    // …and it is never a wall: keys do arrive, and the top does open up.
    expect(share(campaigns.flatMap((c) => c.days), (d) => d.keysFound > 0))
      .toBeGreaterThan(0.3);
  });

  it('models the live refusal: a door she cannot open charges nothing for the storey above', () => {
    // AAA 4.6, wired in app/slices/manor.ts: a padlocked door with no key does
    // not open and does not charge. So no simulated day may ever contain a
    // move priced for a storey it never actually stood on.
    expect(MOVEMENT.lockoutDetourChance).toBeGreaterThan(0);
    for (const r of [...decent.slice(0, 400), ...great.slice(0, 400)]) {
      const highestPaid = Math.max(
        ...r.ledger.entries
          .filter((e) => e.reason === 'move')
          .map((e) => Number(e.roomKey!.split(',')[1])),
      );
      expect(highestPaid).toBeLessThanOrEqual(r.maxRow - 1);   // rows are 1-based
    }
  });

  it('the DECK supplies at least the key rate the simulation spends', () => {
    // The gate is only a gate if the key exists. Measure the LIVE deck: what a
    // draft offer on the floors she banks on actually contains, versus what
    // the simulated player finds per room she drafts.
    const deck = deckFor([]);
    const liveKeysPerOffer = (row: number) => {
      const N = 1500;
      let keys = 0;
      for (let seed = 0; seed < N; seed++) {
        const cards = rollCards(deck, createManor(seed), { col: (seed % 5) as 0, row },
          { gems: 2, declinedLastDraft: [], drawIndex: 0 });
        keys += Math.max(0, ...cards.map((c) => UTILITY_EFFECTS[c.id]?.keys ?? 0));
      }
      return keys / N;
    };
    const banking = (liveKeysPerOffer(0) + liveKeysPerOffer(1) + liveKeysPerOffer(2)) / 3;

    const simDays = campaigns.flatMap((c) => c.days);
    const simKeysPerRoom =
      simDays.reduce((s, d) => s + d.keysFound, 0) / simDays.reduce((s, d) => s + d.rooms, 0);

    expect(banking).toBeGreaterThan(simKeysPerRoom);
    // …and a padlock still costs a whole key, so the supply is a supply, not a
    // giveaway: a single offer never hands her a full ascent's worth.
    expect(banking).toBeLessThan(
      [4, 5, 6].reduce((s, row) => s + DOOR_LOCKS.chanceByRow[row]!, 0));
  });

  it("Fern's morning key is an arc, not a bypass", () => {
    expect(fernMorningKeys(0)).toBe(0);                      // day 1 is the gate
    const mature = fernMorningKeys(KEY_SUPPLY.fernMorningKeys.length);
    expect(mature).toBeGreaterThan(0);
    // One gate shortened; the ascent still crosses roughly 1.7 of them.
    expect(mature).toBeLessThan(
      [4, 5, 6].reduce((s, row) => s + DOOR_LOCKS.chanceByRow[row]! * DOOR_LOCKS.keyCost, 0));
  });
});
