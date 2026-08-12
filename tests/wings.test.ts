/**
 * THE WINGS — REVIEW_AA §5.7 ("make drafting a decision"). OWNER: A1 (Manor).
 *
 * The review's charge against the drafting layer, on the axis it says Blue
 * Prince owns outright: *"where you place a room IS the problem… the North wing
 * is a spatial argument you conduct against the grid across dozens of runs, and
 * the knowledge you accumulate is permanent even though the house is not.
 * Lexicon Manor's floorplan is a corridor generator with a price list."*
 *
 * `engine/manor/wings.ts` is the answer, and this file holds it to the four
 * things that make it an answer rather than a decoration:
 *
 *   1. a column MEANS something (it never did — `rowTier` owned the whole game);
 *   2. what she builds tonight is what the papers keep, and one stray evening
 *      cannot rewrite the house;
 *   3. a remembered wing changes the OFFER — and changes the violet supply by
 *      exactly nothing, which is what keeps AAA 4.10g out of this mechanic;
 *   4. the three doors out of one room stop being three copies of one sentence
 *      (REVIEW_AA §4: *"the labels still tell you nothing about the decision,
 *      and one of them is wrong"*).
 */

import { describe, expect, it } from 'vitest';
import type { Cell, DayRecord, ManorState, PlacedRoom, RoomCategory } from '../src/engine/types';
import { MANOR_COLS } from '../src/engine/types';
import {
  colsOfWing, rememberedWings, wingCharacterOf, wingOf, wingTallyOf,
  WING_CHARACTERS, WING_IDS, WING_MEMORY,
} from '../src/engine/manor/wings';
import {
  cardWeight, rollCards, wingBoost, WING_AFFINITY, type DraftRollCtx,
} from '../src/engine/manor/drafting';
import { BASE_DECK, deckFor } from '../src/engine/manor/deck';
import { cellKey, createManor, ENTRANCE_KEY, rowTier } from '../src/engine/manor/grid';
import { draftLabel } from '../src/ui/blueprint/pricing';
import { moveAt, stepWords } from '../src/engine/economy/steps';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function placed(col: number, row: number, kind: PlacedRoom['kind']): PlacedRoom {
  return {
    cardId: `x-${col}-${row}`, cell: { col: col as Cell['col'], row },
    doors: ['N', 'S'], solved: false, kind,
  };
}

function manorWith(rooms: PlacedRoom[]): ManorState {
  const base = createManor(7);
  const out = { ...base, rooms: { ...base.rooms } };
  for (const r of rooms) out.rooms[cellKey(r.cell)] = r;
  return out;
}

function record(day: number, wings?: DayRecord['wings']): DayRecord {
  return {
    day, endedAt: day, cause: 'steps-exhausted', roomsDrafted: 0, roomsSolved: 0,
    stepsSpent: 0, fragmentsFound: 0, wings,
  };
}

const ctx = (over: Partial<DraftRollCtx> = {}): DraftRollCtx => ({
  gems: 2, declinedLastDraft: [], drawIndex: 0, ...over,
});

// ---------------------------------------------------------------------------

describe('1. a column means something', () => {
  it('splits the five columns into two wings and a stair hall', () => {
    expect(wingOf(0)).toBe('west');
    expect(wingOf(1)).toBe('west');
    expect(wingOf(2)).toBe('stair');
    expect(wingOf(3)).toBe('east');
    expect(wingOf(4)).toBe('east');
  });

  it('covers every column exactly once — no cell belongs to two wings or none', () => {
    const seen = WING_IDS.flatMap((w) => colsOfWing(w));
    expect(seen.sort()).toEqual(Array.from({ length: MANOR_COLS }, (_, i) => i));
  });

  it('puts the Entrance Hall and the sealed Sanctum in the same (stair) column', () => {
    // The spine of the house is where she climbs; the wings are what she
    // climbs past. If this ever stops holding, the ascent belongs to a wing and
    // the whole "argue the house into a shape" reading collapses.
    const manor = createManor(1);
    const entrance = manor.rooms[ENTRANCE_KEY]!;
    expect(wingOf(entrance.cell.col)).toBe('stair');
  });
});

describe('2. what tonight makes of the house', () => {
  it('needs two rooms of one category, and a clear lead, before a wing says anything', () => {
    expect(wingCharacterOf(manorWith([placed(0, 1, 'word-web')])).west).toBeUndefined();
    expect(wingCharacterOf(manorWith([
      placed(0, 1, 'word-web'), placed(1, 1, 'cipher'),
    ])).west).toBe('puzzle');
    // A tie says nothing — two blue and two yellow is not an argument.
    expect(wingCharacterOf(manorWith([
      placed(0, 1, 'word-web'), placed(1, 1, 'cipher'),
      placed(0, 2, 'parlor'), placed(1, 2, 'parlor'),
    ])).west).toBeUndefined();
  });

  it('never lets the green or violet deck become a wing (the two exclusions)', () => {
    const green = manorWith([placed(3, 1, 'utility'), placed(4, 1, 'utility')]);
    expect(wingCharacterOf(green).east).toBeUndefined();
    const violet = manorWith([placed(3, 1, 'mystery'), placed(4, 1, 'mystery')]);
    expect(wingCharacterOf(violet).east).toBeUndefined();
    // …and they are not merely unreported: they are not counted at all, so a
    // wing full of larders cannot out-vote two libraries somewhere else.
    expect(wingTallyOf(green).east).toEqual({});
    expect(WING_CHARACTERS).toEqual(['puzzle', 'parlor']);
  });

  it('ignores the two pre-placed rooms — the house is not her argument about it', () => {
    // Without this the Stair Hall would be handed a free parlor (the Entrance
    // Hall) and a free violet (the Sanctum) at dawn on every single day.
    const bare = createManor(3);
    expect(wingTallyOf(bare)).toEqual({ west: {}, stair: {}, east: {} });
    expect(wingCharacterOf(bare)).toEqual({});
  });

  it('reads each wing independently', () => {
    const both = manorWith([
      placed(0, 1, 'word-web'), placed(1, 1, 'twistle'),
      placed(3, 1, 'parlor'), placed(4, 1, 'parlor'),
    ]);
    expect(wingCharacterOf(both)).toEqual({ west: 'puzzle', east: 'parlor' });
  });
});

describe('3. the papers keep the plan (the thing that survives the night)', () => {
  it('commits after the published number of agreeing evenings, not before', () => {
    const one = [record(1, { west: 'puzzle' })];
    expect(rememberedWings(one).west).toBeUndefined();
    const two = [record(1, { west: 'puzzle' }), record(2, { west: 'puzzle' })];
    expect(rememberedWings(two).west).toBe('puzzle');
    expect(WING_MEMORY.eveningsToRemember).toBe(2);
  });

  it('is not rewritten by one stray Tuesday', () => {
    const records = [
      record(1, { west: 'puzzle' }), record(2, { west: 'puzzle' }),
      record(3, { west: 'puzzle' }), record(4, { west: 'parlor' }),
    ];
    expect(rememberedWings(records).west).toBe('puzzle');
  });

  it('falls silent while the argument is genuinely tied', () => {
    const records = [
      record(1, { east: 'puzzle' }), record(2, { east: 'puzzle' }),
      record(3, { east: 'parlor' }), record(4, { east: 'parlor' }),
    ];
    expect(rememberedWings(records).east).toBeUndefined();
  });

  it('survives days that argued for nothing, and days from before the wings existed', () => {
    // `DayRecord.wings` is optional precisely so a save written by an older
    // build migrates by doing nothing (the `highestRow` pattern).
    const records = [
      record(1), record(2, {}), record(3, { east: 'parlor' }),
      record(4), record(5, { east: 'parlor' }),
    ];
    expect(rememberedWings(records).east).toBe('parlor');
  });
});

describe('4. a remembered wing changes the offer', () => {
  const shareOf = (
    category: RoomCategory, row: number, c: DraftRollCtx,
  ): number => {
    const tier = rowTier(row);
    const pool = BASE_DECK.filter((k) => k.tierRange[0] <= tier && tier <= k.tierRange[1]);
    const boost = wingBoost(pool, row, c);
    let hit = 0;
    let all = 0;
    for (const card of pool) {
      const w = cardWeight(card, row, c) * boost(card);
      all += w;
      if (card.category === category) hit += w;
    }
    return hit / all;
  };

  it('lifts its own character behind its own doors', () => {
    const bare = shareOf('puzzle', 1, ctx({ targetCol: 0 }));
    const kept = shareOf('puzzle', 1, ctx({ targetCol: 0, wings: { west: 'puzzle' } }));
    expect(kept).toBeGreaterThan(bare);
    // …and it is a nudge, not a replacement (AAA 4.6 — still a decision).
    expect(kept).toBeLessThan(1);
    expect(kept / bare).toBeLessThan(WING_AFFINITY);
  });

  it('does nothing at a door into another wing', () => {
    const wings = { west: 'puzzle' as const };
    expect(shareOf('puzzle', 1, ctx({ targetCol: 3, wings })))
      .toBeCloseTo(shareOf('puzzle', 1, ctx({ targetCol: 3 })), 10);
    expect(shareOf('puzzle', 1, ctx({ targetCol: 2, wings })))
      .toBeCloseTo(shareOf('puzzle', 1, ctx({ targetCol: 2 })), 10);
  });

  it('MOVES THE VIOLET SUPPLY BY EXACTLY ZERO, at every row (AAA 4.10g)', () => {
    // The clause this protects is arithmetic, not taste: a page can only be
    // made out if she has met a violet room to seal one, and 4.10g publishes
    // the median player's made-out rate with four points of headroom over its
    // own floor. An unnormalised wing boost took its increase out of every
    // other category including violet, and measured her straight through it
    // (24.0% → 18.9%). Nothing about a floorplan may spend the mystery's
    // supply, so the term is normalised over the non-mystery pool and this is
    // an EQUALITY, not a band.
    for (let row = 0; row < 7; row++) {
      for (const character of WING_CHARACTERS) {
        const wings = { west: character };
        expect(shareOf('mystery', row, ctx({ targetCol: 0, wings })))
          .toBeCloseTo(shareOf('mystery', row, ctx({ targetCol: 0 })), 10);
      }
    }
  });

  it('shows up in real offers rolled through the live draw', () => {
    const deck = deckFor([]);
    const target: Cell = { col: 0, row: 1 };
    const count = (wings?: { west: 'puzzle' }) => {
      let blue = 0;
      let cards = 0;
      for (let seed = 0; seed < 900; seed++) {
        for (const card of rollCards(deck, createManor(seed), target, ctx({ wings }))) {
          cards += 1;
          if (card.category === 'puzzle') blue += 1;
        }
      }
      return blue / cards;
    };
    expect(count({ west: 'puzzle' })).toBeGreaterThan(count());
  });

  it('never costs an offer its guaranteed free card (AAA 4.1)', () => {
    const deck = deckFor([]);
    for (let seed = 0; seed < 400; seed++) {
      for (const col of [0, 2, 4]) {
        const cards = rollCards(deck, createManor(seed), { col: col as Cell['col'], row: 3 },
          ctx({ gems: 0, wings: { west: 'parlor', east: 'puzzle' } }));
        expect(cards.length).toBe(3);
        expect(cards.some((c) => c.gemCost === 0)).toBe(true);
      }
    }
  });
});

describe('5. the three doors stop reading as one sentence (REVIEW_AA §4)', () => {
  it('names the wing, so the doors out of the Entrance Hall differ', () => {
    // The exact defect: out of the hall she gets three draft targets and the
    // labels read "Draft a room on the ground floor — 1 step" twice and "on
    // the half landing" once. Two of the three still go to the same STOREY;
    // what tells them apart is the wing, and now the label says so.
    const west = draftLabel(0, 0, wingOf(1));
    const east = draftLabel(0, 0, wingOf(3));
    const up = draftLabel(0, 1, wingOf(2));
    expect(new Set([west, east, up]).size).toBe(3);
    expect(west).toContain('West Wing');
    expect(east).toContain('East Wing');
    expect(up).toContain('Stair Hall');
  });

  it('says what the papers remember the wing for, once they remember it', () => {
    expect(draftLabel(0, 0, 'west')).not.toContain('reading half');
    expect(draftLabel(0, 0, 'west', 'puzzle')).toContain('the reading half of the house');
    expect(draftLabel(0, 0, 'east', 'parlor')).toContain('where the household sits');
  });

  it('still names the price it always named', () => {
    // ROUND 42 — pluralised. A move costs one, so this label reads "1 step" and
    // the assertion reads it out of the same helper the label does rather than
    // hand-building "N steps" (which is how "1 steps" would have shipped).
    expect(draftLabel(0, 1, 'stair')).toContain(stepWords(-moveAt(0)));
  });
});
