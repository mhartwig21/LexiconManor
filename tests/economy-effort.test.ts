import { describe, expect, it } from 'vitest';
import {
  effortLabel, effortMinutes, paysInStages, stageFractionOf,
  HIVE_SOLVE_PCT, HIVE_STAGE_PCT, LADDER_MINUTES, ROOM_EFFORT,
  SUDOKU_BLANKS, SUDOKU_CELLS_PER_STAGE, WEB_GROUPS,
} from '../src/engine/economy/effort';
import {
  solveKeys, solvePayout, stageSteps, BASE_DAY_BUDGET, KEY_SUPPLY, ROOM_SIZE, SOLVE_WAGE,
  STEP_TABLE, moveAt,
} from '../src/engine/economy/steps';
import { getRoomAdapter, registeredRoomKinds } from '../src/engine/rooms/registry';
import { ROOM_PUZZLE_KINDS, type RoomPuzzleKind } from '../src/engine/rooms/room-puzzle';
import { HIVE_LADDER, ladderThreshold } from '../src/engine/rooms/adapters/hive';
import type { Tier } from '../src/engine/types';
import twistlePool from '../content/generated/twistle.json';
import hivePool from '../content/generated/hive.json';
import sudokuPool from '../content/generated/sudoku.json';
import webPool from '../content/generated/word-web.json';

/**
 * ═══ 4.10h — TIME FOR REWARD (REVIEW_AA §6, round 22) ══════════════════════
 *
 * THE DEFECT THIS SUITE EXISTS TO CATCH, in the review's words: *"rooms priced
 * identically on the draft card cost wildly different amounts of a player's
 * life, so the correct strategy is to abandon half of them on sight."*
 * `STEP_TABLE.solve(size, tier)` had no room parameter, so the Gallery's twenty
 * seconds and the Counting House's half hour were paid off one row-band table.
 *
 * AAA_BAR carried ~130 criteria and **not one of them constrained time for
 * reward**, which is exactly why a 36× wage spread survived twenty-one build
 * rounds, three critic panels and a hostile editorial review that named the
 * defect. That is what this file is: the criterion, as a gate.
 *
 * It asserts four different kinds of thing, and the order matters:
 *   1. COVERAGE — a room cannot ship unpriced or unclocked;
 *   2. THE CURVE — the payout is a monotone function of honest work, flat in
 *      steps-per-minute between its floor and its ceiling;
 *   3. THE RATCHET — the residual spread, measured, may fall and may never
 *      rise. This is the number the review was really about;
 *   4. THE DERIVATION — the content facts `ROOM_EFFORT` was measured from,
 *      re-derived here off the shipped pools, so a content edit that changes
 *      a room's workload fails a test instead of quietly re-opening the gap.
 */

const TIERS: readonly Tier[] = [1, 2, 3];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;

interface TwistlePuzzleLike { tier: number; targetCount: number; targetWords: string[] }
interface HivePuzzleLike { tier: number; validWords: string[]; pangrams: string[]; totalPoints: number }
interface SudokuPuzzleLike { tier: number; givens: string }
interface WebPuzzleLike { tier: number; groups: { words: string[] }[] }

const twistles = twistlePool as unknown as TwistlePuzzleLike[];
const hives = hivePool as unknown as HivePuzzleLike[];
const sudokus = sudokuPool as unknown as SudokuPuzzleLike[];
const webs = webPool as unknown as WebPuzzleLike[];

/** Steps per honest minute — the quantity the whole criterion is about. */
const wageOf = (kind: RoomPuzzleKind, tier: Tier) =>
  solvePayout(kind, tier) / effortMinutes(kind, tier);

/** The same quantity under the OLD flat table, for the before/after. */
const legacyWageOf = (kind: RoomPuzzleKind, tier: Tier) =>
  STEP_TABLE.solve(ROOM_SIZE[kind], tier) / effortMinutes(kind, tier);

const everyRoom: [RoomPuzzleKind, Tier][] =
  ROOM_PUZZLE_KINDS.flatMap((k) => TIERS.map((t) => [k, t] as [RoomPuzzleKind, Tier]));

const spreadOf = (wage: (k: RoomPuzzleKind, t: Tier) => number, rooms = everyRoom) => {
  const ws = rooms.map(([k, t]) => wage(k, t));
  return Math.max(...ws) / Math.min(...ws);
};

// ---------------------------------------------------------------------------

describe('4.10h coverage — a room cannot ship unpriced or unclocked', () => {
  it('gives every REGISTERED room kind an honest duration and a payout', () => {
    for (const kind of registeredRoomKinds()) {
      expect(ROOM_EFFORT[kind], `${kind} has no honest duration`).toBeDefined();
      for (const tier of TIERS) {
        expect(effortMinutes(kind, tier), `${kind} t${tier}`).toBeGreaterThan(0);
        expect(solvePayout(kind, tier), `${kind} t${tier}`).toBeGreaterThan(0);
        expect(effortLabel(kind, tier).length).toBeGreaterThan(0);
      }
    }
    // …and the pricing table's idea of what an anchor is agrees with the live
    // adapter registry, room for room. `ROOM_SIZE` exists so the economy can be
    // imported without dragging every puzzle engine behind it; this is the
    // assertion that stops it drifting from the thing it copies.
    for (const kind of registeredRoomKinds()) {
      expect(ROOM_SIZE[kind], `${kind} size`).toBe(getRoomAdapter(kind)!.size);
    }
  });

  it('leaves no room in the union unpriced, registered or not', () => {
    for (const kind of ROOM_PUZZLE_KINDS) {
      expect(Object.keys(ROOM_EFFORT)).toContain(kind);
      expect(Object.keys(ROOM_SIZE)).toContain(kind);
    }
  });
});

describe('4.10h — the payout is a function of the work, with a floor and a ceiling', () => {
  it('never pays a shorter room MORE than a longer one at the same tier', () => {
    // The one-sentence version of the whole criterion. It is stated as
    // non-strict because the clamps are deliberate: two rooms both under the
    // cozy floor, or both over the day-budget ceiling, are allowed to tie.
    for (const tier of TIERS) {
      for (const a of ROOM_PUZZLE_KINDS) {
        for (const b of ROOM_PUZZLE_KINDS) {
          if (effortMinutes(a, tier) <= effortMinutes(b, tier)) continue;
          expect(
            solvePayout(a, tier),
            `t${tier}: ${a} (${effortMinutes(a, tier)}m) pays less than ${b} (${effortMinutes(b, tier)}m)`,
          ).toBeGreaterThanOrEqual(solvePayout(b, tier));
        }
      }
    }
  });

  it('pays the house wage wherever neither clamp binds', () => {
    let unclamped = 0;
    for (const [kind, tier] of everyRoom) {
      const raw = SOLVE_WAGE.stepsPerMinute * effortMinutes(kind, tier);
      const cap = SOLVE_WAGE.capByTier[tier - 1]!;
      if (raw <= SOLVE_WAGE.floor || raw >= cap) continue;
      unclamped += 1;
      // A minute is worth a minute: the payout is the wage, to the rounding.
      expect(Math.abs(wageOf(kind, tier) - SOLVE_WAGE.stepsPerMinute))
        .toBeLessThan(0.5 / effortMinutes(kind, tier) + 1e-9);
    }
    expect(unclamped, 'every room is clamped — the wage would be decorative')
      .toBeGreaterThan(0);
  });

  it('keeps the cozy floor: a short puzzle is never a bad choice', () => {
    // The owner's constraint, as a gate: no solved room may pay less than the
    // micro floor, and specifically the SHORTEST room in the house still pays
    // more than the storey it stands on costs to walk into.
    for (const [kind, tier] of everyRoom) {
      expect(solvePayout(kind, tier), `${kind} t${tier}`)
        .toBeGreaterThanOrEqual(SOLVE_WAGE.floor);
      expect(solvePayout(kind, tier)).toBeGreaterThanOrEqual(-moveAt(0));
    }
  });

  it('keeps the ceiling: no single room prints most of an evening', () => {
    for (const [kind, tier] of everyRoom) {
      expect(solvePayout(kind, tier), `${kind} t${tier}`)
        .toBeLessThanOrEqual(Math.round((BASE_DAY_BUDGET * 2) / 3));
    }
    // …and the ceiling still gets leaner as she climbs (the 2026-08 owner
    // retune, which this repricing had to preserve rather than replace): the
    // best a tier-3 room can pay is less than the −9 step it took to get there.
    expect(Math.max(...ROOM_PUZZLE_KINDS.map((k) => solvePayout(k, 3))))
      .toBeLessThan(-moveAt(6));
    expect(SOLVE_WAGE.capByTier[2]!).toBeLessThan(SOLVE_WAGE.capByTier[1]!);
    expect(SOLVE_WAGE.capByTier[1]!).toBeLessThan(SOLVE_WAGE.capByTier[0]!);
  });
});

/**
 * ═══ THE RATCHET ══════════════════════════════════════════════════════════
 *
 * The review's ask was *"no two rooms' steps-per-honest-minute may differ by
 * more than 2×"*. The shipped content cannot reach that and the number says
 * why: the rooms span **30×** in length (the Linen Closet's 75 seconds against
 * the Counting House's half hour at tier 3), and no payout table with a cozy
 * floor and a day-budget ceiling can span 30×. What the wage CAN do is make a
 * minute worth a minute between the clamps, and squeeze the rest — measured
 * **45.00× → 20.00× overall**.
 *
 * ═══ ROUND 25 — THE SECOND NUMBER WAS NAMED FOR SOMETHING IT DID NOT MEASURE
 *
 * That sentence used to end *"…and 2× on the rooms the evening is actually made
 * of"*, over a header claiming **12×** overall. Both halves were wrong, and
 * differently:
 *
 *   * **12× overall is arithmetic that was never re-run.** `spreadOf(wageOf)` is
 *     `twistle t1 4.000 / sudoku t3 0.200` = **20.00×**, which is what
 *     `AAA_BAR.md` has printed since round 22. One file said 12, one said 20,
 *     and the assertion below (`<= 21`) passed under either.
 *   * **"the rooms an ordinary evening is made of" was a FILTERED SUBSET wearing
 *     a population's name.** The filter is `tier <= 2 && effortMinutes >= 2 &&
 *     !(sudoku t2)`, and what falls out of it is not exotic: **the Gallery
 *     (twistle t1/t2, 1 and 1.5 min), the Linen Closet (forgotten-word t1/t2,
 *     1.5 min) and the Study (crossword t1/t2, 1.25 and 1.5 min)** — three of
 *     the commonest draws in the deck, excluded for being SHORT, in a metric
 *     about how short rooms are paid. Seven of the fourteen tier-1/2 pairs
 *     survived it. The measured 1.75× was true of those seven and of nothing
 *     else; the population it was named for measures **12.00×**.
 *
 * This is structurally the same defect as the "79.2% of offers have a real
 * choice" headline that AAA 4.10j retired — a name that claims a population and
 * a definition that quietly takes a sample — and it was committed in the round
 * that was told about that one. So the number is published three ways now, all
 * three gated below, none of them called "an ordinary evening":
 *
 *   | population | measured |
 *   |---|---|
 *   | every room × every tier | **20.00×** |
 *   | every tier-1/2 room, unfiltered | **12.00×** (twistle t1 4.000 / sudoku t2 0.333) |
 *   | tier-1/2 minus the Counting House | **4.89×** (twistle t1 4.000 / hive t2 0.818) |
 *   | tier-1/2, two minutes or longer, minus the Counting House | **1.75×** |
 *
 * The bounds below are measurements: they may be tightened by the content fixes
 * REVIEW_AA §6 also asks for (the Gallery's `targetCount`, the Counting House
 * banking across days) and they may never be loosened without a finding to
 * point at.
 */
describe('4.10h — the wage spread is a ratchet: it may fall, never rise', () => {
  it('is strictly better than the flat table it replaced', () => {
    const before = spreadOf(legacyWageOf);
    const after = spreadOf(wageOf);
    expect(before, `flat-table spread ${before.toFixed(1)}×`).toBeGreaterThan(30);
    expect(after, `priced spread ${after.toFixed(1)}× (was ${before.toFixed(1)}×)`)
      .toBeLessThan(before / 2);
    expect(after).toBeLessThanOrEqual(21);
  });

  it('publishes the UNFILTERED tier-1/2 spread — the number the old name hid', () => {
    // 62% of the rooms the median player enters are tier 1 and 36% tier 2
    // (measured over 21,600 simulated days), so THIS is "the rooms an ordinary
    // evening is made of", with nothing taken out of it: 14 pairs, 12.00×.
    // Both ends are named in the assertion below so a content edit that moves
    // either one fails here rather than quietly re-opening the gap.
    const tier12 = everyRoom.filter(([, t]) => t <= 2);
    expect(tier12.length).toBe(14);
    const all = spreadOf(wageOf, tier12);
    expect(all, `tier-1/2 spread ${all.toFixed(2)}×`).toBeLessThanOrEqual(12.5);
    // …and the Counting House is one whole end of it. Without that single
    // 27-minute tier-2 board — a CONTENT commission REVIEW_AA §6 already asks
    // for (bank the grid across days) — the same band is 4.89×.
    const exCountingHouse = spreadOf(wageOf, tier12.filter(([k, t]) => !(k === 'sudoku' && t === 2)));
    expect(exCountingHouse, `tier-1/2 ex-Counting-House ${exCountingHouse.toFixed(2)}×`)
      .toBeLessThanOrEqual(5);
    expect(exCountingHouse).toBeLessThan(all);
  });

  it('holds 2× across tier-1/2 rooms of two minutes or more, minus the Counting House', () => {
    // THE NAME IS THE FILTER (round 25). This used to be titled "the rooms an
    // ordinary evening is made of", which is the population measured in the
    // test above — not this one. What this one excludes, by name, is the
    // Gallery (twistle t1, 1 min), the Linen Closet (forgotten-word t1/t2,
    // 1.5 min), the Study (crossword t1/t2, 1.25/1.5 min) and the Counting
    // House at tier 2. Seven of fourteen pairs remain.
    //
    // It is still worth gating, because it is the honest claim underneath the
    // dishonest one: once a room is long enough for the wage to bind rather
    // than the cozy floor, a minute really is worth a minute. What it may never
    // again be called is the evening.
    const twoMinutePlus = everyRoom.filter(([k, t]) =>
      t <= 2 && effortMinutes(k, t) >= 2 && !(k === 'sudoku' && t === 2));
    const excluded = everyRoom
      .filter(([k, t]) => t <= 2 && !twoMinutePlus.some(([k2, t2]) => k2 === k && t2 === t))
      .map(([k, t]) => `${k} t${t}`);
    expect(excluded.sort(), 'the exclusion list moved — retitle the metric').toEqual([
      'crossword t1', 'crossword t2', 'forgotten-word t1', 'forgotten-word t2',
      'sudoku t2', 'twistle t1', 'twistle t2',
    ]);
    const s = spreadOf(wageOf, twoMinutePlus);
    expect(s, `two-minute-plus spread ${s.toFixed(2)}× over ${twoMinutePlus.length} pairs`)
      .toBeLessThanOrEqual(2);
    expect(twoMinutePlus.length).toBe(7);
  });

  it('names the two rooms that still miss, so nobody has to rediscover them', () => {
    // A gate that only passes tells you nothing. These two ARE the residual
    // spread, they are both content commissions REVIEW_AA §6 asks for, and if
    // either is ever fixed this assertion fails and the bounds above tighten.
    expect(effortMinutes('twistle', 1), 'the Gallery became a puzzle — retighten 4.10h')
      .toBeLessThan(2);
    expect(effortMinutes('sudoku', 2), 'the Counting House got shorter — retighten 4.10h')
      .toBeGreaterThan(20);
  });

  it('pays the padlock arc for WORK, not for the storey alone', () => {
    // Round 22's other half: a tier-1 solve used to pay 0 keys, and rows 0–2
    // are 62% of the rooms she plays — so on two thirds of her evening, playing
    // well bought steps she did not need and nothing else. A room that asks
    // real work pays a key wherever it stands; a twenty-second word search
    // does not, or the ground floor becomes a key faucet.
    expect(solveKeys(1, 'word-web')).toBe(1);
    expect(solveKeys(1, 'hive')).toBe(1);
    expect(solveKeys(1, 'twistle')).toBe(0);
    expect(solveKeys(1, 'crossword')).toBe(0);
    expect(solveKeys(1)).toBe(0);                        // the unkeyed legacy path
    // The tier table is a FLOOR — the storeys under the padlocks are untouched.
    for (const kind of ROOM_PUZZLE_KINDS) {
      for (const tier of [2, 3] as Tier[]) {
        expect(solveKeys(tier, kind), `${kind} t${tier}`)
          .toBeGreaterThanOrEqual(KEY_SUPPLY.solveKeysByTier[tier - 1]!);
      }
    }
  });
});

/**
 * ═══ THE LADDER ═══════════════════════════════════════════════════════════
 *
 * REVIEW_AA §6: *"the hive pays at every ladder rung, not only at Full Bloom"*
 * — the room used to pay NOTHING below 70% of totalPoints, which is a quarter
 * of an hour away. The invariant that makes this safe for every published band
 * in 4.10 is that staging moves WHEN a room pays, never HOW MUCH.
 */
describe('4.10h — the long rooms pay on the way up, out of the same total', () => {
  it('stages exactly the rooms that are too long to finish in a sitting', () => {
    for (const [kind, tier] of everyRoom) {
      const stages = paysInStages(kind, tier);
      if (stages) expect(effortMinutes(kind, tier), `${kind} t${tier}`).toBeGreaterThanOrEqual(LADDER_MINUTES);
      // The Conservatory and the Counting House — the two rooms the review
      // measured at 14 and 12.5 minutes — must always be in the set.
      if (kind === 'hive' || kind === 'sudoku') expect(stages, `${kind} t${tier}`).toBe(true);
      if (ROOM_SIZE[kind] === 'micro') expect(stages, `${kind} t${tier}`).toBe(false);
    }
  });

  it('never changes what a solved room pays in total', () => {
    // Pay every rung in order, then the remainder on `solved`, and check the
    // sum against the room's price. This is the assertion that lets AAA 4.10's
    // whole daily step arithmetic stay where it was.
    const ladders: Record<string, string[]> = {
      'hive': ['tier-up:Leaf', 'tier-up:Blossom', 'tier-up:Bower', 'tier-up:Garden'],
      'sudoku': ['inked:50-left', 'inked:40-left', 'inked:30-left', 'inked:20-left', 'inked:9-left'],
      'word-web': ['group-solved:green', 'group-solved:blue', 'group-solved:yellow'],
    };
    for (const [kind, details] of Object.entries(ladders) as [RoomPuzzleKind, string[]][]) {
      for (const tier of TIERS) {
        const total = solvePayout(kind, tier);
        let earned = 0;
        let paid = 0;
        for (const detail of details) {
          const next = stageFractionOf(kind, detail, earned);
          if (next === null || next <= earned) continue;
          paid += stageSteps(kind, tier, next, paid);
          earned = next;
          expect(paid, `${kind} t${tier} overpaid on the way up`).toBeLessThan(total);
        }
        expect(paid, `${kind} t${tier} paid nothing on the way up`).toBeGreaterThan(0);
        // …and the solve pays exactly the remainder.
        expect(paid + (total - paid)).toBe(total);
      }
    }
  });

  it('is monotone, capped at the summit, and deaf to markers that are not rungs', () => {
    expect(stageFractionOf('hive', 'pangram', 0)).toBeNull();
    expect(stageFractionOf('hive', undefined, 0)).toBeNull();
    expect(stageFractionOf('hive', 'tier-up:Full Bloom', 0)).toBeNull();  // that IS the solve
    expect(stageFractionOf('crossword', 'closet-folded', 0)).toBeNull();
    expect(stageFractionOf('sudoku', 'inked:0-left', 0)).toBe(1);
    expect(stageFractionOf('sudoku', 'inked:99-left', 0)).toBe(0);
    let web = 0;
    for (let i = 0; i < WEB_GROUPS; i++) {
      const next = stageFractionOf('word-web', 'group-solved:blue', web)!;
      expect(next).toBeGreaterThan(web);
      expect(next).toBeLessThanOrEqual(1);
      web = next;
    }
    expect(web).toBe(1);
    for (const kind of ['hive', 'sudoku', 'word-web'] as RoomPuzzleKind[]) {
      expect(stageSteps(kind, 1, 1.5, 0)).toBe(solvePayout(kind, 1));   // clamped
      expect(stageSteps(kind, 1, 0.5, 99)).toBe(0);                     // never negative
    }
  });
});

/**
 * ═══ THE DERIVATION ═══════════════════════════════════════════════════════
 *
 * `ROOM_EFFORT`'s numbers are instrumented estimates, and an estimate written
 * into a constant goes stale in the reassuring direction — this repo's own
 * documented failure mode, recorded three times in `docs/STATUS.md`. So the
 * CONTENT FACTS each row was measured from are re-derived here off the shipped
 * pools. If one of these fires, the room's workload has changed and the fix is
 * to re-derive its row, never to relax the pin.
 */
describe('4.10h — the durations are pinned to the content they were measured on', () => {
  it('the Gallery: 5 target words of a ~107-word pool at tier 1', () => {
    for (const [tier, targets, pool] of [[1, 5, 100], [2, 7, 70], [3, 6, 20]] as const) {
      const group = twistles.filter((p) => p.tier === tier);
      expect(group.length).toBeGreaterThan(10);
      expect(median(group.map((p) => p.targetCount)), `twistle t${tier} targetCount`).toBe(targets);
      expect(median(group.map((p) => p.targetWords.length)), `twistle t${tier} pool`)
        .toBeGreaterThanOrEqual(pool);
    }
    // The model: a find in a dense grid runs 12–25 s, so tier 1 is 5 × ~12 s.
    for (const tier of TIERS) {
      const targets = median(twistles.filter((p) => p.tier === tier).map((p) => p.targetCount));
      const secondsPerFind = (effortMinutes('twistle', tier) * 60) / targets;
      expect(secondsPerFind, `twistle t${tier} implies ${secondsPerFind.toFixed(0)}s/find`)
        .toBeGreaterThanOrEqual(10);
      expect(secondsPerFind).toBeLessThanOrEqual(30);
    }
  });

  it('the Conservatory: Full Bloom needs ~32 of 71 words at tier 1, played perfectly', () => {
    // The room's gate is `ladderThreshold(maxScore, 70)` and the ladder's own
    // rungs are what `HIVE_STAGE_PCT` divides the payout by, so both are read
    // off the live adapter rather than transcribed.
    expect(HIVE_LADDER.at(-1)!.pct).toBe(HIVE_SOLVE_PCT);
    expect(HIVE_LADDER.at(-1)!.name).toBe('Full Bloom');
    for (const name of Object.keys(HIVE_STAGE_PCT)) {
      const rung = HIVE_LADDER.find((t) => t.name === name);
      expect(rung, `${name} is not a rung of the live ladder`).toBeDefined();
      expect(HIVE_STAGE_PCT[name]).toBe(rung!.pct);
      expect(rung!.pct).toBeLessThan(HIVE_SOLVE_PCT);
    }
    // Greedy word count to the gate: highest-scoring word first, which is the
    // BEST case and therefore the most generous possible reading of the room.
    const points = (w: string, pangrams: string[]) =>
      (w.length === 4 ? 1 : w.length) + (pangrams.includes(w) ? 7 : 0);
    for (const tier of TIERS) {
      const group = hives.filter((p) => p.tier === tier);
      const needed = group.map((p) => {
        const gate = ladderThreshold(p.totalPoints, HIVE_SOLVE_PCT);
        const sorted = p.validWords
          .map((w) => points(w, p.pangrams)).sort((a, b) => b - a);
        let score = 0;
        let n = 0;
        while (score < gate && n < sorted.length) { score += sorted[n]!; n += 1; }
        return n;
      });
      const words = median(needed);
      expect(words, `hive t${tier} needs ${words} words at best play`).toBeGreaterThan(10);
      // The repo's own instrumented finding rate is ~20 s/word, decaying as the
      // pool empties. The row must be consistent with 15–35 s per find.
      const secondsPerFind = (effortMinutes('hive', tier) * 60) / words;
      expect(secondsPerFind, `hive t${tier} implies ${secondsPerFind.toFixed(0)}s/find`)
        .toBeGreaterThanOrEqual(15);
      expect(secondsPerFind).toBeLessThanOrEqual(35);
    }
  });

  it('the Counting House: 24 givens, 57 empty cells, and no easy bin at any tier', () => {
    const blanks = (p: SudokuPuzzleLike) => 81 - p.givens.split('').filter((c) => c !== '.').length;
    for (const tier of TIERS) {
      const group = sudokus.filter((p) => p.tier === tier);
      expect(group.length).toBeGreaterThan(10);
      const med = median(group.map(blanks));
      expect(med, `sudoku t${tier} empty cells`).toBeGreaterThanOrEqual(54);
      expect(med, `sudoku t${tier} empty cells`).toBeLessThanOrEqual(59);
      // The implied seconds per placement: 13 s at tier 1 (a ladder board), 28
      // at tier 2 (98% of them need a wing, a fish or colouring).
      const secondsPerCell = (effortMinutes('sudoku', tier) * 60) / med;
      expect(secondsPerCell, `sudoku t${tier} implies ${secondsPerCell.toFixed(0)}s/cell`)
        .toBeGreaterThanOrEqual(10);
      expect(secondsPerCell).toBeLessThanOrEqual(40);
    }
    expect(SUDOKU_BLANKS, 'the ladder denominator drifted from the shipped boards')
      .toBe(median(sudokus.map(blanks)));
    expect(SUDOKU_CELLS_PER_STAGE).toBe(9);
  });

  it('the Library: every shipped board is four groups of four', () => {
    for (const p of webs) {
      expect(p.groups.length).toBe(WEB_GROUPS);
      for (const g of p.groups) expect(g.words.length).toBe(4);
    }
    // 16 tiles, one ambiguous, one herring — the review's own 3–6 minutes.
    expect(effortMinutes('word-web', 1)).toBeGreaterThanOrEqual(3);
    expect(effortMinutes('word-web', 1)).toBeLessThanOrEqual(6);
  });
});
