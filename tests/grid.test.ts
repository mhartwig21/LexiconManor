import { describe, expect, it } from 'vitest';
import {
  cellKey, parseCellKey, sameCell, inBounds, opposite, rotateDir, neighbor,
  dirBetween, rowTier, createManor, doorsConnect, canMoveTo, walkableNeighbors,
  draftTargets, deadDoors, placeRoom, orientLayout, layoutFor, resolveDoors,
  rotateDirBy, turnsBetween, sealsItself, hashSeed,
  roomSeed, deweyCell, roomAt, atSanctumDoor, cardOpensOntoSanctum, onSanctumLanding,
  opensOntoSanctum, sanctumStanding, canAddressSanctum, atSpeakingTube, SPEAKING_TUBE_CELL,
  DIRS, ENTRANCE_KEY, SANCTUM_DOOR_CELL, SANCTUM_DOOR_KEY, SANCTUM_KEY,
} from '../src/engine/manor/grid';
import { BASE_DECK, deckFor } from '../src/engine/manor/deck';
import { rollCards } from '../src/engine/manor/drafting';
import { createRng, randInt } from '../src/engine/rng';
import {
  canOpenDoor, isDoorLocked, lockedDraftTargets, rowCanLock, visibleLocks, KEY_COST,
} from '../src/engine/manor/locks';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlueprintSheet from '../src/ui/blueprint/BlueprintSheet';
import {
  draftLabel, draftTotal, landingRefusalAnnouncement, landingRefusalLine, priceStamp, priceWords,
  sanctumDraftStamp, stampsDraftPrice, stampsPrice, walkLabel,
  LANDING_REFUSAL_LINES, LANDING_SEALED_LABEL,
} from '../src/ui/blueprint/pricing';
import { DOOR_LOCKS, moveAt, rowName } from '../src/engine/economy/steps';
import type { Cell, Dir, ManorState, PlacedRoom, RoomCard } from '../src/engine/types';
import { ENTRANCE_CELL, MANOR_COLS, MANOR_ROWS, SANCTUM_CELL } from '../src/engine/types';
import DraftModal from '../src/ui/blueprint/DraftModal';

/** OWNER: A1 (Manor). The grid engine — MANOR_DESIGN §3, ARCHITECTURE §3. */

function room(cell: Cell, doors: Dir[], overrides: Partial<PlacedRoom> = {}): PlacedRoom {
  return { cardId: 'test-room', cell, doors, solved: false, kind: 'hive', ...overrides };
}

function testCard(doorLayouts: Dir[][]): RoomCard {
  return {
    id: 'card-under-test', name: 'Test', category: 'puzzle', puzzleKind: 'hive',
    doorLayouts, tierRange: [1, 3], gemCost: 0, rarity: 'common',
  };
}

describe('cell arithmetic', () => {
  it('round-trips cell keys', () => {
    for (let col = 0; col < MANOR_COLS; col++) {
      for (let row = 0; row < MANOR_ROWS; row++) {
        const cell: Cell = { col: col as Cell['col'], row };
        expect(parseCellKey(cellKey(cell))).toEqual(cell);
      }
    }
  });

  it('knows the board bounds', () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(4, 6)).toBe(true);
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(5, 0)).toBe(false);
    expect(inBounds(0, 7)).toBe(false);
  });

  it('opposite and rotate cover the compass', () => {
    expect(opposite('N')).toBe('S');
    expect(opposite('E')).toBe('W');
    expect(rotateDir('N')).toBe('E');
    expect(rotateDir('W')).toBe('N');
    for (const d of DIRS) expect(opposite(opposite(d))).toBe(d);
  });

  it('north climbs the manor (row 0 is the bottom)', () => {
    expect(neighbor({ col: 2, row: 0 }, 'N')).toEqual({ col: 2, row: 1 });
    expect(neighbor({ col: 2, row: 0 }, 'S')).toBeNull();
    expect(neighbor({ col: 0, row: 3 }, 'W')).toBeNull();
    expect(neighbor({ col: 4, row: 3 }, 'E')).toBeNull();
  });

  it('dirBetween inverts neighbor', () => {
    const c: Cell = { col: 2, row: 3 };
    for (const d of DIRS) {
      const n = neighbor(c, d);
      if (n) expect(dirBetween(c, n)).toBe(d);
    }
    expect(dirBetween(c, { col: 2, row: 5 })).toBeNull();
  });

  it('row bands map to tiers 1/2/3', () => {
    expect([0, 1, 2].map(rowTier)).toEqual([1, 1, 1]);
    expect([3, 4].map(rowTier)).toEqual([2, 2]);
    expect([5, 6].map(rowTier)).toEqual([3, 3]);
  });
});

describe('createManor', () => {
  it('pre-places the entrance and the sealed sanctum, player home', () => {
    const m = createManor(42);
    expect(Object.keys(m.rooms)).toHaveLength(2);
    expect(m.rooms[ENTRANCE_KEY]!.cell).toEqual(ENTRANCE_CELL);
    expect(m.rooms[ENTRANCE_KEY]!.solved).toBe(true);
    expect(m.rooms[SANCTUM_KEY]!.cell).toEqual(SANCTUM_CELL);
    expect(m.rooms[SANCTUM_KEY]!.kind).toBe('mystery');
    expect(m.playerCell).toEqual(ENTRANCE_CELL);
    expect(m.daySeed).toBe(42);
  });

  it('entrance never opens through the front wall', () => {
    const m = createManor(1);
    expect(m.rooms[ENTRANCE_KEY]!.doors).not.toContain('S');
  });
});

describe('the Sanctum door is a PLACE (AAA 4.10e — the second gate)', () => {
  it('sits on the landing directly below the sealed Sanctum', () => {
    expect(SANCTUM_DOOR_CELL.col).toBe(SANCTUM_CELL.col);
    expect(SANCTUM_DOOR_CELL.row).toBe(SANCTUM_CELL.row - 1);
    expect(SANCTUM_DOOR_KEY).toBe(cellKey(SANCTUM_DOOR_CELL));
    // The Sanctum's own cell is sealed with one south door and is never a
    // draft target — the landing is where the word is spoken from.
    expect(createManor(3).rooms[SANCTUM_KEY]!.doors).toEqual(['S']);
  });

  it('is false everywhere else in the house, on any day', () => {
    // THE ROUND-7 BLOCKER: with no such predicate on the guess path, a fresh
    // save could win Volume 1 on day 1 from the Entrance Hall, 21 steps
    // untouched, via the journal's "Take it to the Sanctum" button.
    const m = createManor(11);
    expect(atSanctumDoor(m)).toBe(false);
    expect(atSanctumDoor(null)).toBe(false);
    expect(atSanctumDoor(undefined)).toBe(false);
    for (const row of [0, 1, 2, 3, 4]) {
      expect(atSanctumDoor({ ...m, playerCell: { col: 2, row } })).toBe(false);
    }
    // Even the rest of the landing storey: only the cell under the door.
    for (const col of [0, 1, 3, 4] as const) {
      expect(atSanctumDoor({ ...m, playerCell: { col, row: SANCTUM_DOOR_CELL.row } })).toBe(false);
    }
  });

  it('needs the north door as well as the cell', () => {
    let m = createManor(11);
    // Standing on the landing in a room that drew no north door: arriving on
    // the storey is not arriving at the door.
    m = placeRoom(m, room(SANCTUM_DOOR_CELL, ['S', 'E']));
    expect(atSanctumDoor({ ...m, playerCell: { ...SANCTUM_DOOR_CELL } })).toBe(false);

    let open = createManor(11);
    open = placeRoom(open, room(SANCTUM_DOOR_CELL, ['S', 'N']));
    expect(atSanctumDoor({ ...open, playerCell: { ...SANCTUM_DOOR_CELL } })).toBe(true);
    // …and it is the same fact the blueprint's approach is drawn from.
    expect(doorsConnect(open, SANCTUM_DOOR_CELL, 'N')).toBe(true);
  });

  /**
   * ROUND-13 BLOCKER: the boolean only ever spoke two of its three meanings.
   * `landing-sealed` — she is standing on (2,5) and the plan she drafted there
   * drew no north door — rendered as nothing at all: no hit target on the
   * blueprint, no ink, and both `/sanctum` and the journal telling her to climb
   * to the landing she was already standing on. The standing is three-valued
   * now, exported once, so no surface can invent a fourth answer.
   */
  it('distinguishes the sealed landing from being anywhere else (round 13)', () => {
    const base = createManor(11);
    // ROUND 17 (REVIEW_AA §5.2): a fresh manor stands her in the Entrance Hall,
    // and the Entrance Hall is where the speaking tube is bolted to the wall —
    // so the fresh standing is 'at-tube', not 'away'. That is the whole change:
    // she can address the Sanctum from the first cell of the first day. 'away'
    // still means what it always meant, and is asserted on a real elsewhere
    // below.
    expect(sanctumStanding(base)).toBe('at-tube');
    expect(sanctumStanding(null)).toBe('away');
    expect(onSanctumLanding(base)).toBe(false);
    // The tube is a mouth, not a door: it never makes her stand at the door.
    expect(atSanctumDoor(base)).toBe(false);
    expect(canAddressSanctum(base)).toBe(true);

    const sealed = placeRoom(base, room(SANCTUM_DOOR_CELL, ['S', 'E']));
    const standingSealed = { ...sealed, playerCell: { ...SANCTUM_DOOR_CELL } };
    expect(sanctumStanding(standingSealed)).toBe('landing-sealed');
    expect(onSanctumLanding(standingSealed)).toBe(true);
    expect(atSanctumDoor(standingSealed)).toBe(false);

    const open = placeRoom(base, room(SANCTUM_DOOR_CELL, ['S', 'N']));
    const standingOpen = { ...open, playerCell: { ...SANCTUM_DOOR_CELL } };
    expect(sanctumStanding(standingOpen)).toBe('at-door');
    expect(onSanctumLanding(standingOpen)).toBe(true);

    // Standing one storey down in a room that opens north is NOT the door:
    // the fact is about the landing cell, and only about it.
    const below = placeRoom(base, room({ col: 2, row: 4 }, ['N']));
    expect(sanctumStanding({ ...below, playerCell: { col: 2, row: 4 } })).toBe('away');
  });

  /**
   * ═══ REVIEW_AA §5.2, AS A TEST — THE SPEAKING TUBE ════════════════════════
   *
   * The review's measurement: *"first landing median day 18–21, 10–14% never
   * inside 45 days… Reviewer A deduced LACUNA on day 1 and was still stranded
   * at row 5 on day 3. SANCTUM_GUESS_COST is already 0 — the guess is free; the
   * walk is the wall."* Its "done looks like": *"The Sanctum door is addressable
   * from the Entrance Hall every day, at zero or near-zero step cost."*
   *
   * So: the tube IS the Entrance Hall — the cell a fresh manor already stands
   * her in, on day 1, before she has moved or drafted anything. No step is
   * charged because no move is made.
   */
  it('§5.2 — she can address the Sanctum from the hall on day 1, having walked nowhere', () => {
    const base = createManor(11);
    expect(SPEAKING_TUBE_CELL, 'the tube must be where every day already begins')
      .toEqual(ENTRANCE_CELL);
    expect(base.playerCell).toEqual(ENTRANCE_CELL);
    expect(atSpeakingTube(base)).toBe(true);
    expect(canAddressSanctum(base)).toBe(true);

    // …and it is still not the door. The climb keeps the ceremony: standing at
    // the tube is never 'at-door', so the win gate is untouched by this change.
    expect(atSanctumDoor(base)).toBe(false);
    expect(sanctumStanding(base)).toBe('at-tube');

    // Walk one cell off the hall and the tube is behind her — the mouth is a
    // PLACE, which is the ruling round 7 made about the door itself.
    const elsewhere = { ...base, playerCell: { col: 2, row: 4 } as Cell };
    expect(atSpeakingTube(elsewhere)).toBe(false);
    expect(canAddressSanctum(elsewhere)).toBe(false);
    expect(sanctumStanding(elsewhere)).toBe('away');

    // Both mouths answer to the one predicate, so "can she speak" cannot come
    // to mean two things (the defect that kept the door unreachable in r13).
    const open = placeRoom(base, room(SANCTUM_DOOR_CELL, ['S', 'N']));
    expect(canAddressSanctum({ ...open, playerCell: { ...SANCTUM_DOOR_CELL } })).toBe(true);
    const sealed = placeRoom(base, room(SANCTUM_DOOR_CELL, ['S', 'E']));
    expect(canAddressSanctum({ ...sealed, playerCell: { ...SANCTUM_DOOR_CELL } })).toBe(false);
  });

  it('shares ONE predicate for "this plan opens onto the Sanctum"', () => {
    // The card face, the blueprint and the economy simulation all read this,
    // so "this plan opens the door" cannot come to mean three things.
    expect(opensOntoSanctum(['S', 'N'], SANCTUM_DOOR_CELL)).toBe(true);
    expect(opensOntoSanctum(['S', 'E'], SANCTUM_DOOR_CELL)).toBe(false);
    // Only the landing can open onto the Sanctum, whatever else draws north.
    for (const cell of [{ col: 2, row: 4 }, { col: 0, row: 5 }, ENTRANCE_CELL] as Cell[]) {
      expect(opensOntoSanctum(['N', 'E', 'S', 'W'], cell)).toBe(false);
    }
    // …and the card-level form is exactly `resolveDoors` + that predicate, so
    // the stamp on the card and the doors the room ends up with are one
    // computation, never two.
    const manor = createManor(4242);
    for (const card of BASE_DECK) {
      for (const entry of DIRS) {
        expect(cardOpensOntoSanctum(card, entry, manor, SANCTUM_DOOR_CELL)).toBe(
          resolveDoors(card, entry, manor, SANCTUM_DOOR_CELL).includes('N'),
        );
      }
    }
  });

  /**
   * THE NUMBER THE WHOLE ROUND TURNED ON. Entering the landing from below,
   * only ~28% of the plans eligible up there place with a north door — so
   * "she stood on the landing" and "she reached the Sanctum" are not the same
   * event, and every 4.10d/e figure measured against the storey overstated
   * the reach by ~40%. Pinned here so a rotation or deck change moves a test.
   */
  it('measures how rarely a landing plan opens onto the Sanctum', () => {
    const manor = createManor(4242);
    const eligible = BASE_DECK.filter(
      (c) => c.tierRange[0] <= 3 && 3 <= c.tierRange[1]);
    expect(eligible.length).toBeGreaterThan(5);
    const opens = eligible.filter(
      (c) => cardOpensOntoSanctum(c, 'N', manor, SANCTUM_DOOR_CELL));
    const rate = opens.length / eligible.length;
    expect(rate, `unweighted P(opens north from below) = ${rate.toFixed(3)}`)
      .toBeGreaterThan(0.05);
    expect(rate).toBeLessThan(0.6);
  });
});

describe('doors & movement', () => {
  it('connects only matched door pairs', () => {
    let m = createManor(7);
    m = placeRoom(m, room({ col: 2, row: 1 }, ['S', 'E']));   // opens back down + east
    expect(doorsConnect(m, ENTRANCE_CELL, 'N')).toBe(true);
    expect(canMoveTo(m, { col: 2, row: 1 })).toBe(true);
    // east neighbour exists but has no matching W door
    m = placeRoom(m, room({ col: 3, row: 1 }, ['N']));
    expect(doorsConnect(m, { col: 2, row: 1 }, 'E')).toBe(false);
  });

  it('never moves through walls, diagonals, or empty cells', () => {
    const m = createManor(7);
    expect(canMoveTo(m, { col: 2, row: 1 })).toBe(false);   // empty cell
    expect(canMoveTo(m, { col: 3, row: 1 })).toBe(false);   // not adjacent
    expect(walkableNeighbors(m)).toEqual([]);
  });

  it('draft targets are exactly doors into empty in-bounds cells', () => {
    const m = createManor(7);
    const targets = draftTargets(m);
    // entrance doors N/E/W all face empty cells
    expect(targets.map((t) => t.dir).sort()).toEqual(['E', 'N', 'W']);
    const m2 = placeRoom(m, room({ col: 2, row: 1 }, ['S']));
    const after = draftTargets(m2).map((t) => t.dir).sort();
    expect(after).toEqual(['E', 'W']); // N now occupied
    void m2;
  });
});

describe('dead doors', () => {
  it('flags outer-wall doors and blank neighbour walls, not empty cells', () => {
    let m = createManor(3);
    const west = room({ col: 0, row: 1 }, ['W', 'E', 'N']);
    m = placeRoom(m, west);
    // W faces the outer wall → dead; E and N face empty cells → alive
    expect(deadDoors(west, m)).toEqual(['W']);
    // place a doorless-facing neighbour: its wall kills the E door
    m = placeRoom(m, room({ col: 1, row: 1 }, ['N']));
    expect(deadDoors(west, m)).toEqual(['W', 'E']);
  });

  it('placeRoom refuses an occupied cell', () => {
    const m = createManor(3);
    expect(() => placeRoom(m, room(ENTRANCE_CELL, ['N']))).toThrow();
  });
});

/**
 * ── ORIENTATION IS THE HEADING SHE WALKED IN ON (round-9 owner defect) ─────
 *
 * OWNER: "issues with the orientation of placement of rooms… they should be
 * determined by the direction I'm facing when I enter the room."
 *
 * The convention (engine/manor/grid.ts THE ORIENTATION CONVENTION): the card's
 * `'N'` is the door she walks in through; the whole plan turns rigidly to put
 * it on that wall. Pure function of (layout, entryDir) — no rng, no scoring,
 * no choosing among rotations.
 *
 * TWO ASSERTIONS WERE DELETED HERE, deliberately, and neither was coverage of
 * anything that still exists:
 *   - "orientationsOf sweeps all four walls without duplicates" — the helper
 *     itself is gone. It existed only to ENUMERATE rotations so the resolver
 *     could pick among them; with the turn determined there is nothing to
 *     enumerate.
 *   - "prefers rotations that keep paths flowing (most live doors)" — that IS
 *     the defect. It asserted that a corner entered from the west comes out
 *     opening north because south would have been dead, i.e. that the game
 *     re-aims her room for her. It is now replaced by the far stronger
 *     `orientLayout` table below, which pins all four headings exactly.
 * The guarantee those tests were guarding — a door on the entry wall, always,
 * from every cell (AAA 4.4) — is kept and widened below.
 */
describe('orientation at placement', () => {
  it('turns the plan so the layout N meets the wall she came through', () => {
    // The whole convention, in a table. A corner entered walking north always
    // opens west; walking east, always north. Every time, on every day.
    const CORNER: Dir[] = ['N', 'E'];
    expect(orientLayout(CORNER, 'N')).toEqual(['S', 'W']);
    expect(orientLayout(CORNER, 'E')).toEqual(['N', 'W']);
    expect(orientLayout(CORNER, 'S')).toEqual(['N', 'E']);
    expect(orientLayout(CORNER, 'W')).toEqual(['E', 'S']);

    const TEE: Dir[] = ['N', 'E', 'W'];
    expect(orientLayout(TEE, 'N')).toEqual(['E', 'S', 'W']);
    expect(orientLayout(TEE, 'E')).toEqual(['N', 'S', 'W']);
    expect(orientLayout(TEE, 'S')).toEqual(['N', 'E', 'W']);
    expect(orientLayout(TEE, 'W')).toEqual(['N', 'E', 'S']);

    // …and the degenerate shapes behave the same way.
    expect(orientLayout(['N'], 'N')).toEqual(['S']);
    expect(orientLayout(['N'], 'W')).toEqual(['E']);
    expect(orientLayout(['N', 'S'], 'E')).toEqual(['E', 'W']);
    expect(orientLayout(['N', 'E', 'S', 'W'], 'N')).toEqual(['N', 'E', 'S', 'W']);
  });

  it('is a rigid turn: the shape is preserved, only the compass moves', () => {
    const layouts: Dir[][] = [
      ['N'], ['N', 'S'], ['N', 'E'], ['N', 'E', 'W'], ['N', 'E', 'S', 'W'],
    ];
    for (const layout of layouts) {
      for (const entryDir of DIRS) {
        const turned = orientLayout(layout, entryDir);
        expect(turned).toHaveLength(layout.length);
        // Every door moved by the SAME number of quarter-turns.
        const turns = turnsBetween('N', opposite(entryDir));
        expect(turned.slice().sort()).toEqual(
          layout.map((d) => rotateDirBy(d, turns)).sort(),
        );
      }
    }
  });

  it('is a PURE function: same inputs, same doors, no rng anywhere', () => {
    const card = testCard([['N', 'E'], ['N', 'E', 'W']]);
    const m = createManor(11);
    for (const entryDir of DIRS) {
      for (let col = 0; col < MANOR_COLS; col++) {
        for (let row = 0; row < MANOR_ROWS; row++) {
          const cell: Cell = { col: col as Cell['col'], row };
          if (roomAt(m, cell)) continue;
          const first = resolveDoors(card, entryDir, m, cell);
          for (let i = 0; i < 5; i++) {
            expect(resolveDoors(card, entryDir, m, cell)).toEqual(first);
          }
          // …and it does not depend on what is standing around it. The old
          // resolver scored neighbours; this one must not even look.
          let crowded = placeRoom(m, room({ col: 2, row: 1 }, ['N', 'E', 'S', 'W']));
          if (!roomAt(crowded, { col: 1, row: 1 })) {
            crowded = placeRoom(crowded, room({ col: 1, row: 1 }, ['N']));
          }
          if (!roomAt(crowded, cell)) {
            expect(resolveDoors(card, entryDir, crowded, cell)).toEqual(first);
          }
        }
      }
    }
  });

  it('picks a multi-layout card deterministically, per day and per cell', () => {
    const card = testCard([['N'], ['N', 'E'], ['N', 'E', 'W']]);
    // Stable for a given (day, cell, card) — a reroll cannot reshape the room.
    for (let seed = 0; seed < 30; seed++) {
      for (const key of ['1,1', '3,4', '2,5']) {
        const first = layoutFor(card, seed, key);
        expect(layoutFor(card, seed, key)).toBe(first);
        expect(card.doorLayouts).toContain(first);
      }
    }
    // …and it is a real choice, not a constant: over the manor's cells and a
    // spread of days every authored layout is used.
    const used = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      for (let col = 0; col < MANOR_COLS; col++) {
        for (let row = 0; row < MANOR_ROWS; row++) {
          used.add(layoutFor(card, seed, cellKey({ col: col as Cell['col'], row })).join(''));
        }
      }
    }
    expect(used.size).toBe(3);
    // A single-layout card is that layout, always.
    expect(layoutFor(testCard([['N', 'S']]), 99, '2,2')).toEqual(['N', 'S']);
  });

  it('always keeps a door on the entry wall — every card placeable (AAA 4.4)', () => {
    const layouts: Dir[][][] = [
      [['N']], [['N', 'S']], [['N', 'E']], [['N', 'E', 'W']], [['N', 'E', 'S', 'W']],
      [['N'], ['N', 'E']],
      // …and the defensive cases: a layout authored with no 'N' at all, and
      // an empty one. Neither can happen from the shipped deck; both must
      // still place, because an offer is never unplaceable.
      [['E', 'S']], [[]],
    ];
    for (let seed = 0; seed < 8; seed++) {
      const m = createManor(seed);
      for (const doorLayouts of layouts) {
        for (const entryDir of DIRS) {
          for (let col = 0; col < MANOR_COLS; col++) {
            for (let row = 0; row < MANOR_ROWS; row++) {
              const cell: Cell = { col: col as Cell['col'], row };
              if (roomAt(m, cell)) continue;
              const doors = resolveDoors(testCard(doorLayouts), entryDir, m, cell);
              expect(doors).toContain(opposite(entryDir));
              // Placement itself must always succeed.
              expect(() => placeRoom(m, room(cell, doors))).not.toThrow();
            }
          }
        }
      }
    }
  });

  /**
   * ── THE ACCEPTED CONSEQUENCE, MEASURED ───────────────────────────────────
   *
   * A rigid turn means a drafted room's other doors can land on the outer wall
   * or on a neighbour's blank plaster, and the room seals itself. That is the
   * Blue Prince tension the owner asked for and it is NOT a bug — it is what
   * makes the draft a decision. But it is a design number, so it is measured
   * and pinned rather than assumed. Three rates, because they say different
   * things to a design owner:
   *
   *   (a) 32.0% — geometry: every card, every empty cell of a fresh manor,
   *       every heading. Dominated by the deck's one-door plans, which seal by
   *       definition. This is the shape of the DECK, not of a day.
   *   (b) 27.2% — in play, choosing blind. What she would suffer if the card
   *       face still lied.
   *   (c) 7.6% — in play, reading the diagram and preferring an onward door.
   *       This is the rate that ships, and it is EXACTLY the rate at which an
   *       offer contains no onward-door card at all — i.e. once the card tells
   *       the truth, she seals a room only when the house gave her nothing
   *       else, which is the honest version of the tension.
   *
   * If (c) drifts far from (a)−(b), the card face has stopped informing the
   * choice and something upstream has regressed.
   *
   * ── ROUND 20 (REVIEW_AA §5.7) — ALL THREE MOVED, ON PURPOSE ──────────────
   * They read 41.5% / 37.3% / 13.6% before the deck rebalance
   * (engine/manor/deck.ts, ROUND-20 REBALANCE). Seven cards could only ever be
   * a dead end and thirty-two per cent of the deck's plans were one; three can
   * and twenty per cent are. What the three numbers say about the change is the
   * point of keeping all three: the DECK got a fifth less sealing (a), a blind
   * player a quarter less (b), and a player who reads the card face **nearly
   * half** as much (c) — because the rebalance did not only remove dead ends,
   * it gave the offer something else to contain. The gap (b) − (c) is the value
   * of the honest card face and it grew from 24 points to 20 points of a much
   * smaller total: reading the diagram now avoids 72% of the seals a blind
   * player eats, against 63% before.
   */
  it('THE ACCEPTED CONSEQUENCE (a): the deck seals ~32% of placements by shape', () => {
    let sealed = 0, total = 0;
    const byShape = new Map<string, { sealed: number; total: number }>();
    for (let seed = 0; seed < 12; seed++) {
      const m = createManor(seed);
      for (const card of BASE_DECK) {
        for (let col = 0; col < MANOR_COLS; col++) {
          for (let row = 0; row < MANOR_ROWS; row++) {
            const cell: Cell = { col: col as Cell['col'], row };
            if (roomAt(m, cell)) continue;
            if (rowTier(row) < card.tierRange[0] || rowTier(row) > card.tierRange[1]) continue;
            for (const entryDir of DIRS) {
              const doors = resolveDoors(card, entryDir, m, cell);
              const seals = sealsItself(doors, entryDir, m, cell);
              total += 1;
              if (seals) sealed += 1;
              // ROUND 20: keyed by the CANONICAL PLAN, not by its door count —
              // the deck now holds two three-door shapes with opposite
              // properties (a tee can never seal, a fork can), and a count
              // buries the difference the rebalance was made of.
              const shape = [...layoutFor(card, seed, cellKey(cell))].sort().join('');
              const bucket = byShape.get(shape) ?? { sealed: 0, total: 0 };
              bucket.total += 1;
              if (seals) bucket.sealed += 1;
              byShape.set(shape, bucket);
            }
          }
        }
      }
    }
    expect(sealed / total).toBeCloseTo(0.320, 2);
    // A one-door plan always seals — it has no other door to offer. A tee and
    // a cross never can: their remaining doors point three ways and at most
    // two walls of a cell are outer walls.
    expect(byShape.get('N')!.sealed / byShape.get('N')!.total).toBe(1);
    expect(byShape.get('ENW')!.sealed).toBe(0);
    expect(byShape.get('ENSW')!.sealed).toBe(0);
    // A FORK (round 20) is the interesting middle: it carries on AND branches,
    // but its two onward doors are adjacent rather than opposed, so a fork laid
    // into a CORNER of the plot can still turn its back on the house. That is
    // the shape doing real work — it is not free, it is just usually right.
    for (const fork of ['ENS', 'NSW']) {
      const bucket = byShape.get(fork);
      if (!bucket) continue;
      expect(bucket.sealed / bucket.total).toBeLessThan(0.2);
    }
  });

  it('THE ACCEPTED CONSEQUENCE (b,c): reading the card face is what pays', () => {
    /** One simulated day: draft from the room she stands in, `blind` or not. */
    const play = (blind: boolean) => {
      let sealed = 0, total = 0, starved = 0;
      for (let seed = 0; seed < 200; seed++) {
        let manor = createManor(seed);
        const rng = createRng(seed ^ (blind ? 0xabcdef : 0x13579));
        for (let draft = 0; draft < 10; draft++) {
          const open = draftTargets(manor);
          if (open.length === 0) break;
          const at = open[randInt(rng, open.length)]!;
          const cards = rollCards(deckFor([]), manor, at.cell, {
            gems: 2, declinedLastDraft: [], drawIndex: 0,
          });
          if (cards.length === 0) break;
          const onward = cards.find(
            (c) => !sealsItself(resolveDoors(c, at.dir, manor, at.cell), at.dir, manor, at.cell));
          if (!onward) starved += 1;
          const card = blind ? cards[randInt(rng, cards.length)]! : (onward ?? cards[0]!);
          const doors = resolveDoors(card, at.dir, manor, at.cell);
          total += 1;
          if (sealsItself(doors, at.dir, manor, at.cell)) sealed += 1;
          manor = {
            ...placeRoom(manor, room(at.cell, doors, { cardId: card.id })),
            playerCell: { ...at.cell },
          };
        }
      }
      return { rate: sealed / total, starved: starved / total };
    };
    const blind = play(true);
    const reading = play(false);
    expect(blind.rate).toBeCloseTo(0.272, 2);
    expect(reading.rate).toBeCloseTo(0.076, 2);
    // The card face is worth most of the dead ends (round 20: was "a third").
    expect(reading.rate).toBeLessThan(blind.rate * 0.35);
    // …and what is left is very nearly just the offers that held nothing else.
    expect(reading.rate - reading.starved).toBeLessThan(0.03);
  });
});

/**
 * ── THE CARD MUST SHOW THE TRUTH (round-9) ────────────────────────────────
 *
 * The draft card's door diagram used to draw `card.doorLayouts[0]`,
 * PRE-ROTATION — right at one door out of four by luck, and the wrong LAYOUT
 * entirely for any card carrying more than one. A round-5 critic called it a
 * lie by omission; with orientation now rigid it is the whole decision, so it
 * is driven live here: render the real modal, read the ink back out of the
 * DOM, and compare it to what `resolveDoors` will place.
 */
const DOOR_TICKS: Record<string, Dir> = {
  'M12 1v5': 'N', 'M23 12h-5': 'E', 'M12 23v-5': 'S', 'M1 12h5': 'W',
};

/** Every door diagram in a rendered modal, as the Dirs it actually draws. */
function diagramsIn(html: string): { doors: Dir[]; entry: Dir | null; label: string }[] {
  return [...html.matchAll(/<svg[^>]*class="bp-doorsdiag"[\s\S]*?<\/svg>/g)].map((m) => {
    const svg = m[0];
    const label = /aria-label="([^"]*)"/.exec(svg)?.[1] ?? '';
    const doors: Dir[] = [];
    let entry: Dir | null = null;
    for (const p of svg.matchAll(/<path([^>]*)\/?>/g)) {
      const attrs = p[1]!;
      const d = /\bd="([^"]*)"/.exec(attrs)?.[1] ?? '';
      const dir = DOOR_TICKS[d];
      if (!dir) continue;
      doors.push(dir);
      if (attrs.includes('bp-doorsdiag__door--entry')) entry = dir;
    }
    return { doors, entry, label };
  });
}

/**
 * The growth line each card PRINTS — the round-29 answer to COMPREHENSION
 * wrong-belief 7. One per card, in card order: either the door-plan sentence or
 * the sealing stamp, whichever the card chose to show.
 */
function growthLinesIn(html: string): string[] {
  return [...html.matchAll(/class="bp-card__(?:doors|seals)">([^<]*)</g)].map((m) => m[1]!);
}

/**
 * THE WAYS ON, COMPUTED INDEPENDENTLY OF THE PRODUCTION CODE.
 *
 * Deliberately NOT `onwardDoors` — the whole point of the gate is that the
 * words on the card are checked against a second opinion. Walks the manor's own
 * room map by hand, with its own compass tables, so a wrong turn, a wrong
 * `opposite`, or a card face built from bare geometry instead of the live
 * neighbours all show up as a failure rather than as agreement with itself.
 */
function waysOnIndependently(
  doors: readonly Dir[], atDoor: Dir, manor: ManorState, cell: Cell,
): Dir[] {
  const OPP: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const STEP: Record<Dir, [number, number]> = {
    N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0],
  };
  const cameInThrough = OPP[atDoor];
  return doors.filter((dir) => {
    if (dir === cameInThrough) return false;
    const [dc, dr] = STEP[dir];
    const col = cell.col + dc, row = cell.row + dr;
    if (col < 0 || col >= MANOR_COLS || row < 0 || row >= MANOR_ROWS) return false;
    const there = manor.rooms[`${col},${row}`];
    return !there || there.doors.includes(OPP[dir]);
  });
}

const DIR_WORD: Record<Dir, string> = { N: 'north', E: 'east', S: 'south', W: 'west' };
const WAYS_WORD = ['', 'One way on', 'Two ways on', 'Three ways on'];

describe('the draft card draws the room it will actually place', () => {
  const from: Cell = { col: 2, row: 3 };

  function modalFor(manor: ManorState, atDoor: Dir, cards: RoomCard[]): string {
    // `manor` is handed in rather than pushed into the store: zustand's server
    // snapshot reports the store's INITIAL state, so a static render would
    // silently see `manor: null` and the diagrams would be measured against a
    // house that is not the one under test. The live-store path is exercised
    // for real by the Playwright pass in docs/shots/round9/orientation.
    return renderToStaticMarkup(createElement(DraftModal, {
      offer: { atDoor, from, cards, rerolled: false },
      gems: 4,
      keyCost: 0,
      manor,
      onChoose: () => {}, onReroll: () => {}, onCancel: () => {},
    }));
  }

  it('matches resolveDoors exactly, from all four headings, for the real deck', () => {
    const base = createManor(4242);
    const manor: ManorState = {
      ...base,
      rooms: { ...base.rooms, [cellKey(from)]: room(from, ['N', 'E', 'S', 'W']) },
      playerCell: { ...from },
    };
    // Multi-layout cards are the ones the old diagram got most wrong.
    const cards = ['darkroom', 'linen-closet', 'counting-house']
      .map((id) => BASE_DECK.find((c) => c.id === id)!);
    for (const atDoor of DIRS) {
      const target = neighbor(from, atDoor)!;
      const drawn = diagramsIn(modalFor(manor, atDoor, cards));
      expect(drawn).toHaveLength(cards.length);
      cards.forEach((card, i) => {
        // THE assertion: ink === placement, for the door she is standing at.
        expect(drawn[i]!.doors).toEqual(resolveDoors(card, atDoor, manor, target));
        // …and the door at her feet is the one picked out in gilt.
        expect(drawn[i]!.entry).toBe(opposite(atDoor));
      });
      // The wall she came through is named ONCE, above the three cards, since
      // round 31 — it is the same wall on all three, and each card's own line
      // is now spent on the thing that differs (where it lets her go next).
      expect(modalFor(manor, atDoor, cards))
        .toContain(`at your feet — the ${DIR_WORD[opposite(atDoor)]} wall`);
    }
  });

  it('says out loud when a plan seals itself, and when it does not', () => {
    const base = createManor(7);
    const manor: ManorState = {
      ...base,
      rooms: { ...base.rooms, [cellKey(from)]: room(from, ['N', 'E', 'S', 'W']) },
      playerCell: { ...from },
    };
    const deadEnd = BASE_DECK.find((c) => c.id === 'larder')!;      // ['N'] only
    const cross = BASE_DECK.find((c) => c.id === 'long-gallery')!;  // all four
    const html = modalFor(manor, 'N', [deadEnd, cross]);
    const drawn = diagramsIn(html);
    const said = growthLinesIn(html);
    expect(drawn[0]!.doors).toEqual(['S']);
    expect(said[0]).toContain('Seals itself');
    expect(drawn[1]!.doors).toEqual(['N', 'E', 'S', 'W']);
    expect(said[1]).toBe('Three ways on — north, east and west');
  });

  /**
   * ═══ ROUND 31 GATE — THE CARD SAYS, IN WORDS, WHETHER THE CLIMB SURVIVES ══
   *
   * COMPREHENSION wrong-belief 7 is the most expensive miss in the blind-play
   * test and the one nobody had ever been given a number for: the NYT player
   * chose on "anchor" for two consecutive days, dead-ended both climbs, and
   * named it as the single thing she never cracked. The plan WAS on the card —
   * as 32px of ink and an `aria-label`, beside a loud bold line naming the
   * wrong attribute.
   *
   * THIS GATE CANNOT PASS BY CONSTRUCTION (standing rule 1). It never calls
   * `onwardDoors`, `sealsItself` or `doorPlanWords`; it walks the manor's room
   * map with its own compass tables and its own count words, and it condemns
   * the pool the old card face was drawn from — bare geometry, doors minus the
   * entry wall, which is right only where every neighbour happens to be open.
   * Proved red before it was allowed to go green: with the card face built from
   * `doorsOf(card).filter(d => d !== entryWall)` it lies on 11 of the 112
   * offers below — every one of them a plan with a door onto the outer wall or
   * onto the blank plaster of the neighbour placed at (1,4) — and the run stops
   * at the first, `long-gallery` entered from the west, which claims three ways
   * on where there are two.
   */
  it('states the ways on, in words, for every card in the deck at every heading', () => {
    const base = createManor(31337);
    const manor: ManorState = {
      ...base,
      rooms: {
        ...base.rooms,
        [cellKey(from)]: room(from, ['N', 'E', 'S', 'W']),
        // A neighbour with a blank wall facing us: the case bare geometry gets
        // wrong. Its only door faces east, so the target's west door is dead.
        [cellKey({ col: 1, row: 4 })]: room({ col: 1, row: 4 }, ['E']),
      },
      playerCell: { ...from },
    };
    let deadEnds = 0, ways = 0;
    for (const atDoor of DIRS) {
      const target = neighbor(from, atDoor)!;
      for (const card of BASE_DECK) {
        const html = modalFor(manor, atDoor, [card]);
        const said = growthLinesIn(html);
        expect(said, `${card.id} @${atDoor}`).toHaveLength(1);
        const line = said[0]!;
        const truth = waysOnIndependently(
          resolveDoors(card, atDoor, manor, target), atDoor, manor, target,
        );
        if (truth.length === 0) {
          deadEnds++;
          // A dead end is never left as flavour: it says it is one AND what
          // the manor pays for it (wrong-belief 8).
          expect(line, `${card.id} @${atDoor}`).toContain('no way on from here');
          expect(line, `${card.id} @${atDoor}`).toContain('+1 gem');
        } else {
          ways++;
          expect(line, `${card.id} @${atDoor}`).toContain(WAYS_WORD[truth.length]!);
          for (const dir of DIRS) {
            const named = line.includes(DIR_WORD[dir]);
            expect(named, `${card.id} @${atDoor} names ${DIR_WORD[dir]}`)
              .toBe(truth.includes(dir));
          }
        }
      }
    }
    // Both arms of the gate were actually exercised — a run that met no dead
    // end would have proved only half of it.
    expect(deadEnds).toBeGreaterThan(0);
    expect(ways).toBeGreaterThan(0);
  });
});

describe('seed streams', () => {
  it('hashSeed is deterministic and separates cells and draw indices', () => {
    expect(hashSeed(123, '2,3', 0)).toBe(hashSeed(123, '2,3', 0));
    expect(hashSeed(123, '2,3', 0)).not.toBe(hashSeed(123, '2,3', 1));
    expect(hashSeed(123, '2,3', 0)).not.toBe(hashSeed(123, '3,2', 0));
    expect(hashSeed(124, '2,3', 0)).not.toBe(hashSeed(123, '2,3', 0));
  });

  it('roomSeed matches RoomHost stream shape: stable per day+cell, distinct across cells', () => {
    expect(roomSeed(77, '1,4')).toBe(roomSeed(77, '1,4'));
    expect(roomSeed(77, '1,4')).not.toBe(roomSeed(77, '4,1'));
    expect(roomSeed(78, '1,4')).not.toBe(roomSeed(77, '1,4'));
  });
});

describe('Dewey', () => {
  it('naps in a deterministic draftable cell, never the entrance or sanctum', () => {
    for (let seed = 0; seed < 200; seed++) {
      const den = deweyCell(seed);
      expect(deweyCell(seed)).toEqual(den);
      expect(inBounds(den.col, den.row)).toBe(true);
      expect(sameCell(den, ENTRANCE_CELL)).toBe(false);
      expect(sameCell(den, SANCTUM_CELL)).toBe(false);
    }
  });

  it('moves house across days', () => {
    const cells = new Set<string>();
    for (let seed = 0; seed < 50; seed++) cells.add(cellKey(deweyCell(seed)));
    expect(cells.size).toBeGreaterThan(5);
  });
});

describe('a walkable manor end-to-end', () => {
  it('supports a full climb from entrance to the sanctum landing', () => {
    let m: ManorState = createManor(21);
    // draft a corridor spine up the middle column
    for (let row = 1; row <= 5; row++) {
      m = placeRoom(m, room({ col: 2, row }, ['N', 'S'], { cardId: `corridor-${row}` }));
    }
    for (let row = 1; row <= 5; row++) {
      const target: Cell = { col: 2, row };
      expect(canMoveTo(m, target)).toBe(true);
      m = { ...m, playerCell: target };
    }
    // the landing connects to the sanctum's sealed S door
    expect(doorsConnect(m, m.playerCell, 'N')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Padlocks (engine/manor/locks.ts) — AAA 4.6 / 4.10d
// ---------------------------------------------------------------------------

describe('padlocked doors: the gate on the upper storeys', () => {
  it('never locks the lower half of the house, always can lock the top', () => {
    for (const row of [0, 1, 2, 3]) expect(rowCanLock(row)).toBe(false);
    for (const row of [4, 5, 6]) expect(rowCanLock(row)).toBe(true);
    const m = createManor(2);
    for (let seed = 0; seed < 120; seed++) {
      const manor = { ...m, daySeed: seed };
      for (let col = 0; col < MANOR_COLS; col++) {
        for (const row of [0, 1, 2, 3]) {
          expect(isDoorLocked(manor, { col: col as Cell['col'], row })).toBe(false);
        }
      }
    }
  });

  it('answers the same for a door all day long (never a surprise, AAA 4.6)', () => {
    const manor = createManor(2);
    for (const cell of [{ col: 0, row: 4 }, { col: 2, row: 5 }, { col: 4, row: 6 }] as Cell[]) {
      const first = isDoorLocked(manor, cell);
      for (let i = 0; i < 8; i++) expect(isDoorLocked(manor, cell)).toBe(first);
    }
  });

  it('locks the DRAFT, never the corridor: a placed room is always open', () => {
    let m = createManor(2);
    const cell: Cell = { col: 2, row: 4 };
    expect(isDoorLocked(m, cell)).toBe(true);       // seed 2 padlocks 2,4
    m = placeRoom(m, room(cell, ['N', 'S']));
    expect(isDoorLocked(m, cell)).toBe(false);      // …and once drafted, open
  });

  it('lands the published rates over many days (a tuning number, not an accident)', () => {
    for (const row of [4, 5, 6]) {
      let locked = 0, n = 0;
      for (let seed = 0; seed < 400; seed++) {
        const manor = { ...createManor(seed * 2654435761), daySeed: seed * 2654435761 };
        for (let col = 0; col < MANOR_COLS; col++) {
          const cell: Cell = { col: col as Cell['col'], row };
          if (roomAt(manor, cell)) continue;   // the sealed sanctum sits at 2,6
          n += 1;
          if (isDoorLocked(manor, cell)) locked += 1;
        }
      }
      expect(locked / n).toBeCloseTo(DOOR_LOCKS.chanceByRow[row]!, 1);
    }
  });

  it('opens for a key and refuses without one', () => {
    const manor = createManor(2);
    const shut: Cell = { col: 2, row: 4 };
    expect(isDoorLocked(manor, shut)).toBe(true);
    expect(canOpenDoor(manor, shut, 0)).toBe(false);
    expect(canOpenDoor(manor, shut, KEY_COST)).toBe(true);
    // an ordinary ground-floor door never asks for anything
    expect(canOpenDoor(manor, { col: 1, row: 2 }, 0)).toBe(true);
  });

  it('annotates the doors at her feet, so the draft flow can price them', () => {
    let m = createManor(2);
    m = placeRoom(m, room({ col: 2, row: 3 }, ['N', 'S']));
    m = { ...m, playerCell: { col: 2, row: 3 } };
    const targets = lockedDraftTargets(m);
    expect(targets.map((t) => t.dir).sort()).toEqual(['N', 'S']);
    const up = targets.find((t) => t.dir === 'N')!;
    const down = targets.find((t) => t.dir === 'S')!;
    expect(up.locked).toBe(true);
    expect(up.keyCost).toBe(KEY_COST);
    expect(down.locked).toBe(false);              // row 2 never locks
    expect(down.keyCost).toBe(0);
  });
});

describe('padlocks are VISIBLE before a step is spent toward them (AAA 4.6)', () => {
  it('draws every gate on the frontier she is standing at', () => {
    let m = createManor(2);
    m = placeRoom(m, room({ col: 2, row: 3 }, ['N', 'S']));
    m = { ...m, playerCell: { col: 2, row: 3 } };
    const seen = visibleLocks(m).map((l) => cellKey(l.cell));
    // she stands on row 3; the padlock on the row-4 cell above her is drawn
    expect(seen).toContain('2,4');
    for (const l of visibleLocks(m)) expect(l.locked).toBe(true);
  });

  it('opens up a whole storey once she has a room standing on it', () => {
    let m = createManor(2);
    m = placeRoom(m, room({ col: 2, row: 4 }, ['N', 'E', 'W']));
    m = { ...m, playerCell: { col: 2, row: 4 } };
    const seen = new Set(visibleLocks(m).map((l) => cellKey(l.cell)));
    for (let col = 0; col < MANOR_COLS; col++) {
      const cell: Cell = { col: col as Cell['col'], row: 4 };
      if (col === 2) continue;                       // her own room
      expect(seen.has(cellKey(cell))).toBe(isDoorLocked(m, cell));
    }
  });

  it('never draws a padlock on a cell that already holds a room, or on a safe row', () => {
    let m = createManor(2);
    for (let row = 1; row <= 4; row++) m = placeRoom(m, room({ col: 2, row }, ['N', 'S']));
    for (const l of visibleLocks(m)) {
      expect(roomAt(m, l.cell)).toBeUndefined();
      expect(l.cell.row).toBeGreaterThanOrEqual(4);
    }
  });

  it('does not show the empty top of the house from the ground floor', () => {
    // A fresh manor: entrance at the bottom, the sealed sanctum at the top,
    // nothing else. Row 6 is 80% locked, but standing on the front step is no
    // way to read that landing — the only padlock a new day can show is the
    // one on the sanctum's own door, and only if it rolled locked.
    for (let seed = 0; seed < 60; seed++) {
      const m = createManor(seed);
      const seen = visibleLocks(m).map((l) => cellKey(l.cell));
      expect(seen.every((k) => k === '2,5')).toBe(true);
      expect(seen.length).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// ROUND-5 AUDIT — the price of a step must be legible BEFORE it is charged
// ---------------------------------------------------------------------------

/**
 * The finding, in one line: `MOVE_COST_BY_ROW` ranges −1..−5 and nothing in
 * the live UI named it. The sheet drew tier bands that said "graver" and walk
 * targets carried the raw cell key as their accessible name (`Walk 2,5`), so
 * on the upper storeys a single mis-tap spent 5 of an 18-step budget with no
 * pre-commit signal, no confirmation and no undo (AAA 4.6). These tests render
 * the real sheet and read every priced target's ink and label back.
 */
function sheetFor(playerRow: number, keys: number): string {
  const base = createManor(0xBEEF);
  const landing: PlacedRoom = {
    cardId: 'gallery', cell: { col: 1, row: playerRow }, doors: ['N', 'E', 'S', 'W'],
    solved: true, kind: 'twistle',
  };
  const withNeighbour: PlacedRoom = {
    cardId: 'library', cell: { col: 0, row: playerRow }, doors: ['N', 'E', 'S', 'W'],
    solved: false, kind: 'word-web',
  };
  const manor: ManorState = {
    ...base,
    rooms: {
      ...base.rooms,
      [`1,${playerRow}`]: landing,
      [`0,${playerRow}`]: withNeighbour,
    },
    playerCell: { col: 1, row: playerRow },
  };
  return renderToStaticMarkup(createElement(BlueprintSheet, {
    manor, canEnterCurrent: false, interactive: true, keys,
    onMove: () => {}, onOpenDraft: () => {}, onEnterRoom: () => {}, onSanctum: () => {},
  }));
}

const labelsOf = (html: string) =>
  [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]!);

describe('the blueprint names its prices (AAA 4.6 / 4.9 / 4.10)', () => {
  it('carries a rate card: one −N per row, straight from moveAt', () => {
    const html = sheetFor(2, 2);
    for (let row = 0; row < MANOR_ROWS; row++) {
      expect(html).toContain(`>${priceStamp(row)}<`);
    }
    // …and the numbers on the sheet ARE the ledger's numbers.
    expect(priceStamp(0)).toBe(`−${-moveAt(0)}`);
    expect(priceStamp(6)).toBe(`−${-moveAt(6)}`);
  });

  /**
   * ═══ ROUND 31 GATE — THE MARGIN IS NOT MUTE (COMPREHENSION 15) ═══════════
   *
   * A critic captured every word of visible text on the blueprint and came back
   * with the wing names, "ONE ROOM", the title block, and a BARE UNHEADED
   * COLUMN reading −2 −2 −2 −2 −7 −9 −9. Both the rate card and the tier pips
   * carried `aria-hidden="true"`, so not even a screen reader could ask what
   * they were; the pips were bare `path`s with no text at all.
   *
   * The condemned pool is exactly that markup, and this goes red on it: it
   * finds each mark's group in the rendered sheet and demands a spoken name,
   * not an `aria-hidden`. The rate card's name must quote EVERY price `moveAt`
   * charges (so a hand-typed sentence drifting from the table fails), and each
   * pip band must say its own numeral.
   */
  it('speaks its margin: the rate card and the tier pips both name themselves', () => {
    const html = sheetFor(2, 2);
    const groupOf = (cls: string) =>
      [...html.matchAll(new RegExp(`<g class="${cls}"[^>]*>`, 'g'))].map((m) => m[0]);

    const rate = groupOf('bp-rowprice');
    expect(rate).toHaveLength(1);
    expect(rate[0]).not.toContain('aria-hidden');
    const rateName = /aria-label="([^"]*)"/.exec(rate[0]!)?.[1] ?? '';
    // The column speaks as the price BANDS it actually is, so the runs are
    // re-derived here from `moveAt` — a second opinion, not the same call.
    const bands: { from: number; to: number; cost: number }[] = [];
    for (let row = 0; row < MANOR_ROWS; row++) {
      const cost = -moveAt(row);
      const last = bands[bands.length - 1];
      if (last && last.cost === cost) last.to = row;
      else bands.push({ from: row, to: row, cost });
    }
    for (const band of bands) {
      expect(rateName, `band at row ${band.from}`).toContain(`${band.cost} steps`);
      expect(rateName, `band at row ${band.from}`).toContain(rowName(band.from));
      expect(rateName, `band at row ${band.to}`).toContain(rowName(band.to));
    }
    // …and it says nothing MORE than the bands: one price clause per band.
    expect(rateName.match(/ steps/g) ?? []).toHaveLength(bands.length);

    const pips = groupOf('bp-tierpips');
    expect(pips).toHaveLength(3);
    ['I', 'II', 'III'].forEach((numeral, i) => {
      expect(pips[i]).not.toContain('aria-hidden');
      const name = /aria-label="([^"]*)"/.exec(pips[i]!)?.[1] ?? '';
      expect(name).toContain(`tier ${numeral} puzzles`);
      expect(name).toContain(`${i + 1} diamond`);
    });

    // …and the column is headed on the glass too, in the word every card uses.
    expect(html).toContain('class="bp-margin__head"');
    expect(html).toMatch(/class="bp-margin__head"[^>]*>TIER</);
  });

  it('gives every walk target a spoken price, never a grid coordinate', () => {
    for (const row of [0, 2, 4, 5]) {
      const html = sheetFor(row, 2);
      const walks = labelsOf(html).filter((l) => l.startsWith('Walk'));
      expect(walks.length).toBeGreaterThan(0);
      for (const label of walks) {
        expect(label).not.toMatch(/\d,\d/);                 // no "Walk 2,5"
        // Exactly one of the manor's row labels is the right one — assert the
        // label is a price-bearing sentence for SOME row, and that the row it
        // names and the price it quotes agree with moveAt.
        const named = Array.from({ length: MANOR_ROWS }, (_, r) => r)
          .filter((r) => label === walkLabel(r));
        expect(named).toHaveLength(1);
        expect(label).toContain(priceWords(named[0]!));
      }
    }
  });

  it('gives every draft target both of its prices: the look and the climb', () => {
    for (const row of [0, 2, 4]) {
      const html = sheetFor(row, 2);
      const drafts = labelsOf(html).filter(
        (l) => l.startsWith('Draft') || l.startsWith('Unlock') || l.startsWith('Padlocked'));
      expect(drafts.length).toBeGreaterThan(0);
      for (const label of drafts) {
        // The declined look always costs the LOCAL rate — the whole point of
        // the two-part walk — and the label always says so.
        expect(label).toContain(priceWords(row));
        expect(label).not.toMatch(/\d,\d/);
      }
      // A climb up a storey names its full price too.
      const upward = drafts.find((l) => l.includes('in all if you take it'));
      if (row + 1 < MANOR_ROWS && moveAt(row + 1) !== moveAt(row)) {
        expect(upward).toBeDefined();
        expect(upward).toContain(String(draftTotal(row, row + 1)));
      }
    }
  });

  it('stamps a target only when it is priced differently from where she stands', () => {
    // A price stamped on everything stops being read; a price stamped on the
    // thing that costs more is the push-your-luck decision, in ink.
    expect(stampsPrice(2, 2)).toBe(false);
    // ROUND 23: rows 0–3 are one price now (REVIEW_AA §5.10), so the storey
    // that reads as dearer is the first PADLOCKED one — which is also the only
    // place the push-your-luck decision was ever really made.
    expect(stampsPrice(3, 3)).toBe(false);
    expect(stampsPrice(3, 4)).toBe(true);
    expect(stampsDraftPrice(3, 3)).toBe(false);
    expect(stampsDraftPrice(3, 4)).toBe(true);
    // Downstairs is never advertised as a discount it will not give: the
    // climb differential floors at 0, so taking a room below costs the local
    // rate, and the stamp says the local rate (i.e. no stamp at all).
    expect(draftTotal(5, 1)).toBe(-moveAt(5));
    expect(stampsDraftPrice(5, 1)).toBe(false);
  });

  it('every priced label is derived from moveAt for every row pair', () => {
    for (let from = 0; from < MANOR_ROWS; from++) {
      expect(walkLabel(from)).toContain(priceWords(from));
      for (let to = 0; to < MANOR_ROWS; to++) {
        const label = draftLabel(from, to);
        expect(label).toContain(priceWords(from));
        expect(draftTotal(from, to)).toBe(Math.max(-moveAt(from), -moveAt(to)));
        if (draftTotal(from, to) !== -moveAt(from)) {
          expect(label).toContain(`${draftTotal(from, to)} in all`);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ROUND 13 — THE REFUSAL AT THE TOP WAS NOT SILENT, IT WAS WRONG
// ---------------------------------------------------------------------------

/**
 * ═══ THE BLOCKER, AS A SUITE (AAA 4.6 / 4.16 / 11.7) ══════════════════════
 *
 * Driven at 390×844: standing at (2,5) in a room whose doors were S+E,
 * `.bp-sanctumhit` was ABSENT — the Sanctum was untappable with nothing drawn
 * to say why — while `/sanctum` printed "…only from the landing at the top of
 * the stairs — you will have to climb to it" and the journal said the same, on
 * the arrival she had just paid 22+ steps for. Nothing in the game — copy,
 * blueprint, or card face — had ever stated that the landing ROOM must open
 * north, and the decision point was unarmed: the draft modal named door
 * DIRECTIONS and carried no Sanctum stamp at all.
 *
 * Three fixes, all pinned below: the sheet answers instead of vanishing, the
 * blank north wall is drawn as the bricked seam it is, and every card in a
 * landing offer says which side of the question it is on.
 */

/** A sheet with the player standing on the landing, sealed or open. */
function landingSheet(opts: { northDoor: boolean }): string {
  const base = createManor(0xBEEF);
  const doors: Dir[] = opts.northDoor ? ['S', 'N', 'E'] : ['S', 'E'];
  const manor: ManorState = {
    ...base,
    rooms: {
      ...base.rooms,
      [SANCTUM_DOOR_KEY]: {
        cardId: 'gallery', cell: SANCTUM_DOOR_CELL, doors, solved: true, kind: 'twistle',
      },
    },
    playerCell: { ...SANCTUM_DOOR_CELL },
  };
  return renderToStaticMarkup(createElement(BlueprintSheet, {
    manor, canEnterCurrent: false, interactive: true, keys: 2,
    onMove: () => {}, onOpenDraft: () => {}, onEnterRoom: () => {}, onSanctum: () => {},
  }));
}

describe('the sealed landing answers instead of vanishing (round 13)', () => {
  it('keeps the Sanctum tappable on a landing that does not open onto it', () => {
    const sealed = landingSheet({ northDoor: false });
    // THE DEFECT IN ONE ASSERTION: the control existed only in the `at-door`
    // case, so the most expensive arrival in the campaign answered a tap with
    // nothing at all — indistinguishable, to a real finger, from a dead app.
    expect(sealed).toContain('bp-sanctumhit');
    expect(sealed).toContain('bp-sanctumhit--sealed');
    expect(labelsOf(sealed)).toContain(LANDING_SEALED_LABEL);
    // …and it does NOT promise an approach it cannot give (AAA 11.7: the
    // label is the meaning, and no false affordance — the walk wash that says
    // "this opens" is drawn only on the real door).
    expect(labelsOf(sealed)).not.toContain('Approach the Sanctum');
  });

  it('still opens for real when the landing room drew its north door', () => {
    const open = landingSheet({ northDoor: true });
    expect(labelsOf(open)).toContain('Approach the Sanctum');
    expect(open).not.toContain('bp-sanctumhit--sealed');
    expect(open).not.toContain('bp-sealedseam');
  });

  it('draws the blank north wall as the bricked seam it is (AAA 6.3)', () => {
    // The wall between her and the Sanctum was plain unbroken ink, identical
    // to every other wall in the manor — so the one fact that mattered was
    // the one fact the drawing did not carry. It wears the same bricked dash
    // as every dead door on the sheet (one vocabulary, AAA 6.16), and it is a
    // SHAPE on an otherwise unbroken line, so grayscale loses nothing.
    const sealed = landingSheet({ northDoor: false });
    expect(sealed).toContain('bp-sealedseam');
    expect(sealed).toContain('bp-room__dead bp-sealedseam');
  });

  it('says the true thing, briefly, and never charges for saying it', () => {
    expect(LANDING_REFUSAL_LINES.length).toBeGreaterThanOrEqual(2);
    for (const line of LANDING_REFUSAL_LINES) {
      // The drawn note ground is 324 user units at ~1 unit per CSS px, so a
      // line over ~48 characters clips (AAA 1.5: zero layout shift, ever).
      expect(line.length).toBeLessThanOrEqual(48);
      expect(line.trim().length).toBeGreaterThan(0);
      // Never shame-adjacent, never a loss (AAA R.3 / 4.12 string lint).
      expect(line.toLowerCase()).not.toMatch(/fail|lose|lost|death|damage|defeat/);
    }
    // A repeat tap is answered, never parroted back.
    expect(landingRefusalLine(0)).not.toBe(landingRefusalLine(1));
    // The spoken form states the whole gate, because a screen-reader user
    // cannot see the seam at all — and it names the remedy, which is the
    // sentence the entire game was missing.
    const spoken = landingRefusalAnnouncement(0).toLowerCase();
    expect(spoken).toContain('landing');
    expect(spoken).toContain('north');
    expect(spoken).toContain('nothing was spent');
  });
});

describe('the landing draft names the Sanctum on every card (round 13)', () => {
  const from: Cell = { col: SANCTUM_DOOR_CELL.col, row: SANCTUM_DOOR_CELL.row - 1 };

  function landingModal(cards: RoomCard[]): string {
    const base = createManor(4242);
    const manor: ManorState = {
      ...base,
      rooms: {
        ...base.rooms,
        [cellKey(from)]: room(from, ['N', 'E', 'S', 'W']),
      },
      playerCell: { ...from },
    };
    return renderToStaticMarkup(createElement(DraftModal, {
      offer: { atDoor: 'N' as Dir, from, cards, rerolled: false },
      gems: 4, keyCost: 0, manor,
      onChoose: () => {}, onReroll: () => {}, onCancel: () => {},
    }));
  }

  it('stamps every plan with whether it opens onto the Sanctum', () => {
    const manor = createManor(4242);
    const cards = ['darkroom', 'linen-closet', 'counting-house']
      .map((id) => BASE_DECK.find((c) => c.id === id)!);
    const html = landingModal(cards);
    // The rule, said once, above the three cards that answer it.
    expect(html).toContain('bp-modal__sanctum');
    expect(html).toContain('Sanctum landing');
    // …and the answer, said on every card — both answers, because a card that
    // says nothing beside two that do reads as a rendering gap, not as a plan
    // that seals the door.
    const stamps = [...html.matchAll(/class="bp-card__sanctum[^"]*"[^>]*>([^<]*)</g)]
      .map((m) => m[1]!);
    expect(stamps).toHaveLength(cards.length);
    cards.forEach((card, i) => {
      const opens = cardOpensOntoSanctum(card, 'N', manor, SANCTUM_DOOR_CELL);
      // THE assertion: the stamp is the same computation as the placement,
      // through the same `resolveDoors` the diagram beside it already draws.
      expect(stamps[i]).toBe(sanctumDraftStamp(opens));
      if (opens) expect(html).toContain('bp-card__sanctum--opens');
    });
  });

  it('says nothing about the Sanctum at any other door in the manor', () => {
    // The stamp is a landing fact. Everywhere else it would be noise, and
    // noise is how a real signal stops being read (the same rule the price
    // stamps follow).
    const base = createManor(4242);
    const elsewhere: Cell = { col: 2, row: 2 };
    const manor: ManorState = {
      ...base,
      rooms: { ...base.rooms, [cellKey(elsewhere)]: room(elsewhere, ['N', 'E', 'S', 'W']) },
      playerCell: { ...elsewhere },
    };
    const html = renderToStaticMarkup(createElement(DraftModal, {
      offer: {
        atDoor: 'N' as Dir, from: elsewhere,
        cards: [BASE_DECK.find((c) => c.id === 'darkroom')!], rerolled: false,
      },
      gems: 4, keyCost: 0, manor,
      onChoose: () => {}, onReroll: () => {}, onCancel: () => {},
    }));
    expect(html).not.toContain('bp-card__sanctum');
    expect(html).not.toContain('bp-modal__sanctum');
  });
});
