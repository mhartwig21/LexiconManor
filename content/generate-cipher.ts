import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, shuffle, type Rng } from '../src/engine/rng';
import { cipherLettersOf, decodeMap, type CipherPuzzle } from '../src/engine/puzzles/cipher';
import { toneOk } from './generate-gate';
import type { Difficulty, Tier } from '../src/engine/types';

/**
 * Cipher generator for The Darkroom.
 *
 * Hand-authored phrase list (public-domain proverbs + manor-voice aphorisms,
 * A–Z and spaces only), encoded with a seeded substitution that is a strict
 * derangement over the letters present (no letter ever maps to itself).
 *
 * ---------------------------------------------------------------------------
 * THREE TIERS, MAPPED TO MANOR ROWS (owner directive, round 4: "longer
 * phrases, no-crib tier 3")
 * ---------------------------------------------------------------------------
 * This REVERSES the old quartile rule (which called the longest phrases the
 * easiest). What actually makes a cryptogram tractable is not text volume but
 * a CRIB — a place to stand. So the tiers are defined by which crib the phrase
 * hands you, and length now climbs with the row instead of falling:
 *
 *   tier 1 — the phrase contains a ONE-LETTER WORD (A or I). That word is a
 *            two-way guess before a single deduction, and three revealed
 *            high-frequency letters sit on top of it (≤ TIER1_MAX_LETTERS).
 *   tier 2 — no one-letter word, but a TWO-LETTER word (IS/IT/TO/OF…) still
 *            narrows things fast, plus exactly one revealed letter — and it is
 *            deliberately a MID-frequency letter, not the easy E/T.
 *   tier 3 — NO CRIB AT ALL: every word is 3+ letters, nothing is revealed,
 *            the phrase is long (≥ TIER3_MIN_LETTERS) and its alphabet is wide
 *            (≥ TIER3_MIN_DISTINCT distinct letters). You start from pure
 *            pattern: doubles, word shapes, and the manor's own voice.
 *
 * Validation round-trips every puzzle through the runtime decoder, re-checks
 * the derangement, and enforces every tier gate above.
 */

const SEED = 20260807;
/** Starting reveals by tier — the crib the Darkroom hands you, or doesn't. */
const REVEALS: Record<Tier, number> = { 1: 3, 2: 1, 3: 0 };
/** Legacy display label per tier (engine/types.ts Difficulty stays frozen). */
const TIER_LABEL: Record<Tier, Difficulty> = { 1: 'easy', 2: 'medium', 3: 'hard' };
/** Tier-1 phrases stay short — the crib plus a long phrase is no puzzle. */
const TIER1_MAX_LETTERS = 34;
/** Tier 3 is the long one: more cells to fill and no foothold to start from. */
const TIER3_MIN_LETTERS = 26;
const TIER3_MIN_DISTINCT = 13;
/**
 * Longest word a phrase may carry: the Darkroom renders each word unbroken
 * as 44pt-tappable cells (micro.css .dk-cell, AAA 6.19), and 8 cells is the
 * most a 360px viewport fits at that size. Guarded here and in validate().
 */
const MAX_WORD_LEN = 8;

/** Public-domain proverbs & in-voice aphorisms. A–Z + single spaces only. */
const PHRASES: string[] = [
  'A STITCH IN TIME SAVES NINE',
  'ACTIONS SPEAK LOUDER THAN WORDS',
  'ALL THAT GLITTERS IS NOT GOLD',
  'AN APPLE A DAY KEEPS THE DOCTOR AWAY',
  'BETTER LATE THAN NEVER',
  'BIRDS OF A FEATHER FLOCK TOGETHER',
  'A WATCHED POT NEVER BOILS',
  'ABSENCE MAKES THE HEART GROW FONDER',
  'EVERY CLOUD HAS A SILVER LINING',
  'FORTUNE FAVORS THE BOLD',
  'HASTE MAKES WASTE',
  'HONESTY IS THE BEST POLICY',
  'LITTLE BY LITTLE THE BIRD BUILDS ITS NEST',
  'LOOK BEFORE YOU LEAP',
  'A BIRD IN THE HAND IS WORTH TWO IN THE BUSH',
  'NO NEWS IS GOOD NEWS',
  'PRACTICE MAKES PERFECT',
  'SLOW AND STEADY WINS THE RACE',
  'STILL WATERS RUN DEEP',
  'THE EARLY BIRD CATCHES THE WORM',
  'THE PEN IS MIGHTIER THAN THE SWORD',
  'THERE IS NO PLACE LIKE HOME',
  'TWO HEADS ARE BETTER THAN ONE',
  'WHERE THERE IS SMOKE THERE IS FIRE',
  'YOU REAP WHAT YOU SOW',
  'A PICTURE IS WORTH A THOUSAND WORDS',
  'DO NOT COUNT YOUR CHICKENS BEFORE THEY HATCH',
  'DO NOT PUT ALL YOUR EGGS IN ONE BASKET',
  'EVERY DOG HAS ITS DAY',
  'GOOD THINGS COME TO THOSE WHO WAIT',
  'GREAT OAKS FROM LITTLE ACORNS GROW',
  'HOME IS WHERE THE HEART IS',
  'IF THE SHOE FITS WEAR IT',
  'LAUGHTER IS THE BEST MEDICINE',
  'LET SLEEPING DOGS LIE',
  'MANY HANDS MAKE LIGHT WORK',
  'NEVER JUDGE A BOOK BY ITS COVER',
  'OUT OF SIGHT OUT OF MIND',
  'ROME WAS NOT BUILT IN A DAY',
  'THE GRASS IS ALWAYS GREENER ON THE OTHER SIDE',
  'THE SQUEAKY WHEEL GETS THE GREASE',
  'WHEN IN ROME DO AS THE ROMANS DO',
  'YOU CANNOT HAVE YOUR CAKE AND EAT IT TOO',
  'A FRIEND IN NEED IS A FRIEND INDEED',
  'A JOURNEY OF A THOUSAND MILES BEGINS WITH A SINGLE STEP',
  'A PENNY SAVED IS A PENNY EARNED',
  'A ROLLING STONE GATHERS NO MOSS',
  'BEAUTY IS IN THE EYE OF THE BEHOLDER',
  'A CAT MAY LOOK AT A KING',
  'EASY COME EASY GO',
  'EVERY ROSE HAS ITS THORN',
  'FIRST THINGS FIRST',
  'IT TAKES TWO TO TANGO',
  'ALL GOOD THINGS MUST COME TO AN END',
  'MAKE HAY WHILE THE SUN SHINES',
  'NO TIME LIKE THE PRESENT',
  'ONE GOOD TURN DESERVES ANOTHER',
  'EVERY PATH HAS ITS PUDDLE',
  'STRIKE WHILE THE IRON IS HOT',
  'THE APPLE NEVER FALLS FAR FROM THE TREE',
  'THE BEST THINGS IN LIFE ARE FREE',
  'THE PROOF IS IN THE PUDDING',
  'TIME AND TIDE WAIT FOR NO MAN',
  'VARIETY IS THE SPICE OF LIFE',
  'WELL BEGUN IS HALF DONE',
  'WASTE NOT WANT NOT',
  // Manor-voice aphorisms (original, in the lexicographer's register).
  'EVERY WORD KEEPS A SECRET',
  'INK RECALLS WHAT PAPER FORGETS',
  'A QUIET ROOM TEACHES LOUD LESSONS',
  'THE LEXICON NEVER SLEEPS',
  'OLD BOOKS MAKE WARM COMPANY',
  'A LETTER SENT IS A PROMISE KEPT',
  'SMALL KEYS OPEN GREAT DOORS',
  'THE CANDLE KNOWS THE SHAPE OF NIGHT',
  'PATIENCE TURNS EVERY PAGE',
  'LOST WORDS LEAVE WARM SHADOWS',
  'A MISLAID WORD ALWAYS COMES HOME',
  'THE MARGINS HOLD THE BRAVEST NOTES',
  'DUST SETTLES ONLY ON QUIET SHELVES',
  'A GOOD INDEX FORGIVES A BAD MEMORY',
  'THE LAMP BURNS LONGEST FOR SLOW READERS',
  'EVERY LOCKED DRAWER HIDES A FIRST DRAFT',
  'MORNING LIGHT FADES THE BOLDEST INK',
  // Round 4 — the no-crib tier: long, every word 3+ letters, wide alphabet.
  'EVERY LOCKED DRAWER HIDES ANOTHER SMALL SECRET',
  'THE QUIET HOUSE KEEPS EVERY VISITOR WARM',
  'GOOD READERS NEVER HURRY THE LAST PAGE',
  'THE GARDEN FORGIVES EVERY CLUMSY GARDENER',
  'SMALL LAMPS OUTLAST GREAT BONFIRES',
  'EVERY MARGIN HOLDS SOME BRAVER SENTENCE',
  'THE OLDEST INK STILL SMELLS FAINTLY SWEET',
  'PATIENT HANDS MEND WHAT HASTE UNDID',
  'THE HOUSE LEARNS EVERY GUEST FROM THEIR FOOTFALL',
  'WARM TEA MENDS MORE THAN CLEVER ADVICE',
  'EVERY SHELF KEEPS ONE UNREAD STORY',
  'THE KETTLE SINGS FOR ANYONE WHO WAITS',
  'LOST LETTERS FIND WARMER ROOMS LATER',
  'SLOW READING KEEPS THE LONGEST COMPANY',
  'THE MANOR COUNTS ITS DAYS AND NOT ITS CLOCKS',
  'EVERY GOOD QUESTION OUTLIVES ITS ANSWER',
  'THE CANDLE KEEPS ITS OWN QUIET COUNSEL',
  'DUSTY SHELVES HOLD THE WARMEST STORIES',
];

function letterCount(phrase: string): number {
  return phrase.replace(/[^A-Z]/g, '').length;
}

function shortestWord(phrase: string): number {
  return Math.min(...phrase.split(' ').map((w) => w.length));
}

/**
 * The tier a phrase's own shape earns: which crib it hands the player, plus
 * the length/alphabet floors. Returns null for phrases that fit nowhere (a
 * one-letter-word phrase that is too long to be a gentle tier-1 opener).
 */
function tierOf(phrase: string): Tier | null {
  const shortest = shortestWord(phrase);
  const letters = letterCount(phrase);
  if (shortest === 1) return letters <= TIER1_MAX_LETTERS ? 1 : null;
  if (shortest >= 3 && letters >= TIER3_MIN_LETTERS
    && distinctLetters(phrase).length >= TIER3_MIN_DISTINCT) return 3;
  return 2;
}

function distinctLetters(phrase: string): string[] {
  return [...new Set(phrase.replace(/[^A-Z]/g, ''))];
}

/** Substitution that fixes no letter present in the phrase. */
function derangedMapping(rng: Rng, present: string[]): Record<string, string> {
  const A = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  for (let attempt = 0; attempt < 200; attempt++) {
    const perm = shuffle(rng, A);
    const map: Record<string, string> = {};
    A.forEach((ch, i) => { map[ch] = perm[i]!; });
    if (present.every((ch) => map[ch] !== ch)) return map;
  }
  throw new Error('could not build a deranged mapping');
}

function main() {
  const rng = createRng(SEED);

  // Authoring guard (mirrors validate()): a phrase with a thin alphabet is a
  // degenerate cipher; an over-long word breaks the 44pt cell layout; a
  // tone-gated word breaks the cozy bar. Fail loudly so the list gets fixed.
  const bad = PHRASES.filter((p) =>
    p.split(' ').some((w) => w.length > MAX_WORD_LEN || !toneOk(w)));
  if (bad.length > 0) {
    throw new Error(`cipher: phrases with >${MAX_WORD_LEN}-letter or tone-gated words:\n${bad.join('\n')}`);
  }
  const usable = PHRASES.filter((p) => distinctLetters(p).length >= 9 && p.split(' ').length >= 3);
  const dropped = PHRASES.length - usable.length;
  if (dropped > 0) console.log(`dropped ${dropped} phrase(s) with a thin alphabet or too few words`);

  // Tier by phrase shape (the crib it hands you), sorted for determinism.
  const byTier: Record<Tier, string[]> = { 1: [], 2: [], 3: [] };
  let unplaced = 0;
  for (const phrase of [...usable].sort((a, b) => a.localeCompare(b))) {
    const tier = tierOf(phrase);
    if (tier === null) { unplaced++; continue; }
    byTier[tier].push(phrase);
  }
  if (unplaced > 0) console.log(`${unplaced} phrase(s) fit no tier band`);

  const puzzles: TieredCipherPuzzle[] = [];
  for (const tier of [1, 2, 3] as Tier[]) {
    byTier[tier].forEach((plaintext, i) => {
      const present = distinctLetters(plaintext);
      const encode = derangedMapping(rng, present);
      const ciphertext = [...plaintext].map((ch) => encode[ch] ?? ch).join('');

      // Tier 1's crib is generous — the most frequent letters. Tier 2 gets one
      // MID-frequency letter instead: a foothold, but not the free E.
      const freq: Record<string, number> = {};
      for (const ch of plaintext) {
        if (/[A-Z]/.test(ch)) freq[ch] = (freq[ch] ?? 0) + 1;
      }
      const byFreq = [...present]
        .sort((a, b) => (freq[b] ?? 0) - (freq[a] ?? 0) || a.localeCompare(b));
      const chosen = tier === 2
        ? byFreq.slice(Math.floor(byFreq.length / 2), Math.floor(byFreq.length / 2) + REVEALS[2])
        : byFreq.slice(0, REVEALS[tier]);
      const reveals = chosen.map((plain) => encode[plain]!);

      puzzles.push({
        id: `cipher-t${tier}-${i + 1}`,
        tier,
        difficulty: TIER_LABEL[tier],
        ciphertext,
        plaintext,
        reveals,
      });
    });
    console.log(`tier ${tier}: ${byTier[tier].length} phrases`);
  }

  validate(puzzles);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'cipher.json');
  writeFileSync(outPath, JSON.stringify(puzzles));
  console.log(`cipher.json: ${puzzles.length} puzzles`);
}

type TieredCipherPuzzle = CipherPuzzle & { tier: Tier };

/** Fail the build on any puzzle the runtime decoder cannot round-trip. */
function validate(puzzles: TieredCipherPuzzle[]) {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of puzzles) {
    if (ids.has(p.id)) problems.push(`${p.id}: duplicate id`);
    ids.add(p.id);

    // Tier gates (round 4): the crib rule, the length floor, the reveal count.
    if (p.difficulty !== TIER_LABEL[p.tier]) problems.push(`${p.id}: label/tier mismatch`);
    if (tierOf(p.plaintext) !== p.tier) problems.push(`${p.id}: phrase shape does not earn tier ${p.tier}`);
    if (p.reveals.length !== REVEALS[p.tier]) {
      problems.push(`${p.id}: ${p.reveals.length} reveals (tier ${p.tier} gives ${REVEALS[p.tier]})`);
    }
    if (p.tier === 3) {
      if (shortestWord(p.plaintext) < 3) problems.push(`${p.id}: tier 3 must have no crib word shorter than 3 letters`);
      if (letterCount(p.plaintext) < TIER3_MIN_LETTERS) problems.push(`${p.id}: tier 3 phrase too short`);
      if (cipherLettersOf(p).length < TIER3_MIN_DISTINCT) problems.push(`${p.id}: tier 3 alphabet too thin`);
      if (p.reveals.length !== 0) problems.push(`${p.id}: tier 3 is the no-crib tier`);
    }
    if (p.tier === 1 && shortestWord(p.plaintext) !== 1) {
      problems.push(`${p.id}: tier 1 must hand over a one-letter crib word`);
    }
    if (!/^[A-Z ]+$/.test(p.plaintext)) problems.push(`${p.id}: plaintext has characters outside A-Z/space`);
    if (p.plaintext.length !== p.ciphertext.length) problems.push(`${p.id}: length mismatch`);

    // Round-trip through the runtime decoder.
    const truth = decodeMap(p);
    const decoded = [...p.ciphertext].map((ch) => truth[ch] ?? ch).join('');
    if (decoded !== p.plaintext) problems.push(`${p.id}: decode round-trip failed`);

    // Derangement + injectivity: no fixed points, no two plains sharing a cipher letter.
    for (const [c, plain] of Object.entries(truth)) {
      if (c === plain) problems.push(`${p.id}: ${c} maps to itself`);
    }
    const plains = Object.values(truth);
    if (new Set(plains).size !== plains.length) problems.push(`${p.id}: mapping is not injective`);

    const distinct = cipherLettersOf(p);
    if (distinct.length < 9) problems.push(`${p.id}: only ${distinct.length} distinct letters`);
    if (p.plaintext.split(' ').length < 3) problems.push(`${p.id}: fewer than 3 words`);
    for (const w of p.plaintext.split(' ')) {
      if (w.length > MAX_WORD_LEN) problems.push(`${p.id}: "${w}" exceeds ${MAX_WORD_LEN} letters (cell layout)`);
      if (!toneOk(w)) problems.push(`${p.id}: "${w}" fails the tone gate`);
    }
    for (const r of p.reveals) {
      if (!distinct.includes(r)) problems.push(`${p.id}: reveal ${r} not in ciphertext`);
    }
  }
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`cipher validation failed with ${problems.length} problem(s)`);
  }
}

main();
