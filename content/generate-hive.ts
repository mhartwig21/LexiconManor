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
 *
 * CURATION (AAA BENCHMARKS §1 / 3.5): the valid-word list is a curated set,
 * not a dictionary dump. Words must clear a frequency bar (Norvig rank ≤
 * CURATION_MAX_RANK ≈ everyday + familiar vocabulary) or sit on the small
 * hand-kept allowlist of charming rarities; pangrams get a slightly deeper
 * bar since finding one is the room's marquee moment. Junk like EELY, MOOL,
 * MERL, YLEM never ships, and each puzzle lands in the SB-sized 45–80 word
 * band so Full Bloom (70%) fits a 10–15 minute anchor-room day.
 */

const TARGET_PER_DIFFICULTY = 90; // 4 difficulties => 360 puzzles
const SEED = 20260701;

/** Frequency bar for findable words (Norvig rank; ≈ everyday + familiar). */
const CURATION_MAX_RANK = 60_000;
/** Pangrams may reach into 'advanced' — the hunt makes the obscurity fair. */
const PANGRAM_MAX_RANK = 120_000;
/** SB ships 45–80 words; so do we (BENCHMARKS §1). */
const MIN_WORDS = 45;
const MAX_WORDS = 80;

/**
 * Charming rarities the frequency bar would exclude but the room wants —
 * words that delight when found. Small and hand-kept, by design.
 */
const CHARMING_ALLOWLIST = new Set([
  'aglow', 'alcove', 'amble', 'aria', 'atoll', 'attar', 'bower', 'brook',
  'burble', 'churn', 'cocoon', 'coracle', 'dapple', 'dewdrop', 'eddy',
  'ember', 'fable', 'fernery', 'filigree', 'froth', 'gable', 'gloaming',
  'glint', 'gossamer', 'grotto', 'halcyon', 'hearth', 'inglenook', 'inkwell',
  'knoll', 'lantern', 'lilt', 'loam', 'lullaby', 'meadow', 'mirth', 'moonlit',
  'nectar', 'niche', 'nook', 'opaline', 'petal', 'plume', 'quill', 'ripple',
  'rivulet', 'tendril', 'thicket', 'trellis', 'trill', 'vellum', 'verdant',
  'warble', 'willow', 'wend', 'whorl', 'zephyr',
]);

/** True if a word clears the curation bar for findable words. */
function curated(dict: Dictionary, word: string, isPangram: boolean): boolean {
  const rank = dict.rankOf(word);
  if (rank > 0 && rank <= (isPangram ? PANGRAM_MAX_RANK : CURATION_MAX_RANK)) return true;
  return CHARMING_ALLOWLIST.has(word);
}

interface Candidate {
  letters: string[]; // 7 distinct, sorted
  center: string;
  validWords: string[];
  pangrams: string[];
  everydayCount: number;
  totalPoints: number;
}

/**
 * Index of candidate words keyed by their sorted distinct-letter signature —
 * lets analyze() enumerate the 64 center-containing letter subsets instead of
 * scanning the whole dictionary per candidate.
 */
type LetterIndex = Map<string, string[]>;

function buildLetterIndex(dict: Dictionary): LetterIndex {
  const byKey: LetterIndex = new Map();
  for (const word of dict.words) {
    if (word.length < 4) continue;
    const dl = distinctLetters(word);
    if (dl.length > 7) continue;
    const key = dl.join('');
    let arr = byKey.get(key);
    if (!arr) byKey.set(key, arr = []);
    arr.push(word);
  }
  return byKey;
}

function analyze(dict: Dictionary, index: LetterIndex, letters: string[], center: string): Candidate | null {
  const validWords: string[] = [];
  const pangrams: string[] = [];
  let everydayCount = 0;
  let totalPoints = 0;

  const others = letters.filter((l) => l !== center);
  for (let mask = 0; mask < 1 << others.length; mask++) {
    const subset = [center];
    for (let b = 0; b < others.length; b++) if (mask & (1 << b)) subset.push(others[b]!);
    const key = subset.sort().join('');
    const isPangram = subset.length === 7;
    for (const word of index.get(key) ?? []) {
      // The curation bar (frequency + allowlist): a dictionary dump never ships.
      if (!curated(dict, word, isPangram)) continue;
      validWords.push(word);
      if (isPangram) pangrams.push(word);
      if (bandOf(dict.rankOf(word)) === 'everyday') everydayCount++;
      totalPoints += hiveWordPoints(word.toUpperCase(), isPangram);
    }
  }
  validWords.sort();

  // A playable set: a known pangram, SB-sized (45–80 curated words).
  const hasFriendlyPangram = pangrams.some((p) => bandOf(dict.rankOf(p)) !== 'obscure');
  if (!hasFriendlyPangram || validWords.length < MIN_WORDS || validWords.length > MAX_WORDS) return null;
  return { letters, center, validWords, pangrams, everydayCount, totalPoints };
}

/**
 * Difficulty from measured accessibility: lots of everyday words (and a high
 * everyday share) = easy; a thin everyday core among familiar words = expert.
 * In the curated 45–80 band every shipped word is at worst 'familiar', so the
 * pool is ranked by this score and split into quartiles — difficulty is
 * relative to the curated pool, still purely a measured property.
 */
function accessibilityScore(c: Candidate): number {
  const ratio = c.everydayCount / c.validWords.length;
  return c.everydayCount * ratio;
}

function threshold(c: Candidate, difficulty: Difficulty): number {
  const fraction = { easy: 0.12, medium: 0.16, hard: 0.2, expert: 0.24 }[difficulty];
  const raw = Math.round((c.totalPoints * fraction) / 5) * 5;
  return Math.max(15, Math.min(raw, Math.floor(c.totalPoints * 0.4)));
}

function main() {
  const dict = loadDictionary();
  const index = buildLetterIndex(dict);
  const rng = createRng(SEED);

  // Pangram-seed words: 7 distinct letters, no 's', reasonably known.
  const seeds = [...dict.words].filter((w) => {
    if (w.length < 7 || w.length > 9 || w.includes('s')) return false;
    if (distinctLetters(w).length !== 7) return false;
    return bandOf(dict.rankOf(w)) !== 'obscure';
  });
  console.log(`${seeds.length} pangram-seed words`);

  const seenLetterSets = new Set<string>(); // one puzzle per letter set

  // Pass 1 — collect every playable curated candidate (first playable center
  // per letter set, center order seeded so the pool is deterministic).
  const candidates: Candidate[] = [];
  for (const seed of shuffle(rng, seeds)) {
    const letters = distinctLetters(seed);
    const lettersKey = letters.join('');
    if (seenLetterSets.has(lettersKey)) continue;
    for (const center of shuffle(rng, letters)) {
      const c = analyze(dict, index, letters, center);
      if (!c) continue;
      seenLetterSets.add(lettersKey);
      candidates.push(c);
      break;
    }
  }
  console.log(`${candidates.length} playable curated letter sets`);

  // Pass 2 — rank by measured accessibility and split into quartiles:
  // top quarter = easy … bottom quarter = expert, capped per difficulty.
  const ranked = [...candidates].sort((a, b) => accessibilityScore(b) - accessibilityScore(a));
  const quarter = Math.ceil(ranked.length / 4);
  const byDifficulty: Record<Difficulty, HivePuzzle[]> = { easy: [], medium: [], hard: [], expert: [] };
  const order: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
  ranked.forEach((c, i) => {
    const difficulty = order[Math.min(3, Math.floor(i / quarter))]!;
    if (byDifficulty[difficulty].length >= TARGET_PER_DIFFICULTY) return;
    const outer = shuffle(rng, c.letters.filter((l) => l !== c.center));
    byDifficulty[difficulty].push({
      id: `hive-${difficulty}-${byDifficulty[difficulty].length + 1}`,
      difficulty,
      center: c.center.toUpperCase(),
      outer: outer.map((l) => l.toUpperCase()),
      pangrams: c.pangrams.map((w) => w.toUpperCase()).sort(),
      validWords: c.validWords.map((w) => w.toUpperCase()).sort(),
      pointThreshold: threshold(c, difficulty),
      totalPoints: c.totalPoints,
    });
  });

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
    if (p.validWords.length < MIN_WORDS) problems.push(`${p.id}: only ${p.validWords.length} words (SB band is ${MIN_WORDS}–${MAX_WORDS})`);
    if (p.validWords.length > MAX_WORDS) problems.push(`${p.id}: ${p.validWords.length} words — uncurated swamp (max ${MAX_WORDS})`);
    if (p.pointThreshold > p.totalPoints * 0.4) problems.push(`${p.id}: threshold unreachable`);
  }
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`hive validation failed with ${problems.length} problem(s)`);
  }
}

main();
