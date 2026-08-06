import type { Difficulty, GameMode, WordWebPuzzle, HivePuzzle, TwistlePuzzle, ForgottenWordPuzzle } from '../engine/types';
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

/** Difficulty tiers served per level, in preference order. */
export function difficultiesForLevel(level: number): Difficulty[] {
  if (level <= 1) return ['medium', 'easy'];
  if (level === 2) return ['hard', 'medium'];
  return ['expert', 'hard'];
}

interface HasIdAndDifficulty {
  id: string;
  difficulty: Difficulty;
}

function selectFrom<T extends HasIdAndDifficulty>(
  pool: T[],
  opts: { level: number; seenIds: string[]; seed: number },
): T {
  const preferences = difficultiesForLevel(opts.level);
  const rng = createRng(opts.seed);
  const seen = new Set(opts.seenIds);

  for (const difficulty of preferences) {
    const fresh = pool.filter((p) => p.difficulty === difficulty && !seen.has(p.id));
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
