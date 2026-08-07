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

/**
 * The HEADLINE definition: the one line the Study stages in its largest
 * display italic, which AAA 3.7 [COZY] requires to read as the best writing in
 * the game.
 *
 * ROUND 11 — WHAT WAS WRONG. This function used to key the register straight
 * to the room tier (1 → plain, 2 → poetic, 3 → riddle), and the adapter
 * honours tier exactly, so a tier-1 Study could ONLY ever print `plain`. Two
 * of every three authored definitions never reached glass — 226 of the 339
 * lines in content/generated/forgotten-word.json were dead content — and the
 * quality was inverted: the first Study a player meets, in the biggest type
 * the room owns, got the dictionary gloss ("A small object held on to only
 * because of the person or place it recalls.") while the line that was
 * actually written for her ("A pebble, a ticket stub, a button: none of them
 * beautiful, all of them evidence.") was unreachable.
 *
 * The register is no longer the tier lever. `poetic` is the headline wherever
 * the room is meant to be readable (tiers 1–2); tier 3 — where the room IS the
 * difficulty — headlines the riddle. The tier lever moved to how much help
 * comes with it: see `glossForLevel`, and `maxGuessesForLevel` above.
 */
export function definitionForLevel(puzzle: ForgottenWordPuzzle, level: number): string {
  if (level <= 2) return puzzle.definitions.poetic;
  return puzzle.definitions.riddle;
}

/**
 * The free second register, shown under the headline. Tier 1 — the bottom of
 * the house, the first Study anyone meets — gets the plain gloss for nothing:
 * the poetry leads, the dictionary follows, and the easiest room is the one
 * that hands over the most. Tiers 2 and 3 get the image alone.
 *
 * Between this and `definitionForLevel`, all three authored registers now
 * reach glass across the shipped pool (plain at tier 1, poetic at tiers 1–2,
 * riddle at tier 3) — nothing authored to the 3.7 standard is unreachable.
 */
export function glossForLevel(puzzle: ForgottenWordPuzzle, level: number): string | null {
  return level <= 1 ? puzzle.definitions.plain : null;
}

/**
 * The registers this level did NOT stage — printed in the verdict panel once
 * the word is settled (remembered or slipped away), as the rest of the
 * lexicographer's entry.
 *
 * This is the other half of the round-11 fix, and the half that makes the
 * claim absolute: the adapter honours the room tier exactly, so keying ANY
 * register to the tier leaves the others unread on that entry forever. With
 * this, every authored line on every shipped entry reaches glass in a single
 * visit — the two that are not the puzzle become the reward for finishing it,
 * which is where the best writing in the game (AAA 3.7) belongs anyway.
 */
export function unshownDefinitions(puzzle: ForgottenWordPuzzle, level: number): string[] {
  const shown = new Set([definitionForLevel(puzzle, level), glossForLevel(puzzle, level)]);
  return [puzzle.definitions.plain, puzzle.definitions.poetic, puzzle.definitions.riddle]
    .filter((d) => !shown.has(d));
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
