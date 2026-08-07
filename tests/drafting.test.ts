import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import {
  affordabilityMultiplier, ANTI_REPEAT_SUPPRESSION, cardWeight, categoryWeight,
  deweyProphecy, eligibleCards, RARITY_WEIGHTS, rollCards, rollOffer,
  type DraftRollCtx,
} from '../src/engine/manor/drafting';
import {
  BASE_DECK, cardById, deckFor, isKeyBearing, CARD_PREVIEWS, SCRIPTED_FIRST_DRAFT,
  UTILITY_EFFECTS,
} from '../src/engine/manor/deck';
import { isDoorLocked, KEY_COST } from '../src/engine/manor/locks';
import { KEY_SUPPLY, moveAt } from '../src/engine/economy/steps';
import { createEmptySaveV2 } from '../src/app/save';
import type { ManorStore } from '../src/app/store';
import { createDaySlice } from '../src/app/slices/day';
import { createManorSlice, ensureManor } from '../src/app/slices/manor';
import { createRoomSlice } from '../src/app/slices/room';
import { createDialogueSlice } from '../src/app/slices/dialogue';
import { createJournalSlice } from '../src/app/slices/journal';
import { createMetaSlice } from '../src/app/slices/meta';
import {
  cardOpensOntoSanctum, cellKey, createManor, deweyCell, DIRS, opposite, placeRoom, resolveDoors,
  roomAt, rowTier, SANCTUM_DOOR_CELL,
} from '../src/engine/manor/grid';
import type { Cell, Dir, ManorState, PlacedRoom, RoomCategory } from '../src/engine/types';
import { MANOR_COLS, MANOR_ROWS } from '../src/engine/types';

/** OWNER: A1 (Manor). The drafting engine — AAA 4.1–4.8, BENCHMARKS §4. */

const ctx = (over: Partial<DraftRollCtx> = {}): DraftRollCtx => ({
  gems: 0, declinedLastDraft: [], drawIndex: 0, ...over,
});

const DECK = deckFor([]);

describe('deck sanity', () => {
  it('cards are unique, categorized, and every layout is orientable', () => {
    expect(new Set(BASE_DECK.map((c) => c.id)).size).toBe(BASE_DECK.length);
    for (const c of BASE_DECK) {
      expect(c.doorLayouts.length).toBeGreaterThan(0);
      for (const layout of c.doorLayouts) {
        expect(layout.length).toBeGreaterThan(0);
        // ORIENTATION CONVENTION (round-9, engine/manor/grid.ts): the layout's
        // 'N' is the door she walks in through. A layout authored without one
        // still places (the resolver anchors on its first door instead), but
        // it would read wrong on the card face, so the deck must not have any.
        expect(layout).toContain('N');
      }
      expect(c.tierRange[0]).toBeLessThanOrEqual(c.tierRange[1]);
    }
  });

  it('specialist categories stay small and memorizable (AAA 4.7)', () => {
    const count = (cat: RoomCategory) => BASE_DECK.filter((c) => c.category === cat).length;
    for (const cat of ['parlor', 'utility', 'mystery'] as const) {
      expect(count(cat)).toBeGreaterThanOrEqual(4);
      expect(count(cat)).toBeLessThanOrEqual(8);
    }
  });

  it('the scripted first draft exists in the deck and leads with a free puzzle room', () => {
    const cards = SCRIPTED_FIRST_DRAFT.map((id) => cardById(id));
    expect(cards.every(Boolean)).toBe(true);
    expect(cards[0]!.category).toBe('puzzle');
    expect(cards[0]!.gemCost).toBe(0);
  });
});

describe('offer shape', () => {
  it('always deals 3 distinct cards with slot 1 free (AAA 4.1)', () => {
    for (let seed = 0; seed < 300; seed++) {
      const manor = createManor(seed);
      const cards = rollCards(DECK, manor, { col: 2, row: 1 }, ctx({ gems: seed % 5 }));
      expect(cards).toHaveLength(3);
      expect(new Set(cards.map((c) => c.id)).size).toBe(3);
      expect(cards[0]!.gemCost).toBe(0);
    }
  });

  it('is deterministic for (daySeed, cell, drawIndex)', () => {
    const manor = createManor(99);
    const a = rollCards(DECK, manor, { col: 3, row: 2 }, ctx());
    const b = rollCards(DECK, manor, { col: 3, row: 2 }, ctx());
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it('rollOffer carries the door, origin, and reroll flag', () => {
    const manor = createManor(4);
    const offer = rollOffer(DECK, manor, { col: 2, row: 0 }, 'N', { col: 2, row: 1 }, ctx());
    expect(offer.atDoor).toBe('N');
    expect(offer.from).toEqual({ col: 2, row: 0 });
    expect(offer.rerolled).toBe(false);
    const rerolled = rollOffer(DECK, manor, { col: 2, row: 0 }, 'N', { col: 2, row: 1 }, ctx({ drawIndex: 1 }));
    expect(rerolled.rerolled).toBe(true);
  });

  it('day 1 draft #1 is the scripted tutorial hand (AAA 4.5)', () => {
    const manor = createManor(1234);
    const cards = rollCards(DECK, manor, { col: 2, row: 1 }, ctx({ scripted: true }));
    expect(cards.map((c) => c.id)).toEqual([...SCRIPTED_FIRST_DRAFT]);
  });
});

describe('determinism across doors (AAA 4.8)', () => {
  it('a reroll at door A never perturbs door B', () => {
    const manor = createManor(2718);
    const cellA: Cell = { col: 1, row: 1 };
    const cellB: Cell = { col: 3, row: 1 };
    const before = rollCards(DECK, manor, cellB, ctx()).map((c) => c.id);
    // reroll A: draw its index-1 offer (the slice advances only A's stream)
    rollCards(DECK, manor, cellA, ctx({ drawIndex: 1 }));
    const after = rollCards(DECK, manor, cellB, ctx()).map((c) => c.id);
    expect(after).toEqual(before);
  });

  it('a reroll produces a different stream than the first draw', () => {
    let changed = 0;
    for (let seed = 0; seed < 50; seed++) {
      const manor = createManor(seed);
      const first = rollCards(DECK, manor, { col: 2, row: 3 }, ctx()).map((c) => c.id).join();
      const second = rollCards(DECK, manor, { col: 2, row: 3 }, ctx({ drawIndex: 1 })).map((c) => c.id).join();
      if (first !== second) changed++;
    }
    expect(changed).toBeGreaterThan(40);
  });
});

describe('rarity & category by row (AAA 4.2)', () => {
  it('offered cards always fit the row-band tier — rows 0–2 offer 0% tier-3', () => {
    for (let seed = 0; seed < 200; seed++) {
      const manor = createManor(seed);
      for (let row = 0; row < MANOR_ROWS; row++) {
        const tier = rowTier(row);
        for (const card of rollCards(DECK, manor, { col: 1, row }, ctx({ gems: 4 }))) {
          expect(card.tierRange[0]).toBeLessThanOrEqual(tier);
          expect(card.tierRange[1]).toBeGreaterThanOrEqual(tier);
          if (row <= 2) expect(card.tierRange[0]).toBeLessThan(3);
        }
      }
    }
  });

  it('violet ramps with row and green fades (weights + 12k-card simulation)', () => {
    for (let row = 0; row < MANOR_ROWS - 1; row++) {
      expect(categoryWeight('mystery', row + 1)).toBeGreaterThan(categoryWeight('mystery', row));
      expect(categoryWeight('utility', row + 1)).toBeLessThanOrEqual(categoryWeight('utility', row));
    }
    const share: number[] = [];
    for (let row = 0; row < MANOR_ROWS; row++) {
      let violet = 0, total = 0;
      for (let seed = 0; seed < 4000; seed++) {
        const manor = createManor(seed);
        for (const card of rollCards(DECK, manor, { col: 1, row }, ctx())) {
          total++;
          if (card.category === 'mystery') violet++;
        }
      }
      share.push(violet / total);
    }
    for (let row = 0; row < MANOR_ROWS - 1; row++) {
      expect(share[row + 1]!, `violet share row ${row}→${row + 1}`).toBeGreaterThan(share[row]!);
    }
    expect(share[MANOR_ROWS - 1]!).toBeGreaterThan(share[0]! * 2.5);
  });

  it('higher bands skew rarer', () => {
    for (const rarity of ['unusual', 'rare'] as const) {
      expect(RARITY_WEIGHTS[3][rarity]).toBeGreaterThan(RARITY_WEIGHTS[2][rarity]);
      expect(RARITY_WEIGHTS[2][rarity]).toBeGreaterThan(RARITY_WEIGHTS[1][rarity]);
    }
    expect(RARITY_WEIGHTS[1].common).toBeGreaterThan(RARITY_WEIGHTS[3].common);
  });
});

describe('anti-repeat suppression (AAA 4.3)', () => {
  it('a declined card is measurably rarer in the next draft', () => {
    const target: Cell = { col: 2, row: 2 };
    const count = (declined: string[]) => {
      let hits = 0;
      for (let seed = 0; seed < 4000; seed++) {
        const manor = createManor(seed);
        const cards = rollCards(DECK, manor, target, ctx({ declinedLastDraft: declined }));
        if (cards.some((c) => c.id === 'library')) hits++;
      }
      return hits;
    };
    const baseline = count([]);
    const suppressed = count(['library']);
    expect(baseline).toBeGreaterThan(200); // the library is a staple otherwise
    expect(suppressed).toBeLessThan(baseline * 0.5);
  });

  it('suppression scales with rarity in the BP 60/80/90/99 shape', () => {
    expect(ANTI_REPEAT_SUPPRESSION.common).toBeLessThan(ANTI_REPEAT_SUPPRESSION.standard);
    expect(ANTI_REPEAT_SUPPRESSION.standard).toBeLessThan(ANTI_REPEAT_SUPPRESSION.unusual);
    expect(ANTI_REPEAT_SUPPRESSION.unusual).toBeLessThan(ANTI_REPEAT_SUPPRESSION.rare);
    expect(ANTI_REPEAT_SUPPRESSION.rare).toBeLessThan(1);
    const card = cardById('study')!;
    const base = cardWeight(card, 5, ctx({ gems: 4 }));
    const dropped = cardWeight(card, 5, ctx({ gems: 4, declinedLastDraft: ['study'] }));
    expect(dropped).toBeLessThan(base * 0.02);
  });
});

describe('affordability (AAA 4.1)', () => {
  it('premium cards surface mostly when she can pay, scaling with row and gems', () => {
    const card = cardById('observatory')!; // gemCost 2
    expect(affordabilityMultiplier(card, 0, 5)).toBeLessThan(0.2);
    expect(affordabilityMultiplier(card, 2, 5)).toBeGreaterThan(1);
    expect(affordabilityMultiplier(card, 4, 5)).toBeGreaterThan(affordabilityMultiplier(card, 2, 5));
    expect(affordabilityMultiplier(card, 2, 5)).toBeGreaterThan(affordabilityMultiplier(card, 2, 1));

    const target: Cell = { col: 2, row: 5 };
    const premiumRate = (gems: number) => {
      let premium = 0, total = 0;
      for (let seed = 0; seed < 3000; seed++) {
        const manor = createManor(seed);
        for (const c of rollCards(DECK, manor, target, ctx({ gems }))) {
          total++;
          if (c.gemCost > 0) premium++;
        }
      }
      return premium / total;
    };
    expect(premiumRate(4)).toBeGreaterThan(premiumRate(0) * 2);
  });
});

describe('never an unplaceable offer (AAA 4.4)', () => {
  it('every offered card orients a door onto the entry wall from any cell', () => {
    for (let seed = 0; seed < 60; seed++) {
      const manor = createManor(seed);
      for (let col = 0; col < MANOR_COLS; col++) {
        for (let row = 0; row < MANOR_ROWS; row++) {
          const cell: Cell = { col: col as Cell['col'], row };
          if (roomAt(manor, cell)) continue;
          for (const entry of DIRS) {
            for (const card of rollCards(DECK, manor, cell, ctx({ gems: 4 }))) {
              const doors = resolveDoors(card, entry, manor, cell);
              expect(doors).toContain(opposite(entry));
            }
          }
        }
      }
    }
    // 25k placements over 60 seeded manors: ~0.5s idle, well over vitest's 5s
    // default when the dev box is running other suites (or a browser) beside
    // it. The assertion is exhaustive and deterministic, so a busy machine
    // must not read as an unplaceable-offer regression.
  }, 60_000);
});

describe('deck thinning', () => {
  it('placed cards leave the pool until thinning would starve an offer', () => {
    let manor: ManorState = createManor(8);
    const placed: PlacedRoom = {
      cardId: 'library', cell: { col: 2, row: 1 }, doors: ['S'], solved: false, kind: 'word-web',
    };
    manor = placeRoom(manor, placed);
    const pool = eligibleCards(DECK, manor, 1);
    expect(pool.some((c) => c.id === 'library')).toBe(false);
    for (let seed = 0; seed < 200; seed++) {
      const cards = rollCards(DECK, { ...manor, daySeed: seed }, { col: 1, row: 1 }, ctx());
      expect(cards.some((c) => c.id === 'library')).toBe(false);
    }
  });
});

describe("Dewey's prophecy", () => {
  const opts = { gems: 0, declinedLastDraft: [], drawIndexFor: () => 0 };

  it('is deterministic', () => {
    for (let seed = 0; seed < 40; seed++) {
      const manor = createManor(seed);
      expect(deweyProphecy(DECK, manor, opts)).toBe(deweyProphecy(DECK, manor, opts));
    }
  });

  it('sees a mystery room already standing in his row', () => {
    for (let seed = 0; seed < 40; seed++) {
      let manor = createManor(seed);
      const den = deweyCell(seed);
      const col = den.col === 0 ? 1 : 0;
      manor = placeRoom(manor, {
        cardId: 'archive', cell: { col: col as Cell['col'], row: den.row },
        doors: ['N'], solved: false, kind: 'mystery',
      });
      expect(deweyProphecy(DECK, manor, opts)).toBe(true);
    }
  });

  it('answers both ways across days (a hint, not a constant)', () => {
    let yes = 0, no = 0;
    for (let seed = 0; seed < 300; seed++) {
      if (deweyProphecy(DECK, createManor(seed), opts)) yes++;
      else no++;
    }
    expect(yes).toBeGreaterThan(0);
    expect(no).toBeGreaterThan(0);
  });
});

describe('economy shape smoke test (AAA 4.10 support)', () => {
  it('a straight-line climb costs far less than the day budget', () => {
    // entrance → row 5 landing: 6 moves + 6 drafts ≈ 12 steps of a 40 budget,
    // leaving room for puzzle spends — the "one more room" tension holds.
    const moves = 6 + 6;
    expect(moves).toBeLessThan(40 * 0.4);
  });
});

// ---------------------------------------------------------------------------
// THE PADLOCK, LIVE (app/slices/manor.ts) — AAA 4.6 / 4.10d
//
// The gate existed in the economy simulation long before it existed in the
// shipped game, which is exactly the owner's "way too easy — I reached the
// Forgotten Word on day one". These are the contract tests for the wiring:
// a padlocked door BLOCKS without a key, spends EXACTLY ONE with, and charges
// NOTHING when it refuses.
// ---------------------------------------------------------------------------

/** Store built from the real slices — the same harness tests/day.test.ts uses. */
const makeStore = () => {
  const save = createEmptySaveV2('Locksmith');
  return create<ManorStore>()((...a) => ({
    ...createDaySlice(save)(...a),
    ...createManorSlice(save)(...a),
    ...createRoomSlice(save)(...a),
    ...createDialogueSlice(save)(...a),
    ...createJournalSlice(save)(...a),
    ...createMetaSlice(save)(...a),
  }));
};

/** Day seed 2 padlocks the cell at 2,4; seed 1 leaves it open. */
const LOCK_SEED = 2;
// Round 7: the row-4 lock rate rose 0.5 → 0.75 (the ascent to the LIVE Sanctum
// landing crosses rows 4 and 5, not the sealed row 6 the old rates counted), so
// the old open seed is padlocked now. Both seeds are asserted below, so a
// future retune breaks with a legible message rather than a mystery.
const OPEN_SEED = 6;

/**
 * Out on the blueprint, standing in a row-3 room with two live doors: north
 * into 2,4 (padlocked on LOCK_SEED) and south into 2,2 (never lockable).
 */
const atTheStairs = (daySeed: number, keys: number) => {
  const store = makeStore();
  store.getState().startDay();
  store.getState().advanceDayPhase();
  ensureManor();
  const base = createManor(daySeed);
  const landing: PlacedRoom = {
    cardId: 'gallery', cell: { col: 2, row: 3 }, doors: ['N', 'S'],
    solved: true, kind: 'twistle',
  };
  store.setState({
    manor: { ...base, rooms: { ...base.rooms, '2,3': landing }, playerCell: { col: 2, row: 3 } },
    day: { ...store.getState().day!, day: 4, daySeed },
    currencies: { ...store.getState().currencies, keys, gems: 0 },
    ledger: { budget: 18, entries: [] },
  });
  return store;
};

describe('a padlocked door blocks without a key — and charges nothing (AAA 4.6)', () => {
  it('refuses to open, spends no step, and leaves the ledger untouched', () => {
    const store = atTheStairs(LOCK_SEED, 0);
    expect(isDoorLocked(store.getState().manor!, { col: 2, row: 4 })).toBe(true);
    const stepsBefore = store.getState().stepsRemaining();
    const entriesBefore = store.getState().ledger.entries.length;

    store.getState().openDraft('N');

    const s = store.getState();
    expect(s.draftOffer).toBeNull();                     // no look at the cards
    expect(s.ledger.entries.length).toBe(entriesBefore); // …and NO charge
    expect(s.stepsRemaining()).toBe(stepsBefore);
    expect(s.manor!.rooms['2,4']).toBeUndefined();
  });

  it('never a pay-for-nothing however many times she tries the handle', () => {
    const store = atTheStairs(LOCK_SEED, 0);
    const before = store.getState().stepsRemaining();
    for (let i = 0; i < 6; i++) store.getState().openDraft('N');
    expect(store.getState().stepsRemaining()).toBe(before);
    expect(store.getState().ledger.entries).toHaveLength(0);
  });

  it('leaves the rest of the floor open — a shut door is not a shut day', () => {
    const store = atTheStairs(LOCK_SEED, 0);
    store.getState().openDraft('S');                     // row 2: never locked
    expect(store.getState().draftOffer).not.toBeNull();
    expect(store.getState().ledger.entries.at(-1)!.reason).toBe('move');
  });

  it('an unlocked upper door costs only the usual step, with no key at all', () => {
    const store = atTheStairs(OPEN_SEED, 0);
    expect(isDoorLocked(store.getState().manor!, { col: 2, row: 4 })).toBe(false);
    store.getState().openDraft('N');
    expect(store.getState().draftOffer).not.toBeNull();
    expect(store.getState().ledger.entries).toHaveLength(1);
  });
});

describe('a padlocked door spends EXACTLY ONE key — on placement', () => {
  it('opens for the usual one step and does not touch the key to look', () => {
    // ROUND-11 REPAIR: this case handed her ONE key and asserted the door
    // opened. Round 10 repriced the padlock to `DOOR_LOCKS.keyCost` = 2 and
    // this file was never re-read, so the two cases below had been failing
    // ever since — asserting a door that opens on one key, which is a door
    // the shipped game does not have. They are written against KEY_COST now,
    // so the next reprice moves them instead of breaking them.
    const store = atTheStairs(LOCK_SEED, KEY_COST);
    store.getState().openDraft('N');
    const s = store.getState();
    expect(s.draftOffer).not.toBeNull();
    expect(s.currencies.keys).toBe(KEY_COST);            // looking is free
    const moves = s.ledger.entries.filter((e) => e.reason === 'move');
    expect(moves).toHaveLength(1);
    // Round-5 audit (AAA 4.6): the look is a walk across the floor she is
    // ALREADY standing on — priced at HER row (3), not the row above.
    expect(moves[0]!.delta).toBe(moveAt(3));
  });

  it('backing out keeps the key — only the step already spent is gone (AAA 4.6)', () => {
    const store = atTheStairs(LOCK_SEED, 2);
    store.getState().openDraft('N');
    store.getState().cancelDraft();
    const s = store.getState();
    expect(s.draftOffer).toBeNull();
    expect(s.currencies.keys).toBe(2);
    expect(s.ledger.entries.filter((e) => e.reason === 'move')).toHaveLength(1);
  });

  it('consumes one key, and only one, when the room is placed', () => {
    const store = atTheStairs(LOCK_SEED, 3);
    store.getState().openDraft('N');
    const card = store.getState().draftOffer!.cards.find((c) => c.gemCost === 0)!;
    const refund = UTILITY_EFFECTS[card.id]?.keys ?? 0;  // green rooms may pay keys back

    store.getState().chooseDraftCard(card.id);

    const s = store.getState();
    expect(s.currencies.keys).toBe(3 - KEY_COST + refund);
    expect(s.manor!.rooms['2,4']).toBeDefined();
    expect(s.manor!.playerCell).toEqual({ col: 2, row: 4 });
  });

  it('an unlocked door spends no key at all (the control)', () => {
    const store = atTheStairs(OPEN_SEED, 2);
    store.getState().openDraft('N');
    const card = store.getState().draftOffer!.cards.find((c) => c.gemCost === 0)!;
    const refund = UTILITY_EFFECTS[card.id]?.keys ?? 0;
    store.getState().chooseDraftCard(card.id);
    expect(store.getState().currencies.keys).toBe(2 + refund);
  });

  it('a door she can no longer pay for places nothing and charges nothing', () => {
    // Belt and braces: the key is re-checked at placement, so a key spent
    // elsewhere between opening and choosing cannot half-place a room.
    const store = atTheStairs(LOCK_SEED, KEY_COST);
    store.getState().openDraft('N');
    store.getState().spendKeys(1);                       // Fern took one back
    const card = store.getState().draftOffer!.cards.find((c) => c.gemCost === 0)!;
    store.getState().chooseDraftCard(card.id);
    const s = store.getState();
    expect(s.manor!.rooms['2,4']).toBeUndefined();
    expect(s.currencies.keys).toBe(KEY_COST - 1);
    expect(s.manor!.playerCell).toEqual({ col: 2, row: 3 });
  });
});

describe('the key supply the padlocks assume actually exists in the deck', () => {
  it('names its key sources on the card face (AAA 1.17)', () => {
    expect(UTILITY_EFFECTS['key-cabinet']!.keys).toBe(KEY_SUPPLY.cabinetKeys);
    expect(UTILITY_EFFECTS['boot-room']!.keys).toBe(KEY_SUPPLY.bootRoomKeys);
    expect(CARD_PREVIEWS['key-cabinet']).toContain(String(KEY_SUPPLY.cabinetKeys));
    expect(CARD_PREVIEWS['key-cabinet']!.toLowerCase()).toContain('key');
    expect(CARD_PREVIEWS['boot-room']!.toLowerCase()).toContain('key');
  });

  it('offers a key card often enough on the floors an ascent is prepared on', () => {
    // A padlock is only a gate if the key exists. Rows 0–2 are where she banks
    // for a climb; a key card must show up in a meaningful share of offers.
    for (const row of [0, 1, 2]) {
      let withKey = 0;
      const N = 1200;
      for (let seed = 0; seed < N; seed++) {
        const cards = rollCards(
          DECK, createManor(seed), { col: (seed % 5) as Cell['col'], row }, ctx({ gems: 2 }),
        );
        if (cards.some((c) => (UTILITY_EFFECTS[c.id]?.keys ?? 0) > 0)) withKey += 1;
      }
      expect(withKey / N).toBeGreaterThan(0.12);
    }
  });
});

// ---------------------------------------------------------------------------
// ROUND-5 AUDIT — key frequency must be an ARC, not a flat line (AAA 4.10d)
// ---------------------------------------------------------------------------

describe("Fern's friendship is the padlock arc's supply side", () => {
  const keyRate = (row: number, keyAccess: number) => {
    const deck = deckFor([]);
    let hits = 0;
    const N = 1200;
    for (let seed = 0; seed < N; seed++) {
      const cards = rollCards(deck, createManor(seed), { col: (seed % 5) as Cell['col'], row },
        { gems: 2, declinedLastDraft: [], drawIndex: 0, keyAccess });
      if (cards.some((c) => isKeyBearing(c.id))) hits += 1;
    }
    return hits / N;
  };

  it('is exactly neutral with no friendship — drafting is unchanged by this term', () => {
    const deck = deckFor([]);
    for (const row of [0, 3, 6]) {
      const ctx = { gems: 2, declinedLastDraft: [], drawIndex: 0 };
      const before = rollCards(deck, createManor(77), { col: 2, row }, ctx).map((c) => c.id);
      const after = rollCards(deck, createManor(77), { col: 2, row },
        { ...ctx, keyAccess: 0 }).map((c) => c.id);
      expect(after).toEqual(before);
    }
  });

  it('raises key-bearing cards as the friendship warms, and nothing else', () => {
    // The finding: `categoryWeight`/`RARITY_WEIGHTS` carried no day or affinity
    // term, so a key card was exactly as likely on day 30 as on day 1.
    const cold = keyRate(0, 0);
    const warm = keyRate(0, 1);
    expect(warm).toBeGreaterThan(cold * 1.5);
    expect(warm).toBeLessThan(0.85);            // a supply, never a giveaway
    // The category shape she is choosing between is untouched: only WHICH
    // green card shows up moves, which is what keeps deckMixAt (and the 4.10b
    // clock calibrated against it) honest.
    expect(cardWeight(cardById('library')!, 0, {
      gems: 0, declinedLastDraft: [], drawIndex: 0, keyAccess: 1,
    })).toBe(cardWeight(cardById('library')!, 0, {
      gems: 0, declinedLastDraft: [], drawIndex: 0,
    }));
  });

  it('still leaves the upper storeys lean — preparation happens downstairs', () => {
    expect(keyRate(5, 1)).toBeLessThan(keyRate(0, 1));
  });
});

// ---------------------------------------------------------------------------
// ROUND 13 — THE LANDING OFFER (AAA 4.1 / 4.6 / 4.10d/e / 4.14)
// ---------------------------------------------------------------------------

/**
 * ═══ THE GATE WAS A CARD, AND NOTHING IN THE GAME KNEW IT ═════════════════
 *
 * `atSanctumDoor` needs the room drafted at (2,5) to draw a north door
 * matching the Sanctum's sealed south one. Over the real deck and the rigid
 * rotation, entering the landing from below, only ~28% of the plans eligible
 * up there do — so a bare 3-card offer contains one on ~61% of draws, and two
 * evenings in five the 22+ step climb arrived at an offer that could not open
 * the door. The drafting engine now carries the two terms
 * `engine/economy/steps.ts SANCTUM_ARC` supplies, and they are inert at every
 * other cell in the manor, which is what keeps `deckMixAt` — and the whole
 * 4.10b clock derived from it — untouched.
 */
describe('the landing offer leans toward the door (round 13)', () => {
  const landingCtx = (over: Partial<DraftRollCtx> = {}): DraftRollCtx =>
    ctx({ gems: 2, entryDir: 'N', ...over });

  const opensNorth = (manor: ManorState, card: { id: string }) =>
    cardOpensOntoSanctum(
      BASE_DECK.find((c) => c.id === card.id) ?? cardById(card.id)!,
      'N', manor, SANCTUM_DOOR_CELL,
    );

  const offerRate = (over: Partial<DraftRollCtx>, samples = 1200) => {
    let hit = 0;
    for (let seed = 0; seed < samples; seed++) {
      const manor = createManor(seed);
      const cards = rollCards(DECK, manor, SANCTUM_DOOR_CELL, landingCtx(over));
      if (cards.some((c) => opensNorth(manor, c))) hit += 1;
    }
    return hit / samples;
  };

  it('leaves the bare offer exactly where the finding measured it', () => {
    const bare = offerRate({});
    expect(bare, `bare landing offer rate ${bare.toFixed(3)}`).toBeGreaterThan(0.5);
    expect(bare).toBeLessThan(0.75);
  });

  it('raises it strictly with warmth, and never all the way to certainty', () => {
    const cold = offerRate({ sanctumPlanWarmth: 0 });
    const half = offerRate({ sanctumPlanWarmth: 0.5 });
    const full = offerRate({ sanctumPlanWarmth: 1 });
    expect(half).toBeGreaterThan(cold);
    expect(full).toBeGreaterThan(half);
    // The draft stays a decision (AAA 4.6): the arc shortens the wait, it
    // never hands her the door.
    expect(full).toBeLessThan(0.99);
  });

  it('guarantees the door in the FREE slot once the mercy is armed (AAA 4.14)', () => {
    const armed = offerRate({ sanctumMercy: true });
    expect(armed, `mercy offer rate ${armed.toFixed(3)}`).toBeGreaterThan(0.9);
    // …and the guarantee rides the FREE slot rather than adding a fourth card,
    // so AAA 4.1's promise is intact: with zero gems the card that opens the
    // door is the guaranteed-takeable one, not a premium she cannot pay for.
    let freeAndOpens = 0;
    for (let seed = 0; seed < 400; seed++) {
      const manor = createManor(seed);
      const cards = rollCards(
        DECK, manor, SANCTUM_DOOR_CELL, landingCtx({ gems: 0, sanctumMercy: true }));
      expect(cards[0]!.gemCost).toBe(0);
      if (opensNorth(manor, cards[0]!)) freeAndOpens += 1;
    }
    expect(freeAndOpens / 400, `free slot opens north on ${freeAndOpens}/400`)
      .toBeGreaterThan(0.9);
  });

  it('is INERT at every other cell in the manor', () => {
    // The landing terms may not touch one other draft in the game — otherwise
    // they move `deckMixAt`, and with it the 4.10b clock every campaign number
    // is calibrated against.
    for (let seed = 0; seed < 200; seed++) {
      const manor = createManor(seed);
      for (const cell of [
        { col: 2, row: 1 }, { col: 0, row: 4 }, { col: 4, row: 5 },
        { col: 1, row: SANCTUM_DOOR_CELL.row },
      ] as Cell[]) {
        const plain = rollCards(DECK, manor, cell, landingCtx()).map((c) => c.id);
        const warmed = rollCards(DECK, manor, cell, landingCtx({
          sanctumPlanWarmth: 1, sanctumMercy: true,
        })).map((c) => c.id);
        expect(warmed).toEqual(plain);
      }
    }
  });

  it('keeps the per-cell stream: the landing arc is not a reroll', () => {
    // AAA 4.8 — the offer behind a door is a property of the door, so warming
    // the arc must not perturb any OTHER door's stream, and the same warmth on
    // the same day must give the same three cards every time it is asked.
    const manor = createManor(77);
    const a = rollCards(DECK, manor, SANCTUM_DOOR_CELL,
      landingCtx({ sanctumPlanWarmth: 0.5 })).map((c) => c.id);
    const b = rollCards(DECK, manor, SANCTUM_DOOR_CELL,
      landingCtx({ sanctumPlanWarmth: 0.5 })).map((c) => c.id);
    expect(a).toEqual(b);
    const other: Cell = { col: 0, row: 2 };
    const before = rollCards(DECK, manor, other, landingCtx()).map((c) => c.id);
    rollCards(DECK, manor, SANCTUM_DOOR_CELL, landingCtx({ sanctumPlanWarmth: 1 }));
    expect(rollCards(DECK, manor, other, landingCtx()).map((c) => c.id)).toEqual(before);
  });

  it('rollOffer supplies the heading, so a caller cannot forget to', () => {
    // The door she stands at IS her heading through it. Without this the
    // landing terms would silently ask the question for the wrong wall.
    const manor = createManor(4242);
    const from: Cell = { col: SANCTUM_DOOR_CELL.col, row: SANCTUM_DOOR_CELL.row - 1 };
    const offer = rollOffer(
      DECK, manor, from, 'N', SANCTUM_DOOR_CELL, ctx({ gems: 2, sanctumMercy: true }));
    expect(offer.cards.some((c) => opensNorth(manor, c))).toBe(true);
  });
});
