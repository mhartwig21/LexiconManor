import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, pick, shuffle } from '../src/engine/rng';
import { isVowelPhone, loadPhonetics, type Phonetics } from './lib/phonetics';
import { BLOCKLIST } from './lib/dictionary';
import type { RhymePuzzle, RhymeRound } from '../src/engine/puzzles/rhyme';
import type { Difficulty } from '../src/engine/types';

/**
 * Rhyme-chain generator for The Music Room. OWNER: A5.
 *
 * BUILD-TIME PHONETICS ONLY (ARCHITECTURE §1, §11.7): the CMU Pronouncing
 * Dictionary decides every rhyme here, offline; the shipped JSON carries
 * resolved word SETS and the runtime does exact-set lookups. Zero phonetics
 * payload in the bundle, and the judgement is phonetically sound:
 * GREY rhymes with WEIGH, COUGH does not rhyme with DOUGH, FOUR does not
 * "rhyme" with FORE (an echo is not a rhyme).
 *
 * Per round the pipeline resolves:
 *   accepted   — every enable1∩CMU word (rank ≤ ADVANCED, len 3–9) that
 *                perfect-rhymes with the prompt, most-common first (the
 *                hint silhouettes walk this order);
 *   decoys     — EYE-RHYMES: everyday/familiar words sharing the prompt's
 *                written tail that do NOT rhyme (DOUGH → COUGH, TOUGH) and
 *                whose FINAL SYLLABLE also sounds different (so the −2 trap
 *                never fires on a word that merely fails the stress rule).
 *                Re-verified non-rhyming here;
 *   near       — near-rhymes: final-syllable rime matches, primary stress
 *                does not (MEMORY for CORY, EXERCISE for ARISE). Free at
 *                runtime with a teaching toast;
 *   homophones — words phone-identical to the prompt (free, knowing line).
 *
 * Fairness floor: target is always coverable from EVERYDAY-band accepted
 * words alone — she is never asked for rhymes only a rhyming dictionary
 * would know.
 */

const SEED = 20260806;
const dir = dirname(fileURLToPath(import.meta.url));

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

interface Spec {
  puzzles: number;
  rounds: number;
  target: number;
  /** Max frequency rank for the prompt itself. */
  promptRank: number;
  /** Minimum EVERYDAY-band accepted rhymes (fairness floor). */
  minEveryday: number;
}

const SPECS: Record<Difficulty, Spec> = {
  easy: { puzzles: 30, rounds: 1, target: 3, promptRank: 8_000, minEveryday: 8 },
  medium: { puzzles: 24, rounds: 2, target: 3, promptRank: 20_000, minEveryday: 6 },
  hard: { puzzles: 24, rounds: 2, target: 4, promptRank: 40_000, minEveryday: 6 },
  expert: { puzzles: 18, rounds: 3, target: 4, promptRank: 60_000, minEveryday: 5 },
};

const EVERYDAY = 20_000;
const FAMILIAR = 60_000;
const ADVANCED = 120_000;

function loadRanks(): Map<string, number> {
  const ranks = new Map<string, number>();
  const lines = readFileSync(join(dir, 'data', 'count_1w.txt'), 'utf8').split('\n');
  let rank = 0;
  for (const line of lines) {
    const word = line.split('\t')[0]?.trim().toLowerCase();
    if (!word) continue;
    rank++;
    if (!ranks.has(word)) ranks.set(word, rank);
  }
  return ranks;
}

/**
 * Final-syllable rime, stress-free: from the LAST vowel phone to the end.
 * Two words sharing a loose key sound identical in their final syllable
 * even when the perfect-rhyme (primary-stress) rule says they don't rhyme.
 */
function looseKeys(ph: Phonetics, word: string): Set<string> {
  const keys = new Set<string>();
  for (const pron of ph.pronsOf(word)) {
    for (let i = pron.length - 1; i >= 0; i--) {
      if (isVowelPhone(pron[i]!)) {
        keys.add(pron.slice(i).map((p) => p.replace(/[0-9]/, '')).join(' '));
        break;
      }
    }
  }
  return keys;
}

function sharesLooseKey(ph: Phonetics, a: string, b: string): boolean {
  const ka = looseKeys(ph, a);
  if (ka.size === 0) return false;
  for (const k of looseKeys(ph, b)) if (ka.has(k)) return true;
  return false;
}

function main() {
  const rng = createRng(SEED);
  console.log('loading phonetics + word lists…');
  const ph: Phonetics = loadPhonetics();
  const ranks = loadRanks();
  const enable1 = readFileSync(join(dir, 'data', 'enable1.txt'), 'utf8')
    .split('\n').map((w) => w.trim().toLowerCase()).filter(Boolean);

  // The Music Room lexicon: real words the CMU dict can pronounce.
  const lexicon = enable1.filter(
    (w) => w.length >= 3 && w.length <= 9 && !BLOCKLIST.has(w) && /^[a-z]+$/.test(w) && ph.has(w),
  );
  const rankOf = (w: string) => ranks.get(w) ?? -1;
  const inBand = (w: string, max: number) => {
    const r = rankOf(w);
    return r > 0 && r <= max;
  };

  // Index by rhyme key.
  const families = new Map<string, string[]>();
  for (const w of lexicon) {
    for (const key of ph.rhymeKeysOf(w)) {
      const fam = families.get(key);
      if (fam) fam.push(w);
      else families.set(key, [w]);
    }
  }

  // Tail index for eye-rhyme decoys (last 3 letters).
  const tails = new Map<string, string[]>();
  for (const w of lexicon) {
    if (!inBand(w, FAMILIAR)) continue;
    const tail = w.slice(-3);
    const list = tails.get(tail);
    if (list) list.push(w);
    else tails.set(tail, [w]);
  }

  const byRank = (a: string, b: string) => {
    const ra = rankOf(a); const rb = rankOf(b);
    if (ra > 0 && rb > 0) return ra - rb;
    if (ra > 0) return -1;
    if (rb > 0) return 1;
    return a.localeCompare(b);
  };

  function buildRound(prompt: string, target: number): RhymeRound | null {
    const acceptedSet = new Set<string>();
    for (const key of ph.rhymeKeysOf(prompt)) {
      for (const w of families.get(key) ?? []) {
        if (w !== prompt && inBand(w, ADVANCED) && ph.rhymesWith(prompt, w)) acceptedSet.add(w);
      }
    }
    const accepted = [...acceptedSet].sort(byRank);
    const everydayCount = accepted.filter((w) => inBand(w, EVERYDAY)).length;
    if (everydayCount < target + 1) return null;

    const homophones = [...new Set(
      (families.get(ph.rhymeKeysOf(prompt)[0] ?? '') ?? [])
        .concat(...ph.rhymeKeysOf(prompt).map((k) => families.get(k) ?? []))
        .filter((w) => w !== prompt && ph.isHomophone(prompt, w)),
    )].sort(byRank).slice(0, 6);

    const tailKin = (tails.get(prompt.slice(-3)) ?? [])
      .filter((w) => w !== prompt && !acceptedSet.has(w) && !ph.isHomophone(prompt, w) && ph.has(w));
    // Eye-rhyme decoys must SOUND different even in the final syllable —
    // stress-only misses are near-rhymes and stay free.
    const decoys = tailKin
      .filter((w) => !sharesLooseKey(ph, prompt, w))
      .sort(byRank)
      .slice(0, 6);
    const near = tailKin
      .filter((w) => sharesLooseKey(ph, prompt, w))
      .sort(byRank)
      .slice(0, 15);

    return {
      prompt: prompt.toUpperCase(),
      accepted: accepted.map((w) => w.toUpperCase()),
      decoys: decoys.map((w) => w.toUpperCase()),
      homophones: homophones.map((w) => w.toUpperCase()),
      near: near.map((w) => w.toUpperCase()),
      target,
    };
  }

  // Prompt candidates per difficulty, shuffled deterministically.
  const puzzles: RhymePuzzle[] = [];
  const usedPrompts = new Set<string>();
  for (const difficulty of DIFFS) {
    const spec = SPECS[difficulty];
    const candidates = shuffle(rng, lexicon.filter(
      (w) => w.length >= 3 && w.length <= 6 && inBand(w, spec.promptRank),
    ));
    let made = 0;
    let cursor = 0;
    let allowReuse = false;
    while (made < spec.puzzles) {
      if (cursor >= candidates.length) {
        if (allowReuse) break;          // truly exhausted
        allowReuse = true;              // second pass may reuse other-difficulty prompts
        cursor = 0;
      }
      const rounds: RhymeRound[] = [];
      const roundKeys = new Set<string>();
      while (rounds.length < spec.rounds && cursor < candidates.length) {
        const prompt = candidates[cursor++]!;
        if (!allowReuse && usedPrompts.has(prompt)) continue;
        const keys = ph.rhymeKeysOf(prompt);
        if (keys.some((k) => roundKeys.has(k))) continue;  // no same-family rounds
        const round = buildRound(prompt, spec.target);
        if (!round) continue;
        const everyday = round.accepted.filter((w) => inBand(w.toLowerCase(), EVERYDAY));
        if (everyday.length < spec.minEveryday) continue;
        rounds.push(round);
        keys.forEach((k) => roundKeys.add(k));
        usedPrompts.add(prompt);
      }
      if (rounds.length === spec.rounds) {
        puzzles.push({ id: `rhyme-${difficulty}-${made + 1}`, difficulty, rounds });
        made++;
      } else if (cursor >= candidates.length && rounds.length < spec.rounds) {
        continue; // loop head handles reuse/exhaustion
      }
    }
    console.log(`${difficulty}: ${made} puzzles`);
    if (made < spec.puzzles * 0.8) {
      throw new Error(`rhyme: only ${made}/${spec.puzzles} ${difficulty} puzzles — loosen the spec`);
    }
  }

  validate(puzzles, ph);
  writeFileSync(join(dir, 'generated', 'rhyme.json'), JSON.stringify(puzzles));
  const bytes = JSON.stringify(puzzles).length;
  console.log(`rhyme.json: ${puzzles.length} puzzles (${(bytes / 1024).toFixed(0)}KB)`);

  // Spot-check the model on the canonical examples.
  const spot: [string, string, boolean][] = [
    ['grey', 'weigh', true], ['cough', 'dough', false], ['four', 'fore', false],
    ['cat', 'bat', true], ['stone', 'gone', false], ['day', 'away', true],
  ];
  for (const [a, b, want] of spot) {
    const got = ph.rhymesWith(a, b);
    if (got !== want) throw new Error(`phonetics spot-check failed: ${a}/${b} → ${got}, want ${want}`);
  }
  console.log('phonetics spot-checks pass');
}

/** Re-verify every shipped set phonetically — the honesty pass. */
function validate(puzzles: RhymePuzzle[], ph: Phonetics) {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of puzzles) {
    if (ids.has(p.id)) problems.push(`${p.id}: duplicate id`);
    ids.add(p.id);
    if (p.rounds.length < 1 || p.rounds.length > 3) problems.push(`${p.id}: ${p.rounds.length} rounds`);
    for (const [i, r] of p.rounds.entries()) {
      const tag = `${p.id} r${i}`;
      if (r.accepted.length < r.target + 1) problems.push(`${tag}: accepted smaller than target+1`);
      if (r.accepted.includes(r.prompt)) problems.push(`${tag}: prompt inside accepted`);
      for (const w of r.accepted.slice(0, 40)) {
        if (!ph.rhymesWith(r.prompt.toLowerCase(), w.toLowerCase())) {
          problems.push(`${tag}: accepted "${w}" does not rhyme with ${r.prompt}`);
        }
      }
      for (const d of r.decoys) {
        if (ph.rhymesWith(r.prompt.toLowerCase(), d.toLowerCase())) {
          problems.push(`${tag}: decoy "${d}" actually rhymes with ${r.prompt}`);
        }
        if (sharesLooseKey(ph, r.prompt.toLowerCase(), d.toLowerCase())) {
          problems.push(`${tag}: decoy "${d}" sounds like ${r.prompt} in its final syllable — must be near, not decoy`);
        }
        if (r.accepted.includes(d)) problems.push(`${tag}: decoy "${d}" inside accepted`);
      }
      for (const n of r.near) {
        if (r.accepted.includes(n)) problems.push(`${tag}: near "${n}" inside accepted`);
        if (r.decoys.includes(n)) problems.push(`${tag}: near "${n}" inside decoys`);
        if (!sharesLooseKey(ph, r.prompt.toLowerCase(), n.toLowerCase())) {
          problems.push(`${tag}: near "${n}" does not share ${r.prompt}'s final syllable`);
        }
      }
      for (const h of r.homophones) {
        if (!ph.isHomophone(r.prompt.toLowerCase(), h.toLowerCase())) {
          problems.push(`${tag}: "${h}" is not a homophone of ${r.prompt}`);
        }
      }
    }
  }
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`rhyme validation failed with ${problems.length} problem(s)`);
  }
}

main();
