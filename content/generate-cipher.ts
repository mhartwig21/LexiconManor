import { readFileSync, writeFileSync } from 'node:fs';
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
 *
 * ---------------------------------------------------------------------------
 * ROUND 52 — ONE DEFENSIBLE ANSWER (docs/BENCHMARKS.md §11)
 * ---------------------------------------------------------------------------
 * Everything above grades this room on how HARD it is. Nothing above asked
 * whether it is FAIR, and 76.0% of the round-51 pool was not: a player who had
 * solved the whole board could read `A HOUSE THAT MOVES KEEPS SECRETS` as
 * `A HOUSE THAT LOVES KEEPS SECRETS`, hand it in, and be told she was wrong.
 * The reference never has to think about this — a 60-120 letter Cryptoquote is
 * unique because every letter recurs across several words — and this room is
 * 19-41 letters, which is where uniqueness stops being free.
 *
 * A letter is FORCED when no other plain letter can stand in its place without
 * turning some word into a non-word. Ordinary English is ENABLE at Norvig rank
 * <= ORDINARY_RANK, plus A and I; the TRUE word is always admitted however rare
 * it is, because the true word is the answer. Two things follow, and they are
 * the whole of this pass:
 *
 *   1. The crib's first job is FAIRNESS and only its second is a foothold, so
 *      the reveals go first to the letters the phrase cannot force and the old
 *      frequency rule fills whatever slots are left. The COUNTS never move.
 *   2. A phrase with more unforced letters than its tier has reveals cannot be
 *      made fair by any reveal it is allowed, so it THROWS here rather than
 *      being silently dropped — the list is hand-authored and a line that
 *      cannot be made fair has to be rewritten by a person.
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
/**
 * The line for "a word she would actually produce" — ENABLE ∩ Norvig rank
 * <= 20,000. It is not a number invented for this room: it is the *everyday*
 * band `content/lib/dictionary.ts` publishes and the Gallery's dead-ground
 * ceiling already defends as "findable in practice" (BENCHMARKS §8).
 */
const ORDINARY_RANK = 20_000;
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
 * Every proverb is gone. All 132 phrases (round 52: 121 + 46 authored − 35
 * cut for a second defensible reading) are things somebody in this
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
  'A CAT DECIDES WHICH PARCEL WAITS',
  'THE CELLAR KEEPS A COOL OPINION',
  'GROWING IS LOUD IF YOU LISTEN',
  'PAPER SETTLES ONCE IT IS READ',
  'DOORS DO NOT CHANGE THEIR MINDS',
  'COATS OFF AND WORRIES DOWN',
  'THE HOUSE WRITES IN BROWN INK',
  'TEA HOLDS ITS WARMTH LONGER',
  'PLANTS NOTICE FEET',
  'HE WROTE ON RECEIPTS AND HEMS',
  'EVERY ROOM IS SOMEONE ELSE TODAY',
  'THIRTY YEARS OF DUST AND ONE DOOR',
  'ASK THE KETTLE IT KNOWS FIRST',
  'THE GARDEN IS INDOORS HERE',
  'THE LOST POST PILE IS PATIENT',
  'TAKE THE KEYS BEFORE THE STAIRS',
  'SOME DOORS SULK UNTIL TEATIME',
  'INK RECALLS WHAT PAPER FORGETS',
  'THE HOUSE LEARNS EVERY GUEST FROM THEIR FOOTFALL',
  'EVERY LOCKED DRAWER HIDES ANOTHER DRAFT',
  'DUSTY SHELVES HOLD THE WARMEST STORIES',
  'OLD INK STILL SMELLS FAINTLY SWEET',
  'KETTLES SING FOR ANYONE WHO WAITS',
  'EVERY SHELF KEEPS ONE UNREAD STORY',
  'SLOW READING KEEPS THE LONGEST COMPANY',
  'THIS MANOR COUNTS DAYS AND NOT CLOCKS',
  'EVERY GOOD QUESTION OUTLIVES ITS ANSWER',
  'CANDLES KEEP THEIR OWN QUIET COUNSEL',
  'LOST LETTERS FIND WARMER ROOMS LATER',
  'WARM TEA MENDS MORE THAN CLEVER ADVICE',
  'EVERY MARGIN HOLDS SOME BRAVER SENTENCE',
  'GARDENS FORGIVE EVERY CLUMSY GARDENER',
  'SMALL LAMPS OUTLAST GREAT BONFIRES',
  'SHELVES HAVE OPINIONS MOSTLY SMUG',
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
  /**
   * ═══ ROUND 52 — THE LINES THAT ANSWER TO ONE READING ══════════════════
   * Thirty-five of the round-51 phrases admitted a second defensible answer
   * their tier's crib could not close and are gone; these are their
   * replacements, authored to the rule BENCHMARKS §11 states — a letter is
   * safe when it earns its keep in more than one word, and the dangerous
   * words are the short ones with crowded neighbours (BAD/CAD/LAD/TAD,
   * MOVES/LOVES, HOLD/COLD/BOLD) and the two-letter function words that are
   * simultaneously tier 2's crib and tier 2's trap. Same register as the
   * rest: the master's notebooks, Bramble's house rules, Posy's Post Room,
   * Ellery, Fern, Dewey, the Portrait.
   */
  'EVERY DOOR IN THIS HOUSE HAS A MOOD',
  'ONE WORD A DAY IS THE HOUSE RULE',
  'A QUIET GUEST IS STILL A WITNESS',
  'THE ORCHARD OWES A LETTER OR TWO',
  'ELLERY DUSTS A SHELF HE HAS DUSTED',
  'THE ATTIC KEEPS A SEPARATE WEATHER',
  'A LOCKED ROOM IS MERELY SHY',
  'A CANDLE OUTLASTS MOST OPINIONS',
  'THE HOUSE SHRUGS AND MOVES A DOOR',
  'FERN PREFERS A SLOWER KIND OF NEWS',
  'A GUEST WHO LISTENS GETS THE BEST TEA',
  'BRAMBLE TRUSTS A KETTLE OVER A CLOCK',
  'EVERY SHELF IN THIS HOUSE LISTENS',
  'THE MASTER WROTE IN THE MARGINS',
  'THE PORTRAIT SPEAKS TO NOBODY ELSE',
  'NOTHING IN THE PANTRY IS URGENT',
  'THE KETTLE SETTLES BEFORE THE HOUSE',
  'THE LIBRARY PREFERS TO BE ASKED',
  'BRAMBLE MEASURES TEA BY MEMORY',
  'THE CELLAR STORES ITS OWN WEATHER',
  'ELLERY TRUSTS THE OLDEST LEDGER',
  'THE HOUSE PREFERS TO BE READ SLOWLY',
  'THE STAIRS PROTEST IN THE MORNINGS',
  'POSY KEEPS THE STRING IN HER POCKET',
  'THE PORTRAIT PREFERS THE SHADOWS',
  'BRAMBLE POURS BEFORE SHE IS ASKED',
  'ELLERY POLISHES THE SMALLEST LAMP',
  'THE HOUSE STORES ITS OWN SILENCES',
  'NOTHING IS FILED BEFORE ITS TIME',
  'BROWN PAPER IS ALWAYS WORTH SAVING',
  'THE GLASS ROOM IS WARM AGAIN TODAY',
  'NOTHING IN THIS HOUSE EVER STAYS PUT',
  'BOOTS STAY ON INDOORS IN THIS HOUSE',
  'THE CAT OUTRANKS THE PARCEL IN HERE',
  'THE STAIRS REMEMBER EVERY GUEST',
  'POSY STAMPS EVERY RUMOUR TWICE',
  'DEWEY OUTRANKS THE MORNING POST',
  'FERN COUNTS THE SEEDS SHE PLANTED',
  'THE MASTER SLEPT AMONG HIS NOTES',
  'THE MASTER SPELLED HIS OWN NAME OUT',
  'EVERY ROOM SETTLES BEFORE MIDNIGHT',
  'THE MARGINS HOLD THE BETTER STORY',
  'EVERY STAIR HERE HOLDS ITS BREATH',
  'HOLD YOUR OWN PLANS RATHER LOOSELY',
  'THE HOUSE KEEPS WHATEVER YOU FOUND',
  'DEWEY HAS OPINIONS ABOUT THE STAIRS',
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

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/**
 * Ordinary English, read off the two vendored corpora rather than off
 * `dictionary.json` — that file starts at four letters and this room is made
 * of `IS`, `OF`, `A` and `THE`.
 */
function loadOrdinaryEnglish(): Set<string> {
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data');
  const rank = new Map<string, number>();
  const counts = readFileSync(join(dataDir, 'count_1w.txt'), 'utf8').split('\n');
  for (let i = 0; i < counts.length; i++) {
    const w = counts[i]!.split('\t')[0]!.trim().toUpperCase();
    if (w.length > 0 && !rank.has(w)) rank.set(w, i + 1);
  }
  // ENABLE has no one-letter entries and English has exactly two.
  const out = new Set<string>(['A', 'I']);
  for (const line of readFileSync(join(dataDir, 'enable1.txt'), 'utf8').split('\n')) {
    const w = line.trim().toUpperCase();
    if (w.length < 2 || !/^[A-Z]+$/.test(w)) continue;
    if ((rank.get(w) ?? Number.MAX_SAFE_INTEGER) <= ORDINARY_RANK) out.add(w);
  }
  return out;
}

/**
 * The plain letters this phrase does NOT force: substitute one of them
 * throughout for a letter the phrase does not already use, and every word it
 * touched is still an ordinary English word. The target must be UNUSED or the
 * mapping stops being one-to-one, which the room states as its only rule
 * ("One letter stands for one letter, all the way through") and paints in wax
 * on any duplicate pencil mark.
 */
function unforcedLetters(phrase: string, ordinary: Set<string>): string[] {
  const words = phrase.split(' ');
  const present = distinctLetters(phrase);
  const unused = ALPHABET.filter((c) => !present.includes(c));
  const out: string[] = [];
  for (const from of present) {
    const free = unused.some((to) => {
      const alt = words.map((w) => w.replaceAll(from, to));
      return alt.every((w, i) => w === words[i] || ordinary.has(w));
    });
    if (free) out.push(from);
  }
  return out;
}

/**
 * Pairs whose values can be exchanged with every word still reading — a second
 * answer at mapping-distance two, still injective (`CANDLES KEEP …` →
 * `CANDLES PEEK …`). Rarer than the single, and 13 of the round-51 boards had
 * one.
 */
function swapReadings(phrase: string, ordinary: Set<string>): [string, string][] {
  const words = phrase.split(' ');
  const present = distinctLetters(phrase);
  const out: [string, string][] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const a = present[i]!;
      const b = present[j]!;
      const alt = words.map((w) => [...w].map((c) => (c === a ? b : c === b ? a : c)).join(''));
      const touched = alt.filter((w, k) => w !== words[k]);
      if (touched.length > 0 && touched.every((w) => ordinary.has(w))) out.push([a, b]);
    }
  }
  return out;
}

/**
 * Which PLAIN letters this phrase hands over at this tier — fairness first,
 * frequency second, and never more than `REVEALS[tier]` of them. Returns null
 * when the phrase cannot be made fair inside its tier's budget; `main` throws
 * on that rather than dropping the line quietly.
 */
function revealPlan(phrase: string, tier: Tier, ordinary: Set<string>): string[] | null {
  const budget = REVEALS[tier];
  const chosen = unforcedLetters(phrase, ordinary);
  if (chosen.length > budget) return null;

  // A swap reading dies if either of its two letters is standing, so the ones
  // the unforced set already covers cost nothing. The rest are a set cover;
  // greedy is exact enough at this size and is deterministic.
  let open = swapReadings(phrase, ordinary).filter(([a, b]) => !chosen.includes(a) && !chosen.includes(b));
  while (open.length > 0) {
    if (chosen.length >= budget) return null;
    const hits = new Map<string, number>();
    for (const [a, b] of open) {
      hits.set(a, (hits.get(a) ?? 0) + 1);
      hits.set(b, (hits.get(b) ?? 0) + 1);
    }
    const best = [...hits.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]![0];
    chosen.push(best);
    open = open.filter(([a, b]) => a !== best && b !== best);
  }

  // Whatever is left over is the round-4 rule, untouched: the most frequent
  // letters at tier 1, and a MID-frequency letter at tiers 2-3 — a foothold,
  // never the free E.
  const freq: Record<string, number> = {};
  for (const ch of phrase) {
    if (/[A-Z]/.test(ch)) freq[ch] = (freq[ch] ?? 0) + 1;
  }
  const byFreq = distinctLetters(phrase)
    .sort((a, b) => (freq[b] ?? 0) - (freq[a] ?? 0) || a.localeCompare(b));
  const mid = Math.floor(byFreq.length / 2);
  const order = tier === 1 ? byFreq : [...byFreq.slice(mid), ...byFreq.slice(0, mid)];
  for (const ch of order) {
    if (chosen.length >= budget) break;
    if (!chosen.includes(ch)) chosen.push(ch);
  }
  return chosen.length === budget ? chosen : null;
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

  // ROUND 52 — the fairness pass, before a single phrase is encoded. A line
  // the crib cannot make fair is an AUTHORING error, so it is named and it
  // stops the build; nothing is filtered out from under the list.
  const ordinary = loadOrdinaryEnglish();
  const unfair: string[] = [];
  for (const tier of [1, 2, 3] as Tier[]) {
    for (const phrase of byTier[tier]) {
      if (revealPlan(phrase, tier, ordinary) === null) {
        const free = unforcedLetters(phrase, ordinary);
        const swaps = swapReadings(phrase, ordinary).map(([a, b]) => `${a}/${b}`);
        unfair.push(`  ${phrase}\n    tier ${tier} gives ${REVEALS[tier]} reveal(s); unforced`
          + ` [${free.join('') || '—'}]${swaps.length > 0 ? `, swap readings ${swaps.join(' ')}` : ''}`);
      }
    }
  }
  if (unfair.length > 0) {
    throw new Error(`cipher: ${unfair.length} phrase(s) admit a second defensible reading that`
      + ` their tier's crib cannot close (BENCHMARKS §11):\n${unfair.join('\n')}`);
  }

  const puzzles: TieredCipherPuzzle[] = [];
  for (const tier of [1, 2, 3] as Tier[]) {
    byTier[tier].forEach((plaintext, i) => {
      const present = distinctLetters(plaintext);
      const encode = derangedMapping(rng, present);
      const ciphertext = [...plaintext].map((ch) => encode[ch] ?? ch).join('');
      const reveals = revealPlan(plaintext, tier, ordinary)!.map((plain) => encode[plain]!);

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

  validate(puzzles, ordinary);
  report(puzzles, ordinary);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'cipher.json');
  writeFileSync(outPath, JSON.stringify(puzzles));
  console.log(`cipher.json: ${puzzles.length} puzzles`);
}

type TieredCipherPuzzle = CipherPuzzle & { tier: Tier };

/**
 * What the pool costs and what it buys, printed every generation so the
 * numbers in BENCHMARKS §11 can be re-read rather than re-remembered. The
 * hapax median is here and NOT in a gate on purpose (§11): 90.2% of unforced
 * letters are hapax but only 22.1% of hapax letters are unforced, so it is the
 * symptom and forcedness is the disease.
 */
function report(puzzles: TieredCipherPuzzle[], ordinary: Set<string>) {
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  };
  for (const tier of [1, 2, 3] as Tier[]) {
    const group = puzzles.filter((p) => p.tier === tier);
    if (group.length === 0) continue;
    const hapax: number[] = [];
    const glyphShare: number[] = [];
    for (const p of group) {
      const truth = decodeMap(p);
      const revealedPlain = new Set(p.reveals.map((c) => truth[c]!));
      const freq: Record<string, number> = {};
      for (const ch of p.plaintext) if (/[A-Z]/.test(ch)) freq[ch] = (freq[ch] ?? 0) + 1;
      hapax.push(Object.keys(freq).filter((c) => freq[c] === 1 && !revealedPlain.has(c)).length);
      const total = letterCount(p.plaintext);
      glyphShare.push([...revealedPlain].reduce((n, c) => n + (freq[c] ?? 0), 0) / total);
    }
    const swaps = group.filter((p) => swapReadings(p.plaintext, ordinary).length > 0).length;
    console.log(`  t${tier}: median unrevealed hapax ${median(hapax)},`
      + ` crib covers ${(100 * median(glyphShare)).toFixed(1)}% of glyphs,`
      + ` ${swaps} board(s) with a swap reading before the crib closes it`);
  }
}

/** Fail the build on any puzzle the runtime decoder cannot round-trip. */
function validate(puzzles: TieredCipherPuzzle[], ordinary: Set<string>) {
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

    // ROUND 52 — ONE DEFENSIBLE ANSWER, checked on what SHIPPED rather than on
    // what was planned. Read back through the runtime decoder, so a reveal
    // written for the wrong letter is caught here and not by a player.
    const revealedPlain = new Set(p.reveals.map((c) => truth[c]!));
    const free = unforcedLetters(p.plaintext, ordinary).filter((c) => !revealedPlain.has(c));
    if (free.length > 0) {
      problems.push(`${p.id}: ${free.join('')} unforced and not revealed — "${p.plaintext}"`
        + ' admits a second defensible reading');
    }
    for (const [a, b] of swapReadings(p.plaintext, ordinary)) {
      if (!revealedPlain.has(a) && !revealedPlain.has(b)) {
        problems.push(`${p.id}: ${a}/${b} swap gives a second reading of "${p.plaintext}"`);
      }
    }
  }
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`cipher validation failed with ${problems.length} problem(s)`);
  }
}

main();
