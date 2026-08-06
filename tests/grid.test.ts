import { describe, expect, it } from 'vitest';
import {
  cellKey, parseCellKey, sameCell, inBounds, opposite, rotateDir, neighbor,
  dirBetween, rowTier, createManor, doorsConnect, canMoveTo, walkableNeighbors,
  draftTargets, deadDoors, placeRoom, orientationsOf, resolveDoors, hashSeed,
  roomSeed, deweyCell, roomAt, DIRS, ENTRANCE_KEY, SANCTUM_KEY,
} from '../src/engine/manor/grid';
import type { Cell, Dir, ManorState, PlacedRoom, RoomCard } from '../src/engine/types';
import { ENTRANCE_CELL, MANOR_COLS, MANOR_ROWS, SANCTUM_CELL } from '../src/engine/types';
import { createRng } from '../src/engine/rng';

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

describe('orientation at placement', () => {
  it('orientationsOf sweeps all four walls without duplicates', () => {
    expect(orientationsOf(['N'])).toHaveLength(4);
    expect(orientationsOf(['N', 'S'])).toHaveLength(2);   // corridor symmetry
    expect(orientationsOf(['N', 'E', 'S', 'W'])).toHaveLength(1);
    for (const o of orientationsOf(['N', 'E'])) expect(o).toHaveLength(2);
  });

  it('resolveDoors always keeps a door on the entry wall — every card placeable (AAA 4.4)', () => {
    const layouts: Dir[][][] = [
      [['N']], [['N', 'S']], [['N', 'E']], [['N', 'E', 'W']], [['N', 'E', 'S', 'W']],
      [['N'], ['N', 'E']],
    ];
    const m = createManor(11);
    const rng = createRng(5);
    for (const doorLayouts of layouts) {
      for (const entryDir of DIRS) {
        for (let col = 0; col < MANOR_COLS; col++) {
          for (let row = 0; row < MANOR_ROWS; row++) {
            const cell: Cell = { col: col as Cell['col'], row };
            if (roomAt(m, cell)) continue;
            const doors = resolveDoors(testCard(doorLayouts), entryDir, m, cell, rng);
            expect(doors).toContain(opposite(entryDir));
          }
        }
      }
    }
  });

  it('prefers rotations that keep paths flowing (most live doors)', () => {
    // Player drafts eastward from the entrance into (3,0): a corner room
    // entered through W. Rotations with a door on W: [W,N] or [W,S].
    // S faces the outer wall (dead) — the resolver must pick [N,W].
    const m = createManor(9);
    const doors = resolveDoors(testCard([['N', 'E']]), 'E', m, { col: 3, row: 0 }, createRng(1));
    expect(doors).toContain('W');
    expect(doors).toContain('N');
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
