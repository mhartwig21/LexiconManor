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
 *      (`MOVE_COST_BY_ROW`): −1 on the ground floor, −5 up top. A single
 *      minimum-length ascent to the Sanctum row costs 20 steps of pure
 *      walking — more than the entire base budget — and every walk-back to a
 *      frontier door up there is charged at the same top rate.
 *   2. REFUNDS GET LEANER AS YOU CLIMB. anchor +6/+5/+4 by tier (was
 *      +6/+7/+8 — the old curve literally paid you to be high up), micro
 *      +3/+3/+2. A tier-3 solve softens the next mistake; it no longer
 *      bankrolls the next storey.
 *   3. LEAN DAY BUDGET. 40 → 18. A decent day is 5–8 rooms and 10–15 minutes
 *      (AAA 4.10), not 8–12 rooms and twenty-plus.
 *   4. LOCKED DOORS UP TOP. `DOOR_LOCKS`: drafting into 0-based rows 4+ can
 *      demand a key. Deep pushes are PREPARED for (Key Cabinet, Fern's
 *      trades) — you cannot stumble into the Sanctum row.
 *   5. THE REFILL CURVE IS A CAMPAIGN ARC. Bramble's tea (`TEA_BY_RANK`)
 *      climbs 0 → +11 across her friendship, and snacks shrink to +3..+7.
 *      The budget that makes the Sanctum reachable is EARNED over days.
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
 *      `KEY_SUPPLY.fernMorningKeys` re-indexes to open inside her authored
 *      point budget instead of two points past its ceiling.
 *   c. `FIRST_MORNING_POT` — the first evening starts at 0 affinity, so it got
 *      a scripted welcome pot rather than running under the 10–15 floor.
 *   d. cross-day investment (`CARRY_OVER_EFFECTS`, engine/manor/deck.ts) — the
 *      first thing in the game that pays into tomorrow.
 *
 * Net effect (simulated, not hoped): a skilled player first reaches the
 * Sanctum row around day 6–10 and typically wins the volume in 14–28 days of
 * daily play — Blue Prince's shape, at cozy scale.
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
 * Minimum pure ascent, entrance (row 0) → Sanctum row (row 6):
 *   1 + 2 + 3 + 4 + 5 + 5 = 20 steps — MORE than the whole base budget, in a
 *   straight line, before a single card is drafted or a single door is
 *   re-walked. The Sanctum row is therefore never reachable on the budget
 *   alone: it has to be paid for with tea, snacks and solves. That is the
 *   push-your-luck, and it is why day 1 is not day 30.
 */
export const MOVE_COST_BY_ROW: readonly number[] = [-1, -1, -2, -3, -4, -5, -5];

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
 */
export const ROW_NAMES: readonly string[] = [
  'the ground floor',
  'the half landing',
  'the first landing',
  'the second landing',
  'the third landing',
  'the upper gallery',
  'the Sanctum landing',
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
  /** Kitchen snack range (utility rooms roll inside this, reason 'snack').
   *  Owner retune: 5..10 → 3..7 — a refill extends a day, never doubles it. */
  snack: { min: 3, max: 7 },
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
 */
export const DOOR_LOCKS = {
  /** P(a door into this 0-based row is locked); rows 0–3 never lock. */
  chanceByRow: [0, 0, 0, 0, 0.35, 0.55, 0.8] as readonly number[],
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
  /** The Key Cabinet: the deliberate, unusual, "I am preparing a climb" card. */
  cabinetKeys: 2,
  /** The Boot Room hook: the common ground-floor key, tiers 1 only. */
  bootRoomKeys: 1,
  /**
   * Fern's arc, indexed by her affinity POINTS (the same convention
   * `TEA_BY_RANK`/`teaBonus` already use — the day slice passes raw points):
   * a key left on the sill at dawn for a friend who tends the garden with
   * her. This is the padlock's answer to Bramble's tea — the same shape, the
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
  fernMorningKeys: [0, 0, 1, 1, 1, 2, 2] as readonly number[],
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
 * Keys Fern leaves out at dawn, from her affinity points. Granted when the
 * day's manor is built (app/slices/manor.ts) and zeroed again at night with
 * the rest of the purse — access is what the campaign buys, never a hoard.
 */
export function fernMorningKeys(fernAffinity: number): number {
  if (!Number.isFinite(fernAffinity) || fernAffinity <= 0) return 0;
  const points = Math.floor(fernAffinity);
  const table = KEY_SUPPLY.fernMorningKeys;
  return table[Math.min(points, table.length - 1)]!;
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
 * Bramble's morning tea by affinity rank (MANOR_DESIGN §8) — the campaign's
 * main economic arc. Rank 0 (just met) is a plain, kind cup worth nothing but
 * the scene; by the time she trusts you, the pot is worth nearly half a day
 * again. THIS is what turns "the Sanctum row is out of reach" into "the
 * Sanctum row is reachable if today goes well" somewhere around day 6–10,
 * and it cannot be rushed — affinity is one conversation a day (AAA 5.9).
 * Applied as a 'tea' ledger entry so it renders as a floating +N.
 *
 * Round-5 audit: the first two ranks were lifted (3→4, 5→6) because the early
 * evenings — days 2–3, when she has met Bramble once and the manor is still
 * strange — measured 10.2–10.5 minutes, right on the floor of the 10–15 band.
 * The top of the curve is untouched, so the campaign shape is unchanged; only
 * the first week got its promised length.
 */
export const TEA_BY_RANK: readonly number[] = [0, 4, 6, 7, 9, 10, 11];

export function teaBonus(brambleAffinity: number): number {
  if (!Number.isFinite(brambleAffinity) || brambleAffinity <= 0) return 0;
  const rank = Math.floor(brambleAffinity);
  return TEA_BY_RANK[Math.min(rank, TEA_BY_RANK.length - 1)]!;
}

/**
 * THE LIVE TEA ARC — the source of the points `TEA_BY_RANK` indexes.
 *
 * Round-5 audit: `TEA_BY_RANK` needs 6 points for its full pot, and Bramble's
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
 * to a ceiling of `maxPoints`. `app/slices/day.ts` applies it as a FLOOR
 * (`max(current, teaArcPoints(day))`) at the top of `startDay`, before the pot
 * is poured — so it never eats the gift currency, never double-counts on a
 * resumed day, never overwrites points she earned by gifting, and cannot be
 * lost by picking the wrong line of dialogue.
 *
 * This is also the live counterpart of the simulation's tea ramp:
 * `engine/economy/simulate.ts` reads THIS function for a campaign's tea rank,
 * rather than a hard-coded `CAMPAIGN_ARC` constant with nothing behind it.
 */
export const TEA_ARC = {
  /** Mornings of shared tea per +1 point of Bramble affinity. */
  morningsPerPoint: 2,
  /** Ceiling — the pot tops out here (TEA_BY_RANK's last rank). */
  maxPoints: TEA_BY_RANK.length - 1,
} as const;

/** Bramble's affinity FLOOR on 1-based `day`, from shared mornings alone. */
export function teaArcPoints(day: number): number {
  if (!Number.isFinite(day) || day <= 0) return 0;
  return Math.min(TEA_ARC.maxPoints, Math.floor(day / TEA_ARC.morningsPerPoint));
}

/**
 * THE FIRST MORNING'S POT (AAA 4.10b, round-5 audit).
 *
 * Day 1 starts at 0 affinity — `teaBonus(0)` is 0 by design, because rank 0 is
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
