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
