/**
 * Tier-faithful puzzle selection, shared by every room adapter. OWNER: A3.
 *
 * ROUND 4 (owner directive: "escalating difficulty as you move closer to the
 * door"). Every generator now stamps each puzzle with a `tier` (1|2|3) that
 * maps to the manor's row bands via `rowTier` — rows 0–2 / 3–4 / 5–6 — and the
 * tier differences are STRUCTURAL (grid size, curated word count, clue
 * register, crib availability, herring tightness), not cosmetic labels.
 *
 * The old per-adapter selector reached for a *difficulty band* — tier 3 meant
 * `['expert', 'hard']`, tier 2 meant `['hard', 'medium']` — so a tier-3 room
 * routinely served the same 'hard' puzzle a tier-2 room had served, and the
 * rows felt identical in play. That leak is closed here:
 *
 *   1. fresh at the EXACT tier            — the normal case;
 *   2. any puzzle at the exact tier       — a repeat at the right difficulty
 *                                           beats a fresh puzzle at the wrong
 *                                           one; the row's promise is kept;
 *   3. fresh at a neighbouring tier       — only if the tier's pool is empty
 *                                           (content bug or an unshipped tier);
 *   4. anything at all                    — never crash a room.
 *
 * Puzzles without a `tier` field (older bundles) are treated as tier 1, so a
 * stale save or a half-regenerated pool degrades gently rather than throwing.
 */

import type { Tier } from '../../types';
import { createRng, pick } from '../../rng';

/** The minimum a pool entry must offer to be tier-selectable. */
export interface TieredPuzzle {
  id: string;
  tier?: Tier;
}

export function tierOf(puzzle: TieredPuzzle): Tier {
  return puzzle.tier ?? 1;
}

/**
 * Human-readable name for a tier.
 *
 * ROUND 4 CLEANUP: shipped puzzles used to carry a `difficulty` field that was
 * a pure display alias for `tier` — 895 puzzles each storing a second copy of
 * a number they already had, which could (and did, before tier-select) drift
 * out of agreement with it. The field is gone from the generators, the JSON and
 * engine/types.ts; anywhere a word is wanted instead of a number, DERIVE it
 * here. The manor's own copy (DraftModal, CabinetSheet) derives from `tier`
 * too — this is the same rule, one function.
 */
export const TIER_LABELS: Record<Tier, string> = { 1: 'easy', 2: 'medium', 3: 'hard' };

export function tierLabel(tier: Tier): string {
  return TIER_LABELS[tier];
}

/** Neighbour search order when a tier's pool is entirely missing. */
export function neighbourTiers(tier: Tier): Tier[] {
  if (tier === 3) return [2, 1];
  if (tier === 2) return [3, 1];
  return [2, 3];
}

export interface TierSelectOpts {
  tier: Tier;
  seed: number;
  seenIds: readonly string[];
}

export function selectByTier<T extends TieredPuzzle>(
  pool: readonly T[],
  { tier, seed, seenIds }: TierSelectOpts,
): T {
  const rng = createRng(seed);
  const seen = new Set(seenIds);

  const atTier = pool.filter((p) => tierOf(p) === tier);
  const fresh = atTier.filter((p) => !seen.has(p.id));
  if (fresh.length > 0) return pick(rng, fresh);
  if (atTier.length > 0) return pick(rng, atTier);

  for (const t of neighbourTiers(tier)) {
    const near = pool.filter((p) => tierOf(p) === t && !seen.has(p.id));
    if (near.length > 0) return pick(rng, near);
  }
  const anyFresh = pool.filter((p) => !seen.has(p.id));
  return anyFresh.length > 0 ? pick(rng, anyFresh) : pick(rng, pool);
}
