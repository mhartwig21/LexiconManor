/**
 * THE HONEST WORKLOAD TABLE — OWNER: A2 (Economy/Day). Pure TS, no React/DOM.
 *
 * ═══ WHY THIS FILE EXISTS (REVIEW_AA §6 / "5.6", round 22) ════════════════
 * `STEP_TABLE.solve(size, tier)` had no room parameter at all. Five anchors
 * that range from twenty seconds (the Gallery: five words of a 106-word pool)
 * to thirty-five minutes (the Counting House at tier 2: 25 givens, 98% of
 * boards requiring an X-wing, an XY-wing, a swordfish or colouring) were paid
 * off one row-band table — a **36× spread in seconds-per-step**, and 15×
 * between two rooms sitting on the same storey at the same tier. The rational
 * player farms the Gallery and never opens the Conservatory, which is exactly
 * what both hostile reviewers did.
 *
 * The instrument that certified the day was blind to it too: `TIME_TABLE`
 * priced every anchor at one uniform `[180, 360]` band, so AAA 4.10b's
 * published 10–15 minute median had never been measured against a room that
 * takes a quarter of an hour.
 *
 * So this table is the missing axis: **what a room actually costs a player, in
 * minutes**, per kind and per row-band tier. Two things read it and nothing
 * else may hard-code a duration or a payout again:
 *
 *   1. `engine/economy/steps.ts` prices the SOLVE off it (`solvePayout`), so a
 *      long room pays proportionally and a short room cannot out-earn it;
 *   2. `engine/economy/simulate.ts` clocks the DAY off it, so 4.10b/f are
 *      measured against the rooms the game actually ships.
 *
 * ═══ WHERE THE NUMBERS COME FROM (the model, stated) ══════════════════════
 * These are instrumented estimates over the SHIPPED pools, not wishes, and
 * `tests/economy-effort.test.ts` re-derives the content facts each one rests on
 * — median target counts, pool sizes, given counts, ladder thresholds — so a
 * content edit that changes a room's workload FAILS A TEST instead of quietly
 * re-opening the 36× spread. If one of those pins fires, the fix is to
 * re-derive the row here, never to relax the pin.
 *
 *   twistle (the Gallery)      5 words of a median 106-word pool at tier 1
 *                              (need/pool 0.047) — measured 20–100 s live;
 *                              7 of 85 at tier 2; 6 of 28 at minLength 5 with
 *                              the centre required at tier 3.
 *   crossword (Linen Closet)   4×4, 3 entries, 11 letters — ~75 s.
 *   cipher (the Darkroom)      11 of 14 distinct letters to deduce over 26.
 *   word-web (the Library)     16 tiles, 4 groups, 1 ambiguous, 1 herring.
 *   forgotten-word (the Study)  read three authored definitions, name a word.
 *   hive (the Conservatory)    Full Bloom is 70% of totalPoints, which needs
 *                              32 of the median 70 valid words EVEN PLAYING
 *                              PERFECTLY (highest-scoring first; worst order
 *                              61), at the repo's own instrumented finding rate
 *                              (~20 s/find, decaying as the pool empties).
 *   sudoku (Counting House)    tier 1: 24 givens, 57 empty cells, 78% fall to
 *                              singles/pairs/pointing. Tier 2: 25 givens, 0%
 *                              fall to that ladder, 98% require a wing, a fish
 *                              or colouring — the owner's expert directive,
 *                              priced honestly rather than argued with.
 *
 * ═══ THE LADDER — A ROOM PAYS ON THE WAY UP, NOT ONLY AT THE SUMMIT ═══════
 * REVIEW_AA's "done looks like" for this item is *"every anchor is 2–4 minutes
 * to a payout, or it pays IN STAGES … the hive pays at every ladder rung, not
 * only at Full Bloom"*. `stageFractionOf` reads the progress details the
 * adapters ALREADY emit (`tier-up:Bower`, `inked:36-left`, `group-solved:blue`)
 * and answers one question: how much of this room's payout has she earned so
 * far? The room slice pays the difference as she crosses each rung, and the
 * `solved` event pays exactly the remainder. Only rooms longer than
 * `LADDER_MINUTES` have one: the Gallery is over in a minute and the review's
 * bar for it is "2–4 minutes TO A PAYOUT", which it already meets.
 *
 * THE INVARIANT THAT MAKES THIS SAFE, and the reason no published band in AAA
 * 4.10 moves because of it: **staging never changes what a room pays in total.**
 * A solved room pays `solvePayout(kind, tier)` whether it paid it in one lump
 * or in four instalments. What changes is WHEN — and therefore what a player
 * who works a long room for six minutes and leaves it for tomorrow walks out
 * with, which used to be nothing at all.
 */

import type { RoomPuzzleKind } from '../rooms/room-puzzle';
import type { Tier } from '../types';

/** Honest median minutes for one room, indexed by tier − 1. */
export type EffortByTier = readonly [number, number, number];

/**
 * Honest median minutes to a FULL solve, per kind and tier. See the header for
 * the derivation of every row; `tests/economy-effort.test.ts` pins the content
 * facts they rest on.
 */
export const ROOM_EFFORT: Record<RoomPuzzleKind, EffortByTier> = {
  // ── anchors ──────────────────────────────────────────────────────────────
  'twistle': [1.0, 1.5, 2.5],
  'word-web': [4.5, 5.0, 6.0],
  'hive': [14.0, 11.0, 7.0],
  'forgotten-word': [1.5, 1.5, 1.5],
  'sudoku': [12.5, 27.0, 30.0],
  // ── micro ────────────────────────────────────────────────────────────────
  'cipher': [3.0, 3.5, 4.0],
  'crossword': [1.25, 1.5, 2.0],
};

/** Honest median minutes for `kind` at `tier`. */
export function effortMinutes(kind: RoomPuzzleKind, tier: Tier): number {
  const row = ROOM_EFFORT[kind];
  const i = Math.max(0, Math.min(2, Math.floor(tier) - 1));
  return row[i]!;
}

/**
 * Player-facing duration for the draft card (REVIEW_AA §6: *"the draft card
 * states the expected time"*). Deliberately coarse and deliberately rounded
 * DOWN to a familiar unit — "about 3 min", "about a quarter hour" — because the
 * card is a decision aid, not a stopwatch, and a cozy game must not put a timer
 * in front of the player (AAA 4.13: rooms are always leavable).
 */
export function effortLabel(kind: RoomPuzzleKind, tier: Tier): string {
  const m = effortMinutes(kind, tier);
  if (m < 2) return 'a minute or two';
  if (m < 4) return 'a few minutes';
  if (m < 8) return 'five minutes or so';
  if (m < 20) return 'a long sit';
  return 'a long sit';
}

/**
 * ── THE STAGE LADDER ──────────────────────────────────────────────────────
 *
 * How much of a room's payout each of its OWN progress markers has earned,
 * as a fraction of the full solve. Every detail string below is one an adapter
 * already emits today — nothing here asks a room to change what it broadcasts.
 *
 * The fractions are DERIVED, not chosen:
 *   - the hive's rungs are their own point percentages against the 70% solve
 *     gate (`HIVE_LADDER` / `ladderThreshold(maxScore, 70)`), so Blossom is
 *     25/70 of the way to a solved room and Garden 50/70. If the ladder or the
 *     gate moves, `tests/economy-effort.test.ts` fails here first.
 *   - the sudoku pays per NINE placements — one box's worth of ink — against
 *     the shipped median of 57 empty cells, which is the granularity the review
 *     asked for ("+2 per nine placements") expressed as a fraction.
 *   - the word web pays per group, off its own `group-solved` details.
 *
 * Micro rooms have no ladder: a 75-second Linen Closet has nothing to stage,
 * and inventing rungs for it would be ceremony rather than reward.
 */
export const HIVE_STAGE_PCT: Readonly<Record<string, number>> = {
  Blossom: 25,
  Bower: 40,
  Garden: 50,
};

/** The point percentage at which the Conservatory counts as solved. */
export const HIVE_SOLVE_PCT = 70;

/** Empty cells on a shipped 9×9 (median) — the sudoku ladder's denominator. */
export const SUDOKU_BLANKS = 57;

/** Placements per sudoku instalment: one box's worth of ink. */
export const SUDOKU_CELLS_PER_STAGE = 9;

/** Groups on a Word Web board / the Library's instalment count. */
export const WEB_GROUPS = 4;

/**
 * The fraction of a room's payout earned by the progress marker `detail`,
 * given the fraction already earned. Returns `null` when the marker is not a
 * stage (a pangram, a dead letter, a word that changed nothing).
 *
 * Monotone by construction: callers pay `floor(total × fraction) − alreadyPaid`
 * and can never pay twice for the same rung, in any event order.
 */
export function stageFractionOf(
  kind: RoomPuzzleKind,
  detail: string | undefined,
  earnedSoFar: number,
): number | null {
  if (!detail) return null;
  switch (kind) {
    case 'hive': {
      if (!detail.startsWith('tier-up:')) return null;
      const pct = HIVE_STAGE_PCT[detail.slice('tier-up:'.length)];
      return pct === undefined ? null : pct / HIVE_SOLVE_PCT;
    }
    case 'sudoku': {
      const m = /^inked:(\d+)-left$/.exec(detail);
      if (!m) return null;
      const left = Number(m[1]);
      const placed = Math.max(0, SUDOKU_BLANKS - left);
      const stages = Math.floor(placed / SUDOKU_CELLS_PER_STAGE);
      const total = Math.floor(SUDOKU_BLANKS / SUDOKU_CELLS_PER_STAGE);
      return Math.max(0, Math.min(1, stages / total));
    }
    case 'word-web': {
      if (!detail.startsWith('group-solved:')) return null;
      // The detail carries the group's colour, not its index, so the ladder
      // counts: each group solved is one more quarter of the board.
      const done = Math.round(earnedSoFar * WEB_GROUPS) + 1;
      return Math.min(1, done / WEB_GROUPS);
    }
    default:
      // The Gallery, the Study and the micro rooms: one sitting, one payout.
      // A room already under `LADDER_MINUTES` has nothing to stage — inventing
      // rungs for a seventy-five-second board would be ceremony, not reward.
      return null;
  }
}

/**
 * A room longer than a median player's appetite for ONE room must pay on the
 * way up (`PATIENCE_SPREAD` in engine/economy/simulate.ts models that appetite
 * at ~3 minutes; this is deliberately a little above it, so the rooms that
 * stage are the ones she cannot expect to finish in a sitting).
 */
export const LADDER_MINUTES = 4;

/** Does this room pay on the way up? */
export function paysInStages(kind: RoomPuzzleKind, tier: Tier): boolean {
  return effortMinutes(kind, tier) >= LADDER_MINUTES
    && stageFractionOf(kind, LADDER_PROBE[kind] ?? '', 0) !== null;
}

/** A detail string each staging room really emits — proof it has a ladder. */
const LADDER_PROBE: Partial<Record<RoomPuzzleKind, string>> = {
  'hive': 'tier-up:Blossom',
  'sudoku': 'inked:48-left',
  'word-web': 'group-solved:green',
};

/**
 * WHERE THE LADDER'S PROGRESS LIVES — on the room it belongs to, inside
 * `manor`, which `store.selectSave` already persists whole. Augmented rather
 * than declared in `engine/types.ts` for the same reason (and by the same
 * established pattern) as `PlacedRoom.session`: that file is architect-owned
 * and shared with every other agent.
 *
 * It is a FRACTION of the room's payout, not a step count, so it survives a
 * retune of the payout itself: if `solvePayout` moves overnight, a half-climbed
 * Conservatory is still half paid and can never be paid twice.
 */
declare module '../types' {
  interface PlacedRoom {
    ladderEarned?: number;
  }
}
