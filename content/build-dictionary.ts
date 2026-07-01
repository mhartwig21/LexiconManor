import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds content/data/dictionary.json from:
 *  - ENABLE word list (public domain scrabble dictionary, ~173k words)
 *  - Norvig's count_1w.txt (333k words ranked by Google corpus frequency)
 *
 * Output: [word, rank][] for a-z words of length >= 4, where rank is the
 * frequency rank (1 = most common) or -1 if absent from the frequency list.
 * Raw inputs are downloaded by `npm run content:dictionary` prerequisites —
 * see README. This intermediate file is gitignored; generators consume it.
 */

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data');
const enablePath = join(dataDir, 'enable1.txt');
const freqPath = join(dataDir, 'count_1w.txt');

if (!existsSync(enablePath) || !existsSync(freqPath)) {
  console.error(
    'Missing raw word lists. Download first:\n' +
      '  curl -sL -o content/data/enable1.txt https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt\n' +
      '  curl -sL -o content/data/count_1w.txt https://norvig.com/ngrams/count_1w.txt',
  );
  process.exit(1);
}

const rank = new Map<string, number>();
readFileSync(freqPath, 'utf8')
  .split('\n')
  .forEach((line, i) => {
    const word = line.split('\t')[0]?.trim();
    if (word) rank.set(word, i + 1);
  });

const entries: [string, number][] = [];
for (const raw of readFileSync(enablePath, 'utf8').split('\n')) {
  const word = raw.trim().toLowerCase();
  if (word.length < 4 || !/^[a-z]+$/.test(word)) continue;
  entries.push([word, rank.get(word) ?? -1]);
}

writeFileSync(join(dataDir, 'dictionary.json'), JSON.stringify(entries));
console.log(`dictionary.json: ${entries.length} words (${entries.filter(([, r]) => r > 0).length} with frequency data)`);
