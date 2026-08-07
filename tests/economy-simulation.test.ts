import { describe, expect, it } from 'vitest';
import {
  campaignProfileForDay, climbStepCost, deckMixAt, keyLuckFor, landingDraft, measuredKeyRate,
  median, medianOf, microShareAt, quantile, quantileOf, share, studySolveShareAt,
  reserveToTop, simulateDay, simulateDays, simulateCampaigns,
  KNOWLEDGE, LANDING_ENTRY_DIR, MOVEMENT, SANCTUM_LANDING_ROW, TIME_TABLE,
  PROFILE_DECENT, PROFILE_GREAT, PROFILE_SKILLED, PROFILE_SKIPPER,
} from '../src/engine/economy/simulate';
import {
  doorLockedAt, fernMorningKeys, fernPointsOnDay, firstMorningPot, keyAccessFor, ledgerTotal,
  sanctumMercyArmed, sanctumPlanWarmth, solveKeys, surveyEveningsIn, teaArcPoints, teaBonus,
  BASE_DAY_BUDGET, DOOR_LOCKS, FERN_ARC, KEY_SUPPLY,
  MOVE_COST_BY_ROW, SANCTUM_ARC, TEA_ARC, TEA_BY_POINTS,
} from '../src/engine/economy/steps';
import { createRng } from '../src/engine/rng';
import {
  BASE_DECK, carryOverFrom, deckFor, CARRY_OVER_EFFECTS, UTILITY_EFFECTS,
} from '../src/engine/manor/deck';
import { categoryWeight, rollCards, RARITY_WEIGHTS } from '../src/engine/manor/drafting';
import {
  atSanctumDoor, cardOpensOntoSanctum, cellKey, createManor, opensOntoSanctum, placeRoom,
  resolveDoors, rowTier, sanctumStanding, SANCTUM_DOOR_CELL, SANCTUM_DOOR_KEY,
} from '../src/engine/manor/grid';
import { SANCTUM_CELL } from '../src/engine/types';
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
 *   (c) a skilled player FIRST REACHES the Sanctum LANDING on day 6–10;
 *   (d) she typically WINS THE VOLUME in 14–28 days of daily play.
 *
 * The old `it.fails` tripwire on (b) is gone: it is a passing gate now.
 *
 * Rows are 1-based here: entrance 1 … THE SANCTUM LANDING 6, the cell the word
 * is spoken from. (Round 7: the milestone used to be row 7, the sealed
 * Sanctum's own cell, which is never drafted and never entered.)
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

/**
 * These suites play thousands of seeded days and hundreds of seeded campaigns
 * through the real ledger; several of them run for a second or two on an idle
 * box and considerably longer when the dev machine is running other suites (or
 * a browser) beside them. Vitest's 5s default turned that into a flake, so the
 * heavy cases carry their own budget — the assertions are deterministic per
 * seed, so a slow box must not read as a tuning regression.
 */
const HEAVY_MS = 60_000;

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

/**
 * ═══ ROUND-12 — THE SECOND MODELLED PLAYER ═══════════════════════════════
 *
 * Everything above this line is `PROFILE_SKILLED`, and until round 12 so was
 * EVERY campaign assertion in this file. `PROFILE_DECENT` — the profile whose
 * own docstring calls it "the MEDIAN evening, the one 4.10b clocks", i.e. the
 * owner — played thousands of single days here and never once played a
 * campaign, so AAA 4.10d/4.10e/4.10g published unqualified medians that no
 * critic could pass or fail for the person they were written for. Measured
 * when someone finally ran it: first landing at median day 18–21 (10–14% never
 * inside 45 days), the volume won at median day 33–34, and **25% of campaigns
 * unfinished after 45 evenings** against a published ">90% by day 35".
 *
 * That is the exact shape of the round-6 and round-11 escapes this bar keeps
 * recording — a published number verified against a player the game is not
 * describing. Two things fixed it, and the second is the one that lasts:
 *   1. `TEA_BY_POINTS` lifted at its top four rungs (engine/economy/steps.ts,
 *      which carries the four rejected levers and why), narrowing the gap
 *      without moving one of the skilled player's published numbers;
 *   2. THIS FIXTURE, and the block below it. Both players are measured, both
 *      bands are published in AAA 4.10e, and a future retune that fixes one
 *      profile by breaking the other now fails a test instead of shipping.
 *
 * The counts are smaller than the skilled fixture's on purpose: these are
 * 45-day campaigns played through the real ledger, and the bands below are
 * wide enough that 250 campaigns resolve them without a coin-flip.
 */
const DECENT_CAMPAIGNS = 250;
const decentCampaigns =
  simulateCampaigns(PROFILE_DECENT, DECENT_CAMPAIGNS, CAMPAIGN_LENGTH, 0x1234);
const decentDays = decentCampaigns.flatMap((c) => c.days);
const decentReach = decentCampaigns.map((c) => c.firstSanctumReachDay ?? NEVER);
const decentWin = decentCampaigns.map((c) => c.volumeWinDay ?? NEVER);
const decentDeduce = decentCampaigns.map((c) => c.deductionDay ?? NEVER);

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

describe('the milestone is the LIVE door, not a storey nobody enters (round 7)', () => {
  it('measures the climb to the cell the word is actually spoken from', () => {
    // THE ROUND-7 BLOCKER IN ONE ASSERTION. `SANCTUM_ROW` was 7 — the sealed
    // Sanctum's own row, which is pre-placed at manor build, never drafted and
    // never walked into. Everything 4.10c/d/e published was therefore verified
    // against a storey the game never asks the player to enter, while the
    // storey it does ask for (the landing, 0-based row 5) cost 15 bare steps:
    // under the 18-step budget. The milestone is now the landing itself.
    expect(SANCTUM_LANDING_ROW).toBe(SANCTUM_DOOR_CELL.row + 1);   // 1-based
    expect(SANCTUM_LANDING_ROW).toBeLessThan(SANCTUM_CELL.row + 1);
    expect(SANCTUM_DOOR_KEY).toBe(cellKey(SANCTUM_DOOR_CELL));
  });

  it('holds the headline invariant for THAT ascent, not the one above it', () => {
    // The clause the finding proved false: a bare, perfectly efficient ascent
    // to the door must cost more than the whole base budget, so the top is
    // always bought with refunds. Measured at the live landing: 21 > 18.
    const bareToDoor = reserveToTop(1, { walkbackPerRow: 0 });
    expect(bareToDoor).toBeGreaterThan(BASE_DAY_BUDGET);
    // …and it is not scraping past it on a rounding error.
    expect(bareToDoor).toBeGreaterThanOrEqual(BASE_DAY_BUDGET + 2);
    // Day 1's whole purse — the budget plus the scripted welcome pot, with no
    // tea at all at 0 affinity — is at best exactly the price of the bare
    // walk: arriving would mean spending the entire first day on stairs, with
    // nothing left for a card and no key for either padlocked storey.
    expect(bareToDoor).toBeGreaterThanOrEqual(BASE_DAY_BUDGET + firstMorningPot(1));
  });

  it('never claims a reach the live predicate would refuse', () => {
    // The sim's `reachedSanctum` and the game's `atSanctumDoor` must mean the
    // same thing. A fresh manor puts her at the entrance: not at the door, on
    // any day, however many fragments she has filed.
    const manor = createManor(4242);
    expect(atSanctumDoor(manor)).toBe(false);
    expect(atSanctumDoor(null)).toBe(false);
    // Standing on the landing cell is necessary but NOT sufficient: the room
    // she drafted there has to have drawn the north door.
    expect(atSanctumDoor({ ...manor, playerCell: { ...SANCTUM_DOOR_CELL } })).toBe(false);
    // And no simulated day ever tops out above the landing.
    for (const r of [...decent, ...great]) expect(r.maxRow).toBeLessThanOrEqual(SANCTUM_LANDING_ROW);
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
    // The headline of the overhaul: the Sanctum landing can never be reached
    // on the budget alone — it has to be paid for with tea, snacks and solves.
    const bare = reserveToTop(1, { walkbackPerRow: 0 });
    expect(bare).toBeGreaterThan(BASE_DAY_BUDGET);
    const realistic = reserveToTop(1, PROFILE_SKILLED);
    expect(realistic).toBeGreaterThan(bare);
    expect(realistic).toBeGreaterThan(BASE_DAY_BUDGET * 1.3);
  });

  it('charges more for each storey than the one below it', () => {
    for (let row = 2; row < SANCTUM_LANDING_ROW; row++) {
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
    expect(TEA_BY_POINTS[0]).toBe(0);                       // day 1: a kind cup
    for (let r = 1; r < TEA_BY_POINTS.length; r++) {
      expect(TEA_BY_POINTS[r]!).toBeGreaterThan(TEA_BY_POINTS[r - 1]!);
    }
    // Fully warmed she is worth roughly half a day again — earned over weeks.
    const top = TEA_BY_POINTS[TEA_BY_POINTS.length - 1]!;
    expect(top).toBeGreaterThanOrEqual(BASE_DAY_BUDGET * 0.45);
    expect(top).toBeLessThanOrEqual(BASE_DAY_BUDGET * 0.75);
  });
});

describe('4.10a — the no-refund day', () => {
  it('tops out on the middle floors, never the Sanctum landing', () => {
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
  }, HEAVY_MS);

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

describe('4.10c — a great single day still only flirts with the Sanctum landing', () => {
  it('reaches the upper floors but not the top as a matter of course', () => {
    const m = median(great, (r) => r.maxRow);
    expect(m).toBeGreaterThanOrEqual(5);
    expect(m).toBeLessThanOrEqual(6);
    // A one-off great day is NOT a Sanctum run: the top is a campaign event.
    // BOTH milestones are pinned since round 13, because 4.10c's clause is
    // about the LANDING (the storey) and 4.10d/e's gate is the DOOR, and
    // conflating them is the defect this round closed.
    expect(share(great, (r) => r.reachedLanding)).toBeLessThan(0.25);
    expect(share(great, (r) => r.reachedSanctum))
      .toBeLessThanOrEqual(share(great, (r) => r.reachedLanding));
  });

  it('still ends — the economy is not infinite even played sharply', () => {
    expect(great.every((r) => r.rooms < MOVEMENT.maxRoomsPerDay)).toBe(true);
    expect(median(great, (r) => r.rooms)).toBeLessThanOrEqual(20);
  });
});

describe('4.10d — the SKILLED player first reaches the Sanctum landing on day 6–10', () => {
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
  }, HEAVY_MS);

  it('is driven by the META arcs, not by the player suddenly getting better', () => {
    // Same hands every day: the profile's puzzle skill is constant, so the
    // only thing that changed between day 1 and day 10 is the manor's warmth.
    const early = campaigns.flatMap((c) => c.days.slice(0, 3));
    const late = campaigns.flatMap((c) => c.days.slice(14, 21));
    expect(share(early, (d) => d.reachedSanctum))
      .toBeLessThan(share(late, (d) => d.reachedSanctum) / 2);
  });
});

/**
 * ═══ ROUND 19 — THE BAND MOVED, AND THE ARITHMETIC IS WHY ═════════════════
 *
 * 4.10e published "14–28 days" from round 6 to round 18. That band was
 * measured on a campaign whose length was set by ACCESS: 15 of volume 1's 17
 * fragments were behind violet draws, a `rarity: 'rare'` tier-3 room or a
 * character, and the Sanctum door itself was a nightly lottery the model put
 * three weeks out. REVIEW_AA §5.1 and §5.2 deleted both walls on purpose —
 * the spine now routes through ordinary word-game solves, and the speaking
 * tube hears a word from the Entrance Hall on day 1 — and what is left is a
 * campaign whose length is set by KNOWLEDGE, i.e. by how many pages the volume
 * authors and how fast an evening can read them.
 *
 * That makes the horizon arithmetic rather than tuning:
 *
 *     volume 1 authors 17 fragments
 *     the deduction floor is 15 of them (engine/volume.FRAGMENTS_TO_DEDUCE,
 *       re-derived off the reveal order: the engravings sit at revealOrder
 *       2/5/8/11/14/16, so five of six — the LACUNA/LAGUNA tie — is in hand at
 *       about the fourteenth page and the tie-breaker at the sixteenth)
 *     REVIEW_AA §5.1's own success metric is ">= 1 legible page on >= 90% of
 *       the first 14 days", i.e. AT LEAST one a night
 *     => 15 / 1 per night = a FIFTEEN-evening deduction, and that is the
 *        SLOWEST campaign the review's own target permits.
 *
 * Measured, the skilled player reads 1.54 legible pages an evening and the
 * median player 1.12, so they deduce at day 9 and day 15 and win at day 11 and
 * day 18. There is no lever inside the shipped content that restores a 28-day
 * median: capping the drip at exactly one page a night (simulated) pushes both
 * medians to 16/19 but collapses the two profiles onto each other and turns
 * the mystery into a calendar — skill stops buying knowledge at all, which
 * contradicts the round-10 owner directive ("skill, not just persistence").
 * A 28-evening median needs roughly 28 AUTHORED PAGES. That is a content
 * commission, and `engine/volume.ts` already records it under
 * `PITY_DROUGHT_DAYS` ("Volume 1 needs more authored pages, not a smaller
 * drought"). It is the open item, not a number to tune around.
 *
 * So the band is re-derived from what the shipped volume supports and both
 * docs move with it (AAA 4.10e, MANOR_DESIGN §4). The clauses that were about
 * SHAPE rather than about the old access lottery are untouched: both gates are
 * still required, the first week is still not a walkover, the evening is still
 * 10–15 minutes, and the median player is still measured beside him and still
 * slower on every one of the five milestones.
 *
 * ═══ ROUND 21 — THE COMMISSION LANDED, SO THE BAND MOVES BACK ═════════════
 *
 * The open item above was *"a 28-evening median needs roughly 28 AUTHORED
 * PAGES"*. Volume 1 now authors **28** — 10 definition lines, 10 engravings,
 * 8 testimonies — and the SAME arithmetic runs the other way:
 *
 *     volume 1 authors 28 fragments
 *     the deduction floor is 25 of them (engine/volume.FRAGMENTS_TO_DEDUCE,
 *       re-derived off the reveal order by the identical rule: the ten
 *       engravings sit at revealOrder 2/5/8/11/14/17/20/22/24/26, the chain
 *       runs 171755 → 15232 → 6575 → 208 → 146 → 56 → 11 → 5 → 3 → 2 → 1, so
 *       the LACUNA/LAGUNA tie is in hand at the twenty-fourth page and the
 *       tie-breaker at the twenty-sixth)
 *     REVIEW_AA §5.1's metric is still ">= 1 legible page a night"
 *     => 25 / 1 per night = a TWENTY-FIVE-evening deduction at the slow end,
 *        and the four-week horizon is a content fact again rather than a knob.
 *
 * Nothing was tuned to get there. The routing moved with the pages (the lintel
 * channel stocks 16 of the 28 and the Study 3, against 7 and 2 before), and
 * both instruments moved together: `npm run metrics:review` measures the
 * median player's legible-day share over her first fortnight at 95.9% in the
 * campaign model (was 80.5%) and 0.896 through the drip harness over the real
 * authored content (was 0.648) — i.e. §5.1's own success metric is met at the
 * same time as the horizon is restored, which is exactly what the extra pages
 * were for. Measured now: he deduces at day 14 and wins at 15 (p10 13, p90 18,
 * 15 on all four seeds); she deduces at 18 and wins at 22 (p10 17, p90 29,
 * 21–22 across seeds, 89.5% inside 28 evenings).
 *
 * Bands re-published from that measurement: his 8–16 → **12–20**, hers 14–24 →
 * **18–28**, her deduction 10–20 → **14–24**. The two profiles are further
 * apart than they were, not closer, so skill still buys knowledge.
 */
describe('4.10e — the SKILLED player wins the VOLUME in 12–20 days', () => {
  it('puts the median win inside the published band', () => {
    // Measured 15 on every one of the four campaign seeds (p10 13, p90 18).
    const m = medianOf(winOrNever);
    expect(m, `median win day ${m}`).toBeGreaterThanOrEqual(12);
    expect(m).toBeLessThanOrEqual(20);
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
    // THE WALKOVER CLAUSE IS THE OWNER'S, NOT THE REVIEW'S, AND IT SURVIVES.
    // A first-week win needs 15 legible pages inside 7 evenings — better than
    // two a night, sustained, from day 1. Measured 0.5–2.0% across the four
    // campaign seeds (2.0% here), against a pre-round-17 0%. The published
    // number moves 2% → 3% because the band above moved and this is the same
    // tail measured against a shorter campaign; it is still the answer to the
    // owner playtest that opened 4.10 ("I reached the Forgotten Word on my
    // FIRST DAY"), and day 1 remains ~0.
    expect(share(winOrNever, (d) => d <= 7)).toBeLessThan(0.03);
    expect(share(winOrNever, (d) => d === 1)).toBe(0);
    // The grind end, re-pinned at the tighter horizon the shorter band implies
    // (measured 100% by day 28, 91% by day 14).
    expect(share(winOrNever, (d) => d <= 28)).toBeGreaterThan(0.99);
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

// ---------------------------------------------------------------------------
// ROUND-12 — 4.10d/e FOR THE OTHER PLAYER: THE MEDIAN EVENING'S CAMPAIGN
// ---------------------------------------------------------------------------

/**
 * THE ROUND-12 BLOCKER, AS A SUITE. Every band above is `PROFILE_SKILLED`'s,
 * and until this block existed that was the *only* campaign the model had ever
 * played — while 4.10b's whole 10–15 minute promise is measured on
 * `PROFILE_DECENT`, and AAA 4.10e's "typically won in 14–28 days" named no
 * player at all. Two archetypes, one published number, and no way for a critic
 * to say which one it was about.
 *
 * The two arcs are genuinely different and the doc now says so, because they
 * cannot be collapsed: the median player is modelled as more cautious about the
 * stairs (boldness 1.3 vs 1.0), less efficient at finding frontier doors
 * (walkbackPerRow 0.58 vs 0.36) and less inclined to push a storey at all
 * (pushBias 0.62 vs 0.78). Every lever that pulled her median into 14–28 also
 * put the skilled player at the Sanctum door on day 1 in 17–20% of campaigns,
 * against a published <8% that is itself the owner-playtest blocker this whole
 * overhaul exists to answer. So the honest fix is two published bands and two
 * measured profiles, not one band and one player.
 *
 * These bands are the median player's, and they are deliberately wide — the
 * point is not to pin a decimal, it is that a retune which fixes the skilled
 * arc by abandoning the owner's now FAILS HERE instead of shipping.
 *
 * ROUND 19 — HER TWO KNOWLEDGE BANDS MOVED; HER TWO ACCESS BANDS DID NOT.
 * First landing (12–20) and the day-1/day-2 floor are untouched, because §5.2
 * did not make the climb cheaper — it stopped the climb being the only mouth
 * in the house. What moved is deduction (16–24 → 10–20) and the win (26–34 →
 * 14–24), and the reason is measured rather than argued: round 13 found the
 * gap between HER knowing the word and being allowed to say it running median
 * 9 evenings, p90 25, max 47, and the tube pays that back in full. See the
 * arithmetic note above the skilled block for why no band here can be restored
 * by tuning: it takes authored pages.
 */
describe('4.10d/e — the MEDIAN player has her own published band, and it is measured', () => {
  it('is a real campaign, not a wall: she does reach the landing', () => {
    // Measured over 4 seeds after the round-12 tea retune: median day 16–17,
    // 3.3–6.0% never inside 45 days. (Before it: 18–21, and 10–14% never.)
    const m = medianOf(decentReach);
    expect(m, `median first reach day ${m}`).toBeGreaterThanOrEqual(12);
    expect(m).toBeLessThanOrEqual(20);
    expect(share(decentReach, (d) => d === NEVER)).toBeLessThan(0.1);
    // …and she is slower than the skilled player, which is the whole reason
    // the two bands exist. If this ever inverts, one of the profiles has
    // stopped describing the player it is named for.
    expect(m).toBeGreaterThan(medianOf(reachOrNever));
  });

  it('still cannot stumble into the top on day 1 (4.10d, for her too)', () => {
    expect(share(decentReach, (d) => d === 1)).toBeLessThan(0.02);
    expect(share(decentReach, (d) => d <= 2)).toBeLessThan(0.04);
  });

  it('wins the volume in 18–28 days at the median — the published second band', () => {
    // ROUND 19 — 26–34 → 14–24. HER BAND WAS THE ONE MADE ALMOST ENTIRELY OF
    // THE ACCESS LOTTERY, so §5.2 moved it furthest. Round 13 measured the gap
    // between her knowing the word and being allowed to say it at median 9
    // evenings, p90 25, max 47; the speaking tube pays that whole gap back.
    // ROUND 21 — 14–24 → 18–28, and this time it is the CONTENT that moved:
    // the volume authors 28 pages against 17 and the deduction floor is 25
    // against 15 (see the arithmetic block above the skilled describe). Her
    // walk is untouched; she simply has a fortnight more of him to read.
    // Measured now: deduction median 18, win median 21–22 across the four
    // campaign seeds (p10 17, p90 29), 89.5% inside 28 evenings, 0.4% inside
    // a fortnight.
    const m = medianOf(decentWin);
    expect(m, `median win day ${m}`).toBeGreaterThanOrEqual(18);
    expect(m).toBeLessThanOrEqual(28);
    // Never a first-week walkover for her either (measured: still exactly 0).
    expect(share(decentWin, (d) => d <= 7)).toBeLessThan(0.02);
  });

  it('finishes: >80% inside 45 evenings, and the tail is not a cliff', () => {
    // THE CLAUSE THE FINDING WAS REALLY ABOUT. Before round 12 this read 74–78%
    // — i.e. one median-player campaign in four was still unfinished after six
    // weeks of daily play, while the doc promised >90% by day 35 with no
    // qualifier. Her real curve is published now, and it has to stay a curve.
    expect(share(decentWin, (d) => d <= 45)).toBeGreaterThan(0.8);
    expect(share(decentWin, (d) => d <= 35)).toBeGreaterThan(0.6);
    expect(share(decentWin, (d) => d <= 28)).toBeGreaterThan(0.35);
    // The skilled player's ">90% by day 35" is HERS, not a house promise —
    // pinned as an inequality so nobody re-reads 4.10e as one number again.
    expect(share(winOrNever, (d) => d <= 35))
      .toBeGreaterThan(share(decentWin, (d) => d <= 35));
  });

  it('needs BOTH gates for her too, and never learns past the volume', () => {
    for (const c of decentCampaigns) {
      if (c.volumeWinDay === null) continue;
      expect(c.deductionDay).not.toBeNull();
      expect(c.volumeWinDay).toBeGreaterThanOrEqual(c.deductionDay!);
      expect(c.days[c.volumeWinDay - 1]!.reachedSanctum).toBe(true);
      expect(c.fragments).toBeLessThanOrEqual(c.fragmentsFiled);
      expect(c.fragmentsFiled).toBeLessThanOrEqual(KNOWLEDGE.volumeFragments);
    }
    // Her knowledge gate lags the skilled player's for a mechanical reason,
    // not a random one — but ROUND 19 CHANGED WHICH MECHANISM. This used to
    // read "the Study's channel is a rows-5–6 card, so a player who tops out
    // lower learns slower", and §5.1 deleted that: the Study now stocks 2 of
    // the 17 fragments and the lintel — every ordinary word game, ground floor
    // included — stocks 7. What still lags her is the SEAL: `decipherYield`
    // scales with tier and violet share is a function of row, so she makes out
    // 0.24 pages a night against his 0.70, and files 1.12 legible pages an
    // evening against his 1.54. The gap is real, smaller, and now earned by
    // solving rather than by owning the deck's rarest room.
    // Band re-derived with it: 16–24 → 10–20 (measured 14–15 across seeds,
    // p10 11, p90 18).
    // ROUND 21: 10–20 → 14–24. Same mechanism, more pages — the deduction
    // floor moved 15 → 25 with the volume's page count and her reading rate
    // did not, so the curve slid right by about four evenings. Measured 18.
    const m = medianOf(decentDeduce);
    expect(m, `median deduction day ${m}`).toBeGreaterThanOrEqual(14);
    expect(m).toBeLessThanOrEqual(24);
    expect(m).toBeGreaterThan(medianOf(campaigns.map((c) => c.deductionDay ?? NEVER)));
  });

  it('keeps HER evening 10–15 minutes for the whole campaign (4.10f)', () => {
    // 4.10f is the one 4.10 clause that was always about this player, and the
    // retune had to leave it exactly where it was. Measured: 11.5 early,
    // 12.8–13.1 late, p90 ≤ 21.9.
    const early = decentCampaigns.flatMap((c) => c.days.slice(0, 10)).map((d) => d.minutes);
    const late = decentCampaigns.flatMap((c) => c.days.slice(19, 30)).map((d) => d.minutes);
    for (const window of [early, late]) {
      expect(medianOf(window)).toBeGreaterThanOrEqual(10);
      expect(medianOf(window)).toBeLessThanOrEqual(15);
      expect(quantileOf(window, 0.9)).toBeLessThanOrEqual(25);
    }
  });

  it('holds both medians across independent campaign seeds', () => {
    for (const seed of [0x1234, 0x9911, 0x2f2f, 0xabc1]) {
      const runs = simulateCampaigns(PROFILE_DECENT, 150, CAMPAIGN_LENGTH, seed);
      const reach = medianOf(runs.map((c) => c.firstSanctumReachDay ?? NEVER));
      const win = medianOf(runs.map((c) => c.volumeWinDay ?? NEVER));
      // Measured across the four seeds (round 21): reach 16/17/18/16.5,
      // win 21/22/22/21.5.
      expect(reach, `seed ${seed}: reach ${reach}`).toBeGreaterThanOrEqual(12);
      expect(reach).toBeLessThanOrEqual(20);
      expect(win, `seed ${seed}: win ${win}`).toBeGreaterThanOrEqual(18);
      expect(win).toBeLessThanOrEqual(28);
    }
  }, HEAVY_MS);

  it('is the TEA arc carrying her, not a key giveaway (round-10 directive intact)', () => {
    // The retune that closed the gap had to be the step arc: keys belong to
    // the owner's "skill, not just persistence" directive, so solves must
    // still out-supply every other channel for HER as well, not only for the
    // skilled player the ratio was originally measured on.
    const fromSolves = decentDays.reduce((s, d) => s + d.keysFromSolves, 0);
    const fromDeck = decentDays.reduce((s, d) => s + d.keysFound, 0);
    expect(fromSolves).toBeGreaterThan(fromDeck);
    const fromFern =
      decentDays.length * fernMorningKeys(FERN_ARC.meetPoints + FERN_ARC.questPoints);
    expect(fromSolves).toBeGreaterThan(fromFern);
    // And the lever itself is progressive by construction: `teaArcPoints` does
    // not reach the rungs that moved until day 6, so days 1–5 — the evenings
    // the owner called "way too easy" — cannot have been touched by it.
    for (const day of [1, 2, 3, 4, 5]) {
      expect(teaArcPoints(day)).toBeLessThanOrEqual(2);
      expect(teaBonus(teaArcPoints(day))).toBe(TEA_BY_POINTS[teaArcPoints(day)]);
    }
    expect(TEA_BY_POINTS.slice(0, 3)).toEqual([0, 4, 6]);
  });
});

// ---------------------------------------------------------------------------
// ROUND-13 — THE MILESTONE IS THE DOOR, AND THE DOOR FINALLY HAS AN ARC
// ---------------------------------------------------------------------------

/**
 * ═══ THE ROUND-13 BLOCKER, AS A SUITE ═════════════════════════════════════
 *
 * Third recurrence of the round-6/7/11 escape. `simulateDay` returned
 * `reachedSanctum: maxRow >= SANCTUM_LANDING_ROW` — merely standing on the
 * storey — while the gate the live game enforces is `atSanctumDoor`: the
 * landing cell AND a north door on the room drafted there, matching the
 * Sanctum's sealed south one. Measured over the real deck and the rigid
 * rotation, only ~27.7% of tier-3-eligible plans place with a north door when
 * the landing is entered from below, and a real 3-card offer at (2,5) contains
 * one on ~61% of draws. So roughly two evenings in five she paid 22+ steps to
 * arrive at an offer that could not open the door, and EVERY 4.10d/e number
 * retuned across rounds 6–12 had been measured against a storey, not a door.
 *
 * The block below pins the identity the way round 7 pinned
 * `SANCTUM_LANDING_ROW === SANCTUM_DOOR_CELL.row + 1`, so the two can never
 * drift again — and then pins the arc and the floor the gate never had.
 */
describe('4.10d/e — the milestone is the DOOR the live game enforces', () => {
  it('pins the sim milestone to the live predicate, not to the storey', () => {
    // The identity, both directions. A room on the landing with no north door
    // is a landing she has to draft again tomorrow…
    const bare = createManor(4242);
    const sealedLanding = placeRoom(bare, {
      cardId: 'x', cell: SANCTUM_DOOR_CELL, doors: ['S', 'E'], solved: false, kind: 'utility',
    });
    const standingSealed = { ...sealedLanding, playerCell: { ...SANCTUM_DOOR_CELL } };
    expect(atSanctumDoor(standingSealed)).toBe(false);
    expect(sanctumStanding(standingSealed)).toBe('landing-sealed');
    // …and the same cell with the north door IS the gate.
    const openLanding = placeRoom(bare, {
      cardId: 'x', cell: SANCTUM_DOOR_CELL, doors: ['S', 'N'], solved: false, kind: 'utility',
    });
    const standingOpen = { ...openLanding, playerCell: { ...SANCTUM_DOOR_CELL } };
    expect(atSanctumDoor(standingOpen)).toBe(true);
    expect(sanctumStanding(standingOpen)).toBe('at-door');
    // A bare manor stands her in the Entrance Hall, which is the speaking tube
    // (REVIEW_AA §5.2) — so the fresh standing is 'at-tube'. What this test is
    // pinning is unaffected: the tube is a MOUTH and the door is a GATE, and
    // only the gate closes the volume, so `atSanctumDoor` is false at the tube
    // and the milestone below is still the door.
    expect(sanctumStanding(bare)).toBe('at-tube');
    expect(atSanctumDoor(bare)).toBe(false);
    // The predicate the card face and the drafting engine share agrees, and it
    // is false everywhere else in the house however many north doors are drawn.
    expect(opensOntoSanctum(['S', 'N'], SANCTUM_DOOR_CELL)).toBe(true);
    expect(opensOntoSanctum(['S', 'E'], SANCTUM_DOOR_CELL)).toBe(false);
    expect(opensOntoSanctum(['N'], { col: 2, row: 3 })).toBe(false);
  });

  it('measures the gate the finding measured: the landing is not the door', () => {
    // The two numbers the finding published, re-derived here so a deck edit or
    // a rotation change moves a TEST rather than the owner's campaign.
    const tier = rowTier(SANCTUM_DOOR_CELL.row);
    let weight = 0;
    let northWeight = 0;
    for (let seed = 0; seed < 200; seed++) {
      const manor = createManor(seed);
      for (const card of BASE_DECK) {
        if (card.tierRange[0] > tier || tier > card.tierRange[1]) continue;
        const w = categoryWeight(card.category, SANCTUM_DOOR_CELL.row)
          * RARITY_WEIGHTS[tier][card.rarity];
        weight += w;
        if (cardOpensOntoSanctum(card, LANDING_ENTRY_DIR, manor, SANCTUM_DOOR_CELL)) {
          northWeight += w;
        }
      }
    }
    const perCard = northWeight / weight;
    expect(perCard, `weighted P(a landing plan opens north) = ${perCard.toFixed(3)}`)
      .toBeLessThan(0.4);
    expect(perCard).toBeGreaterThan(0.15);

    // …and the offer rate, through the REAL rollCards, with no arc warmth.
    let offers = 0;
    for (let seed = 0; seed < 2000; seed++) if (landingDraft(seed)) offers += 1;
    const bareOffer = offers / 2000;
    expect(bareOffer, `bare landing offer rate ${bareOffer.toFixed(3)}`).toBeGreaterThan(0.5);
    expect(bareOffer).toBeLessThan(0.75);
    // The gate is therefore a REAL cost, not a formality: a day model that
    // treats the storey as the milestone overstates every reach by ~40%.
  });

  it('never reports a door she did not stand on the landing for', () => {
    for (const c of [...campaigns, ...decentCampaigns]) {
      for (const d of c.days) {
        if (d.reachedSanctum) expect(d.reachedLanding).toBe(true);
      }
      if (c.firstSanctumReachDay !== null) {
        expect(c.firstLandingDay).not.toBeNull();
        expect(c.firstSanctumReachDay).toBeGreaterThanOrEqual(c.firstLandingDay!);
      }
      expect(c.landingEvenings).toBeLessThanOrEqual(c.surveyEvenings);
    }
    // And at campaign scale the gap is a real, measured quantity — the thing
    // the arc below exists to close, not a rounding error.
    const days = decentCampaigns.flatMap((c) => c.days);
    expect(share(days, (d) => d.reachedSanctum))
      .toBeLessThan(share(days, (d) => d.reachedLanding));
  });
});

/**
 * ═══ THE ACCESS GATE HAS AN ARC AND A FLOOR (round 13) ════════════════════
 *
 * Two findings, one mechanic (engine/economy/steps.ts `SANCTUM_ARC`):
 *
 *  - **the arc was spent on day 12.** Tea caps at day 12, Fern's dawn key at
 *    day 9, both `CAMPAIGN_ARC` familiarity terms by day ~9. From day 13 the
 *    median player's evening was statistically identical forever — the game's
 *    answer to a player who keeps stopping a storey short was "roll again,
 *    nightly, with the same dice, indefinitely";
 *  - **no mercy on the gate that binds.** Over 400 median-player campaigns
 *    EVERY unfinished one belonged to a player who already knew the word;
 *    the gap between knowing and winning ran median 9, p90 25, max 47. AAA
 *    4.14 gives the KNOWLEDGE gate a pity floor and ACCESS had none.
 *
 * WHAT IS DELIBERATELY *NOT* FIXED, so nobody re-opens it as a bug: the CLIMB
 * rate stays flat late (measured ~7–8% of the median player's evenings, ~25%
 * of the skilled player's). The climb is the constant-difficulty push-your-luck
 * the whole economy is built on — 4.10c requires a great single day to reach
 * the landing on <25% of days, at every point in the campaign. What grows is
 * the house's willingness to show its own door, which is the quantity 4.10d/e
 * actually gate on.
 */
describe('4.10d/e + 4.14 — the landing arc: earned, progressive, and floored', () => {
  it('ties the arc to the live geometry, not to a hand-typed row', () => {
    // The storey the Sanctum stair is visible from, and the first `DOOR_LOCKS`
    // padlocks. Pinned as an IDENTITY (round-7's lesson) so a grid change
    // cannot leave the arc measuring a floor that has moved.
    expect(SANCTUM_ARC.surveyRow0).toBe(SANCTUM_DOOR_CELL.row - 1);
    expect(DOOR_LOCKS.chanceByRow[SANCTUM_ARC.surveyRow0]!).toBeGreaterThan(0);
    // The mercy's knowledge half is the deduction band the model uses, so the
    // floor cannot open before she could possibly name the word.
    expect(SANCTUM_ARC.mercyFragments).toBeGreaterThanOrEqual(KNOWLEDGE.fragmentsToDeduce[0]);
    expect(SANCTUM_ARC.mercyFragments).toBeLessThanOrEqual(KNOWLEDGE.volumeFragments);
  });

  it('is monotone, bounded, and exactly nothing before she has climbed', () => {
    expect(sanctumPlanWarmth(0)).toBe(0);
    expect(sanctumPlanWarmth(-3)).toBe(0);
    let prev = -1;
    for (const evenings of [0, 1, 3, 6, 12, 30, 90]) {
      const w = sanctumPlanWarmth(evenings);
      expect(w).toBeGreaterThanOrEqual(prev);
      expect(w).toBeLessThanOrEqual(1);
      prev = w;
    }
    expect(sanctumPlanWarmth(SANCTUM_ARC.planEveningsToFull)).toBe(1);
    // Live source: the persisted day records, read the same way every dusk.
    expect(surveyEveningsIn([])).toBe(0);
    expect(surveyEveningsIn([
      { highestRow: 0 }, { highestRow: SANCTUM_ARC.surveyRow0 }, {},
      { highestRow: SANCTUM_DOOR_CELL.row },
    ])).toBe(2);
  });

  it('raises the landing offer rate strictly with warmth, and never to 1', () => {
    const rateAt = (warmth: number, mercy = false) => {
      let hit = 0;
      for (let seed = 0; seed < 1200; seed++) {
        if (landingDraft(seed, { planWarmth: warmth, mercy })) hit += 1;
      }
      return hit / 1200;
    };
    const cold = rateAt(0);
    const warm = rateAt(0.5);
    const full = rateAt(1);
    expect(warm, `warm ${warm.toFixed(3)} vs cold ${cold.toFixed(3)}`).toBeGreaterThan(cold);
    expect(full).toBeGreaterThan(warm);
    // Still a draft, never a formality — the arc shortens the wait, it does not
    // hand her the door (AAA 4.6: the offer stays a decision).
    expect(full).toBeLessThan(0.99);
    // THE FLOOR (AAA 4.14, access side): armed, an offer up there essentially
    // always contains a plan that opens onto the Sanctum.
    expect(rateAt(0, true)).toBeGreaterThan(0.9);
  });

  it('cannot arm the mercy without BOTH halves — so day 1 is untouched', () => {
    const band = SANCTUM_ARC.mercyFragments;
    // Knowing the word alone is not enough: she has to have been up there.
    expect(sanctumMercyArmed(0, band + 4)).toBe(false);
    expect(sanctumMercyArmed(SANCTUM_ARC.mercyEvenings - 1, band + 4)).toBe(false);
    // Climbing alone is not enough either — this is an ACCESS floor for a
    // player already holding the answer, never a shortcut through the mystery.
    expect(sanctumMercyArmed(50, band - 1)).toBe(false);
    expect(sanctumMercyArmed(SANCTUM_ARC.mercyEvenings, band)).toBe(true);
    // Day 1 has no campaign behind it, so neither term can be non-zero: the
    // <8% day-1 reach of 4.10d is protected by construction, not by tuning.
    const day1 = simulateDay(createRng(11), campaignProfileForDay(PROFILE_SKILLED, 1));
    expect(day1.reachedSanctum === false || day1.reachedLanding).toBe(true);
    expect(sanctumMercyArmed(0, 0)).toBe(false);
    expect(sanctumPlanWarmth(0)).toBe(0);
  });

  it('does not flatten after day 12 — the finding, as a gate', () => {
    // THE CLAUSE THE FINDING WAS ABOUT. Before round 13 the median player's
    // evening was statistically identical from day 13 to day 60: P(door) flat
    // at 7–8%, because every arc in the game had already capped. Measured
    // after, across four independent seeds: the day-26–45 door rate is 10–24%
    // higher than the day-11–20 one, and the lift is the arc plus the mercy.
    for (const seed of [0x1234, 0x9911, 0x2f2f, 0xabc1]) {
      const runs = simulateCampaigns(PROFILE_DECENT, 250, CAMPAIGN_LENGTH, seed);
      const early = runs.flatMap((c) => c.days.slice(10, 20));
      const late = runs.flatMap((c) => c.days.slice(25, 45));
      const e = share(early, (d) => d.reachedSanctum);
      const l = share(late, (d) => d.reachedSanctum);
      expect(l, `seed ${seed}: door rate ${(100 * e).toFixed(2)}% → ${(100 * l).toFixed(2)}%`)
        .toBeGreaterThan(e);
      // …and it is the DOOR that moved, not the climb: the ceiling on the
      // climb is 4.10c's "<25% of even great days", which must stay put.
      const lateLanding = share(late, (d) => d.reachedLanding);
      expect(l / lateLanding).toBeGreaterThan(share(early, (d) => d.reachedSanctum)
        / share(early, (d) => d.reachedLanding));
    }
  }, HEAVY_MS);

  it('closes the knowing-but-locked-out gap the finding measured', () => {
    // "I solved the mystery and the house will not let me say it." Before
    // round 13: median 9 evenings, p75 16, p90 25, max 47 — with no channel
    // that ever tilted. The gap is the ACCESS gate's whole cost, so it is the
    // number the mercy is pinned by. (Truncated at the campaign window, which
    // is conservative: the campaigns that never finish are excluded here and
    // measured by the never-win share in the block above.)
    const gapsFor = (runs: typeof decentCampaigns) => runs
      .filter((c) => c.volumeWinDay !== null && c.deductionDay !== null)
      .map((c) => c.volumeWinDay! - c.deductionDay!);
    const decentGaps = gapsFor(decentCampaigns);
    expect(medianOf(decentGaps), `median-player gap median ${medianOf(decentGaps)}`)
      .toBeLessThanOrEqual(8);
    expect(quantileOf(decentGaps, 0.9), `p90 ${quantileOf(decentGaps, 0.9)}`)
      .toBeLessThanOrEqual(20);
    const skilledGaps = gapsFor(campaigns);
    expect(medianOf(skilledGaps)).toBeLessThanOrEqual(4);
    expect(quantileOf(skilledGaps, 0.9)).toBeLessThanOrEqual(12);
    // And the gate is still a gate: winning is never the same day as knowing
    // for everybody — the climb is what the volume is actually paid for.
    expect(share(decentGaps, (g) => g > 0)).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// ROUND-11 — THE SEAL HAS TO BITE, OR IT CANNOT CARRY "SOLVING NEEDS TO MATTER"
// ---------------------------------------------------------------------------

/**
 * Round 10 made entering a violet room file a SEALED page and made a solve
 * render it legible (engine/volume.ts). The mechanic was real in code and
 * beautifully presented in the journal — and statistically a rounding error:
 * measured through this very simulation, only **9.5%** of PROFILE_DECENT days
 * contained a violet room at all, sealed supply ran 0.45/day against a
 * decipher capacity of 2.6–6/day, and a sealed page survived the night on
 * 0.03 page-days per day. Nine evenings in ten the player never met a sealed
 * page, so the seal could not answer the owner's question and the round-8
 * solve channel plus the keys were doing all the work.
 *
 * Two things were wrong and both are fixed at the source, not here:
 *   1. THE MODEL COULD NOT SEE IT. `simulateDay` counted violet rooms entered
 *      and stopped; legibility, ordering and the overnight backlog did not
 *      exist in it, so any retune of the seal moved the real game and nothing
 *      here. It now plays the seal in day order (`pagesMadeOut`,
 *      `sealedBacklog`) through the real `decipherYield`.
 *   2. THE SUPPLY WAS NOT THERE. `categoryWeight('mystery', row)` ramped 6→48
 *      on paper while `RARITY_WEIGHTS[1]` scored tier 1's only two mystery
 *      cards 9 and 1 — a realised 0.16% of draws on the ground floor. The
 *      Archive is a standard card now and the ramp is tuned against the
 *      REALISED share (engine/manor/{deck,drafting}.ts).
 *
 * THE PUBLISHED TARGET (AAA 4.10g): a sealed page survives to the next dawn on
 * ~25–50% of a skilled player's days, and a solve makes a page out on ≥1 day
 * in 3. The bands below are what a future retune has to argue with.
 */
describe('4.10g — the SEAL bites: entering gets the page, solving makes it out', () => {
  const sealed = simulateCampaigns(PROFILE_SKILLED, 300, CAMPAIGN_LENGTH, 0x1234);
  const sealedDays = sealed.flatMap((c) => c.days);

  it('shows the median evening a violet room often enough to have a mechanic', () => {
    // The finding's headline number: 9.5% before the retune. A player who
    // meets a sealed page one evening in ten does not have a seal mechanic,
    // she has a rumour of one.
    const met = share(decent, (r) => r.fragmentsFound > 0);
    expect(met, `PROFILE_DECENT met a violet room on ${(met * 100).toFixed(1)}% of days`)
      .toBeGreaterThan(0.15);
    // …and it is still a rare room, not a corridor: violet never becomes the
    // thing she draws by default.
    expect(met).toBeLessThan(0.5);
  });

  it('puts violet on the GROUND FLOOR at a rate the player can actually meet', () => {
    // The realised share, which is what the player experiences — not the
    // category weight, which is what the old comment described.
    const shares = [0, 1, 2, 3, 4, 5, 6].map((row) => deckMixAt(row).mystery);
    expect(shares[0], `row-0 violet share ${shares[0]}`).toBeGreaterThan(0.012);
    for (let row = 0; row < 6; row++) {
      expect(shares[row + 1]!, `violet share row ${row}→${row + 1}`)
        .toBeGreaterThan(shares[row]!);
    }
    // Climbing is still visibly worth it: the top storey is several times the
    // ground floor (AAA 4.2's "violet ramps with row" as a felt quantity).
    expect(shares[6]!).toBeGreaterThan(shares[0]! * 3);
  });

  it('leaves a page unread overnight on a real share of days (the backlog)', () => {
    const overnight =
      sealed.reduce((s, c) => s + c.sealedOvernightDays, 0) / sealedDays.length;
    expect(overnight, `sealed-overnight share ${overnight.toFixed(3)}`)
      .toBeGreaterThan(0.25);
    // …and never so much that the journal silts up with smudges she can never
    // catch up on: the backlog is a pressure, not a debt spiral.
    expect(overnight).toBeLessThan(0.55);
    expect(medianOf(sealedDays.map((d) => d.sealedBacklog))).toBeLessThanOrEqual(2);
  });

  it('makes the solve the thing that moves the case, on 1 day in 3 or better', () => {
    expect(share(sealedDays, (d) => d.pagesMadeOut > 0)).toBeGreaterThan(0.33);
  });

  /**
   * ═══ ROUND-12 — "1 DAY IN 3" WAS THE SKILLED PLAYER'S NUMBER TOO ═══════
   *
   * 4.10g built all of its evidence from `simulateCampaigns(PROFILE_SKILLED,
   * …)`. The overnight clause is skill-qualified in the doc ("a skilled
   * player's days") and is fine; "a solve makes a page out on ≥1 day in 3"
   * was not qualified, and re-run on the median player's campaigns it measures
   * 0.23 — false by a third for the very evening 4.10b clocks, and for the
   * very mechanic ("solving needs to matter") the owner asked for.
   *
   * The clause is now qualified in AAA 4.10g and BOTH numbers are pinned here.
   * It is qualified rather than tuned into range because the ceiling is
   * arithmetic, not tuning — see the test below, which is the argument.
   */
  const decentSealedDays = decentDays;

  it("holds the median player's own made-out band (≥1 day in 5)", () => {
    const made = share(decentSealedDays, (d) => d.pagesMadeOut > 0);
    expect(made, `PROFILE_DECENT made a page out on ${(made * 100).toFixed(1)}% of days`)
      .toBeGreaterThan(0.2);
    // …and it is genuinely BELOW the skilled band, so the qualification in
    // 4.10g is load-bearing rather than decorative. If a future retune lifts
    // her past 1-in-3, this fails and the doc gets to drop the split.
    expect(made).toBeLessThan(0.33);
    expect(made).toBeLessThan(share(sealedDays, (d) => d.pagesMadeOut > 0));
  });

  it('leaves HER a page overnight too — less often, never never', () => {
    const overnight =
      decentCampaigns.reduce((s, c) => s + c.sealedOvernightDays, 0) / decentSealedDays.length;
    expect(overnight, `median-player sealed-overnight share ${overnight.toFixed(3)}`)
      .toBeGreaterThan(0.08);
    expect(overnight).toBeLessThan(0.25);
    // The 25–50% band above is the skilled player's, and the doc says so.
    expect(overnight).toBeLessThan(
      sealed.reduce((s, c) => s + c.sealedOvernightDays, 0) / sealedDays.length);
  });

  it('cannot reach 1-day-in-3 while violet stays a RARE room — the arithmetic', () => {
    // WHY THE CLAUSE IS QUALIFIED RATHER THAN TUNED. A page can only be made
    // out if she is holding one, and the median player's overnight backlog
    // median is 0 — so her made-out rate is pinned to how often she MEETS a
    // violet room, and violet share is a function of ROW (deckMixAt: 2.0% at
    // row 0, 10.5% at row 6). She tops out around the third landing; the
    // skilled player climbs past it. Same mechanic, same tuning, two rates.
    expect(medianOf(decentSealedDays.map((d) => d.sealedBacklog))).toBe(0);
    const violetMet = share(decentSealedDays, (d) => d.fragmentsFound > 0);
    const made = share(decentSealedDays, (d) => d.pagesMadeOut > 0);
    expect(violetMet, `median-player violet-met share ${violetMet.toFixed(3)}`)
      .toBeLessThan(0.33);
    expect(made).toBeLessThanOrEqual(violetMet + 0.05);
    // So lifting her to 1-in-3 means lifting her violet-met rate past 1 in 3,
    // which collides with THIS SAME CRITERION's "still a rare room (<50%)" and
    // with the 4.10b clock calibrated on the deck mix. The skilled player
    // clears the bar for the mirror-image reason: she meets violet far more
    // often, because she is further up the house.
    expect(share(sealedDays, (d) => d.fragmentsFound > 0)).toBeGreaterThan(0.4);
    expect(share(sealedDays, (d) => d.fragmentsFound > 0)).toBeLessThan(0.75);
  });

  it('never makes out more than she was holding, and never out of order', () => {
    for (const c of sealed) {
      let carried = 0;
      for (const d of c.days) {
        // Conservation: what she could possibly read today is yesterday's
        // backlog plus today's finds, and what is left is exactly the rest.
        expect(d.pagesMadeOut).toBeLessThanOrEqual(carried + d.fragmentsFound);
        expect(d.sealedBacklog).toBe(carried + d.fragmentsFound - d.pagesMadeOut);
        carried = d.sealedBacklog;
      }
      // The whole point, at campaign scale: she can read less than she holds.
      expect(c.fragments).toBeLessThanOrEqual(c.fragmentsFiled);
    }
  });

  it('a player who solves NOTHING learns nothing from the rooms she walks', () => {
    // The owner directive, as a tripwire. The skipper drafts violet rooms —
    // they are hers forever, AAA 4.18 is untouched — and makes out not one
    // page of them, all campaign. If a future retune lets a walk-through pay
    // the mystery again, this is what fails.
    const walker = simulateCampaigns(PROFILE_SKIPPER, 120, CAMPAIGN_LENGTH, 0x77aa);
    const walkerDays = walker.flatMap((c) => c.days);
    expect(share(walkerDays, (d) => d.fragmentsFound > 0)).toBeGreaterThan(0.1);
    expect(walkerDays.every((d) => d.pagesMadeOut === 0)).toBe(true);
    // …so her backlog only ever grows, and her knowledge comes solely from
    // the channels that do not need a solved room (letters, testimony, pity).
    expect(walker.every((c) => c.days.at(-1)!.sealedBacklog > 0)).toBe(true);
  });

  it('holds the band across independent campaign seeds', () => {
    for (const seed of [0x1234, 0x9911, 0x2f2f, 0xabc1]) {
      const runs = simulateCampaigns(PROFILE_SKILLED, 150, CAMPAIGN_LENGTH, seed);
      const days = runs.flatMap((c) => c.days);
      const overnight = runs.reduce((s, c) => s + c.sealedOvernightDays, 0) / days.length;
      expect(overnight, `seed ${seed}: ${overnight.toFixed(3)}`).toBeGreaterThan(0.25);
      expect(overnight, `seed ${seed}: ${overnight.toFixed(3)}`).toBeLessThan(0.55);
    }
  }, HEAVY_MS);
});

/**
 * ROUND-11 — 4.10e IS MEASURED AGAINST THE RULES THE GAME HAS.
 *
 * `simulateCampaign` used to add `result.fragmentsFound` — violet rooms
 * ENTERED — straight into the deduction count, and modelled no solve channel
 * at all. Under the shipped rules a violet room files a page that narrows
 * nothing until a solve makes it out, and the word games pay two strict
 * channels of their own (engine/volume.ts `STUDY_CHANNEL`/`LINTEL_CHANNEL`).
 * So the horizon was verified against a knowledge curve the game had stopped
 * having, and fixing the seal above would have moved the real horizon with
 * every test still green.
 */
describe('4.10e — the knowledge curve counts LEGIBLE pages, not rooms walked', () => {
  it('never counts a sealed page as knowledge', () => {
    for (const c of campaigns.slice(0, 120)) {
      const filedFromRooms = c.days.reduce((s, d) => s + d.fragmentsFound, 0);
      const madeOut = c.days.reduce((s, d) => s + d.pagesMadeOut, 0);
      expect(madeOut).toBeLessThanOrEqual(filedFromRooms);
      // Legible ≤ filed, always — the seal can only ever subtract.
      expect(c.fragments).toBeLessThanOrEqual(c.fragmentsFiled);
    }
  });

  /**
   * ROUND 19 — THIS ASSERTION WAS INVERTED BY THE REVIEW, SO IT IS REWRITTEN.
   *
   * It used to read `studyChannelStock + lintelChannelStock <
   * volumeFragments / 2`, with the comment "volume 1 authors 3 definition
   * lines and 2 lintel engravings for the word games, and the model must hold
   * to that stock". That was a faithful pin of the routing REVIEW_AA §5.1
   * exists to condemn: *two* of seventeen fragments reachable by an ordinary
   * evening's solve, and the ceiling written into the suite as a floor. §5.1's
   * "done looks like" is the opposite claim — *"re-label fragments in
   * volume-1.json so that the ORDINARY puzzle rooms carry the spine"* — so the
   * bound is flipped and the thing being measured changes with it: the solve
   * channels must now carry a MAJORITY of the volume, and must still not carry
   * ALL of it, because AAA 4.14 requires at least two source types and the
   * violet drip, the post and the parlor are the others. A volume that routed
   * everything through solving would delete the seal (4.10g) and the letters.
   */
  it('routes the spine through the word games, without swallowing it', () => {
    // A channel that pays nothing is a dead reward class (AAA 11.17); a
    // channel modelled as infinite is a horizon nobody can trust.
    expect(KNOWLEDGE.studyChannelStock).toBeGreaterThan(0);
    expect(KNOWLEDGE.lintelChannelStock).toBeGreaterThan(0);
    const solveReachable = KNOWLEDGE.studyChannelStock + KNOWLEDGE.lintelChannelStock;
    // §5.1: the ordinary evening's solve carries the spine (measured 9 of 17).
    expect(solveReachable).toBeGreaterThan(KNOWLEDGE.volumeFragments / 2);
    // …and 4.14's other source types keep a real share (measured 8 of 17).
    expect(solveReachable).toBeLessThan(KNOWLEDGE.volumeFragments);
    // And it is the LINTEL — every ordinary word game in the house — that
    // carries it, not the Study. §5.1's finding was not "too few solve-paid
    // pages" in the abstract; it was that the solve-paid pages were behind
    // `tierRange: [3,3], rarity: 'rare', gemCost: 2`. If the Study ever
    // out-stocks the lintel again, the review's §6 ("everything the game does
    // best is behind a door the deck rarely opens") is back.
    expect(KNOWLEDGE.lintelChannelStock).toBeGreaterThan(KNOWLEDGE.studyChannelStock);
    // The Study is a rows-5–6 card (engine/manor/deck.ts): its channel is the
    // reward for an ascent, not a tap she can open on the ground floor. The
    // model has to agree with the deck about that, or the definition lines
    // would arrive weeks early in the horizon it publishes.
    for (const row of [0, 2, 4]) expect(studySolveShareAt(row)).toBe(0);
    for (const row of [5, 6]) {
      expect(studySolveShareAt(row)).toBeGreaterThan(0);
      expect(studySolveShareAt(row)).toBeLessThan(0.35);
    }
  });

  it('never learns more than the volume authors', () => {
    for (const c of campaigns) {
      expect(c.fragmentsFiled).toBeLessThanOrEqual(KNOWLEDGE.volumeFragments);
    }
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
  }, HEAVY_MS);

  /**
   * ROUND 10 — THE OWNER'S "SKILL, NOT JUST PERSISTENCE, EARNS THE CAMPAIGN".
   *
   * Every key used to come off a green card or off Fern's sill, so the padlock
   * arc was a DRAFTING-LUCK arc: playing the word games well bought steps and
   * nothing else, and the climb belonged to whoever got offered the Key
   * Cabinet. A solved room pays a key by row-band tier now, and the geometry
   * is the design — DOOR_LOCKS gates 0-based rows 4–5, rows 3–4 are tier 2, so
   * the storey below a padlock is the storey that pays for it.
   *
   * Re-tuning followed in the same change (see engine/economy/steps.ts): the
   * door costs two keys, row 4 locks at 0.9, and row 4 costs a step more to
   * walk into. Measured before that re-tune, the new supply put a skilled
   * player at the Sanctum door on day 1 in 29% of campaigns against a
   * published <8%, with a median first reach of day 2. Every 4.10 target
   * above is re-measured against the retune; this block pins the SOURCE MIX
   * the directive actually asked for.
   */
  describe('round 10 — the climb is bought with solves, not only with luck', () => {
    it('pays keys by tier, nothing on the ground floor, never a whole ascent', () => {
      expect(solveKeys(1)).toBe(0);
      expect(solveKeys(2)).toBeGreaterThan(0);
      expect(solveKeys(3)).toBeGreaterThanOrEqual(solveKeys(2));
      // One room is never a whole climb: an ascent crosses ≈1.85 padlocks at
      // `keyCost` each, and a single solve must stay well under that.
      const ascent = [4, 5].reduce(
        (s, row) => s + DOOR_LOCKS.chanceByRow[row]! * DOOR_LOCKS.keyCost, 0);
      expect(Math.max(...KEY_SUPPLY.solveKeysByTier)).toBeLessThan(ascent);
    });

    it('makes SOLVED ROOMS the primary source of keys, over the whole campaign', () => {
      // The directive in one measurement. Deck-sourced keys (`keysFound`) are
      // green cards taken for their key face; `keysFromSolves` is the round-10
      // channel. Measured: ≈1.2/day from solves against ≈0.7/day off the deck.
      const days = campaigns.flatMap((c) => c.days);
      const fromSolves = days.reduce((s, d) => s + d.keysFromSolves, 0);
      const fromDeck = days.reduce((s, d) => s + d.keysFound, 0);
      expect(fromSolves).toBeGreaterThan(fromDeck);
      // …and Fern's whole authored arc, at her ceiling, is smaller still —
      // she shortens the climb, the word games pay for it.
      const fromFern = days.length * fernMorningKeys(FERN_ARC.meetPoints + FERN_ARC.questPoints);
      expect(fromSolves).toBeGreaterThan(fromFern * 0.9);
      // It is a real ramp, not a rounding artefact.
      expect(fromSolves / days.length).toBeGreaterThan(0.5);
    });

    it('does not turn the padlock into decoration: the gate still bites hard', () => {
      const early = campaigns.flatMap((c) => c.days.slice(0, 5));
      expect(share(early, (d) => d.lockedOut > 0)).toBeGreaterThan(0.5);
      // …and a skipper, who solves nothing, earns no keys at all and never
      // stands at the door (4.10a) — solving is the difference.
      expect(skipper.every((r) => r.keysFromSolves === 0)).toBe(true);
      expect(share(skipper, (r) => r.reachedSanctum)).toBe(0);
    });

    it('leaves the 10–15 minute evening exactly where it was (4.10f)', () => {
      // Keys buy CLIMB, which is cheap in minutes. The median day must not
      // have inflated because solving became more rewarding.
      const m = median(decent, (r) => r.minutes);
      expect(m).toBeGreaterThanOrEqual(10);
      expect(m).toBeLessThanOrEqual(15);
    });
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
    expect(Math.max(...KEY_SUPPLY.fernMorningKeysByPoints)).toBeLessThan(3);
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
    // ROUND 7 (verifier): pin the EXACT bare ascent, not just the inequality.
    // AAA 4.10d publishes this number and steps.ts's header quotes it; round 10
    // moved MOVE_COST_BY_ROW[4] −6 → −7 and updated one of the three copies, so
    // the docs said 21 while the game charged 22 and every assertion here
    // (`> 18`, `>= 20`) stayed green straight through the drift. Now a movement
    // retune has to come here and change the number on purpose.
    // 1 + 2 + 3 + 7 + 9 = 22, entrance (row 0) → the landing (row 5).
    expect(reserveToTop(1, { walkbackPerRow: 0 })).toBe(22);
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
