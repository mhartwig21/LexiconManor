import { describe, expect, it } from 'vitest';
import type { RoomContext, RoomEvent } from '../../src/engine/rooms/room-puzzle';
import { getRoomAdapter, registeredRoomKinds } from '../../src/engine/rooms/registry';
import {
  checkCrossword, entryCells, isGridFull, openCells, setCrosswordCell, solutionLetters,
  startCrossword, validateCrosswordPuzzle, type CrosswordPuzzle,
} from '../../src/engine/puzzles/crossword';
import { crosswordAdapter, CROSSWORD_POOL, type CrosswordRoomState } from '../../src/engine/puzzles/crossword-adapter';
import clueBank from '../../content/authored/crossword-clues.json';

const CLUE_BANK = clueBank as {
  clues: { word: string; clue: string; wry?: string; difficulty: string }[];
};

/**
 * A5 — the surviving batch-2 micro room (Linen Closet crossword) behind the
 * RoomPuzzle contract. (The Music Room rhyme chain and Pantry category
 * sprint were retired in the owner's "fewer but better" cull.) Mistake-weight
 * mappings are review checkpoints against AAA §0.3: free letter probes; only
 * the full-grid claim costs; hints price through the `hint` event and forfeit
 * perfect.
 */

const ctx = (tier: 1 | 2 | 3): RoomContext => ({ tier, seed: 7, volumeId: 'volume-1' });

const eventsOfType = (events: RoomEvent[], type: RoomEvent['type']) =>
  events.filter((e) => e.type === type);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const cwPuzzle: CrosswordPuzzle = {
  id: 'cw-fixture',
  difficulty: 'easy',
  size: 5,
  entries: [
    { id: '1D', dir: 'down', row: 1, col: 3, answer: 'BED', clue: 'Where the day ends' },
    { id: '2A', dir: 'across', row: 2, col: 0, answer: 'CAKE', clue: 'Celebration slice' },
    { id: '2D', dir: 'down', row: 2, col: 0, answer: 'CAT', clue: 'Dewey, for one' },
  ],
};

// ---------------------------------------------------------------------------
// Registry wiring
// ---------------------------------------------------------------------------

describe('registry (A5)', () => {
  it('registers crossword as a micro room', () => {
    const adapter = getRoomAdapter('crossword');
    expect(adapter).toBeDefined();
    expect(adapter!.kind).toBe('crossword');
    expect(adapter!.size).toBe('micro');
    expect(registeredRoomKinds()).toEqual(expect.arrayContaining(['crossword']));
  });
});

// ---------------------------------------------------------------------------
// Seeded, seen-aware selection (shared select contract)
// ---------------------------------------------------------------------------

describe('selection', () => {
  it('crossword: deterministic by seed', () => {
    const a = crosswordAdapter.select({ tier: 2, seed: 123, seenIds: [] });
    const b = crosswordAdapter.select({ tier: 2, seed: 123, seenIds: [] });
    expect(crosswordAdapter.puzzleId(a)).toBe(crosswordAdapter.puzzleId(b));
  });

  it('crossword: avoids seen puzzles while fresh ones remain', () => {
    const first = crosswordAdapter.select({ tier: 1, seed: 5, seenIds: [] });
    const firstId = crosswordAdapter.puzzleId(first);
    const second = crosswordAdapter.select({ tier: 1, seed: 5, seenIds: [firstId] });
    expect(crosswordAdapter.puzzleId(second)).not.toBe(firstId);
  });

  it('crossword: falls back gracefully when everything is seen', () => {
    const all = CROSSWORD_POOL.map((p) => p.id);
    const picked = crosswordAdapter.select({ tier: 3, seed: 9, seenIds: all });
    expect(all).toContain(crosswordAdapter.puzzleId(picked));
  });
});

// ---------------------------------------------------------------------------
// Crossword — pool honesty + engine + adapter economy
// ---------------------------------------------------------------------------

describe('crossword pool', () => {
  it('ships puzzles for every manor tier', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(CROSSWORD_POOL.filter((p) => (p.tier ?? 1) === tier).length, `tier ${tier}`)
        .toBeGreaterThanOrEqual(10);
    }
  });

  /**
   * Round 4 (owner: "5x5 tier 3 with harder clue styles"). The closet grows
   * with the row and the clue register hardens at the top.
   */
  describe('tier escalation', () => {
    const at = (tier: 1 | 2 | 3) => CROSSWORD_POOL.filter((p) => (p.tier ?? 1) === tier);

    it('the grid and the entry count both grow with the row', () => {
      for (const p of at(1)) {
        expect(p.size, p.id).toBe(4);
        expect(p.entries.length, p.id).toBe(3);
      }
      for (const p of at(2)) {
        expect(p.size, p.id).toBe(5);
        expect(p.entries.length, p.id).toBe(4);
      }
      for (const p of at(3)) {
        expect(p.size, p.id).toBe(5);
        expect(p.entries.length, p.id).toBe(5);
      }
    });

    it('tier 3 reads at least two clues in the wry (misdirecting) style', () => {
      const wry = new Set(
        (CLUE_BANK.clues.filter((c) => c.wry).map((c) => c.wry)) as string[],
      );
      for (const p of at(3)) {
        const wryCount = p.entries.filter((e) => wry.has(e.clue)).length;
        expect(wryCount, p.id).toBeGreaterThanOrEqual(2);
      }
    });

    it('tiers 1 and 2 keep the plain definition register', () => {
      const wry = new Set(
        (CLUE_BANK.clues.filter((c) => c.wry).map((c) => c.wry)) as string[],
      );
      for (const p of [...at(1), ...at(2)]) {
        for (const e of p.entries) expect(wry.has(e.clue), `${p.id} ${e.id}`).toBe(false);
      }
    });

    it('tier 3 always headlines a hard or expert bank word', () => {
      const byWord = new Map(CLUE_BANK.clues.map((c) => [c.word, c.difficulty]));
      for (const p of at(3)) {
        const diffs = p.entries.map((e) => byWord.get(e.answer));
        expect(diffs.some((d) => d === 'hard' || d === 'expert'), p.id).toBe(true);
      }
    });
  });

  it('every shipped puzzle passes the structural solver (runs, crossings, connectivity)', () => {
    for (const p of CROSSWORD_POOL) {
      expect(validateCrosswordPuzzle(p), p.id).toEqual([]);
    }
  });
});

describe('crossword engine', () => {
  it('letters are free probes; editing lifts a wrong mark', () => {
    let s = startCrossword(cwPuzzle);
    s = setCrosswordCell(cwPuzzle, s, 10, 'X');
    expect(s.letters[10]).toBe('X');
    s = { ...s, wrongCells: [10] };
    s = setCrosswordCell(cwPuzzle, s, 10, 'C');
    expect(s.wrongCells).toEqual([]);
  });

  it('check solves a correct grid and never rejects the truth', () => {
    let s = startCrossword(cwPuzzle);
    for (const [cell, ch] of solutionLetters(cwPuzzle)) s = setCrosswordCell(cwPuzzle, s, cell, ch);
    expect(isGridFull(cwPuzzle, s)).toBe(true);
    const { state, result } = checkCrossword(cwPuzzle, s);
    expect(result.kind).toBe('solved');
    expect(state.status).toBe('won');
  });

  it('entryCells walks each entry in order', () => {
    const cells = entryCells(cwPuzzle, cwPuzzle.entries[0]!);
    expect(cells.length).toBe(3);
  });

  it('fixture is itself structurally valid', () => {
    expect(validateCrosswordPuzzle(cwPuzzle)).toEqual([]);
  });
});

describe('crossword adapter economy', () => {
  const fillAll = (mut: (cell: number, ch: string) => void) => {
    for (const [cell, ch] of solutionLetters(cwPuzzle)) mut(cell, ch);
  };

  it('perfect solve: only free placements, then solved+perfect', () => {
    let s = crosswordAdapter.start(cwPuzzle, ctx(1));
    const all: RoomEvent[] = [];
    let outcome;
    fillAll((cell, ch) => {
      const r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: cell, letter: ch });
      s = r.state;
      all.push(...r.events);
      outcome = r.outcome;
    });
    expect(outcome).toEqual({ status: 'solved', perfect: true });
    expect(eventsOfType(all, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
    expect(eventsOfType(all, 'mistake')).toEqual([]);
  });

  it('a wrong full grid costs weight 1; the identical re-fill is weight 0', () => {
    let s = crosswordAdapter.start(cwPuzzle, ctx(1));
    const sol = solutionLetters(cwPuzzle);
    const cells = openCells(cwPuzzle);
    const lastCell = cells[cells.length - 1]!;
    let charged: RoomEvent[] = [];
    for (const cell of cells) {
      const ch = cell === lastCell ? 'Z' : sol.get(cell)!;
      const r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: cell, letter: ch });
      s = r.state;
      charged.push(...r.events);
    }
    expect(eventsOfType(charged, 'mistake')).toEqual([{ type: 'mistake', weight: 1 }]);
    expect(s.cw.wrongCells).toEqual([lastCell]);

    // Clear and retype the same wrong letter: same claim, no second charge.
    let r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: lastCell, letter: null });
    s = r.state;
    r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: lastCell, letter: 'Z' });
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);

    // Fixing the letter solves it — but the costed check forfeited perfect.
    r = crosswordAdapter.reduce(cwPuzzle, r.state, { type: 'set-cell', index: lastCell, letter: sol.get(lastCell)! });
    expect(r.outcome).toEqual({ status: 'solved', perfect: false });
  });

  it('reveal prices as a hint, locks the cell, and forfeits perfect', () => {
    let s = crosswordAdapter.start(cwPuzzle, ctx(2));
    const r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'reveal-cell', index: 10 });
    expect(eventsOfType(r.events, 'hint')).toEqual([{ type: 'hint', weight: 1 }]);
    expect(r.state.cw.letters[10]).toBe('C');
    // Locked: typing over a revealed cell is ignored.
    const r2 = crosswordAdapter.reduce(cwPuzzle, r.state, { type: 'set-cell', index: 10, letter: 'X' });
    expect(r2.state.cw.letters[10]).toBe('C');
    expect(r.outcome.perfect).toBe(false);
  });

  it('a reveal that completes the grid resolves the room', () => {
    let s: CrosswordRoomState = crosswordAdapter.start(cwPuzzle, ctx(1));
    const sol = solutionLetters(cwPuzzle);
    const cells = openCells(cwPuzzle);
    const lastCell = cells[cells.length - 1]!;
    for (const cell of cells) {
      if (cell === lastCell) continue;
      s = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: cell, letter: sol.get(cell)! }).state;
    }
    const r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'reveal-cell', index: lastCell });
    expect(r.outcome.status).toBe('solved');
    expect(r.outcome.perfect).toBe(false); // the hint forfeited it
  });
});
