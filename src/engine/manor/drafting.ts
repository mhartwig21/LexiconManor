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
import { cellKey, deweyCell, hashSeed, roomAt, rowTier } from './grid';
import { cardById, isKeyBearing, SCRIPTED_FIRST_DRAFT } from './deck';
import { keyCardWeightMultiplier } from '../economy/steps';

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
}

// ---------------------------------------------------------------------------
// Weights (the tunable surface — every knob lives here, exported for tests)
// ---------------------------------------------------------------------------

/**
 * Deck composition by row (MANOR_DESIGN §5): puzzle rooms are the bulk,
 * green fades as you climb, violet ramps strictly with row — the reason to
 * push upward is visible in every draft.
 */
export function categoryWeight(category: RoomCategory, row: number): number {
  switch (category) {
    case 'puzzle':  return 100;
    case 'parlor':  return 26;
    case 'utility': return Math.max(10, 46 - row * 6);   // 46 at row 0 → 10 up top
    case 'mystery': return 6 + row * 7;                  // 6 at row 0 → 48 up top
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

function drawOne(rng: Rng, pool: RoomCard[], row: number, ctx: DraftRollCtx): RoomCard {
  return pickWeighted(rng, pool.map((c) => ({ item: c, weight: cardWeight(c, row, ctx) })));
}

/**
 * The 3 cards offered behind a door into `target`. Seeded purely by
 * (daySeed, target cell, drawIndex) — never by where the player stands —
 * so every door's stream is independent (AAA 4.8).
 */
export function rollCards(
  deck: readonly RoomCard[], manor: ManorState, target: Cell, ctx: DraftRollCtx,
): RoomCard[] {
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

  // Slot 1: guaranteed free (AAA 4.1 / the BP slot-1 rule).
  const free = pool.filter((c) => c.gemCost === 0);
  cards.push(drawOne(rng, free.length > 0 ? free : pool, row, ctx));

  // Slots 2–3: full pool, minus what this offer already holds.
  for (let slot = 1; slot < 3; slot++) {
    const rest = pool.filter((c) => !cards.some((p) => p.id === c.id));
    if (rest.length === 0) break; // pathological end-of-deck; offer runs short
    cards.push(drawOne(rng, rest, row, ctx));
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
    cards: rollCards(deck, manor, target, ctx),
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
    });
    if (cards.some((c) => c.category === 'mystery')) return true;
  }
  return false;
}
