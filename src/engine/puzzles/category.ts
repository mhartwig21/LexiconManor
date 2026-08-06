/**
 * Category Sprint — The Pantry's 30–90s micro game. OWNER: A5.
 *
 * Pure engine: no React, no DOM, no audio, no timers. Name `target` words
 * fitting a hand-curated label (content/authored/categories.json, expanded
 * and validated by the generator) before the pantry clock turns too far.
 *
 * The step-tick (MANOR_DESIGN §11, AAA 3.6 — the game's ONE timed pressure):
 * time is delivered as `tick` ACTIONS by the view; the engine only counts.
 * Ticks are free until `parTicks`; after par, each tick is costed (a
 * weight-1 mistake, −2 steps) up to `maxCostedTicks` — then the pantry
 * sighs and stops charging. There is NO real-time fail state: the room is
 * always finishable, dawdling just spends a bounded number of steps.
 *
 * Cozy economy (generative room — R.1's principle):
 *   - a miss (a word not on the shelf) is FREE — shake + toast, remembered;
 *   - the costed mistake is the curated TRAP: a near-miss the Pantry is
 *     famously particular about (TOMATO among the vegetables). Each trap
 *     carries an authored knowing line;
 *   - finishing at or under par pays a gem (swift work);
 *   - perfect = no traps struck and no costed ticks.
 */

import type { Difficulty } from '../types';

export interface CategoryTrap { word: string; note: string; }

/**
 * One accepted surface form and the answer it counts as. BLACKBIRDS carries
 * lemma BLACKBIRD: the shelf counts LEMMAS, so a plural of a shelved word is
 * 'already-shelved', never a second point (3.5 integrity; BENCHMARKS §1
 * "editor bans S").
 */
export interface CategoryEntry { word: string; lemma: string; }

export interface CategoryPuzzle {
  id: string;
  difficulty: Difficulty;
  label: string;             // "Herbs on the rack"
  flavor?: string;           // authored subtitle
  accepted: CategoryEntry[]; // uppercase, generous, variant-expanded
  traps: CategoryTrap[];
  target: number;            // distinct answers (lemmas) to shelve
  parTicks: number;          // at/under = swift (gem); ticks past par cost
  maxCostedTicks: number;    // cap on charged late ticks (then free)
}

export interface CategoryEngineState {
  found: string[];
  trapsHit: string[];        // words; notes live on the puzzle
  /** Free misses — stays visible (memory prosthetic, AAA 3.3). */
  triedMisses: string[];
  ticks: number;
  costedTicks: number;
  status: 'playing' | 'won';
}

export type CategoryResult =
  | { kind: 'found'; word: string; won: boolean }
  | { kind: 'trap'; word: string; note: string }
  | { kind: 'already-found'; word: string }
  | { kind: 'already-tried'; word: string }
  | { kind: 'miss'; word: string }
  | { kind: 'finished'; word: string };

export function startCategory(_puzzle: CategoryPuzzle): CategoryEngineState {
  return { found: [], trapsHit: [], triedMisses: [], ticks: 0, costedTicks: 0, status: 'playing' };
}

export function normalizeCategoryWord(raw: string): string {
  return raw.toUpperCase().trim().replace(/[^A-Z]/g, '');
}

/** Lemma a found word counted as (found words are always accepted words). */
function lemmaOf(puzzle: CategoryPuzzle, word: string): string {
  return puzzle.accepted.find((e) => e.word === word)?.lemma ?? word;
}

export function submitCategory(
  puzzle: CategoryPuzzle,
  state: CategoryEngineState,
  rawWord: string,
): { state: CategoryEngineState; result: CategoryResult } {
  const word = normalizeCategoryWord(rawWord);
  if (state.status !== 'playing') {
    return { state, result: { kind: 'finished', word } };
  }
  if (word.length === 0) {
    return { state, result: { kind: 'miss', word } };
  }
  if (state.found.includes(word)) {
    return { state, result: { kind: 'already-found', word } };
  }
  if (state.triedMisses.includes(word) || state.trapsHit.includes(word)) {
    return { state, result: { kind: 'already-tried', word } };
  }
  const trap = puzzle.traps.find((t) => t.word === word);
  if (trap) {
    return {
      state: { ...state, trapsHit: [...state.trapsHit, word] },
      result: { kind: 'trap', word, note: trap.note },
    };
  }
  const entry = puzzle.accepted.find((e) => e.word === word);
  if (entry) {
    // The shelf counts ANSWERS, not spellings: BLACKBIRDS after BLACKBIRD
    // is the same bird — 'already-shelved', never a second point.
    const foundLemmas = new Set(state.found.map((w) => lemmaOf(puzzle, w)));
    if (foundLemmas.has(entry.lemma)) {
      return { state, result: { kind: 'already-found', word } };
    }
    const found = [...state.found, word];
    const won = found.length >= puzzle.target;
    return {
      state: { ...state, found, status: won ? 'won' : 'playing' },
      result: { kind: 'found', word, won },
    };
  }
  return {
    state: { ...state, triedMisses: [...state.triedMisses, word] },
    result: { kind: 'miss', word } };
}

/**
 * One turn of the pantry clock (view-driven; engine only counts).
 * `costed` = this tick is past par and within the charged cap.
 */
export function tickCategory(
  puzzle: CategoryPuzzle,
  state: CategoryEngineState,
): { state: CategoryEngineState; costed: boolean } {
  if (state.status !== 'playing') return { state, costed: false };
  const ticks = state.ticks + 1;
  const costed = ticks > puzzle.parTicks && state.costedTicks < puzzle.maxCostedTicks;
  return {
    state: { ...state, ticks, costedTicks: costed ? state.costedTicks + 1 : state.costedTicks },
    costed,
  };
}

/** Finished at or under par → swift work (gem + compatible with perfect). */
export function underPar(puzzle: CategoryPuzzle, state: CategoryEngineState): boolean {
  return state.ticks <= puzzle.parTicks;
}
