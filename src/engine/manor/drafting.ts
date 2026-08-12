/**
 * The drafting engine — OWNER: A1 (Manor). Pure TS, zero React/DOM.
 *
 * Blue Prince lessons baked in (BENCHMARKS §4, AAA 4.1–4.8):
 *  - slot 1 guaranteed free — never an offer she cannot take (AAA 4.1)
 *  - two-stage draw: rarity by row band, card within tier; violet ramps with
 *    row, green fades; rows 0–2 offer zero tier-3 cards (AAA 4.2)
 *  - anti-repeat suppression on offered-and-declined cards, rarity-scaled
 *    (60/80/90/99% — the BP shape, AAA 4.3)
 *  - deterministic per-cell rng streams: hash(daySeed, cellKey, drawIndex).
 *    Card draws depend ONLY on the target cell + draw index, so a reroll at
 *    door A provably never perturbs door B (AAA 4.8, property-tested)
 *  - scripted day-1 first draft — tutorial disguised as RNG (AAA 4.5)
 *  - drafted cards thin the day's pool (BP's praised strategy layer), relaxed
 *    only when it would starve a 3-card offer
 *
 * ── ROUND 36: THE OFFER IS THREE DIFFERENT PLANS, AND ONE OF THEM GOES ON ──
 *  - RULE A, `nonSealing` — the last slot is drawn from the plans that do not
 *    seal when the other two both do. The cold read watched a run die at a
 *    door where all three cards sealed and there were no gems to reroll.
 *  - RULE B, `PLAN_SPREAD_SUPPRESSION` — a card whose plan says the same
 *    NUMBER OF WAYS ON as one already in the offer is suppressed.
 *  - RULE C, `WAGE_SPREAD_SUPPRESSION` (round 40) — and so is a card that
 *    pays exactly what one already in the offer pays. The card face says two
 *    things and `isDominated` reads two things; round 36 spread one of them.
 *  All three are weights, not filters, and all three are renormalised PER
 *  CATEGORY (`drawOne`), so the mix of an offer is what `categoryWeight` says
 *  it is and nothing else. Round 36 renormalised over the non-mystery pool
 *  instead, which held violet fixed and quietly moved puzzle into parlor.
 *  All are silent when the caller passes no `entryDir`, because a plan
 *  without a heading is not a plan; that is what leaves `deckMixAt` and every
 *  band derived from it exactly where they were.
 *
 * All functions are pure. The manor slice owns the mutable bookkeeping
 * (per-cell draw indices, last-declined set) and passes it in.
 */

import type { Cell, Dir, DraftOffer, ManorState, RoomCard, RoomCategory, Tier } from '../types';
import { MANOR_COLS } from '../types';
import { createRng, pickWeighted, type Rng } from '../rng';
import {
  cardOpensOntoSanctum, cellKey, deweyCell, hashSeed, isSanctumLanding, onwardDoors,
  resolveDoors, roomAt, rowTier,
} from './grid';
import { cardById, cardStepValue, isKeyBearing, SCRIPTED_FIRST_DRAFT } from './deck';
import { wingOf, type WingCharacters } from './wings';
import { keyCardWeightMultiplier, sanctumPlanWeightMultiplier } from '../economy/steps';

/** Mutable-state snapshot the slice passes into every roll. */
export interface DraftRollCtx {
  gems: number;
  /** Card ids offered-and-declined in the LAST draft (anti-repeat, AAA 4.3). */
  declinedLastDraft: readonly string[];
  /** Per-cell draw index: 0 = first offer, +1 per reroll (AAA 4.8 streams). */
  drawIndex: number;
  /** Day 1, draft #1 — hand-authored offer (AAA 4.5). */
  scripted?: boolean;
  /**
   * 0..1 — Fern's key access (engine/economy/steps.ts `keyAccessFor`). The
   * padlock arc's supply side: a friend of the groundskeeper knows where the
   * spare keys are kept, so key-bearing cards surface more often as her
   * friendship warms (AAA 4.10d, "the gate must be meta"). Omitted/0 leaves
   * every weight exactly as it was, which is why `deckMixAt` — and the 4.10b
   * clock calibrated against it — is untouched by this term.
   */
  keyAccess?: number;
  /**
   * The direction she is WALKING as she steps through this door. Only the
   * Sanctum landing reads it (below): orientation is rigid, so which doors a
   * plan ends up with depends on the wall she came in by, and "does this plan
   * open onto the Sanctum" cannot be asked without it. Omitted, the landing
   * terms fall back to the canonical climb (entered from below, `'N'`), which
   * is how she arrives there in every ascent the economy prices.
   */
  entryDir?: Dir;
  /**
   * 0..1 — THE LANDING ARC (engine/economy/steps.ts `SANCTUM_ARC`). Warmth of
   * the surveyed-plan bonus: every evening she has stood on the Sanctum
   * landing is a plan of that storey the floorplan cabinet keeps, so plans
   * that open onto the sealed door surface more often up there. Reads ONLY at
   * the Sanctum landing; 0/omitted leaves every weight in the game exactly as
   * it was, which is why `deckMixAt` and the 4.10b clock are untouched by it.
   */
  sanctumPlanWarmth?: number;
  /**
   * THE ACCESS MERCY (AAA 4.14, round 13). When armed, the landing offer's
   * guaranteed-free slot is drawn from plans that open onto the Sanctum, so an
   * offer up there always contains one. Armed only when she can already name
   * the word AND has been turned away on that landing before
   * (`sanctumMercyArmed`), so it cannot touch 4.10d's day-1 reach.
   */
  sanctumMercy?: boolean;
  /**
   * THE WINGS (REVIEW_AA §5.7, engine/manor/wings.ts). What the lexicographer's
   * papers remember of the floorplan: a wing she has ended the same way on
   * enough evenings draws true, so cards of its character surface more often
   * behind its doors. Omitted, every weight in the game is exactly what it was
   * — which is why `deckMixAt` (and the 4.10b clock derived from it) is a pure
   * function of ROW and is untouched by any of this.
   */
  wings?: WingCharacters;
  /** The column the offer is being rolled for — only the wing term reads it. */
  targetCol?: number;
}

// ---------------------------------------------------------------------------
// Weights (the tunable surface — every knob lives here, exported for tests)
// ---------------------------------------------------------------------------

/**
 * Deck composition by row (MANOR_DESIGN §5): puzzle rooms are the bulk,
 * green fades as you climb, violet ramps strictly with row — the reason to
 * push upward is visible in every draft.
 *
 * ── ROUND-11 RETUNE: THE VIOLET RAMP WAS A RAMP ON PAPER ONLY ─────────────
 * `6 + row * 7` reads as "6 at the bottom, 48 at the top", but the number it
 * is multiplied by is `RARITY_WEIGHTS[tier][rarity]`, and tier 1 admits only
 * an unusual (9) and a rare (1) mystery card against a puzzle deck of commons.
 * The realised share was 0.16% at row 0 and 12.6% at row 6 — i.e. the bottom
 * three storeys had no violet at all, and the median simulated evening met a
 * violet room on 9.5% of days. That is not "the reason to push upward is
 * visible in every draft"; it is a category the player never sees until she
 * is most of the way up, and after round 10 it starved the seal mechanic that
 * makes solving matter.
 *
 * Re-tuned WITH the deck (the Archive is a standard card now — see
 * engine/manor/deck.ts `MYSTERY_CARDS`) against the realised share, which is
 * what `deckMixAt` measures and what tests/economy-simulation.test.ts now
 * pins: **≈2.0% at row 0 rising to ≈10.5% at row 6**, strictly increasing per
 * row. The ramp is gentler in the WEIGHT because the rarity table already
 * steepens it; the shape the player feels is steeper than the numbers here
 * look. (Round 12: this comment read "≈2.7% … ≈16%", which is not what the
 * shipped weights realise and not what AAA 4.10g publishes — measure with
 * `deckMixAt(row).mystery` before editing either number, and move all three
 * copies together.)
 *
 * THE ROW DEPENDENCE IS LOAD-BEARING, not flavour: because violet share is a
 * function of row, how often a player MEETS a sealed page is a function of how
 * high she climbs. That is why AAA 4.10g publishes two made-out rates — ~54%
 * of a skilled player's days carry a violet room against ~24% of the median
 * player's — and why the seal's "≥1 day in 3" clause is skill-qualified rather
 * than tunable: lifting the median player to 1-in-3 means lifting this ramp
 * past a rate that stops violet being a rare room at all.
 */
export function categoryWeight(category: RoomCategory, row: number): number {
  switch (category) {
    case 'puzzle':  return 100;
    case 'parlor':  return 26;
    case 'utility': return Math.max(10, 46 - row * 6);   // 46 at row 0 → 10 up top
    case 'mystery': return 22 + row * 3;                 // 22 at row 0 → 40 up top
  }
}

/** Rarity mix by row-band tier: higher rows skew rarer (BENCHMARKS §4). */
export const RARITY_WEIGHTS: Record<Tier, Record<RoomCard['rarity'], number>> = {
  1: { common: 56, standard: 34, unusual: 9,  rare: 1 },
  2: { common: 34, standard: 38, unusual: 21, rare: 7 },
  3: { common: 16, standard: 32, unusual: 34, rare: 18 },
};

/**
 * Anti-repeat suppression by rarity — the BP shape (AAA 4.3): a declined
 * card's weight is multiplied by (1 − suppression) in the next draft.
 */
export const ANTI_REPEAT_SUPPRESSION: Record<RoomCard['rarity'], number> = {
  common: 0.6, standard: 0.8, unusual: 0.9, rare: 0.99,
};

/**
 * Affordability (AAA 4.1): premium cards appear at elevated rates only when
 * she can pay — scaling with row band AND current gem count (BP's slot-2
 * rule) — and are nearly (not totally) hidden when she cannot: an occasional
 * glimpse of the Observatory is what gems are FOR.
 */
export function affordabilityMultiplier(card: RoomCard, gems: number, row: number): number {
  if (card.gemCost === 0) return 1;
  if (gems >= card.gemCost) return 1 + 0.1 * row + 0.1 * Math.min(gems, 4);
  return 0.1;
}

/**
 * ── THE WING TERM (REVIEW_AA §5.7) ─────────────────────────────────────────
 *
 * A wing the papers remember draws true: cards of its character surface more
 * often behind its doors. This is the ONE place a card's weight depends on the
 * COLUMN rather than the row — the horizontal axis meant literally nothing
 * before it, which is why the optimal manor was a chimney.
 *
 * Deliberately a WEIGHT and not a filter (AAA 4.6 — the draft stays a
 * decision): a remembered reading wing still offers her the Post Room, it just
 * offers her the Library more. A remembered wing should feel like a deck that
 * has been tidied, never one that has been replaced. Neutral (×1) with no
 * memory, which is every save's first two evenings and every fresh volume's.
 *
 * ── WHY 1.35 AND NOT 2, WHICH IS WHERE THIS STARTED ───────────────────────
 *
 * The number is not taste; it is the largest value at which every published
 * 4.10 band still holds, found by walking it down through
 * `tests/economy-simulation.test.ts` with the term modelled at its pessimistic
 * strength (`WING_MODEL`: a reading wing, on half of every evening's drafts):
 *
 *   ×2.00 — the skilled player wins inside week one on **5.0%** of campaigns
 *           against 4.10e's published <3%, and the median player's ≤35-day
 *           finish rate saturates at 100%, which collapses the skilled/median
 *           ordering 4.10e asserts.
 *   ×1.60 — 4.25%. Same two clauses, same direction.
 *   ×1.45 — 3.25%. Still through the wall.
 *   ×1.35 — every band holds (measured 2.9% and 1.6%), the medians are
 *           unmoved, and the ordering is intact.
 *
 * The mechanism is worth writing down because it will catch the next person:
 * blue rooms are the whole of REVIEW_AA §5.1's fragment spine, so ANY term that
 * puts more of them in front of a player shortens the campaign — the wing is a
 * knowledge lever wearing a floorplan's clothes. A stronger wing needs the
 * volume's authored page count raised first (AAA 4.10e's open commission: ~28
 * pages), not this constant raised.
 *
 * ── AND IT IS EXACTLY VIOLET-NEUTRAL, BY CONSTRUCTION ─────────────────────
 *
 * The first build of this multiplied the character's weight and left everything
 * else alone, which quietly takes the boost out of EVERY other category —
 * including violet. Measured: the median player's made-out rate fell from 24.0%
 * to 18.9%, straight through 4.10g's published ≥20% floor, because a page can
 * only be made out if she has met a violet room to seal one. The mystery's
 * supply is not this mechanic's to spend.
 *
 * So the boost is normalised over the NON-MYSTERY pool only: the character is
 * raised by `WING_AFFINITY` and the other ordinary categories are lowered by
 * the factor `k` that keeps their combined weight exactly where it was. Violet's
 * share of an offer is therefore bit-identical with a remembered wing and
 * without one — the same construction argument `sanctumPlanWarmth` uses to stay
 * out of 4.10d, rather than a constant somebody re-tuned until a test passed.
 *
 * It is computed per POOL rather than per card, which is why it lives beside
 * `drawOne` and not inside `cardWeight`: slot 1 draws from the free cards only
 * and slots 2–3 from the rest, and each pool is normalised against itself.
 */
export const WING_AFFINITY = 1.35;

export function wingBoost(
  pool: readonly RoomCard[], row: number, ctx: DraftRollCtx,
): (card: RoomCard) => number {
  if (!ctx.wings || ctx.targetCol === undefined) return () => 1;
  const character = ctx.wings[wingOf(ctx.targetCol)];
  if (!character) return () => 1;
  let charWeight = 0;
  let otherWeight = 0;
  for (const card of pool) {
    if (card.category === 'mystery') continue;
    const w = cardWeight(card, row, ctx);
    if (card.category === character) charWeight += w;
    else otherWeight += w;
  }
  if (charWeight <= 0 || otherWeight <= 0) return () => 1;
  const k = (charWeight + otherWeight) / (WING_AFFINITY * charWeight + otherWeight);
  return (card) => {
    if (card.category === 'mystery') return 1;
    return card.category === character ? WING_AFFINITY * k : k;
  };
}

/** Full per-card weight for one draw. Never 0 — streams stay well-defined. */
export function cardWeight(card: RoomCard, row: number, ctx: DraftRollCtx): number {
  let w = categoryWeight(card.category, row) * RARITY_WEIGHTS[rowTier(row)][card.rarity];
  w *= affordabilityMultiplier(card, ctx.gems, row);
  // The padlock arc's supply side (AAA 4.10d): key-bearing cards surface more
  // often as Fern's friendship warms. Neutral (×1) at keyAccess 0.
  if (ctx.keyAccess && isKeyBearing(card.id)) w *= keyCardWeightMultiplier(ctx.keyAccess);
  if (ctx.declinedLastDraft.includes(card.id)) w *= 1 - ANTI_REPEAT_SUPPRESSION[card.rarity];
  return Math.max(w, 1e-6);
}

// ---------------------------------------------------------------------------
// The draw
// ---------------------------------------------------------------------------

/**
 * Cards legal at this row: row-band tier inside the card's tierRange (this is
 * what makes rows 0–2 offer 0% tier-3, AAA 4.2), minus cards already placed
 * today (deck thinning) — relaxed if thinning would starve a 3-card offer.
 */
export function eligibleCards(
  deck: readonly RoomCard[], manor: ManorState, row: number,
): RoomCard[] {
  const tier = rowTier(row);
  const placed = new Set(Object.values(manor.rooms).map((r) => r.cardId));
  const open = deck.filter((c) => c.tierRange[0] <= tier && tier <= c.tierRange[1]);
  const fresh = open.filter((c) => !placed.has(c.id));
  return fresh.length >= 3 ? fresh : open;
}

function drawOne(
  rng: Rng, pool: RoomCard[], row: number, ctx: DraftRollCtx,
  boost: (card: RoomCard) => number = () => 1,
  spread: (card: RoomCard) => number = () => 1,
): RoomCard {
  // The wing term is normalised against THIS pool (see `wingBoost`), so it is
  // resolved here rather than folded into the per-card weight.
  const wing = wingBoost(pool, row, ctx);
  const base = pool.map(
    (c) => ({ item: c, weight: cardWeight(c, row, ctx) * boost(c) * wing(c) }),
  );
  // ── AND THE SPREAD RULE IS EXACTLY CATEGORY-NEUTRAL, BY CONSTRUCTION ─────
  //
  // ROUND 40 WIDENED THIS FROM VIOLET TO EVERY CATEGORY, because round 36's
  // narrower version had the failure it was written to prevent, one category
  // over. It held the MYSTERY share fixed and renormalised the rest as a single
  // pool — so the rule was free to move puzzle weight into parlor weight, and
  // it did: measured on the paired walker (the same door, the same manor, the
  // same stream, rules on and rules off), the offer went **puzzle −4.65pp and
  // parlor +3.17pp**. Which direction that is matters more here than the size:
  // the owner's standing steer is that the game leans too far from the word
  // games already, and nothing reported that the draft had leaned further.
  //
  // The generalisation is the same argument round 36 made about violet, made
  // about all four: **which category the deck deals is `categoryWeight`'s
  // business and not this rule's.** So each category is normalised against
  // ITSELF — the cards inside it are re-weighted toward the plan that says
  // something new, and the category's total weight comes out exactly where
  // `cardWeight × wing × boost` put it. Violet-neutrality is now a corollary
  // rather than a special case, and violet gets the spread rule inside its own
  // supply for the first time (round 36 exempted it outright).
  return pickWeighted(rng, categoryNeutral(base, spread));
}

/** One weighted card, as `pickWeighted` wants it. */
export interface WeightedCard { item: RoomCard; weight: number }

/**
 * Apply `spread` to a weighted pool WITHOUT letting it move a single unit of
 * weight between categories: each category is re-weighted inside itself and
 * renormalised back to the total it arrived with.
 *
 * Exported so `tests/drafting.test.ts` can hold it against the same weights
 * un-normalised — the round-36 shape — and measure what that costs the puzzle
 * category, rather than taking "category-neutral" on trust.
 */
export function categoryNeutral(
  base: readonly WeightedCard[],
  spread: (card: RoomCard) => number,
): WeightedCard[] {
  const before = new Map<RoomCategory, number>();
  const after = new Map<RoomCategory, number>();
  for (const { item, weight } of base) {
    before.set(item.category, (before.get(item.category) ?? 0) + weight);
    after.set(item.category, (after.get(item.category) ?? 0) + weight * spread(item));
  }
  return base.map(({ item, weight }) => {
    const was = before.get(item.category) ?? 0;
    const now = after.get(item.category) ?? 0;
    const k = was > 0 && now > 0 ? was / now : 1;
    return { item, weight: weight * spread(item) * k };
  });
}

/**
 * ── THE LANDING OFFER (round-13 blocker, AAA 4.10d/e + 4.14) ───────────────
 *
 * THE MILESTONE IS THE DOOR, NOT THE STOREY. `atSanctumDoor` needs the landing
 * room to have drawn a north door matching the Sanctum's sealed south one, and
 * over the real deck and the rigid rotation only ~27.7% of tier-3-eligible
 * plans do when the landing is entered from below — so a bare 3-card offer up
 * there contains one on just 60.8% of draws. Roughly two evenings in five, she
 * paid 22+ steps to arrive at an offer that CANNOT open the door, and nothing
 * in the game had ever told her the landing room needed to open north.
 *
 * ROUND 40 — AND IT IS 74.3% NOW, for the same reason and by the same term:
 * `PLAN_SPREAD_SUPPRESSION` walked 0.10 → 0.03 when the spread rules were made
 * category-neutral, and a firmer spread surfaces the wide shapes harder. This
 * arc has less work to do than ever; 4.10d/e and 4.14 still hold with room.
 *
 * ROUND 36 — THE BARE RATE IS 71.2% NOW, and this term did not do it: the plan
 * that opens north is a corridor, a fork or a cross, which are the wide shapes,
 * so RULE B's spread surfaces them without anything here or in the deck's
 * S-share changing (19.0% of tier-3 plans, before and after). Reported because
 * it is an ACCESS band that moved: the arc below has correspondingly less work
 * to do, and every 4.10d/e/4.14 gate still holds with room to spare.
 *
 * Three things answer it, and only the third is here: the card face now stamps
 * which plans open onto the Sanctum (ui/blueprint/DraftModal.tsx), the
 * blueprint answers the refusal instead of going quiet (BlueprintSheet), and
 * this function gives the gate the arc and the floor it never had
 * (engine/economy/steps.ts `SANCTUM_ARC`).
 *
 * Returns a per-card weight multiplier, and it is exactly 1 everywhere except
 * the three landing cells (`SANCTUM_LANDING_CELLS`) with a warmed arc — no
 * other cell in the manor can be affected by any of this, which is what keeps
 * `deckMixAt` (and the 4.10b clock derived from it) untouched.
 */
function landingBoost(
  manor: ManorState, target: Cell, ctx: DraftRollCtx,
): (card: RoomCard) => number {
  const warmth = ctx.sanctumPlanWarmth ?? 0;
  if (warmth <= 0 || !isSanctumLanding(target)) return () => 1;
  const entry = ctx.entryDir ?? 'N';
  const gain = sanctumPlanWeightMultiplier(warmth);
  return (card) => (cardOpensOntoSanctum(card, entry, manor, target) ? gain : 1);
}

// ---------------------------------------------------------------------------
// THE PLAN THE CARD FACE SAYS — the two round-36 rules, both about CONSEQUENCE
// ---------------------------------------------------------------------------

/**
 * How many ways on this plan leaves at this door — the number the card face
 * says in words ("Two ways on — north and east", ui/blueprint/doorplan.ts).
 *
 * `onwardDoors` and `resolveDoors` are the LIVE predicates; nothing here is a
 * second opinion about what a plan does, which is the round-13 lesson.
 */
function waysOnReader(
  entry: Dir, manor: ManorState, target: Cell,
): (card: RoomCard) => number {
  // Memoised for the life of ONE offer: both rules ask the same question of
  // the same pool up to five times, and `resolveDoors` is not free (round 36
  // measured a campaign band time out on the unmemoised first draft).
  const seen = new Map<string, number>();
  return (card) => {
    const hit = seen.get(card.id);
    if (hit !== undefined) return hit;
    const n = onwardDoors(
      resolveDoors(card, entry, manor, target), entry, manor, target,
    ).length;
    seen.set(card.id, n);
    return n;
  };
}

/**
 * ── ROUND 36, RULE B: THE MANOR DOES NOT DEAL THE SAME PLAN THREE TIMES ────
 *
 * A weight, never a filter — the same ruling `wingBoost` is built on (AAA 4.6:
 * the draft stays a decision, and a tidied deck must never be a replaced one).
 * A card whose plan says the SAME NUMBER OF WAYS ON as a card already in the
 * offer is suppressed to `PLAN_SPREAD_SUPPRESSION` of its weight; if the pool
 * holds nothing else, the suppressed card still wins, because an offer that
 * runs short is worse than an offer that repeats itself.
 *
 * WHY THE COUNT AND NOT THE CARD. Two cards that both say "one way on" are two
 * different rooms and one decision: the door-plan line — the single change in
 * this project that demonstrably altered how a stranger PLAYED — reads the same
 * on both, so whatever she is choosing between, it is not where the house goes
 * next. The rule is stated on the sentence the card prints, so what it fixes is
 * what she reads.
 *
 * WHY 0.03, AND WHY IT IS NOT 0.10 ANY MORE. Round 36 shipped 0.10 and derived
 * it honestly — but it derived it against a rule that was allowed to pay for
 * plan variety with CATEGORY weight, and this round has taken that purse away
 * (`drawOne`). A weaker rule needs a firmer hand for the same work, so the walk
 * was redone from scratch on the same instrument (`tests/draft-dominance.test.ts`
 * grid-true walker, 900 evenings, category-neutral `drawOne`, `WAGE_SPREAD`
 * live), and the stopping rule is no longer "where the curve flattens" — it is
 * **the value at which the round-36 dominance rate is preserved with the mix
 * pinned**, which is a published number rather than a judgement about a knee:
 *
 *     value          dominance   offer puzzle share   frontier flat
 *     1.00 (no rule)   51.9%           59.5%               26.1%
 *     0.20             41.3%           59.2%               13.2%
 *     0.10             38.0%           59.1%               10.0%
 *     0.05             36.0%           59.1%                8.6%
 *     0.03             34.6%           59.0%                7.7%   ← shipped
 *     0.02             33.8%           59.1%                7.2%
 *
 * 0.03 is where the walker comes back to what round 36 measured (34.9%) with
 * the mix pinned. Below it the walker keeps falling and the DAY model stops
 * following — at 0.02 the two instruments read 33.8% and 39.4% and the
 * five-point agreement clause in `tests/draft-dominance.test.ts` fails. That
 * clause is the reason to stop, and it is a measurement rather than a knee.
 *
 * It is a SUPPRESSION and not a ban, and the difference is load-bearing: a
 * suppressed card still wins its slot when the pool holds nothing else, and the
 * deck can and does still deal her two plans that say the same thing (measured
 * at 0.03: some pair of cards still repeats a frontier count on 64.1% of
 * offers — what has nearly gone is all THREE saying it, 31.6% → 7.7%).
 * `tests/drafting.test.ts` pins the "it is still a weight" clause so a later
 * round cannot quietly turn it into one.
 *
 * IT IS SILENT WITHOUT A HEADING. `entryDir` is what makes a plan a plan (the
 * rotation is rigid), so a caller that has no door — `deckMixAt`'s composition
 * probe, the wing tests — draws EXACTLY the cards it drew before. That is what
 * keeps the 4.10b clock and every mix band calibrated, and
 * `tests/drafting.test.ts` proves the bit-identity rather than asserting it.
 * (The KEY-RATE probe used to be on that list and should never have been: see
 * `measuredKeyRate`, which round 40 gave the heading the live game supplies.)
 */
export const PLAN_SPREAD_SUPPRESSION = 0.03;

/**
 * ── ROUND 40, RULE C: NOR THE SAME WAGE THREE TIMES ────────────────────────
 *
 * RULE B'S OTHER HALF, and it exists because round 40 took away Rule B's
 * cheapest source of variety. The draft card face prints exactly two things a
 * player can act on before she spends — the door plan (how many ways on) and
 * what the room can pay — and `isDominated` reads exactly those two. Round 36
 * spread the first and left the second alone, which was survivable only because
 * the rule could reach ACROSS categories for a card that differed on both at
 * once: a parlor is wide and pays nothing, a puzzle room is tight and pays.
 * Take the category away (which is what restoring the mix does) and spreading
 * the plan alone leaves the wage axis tie-heavy inside the category — three
 * puzzle rooms, three different plans, and whichever pays most is top of both.
 *
 * So a card whose WAGE at this row band equals one already in the offer is
 * suppressed to `WAGE_SPREAD_SUPPRESSION` of its weight, through the same
 * per-category normalisation, and the wage is read off `cardStepValue` — the
 * same function the dominance instrument reads, never a second opinion.
 *
 * IT IS A NO-OP WHERE A CATEGORY HAS NO WAGES TO SPREAD, by construction, which
 * is the neatest evidence that it is doing what its name says: every parlor and
 * every violet room pays 0, so inside those categories the term is a constant
 * and the normalisation divides it straight back out. It acts on the puzzle
 * rooms (4 · 6 · 15 steps at tier 1) and on the utility rooms, and nowhere else.
 *
 * WHY 0.10 AND NOT 0.03. Walked the same way, on the same instrument, at
 * `PLAN_SPREAD_SUPPRESSION = 0.03`:
 *
 *     1.00 (no rule)  walker 37.6%  ·  day model 40.9/40.6%
 *     0.30            35.8%  ·  40.0/39.3%
 *     0.15            34.8%  ·  40.6/38.9%     the two instruments drift apart
 *     0.10            34.6%  ·  39.2/37.9%     ← shipped
 *     0.06            34.7%  ·  40.2/39.2%     no further gain, and the gap grows
 *
 * 0.10 is where BOTH instruments are lowest together. Below it the walker stops
 * improving and the day model gets noisier, which is the honest reason to stop.
 */
export const WAGE_SPREAD_SUPPRESSION = 0.10;

/**
 * ── ROUND 36, RULE A: THERE IS ALWAYS A WAY ON, IF THE DECK HOLDS ONE ──────
 *
 * From the 11 Aug cold read: a tester's run ended at a door where ALL THREE
 * CARDS SEALED and he had no gems to reroll. He read it as arbitrary, and he
 * was right to — an offer of three cul-de-sacs is not a decision, it is a
 * dice roll the game already lost for him. Measured on the grid-true walker at
 * round 35's HEAD: **4.91% of offers** — at ~9.9 offers an evening, roughly two
 * evenings in five contained one. It is 0.10% now, and what is left is the
 * honest residue: rows where the eligible pool genuinely holds no plan that
 * opens, which is a fact about the deck and not a coin the offer flipped.
 *
 * So the LAST slot is drawn from the plans that do not seal, whenever the two
 * already in her hand both do and the pool holds one. It rides on slot 3 rather
 * than slot 1 because slot 1 has two promises already (free, and the landing
 * mercy) and a third would start deciding the offer for her; and it is a
 * NARROWED POOL rather than a redraw, so the rng stream is exactly where it was
 * — a reroll at this door still advances only this door (AAA 4.8).
 *
 * The tension the round-20 rebalance was careful to keep is kept: a sealing
 * plan can still be the best card in the offer (it pays a gem, and it is
 * stamped), two of three can still seal, and the deck can still hand her three
 * if it genuinely has nothing else at this row. What can no longer happen is
 * being walled in with no card that says otherwise.
 */
function nonSealing(
  pool: readonly RoomCard[], waysOn: (card: RoomCard) => number,
): RoomCard[] {
  return pool.filter((c) => waysOn(c) > 0);
}

/**
 * The 3 cards offered behind a door into `target`. Seeded purely by
 * (daySeed, target cell, drawIndex) — never by where the player stands —
 * so every door's stream is independent (AAA 4.8).
 */
export function rollCards(
  deck: readonly RoomCard[], manor: ManorState, target: Cell, rawCtx: DraftRollCtx,
): RoomCard[] {
  // The target cell IS the wing, so no caller can pass one and forget the
  // other (the same reason `rollOffer` fills `entryDir` from the door).
  const ctx: DraftRollCtx = { ...rawCtx, targetCol: target.col };
  if (ctx.scripted) {
    const scripted = SCRIPTED_FIRST_DRAFT
      .map((id) => cardById(id))
      .filter((c): c is RoomCard => Boolean(c));
    if (scripted.length === 3) return scripted;
  }
  const rng = createRng(hashSeed(manor.daySeed, cellKey(target), ctx.drawIndex));
  const row = target.row;
  const pool = eligibleCards(deck, manor, row);
  const cards: RoomCard[] = [];
  const boost = landingBoost(manor, target, ctx);
  // The spread rules read the plan, and a plan needs a heading (see
  // PLAN_SPREAD_SUPPRESSION): with no door, this is exactly the old draw.
  // The WAGE half rides on the same switch on purpose — a card's wage is
  // knowable without a door, but the two halves are one rule about one card
  // face, and a caller with no heading is a probe rather than a player.
  const heading = ctx.entryDir;
  const waysOn = heading ? waysOnReader(heading, manor, target) : undefined;
  const saidSoFar: number[] = [];
  const wageAt = (card: RoomCard) => cardStepValue(card, rowTier(row));
  const wagesSoFar: number[] = [];

  // Slot 1: guaranteed free (AAA 4.1 / the BP slot-1 rule).
  const free = pool.filter((c) => c.gemCost === 0);
  let first = free.length > 0 ? free : pool;
  // THE ACCESS MERCY (AAA 4.14, round 13) rides on the free slot rather than
  // adding a fourth card, so the offer keeps its shape and slot 1 keeps its
  // promise: the guaranteed-takeable card is the one that opens the door. It
  // narrows the pool only if something is left in it — affordability outranks
  // mercy, because an offer she cannot take is the one thing 4.1 forbids.
  if (ctx.sanctumMercy && isSanctumLanding(target)) {
    const entry = ctx.entryDir ?? 'N';
    const opens = first.filter((c) => cardOpensOntoSanctum(c, entry, manor, target));
    if (opens.length > 0) first = opens;
  }
  cards.push(drawOne(rng, first, row, ctx, boost));
  if (waysOn) { saidSoFar.push(waysOn(cards[0]!)); wagesSoFar.push(wageAt(cards[0]!)); }

  // Slots 2–3: full pool, minus what this offer already holds.
  for (let slot = 1; slot < 3; slot++) {
    let rest = pool.filter((c) => !cards.some((p) => p.id === c.id));
    if (rest.length === 0) break; // pathological end-of-deck; offer runs short
    let spread: (card: RoomCard) => number = () => 1;
    if (waysOn) {
      // RULE A — the last slot answers a hand of nothing but cul-de-sacs.
      if (slot === 2 && saidSoFar.every((n) => n === 0)) {
        const open = nonSealing(rest, waysOn);
        if (open.length > 0) rest = open;
      }
      // RULES B and C — and it prefers a card that says something new about
      // either of the two things its face says.
      const said = new Set(saidSoFar);
      const paid = new Set(wagesSoFar);
      spread = (card) => (said.has(waysOn(card)) ? PLAN_SPREAD_SUPPRESSION : 1)
        * (paid.has(wageAt(card)) ? WAGE_SPREAD_SUPPRESSION : 1);
    }
    const drawn = drawOne(rng, rest, row, ctx, boost, spread);
    cards.push(drawn);
    if (waysOn) { saidSoFar.push(waysOn(drawn)); wagesSoFar.push(wageAt(drawn)); }
  }
  return cards;
}

/** Roll the full offer a player sees at a door. */
export function rollOffer(
  deck: readonly RoomCard[], manor: ManorState,
  from: Cell, atDoor: Dir, target: Cell, ctx: DraftRollCtx,
): DraftOffer {
  return {
    atDoor,
    from,
    // The door she is standing at IS her heading through it, so the offer can
    // ask "does this plan open onto the Sanctum" without the caller having to
    // remember to say so twice (engine/manor/grid.ts THE ORIENTATION CONVENTION).
    cards: rollCards(deck, manor, target, { ...ctx, entryDir: ctx.entryDir ?? atDoor }),
    rerolled: ctx.drawIndex > 0,
  };
}

// ---------------------------------------------------------------------------
// Dewey's prophecy
// ---------------------------------------------------------------------------

/** Every wall an empty cell can be walked in through (see below). */
const DEWEY_HEADINGS: readonly Dir[] = ['N', 'E', 'S', 'W'];

/**
 * Petting Dewey reveals whether his row hides a violet room (MANOR_DESIGN §8).
 * Honest and deterministic: true if a mystery room is already placed in his
 * row, or if any empty cell in the row would offer a violet card in its next
 * draft (same streams the real drafts will use).
 *
 * ── ROUND 40: WHAT SHE SAYS IS TRUE AGAIN, AND WHAT SHE CANNOT KNOW ────────
 *
 * The cat prints one of two absolute sentences (`pages/ManorPage.tsx`):
 * *"Something violet hides on this floor"* or *"No violet rooms on this floor
 * today"*. Round 36 made both of them guesses. This function has no way of
 * knowing which DOOR the player will open into a given cell, and from round 36
 * the offer depends on it — so the draw it inspected (heading-free) was one the
 * game never makes, and a cat who is the only one in the house was telling her
 * something that need not be so.
 *
 * The heading is genuinely unknowable here, so the fix is not to guess one: it
 * is to ask the question she can actually be told the answer to. **Every wall,
 * every empty cell in the row.** That makes each sentence exact in the
 * direction it is stated:
 *
 *   - "No violet rooms on this floor today" is now EXACT. There is no door into
 *     any empty cell of this row whose next offer holds a violet card, and no
 *     violet room already standing in it. Whatever she does, the row is empty
 *     of violet. Round 36 could not say this at all.
 *   - "Something violet hides on this floor" means there IS a way in that deals
 *     her one — which is what "hides" says. It does not promise the first door
 *     she tries; a cat points, she still has to look.
 *
 * IT COSTS ALMOST NOTHING AND IT CHANGES ALMOST NOTHING, which is the tell that
 * the leak was in the reasoning rather than in the numbers: measured over 2,000
 * days, Dewey says yes on 47.5% of them, against 47.5% for the heading-free
 * draw and 47.1% for a single canonical heading. The reason is round 40's
 * `drawOne`: with the spread rules normalised PER CATEGORY and the pool held in
 * category blocks, the CATEGORY of each card drawn is invariant under the
 * heading on 98.77% of draws (measured, 324,000 of them) — the residue is
 * RULE A, which narrows the pool and so moves the category boundaries. So the
 * union over four headings is cheap, and the reason it is cheap is a property
 * worth stating out loud rather than a coincidence.
 */
export function deweyProphecy(
  deck: readonly RoomCard[], manor: ManorState,
  opts: {
    gems: number;
    declinedLastDraft: readonly string[];
    drawIndexFor: (cellKey: string) => number;
    /** Same key-access term the live drafts use, so the prophecy stays honest. */
    keyAccess?: number;
    /** …and the same wing memory, for the same reason (round 20). */
    wings?: WingCharacters;
  },
): boolean {
  const row = deweyCell(manor.daySeed).row;
  for (const r of Object.values(manor.rooms)) {
    if (r.cell.row === row && r.kind === 'mystery') return true;
  }
  for (let col = 0; col < MANOR_COLS; col++) {
    const cell: Cell = { col: col as Cell['col'], row };
    if (roomAt(manor, cell)) continue;
    for (const entryDir of DEWEY_HEADINGS) {
      const cards = rollCards(deck, manor, cell, {
        gems: opts.gems,
        declinedLastDraft: opts.declinedLastDraft,
        drawIndex: opts.drawIndexFor(cellKey(cell)),
        keyAccess: opts.keyAccess,
        wings: opts.wings,
        entryDir,
      });
      if (cards.some((c) => c.category === 'mystery')) return true;
    }
  }
  return false;
}
