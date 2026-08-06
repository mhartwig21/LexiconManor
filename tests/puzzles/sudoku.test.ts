import { describe, expect, it } from 'vitest';
import type { RoomContext, RoomEvent } from '../../src/engine/rooms/room-puzzle';
import { getRoomAdapter } from '../../src/engine/rooms/registry';
import {
  PEERS, TECHNIQUE_LEVEL, UNITS, blanksRemaining, clearPencil, countSolutions, digitCount,
  gridToString, inkCell, isGiven, parseGrid, rateSudoku, revealCell, solveOne, solveWithTechniques,
  startSudoku, togglePencil,
  type SudokuPuzzle, type SudokuTier, type TechniqueLevel,
} from '../../src/engine/puzzles/sudoku';
import {
  SUDOKU_POOL, sudokuAdapter, type SudokuRoomState,
} from '../../src/engine/puzzles/sudoku-adapter';
import sudokuData from '../../content/generated/sudoku.json';

/**
 * The Counting House (sudoku) — engine, technique rater, shipped pool, and
 * the RoomPuzzle adapter.
 *
 * OWNER DIRECTIVE (playtest round): the player is an expert, so EXPERT IS THE
 * BASELINE. The load-bearing suite here is the TECHNIQUE-TIER VERIFICATION
 * (below): every shipped board must be solvable with the technique ladder AND
 * must STALL when the ladder is capped one level below its declared tier —
 * re-derived from the `givens` string, so the JSON's own tier/solution fields
 * are treated as claims to check, never as inputs to trust.
 *
 * Economy mapping is a review checkpoint against AAA §0.3: pencil marks are
 * free (exploration is thinking), inking is the claim (a contradiction is a
 * weight-1 mistake and never lands), consulting is a `hint`, and malformed
 * input costs nothing (AAA 3.2).
 */

const POOL = sudokuData as SudokuPuzzle[];
const TIERS: SudokuTier[] = [1, 2, 3];

const ctx = (tier: 1 | 2 | 3): RoomContext => ({ tier, seed: 42, volumeId: 'volume-1' });
const ofType = (events: RoomEvent[], type: RoomEvent['type']) => events.filter((e) => e.type === type);

/** A stable board to play against (the pool is generator-verified). */
const fixture = POOL[0]!;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

describe('grid geometry', () => {
  it('has 27 units of 9 cells: rows, columns, quarters', () => {
    expect(UNITS).toHaveLength(27);
    for (const unit of UNITS) expect(new Set(unit).size).toBe(9);
    // Every cell belongs to exactly three units.
    for (let cell = 0; cell < 81; cell++) {
      expect(UNITS.filter((u) => u.includes(cell))).toHaveLength(3);
    }
  });

  it('gives every cell exactly 20 peers, symmetrically', () => {
    for (let cell = 0; cell < 81; cell++) {
      expect(PEERS[cell]).toHaveLength(20);
      for (const p of PEERS[cell]!) expect(PEERS[p]).toContain(cell);
      expect(PEERS[cell]).not.toContain(cell);
    }
  });

  it('round-trips a grid string', () => {
    expect(gridToString(parseGrid(fixture.givens))).toBe(fixture.givens);
    expect(() => parseGrid('123')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Rater self-checks
// ---------------------------------------------------------------------------

describe('technique rater', () => {
  it('rates a nearly-complete board as singles-only (tier 0, below the bar)', () => {
    // Blank four cells of a solved grid: nothing but singles is needed.
    const values = parseGrid(fixture.solution);
    for (const cell of [0, 10, 20, 30]) values[cell] = 0;
    const rated = rateSudoku(gridToString(values));
    expect(rated).not.toBeNull();
    expect(rated!.tier).toBe(0);
    expect(rated!.techniques.every((id) => TECHNIQUE_LEVEL[id] === 0)).toBe(true);
  });

  it('refuses an inconsistent board', () => {
    const values = parseGrid(fixture.solution);
    values[1] = values[0]!;             // duplicate in row 0
    expect(rateSudoku(gridToString(values))).toBeNull();
    expect(countSolutions(gridToString(values))).toBe(0);
  });

  it('reports the ladder stalling rather than guessing', () => {
    // Two givens short of unique: the ladder must not invent an answer.
    const values = parseGrid(fixture.givens);
    const filled = values.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i >= 0);
    values[filled[0]!] = 0;
    values[filled[1]!] = 0;
    const rating = solveWithTechniques(gridToString(values), 3);
    if (rating.solved) {
      // Still forced — then it must agree with the truth, never diverge.
      expect(rating.grid).toBe(fixture.solution);
    } else {
      expect(rating.grid).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// THE TECHNIQUE-TIER VERIFICATION (the shipped pool's honesty proof)
// ---------------------------------------------------------------------------

describe('shipped pool: technique-tier verification', () => {
  it('ships ~120 boards, evenly across three tiers, with unique ids', () => {
    expect(POOL.length).toBeGreaterThanOrEqual(100);
    expect(new Set(POOL.map((p) => p.id)).size).toBe(POOL.length);
    expect(new Set(POOL.map((p) => p.givens)).size).toBe(POOL.length);
    for (const t of TIERS) {
      expect(POOL.filter((p) => p.tier === t).length, `tier ${t}`).toBeGreaterThanOrEqual(20);
    }
  });

  it('never ships a singles-only board — expert is the baseline', () => {
    for (const p of POOL) {
      expect(TIERS, p.id).toContain(p.tier);
      expect(p.techniques.some((id) => TECHNIQUE_LEVEL[id] >= 1), p.id).toBe(true);
    }
  });

  it('every board has exactly one solution, and it is the shipped one', () => {
    for (const p of POOL) {
      expect(/^[1-9.]{81}$/.test(p.givens), p.id).toBe(true);
      expect(countSolutions(p.givens, 2), p.id).toBe(1);
      expect(solveOne(p.givens), p.id).toBe(p.solution);
      for (let i = 0; i < 81; i++) {
        if (p.givens[i] !== '.') expect(p.givens[i], `${p.id} cell ${i}`).toBe(p.solution[i]);
      }
    }
  });

  it('every board REQUIRES its tier: the ladder one level below stalls', () => {
    for (const p of POOL) {
      const full = solveWithTechniques(p.givens, 3);
      expect(full.solved, `${p.id} unsolvable with the ladder`).toBe(true);
      expect(full.grid, p.id).toBe(p.solution);
      // The ceiling IS the declared tier...
      expect(full.maxLevel, `${p.id} declared tier ${p.tier}`).toBe(p.tier);
      // ...and it is genuinely needed: cap one level lower and the solve dies.
      const below = solveWithTechniques(p.givens, (p.tier - 1) as TechniqueLevel);
      expect(below.solved, `${p.id} solvable one level below tier ${p.tier}`).toBe(false);
      // The named techniques include one at the tier's level.
      expect(p.techniques.some((id) => TECHNIQUE_LEVEL[id] === p.tier), `${p.id} technique list`).toBe(true);
    }
  });

  it('the tiers escalate in the techniques they demand', () => {
    const ceilingsFor = (t: SudokuTier) => new Set(
      POOL.filter((p) => p.tier === t)
        .flatMap((p) => p.techniques.filter((id) => TECHNIQUE_LEVEL[id] === t)),
    );
    // Tier 1 ≈ NYT hard/expert; tier 3 needs the advanced end of the ladder.
    for (const id of ceilingsFor(1)) expect(TECHNIQUE_LEVEL[id]).toBe(1);
    expect([...ceilingsFor(3)].length).toBeGreaterThan(0);
    for (const id of ceilingsFor(3)) {
      expect(['swordfish', 'xyz-wing', 'simple-colouring']).toContain(id);
    }
  });

  it('SOUNDNESS: no technique ever eliminates a true figure', () => {
    // The rater is only trustworthy if every elimination it makes is valid.
    // At every cap — including the caps where it STALLS mid-board, the states
    // an unsound technique would corrupt — the surviving candidates must still
    // contain the solution's digit, and every placed value must be the truth.
    for (const p of POOL) {
      const truth = parseGrid(p.solution);
      for (const cap of [0, 1, 2, 3] as TechniqueLevel[]) {
        const r = solveWithTechniques(p.givens, cap);
        for (let cell = 0; cell < 81; cell++) {
          const v = r.values[cell]!;
          if (v !== 0) {
            expect(v, `${p.id} cap ${cap} cell ${cell}`).toBe(truth[cell]);
          } else {
            const bit = 1 << (truth[cell]! - 1);
            expect(r.cands[cell]! & bit, `${p.id} cap ${cap} cell ${cell} lost its true figure`)
              .not.toBe(0);
          }
        }
      }
    }
  });

  it('given counts sit in the expert band (never a filler board)', () => {
    for (const p of POOL) {
      const givens = [...p.givens].filter((c) => c !== '.').length;
      expect(givens, p.id).toBeGreaterThanOrEqual(17);
      expect(givens, p.id).toBeLessThanOrEqual(34);
    }
  });
});

// ---------------------------------------------------------------------------
// Play state
// ---------------------------------------------------------------------------

describe('play state', () => {
  it('starts with the givens inked and nothing penciled', () => {
    const s = startSudoku(fixture);
    expect(gridToString(s.values)).toBe(fixture.givens);
    expect(s.pencil.every((m) => m === 0)).toBe(true);
    expect(s.revealed).toEqual([]);
    expect(s.status).toBe('playing');
    expect(blanksRemaining(s)).toBe(81 - [...fixture.givens].filter((c) => c !== '.').length);
  });

  it('pencils marks in and out, and never on a filled cell', () => {
    const blank = [...fixture.givens].findIndex((c) => c === '.');
    const given = [...fixture.givens].findIndex((c) => c !== '.');
    let s = startSudoku(fixture);
    s = togglePencil(s, blank, 4);
    s = togglePencil(s, blank, 7);
    expect(s.pencil[blank]! & (1 << 3)).not.toBe(0);
    expect(s.pencil[blank]! & (1 << 6)).not.toBe(0);
    s = togglePencil(s, blank, 4);
    expect(s.pencil[blank]! & (1 << 3)).toBe(0);
    // Filled cells and out-of-range figures are no-ops (same object back).
    expect(togglePencil(s, given, 5)).toBe(s);
    expect(togglePencil(s, blank, 0)).toBe(s);
    expect(togglePencil(s, blank, 10)).toBe(s);
    s = clearPencil(s, blank);
    expect(s.pencil[blank]).toBe(0);
    expect(clearPencil(s, blank)).toBe(s);
  });

  it('inks a true figure, sweeps it from peers, and refuses a false one', () => {
    const blank = [...fixture.givens].findIndex((c) => c === '.');
    const truth = Number(fixture.solution[blank]);
    const wrong = truth === 9 ? 1 : truth + 1;
    let s = startSudoku(fixture);

    // Pencil the figure into a peer so the sweep has something to tidy.
    const peer = PEERS[blank]!.find((p) => s.values[p] === 0)!;
    s = togglePencil(s, peer, truth);
    expect(s.pencil[peer]! & (1 << (truth - 1))).not.toBe(0);

    const refused = inkCell(fixture, s, blank, wrong);
    expect(refused.result).toBe('contradiction');
    expect(refused.state).toBe(s);                    // the false figure never lands
    expect(refused.state.values[blank]).toBe(0);

    const placed = inkCell(fixture, s, blank, truth);
    expect(placed.result).toBe('placed');
    expect(placed.state.values[blank]).toBe(truth);
    expect(placed.state.pencil[peer]! & (1 << (truth - 1))).toBe(0);
    expect(digitCount(placed.state, truth)).toBe(digitCount(s, truth) + 1);

    // Malformed input is ignored, never a contradiction (AAA 3.2).
    expect(inkCell(fixture, placed.state, blank, 5).result).toBe('ignored');
    expect(inkCell(fixture, s, blank, 0).result).toBe('ignored');
  });

  it('reaches won only when the last figure lands', () => {
    let s = startSudoku(fixture);
    let result = 'placed';
    for (let cell = 0; cell < 81; cell++) {
      if (s.values[cell] !== 0) continue;
      const out = inkCell(fixture, s, cell, Number(fixture.solution[cell]));
      s = out.state;
      result = out.result;
      if (blanksRemaining(s) > 0) expect(out.result).toBe('placed');
    }
    expect(result).toBe('won');
    expect(s.status).toBe('won');
    expect(gridToString(s.values)).toBe(fixture.solution);
    // A won board takes no further input.
    expect(togglePencil(s, 0, 3)).toBe(s);
  });

  it('reveals the true figure and remembers that it was bought', () => {
    const s = startSudoku(fixture);
    const blank = [...fixture.givens].findIndex((c) => c === '.');
    const out = revealCell(fixture, s, blank);
    expect(out.cell).toBe(blank);
    expect(out.state.values[blank]).toBe(Number(fixture.solution[blank]));
    expect(out.state.revealed).toEqual([blank]);

    // No preference given: it picks a blank, and still tells the truth.
    const any = revealCell(fixture, s);
    expect(any.cell).not.toBeNull();
    expect(any.state.values[any.cell!]).toBe(Number(fixture.solution[any.cell!]));

    // A given is never "revealed" — the fallback finds a real blank instead.
    const given = [...fixture.givens].findIndex((c) => c !== '.');
    const onGiven = revealCell(fixture, s, given);
    expect(onGiven.cell).not.toBe(given);
    expect(isGiven(fixture, onGiven.cell!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The adapter (RoomPuzzle contract + economy mapping)
// ---------------------------------------------------------------------------

describe('registry (SUDOKU fence)', () => {
  it('registers the sudoku adapter as an anchor-weight room', () => {
    const adapter = getRoomAdapter('sudoku');
    expect(adapter).toBeDefined();
    expect(adapter!.kind).toBe('sudoku');
    // An expert-baseline board is a long solve: it pays on the anchor row.
    expect(adapter!.size).toBe('anchor');
  });
});

describe('adapter selection', () => {
  it('is deterministic per seed and prefers the row band tier', () => {
    for (const tier of TIERS) {
      const a = sudokuAdapter.select({ tier, seed: 7, seenIds: [] });
      const b = sudokuAdapter.select({ tier, seed: 7, seenIds: [] });
      expect(a.id).toBe(b.id);
      expect(sudokuAdapter.puzzleId(a)).toBe(a.id);
    }
    // Expert baseline: manor tier 1 draws technique-tier 1, never an easy bin.
    expect(sudokuAdapter.select({ tier: 1, seed: 3, seenIds: [] }).tier).toBeLessThanOrEqual(2);
    expect(sudokuAdapter.select({ tier: 3, seed: 3, seenIds: [] }).tier).toBeGreaterThanOrEqual(2);
  });

  it('avoids boards already seen', () => {
    const seen = SUDOKU_POOL.filter((p) => p.tier === 1).map((p) => p.id);
    const picked = sudokuAdapter.select({ tier: 1, seed: 11, seenIds: seen });
    expect(seen).not.toContain(picked.id);
  });
});

describe('adapter economy mapping (AAA §0.3)', () => {
  const blank = [...fixture.givens].findIndex((c) => c === '.');
  const truth = Number(fixture.solution[blank]);
  const wrong = truth === 9 ? 1 : truth + 1;
  const start = () => sudokuAdapter.start(fixture, ctx(2)) as SudokuRoomState;

  it('pencil marks are free: no events, no cost, unlimited', () => {
    let s = start();
    for (let d = 1; d <= 9; d++) {
      const out = sudokuAdapter.reduce(fixture, s, { type: 'pencil', cell: blank, digit: d });
      expect(out.events).toEqual([]);
      expect(out.outcome.perfect).toBe(true);
      s = out.state;
    }
    const cleared = sudokuAdapter.reduce(fixture, s, { type: 'clear-pencil', cell: blank });
    expect(cleared.events).toEqual([]);
    expect(cleared.state.engine.pencil[blank]).toBe(0);
    expect(cleared.state.costedMistakes).toBe(0);
  });

  it('a contradiction costs one weight-1 mistake and never lands', () => {
    const out = sudokuAdapter.reduce(fixture, start(), { type: 'ink', cell: blank, digit: wrong });
    expect(ofType(out.events, 'mistake')).toEqual([{ type: 'mistake', weight: 1 }]);
    expect(out.events).toHaveLength(1);
    expect(out.state.engine.values[blank]).toBe(0);
    expect(out.state.costedMistakes).toBe(1);
    expect(out.state.lastFeedback).toEqual({ kind: 'contradiction', cell: blank, digit: wrong });
    expect(out.outcome).toEqual({ status: 'active', perfect: false });
  });

  it('malformed input is free (AAA 3.2)', () => {
    const s = start();
    const given = [...fixture.givens].findIndex((c) => c !== '.');
    for (const action of [
      { type: 'ink', cell: given, digit: 5 },
      { type: 'ink', cell: blank, digit: 0 },
      { type: 'ink', cell: blank, digit: 10 },
    ] as const) {
      const out = sudokuAdapter.reduce(fixture, s, action);
      expect(out.events).toEqual([]);
      expect(out.state).toBe(s);
    }
  });

  it('a true figure is progress, never a reward or a cost', () => {
    const out = sudokuAdapter.reduce(fixture, start(), { type: 'ink', cell: blank, digit: truth });
    expect(ofType(out.events, 'mistake')).toEqual([]);
    expect(ofType(out.events, 'progress')).toHaveLength(1);
    expect(out.state.engine.values[blank]).toBe(truth);
    expect(out.outcome.perfect).toBe(true);
  });

  it('consulting the ledger is a step-priced hint that forfeits perfect', () => {
    const out = sudokuAdapter.reduce(fixture, start(), { type: 'reveal-cell', cell: blank });
    expect(ofType(out.events, 'hint')).toEqual([{ type: 'hint', weight: 1 }]);
    expect(ofType(out.events, 'mistake')).toEqual([]);
    expect(out.state.hintsBought).toBe(1);
    expect(out.state.engine.revealed).toEqual([blank]);
    expect(out.outcome.perfect).toBe(false);
  });

  it('solves clean → perfect; solves after a refusal → not perfect', () => {
    for (const stumble of [false, true]) {
      let s = start();
      if (stumble) {
        s = sudokuAdapter.reduce(fixture, s, { type: 'ink', cell: blank, digit: wrong }).state;
      }
      let events: RoomEvent[] = [];
      let outcome = sudokuAdapter.reduce(fixture, s, { type: 'pencil', cell: blank, digit: 1 }).outcome;
      for (let cell = 0; cell < 81; cell++) {
        if (s.engine.values[cell] !== 0) continue;
        const out = sudokuAdapter.reduce(
          fixture, s, { type: 'ink', cell, digit: Number(fixture.solution[cell]) },
        );
        s = out.state;
        events = out.events;
        outcome = out.outcome;
      }
      expect(ofType(events, 'solved')).toEqual([{ type: 'solved', perfect: !stumble }]);
      expect(outcome).toEqual({ status: 'solved', perfect: !stumble });
      expect(s.engine.status).toBe('won');
    }
  });
});
