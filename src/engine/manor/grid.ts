/**
 * The manor grid — OWNER: A1 (Manor). Pure TS, zero React/DOM.
 *
 * 5 columns x 7 rows, row 0 at the bottom. The Entrance Hall is fixed at
 * (2,0), the Sanctum sealed at (2,6); the other 33 cells are draftable
 * (MANOR_DESIGN §3). Rooms are 1x1 with doors on 1-4 walls; a door drawn
 * against the manor's outer wall, or against a neighbouring wall with no
 * matching door, is dead. Movement flows only through matched door pairs.
 *
 * A room's doors are fixed the moment it is drafted, by the direction she
 * walked in: the card's `'N'` is the door she came through and the whole plan
 * turns rigidly to suit. See THE ORIENTATION CONVENTION, below `placeRoom`.
 *
 * Shapes (Cell, PlacedRoom, ManorState) live in engine/types.ts (frozen);
 * this module owns the logic.
 */

import type { Cell, Dir, ManorState, PlacedRoom, RoomCard, Tier } from '../types';
import { ENTRANCE_CELL, MANOR_COLS, MANOR_ROWS, SANCTUM_CELL } from '../types';
import { createRng, randInt } from '../rng';

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

/** `turns` quarter-turns clockwise (negative and >3 values wrap). */
export function rotateDirBy(d: Dir, turns: number): Dir {
  let out = d;
  const n = ((turns % 4) + 4) % 4;
  for (let i = 0; i < n; i++) out = rotateDir(out);
  return out;
}

/** Quarter-turns clockwise that carry `from` onto `to` (0..3). */
export function turnsBetween(from: Dir, to: Dir): number {
  let d = from;
  for (let n = 0; n < 4; n++) {
    if (d === to) return n;
    d = rotateDir(d);
  }
  return 0; // unreachable: rotateDir cycles all four
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
 * ── THE THIRD STATE (round-13 blocker, AAA 4.6/4.16/11.7) ──────────────────
 *
 * `atSanctumDoor` is a boolean, and the game only ever spoke two of its three
 * meanings. Driven at 390×844: standing at (2,5) in a room whose doors are
 * S+E, the Sanctum was untappable with nothing drawn to say why, and both
 * `/sanctum` and the journal answered "…only from the landing at the top of
 * the stairs — you will have to climb to it" — while she was standing on that
 * exact landing, having just paid 22+ steps for it. Nothing in the game ever
 * stated that the landing ROOM must open north.
 *
 * So the standing is now a three-valued fact, exported once and consumed by
 * every surface that has to speak about it (the blueprint's refusal, the
 * Sanctum screen's copy, the journal's guess button), exactly the way
 * `atSanctumDoor` itself was hoisted out of BlueprintSheet in round 7:
 *
 *   'at-door'        — on the landing, and the room opens onto the Sanctum.
 *   'landing-sealed' — on the landing, and the room turns its back on it. She
 *                      climbed; what she took up here does not open north.
 *   'away'           — anywhere else in the house.
 */
export type SanctumStanding = 'at-door' | 'landing-sealed' | 'at-tube' | 'away';

export function sanctumStanding(manor: ManorState | null | undefined): SanctumStanding {
  if (!manor) return 'away';
  if (sameCell(manor.playerCell, SPEAKING_TUBE_CELL)) return 'at-tube';
  if (!sameCell(manor.playerCell, SANCTUM_DOOR_CELL)) return 'away';
  return doorsConnect(manor, manor.playerCell, 'N') ? 'at-door' : 'landing-sealed';
}

/**
 * ── THE SPEAKING TUBE (round 17, REVIEW_AA §5.2) ───────────────────────────
 *
 * THE DEFECT, in the reviewer's words: *"knowledge is available on day 1 by
 * design (AAA 4.18) but ACCESS to the door is a compounding lottery… one
 * reviewer deduced the answer on day 1 and was still stranded three days
 * later, 15 steps against a door costing 2 keys and 16 steps. Neither reviewer
 * ever saw the Sanctum. The guess itself is already free; the walk is the
 * wall."* Measured on `PROFILE_DECENT`: first door median day 19, 7–14% never
 * inside 45 evenings — so the Portrait's 33 authored nodes and 43 lines of
 * reaction were, for most players, content that did not exist.
 *
 * THE FIX IS A PLACE, NOT A MENU ITEM — the same ruling round 7 made about the
 * door itself, applied to its other end. Every servants' manor of the period
 * ran brass speaking tubes between the hall and the upper floors, and this one
 * runs from the Entrance Hall to the landing outside the Sanctum. She unhooks
 * the whistle where every single day already begins, at a cost of **zero
 * steps**, and the house answers.
 *
 * WHAT THE TUBE MOVES AND WHAT IT DOES NOT:
 *   - it carries A WORD, once a day, the same single daily guess the door
 *     hears (`hasGuessedOnDay` is unchanged and shared);
 *   - a WRONG word gets his whole authored reaction — the closeness variants,
 *     the two thaw beats — downstairs, on day 2, which is the content this
 *     change exists to release;
 *   - a RIGHT word does NOT close the volume. He hears it, the seal answers,
 *     and he asks her up: the ceremony is the climb, and the climb is still
 *     paid in steps. See `app/slices/journal.ts guessAtSanctum` and
 *     `vol.<id>.answered`.
 *
 * So the climb no longer buys PERMISSION TO SPEAK. It buys what it always
 * should have: fragments (violet supply and `decipherYield` both scale with
 * the row), keys, tier-3 solves, the Portrait's audience — and the ending.
 */
export const SPEAKING_TUBE_CELL: Cell = ENTRANCE_CELL;

/** Is she standing at the Entrance Hall's speaking tube right now? */
export function atSpeakingTube(manor: ManorState | null | undefined): boolean {
  return Boolean(manor && sameCell(manor.playerCell, SPEAKING_TUBE_CELL));
}

/**
 * May she say a word to the Sanctum at all right now — through the tube in the
 * hall, or at the door itself? THE one predicate the guess flow and the Sanctum
 * screen consult, so "can she speak" cannot mean two things (the same hoisting
 * `atSanctumDoor` got in round 7, which is why the door could not be reached
 * from a menu).
 */
export function canAddressSanctum(manor: ManorState | null | undefined): boolean {
  const standing = sanctumStanding(manor);
  return standing === 'at-door' || standing === 'at-tube';
}

/**
 * Is she standing on the landing cell at all, whatever it opens onto? The
 * storey, not the gate — kept separate from `atSanctumDoor` on purpose, since
 * conflating the two is the round-13 defect this pair exists to close.
 */
export function onSanctumLanding(manor: ManorState | null | undefined): boolean {
  return Boolean(manor && sameCell(manor.playerCell, SANCTUM_DOOR_CELL));
}

/**
 * Would a room with these doors, laid in THIS cell, open onto the Sanctum?
 *
 * The one predicate the draft card face, the blueprint and the simulation all
 * read, so "this plan opens the door" cannot mean three things. Only the
 * landing can: everywhere else the answer is no, however many north doors the
 * plan draws.
 */
export function opensOntoSanctum(doors: readonly Dir[], cell: Cell): boolean {
  return sameCell(cell, SANCTUM_DOOR_CELL) && doors.includes('N');
}

/**
 * Would THIS card, taken at THIS door, open onto the Sanctum? Pure, and the
 * same `resolveDoors` the card face already draws with — so the stamp on the
 * card and the door the room ends up with are the same computation, never two.
 */
export function cardOpensOntoSanctum(
  card: RoomCard, entryDir: Dir, manor: ManorState, cell: Cell,
): boolean {
  return opensOntoSanctum(resolveDoors(card, entryDir, manor, cell), cell);
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

/**
 * ── THE ORIENTATION CONVENTION (round-9 owner defect) ──────────────────────
 *
 * OWNER REPORT: "issues with the orientation of placement of rooms… they
 * should be determined by the direction I'm facing when I enter the room."
 *
 * THE RULE, in one line: **the layout's `'N'` is the door you walk in
 * through.** A card is authored facing you as you stand at its threshold —
 * the dead-end's single door, the corridor's near end, the corner's stem —
 * and placement turns the whole plan, rigidly, so that `'N'` lands on the
 * wall you came through (`opposite(entryDir)`). Every other door follows by
 * that same single quarter-turn count. Nothing else is consulted: not the
 * neighbours, not the outer walls, not the rng.
 *
 *   entryDir N (walking up)    → 2 turns → corner ['N','E'] places ['S','W']
 *   entryDir E (walking right) → 3 turns → corner places ['N','W']
 *   entryDir S (walking down)  → 0 turns → corner places ['N','E']
 *   entryDir W (walking left)  → 1 turn  → corner places ['E','S']
 *
 * WHAT THIS REPLACES, and why: placement used to enumerate every rotation
 * that kept a door on the entry wall and then pick the one with the most
 * LIVE doors, breaking ties with an rng. The entry door was guaranteed, but
 * the room's remaining doors were chosen by the game — the same corner
 * entered walking north could come out opening west one day and east the
 * next, which is exactly the incoherence the owner reported. Worse, it made
 * the draft undecidable: no card face could tell her which way the second
 * door would point, so "will this keep my path alive or seal it" was not a
 * question she could answer before spending.
 *
 * THE PRICE, TAKEN DELIBERATELY: a rigid turn means a drafted room's other
 * doors can land on the outer wall or on a neighbour's blank plaster, and
 * the room seals itself. That is the Blue Prince tension (BENCHMARKS §4) and
 * it is the point — the draft is now a real decision, because the card face
 * shows the post-rotation truth (ui/blueprint/DraftModal.tsx renders exactly
 * `resolveDoors` for the door she is standing at) and she can read a
 * self-sealing pick before she takes it. Measured over the real deck, ~26% of
 * placements offer no onward door (tests/grid.test.ts pins the rate).
 *
 * WHAT DOES NOT CHANGE: an offer is never *unplaceable* (AAA 4.4). The
 * rotation always carries a door onto the entry wall, and the two defensive
 * branches below cover a layout that could not (an empty layout, or one
 * authored with no `'N'`), so `placeRoom` always succeeds.
 */
export const ENTRY_DOOR: Dir = 'N';

/**
 * Turn a canonical layout so its entry door (`'N'`) lands on the wall the
 * player came through. Pure: same (layout, entryDir) → same doors, always.
 * Returned in compass order (N, E, S, W) so the result is canonical too.
 */
export function orientLayout(layout: readonly Dir[], entryDir: Dir): Dir[] {
  const need = opposite(entryDir);
  // Defensive (AAA 4.4): an empty layout still gets the door she walked in by.
  if (layout.length === 0) return [need];
  // Defensive: a layout authored without an 'N' anchors on its first door
  // instead, so it still presents a door on the entry wall.
  const anchor = layout.includes(ENTRY_DOOR) ? ENTRY_DOOR : layout[0]!;
  const turns = turnsBetween(anchor, need);
  const doors = new Set<Dir>(layout.map((d) => rotateDirBy(d, turns)));
  doors.add(need);
  return DIRS.filter((d) => doors.has(d));
}

/** Stream id for the layout pick — distinct from card draws and door rolls. */
const LAYOUT_STREAM = 0x1a70;

/**
 * WHICH layout a multi-layout card arrives in — deterministic, and knowable
 * before she picks.
 *
 * Cards may carry several plans (the Darkroom is a dead end, a corner OR a
 * corridor, deliberately — engine/manor/deck.ts). Collapsing every card to one
 * plan would have flattened that variety and re-tuned nothing but the deck's
 * feel, so instead the choice is a pure hash of (daySeed, target cell, card
 * id): the Darkroom behind THIS door today is one fixed shape, the same shape
 * whether she looks now or after a reroll, and the draft card draws that exact
 * shape. It is a property of the door, not of the moment she taps.
 */
export function layoutFor(
  card: RoomCard, daySeed: number, key: string,
): readonly Dir[] {
  const layouts = card.doorLayouts;
  if (layouts.length === 0) return [];
  if (layouts.length === 1) return layouts[0]!;
  return layouts[hashSeed(daySeed, `${key}|${card.id}`, LAYOUT_STREAM) % layouts.length]!;
}

/**
 * The doors a card will be placed with, entered through `entryDir` at `cell`.
 *
 * A PURE FUNCTION of (card, daySeed, cell, entryDir) — no rng, no scoring, no
 * look at the neighbours. This is THE one answer: the manor slice places with
 * it and the draft card face draws with it, so the diagram cannot lie.
 */
export function resolveDoors(
  card: RoomCard,
  entryDir: Dir,
  manor: ManorState,
  cell: Cell,
): Dir[] {
  return orientLayout(layoutFor(card, manor.daySeed, cellKey(cell)), entryDir);
}

/**
 * Would this placement seal itself? True when the room's only door is the one
 * she walked in by — every other door lands on the outer wall or on a
 * neighbour's blank plaster. The deliberate consequence of the rigid turn
 * (see above); exported so the design owner can measure the rate.
 */
export function sealsItself(
  doors: readonly Dir[], entryDir: Dir, manor: ManorState, cell: Cell,
): boolean {
  const came = opposite(entryDir);
  return !doors.some((dir) => {
    if (dir === came) return false;
    const n = neighbor(cell, dir);
    if (!n) return false;                                  // outer wall: dead
    const there = roomAt(manor, n);
    return !there || there.doors.includes(opposite(dir));   // empty = tomorrow's draft
  });
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
