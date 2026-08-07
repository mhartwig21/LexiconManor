import { describe, expect, it } from 'vitest';
import {
  cellKey, parseCellKey, sameCell, inBounds, opposite, rotateDir, neighbor,
  dirBetween, rowTier, createManor, doorsConnect, canMoveTo, walkableNeighbors,
  draftTargets, deadDoors, placeRoom, orientLayout, layoutFor, resolveDoors,
  rotateDirBy, turnsBetween, sealsItself, hashSeed,
  roomSeed, deweyCell, roomAt, atSanctumDoor,
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
  draftLabel, draftTotal, priceStamp, priceWords, stampsDraftPrice, stampsPrice, walkLabel,
} from '../src/ui/blueprint/pricing';
import { DOOR_LOCKS, moveAt } from '../src/engine/economy/steps';
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
   *   (a) 41.5% — geometry: every card, every empty cell of a fresh manor,
   *       every heading. Dominated by the deck's one-door plans, which seal by
   *       definition. This is the shape of the DECK, not of a day.
   *   (b) 37.3% — in play, choosing blind. What she would suffer if the card
   *       face still lied.
   *   (c) 13.6% — in play, reading the diagram and preferring an onward door.
   *       This is the rate that ships, and it is almost exactly the rate at
   *       which an offer contains NO onward-door card at all (13.0%) — i.e.
   *       once the card tells the truth, she seals a room only when the house
   *       gave her nothing else, which is the honest version of the tension.
   *
   * If (c) drifts far from (a)−(b), the card face has stopped informing the
   * choice and something upstream has regressed.
   */
  it('THE ACCEPTED CONSEQUENCE (a): the deck seals ~41% of placements by shape', () => {
    let sealed = 0, total = 0;
    const byShape = new Map<number, { sealed: number; total: number }>();
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
              const shape = layoutFor(card, seed, cellKey(cell)).length;
              const bucket = byShape.get(shape) ?? { sealed: 0, total: 0 };
              bucket.total += 1;
              if (seals) bucket.sealed += 1;
              byShape.set(shape, bucket);
            }
          }
        }
      }
    }
    expect(sealed / total).toBeCloseTo(0.415, 2);
    // A one-door plan always seals — it has no other door to offer. A tee or a
    // cross never can: at most two of its remaining walls are outer walls.
    expect(byShape.get(1)!.sealed / byShape.get(1)!.total).toBe(1);
    expect(byShape.get(3)!.sealed).toBe(0);
    expect(byShape.get(4)!.sealed).toBe(0);
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
    expect(blind.rate).toBeCloseTo(0.37, 1);
    expect(reading.rate).toBeCloseTo(0.14, 1);
    // The card face is worth roughly a third of the dead ends…
    expect(reading.rate).toBeLessThan(blind.rate * 0.6);
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
        expect(drawn[i]!.label).toContain('you enter from the');
      });
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
    const drawn = diagramsIn(modalFor(manor, 'N', [deadEnd, cross]));
    expect(drawn[0]!.doors).toEqual(['S']);
    expect(drawn[0]!.label).toContain('seals itself');
    expect(drawn[1]!.doors).toEqual(['N', 'E', 'S', 'W']);
    expect(drawn[1]!.label).toContain('opens north and east and west');
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
    expect(priceStamp(0)).toBe('−1');
    expect(priceStamp(6)).toBe(`−${-moveAt(6)}`);
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
    expect(stampsPrice(2, 3)).toBe(true);
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
