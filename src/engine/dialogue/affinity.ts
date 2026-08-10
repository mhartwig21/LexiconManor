/**
 * Affinity ranks — OWNER: A6 (Dialogue).
 *
 * Two independent tracks per character, exactly like Hades (BENCHMARKS §5):
 * affinity points (gifts +1, warm conversation choices) and the arc chain
 * (seen-linked nodes). Milestones require both. Ranks are the service tiers:
 * each rank-up plays a bespoke scene (AAA 5.7) and unlocks a warmer service +
 * a piece of mystery context (MANOR_DESIGN §8).
 */

/** Points needed to *hold* each rank; rank 0 is the default acquaintance. */
export const AFFINITY_RANK_THRESHOLDS = [0, 2, 5, 9, 14] as const;

export const MAX_AFFINITY_RANK = AFFINITY_RANK_THRESHOLDS.length - 1;

/** Current rank for a points total. */
export function rankFor(points: number): number {
  let rank = 0;
  for (let i = 0; i < AFFINITY_RANK_THRESHOLDS.length; i++) {
    const t = AFFINITY_RANK_THRESHOLDS[i];
    if (t !== undefined && points >= t) rank = i;
  }
  return rank;
}

/** Points still needed for the next rank, or undefined at max. */
export function pointsToNextRank(points: number): number | undefined {
  const next = AFFINITY_RANK_THRESHOLDS[rankFor(points) + 1];
  return next === undefined ? undefined : next - points;
}

/**
 * ROUND 24 (COMPREHENSION, fix 4) — HOW FAR INTO THE CURRENT RANK, 0…1.
 *
 * The pips render RANK, and rank 1 costs two points while a gift is worth one,
 * so the first gift anybody ever gave moved nothing on screen. All three blind
 * testers concluded the gift economy was inert; one gave away every bookmark he
 * owned across three characters and listed it as the thing to fix before
 * recommending the game.
 *
 * This is the number the pip is filled by. It lives here, beside the thresholds
 * it is derived from, rather than in the scene — so a later retune of
 * AFFINITY_RANK_THRESHOLDS cannot leave the meter lying, and so the claim "one
 * gift is visible" is a unit test rather than a screenshot.
 *
 * 0 at the maximum rank: there is nothing left to fill.
 */
export function rankProgress(points: number): number {
  const rank = rankFor(points);
  const floor = AFFINITY_RANK_THRESHOLDS[rank];
  const ceil = AFFINITY_RANK_THRESHOLDS[rank + 1];
  if (floor === undefined || ceil === undefined || ceil <= floor) return 0;
  return Math.min(1, Math.max(0, (points - floor) / (ceil - floor)));
}
