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
 * vector — measured **68.7%**, i.e. the deck was *not* actively pairing the two
 * axes; the rate was what three coarse, tie-heavy axes produce on their own,
 * and the way down was finer spread rather than de-correlation. Frontier spread
 * was zero on 31.3% of offers and all three cards were one category on 19.9%.
 *
 * ── ROUND 36 — THE DECK ROUND LANDED, AND EVERY NUMBER ABOVE MOVED ─────────
 *
 *                       round 24        round 36        round 40
 *   dominance (walker)    67.0%           34.9%           34.6%
 *   dominance (day model) 66.4–66.8%      37.4–39.0%      37.9–40.1%
 *   permutation null      68.7%           49.5%           49.7%
 *   frontier spread zero  31.3%            5.6%            7.7%   ← see below
 *   three of one category 19.9%           15.5%           19.5%   ← see below
 *   all three cards seal   4.91%           0.10%           0.10%
 *   offer's PUZZLE share  —               55.3%           59.1%
 *
 * ROUND 40 restored the offer mix (`drafting.ts categoryNeutral`) and re-derived
 * the spread rule against the deck that was left: PLAN_SPREAD_SUPPRESSION 0.10 →
 * 0.03, plus RULE C on what the room pays. "Three of one category" ROSE, and
 * that is arithmetic rather than a regression — it goes as the cube of the
 * commonest category's share, and round 36 had been buying it by dealing fewer
 * puzzle rooms. The clause below now measures it against its own independence
 * null instead of an absolute bound.
 *
 * Two changes, and the tests below separate them rather than claiming the pair:
 * `engine/manor/deck.ts`'s ROUND-36 REBALANCE (the fatter the wage, the tighter
 * the plan) is worth 67.0% → 58.4% on its own, and `drafting.ts`'s two draft
 * rules — there is always a way on, and the manor does not deal the same plan
 * three times — carry it the rest of the way. The 58.4% figure is not a
 * reconstruction: it is measured live, by calling the shipped `rollCards`
 * without a heading, which is what silences both rules.
 *
 * `ratchet` has walked down from 0.70 to 0.41 and `target` has NOT moved. The
 * ratchet still fails on any edit that makes offers more dominated — same shape
 * as 4.10h's wage ratchet and 4.10i's floor ratchet, for the same reason — and
 * it is now proved red as well as green.
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

function walkOffers(
  seed: number, rooms: number, deck: readonly RoomCard[], heading = true,
): CardShape[][] {
  const rng = createRng((seed ^ 0x5eed) >>> 0);
  let manor: ManorState = createManor(seed);
  const out: CardShape[][] = [];
  const path: Cell[] = [{ ...manor.playerCell }];
  for (let i = 0; i < rooms; i++) {
    const targets = draftTargets(manor);
    if (targets.length === 0) break;
    targets.sort((a, b) => (b.cell.row - a.cell.row) || (rng() - 0.5));
    const { dir, cell } = targets[0]!;
    // `heading: false` is not a mock — it is the shipped draw with no door
    // (`rollCards` states the rule: a plan without a heading is not a plan), so
    // both round-36 rules go silent and this is EXACTLY the round-35 offer at
    // the same door, from the same stream, over the same deck. It is what the
    // red-proof below condemns.
    const cards = rollCards(deck, manor, cell, heading
      ? { gems: 2, declinedLastDraft: [], drawIndex: 0, entryDir: dir }
      : { gems: 2, declinedLastDraft: [], drawIndex: 0 });
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

const walkAll = (heading: boolean): CardShape[][] => {
  const deck = deckFor([]);
  const out: CardShape[][] = [];
  for (let seed = 1; seed <= 900; seed++) {
    for (const o of walkOffers(seed, 7, deck, heading)) out.push(o);
  }
  return out;
};

const WALKED: CardShape[][] = walkAll(true);
/** The same doors, the same deck, drawn the way round 35 drew them. */
const UNRULED: CardShape[][] = walkAll(false);

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

  /**
   * ═══ ROUND 36 — THE DECK REACHED THE TARGET, AND THIS TEST INVERTED ═══════
   *
   * Round 24 wrote: *"It is deliberately NOT asserted as passing: this round
   * built the instrument and may not touch the deck… When the deck round lands,
   * the ratchet walks down to the target and this assertion inverts."* It has.
   *
   *   round 24 HEAD   67.0% (walker) · 66.4–66.8% (the day model)
   *   round 36 HEAD   34.9% (walker) · 37.4–39.0% (the day model, four seeds)
   *
   * The target is the SAME derived number — 1/3 by chance plus an allowance for
   * honest ties — and it was NOT moved to meet the deck. What moved is
   * `ratchet`, 0.70 → 0.41: the strictest instrument reads 39.0% at its worst
   * seed and the gate sits a point above that, so the target is now a floor the
   * deck stands on rather than a destination it is walking toward.
   *
   * THE DAY MODEL RUNS ~3 POINTS HOTTER THAN THE WALKER, and the gap is
   * published rather than averaged away: its offers carry wing memory, key
   * access and a real gem count, all of which narrow the pool a draw picks from.
   * The walker is the clean instrument the target was derived on; the day model
   * is the one the player lives in; both are under the bar.
   */
  it('records the destination — and the deck has now reached it', () => {
    expect(DOMINANCE_GATE.target).toBeGreaterThan(1 / 3);
    expect(DOMINANCE_GATE.ratchet).toBeGreaterThanOrEqual(DOMINANCE_GATE.target);
    expect(rateOf(WALKED), 'the walker has drifted back above the derived target')
      .toBeLessThanOrEqual(DOMINANCE_GATE.target);
  });

  /**
   * ═══ THE RED PROOF (standing rule 1: prove the gate goes red) ═════════════
   *
   * A gate that has only ever been seen green is a claim, not a measurement.
   * `UNRULED` is the SAME 900 walks over the SAME deck at the SAME doors from
   * the SAME streams with the round-36 draft rules silent — not a mock and not
   * a flag, but the shipped `rollCards` called without an `entryDir`, which is
   * the exact call every composition probe in this repo already makes. It is
   * the round-35 offer, and it fails this gate by more than twenty points.
   *
   * It is also the round's honest accounting: the deck rebalance ALONE (which
   * `UNRULED` already contains) is worth 67.0% → 58.4%, and the two draft rules
   * are worth the rest. Neither half would have got here on its own.
   */
  it('goes RED on the offer this round replaced', () => {
    const before = rateOf(UNRULED);
    expect(UNRULED.length).toBeGreaterThan(5000);
    expect(before, `the round-35 draw measures ${(100 * before).toFixed(1)}%`)
      .toBeGreaterThan(DOMINANCE_GATE.ratchet);
    // …by a margin no seed choice could manufacture.
    expect(before - rateOf(WALKED)).toBeGreaterThan(0.15);
  });

  it('measures the permutation NULL beside it, so the rate has a scale', () => {
    // Pair each offer's frontier vector with a DIFFERENT offer's step vector.
    // Any correlation between "keeps the house open" and "pays well" is
    // destroyed by construction, so this is the dominance these axes produce on
    // their own, at these marginals.
    //
    // ROUND 36 — THE SIGN OF THE GAP IS THE WHOLE FINDING. At round 24 the deck
    // measured 67.0% against a null of 68.7%: it sat AT chance, which is why
    // that round's note said the way down was finer spread and not
    // de-correlation. It now measures 34.9% against a null of 49.5% — nearly
    // fifteen points BELOW its own null. The null itself fell, because the
    // marginals are far less tie-heavy; the deck fell further, because the fat
    // wages now carry the tight plans. Both halves of round 24's diagnosis were
    // needed, and both are visible in this one number.
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
    expect(nullRate, `permutation null ${(100 * nullRate).toFixed(1)}%`)
      .toBeGreaterThan(0.42);
    expect(rateOf(WALKED), 'the deck is no longer beating its own null')
      .toBeLessThan(nullRate - 0.10);
  });

  it('records the two things the deck round was told to move, and where they are now', () => {
    // Round 24 published these as the reason the rate was where it was, each
    // with a ratchet. Both fell with the deck; both stay ratchets, and both are
    // now measured against the round-35 draw beside them, so neither number can
    // drift into decoration.
    const spreadZero = (offers: readonly CardShape[][]) => offers.filter(
      (o) => new Set(o.map((c) => c.frontier)).size === 1,
    ).length / offers.length;
    const oneCategory = (offers: readonly CardShape[][]) => offers.filter(
      (o) => new Set(o.map((c) => c.card.category)).size === 1,
    ).length / offers.length;

    // 31.6% at round 24; 5.6% at round 36; 7.7% now. An offer whose three cards
    // leave the same number of onward doors is dominated BY DEFINITION —
    // whichever pays best wins on both axes — so this is a hard floor under the
    // rate above.
    //
    // ROUND 40 — IT ROSE TWO POINTS AND THE RATE DID NOT, which is the shape of
    // the round in one line. RULE C spreads the WAGE axis as well, so a card
    // that repeats the plan but pays differently is sometimes now the better
    // draw; the offer buys its decision on the other axis instead. The bound
    // stays where round 36 put it (a bound may fall and may never rise) and the
    // margin is 0.3 points, which is thin and is said so: if a later round
    // needs room here, the lever is within-category plan spread in the DECK —
    // the cheapest rooms in the house carry the narrowest plans, and that is
    // what leaves this residue.
    expect(spreadZero(WALKED), `frontier spread zero on ${(100 * spreadZero(WALKED)).toFixed(1)}%`)
      .toBeLessThanOrEqual(0.08);
    // …and it is worse without the rule — the red proof for this axis.
    expect(spreadZero(UNRULED)).toBeGreaterThan(0.25);

    /**
     * ═══ ROUND 40 — "THREE OF ONE CATEGORY" WAS MEASURING THE MIX LEAK ══════
     *
     * Round 24 published 19.9%, round 35 re-measured 19.3%, round 36 reported
     * **15.5%** and this file pinned it at ≤17%. That fall was not variety. It
     * was arithmetic: round 36's spread rule paid for plan variety out of the
     * PUZZLE category's weight (58.90% → 55.26% of cards offered), and three of
     * a kind goes as roughly the cube of the commonest category's share —
     * 0.589³ = 20.4%, 0.553³ = 16.9%. Restore the mix and the number comes back
     * to 19.5% without a single offer becoming less varied, which is why an
     * ABSOLUTE bound here was the wrong instrument: it condemned the deck for
     * being puzzle-heavy, which is the one thing the owner's standing steer
     * says it should be.
     *
     * So the clause asks the question it always meant to ask: does the offer
     * CLUMP by category beyond what its own marginals already imply? The null
     * shuffles each slot's categories independently across offers, destroying
     * any within-offer correlation while keeping every slot's marginal exactly
     * as it is. A draft that started dealing three puzzle rooms TOGETHER would
     * sit above its null; this one does not.
     */
    const rng = createRng(0xca7);
    const slots = [0, 1, 2].map((k) => WALKED.map((o) => o[k]?.card.category));
    for (const col of slots) {
      for (let i = col.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = col[i]; col[i] = col[j]!; col[j] = t!;
      }
    }
    let nullClumps = 0;
    let counted = 0;
    for (let i = 0; i < WALKED.length; i++) {
      const cats = slots.map((col) => col[i]).filter(Boolean);
      if (cats.length !== 3) continue;
      counted += 1;
      if (new Set(cats).size === 1) nullClumps += 1;
    }
    const independent = nullClumps / counted;
    const real = oneCategory(WALKED);
    expect(counted).toBeGreaterThan(5000);
    expect(
      real,
      `one category on ${(100 * real).toFixed(1)}% against an independence null of ${(100 * independent).toFixed(1)}%`,
    ).toBeLessThanOrEqual(independent + 0.02);
    // …and the statistic still has teeth: an offer set that DOES clump — every
    // offer's three slots taken from the same card — sits far above the null.
    const clumped = WALKED.map((o) => (o[0] ? [o[0], o[0], o[0]] : o));
    expect(oneCategory(clumped)).toBeGreaterThan(independent + 0.02);
  });

  /**
   * ═══ THE COLD READ'S OTHER DEFECT, AND IT WAS THE SAME ONE ════════════════
   *
   * 11 Aug: a tester's run ended at a door where ALL THREE CARDS SEALED and he
   * had no gems to reroll. He called it arbitrary. It was 4.91% of offers — at
   * ~9.9 offers an evening, two evenings in five contained one — and it is not
   * a separate bug from dominance, it is dominance at its extreme: three cards
   * saying the same thing about where the house goes next, and the thing they
   * say is "nowhere".
   *
   * `rollCards` RULE A draws the last slot from the plans that do not seal when
   * the other two both do. What survives is the honest residue: rows whose
   * eligible pool holds no plan that opens at all.
   */
  it('no longer deals three cul-de-sacs when the deck holds anything else', () => {
    const allSeal = (offers: readonly CardShape[][]) =>
      offers.filter((o) => o.every((c) => c.seals)).length / offers.length;
    expect(allSeal(WALKED), `all three seal on ${(100 * allSeal(WALKED)).toFixed(2)}%`)
      .toBeLessThanOrEqual(0.005);
    // …and it goes red on the draw it replaced, by a factor of thirty.
    expect(allSeal(UNRULED)).toBeGreaterThan(0.04);
  });
});
