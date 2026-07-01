import type { WordWebPuzzle } from './types';

/**
 * Word Web (Connections-style) engine.
 * Select 4 words, submit; a correct group is removed. Wrong submissions
 * cost a mind point (handled by the run layer via the 'wrong' event).
 */

export interface WordWebState {
  puzzleId: string;
  solvedTiers: string[]; // tier keys in solve order
  remainingWords: string[];
  wrongAttempts: number;
  status: 'playing' | 'won';
}

export type WordWebSubmit =
  | { kind: 'solved'; theme: string; tier: string; words: string[]; won: boolean }
  | { kind: 'one-away' } // exactly 3 of 4 share a group — classic Connections feedback
  | { kind: 'wrong' }
  | { kind: 'invalid'; reason: 'need-four' | 'unknown-word' | 'finished' };

export function startWordWeb(puzzle: WordWebPuzzle): WordWebState {
  return {
    puzzleId: puzzle.id,
    solvedTiers: [],
    remainingWords: puzzle.groups.flatMap((g) => g.words),
    wrongAttempts: 0,
    status: 'playing',
  };
}

export function submitGroup(
  puzzle: WordWebPuzzle,
  state: WordWebState,
  selection: string[],
): { state: WordWebState; result: WordWebSubmit } {
  if (state.status !== 'playing') return { state, result: { kind: 'invalid', reason: 'finished' } };
  if (selection.length !== 4) return { state, result: { kind: 'invalid', reason: 'need-four' } };
  const sel = selection.map((w) => w.toUpperCase());
  if (!sel.every((w) => state.remainingWords.includes(w))) {
    return { state, result: { kind: 'invalid', reason: 'unknown-word' } };
  }

  let bestOverlap = 0;
  let match: (typeof puzzle.groups)[number] | null = null;
  for (const group of puzzle.groups) {
    const overlap = sel.filter((w) => group.words.includes(w)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      match = group;
    }
  }

  if (bestOverlap === 4 && match) {
    const solvedTiers = [...state.solvedTiers, match.tier];
    const remainingWords = state.remainingWords.filter((w) => !match!.words.includes(w));
    const won = solvedTiers.length === puzzle.groups.length;
    return {
      state: { ...state, solvedTiers, remainingWords, status: won ? 'won' : 'playing' },
      result: { kind: 'solved', theme: match.theme, tier: match.tier, words: match.words, won },
    };
  }

  const next = { ...state, wrongAttempts: state.wrongAttempts + 1 };
  return { state: next, result: bestOverlap === 3 ? { kind: 'one-away' } : { kind: 'wrong' } };
}

/**
 * Instant-solve support (Glyph of Decay): resolve all remaining groups.
 */
export function solveWordWeb(puzzle: WordWebPuzzle, state: WordWebState): WordWebState {
  return {
    ...state,
    solvedTiers: puzzle.groups.map((g) => g.tier),
    remainingWords: [],
    status: 'won',
  };
}

/**
 * Perk 'Lexical Proximity': for a wrong guess, report the size of the largest
 * overlap with any single group (2 = "two belong together", etc.).
 */
export function proximityHint(puzzle: WordWebPuzzle, selection: string[]): number {
  const sel = selection.map((w) => w.toUpperCase());
  return Math.max(...puzzle.groups.map((g) => sel.filter((w) => g.words.includes(w)).length));
}
