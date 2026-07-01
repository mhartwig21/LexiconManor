import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary, distinctLetters, bandOf, type Dictionary } from './lib/dictionary';
import { createRng, shuffle } from '../src/engine/rng';
import { hiveWordPoints } from '../src/engine/scoring';
import type { HivePuzzle, Difficulty } from '../src/engine/types';

/**
 * Hive Builder puzzle generator, done the NYT Spelling Bee way:
 * every letter set IS the distinct letters of a real word, so a valid
 * pangram exists by construction — never a fake like "STARENI".
 *
 * Letter sets exclude S (no cheap plural farming) and must yield a
 * word list that is neither barren nor unbounded. Difficulty is derived
 * from measured properties (how many *everyday* words exist), not node index.
 */

const TARGET_PER_DIFFICULTY = 90; // 4 difficulties => 360 puzzles
const SEED = 20260701;

interface Candidate {
  letters: string[]; // 7 distinct, sorted
  center: string;
  validWords: string[];
  pangrams: string[];
  everydayCount: number;
  totalPoints: number;
}

function analyze(dict: Dictionary, letters: string[], center: string): Candidate | null {
  const set = new Set(letters);
  const validWords: string[] = [];
  const pangrams: string[] = [];
  let everydayCount = 0;
  let totalPoints = 0;

  for (const word of dict.words) {
    if (word.length < 4 || !word.includes(center)) continue;
    let ok = true;
    for (const ch of word) {
      if (!set.has(ch)) { ok = false; break; }
    }
    if (!ok) continue;
    const isPangram = distinctLetters(word).length === 7;
    validWords.push(word);
    if (isPangram) pangrams.push(word);
    if (bandOf(dict.rankOf(word)) === 'everyday') everydayCount++;
    totalPoints += hiveWordPoints(word.toUpperCase(), isPangram);
  }

  // A playable set: a known pangram, enough words to explore, not a swamp.
  const hasFriendlyPangram = pangrams.some((p) => bandOf(dict.rankOf(p)) !== 'obscure');
  if (!hasFriendlyPangram || validWords.length < 22 || validWords.length > 140) return null;
  return { letters, center, validWords, pangrams, everydayCount, totalPoints };
}

/**
 * Difficulty from measured accessibility: lots of everyday words = easy;
 * few everyday words among many obscure ones = expert.
 */
function classify(c: Candidate): Difficulty {
  const accessible = c.everydayCount;
  const ratio = accessible / c.validWords.length;
  if (accessible >= 28 && ratio >= 0.35) return 'easy';
  if (accessible >= 18 && ratio >= 0.25) return 'medium';
  if (accessible >= 10) return 'hard';
  return 'expert';
}

function threshold(c: Candidate, difficulty: Difficulty): number {
  const fraction = { easy: 0.12, medium: 0.16, hard: 0.2, expert: 0.24 }[difficulty];
  const raw = Math.round((c.totalPoints * fraction) / 5) * 5;
  return Math.max(15, Math.min(raw, Math.floor(c.totalPoints * 0.4)));
}

function main() {
  const dict = loadDictionary();
  const rng = createRng(SEED);

  // Pangram-seed words: 7 distinct letters, no 's', reasonably known.
  const seeds = [...dict.words].filter((w) => {
    if (w.length < 7 || w.length > 9 || w.includes('s')) return false;
    if (distinctLetters(w).length !== 7) return false;
    return bandOf(dict.rankOf(w)) !== 'obscure';
  });
  console.log(`${seeds.length} pangram-seed words`);

  const seen = new Set<string>(); // letters+center dedup
  const seenLetterSets = new Set<string>(); // one puzzle per letter set
  const byDifficulty: Record<Difficulty, HivePuzzle[]> = { easy: [], medium: [], hard: [], expert: [] };

  for (const seed of shuffle(rng, seeds)) {
    const letters = distinctLetters(seed);
    const lettersKey = letters.join('');
    if (seenLetterSets.has(lettersKey)) continue;

    // Try centers in random order; take the first playable analysis.
    for (const center of shuffle(rng, letters)) {
      const key = lettersKey + ':' + center;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = analyze(dict, letters, center);
      if (!c) continue;
      const difficulty = classify(c);
      if (byDifficulty[difficulty].length >= TARGET_PER_DIFFICULTY) break;

      seenLetterSets.add(lettersKey);
      const outer = shuffle(rng, letters.filter((l) => l !== center));
      byDifficulty[difficulty].push({
        id: `hive-${difficulty}-${byDifficulty[difficulty].length + 1}`,
        difficulty,
        center: center.toUpperCase(),
        outer: outer.map((l) => l.toUpperCase()),
        pangrams: c.pangrams.map((w) => w.toUpperCase()).sort(),
        validWords: c.validWords.map((w) => w.toUpperCase()).sort(),
        pointThreshold: threshold(c, difficulty),
        totalPoints: c.totalPoints,
      });
      break;
    }
    if (Object.values(byDifficulty).every((arr) => arr.length >= TARGET_PER_DIFFICULTY)) break;
  }

  const puzzles = Object.values(byDifficulty).flat();
  validate(puzzles);

  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'hive.json');
  writeFileSync(outPath, JSON.stringify(puzzles));
  const counts = Object.entries(byDifficulty).map(([d, arr]) => `${d}: ${arr.length}`).join(', ');
  console.log(`hive.json: ${puzzles.length} puzzles (${counts})`);
}

/** Fail the build on any malformed puzzle. */
function validate(puzzles: HivePuzzle[]) {
  const problems: string[] = [];
  for (const p of puzzles) {
    const allowed = new Set([p.center, ...p.outer]);
    if (allowed.size !== 7) problems.push(`${p.id}: letter set is not 7 distinct letters`);
    if (p.pangrams.length === 0) problems.push(`${p.id}: no pangram`);
    for (const pan of p.pangrams) {
      if (new Set(pan).size !== 7 || ![...pan].every((ch) => allowed.has(ch))) {
        problems.push(`${p.id}: fake pangram ${pan}`);
      }
      if (!p.validWords.includes(pan)) problems.push(`${p.id}: pangram ${pan} missing from validWords`);
    }
    for (const w of p.validWords) {
      if (w.length < 4) problems.push(`${p.id}: short word ${w}`);
      if (!w.includes(p.center)) problems.push(`${p.id}: ${w} missing center`);
      if (![...w].every((ch) => allowed.has(ch))) problems.push(`${p.id}: ${w} uses foreign letters`);
    }
    if (p.validWords.length < 22) problems.push(`${p.id}: only ${p.validWords.length} words`);
    if (p.pointThreshold > p.totalPoints * 0.4) problems.push(`${p.id}: threshold unreachable`);
  }
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`hive validation failed with ${problems.length} problem(s)`);
  }
}

main();
