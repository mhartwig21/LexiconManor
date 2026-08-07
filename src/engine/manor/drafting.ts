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
 * All functions are pure. The manor slice owns the mutable bookkeeping
 * (per-cell draw indices, last-declined set) and passes it in.
 */

import type { Cell, Dir, DraftOffer, ManorState, RoomCard, RoomCategory, Tier } from '../types';
import { MANOR_COLS } from '../types';
import { createRng, pickWeighted, type Rng } from '../rng';
import {
  cardOpensOntoSanctum, cellKey, deweyCell, hashSeed, roomAt, rowTier, sameCell,
  SANCTUM_DOOR_CELL,
} from './grid';
import { cardById, isKeyBearing, SCRIPTED_FIRST_DRAFT } from './deck';
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
   * `SANCTUM_DOOR_CELL`; 0/omitted leaves every weight in the game exactly as
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
): RoomCard {
  // The wing term is normalised against THIS pool (see `wingBoost`), so it is
  // resolved here rather than folded into the per-card weight.
  const wing = wingBoost(pool, row, ctx);
  return pickWeighted(
    rng,
    pool.map((c) => ({ item: c, weight: cardWeight(c, row, ctx) * boost(c) * wing(c) })),
  );
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
 * Three things answer it, and only the third is here: the card face now stamps
 * which plans open onto the Sanctum (ui/blueprint/DraftModal.tsx), the
 * blueprint answers the refusal instead of going quiet (BlueprintSheet), and
 * this function gives the gate the arc and the floor it never had
 * (engine/economy/steps.ts `SANCTUM_ARC`).
 *
 * Returns a per-card weight multiplier, and it is exactly 1 everywhere except
 * `SANCTUM_DOOR_CELL` with a warmed arc — no other cell in the manor can be
 * affected by any of this, which is what keeps `deckMixAt` (and the 4.10b
 * clock derived from it) untouched.
 */
function landingBoost(
  manor: ManorState, target: Cell, ctx: DraftRollCtx,
): (card: RoomCard) => number {
  const warmth = ctx.sanctumPlanWarmth ?? 0;
  if (warmth <= 0 || !sameCell(target, SANCTUM_DOOR_CELL)) return () => 1;
  const entry = ctx.entryDir ?? 'N';
  const gain = sanctumPlanWeightMultiplier(warmth);
  return (card) => (cardOpensOntoSanctum(card, entry, manor, target) ? gain : 1);
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

  // Slot 1: guaranteed free (AAA 4.1 / the BP slot-1 rule).
  const free = pool.filter((c) => c.gemCost === 0);
  let first = free.length > 0 ? free : pool;
  // THE ACCESS MERCY (AAA 4.14, round 13) rides on the free slot rather than
  // adding a fourth card, so the offer keeps its shape and slot 1 keeps its
  // promise: the guaranteed-takeable card is the one that opens the door. It
  // narrows the pool only if something is left in it — affordability outranks
  // mercy, because an offer she cannot take is the one thing 4.1 forbids.
  if (ctx.sanctumMercy && sameCell(target, SANCTUM_DOOR_CELL)) {
    const entry = ctx.entryDir ?? 'N';
    const opens = first.filter((c) => cardOpensOntoSanctum(c, entry, manor, target));
    if (opens.length > 0) first = opens;
  }
  cards.push(drawOne(rng, first, row, ctx, boost));

  // Slots 2–3: full pool, minus what this offer already holds.
  for (let slot = 1; slot < 3; slot++) {
    const rest = pool.filter((c) => !cards.some((p) => p.id === c.id));
    if (rest.length === 0) break; // pathological end-of-deck; offer runs short
    cards.push(drawOne(rng, rest, row, ctx, boost));
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

/**
 * Petting Dewey reveals whether his row hides a violet room (MANOR_DESIGN §8).
 * Honest and deterministic: true if a mystery room is already placed in his
 * row, or if any empty cell in the row would offer a violet card in its next
 * draft (same streams the real drafts will use).
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
    const cards = rollCards(deck, manor, cell, {
      gems: opts.gems,
      declinedLastDraft: opts.declinedLastDraft,
      drawIndex: opts.drawIndexFor(cellKey(cell)),
      keyAccess: opts.keyAccess,
      wings: opts.wings,
    });
    if (cards.some((c) => c.category === 'mystery')) return true;
  }
  return false;
}
