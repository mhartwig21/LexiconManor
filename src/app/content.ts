import type { Tier, GameMode, WordWebPuzzle, HivePuzzle, TwistlePuzzle, ForgottenWordPuzzle } from '../engine/types';
import { createRng, pick } from '../engine/rng';
import { getPools, lazyContent } from './pools';

/**
 * Puzzle selection over the shipped bundles. Selection is seeded per
 * (run, node) so re-entering a node shows the same puzzle, and seen-tracking
 * in the save file prevents repeats across runs until a pool exhausts.
 * Content arrives via the lazy pools registry (AAA 9.6 — app/pools.ts is the
 * one importer of content JSON); the exported consts are lazy views.
 */

export const WORD_WEB_PUZZLES = lazyContent<WordWebPuzzle[]>(() => getPools().wordWeb);
export const HIVE_PUZZLES = lazyContent<HivePuzzle[]>(() => getPools().hive);
export const TWISTLE_PUZZLES = lazyContent<TwistlePuzzle[]>(() => getPools().twistle);
export const FORGOTTEN_WORD_PUZZLES = lazyContent<ForgottenWordPuzzle[]>(() => getPools().forgottenWord);

/**
 * Tiers served per level, in preference order.
 *
 * ROUND 4 CLEANUP: this used to prefer *difficulty labels*, a field that was a
 * pure alias for `tier`. The alias is retired; the preference is stated in the
 * authoritative units. (The manor's own selector is
 * engine/rooms/adapters/tier-select.ts — this legacy v1 path is kept only for
 * the pre-manor level flow.)
 */
export function tiersForLevel(level: number): Tier[] {
  if (level <= 1) return [1, 2];
  if (level === 2) return [2, 3];
  return [3, 2];
}

interface HasIdAndTier {
  id: string;
  tier?: Tier;
}

function selectFrom<T extends HasIdAndTier>(
  pool: T[],
  opts: { level: number; seenIds: string[]; seed: number },
): T {
  const preferences = tiersForLevel(opts.level);
  const rng = createRng(opts.seed);
  const seen = new Set(opts.seenIds);

  for (const tier of preferences) {
    const fresh = pool.filter((p) => (p.tier ?? 1) === tier && !seen.has(p.id));
    if (fresh.length > 0) return pick(rng, fresh);
  }
  // Any unseen puzzle beats a repeat; a repeat beats crashing.
  const anyFresh = pool.filter((p) => !seen.has(p.id));
  if (anyFresh.length > 0) return pick(rng, anyFresh);
  return pick(rng, pool);
}

/** Stable per-node seed so a node always shows the same puzzle within a run. */
export function nodeSeed(runSeed: number, nodeId: string): number {
  let h = runSeed >>> 0;
  for (const ch of nodeId) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function selectWordWeb(opts: { level: number; seenIds: string[]; seed: number }): WordWebPuzzle {
  return selectFrom(WORD_WEB_PUZZLES, opts);
}

export function selectHive(opts: { level: number; seenIds: string[]; seed: number }): HivePuzzle {
  return selectFrom(HIVE_PUZZLES, opts);
}

export function selectTwistle(opts: { level: number; seenIds: string[]; seed: number }): TwistlePuzzle {
  return selectFrom(TWISTLE_PUZZLES, opts);
}

export function selectForgottenWord(opts: { level: number; seenIds: string[]; seed: number }): ForgottenWordPuzzle {
  // Forgotten Word pools by obscurity rather than difficulty; map level -> obscurity.
  const rng = createRng(opts.seed);
  const seen = new Set(opts.seenIds);
  const tiers: ForgottenWordPuzzle['obscurity'][][] = [
    ['common', 'medium'],
    ['medium', 'rare'],
    ['rare', 'archaic', 'medium'],
  ];
  const wanted = tiers[Math.min(opts.level, 3) - 1]!;
  for (const tier of wanted) {
    const fresh = FORGOTTEN_WORD_PUZZLES.filter((p) => p.obscurity === tier && !seen.has(p.id));
    if (fresh.length > 0) return pick(rng, fresh);
  }
  const anyFresh = FORGOTTEN_WORD_PUZZLES.filter((p) => !seen.has(p.id));
  return anyFresh.length > 0 ? pick(rng, anyFresh) : pick(rng, FORGOTTEN_WORD_PUZZLES);
}

/** Modes that are fully playable in the current phase of the rebuild. */
export const IMPLEMENTED_MODES: GameMode[] = ['word-web', 'hive', 'twistle', 'forgotten-word'];
