import { describe, expect, it } from 'vitest';
import twistleData from '../../content/generated/twistle.json';
import type { TwistlePuzzle } from '../../src/engine/types';
import {
  centerIndex, findPath, gridSize, puzzleSize,
  startTwistle, submitTwistleWord,
} from '../../src/engine/twistle';
import { twistleAdapter } from '../../src/engine/rooms/adapters/twistle';

/**
 * tests/puzzles/twistle-boards.test.ts — OWNER: A3.
 *
 * The Gallery's board contract, replayed against the SHIPPED JSON (the same
 * discipline as micro-content-lint: the generator asserts these at build time,
 * this suite fails CI if the committed pool ever disagrees, whether or not the
 * generator was re-run honestly).
 *
 * Round 4, "bigger grids, twistier paths": tier 3 is a 6×6 board, tiers 1–2
 * stay 5×5, and every tier-3 target must still be traceable through the marked
 * centre tile. The 6×6 is the case with teeth — `centerIndex` has no true
 * centre for an even board, `GRID_SIZE`/`CENTER_INDEX` are 5×5 constants that
 * must never be used to index one of these grids, and a board whose targets
 * cannot actually be drawn is an unwinnable room.
 */

const POOL = twistleData as TwistlePuzzle[];

/** Board side length per tier — the shipped contract. */
const SIZE_BY_TIER: Record<number, number> = { 1: 5, 2: 5, 3: 6 };

/**
 * ROUND 19 — an explicit budget for the two whole-pool trace walks.
 *
 * Both of them re-run `findPath` over EVERY target of EVERY shipped board and
 * assert on each hop, which is ~3.4s and ~6.6s of real work. Under vitest's
 * default 5000ms they passed when run alone and timed out when the full suite
 * had every core busy — a flake whose failure message ("Test timed out") says
 * nothing about the Gallery and everything about the machine. The work is
 * deliberate (the shipped pool is the thing under test, not a sample of it), so
 * the budget is stated rather than the coverage reduced.
 */
const POOL_WALK_MS = 30_000;

const byTier = (tier: number) => POOL.filter((p) => p.tier === tier);

describe('twistle board sizes (the Gallery grows at the top of the manor)', () => {
  it('ships a healthy pool at every tier', () => {
    for (const tier of [1, 2, 3]) {
      expect(byTier(tier).length, `tier ${tier}`).toBeGreaterThanOrEqual(50);
    }
  });

  it('tier 3 boards are 6×6', () => {
    const t3 = byTier(3);
    expect(t3.length).toBeGreaterThan(0);
    for (const p of t3) {
      expect(p.size, p.id).toBe(6);
      expect(p.grid.length, p.id).toBe(36);
      // Derived and declared size must agree — the engine trusts the grid.
      expect(gridSize(p.grid), p.id).toBe(6);
      expect(puzzleSize(p), p.id).toBe(6);
    }
  });

  it('tier 1 and tier 2 boards stay 5×5', () => {
    for (const tier of [1, 2]) {
      const boards = byTier(tier);
      expect(boards.length, `tier ${tier}`).toBeGreaterThan(0);
      for (const p of boards) {
        expect(p.size, p.id).toBe(5);
        expect(p.grid.length, p.id).toBe(25);
      }
    }
  });

  it('every board declares the size its tier promises', () => {
    for (const p of POOL) {
      const want = SIZE_BY_TIER[p.tier]!;
      expect(puzzleSize(p), `${p.id} (tier ${p.tier})`).toBe(want);
      expect(p.grid.every((c) => /^[A-Z]$/.test(c)), p.id).toBe(true);
    }
  });
});

describe('twistle board solvability (every shipped Gallery can be hung)', () => {
  it('every target word has a legal trace under its own rules', () => {
    for (const p of POOL) {
      for (const w of p.targetWords) {
        const path = findPath(p.grid, w, p.rules);
        expect(path, `${p.id}: ${w}`).not.toBeNull();
        // A trace never reuses a tile and never leaves the board.
        expect(new Set(path!).size, `${p.id}: ${w} reuses a tile`).toBe(w.length);
        for (const i of path!) expect(i, `${p.id}: ${w} off-board`).toBeLessThan(p.grid.length);
      }
    }
  }, POOL_WALK_MS);

  it('tier-3 traces pass through the marked centre tile of the 6×6', () => {
    const centre = centerIndex(6);
    // Guard the derivation itself: floor(n²/2) would put the "centre" of a 6×6
    // on the left wall (18); the real middle tile is row 2, col 2.
    expect(centre).toBe(14);
    for (const p of byTier(3)) {
      expect(p.rules.centerRequired, p.id).toBe(true);
      expect(p.rules.minLength, p.id).toBe(5);
      for (const w of p.targetWords) {
        expect(w.length, `${p.id}: ${w}`).toBeGreaterThanOrEqual(5);
        expect(findPath(p.grid, w, p.rules)!.includes(centre), `${p.id}: ${w}`).toBe(true);
      }
    }
  });

  it('every board can be played to a win through the real engine', () => {
    for (const p of POOL) {
      expect(p.targetWords.length, p.id).toBeGreaterThanOrEqual(p.targetCount);
      let s = startTwistle(p);
      for (const w of p.targetWords) {
        if (s.status === 'won') break;
        const r = submitTwistleWord(p, s, w);
        expect(r.result.kind, `${p.id}: ${w}`).toBe('valid');
        s = r.state;
      }
      expect(s.status, p.id).toBe('won');
      expect(s.wrongAttempts, p.id).toBe(0);
    }
  });

  /**
   * ROUND 10 — the hung sheet's contract (AAA 3.4). The Gallery's win screen
   * draws every claimed word back onto the board, and it does that by asking
   * `findPath` for the trace again rather than storing one; so for every word
   * the room can ever have accepted, the trace must exist, stay inside the
   * grid, and be a real king-move walk with no reused tile. If any of that
   * fails, the celebration silently draws a broken polyline over the letters.
   */
  it('every claimable word can be re-traced for the hung sheet', () => {
    for (const p of POOL) {
      const n = puzzleSize(p);
      for (const w of p.targetWords) {
        const path = findPath(p.grid, w, p.rules);
        expect(path, `${p.id}: ${w}`).not.toBeNull();
        expect(path!.length, `${p.id}: ${w} length`).toBe(w.length);
        expect(new Set(path!).size, `${p.id}: ${w} reuses a tile`).toBe(path!.length);
        for (const idx of path!) {
          expect(idx, `${p.id}: ${w} off-grid`).toBeGreaterThanOrEqual(0);
          expect(idx, `${p.id}: ${w} off-grid`).toBeLessThan(p.grid.length);
        }
        for (let i = 1; i < path!.length; i++) {
          const a = path![i - 1]!;
          const b = path![i]!;
          const dr = Math.abs(Math.floor(a / n) - Math.floor(b / n));
          const dc = Math.abs((a % n) - (b % n));
          expect(dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0), `${p.id}: ${w} jumps`).toBe(true);
        }
      }
    }
  }, POOL_WALK_MS);

  it('a 6×6 board played through the adapter solves and reports perfect', () => {
    const p = byTier(3)[0]!;
    let state = twistleAdapter.start(p, { tier: 3, seed: 1, volumeId: 'volume-1' });
    let solved = false;
    for (const w of p.targetWords.slice(0, p.targetCount)) {
      const r = twistleAdapter.reduce(p, state, { type: 'submit', word: w });
      state = r.state;
      solved = r.outcome.status === 'solved';
    }
    expect(solved, p.id).toBe(true);
    expect(state.costedMistakes, p.id).toBe(0);
  });
});

describe('twistle twist floors (the tier-3 promise is measured, not asserted)', () => {
  /** Direction changes along a trace — recomputed here, independent of the generator. */
  function turnsOf(path: readonly number[], n: number): number {
    let turns = 0;
    let prev: string | null = null;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!;
      const step = `${Math.floor(b / n) - Math.floor(a / n)},${(b % n) - (a % n)}`;
      if (prev !== null && step !== prev) turns++;
      prev = step;
    }
    return turns;
  }

  it('tier 3 has no straight-line gimme: every target turns at least twice', () => {
    // findPath returns *a* trace, not necessarily the straightest, so this is a
    // weaker bar than the generator's (which minimises over all traces). It is
    // still the regression guard that matters: if the tortuosity pass is ever
    // dropped, tier-3 boards fill with straight runs and this fails.
    for (const p of byTier(3)) {
      for (const w of p.targetWords) {
        const path = findPath(p.grid, w, p.rules)!;
        expect(turnsOf(path, puzzleSize(p)), `${p.id}: ${w}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
