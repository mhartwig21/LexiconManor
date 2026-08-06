import type { ForgottenWordPuzzle } from './types';

/**
 * The Forgotten Word (boss) engine.
 * Guess the word from a definition whose clarity scales with level:
 * plain (level 1) -> poetic (level 2) -> riddle (level 3+).
 * Etymology and usage clues are locked behind trials (timed Hive minigames);
 * the trial itself is a HiveState — this module only tracks lock state.
 */

export type ClueId = 'etymology' | 'usage';

export interface ForgottenWordState {
  puzzleId: string;
  guesses: string[];
  maxGuesses: number;
  unlockedClues: ClueId[];
  hintsUsed: number;
  status: 'playing' | 'won' | 'lost';
}

export type ForgottenWordGuess =
  | { kind: 'correct'; word: string }
  | { kind: 'wrong'; guessesLeft: number; lost: boolean }
  /**
   * 'wrong-length': the card already announced the letter count, so a guess of
   * a different length is malformed input, not a claim — refused for free, no
   * whisper consumed (AAA 3.2, Wordle's row-refusal precedent).
   */
  | { kind: 'invalid'; reason: 'empty' | 'repeat' | 'wrong-length' | 'finished' };

/** Guess allowance shrinks as levels rise. */
export function maxGuessesForLevel(level: number): number {
  if (level <= 1) return 5;
  if (level === 2) return 4;
  return 3;
}

/** Definition clarity scales with level, implementing the designed progression. */
export function definitionForLevel(puzzle: ForgottenWordPuzzle, level: number): string {
  if (level <= 1) return puzzle.definitions.plain;
  if (level === 2) return puzzle.definitions.poetic;
  return puzzle.definitions.riddle;
}

export function startForgottenWord(puzzle: ForgottenWordPuzzle, level: number): ForgottenWordState {
  return {
    puzzleId: puzzle.id,
    guesses: [],
    maxGuesses: maxGuessesForLevel(level),
    unlockedClues: [],
    hintsUsed: 0,
    status: 'playing',
  };
}

function normalize(s: string): string {
  return s.toUpperCase().trim().replace(/[^A-Z]/g, '');
}

export function submitGuess(
  puzzle: ForgottenWordPuzzle,
  state: ForgottenWordState,
  rawGuess: string,
): { state: ForgottenWordState; result: ForgottenWordGuess } {
  if (state.status !== 'playing') return { state, result: { kind: 'invalid', reason: 'finished' } };
  const guess = normalize(rawGuess);
  if (!guess) return { state, result: { kind: 'invalid', reason: 'empty' } };
  if (state.guesses.includes(guess)) return { state, result: { kind: 'invalid', reason: 'repeat' } };

  const accepted = [normalize(puzzle.word), ...(puzzle.acceptedAnswers ?? []).map(normalize)];
  // Free refusal for a length the game already ruled out (any accepted answer's
  // length is fair game — alternate spellings may differ from the headword).
  if (!accepted.some((a) => a.length === guess.length)) {
    return { state, result: { kind: 'invalid', reason: 'wrong-length' } };
  }
  const guesses = [...state.guesses, guess];

  if (accepted.includes(guess)) {
    return { state: { ...state, guesses, status: 'won' }, result: { kind: 'correct', word: puzzle.word } };
  }

  const lost = guesses.length >= state.maxGuesses;
  return {
    state: { ...state, guesses, status: lost ? 'lost' : 'playing' },
    result: { kind: 'wrong', guessesLeft: state.maxGuesses - guesses.length, lost },
  };
}

/** Called when the player wins the corresponding trial (timed Hive minigame). */
export function unlockClue(state: ForgottenWordState, clue: ClueId): ForgottenWordState {
  if (state.unlockedClues.includes(clue)) return state;
  return { ...state, unlockedClues: [...state.unlockedClues, clue], hintsUsed: state.hintsUsed + 1 };
}

/** Glyph 'reveal_hint' support: unlock the next locked clue for free (no hint penalty). */
export function revealClueByGlyph(state: ForgottenWordState): ForgottenWordState {
  const next: ClueId | undefined = (['etymology', 'usage'] as const).find(
    (c) => !state.unlockedClues.includes(c),
  );
  if (!next) return state;
  return { ...state, unlockedClues: [...state.unlockedClues, next] };
}

/** Instant-solve support (Glyph of Decay). */
export function solveForgottenWord(state: ForgottenWordState): ForgottenWordState {
  return { ...state, status: 'won' };
}
