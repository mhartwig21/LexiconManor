import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Loader + helpers over the built dictionary, shared by all generators. */

export interface Dictionary {
  /** All valid words (lowercase, length >= 4). */
  words: Set<string>;
  /** Frequency rank; 1 = most common. Missing = very obscure. */
  rankOf: (word: string) => number;
}

/**
 * Frequency bands (by Norvig rank) used for difficulty decisions:
 *   everyday  <= 20k   — words anyone knows
 *   familiar  <= 60k   — comfortable vocabulary
 *   advanced  <= 120k  — educated/crossword vocabulary
 *   obscure    > 120k or unranked
 */
export type Band = 'everyday' | 'familiar' | 'advanced' | 'obscure';

export function bandOf(rank: number): Band {
  if (rank > 0 && rank <= 20_000) return 'everyday';
  if (rank > 0 && rank <= 60_000) return 'familiar';
  if (rank > 0 && rank <= 120_000) return 'advanced';
  return 'obscure';
}

/** Words never allowed to appear as answers or findable targets. */
export const BLOCKLIST = new Set([
  // Keep this small and targeted: slurs and words that would be jarring in a
  // family word game. ENABLE contains everything, so we filter at generation.
  'chink', 'cunt', 'dago', 'darkies', 'darky', 'dyke', 'dykes', 'fags', 'faggot', 'faggots',
  'gooks', 'heeb', 'hebe', 'honky', 'kikes', 'nigga', 'niggas', 'nigger', 'niggers',
  'raped', 'raper', 'rapes', 'rapist', 'shit', 'shits', 'slut', 'sluts', 'spic', 'spick',
  'tard', 'tards', 'twat', 'twats', 'wetback', 'whore', 'whores',
]);

export function loadDictionary(): Dictionary {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'dictionary.json');
  if (!existsSync(path)) {
    throw new Error('content/data/dictionary.json missing — run `npm run content:dictionary` first.');
  }
  const entries = JSON.parse(readFileSync(path, 'utf8')) as [string, number][];
  const words = new Set<string>();
  const ranks = new Map<string, number>();
  for (const [word, rank] of entries) {
    if (BLOCKLIST.has(word)) continue;
    words.add(word);
    if (rank > 0) ranks.set(word, rank);
  }
  return { words, rankOf: (w) => ranks.get(w.toLowerCase()) ?? -1 };
}

/** Distinct letters of a word, sorted. */
export function distinctLetters(word: string): string[] {
  return [...new Set(word.toLowerCase())].sort();
}
