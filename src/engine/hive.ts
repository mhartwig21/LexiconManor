import type { HivePuzzle } from './types';
import { hiveWordPoints } from './scoring';

/**
 * Hive Builder (Spelling Bee-style) engine with the entropy mechanic:
 * invalid submissions fade a letter; at MAX_ENTROPY the puzzle is lost.
 * A faded letter can be restored by spending a mind point (run layer applies
 * the cost; this module just mutates puzzle state).
 */

export const MAX_ENTROPY = 6;

export interface HiveState {
  puzzleId: string;
  foundWords: string[];
  score: number;
  entropy: number;
  /** Letters currently faded (subset of outer letters; center never fades). */
  fadedLetters: string[];
  pointThreshold: number;
  status: 'playing' | 'won' | 'lost';
}

export type HiveSubmit =
  | { kind: 'valid'; word: string; points: number; isPangram: boolean; won: boolean }
  | { kind: 'invalid'; reason: HiveInvalidReason; entropyRose: boolean; lost: boolean };

export type HiveInvalidReason =
  | 'too-short'
  | 'missing-center'
  | 'bad-letter'
  | 'faded-letter'
  | 'not-a-word'
  | 'already-found'
  | 'finished';

export function startHive(puzzle: HivePuzzle, opts?: { thresholdBonus?: number }): HiveState {
  return {
    puzzleId: puzzle.id,
    foundWords: [],
    score: 0,
    entropy: 0,
    fadedLetters: [],
    pointThreshold: puzzle.pointThreshold + (opts?.thresholdBonus ?? 0),
    status: 'playing',
  };
}

export function submitHiveWord(
  puzzle: HivePuzzle,
  state: HiveState,
  rawWord: string,
  opts: { entropyImmune: boolean; fadePick: (candidates: string[]) => string },
): { state: HiveState; result: HiveSubmit } {
  if (state.status !== 'playing') {
    return { state, result: { kind: 'invalid', reason: 'finished', entropyRose: false, lost: false } };
  }
  const word = rawWord.toUpperCase().trim();
  const allowed = new Set([puzzle.center, ...puzzle.outer]);

  const reason: HiveInvalidReason | null =
    word.length < 4 ? 'too-short'
    : !word.includes(puzzle.center) ? 'missing-center'
    : ![...word].every((ch) => allowed.has(ch)) ? 'bad-letter'
    : [...word].some((ch) => state.fadedLetters.includes(ch)) ? 'faded-letter'
    : state.foundWords.includes(word) ? 'already-found'
    : !puzzle.validWords.includes(word) ? 'not-a-word'
    : null;

  if (reason !== null) {
    // Duplicates and mechanical slips don't raise entropy; bad words do.
    const punishable = reason === 'not-a-word' || reason === 'bad-letter';
    if (!punishable || opts.entropyImmune) {
      return { state, result: { kind: 'invalid', reason, entropyRose: false, lost: false } };
    }
    const entropy = state.entropy + 1;
    const fadeCandidates = puzzle.outer.filter((l) => !state.fadedLetters.includes(l));
    const fadedLetters =
      fadeCandidates.length > 0 ? [...state.fadedLetters, opts.fadePick(fadeCandidates)] : state.fadedLetters;
    const lost = entropy >= MAX_ENTROPY;
    return {
      state: { ...state, entropy, fadedLetters, status: lost ? 'lost' : 'playing' },
      result: { kind: 'invalid', reason, entropyRose: true, lost },
    };
  }

  const isPangram = puzzle.pangrams.includes(word);
  const points = hiveWordPoints(word, isPangram);
  const score = state.score + points;
  const won = score >= state.pointThreshold;
  return {
    state: { ...state, foundWords: [...state.foundWords, word], score, status: won ? 'won' : 'playing' },
    result: { kind: 'valid', word, points, isPangram, won },
  };
}

/** Restore a faded letter. Caller charges the mind point via the run layer. */
export function restoreLetter(state: HiveState, letter: string): HiveState {
  const up = letter.toUpperCase();
  if (!state.fadedLetters.includes(up)) return state;
  return {
    ...state,
    fadedLetters: state.fadedLetters.filter((l) => l !== up),
    entropy: Math.max(0, state.entropy - 1),
  };
}

/** Instant-solve support: mark the puzzle won at threshold. */
export function solveHive(state: HiveState): HiveState {
  return { ...state, score: Math.max(state.score, state.pointThreshold), status: 'won' };
}

/** Per-word point values for found words, used by scoring. */
export function foundWordScores(puzzle: HivePuzzle, state: HiveState): number[] {
  return state.foundWords.map((w) => hiveWordPoints(w, puzzle.pangrams.includes(w)));
}
