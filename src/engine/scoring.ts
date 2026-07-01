import type { GameMode } from './types';

/**
 * Scoring, ported from the original game and normalized.
 * Every mode returns a base score; run-level multipliers apply on top.
 */

export const MODE_DIFFICULTY_MULTIPLIER: Record<GameMode, number> = {
  'word-web': 1.0,
  hive: 1.2,
  twistle: 1.1,
  'forgotten-word': 1.5,
};

/** Level multiplier: deeper levels are worth more. */
export function levelMultiplier(level: number): number {
  return 1 + 0.5 * (level - 1); // L1 = 1.0, L2 = 1.5, L3 = 2.0
}

export function scoreWordWeb(opts: { wrongAttempts: number }): number {
  const base = 300;
  const perfectBonus = opts.wrongAttempts === 0 ? 100 : 0;
  const penalty = Math.min(100, opts.wrongAttempts * 20);
  return base + perfectBonus - penalty;
}

export function scoreHive(opts: { wordScores: number[]; entropy: number }): number {
  const wordTotal = opts.wordScores.reduce((s, p) => s + p, 0) * 10;
  const cleanBonus = opts.entropy === 0 ? 100 : 0;
  return wordTotal + cleanBonus;
}

export function scoreTwistle(opts: { wordsFound: number; wrongAttempts: number; durationMs: number }): number {
  const base = 200;
  const wordBonus = opts.wordsFound * 25;
  const speedBonus = Math.max(0, Math.round(((120_000 - opts.durationMs) / 120_000) * 50));
  const penalty = Math.min(80, opts.wrongAttempts * 10);
  return base + wordBonus + speedBonus - penalty;
}

export function scoreForgottenWord(opts: { hintsUsed: number; wrongGuesses: number }): number {
  const base = 300;
  const perfectBonus = opts.hintsUsed === 0 && opts.wrongGuesses === 0 ? 200 : 0;
  const hintPenalty = opts.hintsUsed * 25;
  const guessPenalty = opts.wrongGuesses * 15;
  return Math.max(50, base + perfectBonus - hintPenalty - guessPenalty);
}

/** Final node score: base * mode multiplier * level multiplier * glyph multiplier. */
export function finalNodeScore(opts: {
  baseScore: number;
  mode: GameMode;
  level: number;
  scoreMultiplierPercent: number; // e.g. 20 for +20%
}): number {
  return Math.round(
    opts.baseScore *
      MODE_DIFFICULTY_MULTIPLIER[opts.mode] *
      levelMultiplier(opts.level) *
      (1 + opts.scoreMultiplierPercent / 100),
  );
}

/** Hive word points: Spelling Bee convention (4 letters = 1, else length; pangram +7). */
export function hiveWordPoints(word: string, isPangram: boolean): number {
  const base = word.length === 4 ? 1 : word.length;
  return base + (isPangram ? 7 : 0);
}
