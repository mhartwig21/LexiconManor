import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, shuffle, type Rng } from '../src/engine/rng';
import { cipherLettersOf, decodeMap, type CipherPuzzle } from '../src/engine/puzzles/cipher';
import type { Difficulty } from '../src/engine/types';

/**
 * Cipher generator for The Darkroom.
 *
 * Hand-authored phrase list (public-domain proverbs + manor-voice aphorisms,
 * A–Z and spaces only), encoded with a seeded substitution that is a strict
 * derangement over the letters present (no letter ever maps to itself).
 *
 * Difficulty: longer phrases give more statistical footholds, so the longest
 * quartile is 'easy' and the shortest is 'expert'; starting reveals taper
 * 3/2/1/0 with difficulty (the tier mercy). Validation round-trips every
 * puzzle through the runtime decoder and re-checks the derangement.
 */

const SEED = 20260807;
const REVEALS: Record<Difficulty, number> = { easy: 3, medium: 2, hard: 1, expert: 0 };

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
  'KNOWLEDGE IS POWER',
  'LOOK BEFORE YOU LEAP',
  'NECESSITY IS THE MOTHER OF INVENTION',
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
  'CURIOSITY KILLED THE CAT',
  'EASY COME EASY GO',
  'EVERY ROSE HAS ITS THORN',
  'FIRST THINGS FIRST',
  'IT TAKES TWO TO TANGO',
  'LIGHTNING NEVER STRIKES TWICE',
  'MAKE HAY WHILE THE SUN SHINES',
  'NO TIME LIKE THE PRESENT',
  'ONE GOOD TURN DESERVES ANOTHER',
  'SEEING IS BELIEVING',
  'STRIKE WHILE THE IRON IS HOT',
  'THE APPLE NEVER FALLS FAR FROM THE TREE',
  'THE BEST THINGS IN LIFE ARE FREE',
  'THE PROOF IS IN THE PUDDING',
  'TIME HEALS ALL WOUNDS',
  'VARIETY IS THE SPICE OF LIFE',
  'WELL BEGUN IS HALF DONE',
  'WASTE NOT WANT NOT',
  // Manor-voice aphorisms (original, in the lexicographer's register).
  'EVERY WORD KEEPS A SECRET',
  'INK REMEMBERS WHAT PAPER FORGETS',
  'A QUIET ROOM TEACHES LOUD LESSONS',
  'THE DICTIONARY NEVER SLEEPS',
  'OLD BOOKS MAKE WARM COMPANY',
  'A LETTER SENT IS A PROMISE KEPT',
  'SMALL KEYS OPEN GREAT DOORS',
  'THE CANDLE KNOWS THE SHAPE OF NIGHT',
  'PATIENCE TURNS EVERY PAGE',
  'LOST WORDS LEAVE WARM SHADOWS',
];

function letterCount(phrase: string): number {
  return phrase.replace(/[^A-Z]/g, '').length;
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

  // Longest quartile = easy … shortest = expert (ties broken alphabetically
  // for determinism). More text = more statistical footholds.
  const sorted = [...PHRASES].sort((a, b) => letterCount(b) - letterCount(a) || a.localeCompare(b));
  const q = Math.ceil(sorted.length / 4);
  const byDifficulty: [Difficulty, string[]][] = [
    ['easy', sorted.slice(0, q)],
    ['medium', sorted.slice(q, q * 2)],
    ['hard', sorted.slice(q * 2, q * 3)],
    ['expert', sorted.slice(q * 3)],
  ];

  const puzzles: CipherPuzzle[] = [];
  for (const [difficulty, phrases] of byDifficulty) {
    phrases.forEach((plaintext, i) => {
      const present = distinctLetters(plaintext);
      const encode = derangedMapping(rng, present);
      const ciphertext = [...plaintext].map((ch) => encode[ch] ?? ch).join('');

      // Starting reveals: the most frequent plain letters, as cipher letters.
      const freq: Record<string, number> = {};
      for (const ch of plaintext) {
        if (/[A-Z]/.test(ch)) freq[ch] = (freq[ch] ?? 0) + 1;
      }
      const reveals = [...present]
        .sort((a, b) => (freq[b] ?? 0) - (freq[a] ?? 0) || a.localeCompare(b))
        .slice(0, REVEALS[difficulty])
        .map((plain) => encode[plain]!);

      puzzles.push({ id: `cipher-${difficulty}-${i + 1}`, difficulty, ciphertext, plaintext, reveals });
    });
  }

  validate(puzzles);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'cipher.json');
  writeFileSync(outPath, JSON.stringify(puzzles));
  console.log(`cipher.json: ${puzzles.length} puzzles`);
}

/** Fail the build on any puzzle the runtime decoder cannot round-trip. */
function validate(puzzles: CipherPuzzle[]) {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of puzzles) {
    if (ids.has(p.id)) problems.push(`${p.id}: duplicate id`);
    ids.add(p.id);
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
