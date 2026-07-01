import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WordWebPuzzle, ForgottenWordPuzzle, Difficulty } from '../src/engine/types';

/**
 * One-time import of the hand-made content worth salvaging from the
 * original LexiconLoop repo (expected as a sibling directory):
 *  - the NYT-style Word Web puzzles (deduped and validated)
 *  - the fully-authored Forgotten Word entries (definition + etymology + usage)
 *
 * Output goes to content/generated/ and is committed like generated content.
 * Definition clarity variants (plain/riddle) start as copies of the poetic
 * text — hand-authoring them is Phase 6 curation work.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - importing across repos; tsx transpiles it fine
import { NYT_STYLE_COMPLETE_PUZZLES } from '../../LexiconLoop/shared/nyt-style-word-pools';
// @ts-ignore
import { generateForgottenWordPuzzles } from '../../LexiconLoop/shared/forgotten-word-generator';

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'generated');

// --- Word Web ---------------------------------------------------------------

/** Legacy pool assigned difficulty by id rotation; preserved here. */
function difficultyForId(id: number): Difficulty {
  const rotation: Difficulty[] = ['medium', 'hard', 'expert'];
  return rotation[id % 3]!;
}

const webPuzzles: WordWebPuzzle[] = [];
const problems: string[] = [];
const seenPuzzleKeys = new Set<string>();

for (const legacy of NYT_STYLE_COMPLETE_PUZZLES as {
  id: number;
  categories: { theme: string; words: string[]; difficulty: 'yellow' | 'green' | 'blue' | 'purple' }[];
}[]) {
  const id = `web-${legacy.id}`;
  if (legacy.categories.length !== 4) {
    problems.push(`${id}: ${legacy.categories.length} groups`);
    continue;
  }
  const allWords = legacy.categories.flatMap((c) => c.words.map((w) => w.toUpperCase().trim()));
  const unique = new Set(allWords);
  if (allWords.length !== 16 || unique.size !== 16) {
    problems.push(`${id}: needs 16 unique words, got ${unique.size}/${allWords.length}`);
    continue;
  }
  // Exact-duplicate puzzles (same 16 words) get dropped.
  const key = [...unique].sort().join('|');
  if (seenPuzzleKeys.has(key)) {
    problems.push(`${id}: duplicate of an earlier puzzle (skipped)`);
    continue;
  }
  seenPuzzleKeys.add(key);

  webPuzzles.push({
    id,
    difficulty: difficultyForId(legacy.id),
    groups: legacy.categories.map((c) => ({
      theme: c.theme,
      tier: c.difficulty,
      words: c.words.map((w) => w.toUpperCase().trim()),
    })),
  });
}

writeFileSync(join(outDir, 'word-web.json'), JSON.stringify(webPuzzles));
console.log(`word-web.json: ${webPuzzles.length} puzzles imported`);

// Duplicate-theme report (curation signal, not fatal).
const themeCounts = new Map<string, number>();
for (const p of webPuzzles) {
  for (const g of p.groups) themeCounts.set(g.theme, (themeCounts.get(g.theme) ?? 0) + 1);
}
const repeats = [...themeCounts].filter(([, n]) => n > 1);
if (repeats.length > 0) {
  console.log(`note: ${repeats.length} themes repeat across puzzles:`, repeats.map(([t, n]) => `${t} x${n}`).join('; '));
}

// --- Forgotten Word ----------------------------------------------------------

// Ask for far more than exist; the legacy generator only emits entries with
// fully authored definition + etymology + usage.
const legacyFw = generateForgottenWordPuzzles(200) as {
  word: string;
  definition: string;
  etymology: string;
  usage: string;
  difficulty: 'common' | 'medium' | 'rare' | 'archaic';
}[];

const fwPuzzles: ForgottenWordPuzzle[] = [];
const seenWords = new Set<string>();
for (const p of legacyFw) {
  const word = p.word.toUpperCase();
  if (seenWords.has(word)) continue;
  if (p.word.length > 15) continue; // joke-length words are unguessable
  seenWords.add(word);
  fwPuzzles.push({
    id: `fw-${p.word.toLowerCase()}`,
    word,
    obscurity: p.difficulty,
    definitions: { plain: p.definition, poetic: p.definition, riddle: p.definition },
    etymology: p.etymology,
    usage: p.usage.replace(/_+/g, '___'),
  });
}

writeFileSync(join(outDir, 'forgotten-word.json'), JSON.stringify(fwPuzzles));
console.log(`forgotten-word.json: ${fwPuzzles.length} entries imported (clarity variants pending hand-authoring)`);

if (problems.length > 0) {
  console.log(`word web curation notes:\n  ${problems.join('\n  ')}`);
}
