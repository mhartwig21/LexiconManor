/**
 * Word Ladder — The Staircase's 30–90s micro game. OWNER: A4.
 *
 * Pure engine: no React, no DOM, no audio. Climb from `start` to `target`
 * changing exactly one letter per rung; every rung must be a real word.
 * The dictionary predicate is injected so the engine stays pure — the
 * adapter supplies the shipped ladder word list (the same list the
 * generator's BFS ran over, so any valid climb the player finds is honest).
 *
 * Cozy economy (AAA R.1's principle): a traced rung is a probe, not a claim —
 * refusals are free, Wordle-style (word not consumed). The only step-priced
 * action is buying the next rung (a hint). "Perfect" = solved at par with
 * no purchased rungs.
 */

import type { Difficulty } from '../types';

export interface LadderPuzzle {
  id: string;
  difficulty: Difficulty;
  start: string;              // uppercase
  target: string;             // uppercase, same length
  /** Fewest possible steps (BFS-verified by the generator). */
  par: number;
  /** One optimal climb, start..target inclusive — solver-verified. */
  solution: string[];
}

export interface LadderEngineState {
  /** The climb so far, start first. rungs.length - 1 = steps taken. */
  rungs: string[];
  status: 'playing' | 'won';
}

export type LadderResult =
  | { kind: 'valid'; word: string; steps: number; won: boolean }
  | { kind: 'invalid'; reason: 'wrong-length' | 'not-one-step' | 'already-used' | 'not-a-word' | 'finished'; word: string };

export function oneLetterApart(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && ++diff > 1) return false;
  }
  return diff === 1;
}

export function startLadder(puzzle: LadderPuzzle): LadderEngineState {
  return { rungs: [puzzle.start], status: 'playing' };
}

export function submitLadderRung(
  puzzle: LadderPuzzle,
  state: LadderEngineState,
  rawWord: string,
  isWord: (word: string) => boolean,
): { state: LadderEngineState; result: LadderResult } {
  const word = rawWord.toUpperCase().trim();
  if (state.status !== 'playing') {
    return { state, result: { kind: 'invalid', reason: 'finished', word } };
  }
  const current = state.rungs[state.rungs.length - 1]!;
  if (word.length !== current.length) {
    return { state, result: { kind: 'invalid', reason: 'wrong-length', word } };
  }
  if (!oneLetterApart(current, word)) {
    return { state, result: { kind: 'invalid', reason: 'not-one-step', word } };
  }
  if (state.rungs.includes(word)) {
    return { state, result: { kind: 'invalid', reason: 'already-used', word } };
  }
  if (word !== puzzle.target && !isWord(word)) {
    return { state, result: { kind: 'invalid', reason: 'not-a-word', word } };
  }
  const rungs = [...state.rungs, word];
  const won = word === puzzle.target;
  return {
    state: { rungs, status: won ? 'won' : 'playing' },
    result: { kind: 'valid', word, steps: rungs.length - 1, won },
  };
}

/** Free undo: step back down one rung (never below the start). */
export function stepBack(state: LadderEngineState): LadderEngineState {
  if (state.status !== 'playing' || state.rungs.length <= 1) return state;
  return { ...state, rungs: state.rungs.slice(0, -1) };
}

/**
 * BFS shortest climb `from` → `to` over `words` (both endpoints included in
 * the result). Used by the generator (verification) and the adapter (hints).
 */
export function shortestLadderPath(
  from: string,
  to: string,
  words: ReadonlySet<string>,
): string[] | null {
  if (from === to) return [from];
  if (from.length !== to.length) return null;
  const seen = new Set<string>([from]);
  const parent = new Map<string, string>();
  let frontier = [from];
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const w of frontier) {
      for (let i = 0; i < w.length; i++) {
        for (const ch of A) {
          if (ch === w[i]) continue;
          const cand = w.slice(0, i) + ch + w.slice(i + 1);
          if (seen.has(cand)) continue;
          if (cand !== to && !words.has(cand)) continue;
          seen.add(cand);
          parent.set(cand, w);
          if (cand === to) {
            const path = [to];
            let cur = to;
            while (cur !== from) {
              cur = parent.get(cur)!;
              path.unshift(cur);
            }
            return path;
          }
          next.push(cand);
        }
      }
    }
    frontier = next;
  }
  return null;
}
