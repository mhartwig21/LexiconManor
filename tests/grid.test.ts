import { describe, expect, it } from 'vitest';
import {
  cellKey, parseCellKey, sameCell, inBounds, opposite, rotateDir, neighbor,
  dirBetween, rowTier, createManor, doorsConnect, canMoveTo, walkableNeighbors,
  draftTargets, deadDoors, placeRoom, orientationsOf, resolveDoors, hashSeed,
  roomSeed, deweyCell, roomAt, DIRS, ENTRANCE_KEY, SANCTUM_KEY,
} from '../src/engine/manor/grid';
import {
  canOpenDoor, isDoorLocked, lockedDraftTargets, rowCanLock, visibleLocks, KEY_COST,
} from '../src/engine/manor/locks';
import { DOOR_LOCKS } from '../src/engine/economy/steps';
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
