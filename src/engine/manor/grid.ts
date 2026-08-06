/**
 * The manor grid — OWNER: A1 (Manor). Pure TS, zero React/DOM.
 *
 * 5 columns x 7 rows, row 0 at the bottom. The Entrance Hall is fixed at
 * (2,0), the Sanctum sealed at (2,6); the other 33 cells are draftable
 * (MANOR_DESIGN §3). Rooms are 1x1 with doors on 1-4 walls; a door drawn
 * against the manor's outer wall, or against a neighbouring wall with no
 * matching door, is dead. Movement flows only through matched door pairs.
 *
 * Shapes (Cell, PlacedRoom, ManorState) live in engine/types.ts (frozen);
 * this module owns the logic.
 */

import type { Cell, Dir, ManorState, PlacedRoom, RoomCard, Tier } from '../types';
import { ENTRANCE_CELL, MANOR_COLS, MANOR_ROWS, SANCTUM_CELL } from '../types';
import { createRng, randInt, type Rng } from '../rng';

export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];

export const ENTRANCE_KEY = cellKey(ENTRANCE_CELL);
export const SANCTUM_KEY = cellKey(SANCTUM_CELL);

/**
 * ── THE DOOR IS A PLACE (AAA 4.10e, MANOR_DESIGN §7) ───────────────────────
 *
 * The Sanctum cell (2,6) is sealed and never walked into; the word is spoken
 * from the landing directly below it, (2,5), through that room's north door.
 * So "reaching the Sanctum" means STANDING HERE with a matched door pair
 * overhead — nothing else in the game is the second gate.
 *
 * ROUND-7 DEFECT this exists to close: the predicate was written inline in
 * `ui/blueprint/BlueprintSheet.tsx` only, so the journal's "Take it to the
 * Sanctum" button and `SanctumView.speak()` could both reach the door from
 * anywhere in the house, on any day, for zero steps — the owner's exact
 * complaint ("I reached the Forgotten Word on my first day"), reproducible on
 * a fresh save at 21 untouched steps. One exported predicate now, consumed by
 * the sheet, by the guess flow (app/slices/journal.ts) and by the Sanctum
 * screen, so a fourth caller cannot invent a fifth answer.
 */
export const SANCTUM_DOOR_CELL: Cell = {
  col: SANCTUM_CELL.col,
  row: SANCTUM_CELL.row - 1,
};

export const SANCTUM_DOOR_KEY = cellKey(SANCTUM_DOOR_CELL);

/** Reserved card ids for the two pre-placed rooms (deck registry touchpoint). */
export const ENTRANCE_CARD_ID = 'entrance-hall';
export const SANCTUM_CARD_ID = 'sanctum';

export function cellKey(c: Cell): string {
  return `${c.col},${c.row}`;
}

export function parseCellKey(key: string): Cell {
  const [col, row] = key.split(',').map(Number);
  return { col: col as Cell['col'], row: row ?? 0 };
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < MANOR_COLS && row >= 0 && row < MANOR_ROWS;
}

export function opposite(d: Dir): Dir {
  return d === 'N' ? 'S' : d === 'S' ? 'N' : d === 'E' ? 'W' : 'E';
}

/** One quarter-turn clockwise: N→E→S→W→N. */
export function rotateDir(d: Dir): Dir {
  return d === 'N' ? 'E' : d === 'E' ? 'S' : d === 'S' ? 'W' : 'N';
}

const DELTA: Record<Dir, { dc: number; dr: number }> = {
  N: { dc: 0, dr: 1 },   // row 0 is the bottom; north climbs the manor
  S: { dc: 0, dr: -1 },
  E: { dc: 1, dr: 0 },
  W: { dc: -1, dr: 0 },
};

/** The adjacent cell through direction `d`, or null off the outer wall. */
export function neighbor(c: Cell, d: Dir): Cell | null {
  const col = c.col + DELTA[d].dc;
  const row = c.row + DELTA[d].dr;
  return inBounds(col, row) ? { col: col as Cell['col'], row } : null;
}

/** Direction from `from` to an adjacent cell `to`, or null if not adjacent. */
export function dirBetween(from: Cell, to: Cell): Dir | null {
  for (const d of DIRS) {
    const n = neighbor(from, d);
    if (n && sameCell(n, to)) return d;
  }
  return null;
}

/** Row-band difficulty pressure: rows 0-2 / 3-4 / 5-6 → tier 1 / 2 / 3. */
export function rowTier(row: number): Tier {
  return row <= 2 ? 1 : row <= 4 ? 2 : 3;
}

export function roomAt(manor: ManorState, cell: Cell): PlacedRoom | undefined {
  return manor.rooms[cellKey(cell)];
}

/** A fresh manor: entrance + sanctum pre-placed, player home at the entrance. */
export function createManor(daySeed: number): ManorState {
  const entrance: PlacedRoom = {
    cardId: ENTRANCE_CARD_ID,
    cell: ENTRANCE_CELL,
    doors: ['N', 'E', 'W'],   // south faces the front drive (outer wall)
    solved: true,             // never a puzzle — it is home
    kind: 'parlor',           // Mrs. Bramble's morning territory
  };
  const sanctum: PlacedRoom = {
    cardId: SANCTUM_CARD_ID,
    cell: SANCTUM_CELL,
    doors: ['S'],             // one sealed door, facing down the manor
    solved: false,
    kind: 'mystery',
  };
  return {
    rooms: { [ENTRANCE_KEY]: entrance, [SANCTUM_KEY]: sanctum },
    playerCell: { ...ENTRANCE_CELL },
    daySeed,
  };
}

/**
 * Two placed rooms connect through `dir` when both sides drew a door on the
 * shared wall. Movement and drafting both flow through this predicate.
 */
export function doorsConnect(manor: ManorState, from: Cell, dir: Dir): boolean {
  const here = roomAt(manor, from);
  if (!here || !here.doors.includes(dir)) return false;
  const target = neighbor(from, dir);
  if (!target) return false;
  const there = roomAt(manor, target);
  return Boolean(there && there.doors.includes(opposite(dir)));
}

/** May the player step from their cell into `target`? (Adjacency + doors.) */
export function canMoveTo(manor: ManorState, target: Cell): boolean {
  const dir = dirBetween(manor.playerCell, target);
  if (!dir) return false;
  return doorsConnect(manor, manor.playerCell, dir);
}

/** Cells the player could walk into right now. */
export function walkableNeighbors(manor: ManorState): Cell[] {
  const out: Cell[] = [];
  for (const d of DIRS) {
    const n = neighbor(manor.playerCell, d);
    if (n && doorsConnect(manor, manor.playerCell, d)) out.push(n);
  }
  return out;
}

/**
 * Is the player standing at the Sanctum door right now? (See SANCTUM_DOOR_CELL.)
 *
 * Both halves matter: she is on the landing AND the room she drafted there
 * drew a north door that matches the Sanctum's sealed south one. A landing
 * room with no north door is a landing she has to draft again tomorrow — the
 * climb is not banked by arriving on the storey.
 */
export function atSanctumDoor(manor: ManorState | null | undefined): boolean {
  if (!manor) return false;
  if (!sameCell(manor.playerCell, SANCTUM_DOOR_CELL)) return false;
  return doorsConnect(manor, manor.playerCell, 'N');
}

/**
 * Doors of the player's current room that open into an EMPTY in-bounds cell —
 * the only places a draft may be offered (MANOR_DESIGN §3).
 */
export function draftTargets(manor: ManorState): { dir: Dir; cell: Cell }[] {
  const here = roomAt(manor, manor.playerCell);
  if (!here) return [];
  const out: { dir: Dir; cell: Cell }[] = [];
  for (const dir of here.doors) {
    const cell = neighbor(manor.playerCell, dir);
    if (cell && !roomAt(manor, cell)) out.push({ dir, cell });
  }
  return out;
}

/**
 * Dead doors of a placed room: openings against the outer wall, or against a
 * neighbouring room's blank wall. (Doors into EMPTY cells are alive — they are
 * tomorrow's drafts.)
 */
export function deadDoors(room: PlacedRoom, manor: ManorState): Dir[] {
  const out: Dir[] = [];
  for (const dir of room.doors) {
    const n = neighbor(room.cell, dir);
    if (!n) {
      out.push(dir);            // outer wall
      continue;
    }
    const there = roomAt(manor, n);
    if (there && !there.doors.includes(opposite(dir))) out.push(dir); // blank wall
  }
  return out;
}

/** Immutable placement. Throws on an occupied or fixed cell — callers guard. */
export function placeRoom(manor: ManorState, placed: PlacedRoom): ManorState {
  const key = cellKey(placed.cell);
  if (manor.rooms[key]) throw new Error(`placeRoom: cell ${key} is occupied`);
  return { ...manor, rooms: { ...manor.rooms, [key]: placed } };
}

// ---------------------------------------------------------------------------
// Door orientation at placement
// ---------------------------------------------------------------------------

/** All four rotations of a door layout, deduplicated. */
export function orientationsOf(layout: readonly Dir[]): Dir[][] {
  const seen = new Set<string>();
  const out: Dir[][] = [];
  let current = [...layout];
  for (let i = 0; i < 4; i++) {
    const sorted = [...current].sort();
    const sig = sorted.join('');
    if (!seen.has(sig)) {
      seen.add(sig);
      out.push(sorted);
    }
    current = current.map(rotateDir);
  }
  return out;
}

/**
 * Resolve a card's doors at placement: the room is entered at `cell` through
 * the drafting door (`entryDir`, pointing from the old room into the new), so
 * some rotation MUST put a door on the shared wall (facing `opposite(entryDir)`).
 * Among the valid rotations, prefer the one that keeps paths flowing — the
 * most live doors (not against outer walls or blank neighbour walls) —
 * breaking ties with the provided rng (BENCHMARKS §4 placement lesson).
 *
 * Every card with a non-empty layout is orientable (rotations sweep all four
 * walls), so an offer is never unplaceable (AAA 4.4).
 */
export function resolveDoors(
  card: RoomCard,
  entryDir: Dir,
  manor: ManorState,
  cell: Cell,
  rng: Rng,
): Dir[] {
  const need = opposite(entryDir);
  const candidates: Dir[][] = [];
  for (const layout of card.doorLayouts) {
    for (const rotation of orientationsOf(layout)) {
      if (rotation.includes(need)) candidates.push(rotation);
    }
  }
  if (candidates.length === 0) {
    // Defensive: never strand the player — a plain door back the way she came.
    return [need];
  }
  const scored = candidates.map((doors) => {
    let live = 0;
    for (const dir of doors) {
      const n = neighbor(cell, dir);
      if (!n) continue;                          // outer wall: dead
      const there = roomAt(manor, n);
      if (!there || there.doors.includes(opposite(dir))) live++;
    }
    return { doors, live };
  });
  const best = Math.max(...scored.map((s) => s.live));
  const top = scored.filter((s) => s.live === best);
  return top[randInt(rng, top.length)]!.doors;
}

// ---------------------------------------------------------------------------
// Seed streams
// ---------------------------------------------------------------------------

/**
 * Per-cell, per-draw rng seed: hash(daySeed, cellKey, drawIndex). A reroll at
 * door A advances only A's stream — door B's future offers are untouched
 * (AAA 4.8, property-tested in tests/drafting.test.ts).
 */
export function hashSeed(daySeed: number, key: string, drawIndex: number): number {
  let h = (daySeed ^ Math.imul(drawIndex + 1, 0x9e3779b1)) | 0;
  for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Per-room puzzle seed — THE single source of truth (integration: RoomHost
 * now imports this; its private bit-identical copy is gone). Used at
 * placement to pin PlacedRoom.puzzleId and on entry to re-select the same
 * puzzle deterministically for seen-marking.
 */
export function roomSeed(daySeed: number, key: string): number {
  let h = daySeed | 0;
  for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return Math.floor(createRng(h)() * 2 ** 31);
}

// ---------------------------------------------------------------------------
// Dewey
// ---------------------------------------------------------------------------

/**
 * Dewey naps in one seeded draftable cell per day (never the entrance or the
 * sanctum). He becomes visible when that cell is drafted; petting costs 1 step
 * and reveals whether his row still hides a violet room (MANOR_DESIGN §8).
 */
export function deweyCell(daySeed: number): Cell {
  const rng = createRng((daySeed ^ 0x0dece11) >>> 0);
  for (;;) {
    const col = randInt(rng, MANOR_COLS) as Cell['col'];
    const row = 1 + randInt(rng, MANOR_ROWS - 2); // rows 1..5
    const cell: Cell = { col, row };
    if (!sameCell(cell, ENTRANCE_CELL) && !sameCell(cell, SANCTUM_CELL)) return cell;
  }
}
