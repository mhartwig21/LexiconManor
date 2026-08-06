/**
 * Rhyme Chain — The Music Room's 30–90s micro game. OWNER: A5.
 *
 * Pure engine: no React, no DOM, no audio, and NO PHONETICS — every rhyme
 * judgement here is an exact-set lookup against data the build-time pipeline
 * resolved with the CMU Pronouncing Dictionary (content/lib/phonetics.ts).
 * The sets were built phonetically, so the runtime is phonetically sound
 * with zero phonetics payload in the bundle (ARCHITECTURE §1, §11.7).
 *
 * A puzzle is a chain of 1–3 rounds. Each round: a prompt word; supply
 * `target` words that perfect-rhyme with it (last primary-stressed vowel to
 * the end, spelling irrelevant — GREY rhymes with WEIGH, COUGH does not
 * rhyme with DOUGH).
 *
 * Cozy economy (AAA R.1's principle — this is a generative room like the
 * Conservatory):
 *   - a miss (unknown word, or a word that simply doesn't rhyme) is FREE —
 *     shake + toast, remembered in triedMisses (memory prosthetic 3.3);
 *   - a HOMOPHONE of the prompt is free with a knowing line — the very same
 *     sound is an echo, not a rhyme;
 *   - a NEAR-RHYME (final syllable sounds identical but the stress falls
 *     elsewhere — MEMORY offered for CORY, EXERCISE for ARISE) is free with
 *     a teaching line: the ear was right, the stress was not;
 *   - the one costed mistake is the planted EYE-RHYME DECOY: a word spelled
 *     as if it rhymes but SOUNDED otherwise even in its final syllable
 *     (DOUGH → COUGH). The trap is pre-warned by the room's framing ("the
 *     ear decides, not the page") — falling for it is the deliberate claim
 *     that costs a step-weight 1;
 *   - hints ("hum a bar") reveal a silhouette (length + first letter) of an
 *     unfound rhyme, step-priced through the `hint` event; they forfeit
 *     perfect. Perfect = no decoys struck, no hints.
 */

import type { Difficulty } from '../types';

export interface RhymeRound {
  /** Prompt word, uppercase. */
  prompt: string;
  /**
   * Every accepted rhyme, uppercase, sorted most-common-first (the hint
   * silhouettes walk this order). Built phonetically offline.
   */
  accepted: string[];
  /**
   * Eye-rhyme traps: spelled like kin, sounded stranger — verified offline
   * to differ from the prompt even in the final syllable. May be empty.
   */
  decoys: string[];
  /** Words phone-identical to the prompt (an echo, not a rhyme). */
  homophones: string[];
  /**
   * Near-rhymes: final-syllable sound matches, primary stress does not
   * (free, knowing toast). Capped to the most common offenders.
   */
  near: string[];
  /** Rhymes to find before the round resolves. */
  target: number;
}

export interface RhymePuzzle {
  id: string;
  difficulty: Difficulty;
  rounds: RhymeRound[]; // 1–3
}

export interface RhymeSilhouette { length: number; first: string; }

export interface RhymeEngineState {
  round: number;                  // index into puzzle.rounds
  found: string[];                // current round
  foundRounds: string[][];        // finds of completed rounds, in order
  /** Free misses for the CURRENT round — stays visible (AAA 3.3). */
  triedMisses: string[];
  /** Decoys struck across ALL rounds (drives perfect + display). */
  decoysHit: string[];
  /** Hint silhouettes revealed for the current round. */
  silhouettes: RhymeSilhouette[];
  hintsUsed: number;
  status: 'playing' | 'won';
}

export type RhymeResult =
  | { kind: 'found'; word: string; roundComplete: boolean; won: boolean }
  | { kind: 'decoy'; word: string }
  | { kind: 'homophone'; word: string }
  | { kind: 'near'; word: string }
  | { kind: 'prompt'; word: string }
  | { kind: 'already-found'; word: string }
  | { kind: 'already-tried'; word: string }
  | { kind: 'miss'; word: string }
  | { kind: 'finished'; word: string };

export function startRhyme(_puzzle: RhymePuzzle): RhymeEngineState {
  return {
    round: 0,
    found: [],
    foundRounds: [],
    triedMisses: [],
    decoysHit: [],
    silhouettes: [],
    hintsUsed: 0,
    status: 'playing',
  };
}

export function currentRhymeRound(puzzle: RhymePuzzle, state: RhymeEngineState): RhymeRound {
  const r = puzzle.rounds[Math.min(state.round, puzzle.rounds.length - 1)];
  if (!r) throw new Error(`${puzzle.id}: no rounds`);
  return r;
}

export function normalizeRhymeWord(raw: string): string {
  return raw.toUpperCase().trim().replace(/[^A-Z']/g, '');
}

export function submitRhyme(
  puzzle: RhymePuzzle,
  state: RhymeEngineState,
  rawWord: string,
): { state: RhymeEngineState; result: RhymeResult } {
  const word = normalizeRhymeWord(rawWord);
  if (state.status !== 'playing') {
    return { state, result: { kind: 'finished', word } };
  }
  const round = currentRhymeRound(puzzle, state);

  if (word.length === 0 || word === round.prompt) {
    return { state, result: { kind: 'prompt', word } };
  }
  if (state.found.includes(word)) {
    return { state, result: { kind: 'already-found', word } };
  }
  if (state.triedMisses.includes(word) || state.decoysHit.includes(word)) {
    return { state, result: { kind: 'already-tried', word } };
  }
  if (round.homophones.includes(word)) {
    return {
      state: { ...state, triedMisses: [...state.triedMisses, word] },
      result: { kind: 'homophone', word },
    };
  }
  if (round.decoys.includes(word)) {
    return {
      state: { ...state, decoysHit: [...state.decoysHit, word] },
      result: { kind: 'decoy', word },
    };
  }
  if (round.near.includes(word)) {
    return {
      state: { ...state, triedMisses: [...state.triedMisses, word] },
      result: { kind: 'near', word },
    };
  }
  if (round.accepted.includes(word)) {
    const found = [...state.found, word];
    if (found.length >= round.target) {
      const foundRounds = [...state.foundRounds, found];
      const won = state.round + 1 >= puzzle.rounds.length;
      return {
        state: {
          ...state,
          round: won ? state.round : state.round + 1,
          found: [],
          foundRounds,
          triedMisses: [],
          silhouettes: [],
          status: won ? 'won' : 'playing',
        },
        result: { kind: 'found', word, roundComplete: true, won },
      };
    }
    return {
      state: { ...state, found },
      result: { kind: 'found', word, roundComplete: false, won: false },
    };
  }
  return {
    state: { ...state, triedMisses: [...state.triedMisses, word] },
    result: { kind: 'miss', word },
  };
}

/**
 * Step-priced hint: silhouette (length + first letter) of the most common
 * unfound, un-silhouetted rhyme. Returns null when nothing is left to hum.
 */
export function humRhymeHint(
  puzzle: RhymePuzzle,
  state: RhymeEngineState,
): { state: RhymeEngineState; silhouette: RhymeSilhouette | null } {
  if (state.status !== 'playing') return { state, silhouette: null };
  const round = currentRhymeRound(puzzle, state);
  const already = new Set(state.silhouettes.map((s) => `${s.length}:${s.first}`));
  const word = round.accepted.find(
    (w) => !state.found.includes(w) && !already.has(`${w.length}:${w[0]}`),
  );
  if (!word) return { state, silhouette: null };
  const silhouette: RhymeSilhouette = { length: word.length, first: word[0]! };
  return {
    state: {
      ...state,
      silhouettes: [...state.silhouettes, silhouette],
      hintsUsed: state.hintsUsed + 1,
    },
    silhouette,
  };
}
