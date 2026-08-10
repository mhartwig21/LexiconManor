/**
 * ═══ THE DOMINANCE RATE — WHAT REPLACED "79.2% OF OFFERS HAVE A REAL CHOICE"
 * ═══ (round 24, REVIEW_AA §5.7) ═══════════════════════════════════════════
 *
 * THE HEADLINE THAT WAS RETIRED, and why it had to be. `scripts/draft-shape.ts`
 * published
 *
 *     offers with a REAL choice (>=2 live) = (liveHist[2] + liveHist[3]) / n
 *
 * where "live" meant only `!sealsItself(...)`. That is *the share of offers
 * containing two or more cards that do not instantly wall you in* — a
 * measurement of how rarely the deck hands you a cul-de-sac, printed under a
 * name that claims something else entirely. **It never once asked whether the
 * three cards DIFFER.** Three identical corridors score 3 live and count as a
 * real choice. This repo has a standing rule against exactly this ("1.75× wage
 * spread", computed on a filtered subset that excluded three of the commonest
 * rooms) and the rule is what retired the number.
 *
 * ── WHAT A DECISION IS, AS TWO AXES SHE CAN READ BEFORE SHE SPENDS ────────
 *
 * The draft card face (`ui/blueprint/DraftModal.tsx`) prints exactly two things
 * about a plan that a player can act on:
 *
 *   FRONTIER — the post-rotation doors, drawn by the same `resolveDoors` the
 *     placement uses, and therefore how many onward doors into empty cells the
 *     plan leaves. "Does this keep the house open."
 *   STEPS — what the room can pay, through the same `solvePayout` /
 *     `UTILITY_EFFECTS` the ledger pays out of. "Does this buy me the evening."
 *
 * A card WEAKLY DOMINATES an offer when it is ≥ every other card on BOTH. Such
 * an offer has its answer written on it: the other two cards are decoration.
 * The dominance rate is the share of offers like that, and `1 − dominance` is
 * the share where she must actually give something up.
 *
 * ── WHERE THE TARGET COMES FROM (derived, not taken on trust) ─────────────
 *
 * With three cards and two axes that are finely spread and unrelated, the same
 * card is top of both **exactly 1/3 of the time**. 1/3 is therefore the floor a
 * deck with no correlation between geometry and payout reaches, and
 * `DOMINANCE_GATE.target = 0.40` is that floor plus a modest allowance for
 * honest ties. Above it, the deck is pairing "keeps the house open" with "pays
 * well" and the draft has a right answer on its face. (The economy critic
 * proposed <40% independently; the derivation above is why it is the number
 * rather than an opinion.)
 *
 * ── AND WHERE THE DECK IS ────────────────────────────────────────────────
 *
 * Measured at round 24's HEAD: **67.0%** through the diagnostic walker and
 * **66.4–66.8%** on the evenings `simulateDays` really plays. The permutation
 * null — each offer's frontier vector paired with a DIFFERENT offer's step
 * vector — measures **68.7%**, i.e. the deck is *not* actively pairing the two
 * axes; the rate is what three coarse, tie-heavy axes produce on their own,
 * and the way down is finer spread rather than de-correlation. Frontier spread
 * is zero on 31.3% of offers and all three cards are one category on 19.9%.
 *
 * So `target` is the destination and `ratchet` is the gate that bites TODAY.
 * This round built the instrument and is forbidden from touching `deck.ts`; the
 * ratchet fails on any deck edit that makes offers MORE dominated, which is
 * what stops the next round's geometry work from going the wrong way while
 * looking busy. Same shape as 4.10h's wage ratchet and 4.10i's floor ratchet,
 * for the same reason.
 */
import { describe, expect, it } from 'vitest';
import {
  DOMINANCE_GATE, cardStepValue, isDominated, shapeOf, type CardShape,
} from '../src/engine/economy/manor-walk';
import { PROFILE_DECENT, PROFILE_SKILLED, simulateDays } from '../src/engine/economy/simulate';
import { deckFor } from '../src/engine/manor/deck';
import { rollCards } from '../src/engine/manor/drafting';
import {
  cellKey, createManor, draftTargets, resolveDoors, roomAt,
} from '../src/engine/manor/grid';
import type { Cell, Dir, ManorState, RoomCard } from '../src/engine/types';
import { createRng } from '../src/engine/rng';
import { solvePayout } from '../src/engine/economy/steps';

// ---------------------------------------------------------------------------
// A plausible evening, walked on the real grid (the same probe draft-shape uses)
// ---------------------------------------------------------------------------

function walkOffers(seed: number, rooms: number, deck: readonly RoomCard[]): CardShape[][] {
  const rng = createRng((seed ^ 0x5eed) >>> 0);
  let manor: ManorState = createManor(seed);
  const out: CardShape[][] = [];
  const path: Cell[] = [{ ...manor.playerCell }];
  for (let i = 0; i < rooms; i++) {
    const targets = draftTargets(manor);
    if (targets.length === 0) break;
    targets.sort((a, b) => (b.cell.row - a.cell.row) || (rng() - 0.5));
    const { dir, cell } = targets[0]!;
    const cards = rollCards(deck, manor, cell, {
      gems: 2, declinedLastDraft: [], drawIndex: 0, entryDir: dir,
    });
    const shapes = cards.map((c) => shapeOf(c, dir, manor, cell));
    out.push(shapes);
    const pick = shapes.find((sh) => !sh.seals) ?? shapes[0]!;
    manor = {
      ...manor,
      rooms: {
        ...manor.rooms,
        [cellKey(cell)]: {
          cardId: pick.card.id, cell, doors: resolveDoors(pick.card, dir, manor, cell),
          solved: true, kind: (pick.card.puzzleKind ?? pick.card.category) as never,
        },
      },
      playerCell: { ...cell },
    };
    path.push({ ...cell });
    while (draftTargets(manor).length === 0 && path.length > 1) {
      path.pop();
      manor = { ...manor, playerCell: { ...path[path.length - 1]! } };
    }
    if (draftTargets(manor).length === 0) break;
  }
  return out;
}

const WALKED: CardShape[][] = (() => {
  const deck = deckFor([]);
  const out: CardShape[][] = [];
  for (let seed = 1; seed <= 900; seed++) for (const o of walkOffers(seed, 7, deck)) out.push(o);
  return out;
})();

const rateOf = (offers: readonly CardShape[][]) =>
  offers.filter((o) => isDominated(o)).length / offers.length;

describe('the two axes are read off the LIVE predicates, never re-implemented', () => {
  it('frontier counts doors into EMPTY in-bounds cells, post-rotation', () => {
    const deck = deckFor([]);
    const manor = createManor(4242);
    const target = draftTargets(manor)[0]!;
    for (const card of deck.slice(0, 12)) {
      const sh = shapeOf(card, target.dir, manor, target.cell);
      // The doors are exactly what the placement will use and the card face
      // draws — same function, no second opinion.
      expect(sh.doors).toEqual(resolveDoors(card, target.dir, manor, target.cell));
      // …and the frontier is a subset of them that excludes the entry wall,
      // the outer wall, and any cell that already holds a room.
      expect(sh.frontier).toBeLessThanOrEqual(sh.doors.length - 1);
      expect(sh.frontier).toBeGreaterThanOrEqual(0);
      // A plan that seals itself leaves no frontier at all, by definition.
      if (sh.seals) expect(sh.frontier).toBe(0);
    }
  });

  it('steps is what the room can PAY, through the shipped tables', () => {
    const deck = deckFor([]);
    for (const card of deck) {
      for (const tier of [1, 2, 3] as const) {
        const v = cardStepValue(card, tier);
        expect(v).toBeGreaterThanOrEqual(0);
        if (card.category === 'puzzle' && card.puzzleKind) {
          expect(v).toBe(solvePayout(card.puzzleKind, tier));
        }
        if (card.category === 'parlor' || card.category === 'mystery') expect(v).toBe(0);
      }
    }
  });

  it('a frontier door is never a wall the game would refuse to open', () => {
    // The round-13 defect, wearing a floorplan: a walker that invents a door
    // the live game will not open measures a manor we do not ship.
    const deck = deckFor([]);
    const manor = createManor(77);
    const target = draftTargets(manor)[0]!;
    for (const card of deck.slice(0, 20)) {
      const sh = shapeOf(card, target.dir, manor, target.cell);
      expect(sh.frontier).toBeLessThanOrEqual(3);
      if (sh.frontier > 0) expect(sh.seals).toBe(false);
    }
    // …and the cell it would fill is genuinely empty right now.
    expect(roomAt(manor, target.cell)).toBeUndefined();
  });
});

describe('dominance is defined the way its name says', () => {
  const fake = (frontier: number, steps: number): CardShape => ({
    card: { id: `f${frontier}-${steps}` } as unknown as RoomCard,
    frontier, steps, seals: false, opensSanctum: false, doors: [] as Dir[],
  });

  it('finds a card that is weakly best on BOTH axes', () => {
    expect(isDominated([fake(2, 5), fake(1, 3), fake(0, 1)])).toBe(true);
    expect(isDominated([fake(2, 2), fake(2, 2), fake(2, 2)])).toBe(true);   // no tradeoff
  });

  it('finds NO such card when the offer is a real tradeoff', () => {
    // The shape the deck has to produce more of: open house vs fat payout.
    expect(isDominated([fake(3, 1), fake(0, 9), fake(1, 4)])).toBe(false);
    expect(isDominated([fake(2, 1), fake(1, 2), fake(0, 3)])).toBe(false);
  });

  it('is not the retired headline in disguise', () => {
    // Three non-sealing cards — a full pass under "≥2 live" — and still no
    // decision in it. This single case is the whole argument for the change.
    const identical = [fake(1, 4), fake(1, 4), fake(1, 4)];
    expect(identical.every((c) => !c.seals)).toBe(true);
    expect(isDominated(identical)).toBe(true);
  });
});

describe('THE GATE — the deck may not make offers more dominated than they are', () => {
  it('holds the ratchet on the diagnostic walker', () => {
    const rate = rateOf(WALKED);
    expect(WALKED.length).toBeGreaterThan(5000);
    expect(rate, `dominance rate ${(100 * rate).toFixed(1)}% (walker)`)
      .toBeLessThanOrEqual(DOMINANCE_GATE.ratchet);
  });

  it('holds it on the evenings the player really has', () => {
    // The walker above is a climb-preferring probe; `simulateDays` is the day
    // model with its own budget, retreats and preferences. If these two ever
    // disagreed by much, one of them would not be playing this game.
    for (const profile of [PROFILE_DECENT, PROFILE_SKILLED]) {
      const days = simulateDays(profile, 600, 0xd01a + profile.name.length);
      const offers = days.reduce((t, d) => t + d.offers, 0);
      const dominated = days.reduce((t, d) => t + d.dominatedOffers, 0);
      expect(offers).toBeGreaterThan(3000);
      const rate = dominated / offers;
      expect(rate, `${profile.name} dominance ${(100 * rate).toFixed(1)}%`)
        .toBeLessThanOrEqual(DOMINANCE_GATE.ratchet);
      // …and the two instruments agree to within five points.
      expect(Math.abs(rate - rateOf(WALKED))).toBeLessThan(0.05);
    }
  });

  it('records the destination, and that the deck has not reached it', () => {
    // The target is the derived one (1/3 by chance + ties). It is deliberately
    // NOT asserted as passing: this round built the instrument and may not
    // touch the deck, and a target quietly restated as the measurement is the
    // failure this project keeps repeating. When the deck round lands, the
    // ratchet walks down to the target and this assertion inverts.
    expect(DOMINANCE_GATE.target).toBeLessThan(DOMINANCE_GATE.ratchet);
    expect(DOMINANCE_GATE.target).toBeGreaterThan(1 / 3);
    expect(rateOf(WALKED), 'the deck has reached the target — invert this test')
      .toBeGreaterThan(DOMINANCE_GATE.target);
  });

  it('measures the permutation NULL beside it, so the rate has a scale', () => {
    // Pair each offer's frontier vector with a DIFFERENT offer's step vector.
    // Any correlation between "keeps the house open" and "pays well" is
    // destroyed by construction, so this is the dominance three coarse axes
    // produce on their own. The deck sits at or just under it — which says the
    // way down is FINER SPREAD (more distinct frontier counts, more distinct
    // wages) rather than de-correlating two things that are not correlated.
    const rng = createRng(0xd01a);
    const order = WALKED.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = order[i]!; order[i] = order[j]!; order[j] = t;
    }
    const mixed = WALKED.map((offer, i) => {
      const steps = WALKED[order[i]!]!;
      const n = Math.min(offer.length, steps.length);
      return offer.slice(0, n).map((c, k) => ({ ...c, steps: steps[k]!.steps }));
    });
    const nullRate = rateOf(mixed);
    expect(nullRate).toBeGreaterThan(0.5);
    expect(rateOf(WALKED)).toBeLessThanOrEqual(nullRate + 0.03);
  });

  it('names the two things the deck round has to move', () => {
    // Both are the reason the rate is where it is, and both are geometry/wage
    // SPREAD rather than correlation — recorded as measurements so the next
    // round can show movement instead of claiming it.
    const spreadZero = WALKED.filter(
      (o) => new Set(o.map((c) => c.frontier)).size === 1,
    ).length / WALKED.length;
    const oneCategory = WALKED.filter(
      (o) => new Set(o.map((c) => c.card.category)).size === 1,
    ).length / WALKED.length;
    expect(spreadZero, `frontier spread zero on ${(100 * spreadZero).toFixed(1)}% of offers`)
      .toBeLessThanOrEqual(0.36);
    expect(oneCategory, `one category on ${(100 * oneCategory).toFixed(1)}% of offers`)
      .toBeLessThanOrEqual(0.25);
  });
});
