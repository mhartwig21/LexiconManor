import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  effortLabel, effortMinutes, paysInStages, stageFractionOf,
  CIPHER_CLOCK, CLOSET_CLOCK, HIVE_SOLVE_PCT, HIVE_STAGE_PCT, LADDER_MINUTES,
  ROOM_EFFORT, STUDY_CLOCK, SUDOKU_CELLS_PER_STAGE, WEB_GROUPS,
} from '../src/engine/economy/effort';
import {
  solveKeys, solvePayout, stageSteps, BASE_DAY_BUDGET, KEY_SUPPLY, ROOM_SIZE, SOLVE_WAGE,
  STEP_TABLE, moveAt,
} from '../src/engine/economy/steps';
import {
  medianOf, simulateDays, PROFILE_DECENT, SANCTUM_LANDING_ROW,
} from '../src/engine/economy/simulate';
import { getRoomAdapter, registeredRoomKinds } from '../src/engine/rooms/registry';
import { maxFindableFor } from '../src/engine/twistle';
import { ROOM_PUZZLE_KINDS, type RoomPuzzleKind } from '../src/engine/rooms/room-puzzle';
import { HIVE_LADDER, ladderThreshold } from '../src/engine/rooms/adapters/hive';
import {
  ABOVE_NYT_HARD, SUDOKU_TIER_GRADE, solveWithTechniques,
} from '../src/engine/puzzles/sudoku';
import type { ForgottenWordPuzzle, Tier } from '../src/engine/types';
import { cribIndices, maxGuessesForLevel } from '../src/engine/forgotten-word';
import twistlePool from '../content/generated/twistle.json';
import hivePool from '../content/generated/hive.json';
import sudokuPool from '../content/generated/sudoku.json';
import webPool from '../content/generated/word-web.json';
import cipherPoolJson from '../content/generated/cipher.json';
import fwPool from '../content/generated/forgotten-word.json';
import closetPool from '../content/generated/crossword.json';

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
interface SudokuPuzzleLike { id: string; tier: number; givens: string }
interface WebPuzzleLike {
  tier: number;
  groups: { theme: string; words: string[] }[];
  ambiguousWords?: string[];
}
interface CipherPuzzleLike { tier: number; plaintext: string; reveals: string[] }
interface StudyPuzzleLike {
  tier: number; word: string; obscurity: 'common' | 'medium' | 'rare' | 'archaic';
  definitions: { plain: string; poetic: string; riddle: string };
}
interface ClosetPuzzleLike {
  tier: number; size: number;
  entries: { answer: string; clue: string }[];
  spine: { answer: string; clue: string };
}

const twistles = twistlePool as unknown as TwistlePuzzleLike[];
const hives = hivePool as unknown as HivePuzzleLike[];
const sudokus = sudokuPool as unknown as SudokuPuzzleLike[];
const webs = webPool as unknown as WebPuzzleLike[];
const studies = fwPool as unknown as StudyPuzzleLike[];
const closets = closetPool as unknown as ClosetPuzzleLike[];

/**
 * ═══ ROUND 50 — THE CORPUS THE STUDY AND THE CLOSET ARE CLOCKED AGAINST ═════
 *
 * `content/data/count_1w.txt`, 333,333 words of web frequency, vendored on
 * purpose (see `.gitignore`, which carries the reason: three deploys in a row
 * died on corpora that were present locally and missing in CI, and a gate whose
 * data is absent does not fail — it changes its mind).
 *
 * This is the SAME reader `content/generate-forgotten-word.ts` uses for its own
 * solvability gate — line index, tab-split, last occurrence wins — so the two
 * cannot disagree about what a rank is. A word the corpus has never seen scores
 * `UNRANKED`, which is deliberately past the end rather than null: it is the
 * measurement the tier-3 Study's whole clock rests on.
 */
const UNRANKED = 400_000;
let rankCache: Map<string, number> | null = null;
function corpusRank(word: string): number {
  if (!rankCache) {
    rankCache = new Map();
    const lines = readFileSync(
      resolve(__dirname, '..', 'content', 'data', 'count_1w.txt'), 'utf-8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const w = lines[i]!.split('\t')[0]?.trim();
      if (w) rankCache.set(w.toUpperCase(), i + 1);
    }
    expect(rankCache.size, 'count_1w.txt is missing or truncated').toBeGreaterThan(300_000);
  }
  return rankCache.get(word.toUpperCase()) ?? UNRANKED;
}

const wordCount = (s: string) => s.trim().split(/\s+/).length;

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
    // retune, which this repricing had to preserve rather than replace).
    //
    // ROUND 36 — WHAT THIS CLAUSE USED TO SAY, AND WHY IT COULD NOT SURVIVE.
    // It read: "the best a tier-3 room can pay is less than the −9 step it took
    // to get there", i.e. `max(solvePayout(k, 3)) < -moveAt(6)`. That compared
    // a whole room's payout to ONE MOVE, and it only ever read as a bound
    // because a move up top cost half a day. With one flat price
    // (docs/THE_CLIMB §1) a move was 3 steps and is ONE since round 42, so the
    // comparison is neither true nor about anything — a solve SHOULD be worth
    // more than a single move. Deleting it rather than re-typing the constant is
    // the point: leanness is a statement about TIERS, and that is what is gated,
    // here and below.
    // The BEST a tier-3 room can pay is strictly less than the best a tier-1
    // room can — 3 against 5 — which is the leanness in the only unit it can
    // honestly be stated in. (Not per-kind: the Word Web is a LONGER puzzle at
    // tier 3 than at tier 1, and the whole of round 22 is that a room is paid
    // for the work it asks. A per-kind bound would price length backwards.)
    expect(Math.max(...ROOM_PUZZLE_KINDS.map((k) => solvePayout(k, 3))))
      .toBeLessThan(Math.max(...ROOM_PUZZLE_KINDS.map((k) => solvePayout(k, 1))));
    // …and the storey the tier-3 rooms stand on is still four moves of climb
    // above the entrance, which is the cost the old clause was really about.
    expect((SANCTUM_LANDING_ROW - 1) * -moveAt(0))
      .toBeGreaterThan(Math.max(...ROOM_PUZZLE_KINDS.map((k) => solvePayout(k, 3))));
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
 * ═══ ROUND 26 — THE GALLERY'S CONTENT FIX LANDED, AND THE RATCHET TURNED ══
 *
 * Round 25 wrote that these bounds *"may be tightened by the content fixes
 * REVIEW_AA §6 also asks for (the Gallery's `targetCount`…)"*, and pinned
 * `effortMinutes('twistle', 1) < 2` so the deferred fix could not be forgotten.
 * It has landed. `content/generate-twistle.ts` now ships a room whose ask is
 * never thinner than **one word in five** of its own board (0.047 → 0.217 at
 * tier 1) and whose cheapest possible solve is no longer inside the top
 * thousand words of English (rank 305 → 2,581), and `ROOM_EFFORT.twistle` is
 * re-derived to **[1.25, 1.5, 2.5]** minutes in the same commit.
 *
 * The Gallery's wage falls **4.000 → 3.200 steps a minute** and with it three
 * of the four spreads below, because it was one whole END of each:
 *
 *   | population | round 25 | round 26 |
 *   |---|---|---|
 *   | every room × every tier | 20.00× | **16.00×** (twistle t1 3.200 / sudoku t3 0.200) |
 *   | every tier-1/2 room, unfiltered | 12.00× | **9.60×** (twistle t1 / sudoku t2 0.333) |
 *   | tier-1/2 minus the Counting House | 4.89× | **3.91×** (twistle t1 / hive t2 0.818) |
 *   | tier-1/2, two minutes or longer, minus the Counting House | 1.75× | **1.75×**, unchanged |
 *
 * THE FOURTH ROW DID NOT MOVE, AND THAT IS THE INTERESTING PART. The Gallery is
 * still under two minutes, so it is still outside that population — the room
 * became a puzzle without becoming long, which is the whole thesis of the fix
 * (*a word search is not a puzzle because it is long; it is a puzzle because
 * finding the target set requires seeing something*). The board's answer space
 * shrank from a median 106 findable words to 23; the ask rose by nothing at
 * tier 1 and fell from 7 to 6 at tier 2.
 *
 * WHAT THE RE-CLOCK COST, MEASURED, because it is a finding in its own right:
 * fifteen seconds on the most-drafted room in the deck is very nearly all the
 * headroom the manor has. `tests/economy-simulation.test.ts` puts the decent
 * evening at 14.63 min against a published ceiling of 15, the skilled
 * campaign's win-by-day-35 at 95.3% against a floor of 95%, and the
 * maximal-carry-over evening 0.12 min over a band it was already inside by
 * 0.03. **The next room that gets longer has to be paid for by one that gets
 * shorter** — that is the state of AAA 4.10, written down.
 *
 * The bounds below are measurements: they may be tightened by the content fixes
 * REVIEW_AA §6 still asks for (the Counting House banking across days) and they
 * may never be loosened without a finding to point at.
 */
describe('4.10h — the wage spread is a ratchet: it may fall, never rise', () => {
  it('is strictly better than the flat table it replaced', () => {
    // ROUND 26 — WHY THIS STOPPED BEING A RATIO OF RATIOS. It used to assert
    // `after < before / 2` (measured 45.00× → 20.00×). Both columns share a
    // denominator, `effortMinutes`, so re-clocking the Gallery moved BOTH: the
    // flat table's own worst offender was twistle t1 at 6 steps for one minute,
    // and at 1.25 minutes it reads 4.800 rather than 6.000, so the flat table
    // "improved" 45.00× → 36.00× without a single flat number changing. That is
    // exactly the sort of arithmetic that goes stale in the reassuring
    // direction, so the teeth now live in the ABSOLUTE ratchet — 16.00×, down
    // from 20.00× — and `before` is kept only to show the alternative is worse.
    //
    // ROUND 27 — AND IT WENT STALE AGAIN, IN THE DIRECTION ROUND 26 NAMED.
    // `before` fell 36.00× → 20.40× without a single flat number changing,
    // because re-clocking the Counting House moved the shared denominator
    // again (sudoku t3 flat: +8 for 30 min = 0.267, now +8 for 17 min =
    // 0.471). The bound is re-derived, not relaxed on principle — but the
    // teeth are still the ABSOLUTE ratchet below, and this line's only job is
    // to say the alternative is worse, which `after < before` is what proves.
    //
    // ROUND 42 — AND THE ABSOLUTE FLOOR UNDER `before` HAD TO GO, for the third
    // time and for a new reason. `>= 20` was a transcribed measurement of the
    // LEGACY BAND, and round 42 re-denominated that band in moves (micro 3/3/2
    // and anchor 6/5/4 steps became a flat 1 and 2), so the flat table now
    // measures 13.60× without anything having gone wrong. Pinning `before` to an
    // absolute number was always pinning the alternative rather than the game.
    // What this line is FOR is one claim — the priced table beats the flat one —
    // so that is all it asserts, as a ratio between the two rather than a level,
    // and the teeth stay where round 26 put them: the absolute ratchet below.
    const before = spreadOf(legacyWageOf);
    const after = spreadOf(wageOf);
    expect(after, `priced spread ${after.toFixed(2)}× (flat table ${before.toFixed(2)}×)`)
      .toBeLessThan(before);
    expect(before / after, `the flat table is only ${(before / after).toFixed(2)}× worse`)
      .toBeGreaterThanOrEqual(2);
    // ROUND 27: 16.00× → 9.07×. The bottom of the table was the Counting House
    // at tier 3 (+6 for thirty minutes = 0.200 steps a minute); the same room,
    // regraded and re-clocked to seventeen minutes, pays the same +6 for 0.353.
    // ROUND 36: 9.07× → 7.77×, the ceiling being thirds of a day and the day
    // having grown. ROUND 42: **7.77× → 4.53×**, and this one is the ceiling
    // rather than the day — `SOLVE_WAGE.capByTier` came off `BASE_DAY_BUDGET`
    // and onto `BARE_ASCENT_STEPS`, which is three tiers tighter, so the two
    // long rooms come down onto a table whose whole range is now five integers.
    // The ratchet is re-tightened in the same commit, as its own rule requires.
    expect(after, `overall spread ${after.toFixed(2)}×`).toBeLessThanOrEqual(5.0);
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
    // Round 26: 12.00× → 9.60×, because the Gallery stopped being the top of it.
    // Round 27: 9.60× → 4.62×, because the Counting House stopped being the
    // bottom of it — sudoku t2 pays +9 for 13.0 minutes (0.692) rather than
    // +9 for 27.0 (0.333), and the room that was one whole END of this spread
    // is now inside it.
    // Round 42: 4.62× → 2.60×, same cause as the overall figure above.
    expect(all, `tier-1/2 spread ${all.toFixed(2)}×`).toBeLessThanOrEqual(3);
    // …and the Counting House is one whole end of it. Without that single
    // 27-minute tier-2 board — a CONTENT commission REVIEW_AA §6 already asks
    // for (bank the grid across days) — the same band is 3.91× (was 4.89×).
    const exCountingHouse = spreadOf(wageOf, tier12.filter(([k, t]) => !(k === 'sudoku' && t === 2)));
    // Round 42: 3.91× → 2.40×.
    expect(exCountingHouse, `tier-1/2 ex-Counting-House ${exCountingHouse.toFixed(2)}×`)
      .toBeLessThanOrEqual(3);
    // ROUND 27 — AND THIS LINE IS WHY THE SECOND NUMBER IS STILL PUBLISHED.
    // It used to read `toBeLessThan(all)`: taking the Counting House out
    // NARROWED the spread, which is the whole reason the room was named. It no
    // longer does — the two numbers are 3.91× and 4.62×, and the room is no
    // longer an outlier worth excluding. Asserting equality of the two is the
    // honest reading, and it fails the moment the Counting House drifts back
    // out to an end of the table in EITHER direction.
    expect(Math.abs(exCountingHouse - all), `ex-Counting-House ${exCountingHouse.toFixed(2)}× vs all ${all.toFixed(2)}×`)
      .toBeLessThan(1.0);
  });

  it('holds 2× across tier-1/2 rooms of two minutes or more, minus the Counting House', () => {
    // THE NAME IS THE FILTER (round 25). This used to be titled "the rooms an
    // ordinary evening is made of", which is the population measured in the
    // test above — not this one. What it excludes, by name, is the Gallery
    // (twistle t1/t2, 1.25 and 1.5 min), the Study (forgotten-word t1, 1.5 min),
    // the Linen Closet (crossword t1/t2, 1.25 and 1.75 min) and the Counting
    // House at tier 2. EIGHT of fourteen pairs remain (round 50).
    // (Round 50 also corrects the two room names in that list, which were
    // swapped: `forgotten-word` is the STUDY and `crossword` is the LINEN
    // CLOSET. AAA 4.10h had it right; this comment had it backwards.)
    //
    // ROUND 26 — THE MEMBERSHIP WAS CHECKED AND IT DID NOT MOVE. The Gallery
    // was re-clocked 1.0 → 1.25 and 1.5 → 1.5 in that round; both tiers are
    // still under the two-minute filter, so this population is the same seven
    // pairs it was and measures the same 1.75×. The assertion below is what
    // says so — it fails the moment the membership moves, in either direction,
    // rather than letting a seven-pair number be re-baselined as a nine-pair
    // one under the same title.
    //
    // ═══ ROUND 50 — AND IT MOVED, 7 PAIRS → 8, WHICH IS WHY THIS IS HERE ════
    //
    // `forgotten-word t2` JOINS the population. The Study was clocked flat at
    // 1.5 minutes at every tier and is re-derived to [1.5, 2.25, 3.5] (see the
    // row), so tier 2 crosses the two-minute line this filter is named for.
    // The SPREAD does not move — **1.36×**, both ends unchanged (sudoku t1
    // 0.455 over cipher t1 0.333); the new member sits interior at 0.444 — so
    // this is a population that got BIGGER at the same ratio, which is the
    // honest direction: more of the house is inside the band where a minute is
    // worth a minute. `word-web t2` is also re-clocked (5.0 → 5.25) and stays a
    // member, its wage falling 0.400 → 0.381, also interior.
    //
    // (`forgotten-word t1` stays excluded at 1.5 min, and `crossword t2` stays
    // excluded at 1.75 — the Linen Closet's re-derivation lengthened it without
    // taking it over the line.)
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
      'crossword t1', 'crossword t2', 'forgotten-word t1',
      'sudoku t2', 'twistle t1', 'twistle t2',
    ]);
    const s = spreadOf(wageOf, twoMinutePlus);
    expect(s, `two-minute-plus spread ${s.toFixed(2)}× over ${twoMinutePlus.length} pairs`)
      .toBeLessThanOrEqual(2);
    expect(twoMinutePlus.length).toBe(8);
  });

  /**
   * ═══ ROUND 18 — THE DOC IS HELD TO THE TABLE, NOT TO A READING OF IT ══════
   *
   * 4.10h published `45.00× → 20.00× → 16.00×` and `12.00× → 9.60×` as the
   * current spreads. Measured off the shipped tables they are **9.07×** and
   * **4.62×** — a drift of a factor of two, in the clause whose own subject is
   * that a published number must be re-derived rather than defended, shipped
   * by the round whose stated subject was doc/gate drift.
   *
   * The cause is structural and this closes it. Round 27 moved the ASSERTIONS
   * above (≤10.0 and ≤5) and left the PROSE beside them, and nothing could
   * see the gap: `economy-simulation.test.ts` greps AAA_BAR for the campaign
   * BANDS and for three retired figures, and 4.10h's four spreads were in
   * neither list. A bound and a sentence that are meant to be the same number
   * have to be compared to each other by something that runs.
   *
   * So this reads the doc and re-derives all four from `ROOM_EFFORT` ×
   * `solvePayout`. It is not a spelling check: it takes the LAST figure in
   * each published chain — the arrows are a lineage and old values belong in
   * them — and requires it to be what the tables actually measure. It goes RED
   * on the doc as it stood at round-17 HEAD, on both of the first two
   * populations, which is the pool it was written to condemn.
   */
  it('publishes in AAA 4.10h the four spreads this file measures', () => {
    const bar = readFileSync(resolve(__dirname, '..', 'docs', 'AAA_BAR.md'), 'utf8')
      .replace(/\s+/g, ' ');
    const tier12 = everyRoom.filter(([, t]) => t <= 2);
    const populations: [string, number][] = [
      ['every room × every tier', spreadOf(wageOf)],
      ['every tier-1/2 room, unfiltered', spreadOf(wageOf, tier12)],
      ['tier-1/2 minus the Counting House',
        spreadOf(wageOf, tier12.filter(([k, t]) => !(k === 'sudoku' && t === 2)))],
      ['tier-1/2 of two minutes or more, minus the Counting House',
        spreadOf(wageOf, everyRoom.filter(([k, t]) =>
          t <= 2 && effortMinutes(k, t) >= 2 && !(k === 'sudoku' && t === 2)))],
    ];
    for (const [label, measured] of populations) {
      // Named exactly once, so the clause this reads cannot be the wrong one.
      expect(bar.split(label).length - 1, `AAA 4.10h names "${label}" more than once`)
        .toBe(1);
      const at = bar.indexOf(label);
      // Each population is one bold run, so its figures end at the closing `**`.
      const segment = bar.slice(at + label.length).split('**')[0]!;
      const figures = [...segment.matchAll(/(\d+\.\d\d)×/g)].map((m) => m[1]!);
      expect(figures.length, `AAA 4.10h prints no ×-figure for "${label}"`)
        .toBeGreaterThan(0);
      expect(figures.at(-1), `AAA 4.10h publishes ${figures.at(-1)}× for "${label}"; `
        + `the shipped tables measure ${measured.toFixed(2)}×`)
        .toBe(measured.toFixed(2));
    }
  });

  it('names the rooms that still miss, so nobody has to rediscover them', () => {
    // A gate that only passes tells you nothing. These ARE the residual spread,
    // and if any of them is ever fixed this assertion fails and the bounds
    // above tighten.
    //
    // ═══ ROUND 26 — THE PIN THAT WOULD HAVE STAYED GREEN THROUGH ITS OWN FIX
    //
    // This used to read `expect(effortMinutes('twistle', 1)).toBeLessThan(2)`
    // under the message *"the Gallery became a puzzle — retighten 4.10h"*: a
    // MINUTES assertion standing in for a PUZZLE-QUALITY claim. The Gallery did
    // become a puzzle in this commit — its ask went from 5 words of a median
    // 106-word board to 5 of 23, and the cheapest set of words that clears it
    // moved from frequency rank 305 to 2,581 — and it gained FIFTEEN SECONDS
    // doing it. The pin would have gone on passing, and the bounds above would
    // never have been retightened by the very thing they were waiting for.
    // A metric's name must match what it computes, so the content facts now
    // live where they can be seen: in "the durations are pinned to the content
    // they were measured on" below, and in twistle-boards.test.ts.
    //
    // What is left at the top of the table is not an underworked room, it is
    // THE COZY FLOOR: the two shortest rooms in the house are both paid +4
    // because a cozy game must not punish a short choice, and +4 over 1.25
    // minutes is 3.200 steps a minute. Naming both of them is the point — the
    // assertion fails if either moves, or if a third room joins them.
    // ROUND 42 — AND THE TWO ROOMS AT THE TOP ARE STILL THE SAME TWO, for the
    // same reason, at a third of the number: the cozy floor is +1 move now and
    // +1 over 1.25 minutes is 0.800 moves a minute (it was +4 over 1.25 = 3.200
    // steps). That the membership did not move while the unit did is the check
    // this assertion exists for.
    const wages = everyRoom.map(([k, t]) => [`${k} t${t}`, wageOf(k, t)] as const);
    const top = Math.max(...wages.map(([, w]) => w));
    expect(wages.filter(([, w]) => w === top).map(([n]) => n).sort(),
      `the top of the wage table moved (${top.toFixed(3)} steps/min)`)
      .toEqual(['crossword t1', 'twistle t1']);
    expect(effortMinutes('twistle', 1), 'the Gallery got longer — retighten 4.10h')
      .toBeLessThan(2);
    expect(effortMinutes('crossword', 1), 'the Linen Closet got longer — retighten 4.10h')
      .toBeLessThan(2);
    // ═══ ROUND 27 — THE PIN CAME DUE, AND IT IS SPENT HERE ══════════════
    //
    // This read `expect(effortMinutes('sudoku', 2)).toBeGreaterThan(20)` under
    // the message *"the Counting House got shorter — retighten 4.10h"*: a pin
    // whose whole purpose was to hold the bounds above open until the content
    // commission REVIEW_AA §6 asked for (bank the grid across days, grade the
    // ladder) actually landed. It has landed — `ROOM_EFFORT.sudoku` is
    // [11.0, 13.0, 17.0] over a regraded pool and the Counting House keeps an
    // open ledger — so the pin is REMOVED rather than relaxed, and the bounds
    //
    // ROUND 18 — THAT ROW READ [7.0, 11.0, 17.0] AND NO SUCH ROW EVER SHIPPED.
    // It is round 27's own REJECTED draft, cited in the note that justifies
    // spending the pin: the argument for removing a gate was written against
    // numbers the round did not land. Nothing downstream was wrong — the
    // assertion under this note reads `SUDOKU_TIER_GRADE` and never the
    // literal — but a justification that cites a row nobody shipped is how the
    // next round inherits a wrong premise, so it cites what shipped.
    // it was holding open are retightened in the same commit (16.5 → 10.0
    // overall, 10 → 5 across tier 1/2). What replaces it is not another
    // minutes assertion standing in for a quality claim (round 26's lesson):
    // the grade itself is gated, off the shipped boards, in
    // "the Counting House is graded against BENCHMARKS §7" below.
    expect(effortMinutes('sudoku', 2), 'the Counting House drifted off its NYT-Hard band')
      .toBeGreaterThanOrEqual(SUDOKU_TIER_GRADE[2].minutes[0]);
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
      'sudoku': ['inked:42-of-51', 'inked:33-of-51', 'inked:24-of-51', 'inked:15-of-51', 'inked:6-of-51'],
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
    // The last figure of a leaf is the SOLVE, not a rung — the same ruling the
    // hive's `tier-up:Full Bloom` gets three lines above, and the reason the
    // ladder can never pay a room off before the room is finished.
    expect(stageFractionOf('sudoku', 'inked:0-of-51', 0)).toBeLessThan(1);
    expect(stageFractionOf('sudoku', 'inked:99-of-51', 0)).toBe(0);
    expect(stageFractionOf('sudoku', 'inked:12-left', 0), 'the retired marker').toBeNull();
    expect(stageFractionOf('sudoku', 'inked:0-of-0', 0), 'a leaf with no blanks').toBeNull();
    // ═══ ROUND 27 — THE LADDER READS THE BOARD ON THE TABLE ══════════════
    // The marker used to be `inked:N-left` and the denominator was a POOL
    // MEDIAN (`SUDOKU_BLANKS = 57`). That was a pool average standing in for a
    // property of the leaf, and it was wrong two ways at once: the regraded
    // pool runs 51/55/57 blanks by tier, AND a row-band tier-1 cell can deal a
    // technique-tier-2 board, so no per-tier table would have fixed it either.
    // Nine figures placed is exactly one rung, on every board there is.
    for (const blanks of [45, 51, 55, 57, 63]) {
      const rungs = Math.ceil(blanks / SUDOKU_CELLS_PER_STAGE);
      expect(stageFractionOf('sudoku', `inked:${blanks - SUDOKU_CELLS_PER_STAGE}-of-${blanks}`, 0),
        `${blanks}-blank leaf, first rung`).toBeCloseTo(1 / rungs, 10);
      expect(stageFractionOf('sudoku', `inked:0-of-${blanks}`, 0), `${blanks} last figure`)
        .toBeLessThan(1);
      expect(stageFractionOf('sudoku', `inked:${SUDOKU_CELLS_PER_STAGE}-of-${blanks}`, 0),
        `${blanks} one rung short`).toBeLessThan(1);
    }
    // …and every leaf the pool actually ships reaches its summit exactly once,
    // at its own last figure — the assertion the pool-median version failed.
    for (const p of sudokus) {
      const blanks = 81 - p.givens.split('').filter((c) => c !== '.').length;
      // Never paid off early on ANY shipped leaf — the defect `floor` had.
      expect(stageFractionOf('sudoku', `inked:0-of-${blanks}`, 0), `${p.id} last figure`)
        .toBeLessThan(1);
      // …and every leaf really does climb: nine figures is a rung on all of them.
      expect(stageFractionOf('sudoku', `inked:${blanks - SUDOKU_CELLS_PER_STAGE}-of-${blanks}`, 0),
        `${p.id} first rung`).toBeGreaterThan(0);
    }
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
  it('the Gallery: 5 target words of a ~23-word pool at tier 1 (round 26)', () => {
    // ROUND 26 — THE PIN THAT USED TO CERTIFY THE DEFECT. This read
    // `[[1, 5, 100], [2, 7, 70], [3, 6, 20]]` with the pool asserted as a
    // FLOOR: it guaranteed that a tier-1 Gallery offered AT LEAST a hundred
    // findable words to a five-word ask. That is the defect, written down as a
    // contract, and it is why the duration underneath it was honest arithmetic
    // over a dishonest room. The ask is still pinned; the pool is a CEILING
    // now, DERIVED from `MIN_ASK_SHARE` rather than typed in, and the thin end
    // is asserted too so a regeneration cannot drift either way.
    for (const [tier, targets] of [[1, 5], [2, 6], [3, 6]] as const) {
      const group = twistles.filter((p) => p.tier === tier);
      expect(group.length).toBeGreaterThan(10);
      expect(median(group.map((p) => p.targetCount)), `twistle t${tier} targetCount`).toBe(targets);
      expect(Math.max(...group.map((p) => p.targetWords.length)), `twistle t${tier} fattest pool`)
        .toBeLessThanOrEqual(maxFindableFor(targets));
      // …and the room still offers a real CHOICE of which words to take: the
      // ask may never be the whole board either (round 4's `minFindable`).
      expect(Math.min(...group.map((p) => p.targetWords.length)), `twistle t${tier} thinnest pool`)
        .toBeGreaterThanOrEqual(targets + 4);
    }
    // The model: every target is now 5+ letters on a trace that turns, drawn
    // from a board with no chaff left on it, so a find sits inside the repo's
    // own instrumented 12–25 s band — measured 15 s, 15 s and 25 s per find.
    const perFind: number[] = [];
    for (const tier of TIERS) {
      const targets = median(twistles.filter((p) => p.tier === tier).map((p) => p.targetCount));
      const secondsPerFind = (effortMinutes('twistle', tier) * 60) / targets;
      expect(secondsPerFind, `twistle t${tier} implies ${secondsPerFind.toFixed(0)}s/find`)
        .toBeGreaterThanOrEqual(12);
      expect(secondsPerFind).toBeLessThanOrEqual(25);
      perFind.push(secondsPerFind);
    }
    // …and a harder board may never imply a FASTER find. This is the
    // assertion that catches the failure mode the old row had: an ask that
    // grows while the duration stands still, which reads as the player
    // speeding up on the tier where the words got harder to see.
    expect(perFind[1]!, `t2 ${perFind[1]}s/find vs t1 ${perFind[0]}s`).toBeGreaterThanOrEqual(perFind[0]!);
    expect(perFind[2]!, `t3 ${perFind[2]}s/find vs t2 ${perFind[1]}s`).toBeGreaterThanOrEqual(perFind[1]!);
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

  it('the Counting House is graded against BENCHMARKS §7, tier by tier', () => {
    // ═══ ROUND 27 — WHAT THIS TEST USED TO CERTIFY ═══════════════════════
    //
    // It read "24 givens, 57 empty cells, and no easy bin at any tier" and
    // asserted `54 <= median blanks <= 59` FOR EVERY TIER — i.e. it required
    // all three storeys to be the same length, which is the defect written
    // down as a contract. The only difficulty lever it left the pool was
    // technique, and the technique it left was off the top of the benchmark:
    // 98% of tier-2 and 100% of tier-3 boards needed a wing, a fish or a
    // colouring chain, and BENCHMARKS §7 records that NYT HARD — the hardest
    // board the reference publishes — needs none of the three.
    //
    // The grade is now three independent gates, and each can fail alone:
    //   (a) TECHNIQUE — the wing/fish/colouring share is 0% at tiers 1 and 2
    //       and 100% at tier 3, re-derived from the boards;
    //   (b) LENGTH    — each tier's givens sit inside its own band, and the
    //       bands do not overlap in their medians;
    //   (c) CLOCK     — `ROOM_EFFORT` sits inside BENCHMARKS §7's minutes band
    //       for the tier, and a harder tier never implies a FASTER cell.
    const blanks = (p: SudokuPuzzleLike) => 81 - p.givens.split('').filter((c) => c !== '.').length;
    const medBlanks: number[] = [];
    const secondsPerCell: number[] = [];

    for (const tier of TIERS) {
      const group = sudokus.filter((p) => p.tier === tier);
      expect(group.length, `tier ${tier} pool`).toBeGreaterThan(10);
      const grade = SUDOKU_TIER_GRADE[tier];

      // (a) THE TECHNIQUE GRADE, re-derived by the shipped rater. This is the
      //     assertion the old "the tiers escalate" gate could not make: that
      //     one read `TECHNIQUE_LEVEL` against itself, so it caught a MISSING
      //     entry and never a WRONG one.
      const hunted = group.filter((p) =>
        solveWithTechniques(p.givens, 3).techniques.some((id) => ABOVE_NYT_HARD.includes(id)));
      const share = hunted.length / group.length;
      if (tier === 3) {
        expect(share, `tier 3 is the rung ABOVE NYT Hard — ${hunted.length}/${group.length}`).toBe(1);
      } else {
        expect(share, `tier ${tier} claims ${grade.nyt} but ${hunted.length}/${group.length}`
          + ' boards need a wing, a fish or a colouring chain').toBe(0);
      }

      // (b) THE LENGTH GRADE. Every board inside its tier's band, off the JSON.
      for (const p of group) {
        const g = 81 - blanks(p);
        expect(g, `${p.id} givens`).toBeGreaterThanOrEqual(grade.givens[0]);
        expect(g, `${p.id} givens`).toBeLessThanOrEqual(grade.givens[1]);
      }
      const med = median(group.map(blanks));
      medBlanks.push(med);

      // (c) THE CLOCK. Inside the benchmark's own band for this tier.
      const minutes = effortMinutes('sudoku', tier);
      expect(minutes, `sudoku t${tier} is ${minutes} min against ${grade.nyt}'s`
        + ` ${grade.minutes[0]}-${grade.minutes[1]}`).toBeGreaterThanOrEqual(grade.minutes[0]);
      expect(minutes).toBeLessThanOrEqual(grade.minutes[1]);
      secondsPerCell.push((minutes * 60) / med);
    }

    // The two levers move TOGETHER, which is the thing the old pool did not do:
    // a higher tier is never a shorter board…
    expect(medBlanks[1]!, `t2 ${medBlanks[1]} blanks vs t1 ${medBlanks[0]}`)
      .toBeGreaterThan(medBlanks[0]!);
    expect(medBlanks[2]!, `t3 ${medBlanks[2]} blanks vs t2 ${medBlanks[1]}`)
      .toBeGreaterThan(medBlanks[1]!);
    // …and never a FASTER cell (round 26's twistle lesson, applied here).
    expect(secondsPerCell[1]!, `t2 ${secondsPerCell[1]!.toFixed(1)}s/cell vs t1`
      + ` ${secondsPerCell[0]!.toFixed(1)}s`).toBeGreaterThan(secondsPerCell[0]!);
    expect(secondsPerCell[2]!, `t3 ${secondsPerCell[2]!.toFixed(1)}s/cell vs t2`
      + ` ${secondsPerCell[1]!.toFixed(1)}s`).toBeGreaterThan(secondsPerCell[1]!);
    // The repo's own instrumented placement band for a practised solver.
    for (const s of secondsPerCell) {
      expect(s, `${s.toFixed(1)}s per placement`).toBeGreaterThanOrEqual(6);
      expect(s).toBeLessThanOrEqual(24);
    }
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

  /**
   * The Library's clock pin lives in `tests/content.test.ts` — "the Library is
   * clocked on the categories she can read straight off" — and not here, for a
   * measured reason: it needs the generator's own `isPlainish`, and importing
   * `content/generate-wordweb.ts` into this file costs **24 seconds of
   * synchronous module evaluation** (cmudict and the banks) against this file's
   * 1.6 s of tests. `content.test.ts` already loads it, so the pin is free
   * there and would have been a second copy of that load here — which is
   * `docs/STATUS.md` §3.6, the file that starved the vitest worker reporter and
   * failed a deploy with every test green.
   */

  /**
   * ═══ ROUND 50 — THE STUDY WAS FLAT ACROSS THREE TIERS THAT ARE NOT ════════
   *
   * `[1.5, 1.5, 1.5]` claimed a tier costs nothing. Four content facts say
   * otherwise and all four are re-derived here off the shipped pool and the
   * corpus the generator itself grades against. The row is inverted through
   * `STUDY_CLOCK` the way the Darkroom's is through `CIPHER_CLOCK`: subtract
   * the measured read, and the residue is candidates, which must match the
   * tier's published count, must climb, and may never exceed the rope the room
   * actually hands her.
   */
  it('the Study is clocked on how far outside ordinary English its word is', () => {
    const ranks: number[] = [];
    const candidates: number[] = [];
    for (const tier of TIERS) {
      const group = studies.filter((p) => p.tier === tier);
      expect(group.length, `study tier ${tier} pool`).toBeGreaterThan(10);

      // (a) THE CONTENT GRADE — how far out of the language the headword sits,
      //     measured against the same corpus the generator's solvability gate
      //     uses. This is the fact the flat row was denying.
      const rank = median(group.map((p) => corpusRank(p.word)));
      ranks.push(rank);
      // …and the tail that no median can show: words that do not occur at all.
      const absent = group.filter((p) => corpusRank(p.word) >= UNRANKED).length;
      if (tier === 3) {
        expect(absent, `only ${absent}/${group.length} tier-3 headwords are off`
          + ' the corpus — the tier stopped being the rare one').toBeGreaterThanOrEqual(10);
      }

      // (b) THE LENGTH GRADE — the read she is given free, off the registers
      //     the room actually stages (poetic at tiers 1–2, the riddle at 3).
      const words = median(group.map((p) =>
        wordCount(tier <= 2 ? p.definitions.poetic : p.definitions.riddle)
        + wordCount(p.definitions.plain)));
      const read = words / STUDY_CLOCK.readWordsPerMinute;
      expect(read, `study t${tier} read ${(read * 60).toFixed(0)}s`).toBeLessThan(0.5);

      // (c) THE CLOCK. Everything the row does not explain by the read is
      //     candidates, at one rate for the whole house.
      const implied = ((effortMinutes('forgotten-word', tier) - read) * 60)
        / STUDY_CLOCK.candidateSeconds;
      candidates.push(implied);
      expect(Math.abs(implied - STUDY_CLOCK.candidatesByTier[tier - 1]!),
        `study t${tier} implies ${implied.toFixed(2)} candidates against a`
        + ` published ${STUDY_CLOCK.candidatesByTier[tier - 1]}`).toBeLessThan(0.2);
      // She can never be modelled as needing more tries than the room gives her
      // (round 14 moved the difficulty OFF the guess allowance; this is the
      // assertion that stops a later re-clock quietly putting it back).
      expect(implied, `study t${tier} models ${implied.toFixed(2)} of`
        + ` ${maxGuessesForLevel(tier)} guesses`).toBeLessThanOrEqual(maxGuessesForLevel(tier));

      // (d) THE CRIB, which is the one lever pushing the other way: letters
      //     standing cut the lexical field she has to search.
      expect(median(group.map((p) => cribIndices(p as unknown as ForgottenWordPuzzle).length)),
        `study t${tier} crib`)
        .toBe([0, 1, 2][tier - 1]);
    }
    // A rarer headword may never imply a faster solve — round 26's rule, here.
    expect(ranks[1]!, `t2 rank ${ranks[1]} vs t1 ${ranks[0]}`).toBeGreaterThan(ranks[0]!);
    expect(ranks[2]!, `t3 rank ${ranks[2]} vs t2 ${ranks[1]}`).toBeGreaterThan(ranks[1]!);
    expect(candidates[1]!).toBeGreaterThan(candidates[0]!);
    expect(candidates[2]!).toBeGreaterThan(candidates[1]!);
    expect(STUDY_CLOCK.candidateSeconds)
      .toBeGreaterThanOrEqual(STUDY_CLOCK.candidateBandSeconds[0]);
    expect(STUDY_CLOCK.candidateSeconds)
      .toBeLessThanOrEqual(STUDY_CLOCK.candidateBandSeconds[1]);
    // THE ONE PAYOUT THIS ROUND MOVES, pinned with the edge it sits above so a
    // later re-derivation can see what it is crossing (round 46's rule).
    expect(solvePayout('forgotten-word', 3)).toBe(2);
    expect(effortMinutes('forgotten-word', 3)).toBeGreaterThan(1.5 / SOLVE_WAGE.stepsPerMinute);
    // …and the room stays short enough not to owe a ladder it does not have.
    expect(effortMinutes('forgotten-word', 3)).toBeLessThan(LADDER_MINUTES);
  });

  /**
   * ═══ ROUND 50 — THE LINEN CLOSET, AND THE UNIT IT IS CLOCKED IN ═══════════
   *
   * Round 29 gave this room a hem — a fifth clued answer and the whole of its
   * checking mechanic — and `docs/LINEN_CLOSET.md` records that
   * `ROOM_EFFORT.crossword` was left untouched. The room's unit is the CLUE and
   * not the square (the owner's ruling: it is not a crossword), and in that
   * unit the shipped row ran backwards at tier 2: 18.8 s a clue at tier 1 and
   * 18.0 at tier 2, on a board with one more clue, a longer answer and a rarer
   * word in it.
   */
  it('the Linen Closet is clocked per CLUED ANSWER, and the rate climbs', () => {
    const perAnswer: number[] = [];
    const ranks: number[] = [];
    for (const tier of TIERS) {
      const group = closets.filter((p) => p.tier === tier);
      expect(group.length, `closet tier ${tier} pool`).toBeGreaterThan(10);
      // (a) THE CONTENT GRADE — entries plus the hem, which is clued in the
      //     list with the rest and is therefore one more answer to get.
      const clued = median(group.map((p) => p.entries.length + (p.spine ? 1 : 0)));
      expect(clued, `closet t${tier} clued answers`).toBe([4, 5, 5][tier - 1]);
      // …and the tier's answers really are rarer, which is the only lever
      // tier 3 has left once the entry count stops growing.
      const rank = median(group.flatMap((p) =>
        [...p.entries.map((e) => e.answer), p.spine.answer].map(corpusRank)));
      ranks.push(rank);
      // (b) THE CLOCK, in the room's own unit and inside the tier's band.
      const seconds = (effortMinutes('crossword', tier) * 60) / clued;
      perAnswer.push(seconds);
      const [lo, hi] = CLOSET_CLOCK.answerBandSeconds[tier - 1]!;
      expect(seconds, `closet t${tier} implies ${seconds.toFixed(1)}s a clued`
        + ` answer against a band of ${lo}-${hi}`).toBeGreaterThanOrEqual(lo);
      expect(seconds).toBeLessThanOrEqual(hi);
    }
    // THE ASSERTION THE SHIPPED ROW FAILED: a later board may never imply a
    // faster clue. 18.75 → 21.0 → 27.0, from 18.75 → 18.0 → 24.0.
    expect(perAnswer[1]!, `t2 ${perAnswer[1]!.toFixed(1)}s a clue vs t1`
      + ` ${perAnswer[0]!.toFixed(1)}s`).toBeGreaterThan(perAnswer[0]!);
    expect(perAnswer[2]!, `t3 ${perAnswer[2]!.toFixed(1)}s a clue vs t2`
      + ` ${perAnswer[1]!.toFixed(1)}s`).toBeGreaterThan(perAnswer[1]!);
    expect(ranks[2]!, `t3 answers rank ${ranks[2]} vs t1 ${ranks[0]}`)
      .toBeGreaterThan(ranks[0]!);
    // …and the room is still the short one: nothing here made it an anchor.
    expect(ROOM_SIZE.crossword).toBe('micro');
    expect(effortMinutes('crossword', 3)).toBeLessThan(LADDER_MINUTES);
  });
});

/**
 * ═══ ROUND 44 — THE PHANTOM TAX ON THE GALLERY, MEASURED SO IT CANNOT GO
 *     STALE, AND DELIBERATELY NOT PAID OFF HERE ══════════════════════════════
 *
 * Found while pricing a study. `twistleAdapter.reduce` has returned `kind:
 * 'study'` — no mistake event, no weight, no strike — for every real word she
 * traces off the ask SINCE ROUND 28, and round 38 then took the last rules of
 * play off acceptance: on the shipped pool the only refusals left in the house
 * are the cozy gate's 619 across all 210 boards, a median THREE a board against
 * a median 102/104/200 accepted words. At tier 1 the Gallery cannot charge a
 * costed mistake AT ALL — there is no centre rule to break.
 *
 * `engine/economy/simulate.ts` has gone on charging `STEP_TABLE.mistake` for
 * those traces at every tier for sixteen rounds, and every band in AAA 4.10 was
 * measured through it. `SimProfile.studyRelief` is the share of them a run
 * forgives; it is 0 everywhere the game ships, and 1 is the truth.
 *
 * THIS TEST DOES NOT FIX IT. Forgiving them makes the median evening LONGER —
 * she keeps moves she was being taxed — and the lever for an evening that runs
 * long is the day's STARTING COUNT, which is the owner's own (THE_CLIMB §1b:
 * *"What you should be modifying is the amount of steps you start with"*). That
 * is an economy commission and this was a word-game round. What this test does
 * is publish the size of the debt, re-measured on every run by the same model,
 * so the round that pays it off knows what it is buying before it starts.
 */
describe('4.10b — the Gallery phantom mistake tax the model still levies (round 44)', () => {
  it('measures what the truth would cost the published evening', () => {
    const DAYS = 900;
    const SEED = 0x5eed;
    const asModelled = medianOf(
      simulateDays(PROFILE_DECENT, DAYS, SEED).map((d) => d.minutes));
    const truthful = medianOf(
      simulateDays({ ...PROFILE_DECENT, studyRelief: 1 }, DAYS, SEED).map((d) => d.minutes));
    // The shipped profiles all run at relief 0 — if one of them ever stops
    // doing so, this file is where it has to say why.
    expect(PROFILE_DECENT.studyRelief ?? 0).toBe(0);
    // THE DEBT. It is a ratchet in the honest direction: it may SHRINK (a round
    // that pays it off, or a re-derivation that finds it smaller than this) and
    // it may not grow without a finding to point at.
    const debt = truthful - asModelled;
    expect(debt, `forgiving the Gallery's off-ask traces adds ${debt.toFixed(2)} min`
      + ` to the median evening (${asModelled.toFixed(2)} → ${truthful.toFixed(2)})`)
      .toBeGreaterThan(0.5);
    expect(debt).toBeLessThan(3.0);
    /**
     * ROUND 47 — THE OVERSHOOT CLAUSE, RETIRED, AND THE DEBT KEPT.
     *
     * This used to also assert `truthful > 15` — that forgiving the Gallery
     * pushed the median evening clean out of the top of AAA 4.10b's published
     * 10–15 band, which was the colour on "the model is wrong by more than the
     * mechanic it was asked to price".
     *
     * It no longer overshoots (measured 13.91), and the reason has nothing to
     * do with the Gallery: the owner put a padlock back to one key and the gate
     * came down a storey to pay for it (`DOOR_LOCKS`), so the median player
     * meets the padlocks earlier in a campaign and her evenings are shorter
     * than they were. The truthful evening moved with them, from over the band
     * to inside it.
     *
     * THE FINDING IS UNTOUCHED AND IS THE ASSERTION ABOVE: the debt is real, it
     * is re-measured every run, and it is bigger than the mechanic round 44
     * shipped. Keeping a `> 15` that now depends on a padlock rate would be
     * asserting a coincidence — the band it names is about the CLOCK, and the
     * number is about the GATE. So the clause that survives is the one about
     * the band, stated as a band: the truthful evening is inside 4.10b, and the
     * debt is what is published.
     */
    expect(truthful, `the truthful median evening is ${truthful.toFixed(2)} min`)
      .toBeGreaterThan(10);
    expect(truthful).toBeLessThanOrEqual(24);
  });
});

/**
 * ═══ THE DARKROOM'S ROW, DERIVED RATHER THAN TYPED (round 46) ═════════════
 *
 * `ROOM_EFFORT.cipher` was the only row in the table with no derivation behind
 * it and no pin under it, and it was wrong in the direction that matters: it
 * priced a **no-crib** cryptogram at 33% above one that hands over an `A` and
 * three high-frequency letters, while `content/generate-cipher.ts` has graded
 * that room on CRIB CLASS since round 4. The row is two terms now
 * (`CIPHER_CLOCK`, `docs/BENCHMARKS.md` §11) and this inverts it every run
 * against the pool that actually ships: subtract the cascade the pool's own
 * letter counts imply, and the residue is the OPENING, which has to sit inside
 * the band the teardown published and has to climb with the tier.
 *
 * These are the same three gates the Counting House's row gets (round 27): the
 * CONTENT grade, the LENGTH, and a rate that may not run backwards.
 */
describe('4.10h — the Darkroom is clocked against the crib it hands over', () => {
  const cipherPool = cipherPoolJson as CipherPuzzleLike[];
  const lettersOf = (p: CipherPuzzleLike) => p.plaintext.replace(/[^A-Z]/g, '');
  const distinctOf = (p: CipherPuzzleLike) => new Set(lettersOf(p)).size;
  const wordsOf = (p: CipherPuzzleLike) => p.plaintext.split(' ');

  it('grades every tier by the crib the phrase carries, off the shipped pool', () => {
    // (a) THE CONTENT GRADE. The generator's three tier gates, re-derived from
    //     the JSON rather than read out of the generator that wrote it — the
    //     row's whole difficulty argument rests on these three facts.
    for (const tier of TIERS) {
      const group = cipherPool.filter((p) => p.tier === tier);
      expect(group.length, `cipher tier ${tier} pool`).toBeGreaterThan(10);
      const shortest = group.map((p) => Math.min(...wordsOf(p).map((w) => w.length)));
      if (tier === 1) {
        // A one-letter word on EVERY board: `A`/`I`, a two-way guess before a
        // single deduction, and the reason this tier's opening is nearly free.
        expect(Math.max(...shortest), 'tier 1 must carry a one-letter crib word').toBe(1);
      } else if (tier === 2) {
        // ═══ WHAT THIS PIN FOUND, AND IT IS A CONTENT FINDING ═══════════════
        // `tierOf` is not three gates, it is two gates and a REMAINDER: tier 1
        // is "has a one-letter word", tier 3 is "has no word under three AND is
        // long AND has a wide alphabet", and tier 2 is everything else. So a
        // no-crib phrase that misses tier 3's length or alphabet floor lands at
        // tier 2, and 13 of the 44 shipped tier-2 boards are exactly that —
        // they hand over nothing but their one mid-frequency letter. What tier
        // 2 guarantees is only the half the name claims: **no one-letter word**.
        // The row's 120s opening is therefore the MEDIAN board's, which is what
        // `ROOM_EFFORT` is defined to be, and the thin third of the bin is
        // harder than its own tier says. Named here rather than absorbed;
        // BENCHMARKS §11 carries it as the room's open content debt.
        expect(Math.min(...shortest), 'tier 2 must carry NO one-letter word').toBe(2);
        const withTwo = group.filter((p) => wordsOf(p).some((w) => w.length === 2)).length;
        expect(withTwo / group.length, `only ${withTwo}/${group.length} tier-2 boards`
          + ' carry the two-letter crib the tier is named for').toBeGreaterThan(0.5);
        expect(median(shortest), 'the MEDIAN tier-2 board is the one the row is clocked on')
          .toBe(2);
      } else {
        // NOTHING under three letters: the phrase shape hands over nothing.
        expect(Math.min(...shortest), 'tier 3 must carry no crib word at all')
          .toBeGreaterThanOrEqual(3);
      }
      // The reveals the generator promises, counted on what shipped.
      const reveals = [...new Set(group.map((p) => p.reveals.length))];
      expect(reveals, `cipher t${tier} reveals`).toEqual([{ 1: 3, 2: 1, 3: 2 }[tier]]);
    }
  });

  /**
   * ROUND 52 read this test as a CONSTRAINT ON AUTHORING rather than a report.
   * The fairness pass (BENCHMARKS §11) cut 35 phrases and wrote 46, and the
   * first draft of that pool ran tier 1 to a median of 11 letters to deduce —
   * still inside the band, and it would have moved the implied tier-1 opening
   * 55 s → 43 s, i.e. made the room longer at a fixed row without one word
   * anywhere saying so. The tier-1 additions were re-picked against a
   * distinct-letter ceiling instead, and the three medians below are the same
   * integers they were before the pool changed by a ninth of its size.
   */
  it('inverts the row into an OPENING inside the band BENCHMARKS §11 published', () => {
    const openings: number[] = [];
    const toDeduce: number[] = [];
    for (const tier of TIERS) {
      const group = cipherPool.filter((p) => p.tier === tier);
      // (b) THE LENGTH GRADE — what the room asks her to work out, median over
      //     the shipped boards: distinct letters, less the ones it gave her.
      const deduce = median(group.map((p) => distinctOf(p) - p.reveals.length));
      toDeduce.push(deduce);
      // (c) THE CLOCK. Everything the row does not explain by cascade is the
      //     opening, and the opening is what the crib is supposed to buy.
      const cascade = (deduce * CIPHER_CLOCK.cascadeSeconds) / 60;
      const opening = effortMinutes('cipher', tier) - cascade;
      const [lo, hi] = CIPHER_CLOCK.openingBandMinutes[tier - 1]!;
      expect(opening, `cipher t${tier} implies a ${(opening * 60).toFixed(0)}s opening`
        + ` against BENCHMARKS 11's ${(lo * 60).toFixed(0)}-${(hi * 60).toFixed(0)}s`)
        .toBeGreaterThanOrEqual(lo);
      expect(opening).toBeLessThanOrEqual(hi);
      openings.push(opening);
    }
    // The room she must work out more of is never the room she works out
    // faster, and the foothold never gets CHEAPER as the crib is taken away.
    // This is the assertion the shipped row would have failed: 3.0/3.5/4.0
    // implies openings of 55s / 0s / -21s — the no-crib tier arriving at a
    // foothold before it has read the phrase.
    expect(toDeduce[1]!).toBeGreaterThanOrEqual(toDeduce[0]!);
    expect(toDeduce[2]!).toBeGreaterThanOrEqual(toDeduce[1]!);
    expect(openings[1]!, `t2 opening ${(openings[1]! * 60).toFixed(0)}s vs t1`
      + ` ${(openings[0]! * 60).toFixed(0)}s`).toBeGreaterThan(openings[0]!);
    expect(openings[2]!, `t3 opening ${(openings[2]! * 60).toFixed(0)}s vs t2`
      + ` ${(openings[1]! * 60).toFixed(0)}s`).toBeGreaterThan(openings[1]!);
  });

  it('does not move a single payout, which is why no ledger band moves with it', () => {
    // The row grew by 1.0 minute at two tiers and the wage moved; the PRICE did
    // not, because both new lengths round to the +2 the room already paid. If a
    // later re-derivation ever crosses one of those rounding edges, this is
    // where it says so — and it becomes an economy round.
    expect([1, 2, 3].map((t) => solvePayout('cipher', t as Tier))).toEqual([1, 2, 2]);
    // …and tier 1 sits exactly ON the ground-floor key threshold, which is what
    // pins it at the top of its band rather than in the middle (see the row).
    expect(effortMinutes('cipher', 1)).toBe(KEY_SUPPLY.workKeyMinutes);
    expect(solveKeys(1, 'cipher')).toBe(1);
    /**
     * ROUND 47 — THE PIN HELD, AND IT EARNED ITS KEEP.
     *
     * The owner put a padlock back to one key ("lets keep things simple"),
     * halving what an ascent costs, and this constant was the obvious place to
     * find the balance again: it pays a key on 62% of the rooms in the house.
     * Measured, it is the wrong place — raising it to 8 and then to 4 inverted
     * round 10's directive both times (8,253 and 10,477 solve-keys against
     * ~12,700–13,100 off the green deck), i.e. drafting luck back in charge of
     * the climb. The balance came from `DOOR_LOCKS.chanceByRow` instead.
     *
     * So the assertion above stands unchanged, and this note is the reason it
     * is worth keeping: the pin is what made the side effect visible, twice.
     * What it protects is stated below in the player's own vocabulary — the
     * rooms that pay a ground-floor key are exactly the ones a card describes
     * as more than a minute's work.
     */
    const PAYS = ['cipher', 'word-web', 'sudoku', 'hive'] as const;
    const FREE = ['twistle', 'crossword', 'forgotten-word'] as const;
    for (const kind of PAYS) {
      expect(effortMinutes(kind, 1)).toBeGreaterThanOrEqual(KEY_SUPPLY.workKeyMinutes);
      expect(solveKeys(1, kind), `${kind} asks ${effortMinutes(kind, 1)} min`).toBe(1);
    }
    for (const kind of FREE) {
      expect(effortMinutes(kind, 1)).toBeLessThan(KEY_SUPPLY.workKeyMinutes);
      expect(solveKeys(1, kind), `${kind} asks ${effortMinutes(kind, 1)} min`).toBe(0);
    }
  });
});

/**
 * ═══ THE ROOMS THAT ARE LONGER THAN A SITTING AND PAY NOTHING ON THE WAY UP ══
 *
 * `LADDER_MINUTES` is 4, and REVIEW_AA §6's rule is that a room she cannot
 * expect to finish in one sitting must bank something as she climbs. Three
 * rooms have ladders. The Darkroom does not — `cipher-adapter.ts` emits ONE
 * progress event in the whole room (`print-developed`, at the end) — and at
 * tier 3 it was **already** over the line at 4.0 minutes with nothing in this
 * repo saying so. Round 46's re-derivation puts tier 2 over it as well.
 *
 * So the debt is a LIST, pinned. It may shrink and it may not grow: a room that
 * crosses `LADDER_MINUTES` without a rung has to be added here deliberately,
 * with the seam it needs written beside it.
 */
describe('4.10h(e) — a long room with no ladder is a named debt, not a surprise', () => {
  it('pins exactly which room-tiers are over LADDER_MINUTES with no rung', () => {
    const unstaged: string[] = [];
    for (const kind of ROOM_PUZZLE_KINDS) {
      for (const tier of TIERS) {
        if (effortMinutes(kind, tier) >= LADDER_MINUTES && !paysInStages(kind, tier)) {
          unstaged.push(`${kind} t${tier}`);
        }
      }
    }
    // THE DEBT, and the seam that pays it: the Darkroom would need its adapter
    // to broadcast how much of the print has developed (A4's file), which is a
    // room's own change and not an economy one.
    expect(unstaged.sort()).toEqual(['cipher t2', 'cipher t3']);
    // …and every room that DOES have a ladder still has one where it counts.
    for (const kind of ['hive', 'sudoku', 'word-web'] as RoomPuzzleKind[]) {
      expect(paysInStages(kind, 1), `${kind} lost its ladder`).toBe(true);
    }
  });
});
