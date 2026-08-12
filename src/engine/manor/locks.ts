/**
 * Padlocked doors — OWNER: A1 (Manor). Pure TS, zero React/DOM.
 *
 * The manor-facing half of A2's `DOOR_LOCKS` (engine/economy/steps.ts owns
 * the RATES; this module owns the QUESTIONS the grid and the blueprint ask).
 * Before the padlock arc, `doorLockedAt` existed but nothing outside the
 * economy simulation ever called it — the simulated manor was gated on rows
 * 5–7 and the shipped one was not, which is exactly the "way too easy, I
 * reached the Forgotten Word on day one" the owner playtest reported.
 *
 * The rules, in the order the player meets them (AAA 4.6 / 4.10d):
 *
 *   1. VISIBLE FIRST. A padlock is drawn on the blueprint the moment its row
 *      is in play — `visibleLocks` — so she never spends a step toward a gate
 *      she could not see. Locks are deterministic per (daySeed, cell): the
 *      same door gives the same answer all day.
 *   2. REFUSED FREE. Without a key the door will not open and NOTHING is
 *      charged (the manor slice checks `isDoorLocked` before it ledgers the
 *      step). Never a surprise charge; never pay-for-nothing.
 *   3. PAID ON PLACEMENT. With a key the draft opens for the usual 1 step and
 *      the key is spent when a card is chosen, so backing out of the offer
 *      still costs only that step (AAA 4.6's cancellable draft).
 *
 * Rows are 0-based here (engine convention): rows 0–3 never lock, rows 4–6
 * lock at 35% / 55% / 80%.
 */

import type { Cell, Dir, ManorState } from '../types';
import { MANOR_COLS, MANOR_ROWS } from '../types';
import { DOOR_LOCKS, doorLockedAt } from '../economy/steps';
import { cellKey, draftTargets, isSanctumCell, neighbor, roomAt } from './grid';

/** Keys a padlocked door asks for (one, today — kept as a named constant). */
export const KEY_COST = DOOR_LOCKS.keyCost;

/** Could a door into this 0-based row EVER be padlocked? (Rows 4–6.) */
export function rowCanLock(row: number): boolean {
  return (DOOR_LOCKS.chanceByRow[row] ?? 0) > 0;
}

/**
 * ── THE HOUSE HOLDS ITS DOORS (round 17, REVIEW_AA §5.2) ───────────────────
 *
 * One optional term, threaded through every lock question, false everywhere
 * until a single irreversible thing has happened: **she has named the word.**
 * `engine/manor/tube.ts doorsHeldOpen` is the only thing that ever supplies it,
 * and it reads the write-once `vol.<id>.answered` flag the speaking tube sets.
 *
 * WHY IT IS THE PADLOCK AND NOT SOMETHING CHEAPER. Measured on 600
 * `PROFILE_DECENT` campaigns with the tube fitted but the padlocks left in
 * place — i.e. the answer spoken, the landing mercy armed, and nothing else
 * changed — the gap between naming the word and being let in ran **median 7,
 * p90 20 evenings**, the volume was won at median day 29 and **11.5% of
 * campaigns never finished at all**. That is the wall REVIEW_AA §5.2 measured,
 * surviving the fix that was supposed to remove it: she knew the word, she was
 * allowed to say it, and the house still would not let her upstairs to finish.
 * With the doors held: median 2, p90 6, won at median day 24, 0–0.5% unfinished.
 * The hold is load-bearing, and it is only honest because of when it fires.
 *
 * WHAT IT COSTS. Nothing before the answer — and the answer is the last thing
 * that happens in a volume, so every one of the ~20 evenings the padlock arc is
 * designed for pays it in keys exactly as before. AAA 4.10d's "<8% day-1
 * landing reach" is untouched **by construction**: the flag cannot be set on a
 * day she has not already deduced the word, and the model measures the day-1
 * rate unchanged at 0.0–6.0%.
 */
export interface LockView {
  /** True once she has named the word and the house is holding the stairs. */
  heldOpen?: boolean;
}

/**
 * Is the door into `cell` padlocked today? Deterministic per (daySeed, cell),
 * and false for any cell that already holds a room — a placed room's doors
 * are open; the padlock is on the DRAFT, not on the corridor. (This is what
 * keeps movement free: `moveTo` only ever walks into rooms that exist.)
 */
export function isDoorLocked(manor: ManorState, cell: Cell, view?: LockView): boolean {
  if (view?.heldOpen) return false;
  if (roomAt(manor, cell)) return false;
  return doorLockedAt(manor.daySeed, cellKey(cell), cell.row);
}

/** Can she open this door right now — i.e. is it unlocked, or can she pay? */
export function canOpenDoor(
  manor: ManorState, cell: Cell, keys: number, view?: LockView,
): boolean {
  return !isDoorLocked(manor, cell, view) || keys >= KEY_COST;
}

export interface DraftTargetLock {
  cell: Cell;
  locked: boolean;
  /** Keys this door asks for: 0 when it is not locked. */
  keyCost: number;
}

/** The player's own doors, annotated with their padlocks (drafting surface). */
export function lockedDraftTargets(
  manor: ManorState, view?: LockView,
): (DraftTargetLock & { dir: Dir })[] {
  return draftTargets(manor).map((t) => {
    const locked = isDoorLocked(manor, t.cell, view);
    return { ...t, locked, keyCost: locked ? KEY_COST : 0 };
  });
}

/**
 * Every padlock the player can legitimately SEE right now (AAA 4.6: see the
 * gate before spending toward it). A locked empty cell shows its padlock when
 *
 *   - a room that already stands has a DOOR into it (a door she could walk
 *     to — a padlock is never drawn against a blank wall), or
 *   - a room already stands in its row (the storey is open; she can see down
 *     the landing). The sealed Sanctum does not count: it is pre-placed on
 *     day 1 and standing outside it is not the same as being up there.
 *
 * That is deliberately wider than "doors at her feet": standing on row 3 she
 * must be able to read row 4's gates before paying to climb into them. It is
 * deliberately narrower than "every locked cell in the manor": the empty top
 * of the house is not a corridor she has any way to look down yet, and 15
 * padlocks on a 390px sheet is noise, not information.
 */
export function visibleLocks(manor: ManorState, view?: LockView): DraftTargetLock[] {
  // Held open: there is nothing to draw. The blueprint must not keep printing
  // padlocks on doors that will open for free — a lock drawn where none bites
  // is exactly the "chrome that lies" 4.6 forbids, in the other direction.
  if (view?.heldOpen) return [];
  const rooms = Object.values(manor.rooms);
  // The Sanctum is pre-placed and sealed from dawn on day 1: it does not make
  // its landing legible, or every fresh manor would open with the whole top
  // storey padlocked in view.
  const openRows = new Set(
    rooms.filter((r) => !isSanctumCell(r.cell)).map((r) => r.cell.row),
  );
  const out: DraftTargetLock[] = [];
  const seen = new Set<string>();

  const consider = (cell: Cell) => {
    const key = cellKey(cell);
    if (seen.has(key)) return;
    seen.add(key);
    if (!isDoorLocked(manor, cell, view)) return;
    out.push({ cell, locked: true, keyCost: KEY_COST });
  };

  for (const room of rooms) {
    // …the empty cells this room actually has a DOOR into. A padlock means
    // "there is a door here and it is shut", so it is only ever drawn where a
    // door exists — never against a blank wall.
    for (const dir of room.doors) {
      const n = neighbor(room.cell, dir);
      if (n && !roomAt(manor, n) && rowCanLock(n.row)) consider(n);
    }
  }
  for (let row = 0; row < MANOR_ROWS; row++) {
    // …and the whole of any storey that is already open to her.
    if (!openRows.has(row) || !rowCanLock(row)) continue;
    for (let col = 0; col < MANOR_COLS; col++) {
      const cell: Cell = { col: col as Cell['col'], row };
      if (!roomAt(manor, cell)) consider(cell);
    }
  }
  return out;
}
