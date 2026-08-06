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
import { MANOR_COLS, MANOR_ROWS, SANCTUM_CELL } from '../types';
import { DOOR_LOCKS, doorLockedAt } from '../economy/steps';
import { cellKey, draftTargets, neighbor, roomAt, sameCell } from './grid';

/** Keys a padlocked door asks for (one, today — kept as a named constant). */
export const KEY_COST = DOOR_LOCKS.keyCost;

/** Could a door into this 0-based row EVER be padlocked? (Rows 4–6.) */
export function rowCanLock(row: number): boolean {
  return (DOOR_LOCKS.chanceByRow[row] ?? 0) > 0;
}

/**
 * Is the door into `cell` padlocked today? Deterministic per (daySeed, cell),
 * and false for any cell that already holds a room — a placed room's doors
 * are open; the padlock is on the DRAFT, not on the corridor. (This is what
 * keeps movement free: `moveTo` only ever walks into rooms that exist.)
 */
export function isDoorLocked(manor: ManorState, cell: Cell): boolean {
  if (roomAt(manor, cell)) return false;
  return doorLockedAt(manor.daySeed, cellKey(cell), cell.row);
}

/** Can she open this door right now — i.e. is it unlocked, or can she pay? */
export function canOpenDoor(manor: ManorState, cell: Cell, keys: number): boolean {
  return !isDoorLocked(manor, cell) || keys >= KEY_COST;
}

export interface DraftTargetLock {
  cell: Cell;
  locked: boolean;
  /** Keys this door asks for: 0 when it is not locked. */
  keyCost: number;
}

/** The player's own doors, annotated with their padlocks (drafting surface). */
export function lockedDraftTargets(manor: ManorState): (DraftTargetLock & { dir: Dir })[] {
  return draftTargets(manor).map((t) => {
    const locked = isDoorLocked(manor, t.cell);
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
export function visibleLocks(manor: ManorState): DraftTargetLock[] {
  const rooms = Object.values(manor.rooms);
  // The Sanctum is pre-placed and sealed from dawn on day 1: it does not make
  // its landing legible, or every fresh manor would open with the whole top
  // storey padlocked in view.
  const openRows = new Set(
    rooms.filter((r) => !sameCell(r.cell, SANCTUM_CELL)).map((r) => r.cell.row),
  );
  const out: DraftTargetLock[] = [];
  const seen = new Set<string>();

  const consider = (cell: Cell) => {
    const key = cellKey(cell);
    if (seen.has(key)) return;
    seen.add(key);
    if (!isDoorLocked(manor, cell)) return;
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
