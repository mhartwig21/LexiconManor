import { describe, expect, it } from 'vitest';
import { BASE_DECK, cardById } from '../../src/engine/manor/deck';
import { rollCards } from '../../src/engine/manor/drafting';
import { createManor, roomSeed, cellKey, rowTier } from '../../src/engine/manor/grid';
import { getRoomAdapter } from '../../src/engine/rooms/registry';
import type { Cell, RoomCard, Tier } from '../../src/engine/types';
import type { RoomPuzzleKind } from '../../src/engine/rooms/room-puzzle';

/**
 * tests/puzzles/tier-flow.test.ts — OWNER: A3 (round 4, "escalating difficulty
 * as you move closer to the door").
 *
 * The end-to-end proof that the manor's SPATIAL difficulty is real: a draft at
 * a top-row door must hand back a TIER-3 puzzle, and one at the bottom a
 * tier-1 puzzle. Three links have to hold, and each has quietly broken before:
 *
 *   1. grid.rowTier(row)      — rows 0–2 / 3–4 / 5–6 → tier 1 / 2 / 3;
 *   2. deck.tierRange         — every surviving puzzle card must actually be
 *                               draftable at the top of the house, or the row
 *                               never gets to ask for tier 3;
 *   3. adapter.select({tier}) — must return a puzzle STAMPED with that tier
 *                               (this is what the old difficulty-band selector
 *                               got wrong: tier 3 and tier 2 both served
 *                               'hard', so the rows played identically).
 *
 * The test walks the same call path `app/slices/manor.ts#chooseDraftCard` uses:
 * roll a real offer at a row-6 cell, then select through the real adapter with
 * the real per-room seed.
 */

const PUZZLE_KINDS: RoomPuzzleKind[] = [
  'word-web', 'hive', 'twistle', 'forgotten-word', 'cipher', 'crossword',
];

/** The puzzle cards for a kind, as the deck actually ships them. */
function cardsFor(kind: RoomPuzzleKind): RoomCard[] {
  return BASE_DECK.filter((c) => c.puzzleKind === kind);
}

describe('row → tier → puzzle (the spatial difficulty curve)', () => {
  it('rowTier maps the seven rows onto exactly three bands', () => {
    expect([0, 1, 2].map(rowTier)).toEqual([1, 1, 1]);
    expect([3, 4].map(rowTier)).toEqual([2, 2]);
    expect([5, 6].map(rowTier)).toEqual([3, 3]);
  });

  it('every surviving puzzle kind is draftable at the top of the house', () => {
    for (const kind of PUZZLE_KINDS) {
      const cards = cardsFor(kind);
      expect(cards.length, kind).toBeGreaterThan(0);
      expect(cards.some((c) => c.tierRange[0] <= 3 && 3 <= c.tierRange[1]), `${kind} at tier 3`).toBe(true);
    }
  });

  it('every surviving puzzle kind has a tier-3 pool behind it', () => {
    for (const kind of PUZZLE_KINDS) {
      const adapter = getRoomAdapter(kind)!;
      expect(adapter, kind).toBeTruthy();
      const puzzle = adapter.select({ tier: 3, seed: 4242, seenIds: [] }) as { tier?: Tier };
      expect(puzzle.tier, `${kind} tier-3 selection`).toBe(3);
    }
  });

  /**
   * The headline guarantee: a real draft at a row-6 door, resolved through the
   * real adapter with the real room seed, is tier 3 — for every card the deck
   * can offer up there, across many day seeds.
   */
  it('a row-6 draft yields tier-3 puzzles (and a row-0 draft tier-1 ones)', () => {
    const bands: { row: number; tier: Tier }[] = [
      { row: 6, tier: 3 },
      { row: 3, tier: 2 },
      { row: 0, tier: 1 },
    ];

    for (const { row, tier } of bands) {
      let puzzleCardsSeen = 0;
      for (let daySeed = 1; daySeed <= 60; daySeed++) {
        const manor = createManor(daySeed);
        const target: Cell = { col: 1, row: row as Cell['row'] };
        const cards = rollCards(BASE_DECK, manor, target, {
          gems: 2, declinedLastDraft: [], drawIndex: 0,
        });
        expect(cards.length, `row ${row} seed ${daySeed}`).toBeGreaterThan(0);

        for (const card of cards) {
          // Link 2: the deck may never offer a card outside the row's band.
          expect(card.tierRange[0], `${card.id} at row ${row}`).toBeLessThanOrEqual(rowTier(row));
          expect(card.tierRange[1], `${card.id} at row ${row}`).toBeGreaterThanOrEqual(rowTier(row));
          if (!card.puzzleKind) continue;
          puzzleCardsSeen++;

          // Link 3: exactly the call chooseDraftCard makes.
          const adapter = getRoomAdapter(card.puzzleKind)!;
          const puzzle = adapter.select({
            tier: rowTier(target.row),
            seed: roomSeed(manor.daySeed, cellKey(target)),
            seenIds: [],
          }) as { tier?: Tier };
          expect(puzzle.tier, `${card.id} drafted at row ${row}`).toBe(tier);
        }
      }
      expect(puzzleCardsSeen, `row ${row} offered no puzzle rooms`).toBeGreaterThan(0);
    }
  });

  it('the scripted day-1 draft still resolves to tier-1 puzzles', () => {
    const manor = createManor(99);
    const target: Cell = { col: 1, row: 1 };
    const cards = rollCards(BASE_DECK, manor, target, {
      gems: 0, declinedLastDraft: [], drawIndex: 0, scripted: true,
    });
    for (const card of cards) {
      expect(cardById(card.id), card.id).toBeTruthy();
      if (!card.puzzleKind) continue;
      const puzzle = getRoomAdapter(card.puzzleKind)!.select({
        tier: rowTier(target.row),
        seed: roomSeed(manor.daySeed, cellKey(target)),
        seenIds: [],
      }) as { tier?: Tier };
      expect(puzzle.tier, card.id).toBe(1);
    }
  });
});
