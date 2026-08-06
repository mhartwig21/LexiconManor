/**
 * Anagram — The Vestibule's 30–90s micro game. OWNER: A4.
 *
 * Pure engine: no React, no DOM, no audio. Unscramble 1–3 words, one round
 * at a time. Fairness rule (mirrors the twistle generator's honesty): the
 * accepted set for a round is EVERY dictionary word formable from exactly
 * those letters — a player's real word is never rejected just because it
 * wasn't the seed. The generator ships that set solver-verified.
 */

import type { Difficulty } from '../types';

export interface AnagramRound {
  /** Pre-scrambled letters, uppercase — never spelling any accepted word. */
  scramble: string[];
  /** Every dictionary word with exactly these letters (uppercase). */
  accepted: string[];
  /** Canonical seed word — drives letter-by-letter hints. */
  answer: string;
}

export interface AnagramPuzzle {
  id: string;
  difficulty: Difficulty;
  rounds: AnagramRound[]; // 1–3
}

export interface AnagramEngineState {
  round: number;              // index into puzzle.rounds
  solvedWords: string[];      // the word actually found per solved round
  /** Wrong claims for the CURRENT round — memory prosthetic (AAA 3.3). */
  triedWrong: string[];
  /** Hint-revealed prefix length of the current round's canonical answer. */
  revealedCount: number;
  status: 'playing' | 'won';
}

export type AnagramResult =
  | { kind: 'valid'; word: string; roundSolved: number; won: boolean }
  | { kind: 'invalid'; reason: 'wrong-letters' | 'not-a-word' | 'already-tried' | 'finished'; word: string };

/** Multiset signature: sorted letters joined. */
export function signatureOf(letters: string | readonly string[]): string {
  const arr = typeof letters === 'string' ? [...letters] : [...letters];
  return arr.map((c) => c.toUpperCase()).sort().join('');
}

export function startAnagram(_puzzle: AnagramPuzzle): AnagramEngineState {
  return { round: 0, solvedWords: [], triedWrong: [], revealedCount: 0, status: 'playing' };
}

export function currentRound(puzzle: AnagramPuzzle, state: AnagramEngineState): AnagramRound {
  const r = puzzle.rounds[Math.min(state.round, puzzle.rounds.length - 1)];
  if (!r) throw new Error(`${puzzle.id}: no rounds`);
  return r;
}

export function submitAnagram(
  puzzle: AnagramPuzzle,
  state: AnagramEngineState,
  rawWord: string,
): { state: AnagramEngineState; result: AnagramResult } {
  const word = rawWord.toUpperCase().trim();
  if (state.status !== 'playing') {
    return { state, result: { kind: 'invalid', reason: 'finished', word } };
  }
  const round = currentRound(puzzle, state);

  // Malformed: not the same letters (AAA 3.2 — free; the tray UI can't even produce this).
  if (signatureOf(word) !== signatureOf(round.scramble)) {
    return { state, result: { kind: 'invalid', reason: 'wrong-letters', word } };
  }
  if (state.triedWrong.includes(word)) {
    return { state, result: { kind: 'invalid', reason: 'already-tried', word } };
  }

  if (round.accepted.includes(word)) {
    const solvedWords = [...state.solvedWords, word];
    const won = state.round + 1 >= puzzle.rounds.length;
    return {
      state: {
        round: won ? state.round : state.round + 1,
        solvedWords,
        triedWrong: [],
        revealedCount: 0,
        status: won ? 'won' : 'playing',
      },
      result: { kind: 'valid', word, roundSolved: state.round, won },
    };
  }

  // A full arrangement submitted as "the word" is a deliberate claim.
  return {
    state: { ...state, triedWrong: [...state.triedWrong, word] },
    result: { kind: 'invalid', reason: 'not-a-word', word },
  };
}

/**
 * Reveal the next letter of the current round's canonical answer.
 * Never reveals the final letter — the last step is always the player's.
 */
export function revealAnagramLetter(
  puzzle: AnagramPuzzle,
  state: AnagramEngineState,
): { state: AnagramEngineState; letter: string | null } {
  if (state.status !== 'playing') return { state, letter: null };
  const round = currentRound(puzzle, state);
  if (state.revealedCount >= round.answer.length - 1) return { state, letter: null };
  const letter = round.answer[state.revealedCount]!;
  return { state: { ...state, revealedCount: state.revealedCount + 1 }, letter };
}
