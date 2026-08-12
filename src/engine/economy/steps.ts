/**
 * Step economy — OWNER: A2 (Economy/Day). Pure TS, no React/DOM.
 *
 * THE single audited ledger (AAA 4.9): every step delta in the game flows
 * through `STEP_TABLE` + `appendEntry`. No slice writes steps directly; the
 * UI renders each entry as a floating +N/−N on the counter.
 *
 * ═══ ECONOMY OVERHAUL — DIRECT OWNER FEEDBACK, 2026-08 playtest ═══
 * "Way too easy — I reached the Forgotten Word on my first day; Blue Prince
 * took me 28 days." The campaign arc was missing: day 1 played like day 30.
 * This retune turns the manor into a push-your-luck CLIMB whose ceiling rises
 * across weeks, not minutes (targets in AAA 4.10, verified in
 * tests/economy-simulation.test.ts):
 *
 *   1. WALKING IS THE EXPENSE. **ROUND 36 (docs/THE_CLIMB §1): a move costs a
 *      move, wherever she is** — `MOVE_COST_BY_ROW` is one flat price, and
 *      scarcity comes from DISTANCE WALKED rather than from altitude. It used
 *      to read −2 on the ground floor and −9 up top, which charged her for
 *      doing the thing the game is about; see that constant for the owner's
 *      words, the measurement and what the deleted invariant was replaced with.
 *   2. REFUNDS GET LEANER AS YOU CLIMB. Now the ceiling on a solve
 *      (`SOLVE_WAGE.capByTier`) rather than a per-tier anchor rate: two thirds
 *      of a day at tier 1, a half at tier 2, a third at tier 3. A tier-3 solve
 *      softens the next mistake; it no longer bankrolls the next storey.
 *   3. LEAN DAY BUDGET. 40 → 18 → 22 (round 36, the other end of the same
 *      lever). A decent day is 7–11 rooms and 10–15 minutes (AAA 4.10), not
 *      8–12 rooms and twenty-plus.
 *   4. LOCKED DOORS UP TOP. `DOOR_LOCKS`: drafting into 0-based rows 4+ can
 *      demand a key. Deep pushes are PREPARED for (Key Cabinet, Fern's
 *      trades) — you cannot stumble into the Sanctum row.
 *   5. THE REFILL CURVE IS A CAMPAIGN ARC. Bramble's tea (`TEA_BY_POINTS`)
 *      climbs 0 → +13 across her friendship, and refills shrink to +2..+6.
 *      The budget that makes the Sanctum reachable is EARNED over days.
 *
 * ═══ THE INDEXING CONTRACT — READ BEFORE TOUCHING AN AFFINITY TABLE ═══
 * Every affinity-indexed table in this file is indexed by raw affinity
 * **POINTS** — the integer the day slice carries in `affinities.<character>` —
 * and NEVER by an affinity RANK. The two scales are different lengths and
 * different shapes: ranks run 0–4 on the thresholds `[0, 2, 5, 9, 14]`
 * (engine/dialogue/affinity.ts `rankFor`), while these tables run 0–6 on one
 * point per index. Feeding `rankFor(points)` into `teaBonus` or
 * `fernMorningKeys` would cap the tea at TEA_BY_POINTS[4] and move Fern's
 * first key from 2 points out to 5 — reshaping the whole campaign arc with
 * every test still green. The tables are therefore NAMED for their unit
 * (`TEA_BY_POINTS`, `KEY_SUPPLY.fernMorningKeysByPoints`), the accessors take
 * a `…Points` parameter, and `tests/steps.test.ts` pins the units by asserting
 * the point-indexed answer differs from the rank-indexed one at the exact
 * values where a "fix" to `rankFor(points)` would bite.
 *
 * ═══ ROUND-5 AUDIT — the arcs were on paper, not in the game ═══
 * The campaign numbers above were verified against a curve the live game could
 * not draw: `teaBonus`/`fernMorningKeys` index raw affinity POINTS, and the
 * authored dialogue grants 2 (Bramble) and 3 (Fern) in their entire lifetimes,
 * while the simulation handed itself `floor(day/2)` points and a key-luck ramp
 * with no live counterpart at all. Four things closed the gap, all here:
 *
 *   a. `TEA_ARC`/`teaArcPoints` — shared mornings warm Bramble on a schedule
 *      the day slice actually applies, so the step arc has a source.
 *   b. `FERN_ARC`/`KEY_ACCESS` — her affinity raises the draft weight of
 *      key-bearing cards (drafting.ts), so the padlock arc has a source, and
 *      `KEY_SUPPLY.fernMorningKeysByPoints` re-indexes to open inside her
 *      authored point budget instead of two points past its ceiling.
 *   c. `FIRST_MORNING_POT` — the first evening starts at 0 affinity, so it got
 *      a scripted welcome pot rather than running under the 10–15 floor.
 *   d. cross-day investment (`CARRY_OVER_EFFECTS`, engine/manor/deck.ts) — the
 *      first thing in the game that pays into tomorrow.
 *
 * Net effect (simulated, not hoped): a skilled player first reaches the
 * Sanctum row around day 6–10 and typically wins the volume in 14–28 days of
 * daily play — Blue Prince's shape, at cozy scale.
 *
 * ═══ ROUND-10 — SOLVING POWERS THE CLIMB ═══
 * Owner directive: *"Keys toward the padlocked upper floors should come
 * primarily from SOLVED rooms rather than only from utility cards — so skill,
 * not just persistence, earns the campaign."* Before this, every key in the
 * game came off a green card or off Fern, so the padlock arc was a
 * DRAFTING-LUCK arc and playing the word games well bought steps and nothing
 * else. Three numbers here carry the change, and every 4.10 target was
 * re-measured against them:
 *
 *   - `KEY_SUPPLY.solveKeysByTier` — a solved room pays a key by row-band
 *     tier (0/1/1). Rows 3–4 are tier 2 and `DOOR_LOCKS` gates rows 4–5, so
 *     THE STOREY BELOW A PADLOCK IS THE STOREY THAT PAYS FOR IT.
 *   - `DOOR_LOCKS.keyCost` 1 → 2, `chanceByRow[4]` 0.75 → 0.9 — the gate
 *     repriced for the bigger supply rather than the supply capped, so the
 *     solve stays generous and the top stays expensive.
 *   - `MOVE_COST_BY_ROW[4]` −6 → −7 — the first locked storey, where the
 *     push-your-luck decision actually happens.
 *
 * Measured after the retune: solves supply ≈1.2 keys/day against ≈0.7 off the
 * green deck — keys are now primarily earned, not drafted.
 *
 * ═══ ROUND-22 — A ROOM IS PAID FOR THE WORK IT ASKS FOR (REVIEW_AA §6) ═══
 * Point 2 above ("anchor +6/+5/+4 by tier") priced FIVE anchors off one
 * row-band table, and they are not one room: the Gallery is twenty seconds and
 * the Counting House is half an hour. Measured, that was a **36× spread in
 * seconds per step** — and 15× between two rooms on the same storey at the same
 * tier — so the rational play was to farm the short room and abandon the long
 * ones on sight, which is exactly what both hostile reviewers did. Three things
 * carry the fix, all re-measured against every 4.10 band:
 *
 *   - `ROOM_EFFORT` (engine/economy/effort.ts) — the honest minutes each room
 *     asks, per kind and tier, instrumented over the shipped pools and pinned
 *     to the content facts they were derived from;
 *   - `SOLVE_WAGE` / `solvePayout` — the payout IS that number at a house wage,
 *     with a cozy floor and a day-budget ceiling. The two long rooms rose
 *     (+6 → the tier ceiling) and the Gallery fell to the floor at tiers 1–2;
 *     nothing else in the table was cut, and 4.10h is the gate;
 *   - `stageSteps` — a room too long to finish in a sitting pays its LADDER out
 *     of the same total, so leaving the Conservatory at Bower banks something
 *     where it used to bank nothing, and a solved room's price is unchanged.
 *
 * `KEY_SUPPLY.workKeyMinutes` is the same idea applied to the padlock arc: a
 * tier-1 solve used to pay 0 keys, and rows 0–2 are 62% of the rooms she plays.
 *
 * Unchanged rulings:
 *   - weight 0 → free feedback moment, never ledgered (AAA R.1 / 3.2)
 *   - weight 1 → −2 (tier 3 rooms −3); weight 2 doubles (reserved risk rooms)
 *   - hint purchases price through the same row as mistakes (A3's revision)
 *   - a wrong guess at the Sanctum: once per day, always FREE (AAA 4.17) —
 *     `SANCTUM_GUESS_COST`, kept explicit so no future retune quietly prices it
 * Costs read as *spending*, never dying (R.3) — the ledger has no concept of
 * failure, only entries.
 */

import type { StepEntry, StepLedger, Tier } from '../types';
import type { RoomPuzzleKind } from '../rooms/room-puzzle';
import { effortMinutes } from './effort';
import { FRAGMENTS_TO_DEDUCE } from '../volume';

/**
 * Start-of-day step budget (AAA 4.10). Owner retune: 40 → 18 → **22**. Read
 * this together with `MOVE_COST_BY_ROW` — the two numbers are one lever, and
 * this file has said so since the overhaul. Round 36 pulled the other end of
 * it, so this end had to move with it.
 *
 * ═══ ROUND 36 — 18 → 22, BECAUSE A MOVE COSTS A MOVE NOW (docs/THE_CLIMB §1)
 * ═══════════════════════════════════════════════════════════════════════════
 * The flat −3 below is **1.5× the old ground-floor price**, and rows 0–3 are
 * where the median player spends the overwhelming majority of her moves. Left
 * at 18, the same evening bought 7 rooms instead of 10 and ran **9.9–10.1
 * minutes at the median across four seeds** — under AAA 4.10b's promised 10–15
 * window, i.e. the owner's own "way too easy" fix undone from the other side.
 *
 * 22 is not a round number chosen to be safe: it is the SMALLEST budget at
 * which every measured EVENING quantity lands back on what the old table
 * produced — median minutes 12.1–12.7 (was 13.9), rooms 8 (band 7–11), and the
 * storey a GREAT day reaches back at 1-based 5 (at 18 and at 20 it fell to 4,
 * i.e. 4.10c's floor). Above 22 the evening starts inflating instead: at 24 the
 * median player's evening runs 15.6 minutes and the skilled player's 18.5,
 * against published ceilings of 18 and 20.
 *
 * TWO THINGS MOVE WITH IT, both by construction rather than by choice, and both
 * re-measured rather than argued:
 *   - `SOLVE_WAGE.capByTier` is defined as thirds of a day, so the ceiling on a
 *     single solve rises 12/9/6 → 15/11/7. That lifts exactly the two LONG
 *     rooms round 22 found underpaid (the Conservatory and the Counting House)
 *     and the published wage spread FALLS, 9.07× → 7.77× — the direction AAA
 *     4.10h's ratchet allows.
 *   - the dawn purse (`TEA_POUR.dawnCup`) is 22 + 4 = **26**, not 22. §5.10's
 *     invariant is that the ground floor does not get RICHER as the campaign
 *     warms, and it still does not; what changed is the level, and the floor is
 *     dearer per room than it has ever been (measured net −2.2 a room against
 *     −1.2 before).
 */
export const BASE_DAY_BUDGET = 22;

/**
 * Mistake / hint pricing row: a deliberate wrong claim in a deduction room.
 * Weight 'structural' is the AAA R.1 ruling: a structural slip the live
 * entry-coloring already warned about (hive dead letter / missing center)
 * costs a flat −1 at every tier — spending, never a sting.
 */
function mistakeDelta(weight: 1 | 2 | 'structural', tier: Tier): number {
  if (weight === 'structural') return -1;
  return (tier === 3 ? -3 : -2) * weight;
}

/**
 * ═══ ROUND 36 — A MOVE COSTS A MOVE, WHEREVER SHE IS (docs/THE_CLIMB §1) ═══
 *
 * OWNER, after playing: *"The steps economy is insane right now… It shouldn't
 * get more expensive the further you move up. The steps economy is driven by
 * needing to double back, etc."*
 *
 * This table was `[-2, -2, -2, -2, -7, -9, -9]`: an ALTITUDE TOLL. It charged
 * her for doing the thing the game is about, and it got steeper exactly where
 * the content is. It is now **one price on every storey**, and scarcity comes
 * from DISTANCE WALKED — she runs low because she went east, hit a sealed room,
 * and had to come all the way back.
 *
 * ── WHY −3 AND NOT −2 ──────────────────────────────────────────────────────
 * −2 (the old ground price, kept everywhere) was measured and rejected: it made
 * the whole campaign a walkover. The skilled player's first door fell to day 14
 * — the floor of a band whose ceiling is 22 — the median player's volume win to
 * day 19 against a published 24–32, and his evening ran 20.5 minutes against a
 * published ceiling of 20. The bare ascent to the landing would have been 10
 * steps of a 22-step purse. −4 goes the other way and is worse: the evening
 * collapses to 7.6 minutes and the median player's win runs to day 30.
 *
 * −3 is the only integer in between, and `BASE_DAY_BUDGET` (18 → 22) is the
 * other half of the same lever — see its own note for why 22 and not 20 or 24.
 *
 * ── WHAT THIS DELETES, AND WHAT REPLACES IT ────────────────────────────────
 * THE HEADLINE INVARIANT IS GONE, deliberately, and this is the single most
 * important sentence in this file: `reserveToTop(1) > BASE_DAY_BUDGET` — "a
 * bare, perfect ascent costs more than the whole day budget, so the top is
 * always bought with refunds" — **is an altitude-toll invariant and cannot
 * survive a distance economy.** A day is a dozen-plus moves and the minimum
 * ascent is five of them; no flat price can make five moves dearer than twelve
 * without making the evening shorter than the five. Under the old table the
 * bare ascent was 22 against an 18-step budget; it is now 15 against 22.
 *
 * What replaces it is not an equality re-typed to fit — it is the same claim
 * measured on an instrument that could disagree, the round-25 grid-true model
 * that walks real cells, doors, seals and padlocks:
 *
 *   - a SKIPPER — a player who solves nothing, and therefore refunds nothing —
 *     still tops out on the middle floors: median 1-based row 4, and she stands
 *     at the Sanctum door on **0.03% of evenings** (1 day in 3000). It used to
 *     be flatly 0, and that 0 was an arithmetic consequence of the toll rather
 *     than an observation; it is now an observation, and it is published as one
 *     in AAA 4.10a rather than rounded back down to zero.
 *   - the skilled player still first stands at that door on **day 16** of a
 *     14–22 band, essentially never on day 1 (≤0.5%), because the gate is
 *     geometry and padlocks — which is what round 24 already measured and said
 *     out loud: *"the deck's door layouts, not the step table, are what price
 *     the top of the house."*
 *
 * The arithmetic clause that IS still true, and that `tests/economy-*` now
 * gate, is the one about the walk rather than the tariff: **the REALISTIC
 * ascent costs more than the whole budget** — `reserveToTop(1, PROFILE_SKILLED)`
 * is 25.8 against 22 — because a climb is walk-backs, not a staircase.
 *
 * ── AND THE STOREY STILL COSTS MORE THAN THE ONE BELOW IT ──────────────────
 * `climbStepCost` rises strictly with the row it starts from, exactly as it did
 * before, and nothing was tuned to keep it: the walk-back to a frontier door is
 * longer the higher you are, so the fourth storey is dearer than the second
 * because of how far you have to go, not because of what the sheet charges.
 * That sentence is the whole change.
 *
 * ── WHAT THIS COSTS, STATED ────────────────────────────────────────────────
 * The median player's campaign SHORTENS: first door day 27.5 → 20, volume win
 * day 28 → 22, and the 12% of her campaigns that never finished inside 45
 * evenings goes to ~0%. The skilled player's barely moves (door 17 → 16, win
 * 18 → 17). That asymmetry is the finding, not a side effect: the toll was
 * being paid almost entirely by the player who doubles back, which is the
 * player the owner was describing. Both bands are re-published in AAA 4.10d/e.
 *
 * ── ROUND 37 BUILT THE THREE-CELL LANDING, AND THIS TABLE DID NOT MOVE ─────
 * The prediction written here was right and is now a measurement: the last hop
 * got easier and 4.10d/e were re-published (her door 20 → 16.5–17, her win
 * 22 → 19; his 16 → 13–14 and 16.5–17 → 15–15.5). **Not one number in this
 * file was retuned to absorb it**, which was the whole point of writing the
 * prediction down — the round that widens the landing must be allowed to move
 * the bands, or the change is measured against a table adjusted to hide it.
 * The lever named here if the campaign ever falls too far is still the padlock
 * (`DOOR_LOCKS`), measured last round and found nearly inert under a flat
 * price: `keyCost` 2 → 4 → 5 moved her volume win 19 → 20 → 19.
 *
 * ── WHAT IT IS INDEXED BY, STILL ───────────────────────────────────────────
 * The 0-based grid row of the cell being STEPPED INTO (engine/types.ts
 * Cell.row). The table stays seven long and stays a table: the blueprint, the
 * ledger and the simulator all read it through `moveAt`, and a future round
 * that wants a storey to cost differently again has one place to say so.
 *
 * ═══ THE HISTORY THIS REPLACES, kept because three rounds were lost to it ═══
 *
 * Per-row movement pricing — the 2026-08 overhaul's core lever.
 * The ground floor was a stroll; the upper storeys were a climb, and every
 * traverse of them was charged, including the walk back to a frontier door.
 *
 * ═══ ROUND-7 CORRECTION — PRICED FOR THE STOREY SHE ACTUALLY HAS TO BUY ═══
 * The old curve (−1,−1,−2,−3,−4,−5,−5) was verified against the SANCTUM'S OWN
 * ROW (0-based 6) — a cell that is sealed, never drafted, never walked into.
 * The word is spoken from the landing BELOW it, 0-based row 5
 * (engine/manor/grid.ts `SANCTUM_LANDING_CELLS`), and the bare ascent to THERE
 * cost 1+2+3+4+5 = 15: comfortably under the 18-step base budget and under
 * day 1's 21. So the headline invariant `reserveToTop(1) > BASE_DAY_BUDGET`
 * was true of a storey the game never asks her to enter and false of the one
 * it does — measured at the live landing, a skilled player stood at the door
 * on day 1 in 41.5% of campaigns.
 *
 * Minimum pure ascent, entrance (row 0) → THE SANCTUM LANDING (row 5) — the
 * ascent the player actually has to pay for:
 *   2 + 2 + 2 + 7 + 9 = 22 steps — MORE than the whole base budget, in a
 *   straight line, before a single card is drafted or a single door is
 *   re-walked. The landing is therefore never reachable on the budget alone:
 *   it has to be paid for with tea, snacks and solves. That is the
 *   push-your-luck, and it is why day 1 is not day 30.
 *
 * ROUND-10 RETUNE — row 4 moved −6 → −7. Solved rooms now pay KEYS
 * (`KEY_SUPPLY.solveKeysByTier`), which is the owner's "skill, not just
 * persistence, earns the campaign"; a solve-fed climb crosses the padlocks
 * faster, and re-measured on the old table a skilled player stood at the
 * door on day 1 in 29% of campaigns (published: <8%) with a median first
 * reach of day 2 (published: 6–10). The step price of the FIRST locked
 * storey is where that came back, because it is the storey the whole
 * push-your-luck decision hinges on and it does not touch the decent day
 * (whose median top row is 4, 1-based — i.e. row 3, 0-based).
 *
 * ═══ ROUND-23 RETUNE — THE GROUND FLOOR WAS FREE (REVIEW_AA §5.10) ═══
 * "The two lower bands are UNTOUCHED (−1/−1/−2/−3)" was the previous note
 * here, and measured, that sentence is the whole of §5.10: **a ground-floor
 * room cost 1 step and a solved one paid up to 12.** Rows 0–2 are 62% of the
 * rooms the median player enters, her mean NET on rows 0–1 was −0.84 and
 * −0.25 steps per room entered, and 0.2% of her evenings ever contained a
 * moment down there with fewer than four steps in hand. A resource that is
 * never scarce is not a resource.
 *
 * The tier-1 band is now ONE PRICE — −2 across rows 0–2, the storeys `rowTier`
 * calls tier 1 — so the ground floor costs something every time she crosses
 * it, and the solve:walk ratio on row 0 falls from 12:1 to 6:1. It is
 * deliberately the smallest lever that bites: the payout side is wage-locked
 * by 4.10h (round 22) and cutting it would re-open the 36× spread, and the
 * refill side is Bramble's arc, which round 23 moved rather than cut (see
 * `TEA_POUR`). **The bare ascent is UNCHANGED at 22** — the old band was
 * −1/−1/−2/−3 and the new one is −2/−2/−2/−2, so rows 1–5 sum to 1+2+3+7+9 = 22
 * before and 2+2+2+7+9 = 22 after; the retune moved the FLOOR, not the climb,
 * which is why every band calibrated on `reserveToTop(1) > BASE_DAY_BUDGET` is
 * untouched by it. *(Round 25 correction: this line read "Bare ascent 22 → 23",
 * which is arithmetically wrong and contradicted the value
 * `tests/economy-pressure.test.ts` pins twelve lines below. Round 7 lost a day
 * to this exact number drifting in one of three files; it drifted again in the
 * round that quoted round 7's lesson.)* Every 4.10 band re-measured in
 * tests/economy-simulation.test.ts and the ground floor pinned in
 * tests/economy-pressure.test.ts.
 */
export const MOVE_COST_BY_ROW: readonly number[] = [-3, -3, -3, -3, -3, -3, -3];

export function moveAt(row: number): number {
  const i = Math.max(0, Math.min(MOVE_COST_BY_ROW.length - 1, Math.floor(row)));
  return MOVE_COST_BY_ROW[i]!;
}

/**
 * The bare, perfectly efficient ascent from the entrance (0-based row 0) to the
 * Sanctum landing (0-based row 5): five moves, at whatever one move costs. 22
 * under the altitude toll; **15** under a flat −3.
 *
 * Derived, never transcribed. Round 7 lost a day to this number drifting in one
 * of the three files that quote it, and round 23 shipped it wrong again in the
 * very note that cited round 7's lesson. There is one of it now, and
 * `tests/economy-pressure.test.ts` holds MANOR_DESIGN §4 to printing THIS and
 * not a remembered 22.
 */
export const BARE_ASCENT_STEPS: number = Array.from(
  { length: MOVE_COST_BY_ROW.length - 2 }, (_, i) => -moveAt(i + 1),
).reduce((a, b) => a + b, 0);

/**
 * Player-facing name for one storey's walk: "3 steps", "1 step". The blueprint
 * and the draft modal both read this so the number on the sheet and the number
 * in the ledger can never disagree (AAA 4.6 — the price is legible BEFORE the
 * tap, never only after the charge).
 */
export function moveCostLabel(row: number): string {
  const n = -moveAt(row);
  return `${n} step${n === 1 ? '' : 's'}`;
}

/**
 * ── THE TWO-PART WALK (AAA 4.6, "back out for the step already spent") ──────
 *
 * Opening a draft is a walk TO A DOOR on the floor she is already standing on;
 * it is not the climb. So the door-step is ledgered at HER row, and the climb
 * differential is ledgered only when she actually accepts a card and steps
 * through (app/slices/manor.ts). Totals for a completed climb are unchanged —
 * moveAt(her row) + (moveAt(target row) − moveAt(her row)) = moveAt(target
 * row) — but a DECLINED look now costs the local rate instead of a full storey.
 *
 * The differential rides through the same audited `priceEntry` path as every
 * other move, via a two-cell roomKey: `"2,4>2,5"` reads "from 2,4 into 2,5".
 * Encoding it in the key (rather than trusting a caller-supplied delta) keeps
 * the invariant that movement pricing cannot be bypassed from a call site.
 *
 * Descending is never a refund: the differential floors at 0, so walking back
 * downstairs costs only the local door-step.
 *
 * ═══ ROUND 36 — THE DIFFERENTIAL IS ZERO NOW, AND THE PATH STAYS ═══════════
 * With one price on every storey (`MOVE_COST_BY_ROW`) the climb differential is
 * always 0, so a look and a take cost the same and the second entry is never
 * written. The machinery is deliberately KEPT rather than deleted: it is the
 * audited path that stops a call site from inventing a movement delta, it is
 * what makes "the price is legible before the tap" true of a table that varies,
 * and the next round changes the shape of the landing. What must not happen is
 * a caller quietly computing its own climb price because this looked dead.
 */
export const CLIMB_KEY_SEP = '>';

/** `"2,4>2,5"` — the roomKey for a climb differential (see CLIMB_KEY_SEP). */
export function climbKey(fromCellKey: string, toCellKey: string): string {
  return `${fromCellKey}${CLIMB_KEY_SEP}${toCellKey}`;
}

const rowOfCellKey = (key: string): number => Number(key.split(',')[1]);

/** The row a move entry ENDED in (the destination), or null if unkeyed. */
export function moveRowOf(roomKey: string | undefined): number | null {
  if (!roomKey) return null;
  const parts = roomKey.split(CLIMB_KEY_SEP);
  const row = rowOfCellKey(parts[parts.length - 1]!);
  return Number.isFinite(row) ? row : null;
}

/** The highest 0-based row any move entry ended in today (for the night digest). */
export function highestRowVisited(ledger: StepLedger): number {
  let highest = 0;
  for (const entry of ledger.entries) {
    if (entry.reason !== 'move') continue;
    const row = moveRowOf(entry.roomKey);
    if (row !== null && row > highest) highest = row;
  }
  return highest;
}

/**
 * Storey names, ground up — the digest and the blueprint's aria labels speak
 * in landings, not in grid coordinates ("Walk to the second landing — 3
 * steps", not "Walk 2,5").
 *
 * ROUND-7: row 5 is the LANDING OUTSIDE THE SANCTUM — the cell the word is
 * spoken from (engine/manor/grid.ts `SANCTUM_LANDING_ROW0`) — and row 6 is the
 * sealed Sanctum itself, which is never entered. The names used to be one
 * storey out ('the upper gallery' for the landing), so the night digest
 * congratulated her on reaching a floor she had not, and hid the one arrival
 * that is a campaign event.
 */
export const ROW_NAMES: readonly string[] = [
  'the ground floor',
  'the half landing',
  'the first landing',
  'the second landing',
  'the third landing',
  'the Sanctum landing',
  'the Sanctum',
];

export function rowName(row: number): string {
  const i = Math.max(0, Math.min(ROW_NAMES.length - 1, Math.floor(row)));
  return ROW_NAMES[i]!;
}

/**
 * A wrong guess at the Sanctum door costs nothing but the day's one guess
 * (AAA 4.17, MANOR_DESIGN §7). Exported as a named zero so the rule is
 * grep-able and a future economy pass has to delete a documented constant
 * rather than silently add a price.
 */
export const SANCTUM_GUESS_COST = 0;

/**
 * ═══ ROUND 22 — THE WAGE (REVIEW_AA §6, "make the anchors cost and pay
 * comparably") ════════════════════════════════════════════════════════════
 *
 * THE DEFECT, measured: `solve(size, tier)` had no room parameter, so the
 * Gallery's twenty seconds and the Counting House's thirty-five minutes were
 * paid off one row-band table — 7 seconds per step against 257, a **36×
 * spread**, and 15× between two rooms on the SAME storey at the SAME tier. The
 * deck offers them at the same rate (sudoku 25.8% of row-0 offers, twistle
 * 24.8%), so the rational play was to farm the short room and abandon the long
 * ones on sight. Both hostile reviewers did exactly that.
 *
 * THE FIX: a room is paid for the WORK IT ASKS FOR. `ROOM_EFFORT`
 * (engine/economy/effort.ts) carries the honest median minutes per kind and
 * tier, instrumented over the shipped pools, and the payout is that number at
 * a house wage, with a floor and a ceiling:
 *
 *     payout = clamp(round(stepsPerMinute × honest minutes), floor, cap)
 *
 * THE FLOOR is the cozy half of the owner's own constraint — *a short puzzle
 * must never be a bad choice.* No solved room ever pays less than a micro
 * room's old +3, so choosing the Linen Closet on a tired evening is a small
 * win, never a punishment.
 *
 * THE CEILING is what stops a fifteen-minute room from printing most of a
 * day's budget in one go (`BASE_DAY_BUDGET` is 22), and it is where the old
 * "leaner as you climb" ruling now lives: the ceiling drops by tier, so a
 * tier-3 solve still softens the next mistake rather than bankrolling the next
 * storey.
 *
 * WHAT MOVED, and which direction: the two long rooms rose (the Conservatory
 * and the Counting House, +6 → the tier ceiling) and the Gallery fell at
 * tiers 1–2 (+6/+5 → the floor). The Gallery is the one cut in the table and
 * the numbers force it: 5 target words from a median 106-word pool is a
 * twenty-second room, and paying it a full anchor rate is what made it the
 * highest-EV cell in the house. **It is priced by the same wage as everything
 * else** — the day its content becomes a puzzle (REVIEW_AA §6 asks for
 * `targetCount` to rise), `ROOM_EFFORT` moves and the payout rises with it,
 * automatically. Nothing else in the table was cut.
 *
 * ═══ ROUND 26 — AND THAT DAY CAME, WITHOUT A LINE OF THIS FILE CHANGING ═══
 * The Gallery's content fix landed: `content/generate-twistle.ts` shrank the
 * board's answer space from a median 106 findable words to 23 WITHOUT asking
 * for one more word, `ROOM_EFFORT.twistle` went [1.0, 1.5, 2.5] →
 * **[1.25, 1.5, 2.5]** minutes, and the room's price followed on its own —
 * which is the whole claim this table makes about itself, tested for the first
 * time by something other than the table's author. It is still at the cozy
 * FLOOR (1.4 × 1.25 = 1.75, floored to +4), so the payout is the same +4 it
 * was; what changed is the WAGE, **4.000 → 3.200 steps a minute** at tier 1,
 * and with it the top of the whole house. The Gallery no longer stands alone as
 * the most profitable minute in the manor — it ties the Linen Closet, and both
 * of them are there because of the COZY FLOOR rather than because of a
 * mispriced room. `tests/economy-effort.test.ts` names both, so whichever is
 * lengthened next fails a test and retightens the published spread.
 */
export const SOLVE_WAGE = {
  /**
   * Steps per honest minute — the house wage, and the only number in the
   * payout that is a tuning knob rather than a derivation. It is set where the
   * Library lands back on exactly the +6 the whole campaign was calibrated
   * against (4.5 honest minutes × 1.4 ≈ 6), because the Word Web is the one
   * anchor whose length was never in dispute: it is the room the old flat +6
   * actually described. Every other room is now priced relative to it.
   */
  stepsPerMinute: 1.4,
  /**
   * THE COZY FLOOR. A solved room never pays less than this, however short it
   * turned out to be — the owner's constraint in one constant: *a cozy game
   * must not punish the player for choosing a short puzzle.* The Linen Closet
   * on a tired evening is a small win, never a mistake.
   *
   * ONE floor for every room, deliberately, and `tests/economy-effort.test.ts`
   * is why: with a floor per SIZE, the 75-second Linen Closet paid +3 while the
   * 20-second Gallery paid +4, i.e. the shorter room paid more — the exact
   * defect this round exists to delete, reintroduced by the clamp meant to
   * soften it. The player does not experience "micro" and "anchor"; she
   * experiences minutes.
   */
  floor: 4,
  /**
   * THE CEILING, in thirds of a day (`BASE_DAY_BUDGET`): two thirds at tier 1,
   * a half at tier 2, a third at tier 3. Two rulings live here at once —
   * no single room may print most of an evening's budget, and payouts still
   * get LEANER AS YOU CLIMB (the 2026-08 owner retune), so a tier-3 solve
   * softens the next mistake instead of bankrolling the next storey.
   *
   * ROUND 36: the second clause used to read "…and still costs less than the −9
   * step it took to walk up there", which was an ALTITUDE-TOLL sentence and is
   * now false by design — a move costs a move, so a solve of course pays more
   * than one of them. The leanness that survives is the one this table states:
   * `capByTier[2] < capByTier[1] < capByTier[0]`, gated in
   * tests/economy-effort.test.ts.
   *
   * The ceiling is also the honest limit of what pricing alone can do: the
   * shipped rooms span 30× in length (75 seconds to half an hour) and no
   * payout table with a floor and a ceiling can span 30×. What the wage
   * guarantees is that BETWEEN the clamps a minute is worth a minute, and
   * `tests/economy-effort.test.ts` publishes the residual spread as a ratchet
   * that may fall and may never rise.
   */
  capByTier: [
    Math.round((BASE_DAY_BUDGET * 2) / 3),
    Math.round(BASE_DAY_BUDGET / 2),
    Math.round(BASE_DAY_BUDGET / 3),
  ] as readonly number[],
} as const;

/** Steps a full solve of `kind` pays at `tier` — the wage, floored and capped. */
export function solvePayout(kind: RoomPuzzleKind, tier: Tier): number {
  const i = Math.max(0, Math.min(2, Math.floor(tier) - 1));
  const raw = Math.round(SOLVE_WAGE.stepsPerMinute * effortMinutes(kind, tier));
  return Math.max(SOLVE_WAGE.floor, Math.min(SOLVE_WAGE.capByTier[i]!, raw));
}

/**
 * Which rooms are anchors, for pricing purposes. Deliberately a local table
 * rather than a call into `getRoomAdapter`: the economy must be importable by
 * the simulation, the tests and the draft preview without dragging every room
 * adapter (and its React-free-but-large puzzle engine) behind it, and
 * `tests/economy-effort.test.ts` asserts this table agrees with the live
 * registry room for room, so it cannot drift.
 */
export const ROOM_SIZE: Record<RoomPuzzleKind, 'micro' | 'anchor'> = {
  'twistle': 'anchor',
  'word-web': 'anchor',
  'hive': 'anchor',
  'forgotten-word': 'anchor',
  'sudoku': 'anchor',
  'cipher': 'micro',
  'crossword': 'micro',
};

/**
 * ── PAYING THE LADDER, NOT THE SUMMIT ──────────────────────────────────────
 *
 * REVIEW_AA §6: *"every anchor is 2–4 minutes to a payout, or it pays IN
 * STAGES and carries across days. The hive pays at every ladder rung, not only
 * at Full Bloom."* A player who typed thirty words into the Conservatory and
 * found twenty of them got **zero**, because 70% of totalPoints — Spelling Bee
 * Genius — is a quarter of an hour away and nothing below it paid at all.
 *
 * `stageSteps` is the whole mechanic: given how far up the room's own ladder
 * she is (`engine/economy/effort.ts stageFractionOf`, read off progress events
 * the adapters already emit) and what she has been paid so far, it returns the
 * instalment due now. The `solved` event pays `total − alreadyPaid`.
 *
 * THE INVARIANT, and the reason no published band in AAA 4.10 moves for this:
 * **a solved room pays exactly `solvePayout(kind, tier)`, staged or not.** The
 * daily step arithmetic is untouched by construction; what changes is that
 * six minutes of honest work in a long room is worth something when she leaves
 * it for tomorrow (AAA 4.13), which is the difference between a room she opens
 * and a room she declines on sight.
 */
export function stageSteps(
  kind: RoomPuzzleKind, tier: Tier, earnedFraction: number, alreadyPaid: number,
): number {
  const total = solvePayout(kind, tier);
  const due = Math.floor(total * Math.max(0, Math.min(1, earnedFraction)));
  return Math.max(0, due - Math.max(0, alreadyPaid));
}

export const STEP_TABLE = {
  /** Start-of-day budget — the ledger's `budget` field. */
  dayStart: BASE_DAY_BUDGET,
  /**
   * DEPRECATED flat move price — kept so existing callers compile. The day
   * slice re-prices EVERY 'move' entry through `moveAt(row)` using the
   * entry's `roomKey` ("col,row"), so per-row pricing holds even for callers
   * still passing this. Equals moveAt(0). A1: prefer `moveAt(cell.row)`.
   */
  move: moveAt(0),
  /** Row-priced move (see moveAt / MOVE_COST_BY_ROW). */
  moveAt,
  /** −1, worth it. */
  petDewey: -1,
  /** Deliberate wrong claim (Library group, Study guess, cipher letter…). */
  mistake: mistakeDelta,
  /** Step-priced hint/clue purchase — same row as mistake (RoomEvent 'hint'). */
  hint: mistakeDelta,
  /**
   * Solve payout — by room KIND first, by size/tier only when the kind is not
   * known (REVIEW_AA §6, round 22). See `SOLVE_WAGE` below for the curve and
   * for what the two arguments now mean; the size/tier form is the legacy
   * BAND, kept so a caller that genuinely does not know which room it is
   * (a generic preview, an old test) still gets a sane number.
   */
  solve(size: 'micro' | 'anchor', tier: Tier, kind?: RoomPuzzleKind): number {
    if (kind) return solvePayout(kind, tier);
    return size === 'micro' ? (tier === 3 ? 2 : 3) : 7 - tier;
  },
  /** No costed mistakes and no purchased hints → bonus. */
  perfect: 2,
  /**
   * REFILL PAYOUTS — the declared BOUND on a green room's own step payout,
   * ledgered with reason 'snack'.
   *
   * ═══ ROUND-6 AUDIT: this constant described a game we do not ship ═══
   * It read `{ min: 3, max: 7 }`, and nothing live ever sampled it. Refills
   * are FIXED, AUTHORED numbers on the green cards (`UTILITY_EFFECTS`,
   * engine/manor/deck.ts): the Kitchen's +6, the Larder's +5, the Boot Room's
   * +3, the Still Room's +2 — and every one of those cards NAMES its number
   * in its own player-facing toast ("Something warm from the oven. +6 steps").
   * The only reader of the range was `engine/economy/simulate.ts`, so AAA
   * 4.10's "scarce refills" was verified against a distribution the deck
   * cannot produce: the Still Room's +2 sits BELOW the old floor of 3, and no
   * card in the deck pays 7 at all.
   *
   * Reconciled the honest way round — the DECK keeps its authored numbers
   * (felt difficulty untouched, and the toast copy stays true) and the
   * CONSTANT is corrected to describe them. It is now a contract, not a
   * source: `tests/steps.test.ts` asserts every shipped `UTILITY_EFFECTS`
   * payout lies inside this range, so a deck edit that quietly lifts the
   * Kitchen to +9 breaks the economy tests instead of the owner's evening.
   * The simulation samples the real card payouts (`REFILL_PAYOUTS`,
   * engine/economy/simulate.ts), never a uniform roll over this range.
   *
   * A refill extends a day; it never doubles it (< half BASE_DAY_BUDGET).
   */
  snack: { min: 2, max: 6 },
  /**
   * COMPOUNDING HOOKS pay a smaller, separate class through the same 'snack'
   * reason (AAA 4.11, BP's Nursery pattern): the Kitchen hums +2 for every
   * later green room, the Dumbwaiter rattles +1 for every later room of any
   * stripe. Declared apart from `snack` because +1 sits below the refill
   * floor by design — one constant covering both would have to lie about one
   * of them. Also contract-checked against `UTILITY_EFFECTS`.
   */
  compound: { min: 1, max: 2 },
  /** Gifting a bookmark is a small walk to find them (reason 'gift'). */
  gift: -1,
  /** A wrong Sanctum guess is free, forever (AAA 4.17). */
  sanctumGuess: SANCTUM_GUESS_COST,
} as const;

/**
 * Locked doors on the upper rows (owner retune): drafting into a high cell
 * may need a key — deep pushes are PREPARED for (Key Cabinet, Fern's trades),
 * not stumbled into. This is the hard gate that makes a day-1 Sanctum run
 * impossible no matter how well the puzzles go: keys reset nightly, so every
 * ascent has to re-earn its own way up.
 *
 * Deterministic per (daySeed, cell) so re-approaching the same door gives the
 * same answer all day (AAA 4.8 spirit) and the blueprint can draw the padlock
 * from the moment the row is visible — never a surprise charge (AAA 4.6).
 *
 * A1 WIRING (LIVE as of the padlock arc): `app/slices/manor.ts` consults
 * `doorLockedAt` in `openDraft` for the target cell and `engine/manor/locks.ts`
 * wraps it for the blueprint. The live contract, in the order the player meets
 * it:
 *   1. the padlock is DRAWN on the blueprint before she walks toward it;
 *   2. with no key the door cannot be opened AND THE STEP IS NOT CHARGED —
 *      never a surprise charge, never pay-for-nothing (AAA 4.6);
 *   3. with a key the draft opens for the usual 1 step, and the key is spent
 *      ON PLACEMENT, so backing out of the offer still costs only that step.
 *
 * ═══ ROUND-7 RETUNE — THE GATE WAS COUNTING A DOOR NOBODY OPENS ═══
 * The published "an ascent crosses roughly 1.7 padlocks" summed rows 4, 5 AND
 * 6 (0.35 + 0.55 + 0.8). Row 6 is the sealed Sanctum: it is pre-placed at
 * manor build, never drafted, so its lock never rolls. The ascent the player
 * really makes ends on row 5, and it crossed 0.35 + 0.55 = 0.9 padlocks — a
 * gate she could walk around by re-drafting laterally twice. Rows 4 and 5 now
 * carry the gate the docs always described (0.75 + 0.95 = 1.7 for the LIVE
 * ascent), which is what makes the last two storeys something you prepare for
 * with Fern's key rather than something you stumble into on a lucky Tuesday.
 * Row 6 keeps a rate only so the table stays total; nothing ever reads it.
 *
 * ═══ ROUND-10 RETUNE — THE GATE NOW PRICES A SOLVE-FED KEY SUPPLY ═══
 * `KEY_SUPPLY.solveKeysByTier` makes SOLVING the main source of keys (the
 * owner's directive 3). That roughly doubled the supply, so the gate was
 * repriced rather than the supply capped — a padlock now costs **2 keys**
 * (`keyCost`), i.e. an ascent buys its way through ≈1.85 padlocks at 2 keys
 * each ≈ 3.7 keys, against ≈1.2/day from solves + ≈0.7/day off the green deck
 * + Fern's dawn key once her friendship warms. Capping the payout instead
 * would have made the *solve* the thing that felt weak; pricing the door
 * keeps the solve generous and the top expensive, which is the shape AAA
 * 4.10d asks for. Rates lifted 0.75/0.95 → 0.9/0.95 in the same pass: with
 * two keys to find, a 25%-unlocked first gate was a coin flip that skipped
 * the arc entirely.
 *
 * Re-measured (tests/economy-simulation.test.ts, 400 seeded campaigns):
 * first Sanctum reach median day 8, 4.8% on day 1, 97% by day 21; volume
 * win median day 20; decent day 11.8 min median, p90 21.6.
 */
export const DOOR_LOCKS = {
  /** P(a door into this 0-based row is locked); rows 0–3 never lock. */
  chanceByRow: [0, 0, 0, 0, 0.9, 0.95, 0.95] as readonly number[],
  /** Keys one padlock consumes. Round 10: 1 → 2 (see the retune note above). */
  keyCost: 2,
} as const;

/**
 * THE PADLOCK'S OTHER HALF — the key supply (AAA 4.10d, "Fern/Key-Cabinet
 * access ... affinity-gated").
 *
 * A gate is only a gate if the key exists. The simulation's skilled player
 * finds ≈0.5 keys on day 1 rising to ≈0.85 by day 10 (`SimProfile.keyLuck`
 * + `CAMPAIGN_ARC.keyLuckPerDay`), and is locked out of a climb ≈0.6–1.2
 * times a day. Measured against the LIVE deck, the Key Cabinet alone appears
 * in only ~3.5% of offers — ≈0.2 keys a day even if she takes it every single
 * time. That is not a gate, it is a wall, and it is the gap this block closes.
 *
 * These are drop RATES, so they live here in the one tunable economy file
 * rather than in A1's deck: `engine/manor/deck.ts` reads them into
 * `UTILITY_EFFECTS`, and `tests/economy-simulation.test.ts` measures the
 * resulting live per-draft key rate against the simulated one.
 *
 * Keys still reset nightly (MANOR_DESIGN §9) — every ascent re-earns its way
 * up. What the campaign buys is ACCESS, never a stockpile.
 */
export const KEY_SUPPLY = {
  /** The Key Cabinet: the deliberate, unusual, "I am preparing a climb" card. */
  cabinetKeys: 2,
  /** The Boot Room hook: the common ground-floor key, tiers 1 only. */
  bootRoomKeys: 1,
  /**
   * ── ROUND 10: THE CLIMB IS BOUGHT WITH SOLVES ──────────────────────────
   *
   * Owner directive: *"Keys toward the padlocked upper floors should come
   * primarily from SOLVED rooms rather than only from utility cards — so
   * skill, not just persistence, earns the campaign."*
   *
   * Before this, every key in the game came off a green card or off Fern:
   * the padlock arc was a *drafting-luck* arc, and playing the word games
   * well bought nothing but steps. A solved room now hands over a key by
   * ROW-BAND TIER, and the geometry is the point — `DOOR_LOCKS` gates rows 4
   * and 5, and rows 3–4 are tier 2, so THE STOREY BELOW A PADLOCK IS THE
   * STOREY THAT PAYS FOR IT. Solve your way up, or bank green cards and hope.
   *
   * Indexed by tier − 1 (tiers 1/2/3 ⇒ rows 0–2 / 3–4 / 5–6):
   *   tier 1 → 0 — the ground floor pays in steps; there is nothing locked
   *                between her and the first landing, so a key there would be
   *                a key with nowhere to go.
   *   tier 2 → 1 — the storey under the first padlock.
   *   tier 3 → 1 — she is already past the gates; a second would only bank.
   *
   * Keys still reset nightly (MANOR_DESIGN §9), so this buys today's ascent
   * and never a stockpile, and `tests/economy-simulation.test.ts` re-measures
   * AAA 4.10b/c/d/e against it (a solve-fed climb is a faster climb, so the
   * lock rates below were re-tuned in the same change).
   */
  solveKeysByTier: [0, 1, 1] as readonly number[],
  /**
   * ── ROUND 22: THE GROUND FLOOR EARNS ITS OWN CLIMB, IF IT DID THE WORK ──
   *
   * `solveKeysByTier[0]` is 0, and the comment above defends it as *"a key
   * there would be a key with nowhere to go"*. Measured, that turned out to be
   * the largest hole in the round-10 directive: 0-based rows 0–2 are **62% of
   * every room the median player enters**, so on nearly two thirds of the
   * rooms she actually plays, playing the word games well bought steps she did
   * not need and nothing else. Keys reset nightly (MANOR_DESIGN §9) but they do
   * NOT reset at noon — a key earned on the ground floor at dusk is the key
   * that opens row 4 the same evening, which is exactly the climb the directive
   * is about.
   *
   * It is not granted flat, because a flat tier-1 key would also be paid by the
   * Gallery's twenty seconds and the whole point of round 22 is that reward
   * follows WORK. A tier-1 solve pays a key when the room asked at least
   * `workKeyMinutes` of honest work (`ROOM_EFFORT`): the Library, the Darkroom,
   * the Conservatory, the Counting House — never the 75-second Linen Closet.
   * The tier table is a FLOOR, so rows 3–6 are exactly what they were.
   *
   * ROUND 26: the Gallery is no longer a twenty-second room (1.25 min at tier
   * 1), and it still does not pay a ground-floor key — 1.25 < 3.0 — which is
   * deliberate rather than incidental. It remains the SHORT anchor of the
   * house, the padlock arc's supply was budgeted at +0.4–0.5 keys/day against
   * the rooms listed above, and opening a new tier-1 key source is a campaign
   * change (AAA 4.10c/d re-measured over 200 seeded campaigns), not a
   * side-effect of a word-game fix. If the Gallery is ever lengthened past
   * three minutes, that is the conversation, and this is where it starts.
   *
   * Budgeted, not asserted: measured over 200 seeded campaigns × 45 days this
   * is +0.4–0.5 keys/day, which replaces almost exactly what round 22's honest
   * clock removed (a hive or a sudoku is now rarely *finished*, and an
   * unfinished room pays no key) — AAA 4.10c/d are re-measured against it in
   * tests/economy-simulation.test.ts rather than argued about here.
   */
  workKeyMinutes: 3,
  /**
   * ── INDEXED BY AFFINITY **POINTS**, NEVER BY RANK ──────────────────────
   * `fernMorningKeysByPoints[p]` is the answer for p RAW POINTS, the integer
   * the day slice carries in `affinities.fern`. It is NOT an affinity-rank
   * table: ranks run 0–4 on the thresholds `[0, 2, 5, 9, 14]`
   * (engine/dialogue/affinity.ts). Passing `rankFor(points)` here would push
   * her first dawn key from 2 points out to 5 — past her entire authored
   * budget of 3 — and turn the padlock arc back into the wall it was, with
   * every test still green. Pinned by tests/steps.test.ts ("units").
   *
   * Fern's arc: a key left on the sill at dawn for a friend who tends the
   * garden with her. The padlock's answer to Bramble's tea — the same shape, the
   * same AAA 5.9 valve of one conversation a day, and the reason a skilled
   * player's FIRST Sanctum reach still lands around day 6–10 however well she
   * plays day 1.
   *
   * RE-INDEXED (round-5 economy audit): the table used to open at 4 points,
   * and Fern's authored dialogue grants **3 points in her entire lifetime**
   * (`FERN_ARC` below, asserted against the authored JSON in
   * tests/economy-simulation.test.ts). A gate whose key is unreachable is a
   * wall, so the first dawn key now lands at 2 points — inside the authored
   * budget, i.e. earnable by anyone who actually befriends her — and the
   * second only at 5, which takes weeks of bookmarks on top. Even then two
   * keys is barely over the ~1.7 padlocks an average ascent crosses: Fern
   * shortens the climb, she never walks it for you, and keys still reset
   * nightly (MANOR_DESIGN §9) so every ascent re-earns its way up.
   */
  fernMorningKeysByPoints: [0, 0, 1, 1, 1, 2, 2] as readonly number[],
} as const;

/**
 * ═══ THE LANDING ARC (round 13) — THE ACCESS GATE FINALLY HAS AN ARC ═══════
 *
 * TWO FINDINGS, ONE MECHANIC. Both were about the same hole: the second gate
 * of AAA 4.10e — ACCESS — had no arc and no floor of any kind.
 *
 *  1. **The arc was spent on day 12.** Tea hits `TEA_ARC.maxPoints` at day 12,
 *     Fern's dawn key at day 9, and both `CAMPAIGN_ARC` familiarity terms cap
 *     by day ~9. From day 13 the median player's evening was statistically
 *     identical forever — the game's answer to a player who keeps stopping a
 *     storey short was "roll again, nightly, with the same dice, indefinitely".
 *  2. **No mercy on the gate that binds.** Over 400 PROFILE_DECENT campaigns,
 *     EVERY unfinished campaign belonged to a player who already knew the
 *     word: `deductionDay` was never null, and the gap between knowing and
 *     winning ran median 9 evenings, p90 25, max 47. AAA 4.14 gives the
 *     KNOWLEDGE gate a guaranteed pity floor (`PITY_DROUGHT_DAYS`, synthesized
 *     letters that never exhaust); ACCESS had none, so the endgame for the
 *     owner's own profile was three-plus weeks of "I solved the mystery and
 *     the house will not let me say it".
 *
 * THE MECHANIC, in one sentence: **the more of the top storey she has
 * surveyed, the better her plans of it.** Every evening she stands on the
 * Sanctum landing is an evening she has seen that storey with her own eyes,
 * and the floorplan cabinet keeps what she saw — so the plans offered up there
 * lean, more and more, toward the ones that open onto the sealed door.
 *
 * WHY THIS SHAPE AND NOT A CHEAPER ONE:
 *   - it is EARNED, not clocked: the counter only moves on an evening she
 *     actually paid the climb (`BARE_ASCENT_STEPS` before a single walk-back),
 *     so it cannot ramp on the calendar the
 *     way `teaArcFloor` deliberately can;
 *   - it is STRICTLY PROGRESSIVE and it cannot touch the early campaign at
 *     all — `landingEvenings` is 0 until her first landing, which the same
 *     model puts around day 8 (skilled) / day 16 (median), so AAA 4.10d's
 *     "<8% on day 1" is untouched by construction rather than by tuning;
 *   - it is a WEIGHT, not a guarantee, so the landing draft stays a decision
 *     (AAA 4.6) instead of becoming a formality.
 *
 * THE MERCY is the one hard guarantee, and it is gated on BOTH halves so it
 * can only ever bite where the finding found it biting: she must be at the
 * deduction band (`mercyFragments` LEGIBLE pages — sealed smudges taught her
 * nothing and must not arm mercy, exactly as `legibleDroughtDays` rules for
 * the knowledge gate) AND have already stood on that landing `mercyEvenings`
 * times. After that the landing offer always contains a plan that opens north.
 * She still has to climb; she is no longer told to climb again.
 */
export const SANCTUM_ARC = {
  /**
   * WHAT COUNTS AS SURVEYING THE TOP, as a 0-based grid row: the third landing
   * (`ROW_NAMES[4]`), the storey the Sanctum stair is visible from, and the
   * first one `DOOR_LOCKS` padlocks. It is `SANCTUM_LANDING_ROW0 - 1`, and
   * tests/economy-simulation.test.ts pins the identity so the two cannot drift.
   *
   * Deliberately NOT the landing itself. Fuelled by landing evenings alone the
   * arc barely existed for the player it was built for: the median player
   * stands on that landing about one evening in twelve, so full warmth would
   * have been a three-month player and the late campaign would have stayed the
   * nightly coin flip the finding measured. The storey below is a real climb
   * (four storeys of walking, padlocked at 0.9) that she reaches often enough
   * for the arc to be an arc, and still one she cannot reach on day 1.
   */
  surveyRow0: 4,
  /**
   * Evenings surveying the top at which the plan bonus is fully warmed.
   * Deliberately slow — this is the LAST lever in the campaign and it has to
   * still be moving at day 30, which is the whole finding.
   */
  planEveningsToFull: 30,
  /**
   * Draft-weight multiplier ADDED to north-opening plans at the landing, at
   * full warmth. Raises the realised P(the 3-card landing offer contains a
   * plan that opens onto the Sanctum) from ~0.61 (bare deck) toward ~0.9.
   */
  maxPlanWeightGain: 6,
  /**
   * LEGIBLE fragments at which the access mercy is allowed to arm — the
   * optimistic end of the deduction band. Sealed pages do not count: a smudge
   * is not knowledge.
   *
   * ROUND 19 — DERIVED, NOT TRANSCRIBED. This was the literal `13`, copied from
   * `FRAGMENTS_TO_DEDUCE` when that band read [13, 17]. Round 18 moved the band
   * to [15, 17] and this copy stayed behind, so the access mercy armed TWO
   * PAGES BEFORE the player could possibly name the word — a floor opening
   * under a door she had no word for. Exactly the shape of `KNOWLEDGE.pityDays`
   * (round 18) and `KNOWLEDGE.studyChannelStock` (round 17): a constant
   * transcribed instead of derived, going stale in the reassuring direction.
   * `engine/volume.ts` owns the number; there is one of it now.
   */
  mercyFragments: FRAGMENTS_TO_DEDUCE[0],
  /**
   * Evenings already spent up there before the guarantee opens. One: she has
   * to have climbed to the top of the house and been turned away at least once
   * before the house starts helping, which is what keeps this off day 1
   * without any tuning at all.
   */
  mercyEvenings: 1,
} as const;

/**
 * 0..1 warmth of the surveyed-plan bonus, from evenings already spent on the
 * top storeys (`SANCTUM_ARC.surveyRow0` or above). Live source:
 * `chronicles.dayRecords`, whose `highestRow` is written every dusk and
 * persists forever — no save-schema change, and the same audited spine
 * `carryOverFrom` already reads.
 */
export function sanctumPlanWarmth(surveyEvenings: number): number {
  if (!Number.isFinite(surveyEvenings) || surveyEvenings <= 0) return 0;
  return Math.min(1, surveyEvenings / SANCTUM_ARC.planEveningsToFull);
}

/** Evenings in a persisted day-record list that surveyed the top storeys. */
export function surveyEveningsIn(
  records: readonly { highestRow?: number }[],
): number {
  return records.filter((r) => (r.highestRow ?? 0) >= SANCTUM_ARC.surveyRow0).length;
}

/** Draft-weight multiplier for a plan that opens onto the Sanctum. */
export function sanctumPlanWeightMultiplier(warmth: number): number {
  const w = Math.max(0, Math.min(1, warmth));
  return 1 + SANCTUM_ARC.maxPlanWeightGain * w;
}

/**
 * THE ACCESS MERCY (AAA 4.14's floor, for the gate that never had one).
 * Both halves required — she knows the word, and she has been up there and
 * been turned away. Either alone leaves the gate exactly as it was.
 */
export function sanctumMercyArmed(
  surveyEvenings: number, legibleFragments: number,
): boolean {
  return surveyEvenings >= SANCTUM_ARC.mercyEvenings
    && legibleFragments >= SANCTUM_ARC.mercyFragments;
}

/**
 * THE LIVE FERN ARC — what her affinity can actually reach, and when.
 *
 * These are not wishes: `meetPoints`/`questPoints` mirror the authored
 * `content/authored/dialogue/fern.json` (fern.meet.1's warm choice, +1;
 * fern.quest1.done, +2), and the economy simulation asserts the sum against
 * that file so a dialogue edit that changes her budget breaks the economy
 * tests instead of the owner's campaign. The DAYS are the AAA 5.9 valve
 * expressed in the calendar: one substantive conversation per character per
 * day, so a daily player meets her within a couple of days of the Greenhouse
 * appearing and finishes her favor about a week in.
 */
export const FERN_ARC = {
  meetPoints: 1,
  questPoints: 2,
  /** Day a daily player has typically met her (the Greenhouse is a common card). */
  meetDay: 2,
  /** Day her favor is typically closed out. */
  questDay: 7,
} as const;

/** Fern's affinity points on 1-based `day`, from her authored sources alone. */
export function fernPointsOnDay(day: number): number {
  if (day < FERN_ARC.meetDay) return 0;
  if (day < FERN_ARC.questDay) return FERN_ARC.meetPoints;
  return FERN_ARC.meetPoints + FERN_ARC.questPoints;
}

/**
 * KEY ACCESS — the other half of the padlock arc, and the half the shipped
 * game was missing entirely. `categoryWeight`/`RARITY_WEIGHTS` carry no day or
 * affinity term, so before this the odds of a key-bearing card were identical
 * on day 1 and day 30 (measured: ~0.21 per ground-floor offer, ~0.04 upstairs)
 * — a flat line where AAA 4.10d asks for a ramp.
 *
 * A friend of the groundskeeper hears where the spare keys are kept: her
 * affinity raises the DRAFT WEIGHT of key-bearing cards (the Key Cabinet, the
 * Boot Room) without touching category or rarity weights, so `deckMixAt` — and
 * with it the 4.10b clock calibration — is untouched. It is read by
 * `engine/manor/drafting.ts` through `DraftRollCtx.keyAccess`; with no Fern
 * friendship the multiplier is exactly 1 and drafting behaves as it always did.
 */
export const KEY_ACCESS = {
  /** Weight multiplier added to key-bearing cards at full access. */
  maxWeightGain: 2.5,
  /** Fern's points at which access is fully warmed (= her authored ceiling). */
  pointsToFull: FERN_ARC.meetPoints + FERN_ARC.questPoints,
} as const;

/** 0..1 key access from Fern's affinity points. */
export function keyAccessFor(fernAffinity: number): number {
  if (!Number.isFinite(fernAffinity) || fernAffinity <= 0) return 0;
  return Math.min(1, fernAffinity / KEY_ACCESS.pointsToFull);
}

/** Draft-weight multiplier for a key-bearing card at this access level. */
export function keyCardWeightMultiplier(keyAccess: number): number {
  const a = Math.max(0, Math.min(1, keyAccess));
  return 1 + KEY_ACCESS.maxWeightGain * a;
}

/**
 * Keys Fern leaves out at dawn. Granted when the day's manor is built
 * (app/slices/manor.ts) and zeroed again at night with the rest of the purse
 * — access is what the campaign buys, never a hoard.
 *
 * UNITS: `fernPoints` is RAW AFFINITY POINTS (`affinities.fern`), never an
 * affinity rank. See the indexing contract on `KEY_SUPPLY`.
 */
export function fernMorningKeys(fernPoints: number): number {
  if (!Number.isFinite(fernPoints) || fernPoints <= 0) return 0;
  const points = Math.floor(fernPoints);
  const table = KEY_SUPPLY.fernMorningKeysByPoints;
  return table[Math.min(points, table.length - 1)]!;
}

/**
 * Keys a solved room hands over, by its row-band tier (round 10 — the owner's
 * "skill, not just persistence, earns the campaign"). Applied by
 * `app/slices/room.ts` on the `solved` RoomEvent, i.e. through the ONE place
 * every room kind's solve already lands, rather than per-adapter: a future
 * room kind earns its keys the day it is registered, and no adapter can pay a
 * different rate than the table says.
 */
export function solveKeys(tier: Tier, kind?: RoomPuzzleKind): number {
  const i = Math.max(0, Math.min(KEY_SUPPLY.solveKeysByTier.length - 1, Math.floor(tier) - 1));
  const byTier = KEY_SUPPLY.solveKeysByTier[i]!;
  // Round 22: a room that asked for real work pays the padlock arc whatever
  // storey it stands on (see `KEY_SUPPLY.workKeyMinutes`). The tier table is a
  // floor — this can only ever add, and only on the storeys that paid nothing.
  const byWork = kind && effortMinutes(kind, tier) >= KEY_SUPPLY.workKeyMinutes ? 1 : 0;
  return Math.max(byTier, byWork);
}

/** Deterministic lock roll for a draft target cell (0-based row). */
export function doorLockedAt(daySeed: number, cellKey: string, row: number): boolean {
  const chance = DOOR_LOCKS.chanceByRow[row] ?? 0;
  if (chance <= 0) return false;
  let h = (daySeed ^ 0x10c4ed) | 0;
  for (const ch of cellKey) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 1000) / 1000 < chance;
}

/**
 * Bramble's morning tea (MANOR_DESIGN §8) — the campaign's main economic arc.
 * 0 points (just met) is a plain, kind cup worth nothing but the scene; by the
 * time she trusts you, the pot is worth nearly half a day again. THIS is what
 * turns "the Sanctum row is out of reach" into "the Sanctum row is reachable
 * if today goes well" somewhere around day 6–10, and it cannot be rushed —
 * affinity is one conversation a day (AAA 5.9). Applied as a 'tea' ledger
 * entry so it renders as a floating +N.
 *
 * ── INDEXED BY AFFINITY **POINTS**, NEVER BY RANK ────────────────────────
 * RENAMED in the round-6 audit: this table was called `TEA_BY_RANK` while
 * being indexed, correctly, by raw affinity POINTS (`affinities.bramble`).
 * The name invited exactly one silent catastrophe — a maintainer "fixing" the
 * call site to `teaBonus(rankFor(points))`, which would cap the pot at
 * TEA_BY_POINTS[4] (ranks only run 0–4 on the thresholds `[0, 2, 5, 9, 14]`,
 * engine/dialogue/affinity.ts) and quietly delete the top of the arc while
 * every test stayed green. It now says what it means, and
 * tests/steps.test.ts pins the units.
 *
 * Round-5 audit: the first two entries were lifted (3→4, 5→6) because the
 * early evenings — days 2–3, when she has met Bramble once and the manor is
 * still strange — measured 10.2–10.5 minutes, right on the floor of the 10–15
 * band. The top of the curve is untouched, so the campaign shape is
 * unchanged; only the first week got its promised length.
 *
 * ═══ ROUND-12 RETUNE — THE ARC ONLY EVER LIFTED THE PLAYER WHO DID NOT NEED IT
 * ═══
 * Every 4.10 campaign target was measured on `PROFILE_SKILLED` alone. Played as
 * `PROFILE_DECENT` — the profile whose own docstring calls it "the MEDIAN
 * evening, the one 4.10b clocks", i.e. the owner — the same model put the first
 * Sanctum-landing reach at median day 18–21 (10–14% never inside 45 days) and
 * the volume win at median day 33–34, with **25% of campaigns unfinished after
 * 45 evenings** against a published ">90% by day 35". She banks toward a gate
 * she rarely clears: 1.47 keys/day against the ~3.7 an ascent costs.
 *
 * The lever is deliberately the TEA and not the padlock, because the tea is the
 * arc AAA 4.10d assigns to persistence ("the step arc") while keys belong to
 * the round-10 skill directive. Four levers were simulated before this one was
 * chosen (400 seeded campaigns each, both profiles):
 *   - `KEY_SUPPLY.solveKeysByTier` → [0,1,2] moved NOTHING: tier 3 is 0-based
 *     rows 5–6, and row 5 IS the landing, so a tier-3 solve only ever happens
 *     after the climb it was supposed to buy;
 *   - `DOOR_LOCKS.keyCost` 2→1 and `solveKeysByTier` → [0,2,2] put a skilled
 *     player at the door on day 1 in 17–20% of campaigns (published: <8%);
 *   - `fernMorningKeysByPoints` → 2 at her authored ceiling fixed the median
 *     player outright, but made FERN the largest key source in the game
 *     (2.0/day against 1.16 from solves), inverting round 10's directive;
 *   - lowering `DOOR_LOCKS.chanceByRow[4..5]` doubled the skilled player's
 *     day-1 reach (3.6% → 6.8%) against a published <8% ceiling.
 *
 * Lifting the top four rungs of THIS table is the one lever that is strictly
 * progressive: it is worth nothing to a player who is already standing on the
 * landing and everything to one who keeps stopping a storey short, and it
 * cannot touch the early game at all — `teaArcPoints` does not reach point 3
 * until day 6, so days 1–5 are bit-identical and the owner's "way too easy on
 * day 1" complaint is untouched. Measured after (300 campaigns × 4 seeds):
 * the median player's first reach moves day 18–21 → 16–17, her win day 33–34
 * → 29–31, and her never-finished share 25% → 11–15%; the skilled player's
 * published numbers do not move (reach median 7–8, day-1 3.0–7.3%, win median
 * 15–16). Both bands are now published in AAA 4.10e and pinned in
 * tests/economy-simulation.test.ts, which is the half of this that matters:
 * the retune narrows the gap, the second measured profile is what stops the
 * criterion from describing a player nobody checked.
 */
export const TEA_BY_POINTS: readonly number[] = [0, 4, 6, 8, 10, 12, 13];

/**
 * The morning pot for a Bramble affinity of `bramblePoints` RAW POINTS
 * (never a rank — see the indexing contract above).
 */
export function teaBonus(bramblePoints: number): number {
  if (!Number.isFinite(bramblePoints) || bramblePoints <= 0) return 0;
  const points = Math.floor(bramblePoints);
  return TEA_BY_POINTS[Math.min(points, TEA_BY_POINTS.length - 1)]!;
}

/**
 * ═══ ROUND 23 — A CUP AT THE DOOR, THE POT ON THE LANDING (REVIEW_AA §5.10)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE DEFECT, measured before this existed: **the ground floor got richer
 * every week and never got dearer.** `TEA_BY_POINTS` climbs 0 → +13 and it
 * all landed at dawn, so the purse she carried around rows 0–2 ran 21 steps
 * on day 1 (the pot was 3 then) and 31 by day 12 against a floor that charged 1 step a
 * room. Median steps in hand down there: **28 (median player) / 30 (skilled)
 * against an 18-step budget**, p10 20/26 — she was never once poor on the
 * storeys where she spends 62% of her evening, and she arrived at the first
 * padlocked storey holding more than she started the day with. The campaign's
 * main economic arc was being spent slackening the floor it was never about.
 *
 * THE FIX IS NOT A CUT. Bramble's pot is the same size it has always been and
 * grows on the same schedule (`TEA_ARC`); what changed is WHERE she puts it
 * down. She pours a cup at the door — `dawnCup`, the same **4** steps the
 * scripted first morning is worth (`FIRST_MORNING_POT`, which this same round
 * moved 3 → 4), so **the ground floor runs on the same purse on day 1 and on
 * day 30 alike** — `BASE_DAY_BUDGET + dawnCup`, 22 when this shipped and 26
 * since round 36 moved the budget — and carries the rest of the pot up to the
 * second landing, which is where the climb the arc exists to fund begins.
 *
 * Why the SECOND landing (0-based row 3) and not higher or lower:
 *   - it is the first storey ABOVE the tier-1 band (`rowTier`), i.e. exactly
 *     the boundary §5.10 is drawn at ("below row 4");
 *   - it is the storey BELOW the first padlock (`DOOR_LOCKS.chanceByRow[4]`),
 *     so the pot is in her hand when the gate she has to prepare for appears;
 *   - it costs three moves to reach from the entrance — 9 steps of a 26-step
 *     purse, when it was 6 of 22 — so a timid evening can always go and get
 *     it. It is a pour she walks to, never a pour she can be denied.
 *
 * *(Round 25 correction. This block shipped quoting the table it REPLACED: "the
 * same 3 steps" (`dawnCup` is 4), "21 steps on day 1 and on day 30" (it is 22,
 * which is what the `dawnCup` member comment below says, so the file
 * contradicted itself), and "2+2+3 = 7 steps out of a 21-step purse" (the walk
 * to row 3 is 2+2+2 = 6 out of 22, under the one-price band this very round
 * introduced). Three arithmetic claims about the change, all computed on the
 * pre-change constants.)*
 *
 * WHAT THIS DOES NOT TOUCH, by construction: day 1. `teaBonus(0)` is 0, so on
 * the first evening there is no pot to split and AAA 4.10d's "<8% stand at the
 * door on day 1" cannot move because of this at all.
 *
 * The total is unchanged, so the ARC is unchanged — a warmer Bramble is worth
 * exactly what she always was, over the course of an evening. What is no
 * longer true is that her friendship is spendable on the ground floor.
 */
export const TEA_POUR = {
  /**
   * The cup at the door. Deliberately `FIRST_MORNING_POT`-sized: with it, the
   * dawn purse is `BASE_DAY_BUDGET + 4` on every evening of the campaign,
   * which is the exact purse day 1 has always had (22 when this shipped; 26
   * since round 36 moved the budget with the move price). The ground floor
   * stops getting easier — that invariant is the §5.10 gate
   * (tests/economy-pressure.test.ts), and it is stated as an EQUALITY between
   * day 1 and day 30 rather than as a level, so moving the budget cannot
   * quietly satisfy it.
   */
  dawnCup: 4,
  /**
   * 0-based grid row the rest of the pot is set down on: the second landing,
   * the first storey above the tier-1 band and the last one below a padlock.
   */
  landingRow0: 3,
  /**
   * Ledger `roomKey` the landing pour is stamped with. It is how the live
   * slice knows the pot has already been carried up today (the ledger resets
   * at dawn, so no save field can go stale) — and 'move' is the only reason
   * `priceEntry` re-prices by roomKey, so stamping a 'tea' entry is inert.
   */
  key: 'tea:landing',
} as const;

/** The cup poured at dawn for `bramblePoints` raw points (never a rank). */
export function teaDawnPour(bramblePoints: number): number {
  return Math.min(teaBonus(bramblePoints), TEA_POUR.dawnCup);
}

/** The rest of the pot, carried up to the second landing. */
export function teaLandingPour(bramblePoints: number): number {
  return teaBonus(bramblePoints) - teaDawnPour(bramblePoints);
}

/**
 * THE LIVE TEA ARC — the source of the points `TEA_BY_POINTS` indexes.
 *
 * Round-5 audit: `TEA_BY_POINTS` needs 6 points for its full pot, and Bramble's
 * authored file grants **2 in her entire 57-node lifetime** (both `once:true`),
 * with everything beyond that competing for the same scarce bookmarks as four
 * other characters. The published day 6–10 / 14–28 curve was therefore verified
 * against a warmth the live game could not reach — and, worse, taking the
 * curious dialogue choice instead of the warm one silently forked the economy
 * (AAA 5.13).
 *
 * The fix is to put the arc where the arc actually happens: SHARED MORNINGS.
 * Sitting down to tea with her is the one substantive conversation the AAA 5.9
 * valve already allows per day, so every second morning warms her by a point,
 * to a ceiling of `maxPoints`.
 *
 * ═══ ROUND-7 CORRECTION — THE ARC WAS CLOCKED, NOT BOUGHT ═══
 * `startDay` applied `max(known, teaArcPoints(day))` unconditionally, so what
 * the docs call "shared mornings, one conversation a day (AAA 5.9)" was in
 * fact the calendar: the pot grew whether or not she ever sat down with
 * Bramble, and the player had no agency in the one arc that decides when the
 * Sanctum becomes affordable. The two halves are now separated:
 *
 *   - `teaArcPoints(day)` is the CEILING — the warmth a player who shares the
 *     morning every day is entitled to have reached by day `day`. The point
 *     itself is granted by `DaySlice.shareMorningTea()` when the morning scene
 *     actually plays, and the pot is topped up in the same breath so the
 *     +N lands on the counter while she is looking at it (AAA 4.9 / 11.15).
 *   - `teaArcFloor(day)` is the MERCY — the same curve, `floorLagMornings`
 *     behind, applied at dawn so a player who skipped mornings still warms
 *     eventually (AAA 5.5, nothing missable). She simply runs a rung behind
 *     the player who sat down.
 *
 * Both are floors on `affinities.bramble`, never overwrites, so gifted points
 * and authored points only ever add, and no dialogue choice can lose the arc
 * (AAA 5.13).
 *
 * This is also the live counterpart of the simulation's tea ramp:
 * `engine/economy/simulate.ts` reads `teaArcPoints` for a campaign's tea rank
 * — the simulated player plays every day and takes her tea, so she sits on the
 * ceiling — rather than a hard-coded `CAMPAIGN_ARC` constant with nothing
 * behind it.
 */
export const TEA_ARC = {
  /** Mornings of shared tea per +1 point of Bramble affinity. */
  morningsPerPoint: 2,
  /** Ceiling — the pot tops out here (TEA_BY_POINTS's last index). */
  maxPoints: TEA_BY_POINTS.length - 1,
  /**
   * How far behind the ceiling the unconditional dawn floor runs. Two mornings
   * = exactly one rung of the arc: skip your tea and the pot is one rung
   * smaller until you start turning up again.
   */
  floorLagMornings: 2,
} as const;

/**
 * Bramble's affinity CEILING on 1-based `day` — what shared mornings can have
 * bought by now. `shareMorningTea()` grants against this; nothing else does.
 */
export function teaArcPoints(day: number): number {
  if (!Number.isFinite(day) || day <= 0) return 0;
  return Math.min(TEA_ARC.maxPoints, Math.floor(day / TEA_ARC.morningsPerPoint));
}

/**
 * The unconditional dawn FLOOR on 1-based `day`: the same curve, one rung
 * behind, so a player who never sits down still warms — later, and less.
 */
export function teaArcFloor(day: number): number {
  return teaArcPoints(day - TEA_ARC.floorLagMornings);
}

/**
 * THE FIRST MORNING'S POT (AAA 4.10b, round-5 audit).
 *
 * Day 1 starts at 0 affinity — `teaBonus(0)` is 0 by design, because 0 points is
 * "a plain, kind cup" — so the very first evening ran on the bare 18 and
 * measured ~9.0 minutes at the median, UNDER the promised 10–15 floor. The
 * first one or two evenings are the ones that decide whether she comes back,
 * so day 1 gets a scripted pot: the economy's twin of the scripted first draft
 * (AAA 4.5), a one-off welcome that is ledgered through the audited path as a
 * 'tea' entry and renders as a floating +N like everything else.
 *
 * Deliberately NOT a bigger `BASE_DAY_BUDGET`: this is a ONE-OFF welcome, and
 * folding it into the budget would hand it to day 30 as well. (The old reason
 * given here — "20 would equal the bare ascent cost and break the headline
 * invariant `reserveToTop(1) > BASE_DAY_BUDGET`" — died with that invariant in
 * round 36; see `MOVE_COST_BY_ROW` for what replaced it.)
 */
export const FIRST_MORNING_POT = 4;

/** The scripted welcome pot, on day 1 only. */
export function firstMorningPot(day: number): number {
  return day === 1 ? FIRST_MORNING_POT : 0;
}

/** Fresh ledger for a new day. */
export function createLedger(budget: number = STEP_TABLE.dayStart): StepLedger {
  return { budget, entries: [] };
}

/**
 * Normalize an entry before it enters the ledger. Movement is the one reason
 * whose price depends on WHERE it happened: callers pass `roomKey` ("col,row"
 * — engine/manor/grid.ts `cellKey`) and the audited path re-prices the delta
 * through `moveAt(row)`. Keeping this here (rather than at each call site)
 * means per-row movement pricing cannot be bypassed by a caller that still
 * passes the deprecated flat `STEP_TABLE.move`.
 */
export function priceEntry(entry: StepEntry): StepEntry {
  if (entry.reason !== 'move' || !entry.roomKey) return entry;
  const parts = entry.roomKey.split(CLIMB_KEY_SEP);
  let delta: number;
  if (parts.length === 2) {
    // A climb differential: "from>to" (see CLIMB_KEY_SEP). Floors at 0 so
    // walking back downstairs is never paid out as a refund.
    const from = rowOfCellKey(parts[0]!);
    const to = rowOfCellKey(parts[1]!);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return entry;
    delta = Math.min(0, moveAt(to) - moveAt(from));
  } else {
    const row = rowOfCellKey(parts[0]!);
    if (!Number.isFinite(row)) return entry;
    delta = moveAt(row);
  }
  return delta === entry.delta ? entry : { ...entry, delta };
}

/** Pure append — the only way a delta enters the economy. */
export function appendEntry(ledger: StepLedger, entry: StepEntry): StepLedger {
  return { budget: ledger.budget, entries: [...ledger.entries, priceEntry(entry)] };
}

/** Raw signed total (may be negative mid-puzzle; never rendered negative). */
export function ledgerTotal(ledger: StepLedger): number {
  return ledger.budget + ledger.entries.reduce((sum, e) => sum + e.delta, 0);
}

/** Steps left to spend. Never negative (AAA 4.9). */
export function stepsRemaining(ledger: StepLedger): number {
  return Math.max(0, ledgerTotal(ledger));
}

/** Magnitude of everything spent today (for the day record / chronicles). */
export function stepsSpent(ledger: StepLedger): number {
  return ledger.entries.reduce((sum, e) => (e.delta < 0 ? sum - e.delta : sum), 0);
}

/** Everything refunded today: solves, tea, snacks (for the night digest). */
export function stepsRefunded(ledger: StepLedger): number {
  return ledger.entries.reduce((sum, e) => (e.delta > 0 ? sum + e.delta : sum), 0);
}

/**
 * The day's starting total (budget + morning tea) — the reference the chrome
 * burn-down bar measures against so the wick reads as "how much day is left".
 */
export function dayStartTotal(ledger: StepLedger): number {
  return ledger.budget + ledger.entries.reduce(
    (sum, e) => (e.reason === 'tea' ? sum + e.delta : sum), 0);
}
