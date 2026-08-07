import fs from 'node:fs';
const G = (n) => JSON.parse(fs.readFileSync('C:/Users/hartw/lexicon-loop-v2/content/generated/' + n + '.json', 'utf8'));

export const POOLS = {
  web: G('word-web'), hive: G('hive'), twistle: G('twistle'),
  cipher: G('cipher'), crossword: G('crossword'), sudoku: G('sudoku'), fw: G('forgotten-word'),
};

export function findWeb(words) {
  const set = new Set(words);
  for (const id of Object.keys(POOLS.web)) {
    const b = POOLS.web[id];
    const all = b.groups.flatMap((g) => g.words);
    if (all.length === words.length && all.every((w) => set.has(w))) return b;
  }
  return null;
}
export function findCipher(cipherText) {
  const norm = (s) => s.replace(/[^A-Z]/g, '');
  const t = norm(cipherText.toUpperCase());
  for (const id of Object.keys(POOLS.cipher)) {
    const p = POOLS.cipher[id];
    for (const k of Object.keys(p)) {
      if (typeof p[k] === 'string' && norm(p[k].toUpperCase()) === t) return p;
    }
  }
  return null;
}
