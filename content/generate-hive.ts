import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary, distinctLetters, bandOf, type Dictionary } from './lib/dictionary';
import { gateOk } from './generate-gate';
import { createRng, shuffle } from '../src/engine/rng';
import { hiveWordPoints } from '../src/engine/scoring';
import type { HivePuzzle, Difficulty, Tier } from '../src/engine/types';

/**
 * Hive Builder puzzle generator, done the NYT Spelling Bee way:
 * every letter set IS the distinct letters of a real word, so a valid
 * pangram exists by construction — never a fake like "STARENI".
 *
 * Letter sets exclude S (no cheap plural farming) and must yield a
 * word list that is neither barren nor unbounded.
 *
 * CURATION (AAA BENCHMARKS §1 / 3.5): the valid-word list is a curated set,
 * not a dictionary dump. Words must clear a frequency bar (Norvig rank ≤
 * CURATION_MAX_RANK ≈ everyday + familiar vocabulary) or sit on the small
 * hand-kept allowlist of charming rarities, and every shipped word passes the
 * cozy tone/name/artifact gate (generate-gate.ts) because the found-word list
 * and the exit silhouettes print them in the manor's own voice.
 *
 * ---------------------------------------------------------------------------
 * THREE TIERS, MAPPED TO MANOR ROWS (owner directive, round 4)
 * ---------------------------------------------------------------------------
 * `tier` (1|2|3 ⇢ rows 0–2 / 3–4 / 5–6) is the authoritative field; the legacy
 * `difficulty` label rides along 1:1 for display. Tier differences here are
 * STRUCTURAL, not "more of the same" — every knob is a measured property of
 * the curated word list:
 *
 *   1. CURATED SIZE shrinks as you climb (T1 50–80 → T3 26–44 words). The
 *      round-3 fix, per owner: a tier-3 Conservatory must still FIT THE DAY,
 *      so the top of the manor serves a small, dense hive, not a swamp.
 *   2. THE FULL-BLOOM BAR RISES without touching the 70% ladder: `everyday
 *      point share` is the fraction of the room's points reachable using only
 *      everyday-band words. T1 ≥ 0.80 (Full Bloom is comfortably reachable on
 *      common vocabulary alone); T3 ≤ 0.62 (70% is UNREACHABLE without digging
 *      into familiar/advanced words and, usually, the pangram itself).
 *   3. PANGRAMS GET RARER: T1 must offer an everyday-band pangram, T2 at worst
 *      a familiar one, T3 ships NO everyday pangram at all — the marquee find
 *      is genuinely hunted for.
 */

const TARGET_PER_TIER = 100; // 3 tiers => 300 puzzles
const SEED = 20260701;

/** Frequency bar for findable words (Norvig rank; ≈ everyday + familiar). */
const CURATION_MAX_RANK = 60_000;
/** Pangrams may reach into 'advanced' — the hunt makes the obscurity fair. */
const PANGRAM_MAX_RANK = 120_000;

/** Legacy display label per tier (engine/types.ts Difficulty stays frozen). */
const TIER_LABEL: Record<Tier, Difficulty> = { 1: 'easy', 2: 'medium', 3: 'hard' };

interface TierSpec {
  /** Curated word-count band — shrinks with tier so a tier-3 hive fits a day. */
  minWords: number;
  maxWords: number;
  /** Share of room points reachable with everyday-band words only. */
  minEverydayShare: number;
  maxEverydayShare: number;
  /** Pangram rarity: bands this tier's pangram set is allowed to include. */
  requireEverydayPangram: boolean;
  forbidEverydayPangram: boolean;
}

const TIER_SPECS: Record<Tier, TierSpec> = {
  // Bands are calibrated against the measured distribution of the curated
  // pool (everyday point share runs ≈0.31–0.61 across every size band, so
  // these cut it at roughly its own p25 / p50 / p80 — real separation, not
  // aspirational numbers that would starve a tier).
  1: { minWords: 48, maxWords: 80, minEverydayShare: 0.52, maxEverydayShare: 1,
       requireEverydayPangram: true, forbidEverydayPangram: false },
  2: { minWords: 40, maxWords: 62, minEverydayShare: 0.42, maxEverydayShare: 0.55,
       requireEverydayPangram: false, forbidEverydayPangram: false },
  3: { minWords: 26, maxWords: 44, minEverydayShare: 0, maxEverydayShare: 0.42,
       requireEverydayPangram: false, forbidEverydayPangram: true },
};

/** The widest band any tier accepts — the collection filter in pass 1. */
const MIN_WORDS = Math.min(...Object.values(TIER_SPECS).map((s) => s.minWords));
const MAX_WORDS = Math.max(...Object.values(TIER_SPECS).map((s) => s.maxWords));

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
  // The cozy gate first: the found-word list and the exit silhouettes print
  // these in the manor's own voice, so a gated word never ships (task 2).
  if (!gateOk(word)) return false;
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
  /** Points reachable using everyday-band words only — the Full-Bloom bar. */
  everydayPoints: number;
  /** Frequency bands present in this hive's pangram set. */
  pangramBands: Set<string>;
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
  const pangramBands = new Set<string>();
  let everydayCount = 0;
  let everydayPoints = 0;
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
      const band = bandOf(dict.rankOf(word));
      const points = hiveWordPoints(word.toUpperCase(), isPangram);
      validWords.push(word);
      if (isPangram) {
        pangrams.push(word);
        pangramBands.add(band);
      }
      if (band === 'everyday') {
        everydayCount++;
        everydayPoints += points;
      }
      totalPoints += points;
    }
  }
  validWords.sort();

  // A playable set: a known pangram, inside the widest tier band.
  const hasFriendlyPangram = pangrams.some((p) => bandOf(dict.rankOf(p)) !== 'obscure');
  if (!hasFriendlyPangram || validWords.length < MIN_WORDS || validWords.length > MAX_WORDS) return null;
  return {
    letters, center, validWords, pangrams,
    everydayCount, everydayPoints, totalPoints, pangramBands,
  };
}

/** The three structural gates, all measured — no index-based difficulty. */
function everydayShare(c: Candidate): number {
  return c.totalPoints === 0 ? 0 : c.everydayPoints / c.totalPoints;
}

function fitsTier(c: Candidate, tier: Tier): boolean {
  const spec = TIER_SPECS[tier];
  const n = c.validWords.length;
  if (n < spec.minWords || n > spec.maxWords) return false;
  const share = everydayShare(c);
  if (share < spec.minEverydayShare || share > spec.maxEverydayShare) return false;
  if (spec.requireEverydayPangram && !c.pangramBands.has('everyday')) return false;
  if (spec.forbidEverydayPangram && c.pangramBands.has('everyday')) return false;
  return true;
}

/**
 * Ranking inside a tier: the most *accessible* candidates first, so when a
 * tier's quota is smaller than its candidate pool we ship the friendliest
 * examples of that tier rather than an arbitrary slice.
 */
function accessibilityScore(c: Candidate): number {
  const ratio = c.everydayCount / c.validWords.length;
  return c.everydayCount * ratio;
}

/**
 * Legacy engine threshold. The Manor retires it (the hive adapter raises the
 * engine threshold to totalPoints and solves at the ladder's Full Bloom), but
 * v1 tests and the frozen HivePuzzle shape still read it, so keep it honest:
 * a low, always-reachable floor that rises gently with tier.
 */
function threshold(c: Candidate, tier: Tier): number {
  const fraction = { 1: 0.12, 2: 0.16, 3: 0.2 }[tier];
  const raw = Math.round((c.totalPoints * fraction) / 5) * 5;
  return Math.max(15, Math.min(raw, Math.floor(c.totalPoints * 0.4)));
}

/** Generated-JSON shape: `tier` is authoritative, `difficulty` is the label. */
type TieredHivePuzzle = HivePuzzle & { tier: Tier };

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

  // Pass 2 — sort every candidate into the ONE tier whose structural spec it
  // satisfies. Tier 3 is checked first (its gates are the narrowest), so a
  // small, rare-pangram, low-everyday-share hive can never leak downward into
  // a tier-1 room — that leak is exactly what made rows feel identical.
  const byTier: Record<Tier, TieredHivePuzzle[]> = { 1: [], 2: [], 3: [] };
  const eligible: Record<Tier, Candidate[]> = { 1: [], 2: [], 3: [] };
  for (const c of candidates) {
    const tier = ([3, 2, 1] as Tier[]).find((t) => fitsTier(c, t));
    if (tier) eligible[tier].push(c);
  }

  for (const tier of [1, 2, 3] as Tier[]) {
    const ranked = [...eligible[tier]].sort((a, b) => accessibilityScore(b) - accessibilityScore(a));
    for (const c of ranked.slice(0, TARGET_PER_TIER)) {
      const outer = shuffle(rng, c.letters.filter((l) => l !== c.center));
      byTier[tier].push({
        id: `hive-t${tier}-${byTier[tier].length + 1}`,
        tier,
        difficulty: TIER_LABEL[tier],
        center: c.center.toUpperCase(),
        outer: outer.map((l) => l.toUpperCase()),
        pangrams: c.pangrams.map((w) => w.toUpperCase()).sort(),
        validWords: c.validWords.map((w) => w.toUpperCase()).sort(),
        pointThreshold: threshold(c, tier),
        totalPoints: c.totalPoints,
      });
    }
    const shares = eligible[tier].map(everydayShare);
    const avgShare = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 0;
    console.log(
      `tier ${tier}: ${byTier[tier].length} shipped of ${eligible[tier].length} eligible ` +
      `(avg everyday point share ${(avgShare * 100).toFixed(0)}%)`,
    );
  }

  const puzzles = [...byTier[1], ...byTier[2], ...byTier[3]];
  validate(puzzles);

  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'hive.json');
  writeFileSync(outPath, JSON.stringify(puzzles));
  const counts = ([1, 2, 3] as Tier[]).map((t) => {
    const arr = byTier[t];
    const avgWords = arr.reduce((a, p) => a + p.validWords.length, 0) / Math.max(1, arr.length);
    return `t${t}: ${arr.length} (~${avgWords.toFixed(0)} words)`;
  }).join(', ');
  console.log(`hive.json: ${puzzles.length} puzzles (${counts})`);
}

/** Fail the build on any malformed puzzle or any tier-gate violation. */
function validate(puzzles: TieredHivePuzzle[]) {
  const problems: string[] = [];
  const dict = loadDictionary();
  for (const p of puzzles) {
    const spec = TIER_SPECS[p.tier];
    if (p.difficulty !== TIER_LABEL[p.tier]) problems.push(`${p.id}: label/tier mismatch`);
    if (p.validWords.length < spec.minWords || p.validWords.length > spec.maxWords) {
      problems.push(`${p.id}: ${p.validWords.length} words outside tier ${p.tier} band ${spec.minWords}–${spec.maxWords}`);
    }
    const everydayPoints = p.validWords
      .filter((w) => bandOf(dict.rankOf(w.toLowerCase())) === 'everyday')
      .reduce((a, w) => a + hiveWordPoints(w, new Set(w).size === 7), 0);
    const share = p.totalPoints === 0 ? 0 : everydayPoints / p.totalPoints;
    if (share < spec.minEverydayShare - 1e-9 || share > spec.maxEverydayShare + 1e-9) {
      problems.push(`${p.id}: everyday point share ${(share * 100).toFixed(0)}% outside tier ${p.tier} band`);
    }
    const pangramBands = new Set(p.pangrams.map((w) => bandOf(dict.rankOf(w.toLowerCase()))));
    if (spec.requireEverydayPangram && !pangramBands.has('everyday')) {
      problems.push(`${p.id}: tier 1 needs an everyday-band pangram`);
    }
    if (spec.forbidEverydayPangram && pangramBands.has('everyday')) {
      problems.push(`${p.id}: tier 3 pangrams must be rarer than everyday`);
    }
    for (const w of p.validWords) {
      if (!gateOk(w.toLowerCase())) problems.push(`${p.id}: "${w}" fails the cozy gate`);
    }

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
