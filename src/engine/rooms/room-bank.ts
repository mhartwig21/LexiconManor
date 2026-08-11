/**
 * THE OPEN LEDGER — the one thing in the manor that survives the night.
 * OWNER: sudoku room agent (round 27). Pure TS: no React, no DOM, no store.
 *
 * ═══ WHY THIS EXISTS ══════════════════════════════════════════════════════
 * REVIEW_AA §6's unfinished commission, in the review's own words: *"If the
 * expert sudoku stays, it becomes a long-form room that banks partial progress
 * overnight and pays proportionally."* Half of that landed in round 22 —
 * `stageSteps` pays the rungs she climbed — and the other half did not, so the
 * shape of the room was still this: **eleven minutes of deduction, one night,
 * and if she does not finish it the grid is gone.** Both hostile reviewers
 * pressed "leave it for tomorrow" on the Counting House and the manor did not
 * have a tomorrow to offer them. Round 24 was honest enough to change the
 * button to say so ("Step away", RoomHost) rather than promise a tomorrow the
 * game could not keep.
 *
 * BENCHMARKS §7 records the same thing about the reference: an unfinished NYT
 * sudoku is saved per difficulty, and reopening the page returns the exact
 * grid with the exact pencil marks. It is the only NYT game with no daily reset
 * on the BOARD, and it is what makes a long puzzle survivable inside a life.
 *
 * ═══ WHY IT IS AN EXCEPTION, AND WHY THE EXCEPTION IS NARROW ══════════════
 * `MANOR_DESIGN §9` wipes the house nightly and the game works hard to justify
 * that in Bramble's voice. `engine/rooms/room-session.ts` leans on it directly:
 * in-room progress lives on `manor.rooms[cellKey].session`, so it "dies with
 * the manor at night, no sweeper, no TTL, no stale-key class of bug". That is
 * still true and still right for six of the seven rooms. A found word, a solved
 * group, a developed plate — those are the NIGHT's work, and the night ends.
 *
 * A ledger leaf is not that. It is fifty-one to fifty-seven separate deductions
 * carrying an hour of thought, and it is the one room whose real-world
 * benchmark treats the board as an object rather than as a session. So exactly
 * ONE room kind banks, exactly ONE board at a time, and the exception is stated
 * in three places the player can see it (see LEGIBILITY below).
 *
 * ═══ WHAT IS BANKED, AND THE ONE THING THAT WOULD HAVE BEEN AN EXPLOIT ════
 * The snapshot is the ordinary `RoomSessionSnapshot` — the adapter's whole
 * state, opaque and verbatim, with the same envelope/stateVersion guards, so a
 * banked board is discarded rather than half-parsed when the shape moves.
 *
 * `ladderEarned` rides WITH it, and that is load-bearing rather than tidy.
 * `PlacedRoom.ladderEarned` is how the room slice knows what fraction of a long
 * room's payout has already been paid on the way up — and it lives on the
 * manor, which is wiped nightly. Bank the grid without it and the manor pays
 * for the same nine placements twice: fill three boxes tonight for +6, sleep,
 * resume the SAME grid on a fresh `PlacedRoom` with `ladderEarned` back at 0,
 * and every rung she already climbed pays again. Banking the fraction with the
 * board is what makes "a room is paid for the work it asks for" survive a
 * night, and `tests/room-bank.test.ts` drives exactly that two-day sequence.
 *
 * ═══ LEGIBILITY — the exception must be VISIBLE, not merely kind ══════════
 * `docs/COMPREHENSION.md`'s rule is that the game withholds the right things
 * (the word, the definition) and never the rules. A save that silently behaves
 * differently from every other room is a rule kept secret. So the exception
 * announces itself three times, in the player's language and never in ours:
 *
 *   1. ON THE WAY OUT — the Counting House's exit button reads *"Leave the
 *      ledger open"* where every other room reads *"Step away"*, with the rule
 *      under it: the house is put away at night, this leaf is not (RoomHost).
 *   2. ON THE WAY BACK IN — a resumed leaf opens under a line naming the day it
 *      was left and the figures still outstanding (SudokuView).
 *   3. WHEN IT CLOSES — solving or discarding it says the ledger is closed, so
 *      the player knows the exception has ended and tomorrow's Counting House
 *      is a new leaf.
 */

import type { RoomPuzzleKind } from './room-puzzle';
import { isUsableSnapshot, type RoomSessionSnapshot } from './room-session';
import type { RoomPuzzleAdapter } from './room-puzzle';

/**
 * Envelope version for the record BELOW — not for the session snapshot it
 * carries (that keeps its own `v` and `stateVersion`). Bump only when these
 * fields change.
 */
export const OPEN_LEDGER_ENVELOPE = 1;

/**
 * THE ROOMS THAT MAY BANK. A deliberate allow-list of one, and a `readonly`
 * tuple rather than a boolean on the adapter, because "which rooms break the
 * nightly reset" is a DESIGN ruling that should be readable in one place and
 * hard to acquire by accident. Adding a kind here is a design decision with a
 * legibility bill attached (see the header): the room must say, in its own
 * copy, that it is an exception.
 */
export const BANKABLE_KINDS: readonly RoomPuzzleKind[] = ['sudoku'];

export function isBankable(kind: RoomPuzzleKind): boolean {
  return BANKABLE_KINDS.includes(kind);
}

/** The manor's one open ledger. `null` when every leaf is closed. */
export interface OpenLedger {
  /** `OPEN_LEDGER_ENVELOPE` at write time. */
  v: number;
  /** The board and its whole adapter state, verbatim. */
  session: RoomSessionSnapshot;
  /**
   * The fraction of the room's payout already banked on the way up. Travels
   * with the board so a night cannot re-open a rung she has already been paid
   * for — see the header.
   */
  ladderEarned: number;
  /** The day she last worked it, for the room's own copy ("left on day 4"). */
  day: number;
}

/**
 * Should this session be left open overnight? Only an UNFINISHED board of a
 * bankable kind with real work on it. A leaf she opened and never touched is
 * not a thread, it is a glance — banking it would make tomorrow's Counting
 * House silently refuse to deal a new board on the strength of nothing.
 */
export function shouldBank(
  kind: RoomPuzzleKind,
  snapshot: RoomSessionSnapshot,
  worked: boolean,
): boolean {
  return isBankable(kind) && !snapshot.done && !snapshot.solvedOnce && worked;
}

/**
 * Is this open ledger safe to hand back to `adapter`? Shape and envelope here;
 * the session inside is checked by the same predicate the same-day restore path
 * uses, so a board this build cannot honour is dropped by ONE rule rather than
 * by two that can disagree.
 */
export function isUsableLedger(
  ledger: unknown,
  adapter: RoomPuzzleAdapter | undefined,
): ledger is OpenLedger {
  if (!adapter || typeof ledger !== 'object' || ledger === null) return false;
  const l = ledger as Partial<OpenLedger>;
  return (
    l.v === OPEN_LEDGER_ENVELOPE &&
    typeof l.ladderEarned === 'number' &&
    Number.isFinite(l.ladderEarned) &&
    l.ladderEarned >= 0 && l.ladderEarned <= 1 &&
    typeof l.day === 'number' &&
    Number.isFinite(l.day) &&
    isBankable(adapter.kind) &&
    isUsableSnapshot(l.session, adapter)
  );
}

/** The open ledger for `kind`, or `undefined` — the one reader every path uses. */
export function ledgerFor(
  ledger: unknown,
  adapter: RoomPuzzleAdapter | undefined,
): OpenLedger | undefined {
  return isUsableLedger(ledger, adapter) ? ledger : undefined;
}

export function openLedgerOf(
  session: RoomSessionSnapshot,
  ladderEarned: number,
  day: number,
): OpenLedger {
  return {
    v: OPEN_LEDGER_ENVELOPE,
    session,
    ladderEarned: Math.max(0, Math.min(1, ladderEarned)),
    day,
  };
}
