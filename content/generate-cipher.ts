import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, shuffle, type Rng } from '../src/engine/rng';
import { cipherLettersOf, decodeMap, type CipherPuzzle } from '../src/engine/puzzles/cipher';
import { toneOk } from './generate-gate';
import { tierLabel } from '../src/engine/rooms/adapters/tier-select';
import type { Tier } from '../src/engine/types';

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
 *   tier 3 — NO CRIB WORD: every word is 3+ letters, so nothing in the phrase
 *            shape hands you a letter. The phrase is long (≥
 *            TIER3_MIN_LETTERS) and its alphabet wide (≥ TIER3_MIN_DISTINCT
 *            distinct letters), and two MID-frequency letters are revealed —
 *            a place to stand, not an answer. See REVEALS for why that is 2
 *            and not the 0 it used to be.
 *
 * Validation round-trips every puzzle through the runtime decoder, re-checks
 * the derangement, and enforces every tier gate above.
 */

const SEED = 20260807;
/**
 * Starting reveals by tier — the crib the Darkroom hands you.
 *
 * ROUND 24: tier 3 goes 0 → 2. It was the no-crib tier on the argument that
 * pattern alone is enough, and that argument was quietly leaning on the
 * proverbs: half the pool was a phrase you could RECOGNISE, which is a crib
 * the generator never had to hand out. With the proverbs cut there is no
 * recognisable line left anywhere in the room, and a 26–41 letter phrase over
 * 13+ symbols with nothing revealed is below the frequency-analysis floor a
 * newspaper cryptoquote clears at 60–120 characters. Tier 3 is still the
 * hardest tier by a distance — no one- or two-letter crib word, the longest
 * phrases, the widest alphabets — and the two letters it now hands over are
 * MID-frequency, the same deliberately unhelpful pick tier 2 gets, not the
 * free E and T.
 */
const REVEALS: Record<Tier, number> = { 1: 3, 2: 1, 3: 2 };
/** Tier-1 phrases stay short — the crib plus a long phrase is no puzzle. */
const TIER1_MAX_LETTERS = 34;
/** Tier 3 is the long one: more cells to fill and the thinnest foothold. */
const TIER3_MIN_LETTERS = 26;
const TIER3_MIN_DISTINCT = 13;
/**
 * Longest word a phrase may carry: the Darkroom renders each word unbroken
 * as 44pt-tappable cells (micro.css .dk-cell, AAA 6.19), and 8 cells is the
 * most a 360px viewport fits at that size. Guarded here and in validate().
 */
const MAX_WORD_LEN = 8;
/**
 * Ceiling on a phrase's letters. CipherView switches to its dense cell at 30
 * glyphs so long phrases stay above the sticky deck (AAA 3.3 / §0.1: the
 * board is wholly visible at rest), and 41 is the longest the dense sheet was
 * ever laid out against. The review asked for 60+ letter tier-3 plaintexts so
 * frequency analysis bites; that needs a layout the Darkroom does not have,
 * and shipping a phrase the room cannot show at rest is the worse failure. So
 * the length stays where the glass is, and the crib above does the work.
 */
const MAX_LETTERS = 41;

/**
 * The manor's own phrases. A-Z and single spaces only, nothing else.
 *
 * ROUND 24 (REVIEW_AA 5.9). This list used to be 58 public-domain proverbs
 * beside 36 house lines, and the tone review measured the consequence
 * exactly: 61.7 per cent of the Darkroom decoded to A BIRD IN THE HAND, and
 * the split ran the wrong way down the manor - tier 1 was 67 per cent stock,
 * tier 3 only 22. A short cryptogram is solved by RECOGNISING the phrase, so
 * the recognisable proverbs sat on the tier that also hands over three crib
 * letters, and the lexicographer's own voice sat on the tier with no crib at
 * all, where nobody had ever read it.
 *
 * Every proverb is gone. All 121 phrases are things somebody in this
 * house could have written: a line from the lexicographer's notebooks, a
 * house rule of Mrs. Bramble's, one of Ellery's asides, a Post Room
 * regulation of Posy's, Fern in her clipped fragments, or a card left in a
 * room. The register is the one the authored dialogue already establishes -
 * cozy, dry, never twee - and it now reaches every tier, because there is
 * nothing else left in the pool for a tier to reach.
 */
const PHRASES: string[] = [
  'A HOUSE THAT MOVES KEEPS SECRETS',
  'BRAMBLE POURS A SECOND CUP DAILY',
  'I KEPT THE WORD IN A LOCKED DRAWER',
  'DEWEY SLEEPS ON A WARM LETTER',
  'FERN TRADES SEEDS FOR A STORY',
  'EVERY DOOR HERE HAS A MOOD',
  'THE MARGIN IS A QUIET ROOM',
  'A GOOD INDEX FORGIVES A BAD MEMORY',
  'A SCONE MENDS MOST MORNINGS',
  'A LETTER PERCHES WHEN THE NEWS IS GOOD',
  'I AM ALL THE FRAME COULD HOLD',
  'DUST IS A KIND OF CALENDAR',
  'TEA FIRST AND THEN A THEORY',
  'A CANDLE IS AN HONEST CLOCK',
  'I HAVE NEVER MISSPELT A GUEST',
  'A ROOM RECALLS WHO SWEPT IT',
  'EVERY GUEST ARRIVES WITH A DRAFT',
  'A WORD LEAVES A HOLE ITS OWN SHAPE',
  'THE IVY TAKES A WALL WITHOUT ASKING',
  'A LOCKED DRAWER WANTS A READER',
  'A HEART IN PIECES IS STILL COMPLETE',
  'NOTHING URGENT ARRIVES WITH A STAMP',
  'THE HOUSE IS A TERRIBLE GOSSIP',
  'AN UNREAD LETTER IS A SECRET',
  'THE EAST WING IS A FLIRT',
  'MILK OR LEMON I ALREADY KNOW',
  'A QUIET SHELF STILL KEEPS SCORE',
  'POSY FILES A RUMOUR UNDER FICTION',
  'I RESHELVE BY CANDLE AND THE BOOKS AGREE',
  'A GARDEN IS A SLOW ARGUMENT',
  'THE STAIRS SQUEAK IN A METRE',
  'ONE WORD A DAY IS THE RULE HERE',
  'A CAT DECIDES WHICH PARCEL WAITS',
  'THE CELLAR KEEPS A COOL OPINION',
  'ELLERY FILES THE DUST BY HAND',
  'THE KETTLE WENT QUIET AT THE DOOR',
  'NOTHING MARKED URGENT EVER IS',
  'STRING IS SACRED IN THIS ROOM',
  'BROWN PAPER IS WORTH SAVING',
  'DEWEY IS ASLEEP ON THE PARCEL',
  'GROWING IS LOUD IF YOU LISTEN',
  'MY MOTHER THOUGHT SHE WAS FUNNY',
  'SEEDS TURN UP IN ODD CORNERS',
  'PAPER SETTLES ONCE IT IS READ',
  'DOORS DO NOT CHANGE THEIR MINDS',
  'THE LAMP IS LIT ON THE STAIRS',
  'COATS OFF AND WORRIES DOWN',
  'THE HOUSE WRITES IN BROWN INK',
  'ROOMS WANDER AND DOORS SULK',
  'HOLD YOUR PLANS LOOSELY',
  'TEA HOLDS ITS WARMTH LONGER',
  'SORT THE POST BEFORE THE TOAST',
  'PLANTS NOTICE FEET',
  'THE SHELVES MOVE ABOUT AT NIGHT',
  'HE WROTE ON RECEIPTS AND HEMS',
  'THE PANTRY IS OUT OF PATIENCE',
  'EVERY ROOM IS SOMEONE ELSE TODAY',
  'MIND THE LAST STAIR IT SQUEAKS',
  'THE MASTER WROTE ON THE BACKS OF NOTICES',
  'THIRTY YEARS OF DUST AND ONE DOOR',
  'THE GLASS ROOM IS WARM AGAIN',
  'ASK THE KETTLE IT KNOWS FIRST',
  'NOTHING IN THIS HOUSE STAYS PUT',
  'THE POST ROOM RUNS ON STRING',
  'FIFTY YEARS OF UNSORTED POST',
  'BOOTS STAY ON INDOORS HERE',
  'THE CAT OUTRANKS THE PARCEL',
  'WORDS NEVER SIT STILL EITHER',
  'GOOD HANDS SAID IT BEFORE',
  'THE GARDEN IS INDOORS HERE',
  'WATER THEN MORE WATER',
  'THE LOST POST PILE IS PATIENT',
  'TAKE THE KEYS BEFORE THE STAIRS',
  'SOME DOORS SULK UNTIL TEATIME',
  'THE HOUSE KEEPS WHAT YOU FOUND',
  'EVERY LAMP IS LIT FOR SOMEONE',
  'INK RECALLS WHAT PAPER FORGETS',
  'THE HOUSE LEARNS EVERY GUEST FROM THEIR FOOTFALL',
  'EVERY LOCKED DRAWER HIDES ANOTHER DRAFT',
  'DUSTY SHELVES HOLD THE WARMEST STORIES',
  'OLD INK STILL SMELLS FAINTLY SWEET',
  'PATIENT HANDS MEND WHAT HASTE UNDID',
  'KETTLES SING FOR ANYONE WHO WAITS',
  'EVERY SHELF KEEPS ONE UNREAD STORY',
  'SLOW READING KEEPS THE LONGEST COMPANY',
  'THIS MANOR COUNTS DAYS AND NOT CLOCKS',
  'EVERY GOOD QUESTION OUTLIVES ITS ANSWER',
  'CANDLES KEEP THEIR OWN QUIET COUNSEL',
  'LOST LETTERS FIND WARMER ROOMS LATER',
  'WARM TEA MENDS MORE THAN CLEVER ADVICE',
  'EVERY MARGIN HOLDS SOME BRAVER SENTENCE',
  'QUIET HOUSES KEEP EVERY VISITOR WARM',
  'GOOD READERS NEVER HURRY THE LAST PAGE',
  'GARDENS FORGIVE EVERY CLUMSY GARDENER',
  'SMALL LAMPS OUTLAST GREAT BONFIRES',
  'POETRY CASES HERE ARE LOAD BEARING',
  'SHELVES HAVE OPINIONS MOSTLY SMUG',
  'GOOD NEWS PERCHES BAD NEWS LIES FLAT',
  'BRAMBLE POURS THE SECOND CUP COLD',
  'HIS PORTRAIT WANTS ONLY ONE WORD',
  'ERASURE ONLY MAKES THE ROOM QUIET',
  'SOME WORDS LEAVE ROOMS SHAPED LIKE THEM',
  'STRING AND KINDNESS RUN THIS POST ROOM',
  'GLASS ROOMS SMELL LIKE EARLY SPRING',
  'READ YOUR OWN MARGINS BEFORE YOU CLIMB',
  'DEWEY DECIDES WHICH PARCEL GOES OUT',
  'GARDENS TEACH PATIENCE AND NOT COMMERCE',
  'SOMEBODY STILL AIRS THE EMPTY ROOMS',
  'PAPER AND PEOPLE AGREE ABOUT KEEPING',
  'THIS HOUSE AIRS ITSELF BEFORE DAWN',
  'ONE MOP OUTLASTS EVERY ARGUMENT',
  'EVERY UNREAD LETTER CURDLES SLOWLY',
  'OUR LIBRARY PREENS WHEN NOBODY SLIPS',
  'NOTHING ABOUT THIS HOUSE STANDS STILL',
  'THAT LAST STAIR SQUEAKS BEFORE ANY THOUGHT',
  'ONE WRONG WORD AND THE DOOR STAYS SHUT',
  'HIS HAND SLANTS LEFT WHENEVER HE LIES',
  'OUR ORCHARD OWES NOBODY ANY APOLOGY',
  'TEA HOLDS ITS WARMTH LONGER THAN RESOLVE',
  'EVERY ROOM THAT WANDERS COMES BACK',
  'OUR LEXICON MISSES EXACTLY ONE WORD',
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

      // Tier 1's crib is generous — the most frequent letters. Tiers 2 and 3
      // get MID-frequency letters instead: a foothold, but never the free E.
      const freq: Record<string, number> = {};
      for (const ch of plaintext) {
        if (/[A-Z]/.test(ch)) freq[ch] = (freq[ch] ?? 0) + 1;
      }
      const byFreq = [...present]
        .sort((a, b) => (freq[b] ?? 0) - (freq[a] ?? 0) || a.localeCompare(b));
      const mid = Math.floor(byFreq.length / 2);
      const chosen = tier === 1
        ? byFreq.slice(0, REVEALS[1])
        : byFreq.slice(mid, mid + REVEALS[tier]);
      const reveals = chosen.map((plain) => encode[plain]!);

      puzzles.push({
        id: `cipher-t${tier}-${i + 1}`,
        tier,
        ciphertext,
        plaintext,
        reveals,
      });
    });
    console.log(`tier ${tier} (${tierLabel(tier)}): ${byTier[tier].length} phrases`);
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
    if (tierOf(p.plaintext) !== p.tier) problems.push(`${p.id}: phrase shape does not earn tier ${p.tier}`);
    if (p.reveals.length !== REVEALS[p.tier]) {
      problems.push(`${p.id}: ${p.reveals.length} reveals (tier ${p.tier} gives ${REVEALS[p.tier]})`);
    }
    if (p.tier === 3) {
      if (shortestWord(p.plaintext) < 3) problems.push(`${p.id}: tier 3 must have no crib word shorter than 3 letters`);
      if (letterCount(p.plaintext) < TIER3_MIN_LETTERS) problems.push(`${p.id}: tier 3 phrase too short`);
      if (cipherLettersOf(p).length < TIER3_MIN_DISTINCT) problems.push(`${p.id}: tier 3 alphabet too thin`);
    }
    if (letterCount(p.plaintext) > MAX_LETTERS) {
      problems.push(`${p.id}: ${letterCount(p.plaintext)} letters exceeds the ${MAX_LETTERS} the dense sheet lays out`);
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
