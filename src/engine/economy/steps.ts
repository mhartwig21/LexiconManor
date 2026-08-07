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
 *   1. CLIMBING IS THE EXPENSE. Movement is priced per row band
 *      (`MOVE_COST_BY_ROW`): −1 on the ground floor, −9 up top. A single
 *      minimum-length ascent to THE SANCTUM LANDING (0-based row 5 — the cell
 *      the word is spoken from, not the sealed Sanctum above it) costs 22
 *      steps of pure walking — more than the entire base budget — and every
 *      walk-back to a frontier door up there is charged at the same top rate.
 *   2. REFUNDS GET LEANER AS YOU CLIMB. anchor +6/+5/+4 by tier (was
 *      +6/+7/+8 — the old curve literally paid you to be high up), micro
 *      +3/+3/+2. A tier-3 solve softens the next mistake; it no longer
 *      bankrolls the next storey.
 *   3. LEAN DAY BUDGET. 40 → 18. A decent day is 5–8 rooms and 10–15 minutes
 *      (AAA 4.10), not 8–12 rooms and twenty-plus.
 *   4. LOCKED DOORS UP TOP. `DOOR_LOCKS`: drafting into 0-based rows 4+ can
 *      demand a key. Deep pushes are PREPARED for (Key Cabinet, Fern's
 *      trades) — you cannot stumble into the Sanctum row.
 *   5. THE REFILL CURVE IS A CAMPAIGN ARC. Bramble's tea (`TEA_BY_POINTS`)
 *      climbs 0 → +11 across her friendship, and refills shrink to +2..+6.
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

/**
 * Start-of-day step budget (AAA 4.10). Owner retune: 40 → 18. Read this
 * together with `MOVE_COST_BY_ROW` — the two numbers are one lever. 18 buys a
 * comfortable ramble around the lower floors, or a deliberate, prepared,
 * refill-funded assault on the upper ones. It does not buy both.
 */
export const BASE_DAY_BUDGET = 18;

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
 * Per-row movement pricing — the overhaul's core lever, indexed by the
 * 0-based grid row of the cell being STEPPED INTO (engine/types.ts Cell.row).
 * The ground floor is a stroll; the upper storeys are a climb, and every
 * traverse of them is charged, including the walk back to a frontier door.
 *
 * ═══ ROUND-7 CORRECTION — PRICED FOR THE STOREY SHE ACTUALLY HAS TO BUY ═══
 * The old curve (−1,−1,−2,−3,−4,−5,−5) was verified against the SANCTUM'S OWN
 * ROW (0-based 6) — a cell that is sealed, never drafted, never walked into.
 * The word is spoken from the landing BELOW it, 0-based row 5
 * (engine/manor/grid.ts `SANCTUM_DOOR_CELL`), and the bare ascent to THERE
 * cost 1+2+3+4+5 = 15: comfortably under the 18-step base budget and under
 * day 1's 21. So the headline invariant `reserveToTop(1) > BASE_DAY_BUDGET`
 * was true of a storey the game never asks her to enter and false of the one
 * it does — measured at the live landing, a skilled player stood at the door
 * on day 1 in 41.5% of campaigns.
 *
 * Minimum pure ascent, entrance (row 0) → THE SANCTUM LANDING (row 5) — the
 * ascent the player actually has to pay for:
 *   1 + 2 + 3 + 7 + 9 = 22 steps — MORE than the whole base budget, in a
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
 * The two lower bands are UNTOUCHED (−1/−1/−2/−3): the decent day lives on
 * rows 0–3 and its 10–15 minute window is calibrated there. Every added step
 * sits on the last two storeys, where the climb is the whole point.
 */
export const MOVE_COST_BY_ROW: readonly number[] = [-1, -1, -2, -3, -7, -9, -9];

export function moveAt(row: number): number {
  const i = Math.max(0, Math.min(MOVE_COST_BY_ROW.length - 1, Math.floor(row)));
  return MOVE_COST_BY_ROW[i]!;
}

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
 * spoken from (engine/manor/grid.ts `SANCTUM_DOOR_CELL`) — and row 6 is the
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

export const STEP_TABLE = {
  /** Start-of-day budget — the ledger's `budget` field. */
  dayStart: BASE_DAY_BUDGET,
  /**
   * DEPRECATED flat move price — kept so existing callers compile. The day
   * slice re-prices EVERY 'move' entry through `moveAt(row)` using the
   * entry's `roomKey` ("col,row"), so per-row pricing holds even for callers
   * still passing this. Equals moveAt(0). A1: prefer `moveAt(cell.row)`.
   */
  move: -1,
  /** Row-priced move (see moveAt / MOVE_COST_BY_ROW). */
  moveAt,
  /** −1, worth it. */
  petDewey: -1,
  /** Deliberate wrong claim (Library group, Study guess, cipher letter…). */
  mistake: mistakeDelta,
  /** Step-priced hint/clue purchase — same row as mistake (RoomEvent 'hint'). */
  hint: mistakeDelta,
  /**
   * Solve payout by room size and row-band tier — LEANER AS YOU CLIMB
   * (owner retune): micro +3/+3/+2, anchor +6/+5/+4. High-tier rooms are
   * climbed TO, not climbed FROM: their payout softens the next mistake, it
   * no longer bankrolls the next storey.
   */
  solve(size: 'micro' | 'anchor', tier: Tier): number {
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
export function solveKeys(tier: Tier): number {
  const i = Math.max(0, Math.min(KEY_SUPPLY.solveKeysByTier.length - 1, Math.floor(tier) - 1));
  return KEY_SUPPLY.solveKeysByTier[i]!;
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
 */
export const TEA_BY_POINTS: readonly number[] = [0, 4, 6, 7, 9, 10, 11];

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
 * Deliberately NOT a bigger `BASE_DAY_BUDGET`: 20 would equal the bare ascent
 * cost and break the headline invariant `reserveToTop(1) > BASE_DAY_BUDGET`.
 */
export const FIRST_MORNING_POT = 3;

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
