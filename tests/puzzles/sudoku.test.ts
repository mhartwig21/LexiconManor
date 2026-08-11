import { describe, expect, it } from 'vitest';
import type { RoomContext, RoomEvent } from '../../src/engine/rooms/room-puzzle';
import { getRoomAdapter } from '../../src/engine/rooms/registry';
import {
  ABOVE_NYT_HARD, LADDER_ORDER, PEERS, SUDOKU_TIER_GRADE, TECHNIQUE_LEVEL, UNITS,
  balanceBooks, blanksRemaining, boxUnitOf, clearPencil,
  countSolutions, digitCount, erasePencilMark, fillPencil, gridToString, inkCell, isGiven,
  lastPencilMark, nextTechniqueNudge,
  parseGrid, rateSudoku, revealCell, solveOne, solveWithTechniques, startSudoku, togglePencil,
  uninkCell, unitName, unsettledCells,
  type SudokuEngineState, type SudokuPuzzle, type SudokuTier, type TechniqueLevel,
} from '../../src/engine/puzzles/sudoku';
import {
  SUDOKU_POOL, UNDO_DEPTH, sudokuAdapter, type SudokuRoomState,
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
 * Economy mapping is a review checkpoint against AAA §0.3. ROUND 5 REWRITE —
 * the claim moved OFF the ink and onto a verb, because checking every ink
 * against `puzzle.solution` sold a correctness oracle at the price of the
 * sanctioned hint and let every level-2/3 technique be bisected instead of
 * deduced. The contract this suite now pins:
 *   - pencil marks, "pencil what fits" and lifting a figure: free, no events;
 *   - an ink that duplicates a visible peer: MALFORMED — weight 0, no landing;
 *   - any other ink: FREE, and it LANDS, right or wrong;
 *   - "Balance the books": weight-1 `mistake`, reports N of M astray, and an
 *     identical re-balance is free;
 *   - the technique nudge: weight-1 `hint`, and it keeps `perfect`;
 *   - consulting a figure: weight-2 `hint`, and it forfeits `perfect`.
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

  it('THE GRADE: no tier-2 board is a hunt, and every tier-3 board is', () => {
    // ROUND 27 - WHAT THIS TEST USED TO BE, AND WHY IT COULD NOT FAIL.
    // It read "the tiers escalate in the techniques they demand" and checked
    // that a tier-N board's level-N techniques have level N. That is
    // `TECHNIQUE_LEVEL` asserted against itself: it catches a board binned into
    // the wrong tier and it can NEVER catch the table being wrong about what a
    // technique is worth - which is exactly what was wrong. The old bands put
    // the XY-wing at level 2 and the naked pair at level 1, so 98% of tier-2
    // boards needed a wing, a fish or a colouring chain, and BENCHMARKS section
    // 7 records that NYT HARD - the hardest board that benchmark publishes -
    // needs none of the three. Two storeys sat above the reference ladder and
    // this test called that escalation.
    //
    // The gate now names an EXTERNAL fact - `ABOVE_NYT_HARD`, the benchmark's
    // list - and measures the shipped boards against it with the live solver.
    // Move a technique between bands and this fails; leave the bands alone and
    // regenerate a pool that drifts, and this fails too.
    const share = (t: SudokuTier) => {
      const bin = POOL.filter((p) => p.tier === t);
      expect(bin.length, `tier ${t} bin`).toBeGreaterThan(10);
      const hunts = bin.filter((p) =>
        solveWithTechniques(p.givens, 3).techniques.some((id) => ABOVE_NYT_HARD.includes(id)));
      return hunts.length / bin.length;
    };
    expect(share(1), 'a tier-1 board that needs a wing/fish/chain is not NYT Medium').toBe(0);
    expect(share(2), 'a tier-2 board that needs a wing/fish/chain is not NYT Hard').toBe(0);
    expect(share(3), 'tier 3 IS the rung above NYT Hard').toBe(1);
    // …and the ladder's ORDER still agrees with the bands it is rated by. The
    // rater applies the lowest technique that makes progress, so a level out of
    // order would silently over-rate every board that reached it.
    const levels = LADDER_ORDER.map((id) => TECHNIQUE_LEVEL[id]);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!, `${LADDER_ORDER[i]} sits below ${LADDER_ORDER[i - 1]}`)
        .toBeGreaterThanOrEqual(levels[i - 1]!);
    }
  });

  it('grades LENGTH as well as technique — the two levers climb together', () => {
    // The other half of round 27. Every board it shipped before was dug to true
    // minimality, so all three tiers were 24-25 givens and the only thing that
    // changed with the storey was the technique: fifty-seven placements on the
    // ground floor, which is where the twelve-and-a-half-minute tier-1 room
    // came from. `SUDOKU_TIER_GRADE.givens` is the band each tier is dug to.
    const medians: number[] = [];
    for (const t of TIERS) {
      const bin = POOL.filter((p) => p.tier === t);
      const band = SUDOKU_TIER_GRADE[t].givens;
      const gs = bin.map((p) => [...p.givens].filter((c) => c !== '.').length).sort((a, b) => a - b);
      for (const g of gs) {
        expect(g, `tier ${t} board outside ${band[0]}-${band[1]}`).toBeGreaterThanOrEqual(band[0]);
        expect(g).toBeLessThanOrEqual(band[1]);
      }
      medians.push(gs[gs.length >> 1]!);
    }
    expect(medians[0]!, `t1 ${medians[0]} givens vs t2 ${medians[1]}`).toBeGreaterThan(medians[1]!);
    expect(medians[1]!, `t2 ${medians[1]} givens vs t3 ${medians[2]}`).toBeGreaterThan(medians[2]!);
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

/**
 * ROUND 10 BLOCKER (AAA 3.3 [PARITY]) — THE SURGICAL ERASER.
 *
 * Candidate marks ARE the solve at this room's tier ladder (a naked triple or
 * an X-wing is nothing but marks), so no free tap may delete an arbitrary
 * amount of derived work. The eraser peels ONE mark — the last one written —
 * and the key names it before the tap. `clearPencil` survives as the engine's
 * whole-cell verb, but nothing in the room's thumb cluster reaches it.
 */
describe('the eraser is surgical (AAA 3.3)', () => {
  const blank = [...fixture.givens].findIndex((c) => c === '.');
  /** The invariant the two representations owe each other, everywhere. */
  const trailMatchesMask = (s: SudokuEngineState, where: string) => {
    for (let i = 0; i < 81; i++) {
      const fromTrail = s.pencilOrder[i]!.reduce((m, d) => m | (1 << (d - 1)), 0);
      expect(fromTrail, `${where}: cell ${i}`).toBe(s.pencil[i]);
      expect(new Set(s.pencilOrder[i]).size, `${where}: cell ${i} duplicates`).toBe(s.pencilOrder[i]!.length);
    }
  };

  it('takes back the LAST mark written and leaves every other one standing', () => {
    let s = startSudoku(fixture);
    for (const d of [4, 1, 9, 6]) s = togglePencil(s, blank, d);
    expect(lastPencilMark(s, blank)).toBe(6);

    s = erasePencilMark(s, blank);
    expect(lastPencilMark(s, blank)).toBe(9);
    expect(s.pencil[blank]! & (1 << 5)).toBe(0);          // the 6 is gone
    for (const kept of [4, 1, 9]) expect(s.pencil[blank]! & (1 << (kept - 1))).not.toBe(0);

    s = erasePencilMark(s, blank);
    expect(lastPencilMark(s, blank)).toBe(1);             // 9 gone, order held
    trailMatchesMask(s, 'after two peels');

    // Peeled to nothing, then a no-op: never a crash, never a state churn.
    s = erasePencilMark(erasePencilMark(s, blank), blank);
    expect(s.pencil[blank]).toBe(0);
    expect(lastPencilMark(s, blank)).toBe(0);
    expect(erasePencilMark(s, blank)).toBe(s);
  });

  it('never touches the rest of the cell — 6 marks take 6 taps, not one', () => {
    let s = startSudoku(fixture);
    for (const d of [2, 3, 5, 7, 8, 9]) s = togglePencil(s, blank, d);
    const before = s.pencil[blank]!;
    const bits = (m: number) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => m & (1 << (d - 1))).length;
    expect(bits(before)).toBe(6);
    for (let expected = 5; expected >= 0; expected--) {
      s = erasePencilMark(s, blank);
      expect(bits(s.pencil[blank]!)).toBe(expected);
    }
  });

  it('rubbing a mark out of the middle keeps the order she wrote the rest in', () => {
    let s = startSudoku(fixture);
    for (const d of [7, 2, 5]) s = togglePencil(s, blank, d);
    s = togglePencil(s, blank, 2);               // pull the middle one out by hand
    expect(s.pencilOrder[blank]).toEqual([7, 5]);
    expect(lastPencilMark(s, blank)).toBe(5);
    s = togglePencil(s, blank, 2);               // and write it again — it is newest now
    expect(s.pencilOrder[blank]).toEqual([7, 5, 2]);
    expect(lastPencilMark(s, blank)).toBe(2);
    trailMatchesMask(s, 'after a middle toggle');
  });

  it('a machine fill peels back to front, and the sweep stays in step', () => {
    const filled = fillPencil(startSudoku(fixture));
    trailMatchesMask(filled, 'after fill-pencil');
    // No hand-order to honour, so the trail is the cell's own reading order and
    // the eraser takes the highest figure first.
    const marks = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => filled.pencil[blank]! & (1 << (d - 1)));
    expect(lastPencilMark(filled, blank)).toBe(marks[marks.length - 1]);

    // Inking sweeps the figure out of every peer's marks — mask AND trail.
    const truth = Number(fixture.solution[blank]);
    const inked = inkCell(fixture, filled, blank, truth).state;
    expect(inked.pencilOrder[blank]).toEqual([]);
    trailMatchesMask(inked, 'after an ink sweep');
    for (const p of PEERS[blank]!) expect(inked.pencilOrder[p]).not.toContain(truth);
  });

  it('is free at the adapter, and undo puts the mark back', () => {
    let s = sudokuAdapter.start(fixture, ctx(2)) as SudokuRoomState;
    s = sudokuAdapter.reduce(fixture, s, { type: 'fill-pencil' }).state;
    const before = s.engine.pencil[blank]!;
    const doomed = lastPencilMark(s.engine, blank);
    expect(doomed).not.toBe(0);

    const out = sudokuAdapter.reduce(fixture, s, { type: 'erase-mark', cell: blank });
    expect(out.events).toEqual([]);                        // thinking is never priced
    expect(out.outcome.perfect).toBe(true);
    expect(out.state.costedMistakes).toBe(0);
    expect(out.state.engine.pencil[blank]).toBe(before & ~(1 << (doomed - 1)));

    const back = sudokuAdapter.reduce(fixture, out.state, { type: 'undo' }).state;
    expect(back.engine.pencil[blank]).toBe(before);
    expect(lastPencilMark(back.engine, blank)).toBe(doomed);

    // Nothing to peel: a no-op that does not even grow the undo stack.
    const empty = sudokuAdapter.start(fixture, ctx(2)) as SudokuRoomState;
    const nothing = sudokuAdapter.reduce(fixture, empty, { type: 'erase-mark', cell: blank });
    expect(nothing.state).toBe(empty);
    expect(nothing.state.history).toHaveLength(0);
  });
});

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

  it('inks a true figure and sweeps it from peers', () => {
    const blank = [...fixture.givens].findIndex((c) => c === '.');
    const truth = Number(fixture.solution[blank]);
    let s = startSudoku(fixture);

    // Pencil the figure into a peer so the sweep has something to tidy.
    const peer = PEERS[blank]!.find((p) => s.values[p] === 0)!;
    s = togglePencil(s, peer, truth);
    expect(s.pencil[peer]! & (1 << (truth - 1))).not.toBe(0);

    const placed = inkCell(fixture, s, blank, truth);
    expect(placed.result).toBe('placed');
    expect(placed.state.values[blank]).toBe(truth);
    expect(placed.state.pencil[peer]! & (1 << (truth - 1))).toBe(0);
    expect(digitCount(placed.state, truth)).toBe(digitCount(s, truth) + 1);

    // A given is immutable; out-of-range keys are nothing at all (AAA 3.2).
    const given = [...fixture.givens].findIndex((c) => c !== '.');
    expect(inkCell(fixture, placed.state, given, 5).result).toBe('ignored');
    expect(inkCell(fixture, s, blank, 0).result).toBe('ignored');
    expect(inkCell(fixture, s, blank, 10).result).toBe('ignored');
  });

  /**
   * THE ROUND-5 LOAD-BEARING CASE. The leaf must let her be wrong: only a
   * clash the board already showed her is refused, and a solution-wrong but
   * board-legal figure lands and stays. If this ever regresses, an ink is a
   * paid correctness oracle again and the Diabolical band is unenforceable.
   */
  it('refuses only a VISIBLE clash; a board-legal wrong figure lands and lifts', () => {
    const s = startSudoku(fixture);
    const blank = [...fixture.givens].findIndex((c) => c === '.');
    const truth = Number(fixture.solution[blank]);

    // (a) A figure already standing in a peer: malformed, free, never lands.
    const clashPeer = PEERS[blank]!.find((p) => s.values[p] !== 0)!;
    const clashDigit = s.values[clashPeer]!;
    const clash = inkCell(fixture, s, blank, clashDigit);
    expect(clash.result).toBe('malformed');
    expect(clash.conflict).toBe(clashPeer);
    expect(clash.state).toBe(s);

    // (b) A board-legal figure that is NOT the solution's: it lands, unsettled.
    const visible = new Set(PEERS[blank]!.map((p) => s.values[p]!).filter((v) => v !== 0));
    const legalWrong = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => d !== truth && !visible.has(d));
    expect(legalWrong, 'the fixture must admit a board-legal wrong figure').toBeDefined();
    const landed = inkCell(fixture, s, blank, legalWrong!);
    expect(landed.result).toBe('placed');
    expect(landed.state.values[blank]).toBe(legalWrong);
    expect(unsettledCells(fixture, landed.state)).toEqual([blank]);

    // (c) Her own figure lifts back off, free; a given never does.
    const lifted = uninkCell(fixture, landed.state, blank);
    expect(lifted.values[blank]).toBe(0);
    const given = [...fixture.givens].findIndex((c) => c !== '.');
    expect(uninkCell(fixture, landed.state, given)).toBe(landed.state);

    // (d) Re-inking over her own figure is an edit, not a new claim.
    const edited = inkCell(fixture, landed.state, blank, truth);
    expect(edited.result).toBe('placed');
    expect(edited.state.values[blank]).toBe(truth);
  });

  it('balances the books: N of M astray, never named, and free to repeat', () => {
    const s0 = startSudoku(fixture);
    // Nothing set yet → nothing to weigh, and nothing to pay.
    expect(balanceBooks(fixture, s0).report).toEqual({ astray: 0, settled: 0, charged: false });

    const blanks = [...fixture.givens].flatMap((c, i) => (c === '.' ? [i] : []));
    const right = blanks[0]!;
    const wrongAt = blanks.find((i) => {
      if (i === right) return false;
      const visible = new Set(PEERS[i]!.map((p) => s0.values[p]!).filter((v) => v !== 0));
      const t = Number(fixture.solution[i]);
      return [1, 2, 3, 4, 5, 6, 7, 8, 9].some((d) => d !== t && !visible.has(d));
    })!;
    let s = inkCell(fixture, s0, right, Number(fixture.solution[right])).state;
    const visible = new Set(PEERS[wrongAt]!.map((p) => s.values[p]!).filter((v) => v !== 0));
    const t = Number(fixture.solution[wrongAt]);
    const bad = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => d !== t && !visible.has(d))!;
    s = inkCell(fixture, s, wrongAt, bad).state;

    const first = balanceBooks(fixture, s);
    expect(first.report).toEqual({ astray: 1, settled: 2, charged: true });
    // The report never names the cell — only the counts come back.
    expect(Object.keys(first.report)).toEqual(['astray', 'settled', 'charged']);
    // The identical leaf weighed twice is the same claim: free.
    expect(balanceBooks(fixture, first.state).report.charged).toBe(false);
    // Change the leaf and it is a new claim again.
    const moved = uninkCell(fixture, first.state, wrongAt);
    expect(balanceBooks(fixture, moved).report).toEqual({ astray: 0, settled: 1, charged: true });
  });

  /**
   * ROUND 6 BLOCKER (AAA 3.3): "Pencil what fits" sits in the FREE row beside
   * the pencil toggle, so a tap 5px off it must never be able to cost her the
   * solve. It used to ASSIGN the naive mask, restoring the naive fill
   * byte-identical over hand-pruned marks. It is now additive PER CELL — and
   * the obvious "union with existing" is not the fix, because a pruned set is
   * a subset of the naive set, so the union would restore the wipe verbatim.
   */
  it('pencils what fits ADDITIVELY: a second tap can never restore pruned marks', () => {
    const s0 = startSudoku(fixture);
    const filled = fillPencil(s0);
    const blanks = [...fixture.givens].flatMap((c, i) => (c === '.' ? [i] : []));

    // Hand-prune five cells down to a single candidate each — a real morning's
    // deduction, and a strict subset of what the naive fill would say.
    let pruned = filled;
    const bits = (m: number) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => m & (1 << (d - 1))).length;
    const targets = blanks.filter((i) => bits(filled.pencil[i]!) > 1).slice(0, 5);
    expect(targets.length, 'the fixture must offer five multi-candidate cells').toBe(5);
    for (const cell of targets) {
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1);
        if ((pruned.pencil[cell]! & bit) && pruned.pencil[cell] !== bit) {
          pruned = togglePencil(pruned, cell, d);
        }
      }
      expect(pruned.pencil[cell], `cell ${cell} pruned to one`).not.toBe(filled.pencil[cell]);
    }

    // The button again: her work survives, untouched.
    const refilled = fillPencil(pruned);
    for (const cell of targets) {
      expect(refilled.pencil[cell], `cell ${cell} survived the refill`).toBe(pruned.pencil[cell]);
    }
    expect(refilled).toBe(pruned);                     // nothing to add: same object

    // ...and it still does its job on a cell she has NOT marked.
    const untouched = blanks[10]!;
    const clearedOne = clearPencil(pruned, untouched);
    expect(clearedOne.pencil[untouched]).toBe(0);
    const again = fillPencil(clearedOne);
    expect(again.pencil[untouched]).toBe(filled.pencil[untouched]);
    for (const cell of targets) expect(again.pencil[cell]).toBe(pruned.pencil[cell]);

    // It is monotone at the level of marks too: over any sequence of taps, a
    // marked cell never loses a mark to this button — including a mark she
    // added by hand that no candidate rule would have suggested.
    const spare = blanks[11]!;
    const impossible = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .find((d) => (filled.pencil[spare]! & (1 << (d - 1))) === 0);
    if (impossible !== undefined) {
      const byHand = togglePencil(clearPencil(again, spare), spare, impossible);
      expect(fillPencil(byHand).pencil[spare]).toBe(byHand.pencil[spare]);
    }
  });

  it('pencils what fits: free, idempotent, derived only from placed figures', () => {
    const s = startSudoku(fixture);
    const filled = fillPencil(s);
    expect(fillPencil(filled)).toBe(filled);            // idempotent
    for (let i = 0; i < 81; i++) {
      if (s.values[i] !== 0) { expect(filled.pencil[i]).toBe(0); continue; }
      let mask = 0x1ff;
      for (const p of PEERS[i]!) {
        const v = s.values[p]!;
        if (v !== 0) mask &= ~(1 << (v - 1));
      }
      expect(filled.pencil[i], `cell ${i}`).toBe(mask);
      // It never leaks the answer: the true figure survives, and so do others.
      expect(filled.pencil[i]! & (1 << (Number(fixture.solution[i]) - 1))).not.toBe(0);
    }
    // The eraser undoes it cell by cell.
    const blank = [...fixture.givens].findIndex((c) => c === '.');
    expect(clearPencil(filled, blank).pencil[blank]).toBe(0);
  });

  it('the clerk names a real next step, and its unit, without naming a figure', () => {
    const s = startSudoku(fixture);
    const nudge = nextTechniqueNudge(s.values);
    expect(nudge, 'a fresh shipped board must yield a next step').not.toBeNull();
    expect(TECHNIQUE_LEVEL[nudge!.id]).toBeGreaterThanOrEqual(0);
    if (nudge!.unit !== null) {
      expect(nudge!.unit).toBeGreaterThanOrEqual(0);
      expect(nudge!.unit).toBeLessThan(27);
      expect(unitName(nudge!.unit)).toMatch(/^the \w+ (row|column|quarter)$/);
    }
    // Every shipped board's peak technique is reachable from its own start.
    for (const p of SUDOKU_POOL.slice(0, 12)) {
      expect(nextTechniqueNudge(parseGrid(p.givens)), p.id).not.toBeNull();
    }
    // A leaf the ladder cannot read at all buys nothing (the adapter charges
    // nothing for it — no cost for zero information, AAA 3.2).
    const broken = parseGrid(fixture.givens);
    const a = broken.findIndex((v) => v === 0);
    const b = PEERS[a]!.find((p) => broken[p] === 0)!;
    broken[a] = 5;
    broken[b] = 5;                                       // two peers, one figure
    expect(nextTechniqueNudge(broken)).toBeNull();
  });

  it('names units in-world', () => {
    expect(unitName(0)).toBe('the first row');
    expect(unitName(9)).toBe('the first column');
    expect(unitName(26)).toBe('the ninth quarter');
    expect(boxUnitOf(0)).toBe(18);
    expect(boxUnitOf(80)).toBe(26);
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
  const start = () => sudokuAdapter.start(fixture, ctx(2)) as SudokuRoomState;
  /** A figure standing in one of `blank`'s peers — the one refusal that remains. */
  const clashDigit = (() => {
    const s = startSudoku(fixture);
    return s.values[PEERS[blank]!.find((p) => s.values[p] !== 0)!]!;
  })();
  /** A figure no visible peer holds, and not the solution's — legal but astray. */
  const legalWrong = (() => {
    const s = startSudoku(fixture);
    const visible = new Set(PEERS[blank]!.map((p) => s.values[p]!).filter((v) => v !== 0));
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => d !== truth && !visible.has(d))!;
  })();

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

  it('"pencil what fits" is a free tool, not a hint: no events, keeps perfect', () => {
    const out = sudokuAdapter.reduce(fixture, start(), { type: 'fill-pencil' });
    expect(out.events).toEqual([]);
    expect(out.outcome).toEqual({ status: 'active', perfect: true });
    expect(out.state.engine.pencil.some((m) => m !== 0)).toBe(true);
    expect(out.state.costedMistakes + out.state.hintsBought + out.state.nudgesBought).toBe(0);
  });

  it('a VISIBLE clash is a free dead letter: weight 0, nothing lands', () => {
    const out = sudokuAdapter.reduce(fixture, start(), { type: 'ink', cell: blank, digit: clashDigit });
    expect(ofType(out.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    expect(out.state.engine.values[blank]).toBe(0);
    expect(out.state.costedMistakes).toBe(0);
    expect(out.state.lastFeedback).toMatchObject({ kind: 'malformed', cell: blank, digit: clashDigit });
    expect(out.outcome).toEqual({ status: 'active', perfect: true });
  });

  it('a board-legal WRONG figure is free and lands — the leaf lets her be wrong', () => {
    const out = sudokuAdapter.reduce(fixture, start(), { type: 'ink', cell: blank, digit: legalWrong });
    expect(ofType(out.events, 'mistake')).toEqual([]);
    expect(ofType(out.events, 'hint')).toEqual([]);
    expect(out.state.engine.values[blank]).toBe(legalWrong);
    expect(out.state.costedMistakes).toBe(0);
    expect(out.outcome).toEqual({ status: 'active', perfect: true });

    // ...and lifting it back off is free too.
    const lifted = sudokuAdapter.reduce(fixture, out.state, { type: 'unink', cell: blank });
    expect(lifted.events).toEqual([]);
    expect(lifted.state.engine.values[blank]).toBe(0);
  });

  it('nothing-to-do input is silent (AAA 3.2)', () => {
    const s = start();
    const given = [...fixture.givens].findIndex((c) => c !== '.');
    for (const action of [
      { type: 'ink', cell: given, digit: 5 },
      { type: 'ink', cell: blank, digit: 0 },
      { type: 'ink', cell: blank, digit: 10 },
      { type: 'unink', cell: given },
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

  /**
   * ROUND 6 BLOCKER (AAA 3.3, NYT-Sudoku parity): pencil work IS the solve, so
   * the room owes a permanent, free way back from any board edit.
   */
  describe('undo', () => {
    it('walks back every free board edit, in order, and costs nothing', () => {
      let s = start();
      const boards: string[] = [];
      const marks: number[] = [];
      const record = () => { boards.push(JSON.stringify(s.engine.values)); marks.push(s.engine.pencil[blank]!); };

      record();
      for (const action of [
        { type: 'fill-pencil' },
        { type: 'pencil', cell: blank, digit: 3 },
        { type: 'ink', cell: blank, digit: legalWrong },
        { type: 'unink', cell: blank },
      ] as const) {
        const out = sudokuAdapter.reduce(fixture, s, action);
        expect(out.events.filter((e) => e.type !== 'progress'), JSON.stringify(action)).toEqual([]);
        s = out.state;
        record();
      }
      expect(s.history).toHaveLength(4);

      for (let step = 4; step > 0; step--) {
        const out = sudokuAdapter.reduce(fixture, s, { type: 'undo' });
        expect(out.events).toEqual([]);                       // free, always
        s = out.state;
        expect(JSON.stringify(s.engine.values), `undo to step ${step - 1}`).toBe(boards[step - 1]);
        expect(s.engine.pencil[blank]).toBe(marks[step - 1]);
        expect(s.history).toHaveLength(step - 1);
      }
      // Nothing left to undo: a no-op, not a crash and not a state churn.
      const spent = sudokuAdapter.reduce(fixture, s, { type: 'undo' });
      expect(spent.state).toBe(s);
      expect(spent.events).toEqual([]);
      expect(spent.outcome.perfect).toBe(true);
    });

    it('rescues hand-pruned marks from a stray free verb', () => {
      let s = start();
      s = sudokuAdapter.reduce(fixture, s, { type: 'fill-pencil' }).state;
      s = sudokuAdapter.reduce(fixture, s, { type: 'pencil', cell: blank, digit: 3 }).state;
      const kept = s.engine.pencil[blank];

      // "Pencil what fits" is now incapable of the wipe on its own...
      const refill = sudokuAdapter.reduce(fixture, s, { type: 'fill-pencil' });
      expect(refill.state).toBe(s);
      expect(refill.state.engine.pencil[blank]).toBe(kept);

      // ...and the eraser, which IS destructive by design, has a way back.
      s = sudokuAdapter.reduce(fixture, s, { type: 'clear-pencil', cell: blank }).state;
      expect(s.engine.pencil[blank]).toBe(0);
      s = sudokuAdapter.reduce(fixture, s, { type: 'undo' }).state;
      expect(s.engine.pencil[blank]).toBe(kept);
    });

    it('restores the BOARD only: steps stay spent and a weighed leaf stays weighed', () => {
      let s = start();
      s = sudokuAdapter.reduce(fixture, s, { type: 'ink', cell: blank, digit: legalWrong }).state;
      s = sudokuAdapter.reduce(fixture, s, { type: 'balance' }).state;
      expect(s.costedMistakes).toBe(1);
      const weighed = s.engine.balancedSignatures;
      expect(weighed).toHaveLength(1);

      // Balancing changes no cell, so it is not an undo step: one undo lands
      // on the leaf before the ink.
      const undone = sudokuAdapter.reduce(fixture, s, { type: 'undo' });
      expect(undone.state.engine.values[blank]).toBe(0);
      expect(undone.state.costedMistakes).toBe(1);            // never refunded
      expect(undone.outcome.perfect).toBe(false);             // and never laundered
      // Monotone claim memory: walking back to a leaf she already weighed must
      // not make it chargeable a second time.
      expect(undone.state.engine.balancedSignatures).toEqual(weighed);
      const redone = sudokuAdapter.reduce(fixture, undone.state, { type: 'ink', cell: blank, digit: legalWrong });
      const again = sudokuAdapter.reduce(fixture, redone.state, { type: 'balance' });
      expect(ofType(again.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0, detail: 'balanced-astray' }]);
      expect(again.state.costedMistakes).toBe(1);
    });

    it('never walks a bought figure back off the leaf, and never un-wins a leaf', () => {
      let s = start();
      s = sudokuAdapter.reduce(fixture, s, { type: 'pencil', cell: blank, digit: 3 }).state;
      expect(s.history).toHaveLength(1);
      const bought = sudokuAdapter.reduce(fixture, s, { type: 'reveal-cell', cell: blank });
      // The purchase seals the leaf: there is nothing behind it to undo.
      expect(bought.state.history).toEqual([]);
      const tryUndo = sudokuAdapter.reduce(fixture, bought.state, { type: 'undo' });
      expect(tryUndo.state).toBe(bought.state);
      expect(tryUndo.state.engine.values[blank]).toBe(truth);
      expect(tryUndo.state.engine.revealed).toEqual([blank]);

      // A won leaf is final — the room has already reported `solved`.
      let full = start();
      for (let cell = 0; cell < 81; cell++) {
        if (full.engine.values[cell] !== 0) continue;
        full = sudokuAdapter.reduce(
          fixture, full, { type: 'ink', cell, digit: Number(fixture.solution[cell]) },
        ).state;
      }
      expect(full.engine.status).toBe('won');
      const afterWin = sudokuAdapter.reduce(fixture, full, { type: 'undo' });
      expect(afterWin.state).toBe(full);
      expect(afterWin.outcome.status).toBe('solved');
    });

    it('bounds the history so a long solve cannot grow without limit', () => {
      let s = start();
      const blanks = [...fixture.givens].flatMap((c, i) => (c === '.' ? [i] : []));
      for (let i = 0; i < UNDO_DEPTH + 20; i++) {
        const cell = blanks[i % blanks.length]!;
        s = sudokuAdapter.reduce(fixture, s, { type: 'pencil', cell, digit: (i % 9) + 1 }).state;
      }
      expect(s.history).toHaveLength(UNDO_DEPTH);
      // The most recent edits are the ones that survive.
      const back = sudokuAdapter.reduce(fixture, s, { type: 'undo' }).state;
      expect(back.history).toHaveLength(UNDO_DEPTH - 1);
    });
  });

  it('balancing the books is the ONE priced claim, and free to repeat', () => {
    let s = start();
    // Nothing set yet: zero information, therefore zero cost.
    const empty = sudokuAdapter.reduce(fixture, s, { type: 'balance' });
    expect(ofType(empty.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0, detail: 'balanced-true' }]);
    expect(empty.outcome.perfect).toBe(true);

    s = sudokuAdapter.reduce(fixture, s, { type: 'ink', cell: blank, digit: legalWrong }).state;
    const first = sudokuAdapter.reduce(fixture, s, { type: 'balance' });
    expect(ofType(first.events, 'mistake')).toEqual([{ type: 'mistake', weight: 1, detail: 'balanced-astray' }]);
    expect(first.state.lastFeedback).toEqual({
      kind: 'balanced', astray: 1, settled: 1, charged: true,
    });
    expect(first.state.costedMistakes).toBe(1);
    expect(first.outcome.perfect).toBe(false);

    // The identical leaf is the identical claim: free the second time.
    const again = sudokuAdapter.reduce(fixture, first.state, { type: 'balance' });
    expect(ofType(again.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0, detail: 'balanced-astray' }]);
    expect(again.state.costedMistakes).toBe(1);
  });

  it('the clerk\'s nudge is a weight-1 hint that KEEPS perfect (it teaches)', () => {
    const out = sudokuAdapter.reduce(fixture, start(), { type: 'nudge' });
    expect(ofType(out.events, 'hint')).toEqual([{ type: 'hint', weight: 1 }]);
    expect(out.state.nudgesBought).toBe(1);
    expect(out.state.hintsBought).toBe(0);
    expect(out.state.lastFeedback).toMatchObject({ kind: 'nudge' });
    expect(out.outcome.perfect).toBe(true);
  });

  it('consulting a FIGURE is dearer than the nudge and forfeits perfect', () => {
    const out = sudokuAdapter.reduce(fixture, start(), { type: 'reveal-cell', cell: blank });
    expect(ofType(out.events, 'hint')).toEqual([{ type: 'hint', weight: 2 }]);
    expect(ofType(out.events, 'mistake')).toEqual([]);
    expect(out.state.hintsBought).toBe(1);
    expect(out.state.engine.revealed).toEqual([blank]);
    expect(out.state.engine.values[blank]).toBe(truth);
    expect(out.outcome.perfect).toBe(false);
  });

  it('a bought figure displaces her own wrong ink standing in its way', () => {
    let s = start();
    const target = PEERS[blank]!.find((p) => s.engine.values[p] === 0)!;
    // Put the target's true figure in one of ITS peers, legally.
    const targetTruth = Number(fixture.solution[target]);
    const host = PEERS[target]!.find((p) => {
      if (s.engine.values[p] !== 0) return false;
      return !PEERS[p]!.some((q) => s.engine.values[q] === targetTruth);
    });
    if (host === undefined) return;                    // fixture-dependent; skip
    s = sudokuAdapter.reduce(fixture, s, { type: 'ink', cell: host, digit: targetTruth }).state;
    const out = sudokuAdapter.reduce(fixture, s, { type: 'reveal-cell', cell: target });
    expect(out.state.engine.values[target]).toBe(targetTruth);
    expect(out.state.engine.values[host]).toBe(0);      // hers was lifted, not hers named
  });

  it('solves clean → perfect; solves after a charged balance → not perfect', () => {
    for (const stumble of [false, true]) {
      let s = start();
      if (stumble) {
        s = sudokuAdapter.reduce(fixture, s, { type: 'ink', cell: blank, digit: legalWrong }).state;
        s = sudokuAdapter.reduce(fixture, s, { type: 'balance' }).state;
        s = sudokuAdapter.reduce(fixture, s, { type: 'unink', cell: blank }).state;
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

  /**
   * The honesty this whole rewrite rests on: because a visible clash never
   * lands, a FULL leaf has no duplicate in any unit, and the board's solution
   * is generator-verified unique — so "full" and "correct" are the same event
   * and `won` never fires on a wrong grid.
   */
  it('a full leaf is always the solution — win cannot fire on a wrong grid', () => {
    for (const p of SUDOKU_POOL.slice(0, 8)) {
      let s = startSudoku(p);
      for (let cell = 0; cell < 81; cell++) {
        if (s.values[cell] !== 0) continue;
        s = inkCell(p, s, cell, Number(p.solution[cell])).state;
      }
      expect(s.status, p.id).toBe('won');
      expect(gridToString(s.values), p.id).toBe(p.solution);
      expect(balanceBooks(p, s).report.astray, p.id).toBe(0);
    }
  });
});
