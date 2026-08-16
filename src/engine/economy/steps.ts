/**
 * Step economy — OWNER: A2 (Economy/Day). Pure TS, no React/DOM.
 *
 * THE single audited ledger (AAA 4.9): every step delta in the game flows
 * through `STEP_TABLE` + `appendEntry`. No slice writes steps directly; the
 * UI renders each entry as a floating +N/−N on the counter.
 *
 * ═══ ROUND 42 — A STEP *IS* A MOVE. THE OWNER'S CORRECTION (THE_CLIMB §1b) ═══
 *
 * > *"Why isn't it just 1 step is −1. Why do you keep coming up with a
 * >  convoluted economy. What you should be modifying is the amount of steps
 * >  you start with and how many more you can earn and the penalties."*
 * > *"Step penalty for wrong guesses is way too harsh on things… it should be
 * >  1 step for a wrong guess on things."*
 *
 * Round 36 shipped a flat **−3 a move against a budget of 22**, and 22 steps at
 * 3 a move is **seven moves** — a fiction the player has to divide her way out
 * of. Both cold-read testers reported their step counter moving for reasons they
 * could not account for; you cannot audit a ledger denominated in an arbitrary
 * unit. Every number in this file is now denominated in MOVES, and a move costs
 * one, so the counter *is* the quantity it measures: "I have twelve moves left."
 * The player-facing word stays "steps" — it is the manor's word — and for the
 * first time it is honest, because one step is exactly one move.
 *
 * THE SHAPE, and none of the first four lines is a tuning parameter:
 *
 *   1. **A MOVE COSTS 1**, on every storey (`MOVE_COST_BY_ROW`). Scarcity comes
 *      from DISTANCE WALKED — you run low because you went east, hit a sealed
 *      room and had to come all the way back (round 36, THE_CLIMB §1, kept).
 *   2. **A DAY STARTS AT 12 MOVES** (`BASE_DAY_BUDGET`, the owner's 10–14).
 *   3. **A WRONG GUESS COSTS 1 MOVE**, every room, every tier, every weight
 *      (`mistakeDelta`). It was −2, −3 at tier 3 and ×2 on a heavy claim: an
 *      incoherent ladder that priced an error at up to a whole room.
 *   4. **SOLVING BUYS MORE DAY.** A room costs a move to walk into and a solve
 *      pays moves back (`SOLVE_WAGE`), so a good session extends itself and a
 *      poor one folds early. That is what puts the word games at the CENTRE of
 *      the economy rather than beside it.
 *   5. WHAT STOPS A GREAT DAY BEING ENDLESS is *not* a cap on what she can earn
 *      — it is geometry plus arithmetic, both measured rather than assumed. See
 *      `SOLVE_WAGE` for the measurement: the average room is net **negative** in
 *      moves for every profile, so solving lengthens the evening and can never
 *      sustain it, and the manor is 31 draftable cells with a frontier that
 *      closes. Measured over 6,000 evenings, no profile ever filled the house
 *      and the median great day is 13 rooms.
 *   6. **EVENING LENGTH IS AN OUTPUT** of (2) and (4) and must never again be
 *      steered by re-pricing (1). Round 36 chose −3 to hold the evening inside
 *      its published band; that is tuning a derived quantity through the wrong
 *      lever and it is what produced the mess.
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
 *      (`SOLVE_WAGE.capByTier`) rather than a per-tier anchor rate. Round 42
 *      re-derives the ceiling off the STAIRCASE rather than off the budget: the
 *      most a single solve may pay is one bare ascent, and a move leaner every
 *      storey. A tier-3 solve softens the next mistake; it never bankrolls the
 *      next storey.
 *   3. LEAN DAY BUDGET. 40 → 18 → 22 → **12 moves** (round 42, the owner's own
 *      number). A decent day is 7–11 rooms and 10–15 minutes (AAA 4.10).
 *   4. LOCKED DOORS UP TOP. `DOOR_LOCKS`: drafting into 0-based rows 4+ can
 *      demand a key. Deep pushes are PREPARED for (Key Cabinet, Fern's
 *      trades) — you cannot stumble into the Sanctum row.
 *   5. THE REFILL CURVE IS A CAMPAIGN ARC. Bramble's tea (`TEA_BY_POINTS`)
 *      climbs 0 → +6 across her friendship — one move a point — and refills
 *      shrink to +1..+2. The budget that makes the Sanctum reachable is EARNED
 *      over days.
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
 *   - **ROUND 42: every costed mistake is −1, at every weight and every tier**
 *     (it was −2, −3 at tier 3, ×2 on a heavy claim) — the owner's ruling, see
 *     `mistakeDelta`
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
 * Start-of-day budget, **in moves** (AAA 4.10). Owner retune: 40 → 18 → 22 →
 * **12**. Read this together with `MOVE_COST_BY_ROW` — the two numbers were one
 * lever for six rounds, and round 42 unbolted them: the move price is a RULING
 * now (a move costs 1) and this is the only end of the lever anyone may pull.
 *
 * ═══ ROUND 42 — 22 STEPS AT 3 A MOVE WAS SEVEN MOVES (docs/THE_CLIMB §1b) ═══
 *
 * > *"What you should be modifying is the amount of steps you start with and
 * >  how many more you can earn and the penalties."*
 * > *"10–14 moves at the start… but you can earn more moves as you go yeah?"*
 *
 * **12 is the owner's number**, the middle of the 10–14 he gave, and it is not
 * derived from a band — the bands are derived from IT. What was measured is
 * everything downstream, on the grid-true model, before and after (4,800 seeded
 * evenings a profile, 800 campaigns a profile, four seeds):
 *
 *   - the median evening holds inside 4.10b: **13.6 minutes** against 12.2
 *     before, p90 17.8 against 17.5, **9 rooms** against 8 (band 7–11);
 *   - the campaign holds: her first door day 16 (was 16), her volume win day 18
 *     (was 19), his door 13 (was 14), his win 14 (was 15);
 *   - the ground floor got DEARER per room, not cheaper: **−0.95 moves** a
 *     ground-floor room against −2.14 steps (−0.71 moves) before.
 *
 * The reason those numbers barely move while the purse grows 7.3 → 12 moves is
 * the third clause of the same ruling: **a wrong guess costs 1 move now** rather
 * than two thirds of one. Mistakes were 36% of the whole economy at round-36
 * HEAD (≈10 a day at −2 against a 56-step turnover) and they are the same ≈10 a
 * day at −1 against a 22-move turnover — 45%. A bigger purse and a dearer error
 * very nearly cancel, which nobody predicted and which is why it is written down
 * here rather than claimed as design.
 *
 * WHAT MOVES WITH IT, by construction rather than by choice:
 *   - `TEA_POUR.dawnCup` = `FIRST_MORNING_POT` = 1, so the dawn purse is **13**
 *     on day 1 and on day 30 alike (§5.10's equality, unchanged in form);
 *   - `SOLVE_WAGE.capByTier` is NO LONGER thirds of this number — see its own
 *     note. Tying the payout ceiling to the budget is what made a solve worth
 *     two thirds of a day; it is tied to the staircase now.
 */
export const BASE_DAY_BUDGET = 12;

/**
 * Mistake / hint pricing row: a deliberate wrong claim in a deduction room.
 *
 * ═══ ROUND 42 — ONE MOVE. EVERY ROOM, EVERY TIER, EVERY WEIGHT ════════════
 *
 * THE OWNER, 12 Aug: *"Step penalty for wrong guesses is way too harsh on
 * things… it should be 1 step for a wrong guess on things."*
 *
 * This function used to answer −1 (structural), −2, −3 (tier 3) and −4 (a
 * weight-2 claim at tiers 1–2) — an incoherent ladder against a −3 move, so a
 * single wrong Word Web group cost two thirds of a room and a heavy claim cost
 * more than a room. It is **−1** now, which is one move: the same price as
 * walking into the room the mistake happened in, and the smallest integer the
 * ledger has.
 *
 * The parameters stay in the signature and are deliberately ignored. Nine call
 * sites across five adapters pass a weight and a tier, and a room that wants to
 * price its own errors differently is a conversation with the owner, not a
 * refactor — deleting the arguments would hide that the option was closed on
 * purpose. `tests/steps.test.ts` asserts every (weight, tier) pair answers −1,
 * so a future round has to delete a documented ruling rather than reintroduce a
 * ladder by adding one branch.
 *
 * The AAA R.1 rulings that survive unchanged: weight 0 is a FREE feedback
 * moment and is never ledgered at all, and a hint purchase prices through this
 * same row (A3's revision) — a hint asked for and an answer got wrong cost the
 * same one move, which is the cozy reading of both.
 */
function mistakeDelta(_weight: 1 | 2 | 'structural', _tier: Tier): number {
  return -1;
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
 * ═══ ROUND 42 — AND THE PRICE IS **ONE**. IT IS A RULING, NOT A KNOB ═══════
 *
 * > *"Why isn't it just 1 step is −1. Why do you keep coming up with a
 * >  convoluted economy."*
 *
 * Round 36 chose −3 over −2 to keep EVENING LENGTH inside its published band,
 * and wrote the reasoning out at length two paragraphs below this one. That is
 * steering a DERIVED quantity through the wrong lever, and it is the whole of
 * how this economy got convoluted: 22 steps at 3 a move is seven moves, so the
 * counter on the glass measured nothing the player could name.
 *
 * **The price is 1. It is not available to a future round as a tuning
 * parameter.** If the evening comes out too short or too long, the levers are
 * `BASE_DAY_BUDGET` and the PAYOUTS (`SOLVE_WAGE`, `TEA_BY_POINTS`,
 * `STEP_TABLE.snack`) — which is the owner's own list, in his own words, and
 * `tests/steps.test.ts` pins this table to −1 with that sentence attached.
 *
 * What survives from round 36 whole: scarcity comes from DISTANCE WALKED, the
 * table stays seven long so a future storey can still be priced differently if
 * an owner ruling ever asks for it, and `climbStepCost` still rises strictly
 * with the row because the walk-back to a frontier door is longer up top.
 *
 * ── THE ROUND-36 REASONING, KEPT SO THE MISTAKE IS LEGIBLE ─────────────────
 * −2 (the old ground price, kept everywhere) was measured and rejected: it made
 * the whole campaign a walkover. The skilled player's first door fell to day 14
 * — the floor of a band whose ceiling is 22 — the median player's volume win to
 * day 19 against a published 24–32, and his evening ran 20.5 minutes against a
 * published ceiling of 20. The bare ascent to the landing would have been 10
 * steps of a 22-step purse. −4 goes the other way and is worse: the evening
 * collapses to 7.6 minutes and the median player's win runs to day 30.
 * Every one of those measurements is real and every one of them is an argument
 * about the wrong lever: they are all statements about how long an evening runs,
 * and an evening's length is an output of what she is GIVEN and what she EARNS.
 *
 * ── WHAT ROUND 36 DELETED, AND WHAT REPLACED IT ────────────────────────────
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
 * ── ROUND 42 KILLS THE SECOND HALF OF THAT INVARIANT TOO, AND SAYS SO ──────
 * Round 36's replacement clause was: **the REALISTIC ascent costs more than the
 * whole budget** — `reserveToTop(1, PROFILE_SKILLED)` was 25.8 against 22, i.e.
 * 8.6 moves against 7.3. Denominated in moves the left-hand side does not move
 * at all (**8.6 moves**, the same climb), and the right-hand side is 12 now, so
 * the inequality is false: 8.6 < 12. A skilled player CAN pay for the whole
 * realistic ascent out of the dawn purse.
 *
 * That is stated rather than repaired, because repairing it would mean pushing
 * the budget back under the owner's own 10–14 to keep an arithmetic sentence
 * alive. **The claim it was standing in for is measured instead, on instruments
 * that can disagree with it, and every one of them still holds:**
 *
 *   - a refund-less SKIPPER stands at the sealed door on **0.067% of evenings**
 *     (2 in 3,000; it was 0.03%) and still tops out at 1-based row 4;
 *   - a skilled player stands there on **day 1 in 1.3% of campaigns** against a
 *     published <8%, and first stands there at median **day 13**;
 *   - a GREAT single evening reaches the landing storey on **8.0%** of days,
 *     against a published <25%.
 *
 * The reason the arithmetic can die without the design dying is the one round 24
 * wrote down and round 37 confirmed: ***"the deck's door layouts, not the step
 * table, are what price the top of the house."*** The ascent was never bought
 * with the tariff; it is bought with a north-opening plan at the top of a house
 * that has to be walked through to get there.
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
export const MOVE_COST_BY_ROW: readonly number[] = [-1, -1, -1, -1, -1, -1, -1];

export function moveAt(row: number): number {
  const i = Math.max(0, Math.min(MOVE_COST_BY_ROW.length - 1, Math.floor(row)));
  return MOVE_COST_BY_ROW[i]!;
}

/**
 * The bare, perfectly efficient ascent from the entrance (0-based row 0) to the
 * Sanctum landing (0-based row 5): five moves, at whatever one move costs. 22
 * under the altitude toll; 15 under a flat −3; **5** now that a move costs 1,
 * which is the first time this constant reads as what it is — *the staircase is
 * five moves tall.*
 *
 * It is also the payout ceiling (`SOLVE_WAGE.capByTier`), on purpose: the most
 * a single solved room may ever hand back is one whole staircase.
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
  return stepWords(-moveAt(row));
}

/**
 * "3 steps" / "**1 step**" — the one place the unit is pluralised.
 *
 * ═══ ROUND 42 — "−1 steps" WAS UNREACHABLE FOR SIX ROUNDS, THEN IT WASN'T ═══
 * Every price in the game used to be 2 or more, so a dozen toast strings across
 * five room adapters, the rate card and the draft card wrote `${n} steps` and
 * were right by accident. A move costs 1 now, a wrong guess costs 1, the cozy
 * solve floor is 1 and four of the seven green cards pay 1 — so the commonest
 * numbers in the ledger are the singular ones, and the ungrammatical form would
 * have shipped on the very first wrong guess of the very first room.
 *
 * There is one of these now, exported from the table that owns the unit, and
 * `tests/notice-copy.test.ts` walks every shipped step string for a bare
 * "1 steps". It takes a MAGNITUDE: the sign belongs to the sentence around it
 * ("−1 step", "+1 step"), because a toast says what it cost and the ledger says
 * which way.
 */
export function stepWords(n: number): string {
  return `${n} step${Math.abs(n) === 1 ? '' : 's'}`;
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
 * WHEN THE DAY READS AS NEARLY OVER — a quarter of the starting moves left.
 *
 * ═══ ROUND 42 — TWO SURFACES HELD TWO TRANSCRIBED COPIES OF THIS ═══════════
 * The music director guttered its bed at `stepsRemaining() <= 6` and the candle
 * in the chrome guttered its flame at `Math.max(6, startTotal * 0.15)`. Both
 * sixes were written against a 26-step dawn purse (23% of it) and neither was
 * derived, so denominating the day in moves would have left the score anxious
 * and the candle low for HALF of every evening — the two loudest "you are
 * running out" signals in the game, firing from the middle of a normal day.
 *
 * There is one of it, it lives with the unit it counts, and both surfaces read
 * it, so the flame and the bed can never disagree about when the day is late.
 */
export const STEPS_LOW_AT = Math.round(BASE_DAY_BUDGET / 4);

/**
 * A wrong guess at the Sanctum door costs nothing but the day's one guess
 * (AAA 4.17, MANOR_DESIGN §7). Exported as a named zero so the rule is
 * grep-able and a future economy pass has to delete a documented constant
 * rather than silently add a price.
 */
export const SANCTUM_GUESS_COST = 0;

/**
 * ═══ ROUND 44 — WHAT A STUDY PAYS, AND WHY IT IS A REFUND AND NOT A WAGE ══
 *
 * Owner, from play: *"For the gallery, for the words that aren't part of the
 * gallery, it was confusing what their purpose was. It didn't automatically add
 * steps."* Two blind testers reached the same belief in `docs/COMPREHENSION.md`
 * before him — *only five specific pre-chosen words count* — which is the exact
 * belief the class was built (round 28) to kill, and which two rounds of copy
 * (28's captions, 20's `+1` mark) have now failed to kill. He traced a real word
 * on a legal path and waited for the economy to answer. It answered with a score
 * point, which is not a unit he spends.
 *
 * ═══ WHY IT CANNOT BE A WAGE, WITH THE NUMBER THAT SETTLES IT ═════════════
 *
 * The Gallery is ALREADY the joint top of the house's wage table: `solvePayout`
 * pays it 1 move for 1.25 honest minutes at tier 1 — **0.80 moves a minute**,
 * against 0.176 at the bottom (sudoku t3), which is the 4.53× spread AAA 4.10h
 * publishes as a ratchet that may fall and may never rise. It is at the top not
 * because it is generous but because `SOLVE_WAGE.floor` catches it: 0.45 × 1.25
 * is 0.56 of a move, and the ledger has no coin smaller than 1.
 *
 * So there is no room above it to pay a study a WAGE. Priced honestly at the
 * house rate a study is worth `0.45 × 0.25 min` = **0.11 of a move** — nine
 * studies to the move at tiers 1–2, five at tier 3 — and nine is not a number
 * that answers a woman who has traced one word. Priced at the smallest coin the
 * ledger has, one move a study, a 1.25-minute room paying its solve plus four
 * studies earns 5 moves for 2.25 minutes: **2.22 moves a minute, and the
 * published spread goes 4.53× → 12.6×.** That is the ratchet broken by a factor
 * of three, and `tests/economy-effort.test.ts` fails on it by name.
 *
 * ═══ SO IT GIVES BACK, RATHER THAN EARNING ════════════════════════════════
 *
 * A wage prices WORK; a refund un-charges a COST. The ledger has always known
 * the difference (`stepsSpent` / `stepsRefunded`), and `SOLVE_WAGE.floor`
 * already states the cozy version of it in this unit: *a solved room always pays
 * back at least the move it cost to walk into.* This is that sentence, moved off
 * the solve and onto the honest word:
 *
 *   **A STUDY PAYS BACK THE MOVE YOU SPENT WALKING IN. ONCE A BOARD.**
 *
 * Every clause of it is load-bearing:
 *   - it PAYS, in moves, the one unit the game counts in — the owner's sentence;
 *   - it is a refund, so it is bounded ABOVE by a cost she has already paid and
 *     the Gallery's wage does not move at all. No band in 4.10h changes;
 *   - it is once a board, so the forty studies on a tier-3 grid cannot be
 *     farmed, and the room can never be walked out of richer than it was walked
 *     into — a Gallery she traces one word in and abandons is exactly break-even
 *     and never better;
 *   - it does NOT open the door. The exhibition still opens on `targetCount`
 *     WORKS and nothing else, so round 26's defect (five common words ending a
 *     room) stays shut. Paying is not opening.
 *
 * WHAT IT COST, measured on the grid-true model over 4,800 evenings a profile
 * (`tests/economy-pressure.test.ts`, `tests/economy-simulation.test.ts`), and
 * both are re-measured every run by instruments that can disagree with this
 * note: see the BUILT block in `docs/THE_CLIMB.md` §1c.
 */
export const STUDY_REFUND = {
  /**
   * Moves one study hands back — the move she spent walking in, which is the
   * ledger's smallest coin and `SOLVE_WAGE.floor`'s own number. It is the same
   * constant deliberately: if the price of a move ever moved, this moves with
   * it, and the sentence on the glass stays true without an edit.
   */
  perStudy: 1,
  /**
   * Studies that may pay on ONE board. One. The cap is not a tuning knob — it
   * is what makes the payment a refund instead of a wage, and lowering it to 0
   * or raising it to 2 changes what the mechanic IS.
   */
  perBoard: 1,
} as const;

/**
 * What this study hands back, given how many studies on this board have already
 * been paid. Never more than the room took to walk into.
 *
 * `alreadyPaidHere` is read off the LEDGER (entries with `reason: 'study'` and
 * this room's key), never off a counter: the ledger is what survives a reload,
 * it is what the night digest reads, and this repo has lost three rounds to a
 * number kept in two places.
 */
export function studyRefundDue(alreadyPaidHere: number): number {
  return alreadyPaidHere >= STUDY_REFUND.perBoard ? 0 : STUDY_REFUND.perStudy;
}

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
   * **MOVES per honest minute** — the house wage, and the only number in the
   * payout that is a tuning knob rather than a derivation. It is set where the
   * Library lands on exactly **2 moves** (4.5 honest minutes × 0.45 ≈ 2),
   * because the Word Web is the one anchor whose length was never in dispute:
   * it is the room the old flat +6 actually described, and +6 steps at 3 a move
   * WAS two moves. Every other room is priced relative to it.
   *
   * ROUND 42 — 1.4 STEPS A MINUTE IS 0.45 MOVES A MINUTE, and the name of the
   * field is the only thing that had to be argued about. Read the other way
   * round it is the sentence the player can actually hold: **about two and a
   * quarter minutes of honest word game buys one more move.**
   */
  stepsPerMinute: 0.45,
  /**
   * THE COZY FLOOR. A solved room never pays less than this, however short it
   * turned out to be — the owner's constraint in one constant: *a cozy game
   * must not punish the player for choosing a short puzzle.* The Linen Closet
   * on a tired evening is a small win, never a mistake.
   *
   * ROUND 42 — 4 steps became **1 move**, and in the new unit the floor states
   * itself: **a solved room always pays back at least the move it cost to walk
   * into.** That is the cozy constraint and the loop's own definition at the
   * same time, and it is the smallest number the ledger has, so it cannot be
   * lowered without making a short puzzle a bad choice.
   *
   * ONE floor for every room, deliberately, and `tests/economy-effort.test.ts`
   * is why: with a floor per SIZE, the 75-second Linen Closet paid +3 while the
   * 20-second Gallery paid +4, i.e. the shorter room paid more — the exact
   * defect round 22 existed to delete, reintroduced by the clamp meant to
   * soften it. The player does not experience "micro" and "anchor"; she
   * experiences minutes.
   */
  floor: 1,
  /**
   * THE CEILING — **one bare ascent, and a move leaner every storey.**
   *
   * ═══ ROUND 42 — THIS USED TO BE THIRDS OF THE DAY BUDGET, AND THAT IS WHAT
   * MADE ONE ROOM WORTH TWO THIRDS OF AN EVENING ════════════════════════════
   *
   * `[round(2/3 · budget), round(budget/2), round(budget/3)]` was 15/11/7 at a
   * budget of 22 — i.e. **5 / 3.7 / 2.3 moves** — and left as thirds of a
   * 12-MOVE day it would have read 8/6/4, handing a single Conservatory solve
   * two thirds of the day it was solved in. Tying the payout ceiling to the
   * budget is a loop: every round that moves the purse moves what one room may
   * print, in the same direction, so a bigger day is automatically a day one
   * room can buy back.
   *
   * It is tied to the STAIRCASE instead. `BARE_ASCENT_STEPS` is 5 — the five
   * storeys from the front door to the Sanctum landing — so the rule is: **the
   * most a single solved room may ever pay is one whole climb, and one move less
   * for each tier above the ground floor.** Both original rulings survive intact
   * and neither is now a function of the purse:
   *
   *   - no single room prints most of an evening (5 of 12 moves, was 15 of 22);
   *   - payouts get LEANER AS YOU CLIMB — `capByTier[2] < capByTier[1] <
   *     capByTier[0]` — so a tier-3 solve softens the next mistake instead of
   *     bankrolling the next storey.
   *
   * WHAT IT MEASURED: the published wage spread FALLS **7.77× → 4.53×** (AAA
   * 4.10h's ratchet may fall and may never rise), because the two long rooms
   * come off a ceiling that was three tiers too generous and the whole table
   * squeezes toward the floor. Every solve payout in the shipped game is now one
   * of {1, 2, 3, 4, 5} moves — small integers she can hold in her head, which is
   * the owner's ask in the one place it is hardest to satisfy.
   *
   * ── THE GUARDRAIL, DERIVED RATHER THAN ASSUMED (THE_CLIMB §1b) ────────────
   * "Solving buys more day" invites the question the owner asked first of all:
   * what stops a great day being endless? **Not a cap on moves earned.** It is
   * two measured facts:
   *
   *   1. ARITHMETIC. The average room is net NEGATIVE in moves for every
   *      profile. Measured over 4,800 evenings each: the median player spends
   *      1.50 moves a room and earns 0.95 back (net −0.55), the skilled player
   *      1.64 and 0.81, the great day 1.70 and 1.13. Solving lengthens an
   *      evening; it can never sustain one, and the gap is widest for the
   *      player who doubles back — which is the owner's own description of where
   *      scarcity should come from.
   *   2. GEOMETRY. The manor is 31 draftable cells and the frontier closes as it
   *      fills. Over 6,000 simulated evenings across four profiles **not one
   *      ended `filled`**, and 7–20% ended `stranded` — the house shut with moves
   *      still in her hand — which is the geometric ceiling arriving before the
   *      arithmetic one ever has to.
   *
   * Both are re-measured every run in `tests/economy-pressure.test.ts`, on the
   * grid-true model, which is an instrument that can disagree with this note.
   *
   * The ceiling is also the honest limit of what pricing alone can do: the
   * shipped rooms span 14× in length (75 seconds to seventeen minutes) and no
   * payout table with a floor and a ceiling can span 14× on five integers. What
   * the wage guarantees is that BETWEEN the clamps a minute is worth a minute,
   * and `tests/economy-effort.test.ts` publishes the residual spread as a
   * ratchet.
   */
  capByTier: [
    BARE_ASCENT_STEPS,
    BARE_ASCENT_STEPS - 1,
    BARE_ASCENT_STEPS - 2,
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
  const f = Math.max(0, Math.min(1, earnedFraction));
  // ═══ ROUND 42 — THE LADDER NEARLY DIED WHEN THE UNIT GOT COARSE ═════════
  // This was `Math.floor(total × f)`, and in MOVES that pays NOTHING for the
  // first rung of any room whose whole payout is two: the Library at tiers 1–2
  // pays +2, so `floor(2 × 0.25)` is 0 and the first thread she wove banked
  // nothing at all — REVIEW_AA §6's exact complaint, reintroduced by a change of
  // unit rather than by a change of mind. (`tests/room-session.test.ts` caught
  // it, which is what that drill is for.)
  //
  // Two clauses, and each one is a sentence about play rather than arithmetic:
  //   A RUNG SHE HAS CLIMBED PAYS AT LEAST ONE MOVE. The ledger has no smaller
  //     coin, so "she banked something for that thread" and "she banked nothing"
  //     are the only two options and the review already ruled between them.
  //   THE SUMMIT ALWAYS KEEPS ONE. The climb is capped a move below the total,
  //     so finishing the room is never worth zero — which `ceil` would have made
  //     it (a Conservatory at Garden would have banked 4 of its 5 and Full Bloom
  //     would have paid 1). Nothing else in the table moves for this: the hive's
  //     instalments are 1/2/3 with 2 at the summit, exactly as `floor` paid them.
  //
  // THE INVARIANT IS UNTOUCHED, which is why no published band moves: a solved
  // room pays exactly `solvePayout(kind, tier)`, staged or not, because the
  // `solved` event pays `total − alreadyPaid`.
  const due = f >= 1
    ? total
    : Math.min(Math.max(0, total - 1), Math.max(f > 0 ? 1 : 0, Math.floor(total * f)));
  return Math.max(0, due - Math.max(0, alreadyPaid));
}

/**
 * What the ladder has ALREADY paid at `earnedFraction` — the only honest source
 * for `stageSteps`' `alreadyPaid` argument.
 *
 * ═══ ROUND 42 — TWO CALL SITES HELD A SECOND OPINION ABOUT THIS NUMBER ═════
 * `app/slices/room.ts` computed it, twice, as `Math.floor(total × ladderEarned)`
 * — a RE-DERIVATION of `stageSteps`' own arithmetic rather than a call to it.
 * That was harmless while `stageSteps` was exactly `floor(total × f)`, and the
 * moment round 42 gave the ladder a one-move floor it stopped agreeing: the
 * first rung paid 1 while the receipt read 0, so the next rung paid for it
 * again and the `solved` branch deducted a number that had never been paid.
 * A room would have paid MORE than `solvePayout`, which is the one invariant the
 * staging mechanic exists to keep. `tests/room-bank.test.ts` caught it.
 *
 * There is one of it now. This repo has lost three rounds to a number computed
 * in two places (the bare-ascent sum); it is not going to lose a fourth.
 */
export function stagePaidAt(
  kind: RoomPuzzleKind, tier: Tier, earnedFraction: number,
): number {
  return stageSteps(kind, tier, earnedFraction, 0);
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
  /**
   * −1, worth it. ROUND 42: unchanged in the ledger and dearer in the day —
   * one step used to be a third of a move and is a whole move now. Kept
   * deliberately: the cat is the one thing in the manor you spend a move on for
   * nothing but the cat, and pricing that at zero would make it furniture.
   */
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
    // ROUND 42 — the legacy band in moves. It was `micro 3/3/2, anchor 6/5/4`
    // steps, i.e. one move and two; it says exactly that now. It is a fallback
    // for a caller that genuinely does not know which room it is, and the two
    // numbers bracket the real table (floor 1, cap 5) rather than reproducing it.
    return size === 'micro' ? 1 : 2;
  },
  /**
   * No costed mistakes and no purchased hints → bonus. ROUND 42: 2 steps was
   * two thirds of a move; it is **one move** now — the smallest thing the ledger
   * can pay, which is what a grace note should be. A perfect solve of the
   * shortest room in the house therefore pays 2 moves in all, and the day it
   * cost one to walk into is a move to the good.
   */
  perfect: 1,
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
   *
   * ROUND 42 — RE-DENOMINATED IN MOVES, and the deck moved with it: the
   * Kitchen's +6 and the Larder's +5 are **+2 moves**, the Boot Room's +3 and
   * the Still Room's +2 are **+1**. The coarser unit collapses two pairs of
   * cards onto one number each, which is a real loss of resolution and is stated
   * rather than hidden: the Kitchen and the Larder are now worth the same in
   * steps and differ only in what else they carry (the Kitchen hums for later
   * green rooms, the Larder leaves dough for tomorrow). Every one of those cards
   * NAMES its number in its own toast, so `engine/manor/deck.ts` was edited in
   * the same breath and `tests/notice-copy.test.ts` holds the copy to the table.
   */
  snack: { min: 1, max: 2 },
  /**
   * COMPOUNDING HOOKS pay a smaller, separate class through the same 'snack'
   * reason (AAA 4.11, BP's Nursery pattern): the Kitchen hums +2 for every
   * later green room, the Dumbwaiter rattles +1 for every later room of any
   * stripe. Declared apart from `snack` because +1 sits below the refill
   * floor by design — one constant covering both would have to lie about one
   * of them. Also contract-checked against `UTILITY_EFFECTS`.
   *
   * ROUND 42 — AND NOW IT SITS EXACTLY *AT* THE REFILL FLOOR. A move is the
   * ledger's smallest coin, so the Kitchen's hum and the Dumbwaiter's rattle are
   * both +1 and both equal to the cheapest refill in the deck. The class is kept
   * separate anyway, because what distinguishes it is not the size but the
   * SHAPE: a compound pays once per LATER room, so a hook taken early is worth
   * several refills and a hook taken at dusk is worth nothing. Collapsing it
   * into `snack` would lose that distinction the next time either number moves.
   */
  compound: { min: 1, max: 1 },
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
 *
 * ═══ ROUND 47 — THE OWNER PUT IT BACK TO ONE. IT IS A RULING. ═══════════════
 * He found the two-key price by playing: *"I have a key in my current run but
 * cannot unlock the door!"* — and then, told why: *"why the fuck does a padlock
 * cost 2 keys.. lets keep things simple."*
 *
 * **A PADLOCK COSTS ONE KEY.** This is the same ruling he made about steps
 * ("Why isn't it just 1 step is −1. Why do you keep coming up with a convoluted
 * economy. What you should be modifying is the amount of steps you start with
 * and how many more you can earn and the penalties") applied to the other
 * currency, and it binds the same way: **the PRICE of a padlock is not a tuning
 * lever. The SUPPLY of keys is.**
 *
 * Round 10's reasoning above is not wrong about the arithmetic — doubling the
 * supply and doubling the price does hold an ascent at ≈1.85 padlocks. It is
 * wrong about the player. A key is the one object in this game whose meaning is
 * obvious before anything explains it, and charging two of it spends that for
 * nothing: it made a woman holding a key in front of a locked door conclude the
 * game was broken. No campaign curve is worth that.
 *
 * So if a future round finds the top of the house too cheap, it moves
 * `KEY_SUPPLY` (what a solve pays, what Fern leaves on the sill, how often a
 * key-bearing card surfaces) or `chanceByRow`. It does not touch `keyCost`.
 * A key opens a door.
 */
export const DOOR_LOCKS = {
  /**
   * P(a door into this 0-based row is locked); rows 0–3 never lock.
   *
   * ROUND 47, and this is where the halved price was paid for.
   *
   * TWO CHANGES, ONE SENTENCE. The rates went 0.9 / 0.95 → **1**, and the gate
   * came down a storey to row 3. What the table used to say was "the top two
   * storeys are usually locked"; what it says now is **every door above the
   * second storey is locked, and a key opens one.**
   *
   * WHY FLAT. At two keys a door the roll was a real decision — a 10% free door
   * was worth walking for. At one key it is a coin the player cannot see being
   * flipped: she has no way to tell an unlocked upper door from a lucky one,
   * which makes it a rule of play that cannot be stated, and the owner's ruling
   * is that rules of play are always stated.
   *
   * WHY ROW 3, AND WHAT IT COST BEFORE IT WAS PAID FOR. Halving the price
   * halved what an ascent costs, and leaving the gate at row 4 does not merely
   * shorten the campaign — measured, it reproduces the owner's ORIGINAL
   * complaint. First door at median day 7 against a published 14, and 6.8% of
   * skilled campaigns standing at the Sanctum on day 1 against a published
   * ceiling of 2%. That is *"way too easy, I reached the Forgotten Word on day
   * one"* coming back, which is the one thing this gate exists to prevent.
   *
   * Dropping it to row 3 restores the length, and on its own it charged for
   * that in the two places that matter more than length does: a GREAT DAY
   * topped out at row 4 instead of row 5 (4.10c — a great day is meant to flirt
   * with the landing, and three padlocks in one evening is not a flirt), and
   * the early evenings shortened enough to push campaign inflation to 1.44
   * against a 1.3 ceiling. Both are the same complaint: the ordinary evening
   * was being walled to buy the campaign its length.
   *
   * PAYING FOR IT ON THE SOLVE SIDE WAS TRIED AND IS NOT AVAILABLE. The
   * progressive lever — widen `KEY_SUPPLY.workKeyMinutes` so that almost every
   * room she SOLVES hands over a key, which is worth a great deal to a player
   * who finishes what she opens and nothing to one who does not — moves
   * 3 → 1.5 and changes **not one number**: the only room in that gap is the
   * Study, and the deck shows the Study at tier 3 only. Widening it further
   * means paying a ground-floor key for the Gallery's 1.25 minutes, which
   * round 26 rules out by name. The tier-1 key supply is already at its
   * ceiling, so it cannot buy the great day its third padlock.
   *
   * SO THE TWO DEVIATIONS BELOW ARE REAL AND ARE STATED, NOT TUNED AWAY —
   * see `tests/economy-simulation.test.ts`, where each carries the measurement
   * and the owner's ruling that caused it. They are the price of a one-key
   * padlock, and they are smaller than the price of the alternative.
   *
   * Row 6 keeps a rate only so the table stays total; the Sanctum is pre-placed
   * and never drafted, so nothing ever reads it.
   */
  chanceByRow: [0, 0, 0, 1, 1, 1, 1] as readonly number[],
  /**
   * Keys one padlock consumes. Round 10 took it 1 → 2; **round 47 put it back
   * to 1 and it is an owner ruling, not a tuning choice** — see the block
   * above before changing it.
   */
  keyCost: 1,
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
  /**
   * The Key Cabinet: the deliberate, unusual, "I am preparing a climb" card.
   * ROUND 47: 2 → 1. The owner put a padlock back to one key, and the price is
   * a ruling, so the balance came out of SUPPLY — starting with the deck,
   * because round 10's directive is that solving earns the climb and drafting
   * luck does not. See `DOOR_LOCKS` for the ruling and the whole package.
   */
  cabinetKeys: 1,
  /**
   * The Boot Room hook: the common ground-floor key, tiers 1 only.
   *
   * ROUND 47 TRIED 1 → 0 AND MEASURED IT BACK. Taking the common key card out
   * altogether did fix the puzzle-skipper (1.4% → well under the published
   * 0.5%), and it also dropped the deck's share of all keys below the FLOOR
   * the simulation keeps for it — the floor that exists precisely so a round
   * tuning for the solve channel cannot quietly kill the other one. The Boot
   * Room is the deck's key channel; deleting it deletes the channel. So the
   * cut came out of `workKeyMinutes` instead, where it costs the skipper
   * nothing and the solver something, which is the right way round.
   */
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
  /**
   * ═══ ROUND 47 — TRIED TWICE, MEASURED TWICE, AND LEFT WHERE IT WAS ════════
   *
   * The owner put a padlock back to one key ("lets keep things simple"), which
   * halved what an ascent costs, so the balance had to come out of somewhere.
   * This constant was the obvious candidate — it pays a key on 62% of the rooms
   * in the house — and it turns out to be the WRONG one. That is worth writing
   * down, because it is not obvious and it cost two full campaign runs:
   *
   *   - **8** (the boundary of `effortLabel`'s "a long sit", so only the
   *     Conservatory and the Counting House would pay): round 10's directive
   *     INVERTED — 8,253 solve-keys against 12,734 off the green deck. Drafting
   *     luck back in charge of the climb, which is the exact thing round 10
   *     exists to prevent.
   *   - **4** (the boundary of "five minutes or so", adding the Library back):
   *     still inverted, by a hair — 10,477 against a floor of 10,504.
   *
   * So it stays at **3**, and the halved price is paid for by
   * `DOOR_LOCKS.chanceByRow` instead: one more padlock on every ascent, which
   * costs the solver nothing and costs the climb about what the price change
   * gave away. The lesson generalises, and it is the round's real finding:
   * **the solve channel is not a balance lever — it is the thing the balance
   * exists to reward.** The cliff is close on both sides now, so the next round
   * that reaches for this number should measure the directive first.
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
  /**
   * ROUND 47: `[0,0,1,1,1,2,2]` → `[0,0,0,1,1,1,1]`. Halved, and for the same
   * reason as the deck above — at one key a door, a dawn key IS a storey, and
   * two of them were the whole ascent handed over before the evening started.
   * Her first key moves 2 points → 3, which is exactly her authored lifetime
   * budget (`FERN_ARC`), so it is still earnable by anyone who befriends her
   * and no longer earnable by accident. The ceiling drops to one: Fern
   * shortens the climb, she never walks it for you.
   */
  fernMorningKeysByPoints: [0, 0, 0, 1, 1, 1, 1] as readonly number[],
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
 *
 * ═══ ROUND 42 — ONE MOVE A POINT. THE ARC SAYS ITSELF NOW ═════════════════
 * The table was `[0, 4, 6, 8, 10, 12, 13]` steps — 0 → 4.33 moves on a 7.3-move
 * day. Re-denominated it is **[0, 1, 2, 3, 4, 5, 6]**: every point of Bramble's
 * friendship is worth exactly one more move, and fully warmed she is worth half
 * a day again (6 of 12), which is the same share the old table carried (13 of
 * 22 = 59%) and the same clause AAA 4.10 has always published.
 *
 * The old table's steps were 4, 2, 2, 2, 2, 1 — a windfall at the first point
 * and a shrug at the last. A uniform rung is not a simplification for its own
 * sake: it is what makes the arc auditable from the counter, which is the whole
 * of §1b. She sits down to tea, the pot goes up by one, and she can see it.
 * `tests/economy-simulation.test.ts` still gates the table strictly increasing —
 * a rung that pays nothing is a morning that bought nothing — and that gate is
 * the reason the top is 6 and not the 4 a literal re-denomination would give:
 * six rungs above zero need six distinct integers, and moves are integers.
 *
 * MEASURED, because a stronger arc is a longer late-campaign evening and this
 * file has been wrong about that before: her evening runs 13.6 min early → 16.9
 * late (was 12.5 → 15.6) and his 16.8 → 21.1 (was 15.2 → 18.8). Both are
 * re-published in AAA 4.10f with the cause, and his p90 is retired there in
 * favour of a statistic his own appetite clock does not bound.
 */
export const TEA_BY_POINTS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

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
   * dawn purse is `BASE_DAY_BUDGET + dawnCup` on every evening of the campaign,
   * which is the exact purse day 1 has always had (22 when this shipped; 26
   * since round 36 moved the budget with the move price; **13 since round 42
   * denominated it in moves** — twelve moves and a cup, where 4 steps of cup was
   * 1.33 moves). The ground floor stops getting easier — that invariant is the
   * §5.10 gate
   * (tests/economy-pressure.test.ts), and it is stated as an EQUALITY between
   * day 1 and day 30 rather than as a level, so moving the budget cannot
   * quietly satisfy it.
   */
  dawnCup: 1,
  /**
   * 0-based grid row the rest of the pot is set down on: **the last storey
   * below a padlock**, which is what the number has always meant.
   *
   * ROUND 47: 3 → 2, because the padlocks came down a storey when the owner
   * put a door back to one key (`DOOR_LOCKS.chanceByRow`). Bramble carrying
   * the pot up to a landing the player cannot reach without a key would invert
   * the whole point of round 23's move — the tea is what FUNDS the climb, so
   * it has to be waiting on the near side of the gate, not behind it. Pinned
   * against `DOOR_LOCKS` in tests/economy-pressure.test.ts rather than typed,
   * so the two can never drift apart again.
   */
  landingRow0: 2,
  /**
   * Ledger `roomKey` the landing pour is stamped with. It is how the live
   * slice knows the pot has already been carried up today (the ledger resets
   * at dawn, so no save field can go stale) — and 'move' is the only reason
   * `priceEntry` re-prices by roomKey, so stamping a 'tea' entry is inert.
   */
  key: 'tea:landing',
  /**
   * ═══ ROUND 45 — THE STAMP THAT TELLS THE PURSE FROM THE PAYOUT ════════════
   *
   * Every grant ledgered BEFORE she walks out — Bramble's cup, day 1's welcome
   * pot, what yesterday left steeping, and the top-up a shared morning pours —
   * carries this key. They are 'tea' entries like the landing pour, they float
   * like it and they read "tea" in the account like it, and in exactly one
   * respect they are not like it: **they are already inside the number on the
   * candle when the day begins.**
   *
   * That is the whole of the double-count three blind testers reconciled their
   * way into. The counter reads 13 at dawn — twelve moves and a cup — and
   * `stepsRefunded` counted the cup a second time under "Steps given back", so
   * every night digest in the game was over by exactly the dawn grants and all
   * three players got the same wrong answer doing the sum themselves. Two of
   * the three named it as the reason they would stop playing.
   *
   * A positive stamp rather than "a tea entry with no roomKey": absence is not
   * evidence, and the next round that ledgers a grant from somewhere new would
   * inherit the bug silently. `tests/steps.test.ts` pins the four live grant
   * sites to this key and pins the landing pour OUT of it.
   */
  dawnKey: 'tea:dawn',
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
 *
 * ROUND 42 — 4 steps is **1 move**, and day 1 was re-measured rather than
 * assumed: her first evening runs **13.2 minutes** at the median (the round-5
 * audit's whole reason for this constant was a day 1 measuring 9.0, under the
 * 10-minute floor). It stays load-bearing for the §5.10 equality — `dawnCup` is
 * defined to match it — and it is now the smallest coin the ledger has, which is
 * as small as a scripted welcome can get before it stops existing.
 */
export const FIRST_MORNING_POT = 1;

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
 * Is this entry one of the morning's grants — part of the purse she starts the
 * day holding, rather than something the day paid back? See `TEA_POUR.dawnKey`
 * for why the difference is worth a stamp.
 */
export function isDawnGrant(entry: StepEntry): boolean {
  return entry.reason === 'tea' && entry.roomKey === TEA_POUR.dawnKey;
}

/** Everything the morning handed her before she walked out: cup, pot, steeping. */
export function dawnGrants(ledger: StepLedger): number {
  return ledger.entries.reduce((sum, e) => (isDawnGrant(e) ? sum + e.delta : sum), 0);
}

/**
 * THE STARTING FIGURE — the number on the candle the moment she steps onto the
 * blueprint, and the reference the chrome burn-down measures against so the
 * wick reads as "how much day is left".
 *
 * ═══ ROUND 45 — IT USED TO COUNT THE POT ON THE LANDING TOO ═══════════════
 * This was `budget + Σ every 'tea' entry`, which is right for the three grants
 * that land at dawn and wrong for the fourth pour: Bramble carries the rest of
 * the pot up to the second landing (`TEA_POUR.landingRow0`) in the MIDDLE of
 * the evening, and counting it here grew the burn-down's denominator halfway
 * through the day — the wick got taller after a gift, which is the one thing a
 * burn-down may never do. It counts the DAWN grants now, by their stamp, so the
 * reference is fixed for the whole evening and this function is what its own
 * name says: the figure the day started at.
 */
export function dayStartTotal(ledger: StepLedger): number {
  return ledger.budget + dawnGrants(ledger);
}

/**
 * ═══ WHAT THE DAY GAVE BACK — AND THE ARITHMETIC IT HAS TO CLOSE ══════════
 *
 * `stepsRefunded` is every positive entry, full stop, and it must stay that way
 * (it is one half of the ledger identity `total = budget + refunded − spent`,
 * pinned in tests/economy-simulation.test.ts). It is the wrong number to PRINT,
 * because the morning's grants are positive entries AND are already inside the
 * figure the candle showed her at dawn.
 *
 * Three strangers played the round-42 build, did the day's sum themselves off
 * the night digest, and all three got the same wrong answer — over by exactly
 * the dawn cup. This is the number that makes it close:
 *
 *     dayStartTotal − stepsSpent + stepsGivenBack === ledgerTotal
 *
 * — an identity, not a tuning, and `tests/day.test.ts` holds it over randomly
 * generated ledgers while `tests/round45-prices-live.mjs` holds it over the
 * numbers a real driven day actually PAINTS on a real phone.
 */
export function stepsGivenBack(ledger: StepLedger): number {
  return stepsRefunded(ledger) - dawnGrants(ledger);
}
