import fs from 'node:fs';
const P = JSON.parse(fs.readFileSync('C:/Users/hartw/lexicon-loop-v2/.playtest/pools.json', 'utf8'));
export const WEB = P[0], HIVE = P[1], TWISTLE = P[2], FW = P[3], CIPHER = P[4], CROSSWORD = P[5], SUDOKU = P[6];
export const DIALOGUE = { bramble: P[7], ellery: P[8], posy: P[9], fern: P[10], portrait: P[11] };

export function webByWords(words) {
  const set = new Set(words);
  let best = null, bestN = 0;
  for (const b of WEB) {
    const all = b.groups.flatMap((g) => g.words);
    const n = all.filter((w) => set.has(w)).length;
    if (n > bestN) { bestN = n; best = b; }
  }
  return bestN >= 14 ? best : null;
}
export function hiveByLetters(center, outer) {
  const key = center + [...outer].sort().join('');
  return HIVE.find((h) => h.center === center && [...h.outer].sort().join('') === [...outer].sort().join('')) || null;
}
export function cipherByText(ct) {
  const n = (s) => s.toUpperCase().replace(/[^A-Z]/g, '');
  return CIPHER.find((c) => n(c.ciphertext) === n(ct)) || null;
}
export function crosswordByClue(clue) {
  return CROSSWORD.find((c) => c.entries.some((e) => e.clue === clue)) || null;
}
export function sudokuByGivens(g) { return SUDOKU.find((s) => s.givens === g) || null; }
export function twistleByGrid(grid) { return TWISTLE.find((t) => t.grid.join('') === grid) || null; }
