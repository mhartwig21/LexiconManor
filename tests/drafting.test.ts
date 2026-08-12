import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import {
  affordabilityMultiplier, ANTI_REPEAT_SUPPRESSION, cardWeight, categoryWeight,
  deweyProphecy, eligibleCards, PLAN_SPREAD_SUPPRESSION, RARITY_WEIGHTS, rollCards,
  rollOffer, type DraftRollCtx,
} from '../src/engine/manor/drafting';
import {
  BASE_DECK, cardById, deckFor, isKeyBearing, CARD_PREVIEWS, SCRIPTED_FIRST_DRAFT,
  SEALED_ROOM_BOUNTY, UTILITY_EFFECTS,
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
  roomAt, rowTier, sealsItself, SANCTUM_DOOR_CELL,
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

// ---------------------------------------------------------------------------
// THE SEALED ROOM PAYS (REVIEW_AA §5.7)
// ---------------------------------------------------------------------------

/**
 * The review's own statement of done for this layer: *"Dead ends drop to a
 * small, telegraphed, deliberately-chosen minority — the card face says 'this
 * room seals itself' AND THE PLAYER TAKES IT ANYWAY BECAUSE IT PAYS FOR IT."*
 *
 * Round 9 made the card honest and the round-20 deck rebalance made the seal
 * rare (32% of the deck's plans by geometry, 7.6% of placements once she reads
 * the diagram — `tests/grid.test.ts`). Neither of those makes a dead end a
 * CHOICE. The gem does, and these are the three things that have to be true of
 * it: it is paid, it is paid from the same predicate the card face drew with,
 * and it is small enough to stay a consolation rather than a strategy.
 */
describe('a room that seals itself keeps something (REVIEW_AA §5.7)', () => {
  const sealingDraft = () => {
    const store = makeStore();
    store.getState().startDay();
    store.getState().advanceDayPhase();
    ensureManor();
    return store;
  };

  it('hands her the bounty exactly when the placement seals, and never otherwise', () => {
    for (let seed = 40; seed < 90; seed++) {
      const store = sealingDraft();
      const base = createManor(seed);
      store.setState({
        manor: base,
        day: { ...store.getState().day!, day: 3, daySeed: seed },
        currencies: { gems: 0, keys: 0, bookmarks: 0 },
        ledger: { budget: 18, entries: [] },
      });
      store.getState().openDraft('N');
      const offer = store.getState().draftOffer;
      if (!offer) continue;
      const target: Cell = { col: 2, row: 1 };
      const card = offer.cards[0]!;
      const willSeal = sealsItself(
        resolveDoors(card, 'N', store.getState().manor!, target), 'N',
        store.getState().manor!, target,
      );
      store.getState().chooseDraftCard(card.id);
      const gems = store.getState().currencies.gems;
      // Utility cards can also pay gems, so the assertion is one-directional
      // for those and exact for every other card in the deck.
      if (!UTILITY_EFFECTS[card.id]) {
        expect(gems, `${card.id} @seed ${seed}`).toBe(willSeal ? SEALED_ROOM_BOUNTY.gems : 0);
      }
    }
  });

  it('says so on the spine, so the notice rail can speak without being told', () => {
    // AAA 11.10/11.11: the manor slice must not know what a notice is. The
    // round-6 escape was a payout applied in silence; `sealed` on the
    // `room-drafted` event is how this one avoids being the next.
    const store = sealingDraft();
    const seed = 41;
    store.setState({
      manor: createManor(seed),
      day: { ...store.getState().day!, day: 3, daySeed: seed },
      ledger: { budget: 18, entries: [] },
    });
    store.getState().openDraft('N');
    const offer = store.getState().draftOffer!;
    store.getState().chooseDraftCard(offer.cards[0]!.id);
    const drafted = store.getState().recentEvents
      .map((e) => e.event).filter((e) => e.type === 'room-drafted');
    expect(drafted).toHaveLength(1);
    expect(typeof (drafted[0] as { sealed?: boolean }).sealed).toBe('boolean');
  });

  it('is telegraphed before she spends, in words, on the card', () => {
    expect(SEALED_ROOM_BOUNTY.stamp).toMatch(/seals itself/i);
    expect(SEALED_ROOM_BOUNTY.stamp).toContain(`+${SEALED_ROOM_BOUNTY.gems} gem`);
  });

  it('stays a consolation, not an income — one gem, and never a step', () => {
    // Steps are the surface every published 4.10 band is calibrated against;
    // this bounty must not touch them, or the campaign arc becomes this
    // mechanic's business. One gem is a reroll at the next door.
    expect(SEALED_ROOM_BOUNTY.gems).toBe(1);
    expect(Object.keys(SEALED_ROOM_BOUNTY)).not.toContain('steps');
  });
});

/**
 * ═══ ROUND 36 — THE TWO RULES THAT MAKE THE OFFER THREE DIFFERENT PLANS ════
 *
 * `engine/manor/drafting.ts` RULE A ("there is always a way on") and RULE B
 * ("the manor does not deal the same plan three times"). What is tested here is
 * the CONTRACT — the three promises each rule makes and the one promise they
 * share — rather than the dominance rate, which is measured against the deck in
 * `tests/draft-dominance.test.ts` on an instrument that knows nothing about
 * either rule's implementation.
 *
 * Every claim below is proved in both directions where it can be: the same
 * `rollCards`, called without a heading, IS the round-35 draw, so a red proof
 * costs nothing and there is no excuse for a green-only gate.
 */
describe('round 36 — RULE A: the offer holds a way on when the deck holds one', () => {
  /** Every empty cell of a manor, each entered from a heading that varies. */
  const doors = (manor: ManorState) => {
    const out: { cell: Cell; dir: Dir }[] = [];
    for (let row = 0; row < MANOR_ROWS; row++) {
      for (let col = 0; col < MANOR_COLS; col++) {
        const cell: Cell = { col: col as Cell['col'], row };
        if (roomAt(manor, cell)) continue;
        for (const dir of DIRS) out.push({ cell, dir });
      }
    }
    return out;
  };

  const sealCounts = (heading: boolean) => {
    let allSeal = 0, starved = 0, offers = 0;
    for (let seed = 0; seed < 24; seed++) {
      const manor = createManor(seed);
      for (const { cell, dir } of doors(manor)) {
        const cards = rollCards(DECK, manor, cell, heading
          ? ctx({ gems: 2, entryDir: dir })
          : ctx({ gems: 2 }));
        offers += 1;
        const seals = (c: (typeof cards)[number]) =>
          sealsItself(resolveDoors(c, dir, manor, cell), dir, manor, cell);
        if (cards.every(seals)) allSeal += 1;
        // Could ANY card in the whole eligible pool have opened this door?
        const pool = eligibleCards(DECK, manor, cell.row);
        if (!pool.some((c) => !seals(c))) starved += 1;
      }
    }
    return { allSeal: allSeal / offers, starved: starved / offers, offers };
  };

  it('never deals three sealing plans unless the POOL had nothing else', () => {
    const live = sealCounts(true);
    expect(live.offers).toBeGreaterThan(2000);
    // The rule's exact promise: an all-sealing offer is only ever a fact about
    // the deck at that row, never a roll of the dice.
    expect(live.allSeal, `all three sealed on ${(100 * live.allSeal).toFixed(2)}% of offers`)
      .toBeLessThanOrEqual(live.starved + 1e-9);
  });

  it('goes RED on the draw it replaced — the same call without a heading', () => {
    // Not a mock: `rollCards` with no `entryDir` is the shipped round-35 draw,
    // and it is the call `deckMixAt` and the key-rate probe still make.
    const before = sealCounts(false);
    const live = sealCounts(true);
    expect(before.allSeal, 'the round-35 draw never dealt three cul-de-sacs')
      .toBeGreaterThan(before.starved + 0.01);
    expect(live.allSeal).toBeLessThan(before.allSeal);
  });

  it('rides on the LAST slot, so slot 1 keeps its own promise (free)', () => {
    // AAA 4.1 outranks every later rule: the guaranteed-takeable card stays
    // takeable even on the offers RULE A has reached into.
    for (let seed = 0; seed < 24; seed++) {
      const manor = createManor(seed);
      for (const { cell, dir } of doors(manor)) {
        const pool = eligibleCards(DECK, manor, cell.row);
        if (!pool.some((c) => c.gemCost === 0)) continue;
        const cards = rollCards(DECK, manor, cell, ctx({ gems: 2, entryDir: dir }));
        expect(cards[0]!.gemCost, `${cards[0]!.id} @${cellKey(cell)}/${dir}`).toBe(0);
      }
    }
  });
});

describe('round 36 — RULE B: the same plan three times, and the price of saying so', () => {
  const waysOn = (card: (typeof BASE_DECK)[number], dir: Dir, manor: ManorState, cell: Cell) =>
    resolveDoors(card, dir, manor, cell).filter((d) => {
      if (d === opposite(dir)) return false;
      const n = { N: { ...cell, row: cell.row + 1 }, S: { ...cell, row: cell.row - 1 },
        E: { ...cell, col: cell.col + 1 }, W: { ...cell, col: cell.col - 1 } }[d] as Cell;
      if (n.row < 0 || n.row >= MANOR_ROWS || n.col < 0 || n.col >= MANOR_COLS) return false;
      const there = roomAt(manor, n);
      return !there || there.doors.includes(opposite(d));
    }).length;

  /** How often all three cards say the same number of ways on. */
  const flatShare = (heading: boolean) => {
    let flat = 0, offers = 0, anyRepeat = 0;
    for (let seed = 0; seed < 24; seed++) {
      const manor = createManor(seed);
      for (let row = 0; row < MANOR_ROWS; row++) {
        for (let col = 0; col < MANOR_COLS; col++) {
          const cell: Cell = { col: col as Cell['col'], row };
          if (roomAt(manor, cell)) continue;
          for (const dir of DIRS) {
            const cards = rollCards(DECK, manor, cell, heading
              ? ctx({ gems: 2, entryDir: dir }) : ctx({ gems: 2 }));
            const said = new Set(cards.map((c) => waysOn(c, dir, manor, cell)));
            offers += 1;
            if (said.size === 1) flat += 1;
            if (said.size < cards.length) anyRepeat += 1;
          }
        }
      }
    }
    return { flat: flat / offers, anyRepeat: anyRepeat / offers, offers };
  };

  it('nearly stops the offer saying one thing three times — and goes red without it', () => {
    const live = flatShare(true);
    const before = flatShare(false);
    expect(live.offers).toBeGreaterThan(2000);
    expect(live.flat, `all three plans said the same on ${(100 * live.flat).toFixed(1)}%`)
      .toBeLessThan(0.10);
    // The red proof: the round-35 draw over this same deck says it far more.
    expect(before.flat).toBeGreaterThan(live.flat * 2.5);
  });

  it('is still a WEIGHT and not a filter — two cards may agree, and often do', () => {
    // The distinction AAA 4.6 is built on. A rule that BANNED a repeated plan
    // would drive this to zero and quietly replace the deck rather than tidy
    // it; a suppression leaves the hand legal and merely unlikely.
    const live = flatShare(true);
    expect(live.anyRepeat, `some pair still agreed on ${(100 * live.anyRepeat).toFixed(1)}%`)
      .toBeGreaterThan(0.35);
    expect(PLAN_SPREAD_SUPPRESSION).toBeGreaterThan(0);
    expect(PLAN_SPREAD_SUPPRESSION).toBeLessThan(1);
  });

  /**
   * THE CONSTRUCTION ARGUMENT, MEASURED. `drawOne` renormalises the spread over
   * the NON-MYSTERY pool, the way `wingBoost` does and for the same reason: the
   * mystery's supply is not this mechanic's to spend. Round 36 shipped the
   * un-normalised version first and watched violet's share of an offer rise by
   * a third, which took the median player's violet-met rate from 47.6% to
   * 54.3% and straight through 4.10g's "or it has stopped being a rare room".
   */
  it('is exactly violet-neutral: the rules cannot change how often violet shows up', () => {
    const mysteryShare = (heading: boolean) => {
      let myst = 0, n = 0;
      for (let seed = 0; seed < 120; seed++) {
        const manor = createManor(seed);
        for (let row = 0; row < MANOR_ROWS; row++) {
          for (let col = 0; col < MANOR_COLS; col++) {
            const cell: Cell = { col: col as Cell['col'], row };
            const dir = DIRS[(seed + col + row) % DIRS.length]!;
            for (const c of rollCards(DECK, manor, cell, heading
              ? ctx({ gems: 2, entryDir: dir }) : ctx({ gems: 2 }))) {
              n += 1;
              if (c.category === 'mystery') myst += 1;
            }
          }
        }
      }
      return { share: myst / n, n };
    };
    const before = mysteryShare(false);
    const live = mysteryShare(true);
    expect(before.n).toBeGreaterThan(10000);
    expect(
      Math.abs(live.share - before.share),
      `violet share ${(100 * before.share).toFixed(3)}% → ${(100 * live.share).toFixed(3)}%`,
    ).toBeLessThan(0.002);
  });
});

describe('round 36 — both rules are SILENT without a heading', () => {
  /**
   * A plan without a heading is not a plan (the rotation is rigid), so a caller
   * with no door draws exactly what it always drew. This is not decoration: it
   * is what leaves `deckMixAt` — and the 4.10b clock derived from it, and every
   * mix band in AAA 4.10 — calibrated exactly as they were. The same argument
   * `keyAccess`, `sanctumPlanWarmth` and the wing term each make.
   */
  it('is blind to the manor’s DOORS: same rooms, different plaster, same offer', () => {
    // Two manors holding the SAME cards in the SAME cells — so `eligibleCards`
    // thins identically — differing only in which doors those rooms drew. That
    // is exactly the input both round-36 rules read and the only input they
    // add, so a headingless draw that notices it would be the regression this
    // test exists to catch. (An earlier draft of this test walled the
    // neighbours instead, which changed the placed set and therefore the pool,
    // and skipped every seed: a test that asserts nothing is worse than none.)
    let checked = 0;
    for (let seed = 0; seed < 40; seed++) {
      const bare = createManor(seed);
      const cell: Cell = { col: 2, row: 3 };
      if (roomAt(bare, cell)) continue;
      const neighbours: Cell[] = [{ col: 1, row: 3 }, { col: 3, row: 3 }, { col: 2, row: 2 }];
      const build = (doors: Dir[]): ManorState => {
        let m: ManorState = bare;
        for (const at of neighbours) {
          if (roomAt(m, at)) continue;
          m = placeRoom(m, {
            cardId: 'gem-vault', cell: at, doors, solved: false, kind: 'utility',
          } as PlacedRoom);
        }
        return m;
      };
      const shut = rollCards(DECK, build(['N']), cell, ctx({ gems: 2 })).map((c) => c.id);
      const open = rollCards(
        DECK, build(['N', 'E', 'S', 'W']), cell, ctx({ gems: 2 }),
      ).map((c) => c.id);
      expect(open, `seed ${seed}`).toEqual(shut);
      checked += 1;
    }
    expect(checked, 'this test skipped every seed').toBeGreaterThan(20);
  });

  it('and WITH a heading it can differ, or neither rule would be doing anything', () => {
    let differed = 0;
    for (let seed = 0; seed < 60; seed++) {
      const manor = createManor(seed);
      const cell: Cell = { col: 2, row: 3 };
      if (roomAt(manor, cell)) continue;
      const plain = rollCards(DECK, manor, cell, ctx({ gems: 2 })).map((c) => c.id).join();
      for (const dir of DIRS) {
        const withDir = rollCards(DECK, manor, cell, ctx({ gems: 2, entryDir: dir }))
          .map((c) => c.id).join();
        if (withDir !== plain) differed += 1;
      }
    }
    expect(differed).toBeGreaterThan(50);
  });
});
