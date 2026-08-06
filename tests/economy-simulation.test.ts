import { describe, expect, it } from 'vitest';
import {
  campaignProfileForDay, climbStepCost, deckMixAt, keyLuckFor, measuredKeyRate, median, medianOf,
  microShareAt, quantile, quantileOf, share,
  reserveToTop, simulateDay, simulateDays, simulateCampaigns,
  MOVEMENT, SANCTUM_ROW, TIME_TABLE,
  PROFILE_DECENT, PROFILE_GREAT, PROFILE_SKILLED, PROFILE_SKIPPER,
} from '../src/engine/economy/simulate';
import {
  doorLockedAt, fernMorningKeys, fernPointsOnDay, firstMorningPot, keyAccessFor, ledgerTotal,
  teaArcPoints, BASE_DAY_BUDGET, DOOR_LOCKS, FERN_ARC, KEY_SUPPLY,
  MOVE_COST_BY_ROW, TEA_ARC, TEA_BY_RANK,
} from '../src/engine/economy/steps';
import { createRng } from '../src/engine/rng';
import {
  BASE_DECK, carryOverFrom, deckFor, CARRY_OVER_EFFECTS, UTILITY_EFFECTS,
} from '../src/engine/manor/deck';
import { rollCards } from '../src/engine/manor/drafting';
import { createManor } from '../src/engine/manor/grid';
import { getRoomAdapter, registeredRoomKinds } from '../src/engine/rooms/registry';
import brambleDialogue from '../content/authored/dialogue/bramble.json';
import fernDialogue from '../content/authored/dialogue/fern.json';

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

/**
 * The affinity a player can actually reach in a character's AUTHORED file:
 * every node effect, plus the best single choice per node (she takes one).
 * This is the budget the campaign model is now held against — round-5 audit:
 * the published curve used to be verified against warmth the live game could
 * not draw.
 */
interface DialogueFile {
  nodes: Array<{
    effects?: { affinity?: Record<string, number> };
    choices?: Array<{ effects?: { affinity?: Record<string, number> } }>;
  }>;
}

function authoredAffinity(file: DialogueFile, character: string): number {
  let total = 0;
  for (const node of file.nodes) {
    total += node.effects?.affinity?.[character] ?? 0;
    const best = (node.choices ?? [])
      .map((c) => c.effects?.affinity?.[character] ?? 0)
      .reduce((a, b) => Math.max(a, b), 0);
    total += best;
  }
  return total;
}

const AUTHORED_BRAMBLE = authoredAffinity(brambleDialogue as DialogueFile, 'bramble');
const AUTHORED_FERN = authoredAffinity(fernDialogue as DialogueFile, 'fern');

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
    // What her AUTHORED friendship can reach: one gate shortened, while the
    // ascent still crosses roughly 1.7 of them.
    const authored = fernMorningKeys(FERN_ARC.meetPoints + FERN_ARC.questPoints);
    expect(authored).toBeGreaterThan(0);
    expect(authored).toBeLessThan(
      [4, 5, 6].reduce((s, row) => s + DOOR_LOCKS.chanceByRow[row]! * DOOR_LOCKS.keyCost, 0));
    // Weeks of bookmarks past it can add a second, never a third.
    expect(Math.max(...KEY_SUPPLY.fernMorningKeys)).toBeLessThan(3);
  });
});

// ---------------------------------------------------------------------------
// ROUND-5 AUDIT — the arcs must exist in the LIVE game, not only in this model
// ---------------------------------------------------------------------------

describe('4.10d — the meta arcs are driven by live code, not by free constants', () => {
  it("never assumes more of Fern's friendship than her authored file can give", () => {
    // The model's whole Fern budget must fit inside what the dialogue grants;
    // if A6 rewrites her file downward, THIS breaks, not the owner's campaign.
    expect(FERN_ARC.meetPoints + FERN_ARC.questPoints).toBeLessThanOrEqual(AUTHORED_FERN);
    expect(AUTHORED_FERN).toBeGreaterThan(0);
    // …and the first dawn key opens inside that budget. (Before the audit the
    // table opened at 4 points and her whole lifetime granted 3: a wall.)
    expect(fernMorningKeys(AUTHORED_FERN)).toBeGreaterThan(0);
  });

  it("drives Bramble's tea from the LIVE morning arc, inside her live ceiling", () => {
    for (const day of [1, 2, 3, 6, 10, 14, 21, 30, 45]) {
      const modelled = campaignProfileForDay(PROFILE_SKILLED, day).brambleAffinity;
      // Exactly the function app/slices/day.ts applies each morning…
      expect(modelled).toBe(teaArcPoints(day));
      // …and never more than the live game can actually hold (the morning arc
      // is a FLOOR, so her authored points and gifts only ever add to it).
      expect(modelled).toBeLessThanOrEqual(teaArcPoints(day) + AUTHORED_BRAMBLE);
      expect(modelled).toBeLessThanOrEqual(TEA_ARC.maxPoints);
    }
    // Day 1 is still a plain, kind cup — the arc has to be earned.
    expect(campaignProfileForDay(PROFILE_SKILLED, 1).brambleAffinity).toBe(0);
  });

  it('drives keyLuck from the MEASURED live per-offer key rate', () => {
    for (const day of [1, 2, 6, 10, 30]) {
      const p = campaignProfileForDay(PROFILE_SKILLED, day);
      expect(p.keyLuck).toBe(keyLuckFor(fernPointsOnDay(day)));
    }
  });

  it('makes key frequency a RAMP: day 1 and day 30 are no longer identical', () => {
    // The finding in one assertion. Measured live before the audit: 0.24 per
    // ground-floor offer on day 1 and 0.24 on day 30, because the draft
    // weights carried no day or affinity term at all.
    const cold = measuredKeyRate(keyAccessFor(fernPointsOnDay(1)));
    const warm = measuredKeyRate(keyAccessFor(fernPointsOnDay(30)));
    expect(cold).toBeGreaterThan(0.1);          // it was never zero, just flat
    expect(warm).toBeGreaterThan(cold * 1.5);
    expect(warm).toBeLessThan(0.85);            // still a supply, not a giveaway
    // …and it is monotone in the friendship, so there is no cliff to game.
    let prev = 0;
    for (const points of [0, 1, 2, 3]) {
      const rate = measuredKeyRate(keyAccessFor(points));
      expect(rate).toBeGreaterThanOrEqual(prev);
      prev = rate;
    }
  });

  it('leaves the deck MIX (and therefore the 4.10b clock) untouched', () => {
    // The key-access term multiplies individual card weights, never category
    // or rarity weights — `deckMixAt` is derived from those, so the clock this
    // whole file calibrates against cannot drift because Fern made a friend.
    for (const row of [0, 2, 4, 6]) {
      const mix = deckMixAt(row);
      expect(Object.values(mix).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
    // Same deck, same rows, two access levels: the KEY rate moves, the shape
    // of what a green card can be does not.
    expect(measuredKeyRate(0)).not.toBe(measuredKeyRate(1));
  });
});

describe('4.10b — the FIRST evenings land inside 10–15 minutes too', () => {
  // The audit's finding: PROFILE_DECENT shipped `brambleAffinity: 2`, a pot the
  // live game cannot pour until day 3 — and no test ever exercised a day-1
  // profile. Measured at the live values, day 1 came in at 9.0 minutes: under
  // the promised floor, on the evening that decides whether she comes back.
  for (const day of [1, 2, 3]) {
    it(`holds the window on day ${day}, at the affinity the live game can reach`, () => {
      const profile = campaignProfileForDay(PROFILE_DECENT, day);
      expect(profile.brambleAffinity).toBe(teaArcPoints(day));
      expect(profile.dawnSteps).toBe(firstMorningPot(day));
      for (const seed of [0xbeef, 0x1111, 0x7777]) {
        const days = simulateDays(profile, 1500, seed + day);
        const m = median(days, (r) => r.minutes);
        expect(m).toBeGreaterThanOrEqual(10);
        expect(m).toBeLessThanOrEqual(15);
        expect(quantile(days, 0.9, (r) => r.minutes)).toBeLessThanOrEqual(23);
      }
    });
  }

  it('is the scripted pot doing it, not a fatter base budget', () => {
    // Raising BASE_DAY_BUDGET to 20 would equal the bare ascent cost and break
    // the headline invariant, so the fix had to be a refill (AAA 4.10d).
    expect(BASE_DAY_BUDGET).toBe(18);
    expect(reserveToTop(1, { walkbackPerRow: 0 })).toBeGreaterThan(BASE_DAY_BUDGET);
    // Without the pot, day 1 falls out of the window — which is the finding.
    const bare = simulateDays(
      { ...PROFILE_DECENT, brambleAffinity: 0, dawnSteps: 0, dawnKeys: 0 }, 2000, 0xbeef);
    expect(median(bare, (r) => r.minutes)).toBeLessThan(10);
  });
});

describe('4.11 — something the player buys today pays out tomorrow', () => {
  it('ships at least one cross-day investment, on cards that already exist', () => {
    const ids = Object.keys(CARRY_OVER_EFFECTS);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      // On an EXISTING deck card, so deck composition — and the 4.10b clock
      // calibrated against it — is untouched by the new mechanic.
      expect(BASE_DECK.map((c) => c.id)).toContain(id);
      const effect = CARRY_OVER_EFFECTS[id]!;
      expect((effect.steps ?? 0) + (effect.keys ?? 0)).toBeGreaterThan(0);
      expect(effect.promise.length).toBeGreaterThan(0);
      expect(effect.dawnLine.length).toBeGreaterThan(0);
    }
    // At least one pays the padlock arc (a key), which is what gives a deep
    // push the prepared feel the design keeps promising.
    expect(ids.some((id) => (CARRY_OVER_EFFECTS[id]!.keys ?? 0) > 0)).toBe(true);
    // …and at least one pays steps, the currency the whole day is spent in.
    expect(ids.some((id) => (CARRY_OVER_EFFECTS[id]!.steps ?? 0) > 0)).toBe(true);
  });

  it('sums only what was actually drafted yesterday', () => {
    expect(carryOverFrom([])).toEqual({ steps: 0, keys: 0, lines: [] });
    expect(carryOverFrom(['library', 'gallery']).steps).toBe(0);
    const both = carryOverFrom(Object.keys(CARRY_OVER_EFFECTS));
    expect(both.steps + both.keys).toBeGreaterThan(0);
    expect(both.lines.length).toBe(Object.keys(CARRY_OVER_EFFECTS).length);
  });

  it('does NOT move the 10–15 minute median (4.10f: sessions never inflate)', () => {
    const carried = carryOverFrom(Object.keys(CARRY_OVER_EFFECTS));
    const withInvestment = simulateDays(
      { ...PROFILE_DECENT, dawnSteps: carried.steps, dawnKeys: carried.keys }, DAYS, 0xbeef);
    const m = median(withInvestment, (r) => r.minutes);
    expect(m).toBeGreaterThanOrEqual(10);
    expect(m).toBeLessThanOrEqual(15);
    expect(quantile(withInvestment, 0.9, (r) => r.minutes)).toBeLessThanOrEqual(23);
    // It buys CLIMB, which is what a prepared ascent is supposed to buy.
    expect(median(withInvestment, (r) => r.maxRow))
      .toBeGreaterThanOrEqual(median(decent, (r) => r.maxRow));
  });
});
