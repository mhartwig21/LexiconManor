import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, pick, shuffle } from '../src/engine/rng';
import { loadPhonetics } from './lib/phonetics';
import {
  FINISH_MIN,
  LETTER_MECHANIC_FAMILIES,
  MIN_LADDER_RISE,
  chooseColours,
  familySignature,
  familyOfTheme,
  intrinsicLateral,
  isWayIn,
  ladderProblems,
  lateralOf,
  type CensusBoard,
} from './lib/wordweb-ladder';
import { gateOk, toneOk } from './generate-gate';
import { typesetDeep } from './lib/typography';
import { tierLabel } from '../src/engine/rooms/adapters/tier-select';
import type { Tier, WordWebPuzzle } from '../src/engine/types';

/**
 * The Library's Word Web generator — the fairness pass Connections never had
 * (AAA 2.6–2.11, BENCHMARKS §"our two structural fixes").
 *
 * ---------------------------------------------------------------------------
 * THREE TIERS, MAPPED TO MANOR ROWS (owner directive, round 4: "tier-3 boards
 * use tighter red-herring budgets + subtler categories")
 * ---------------------------------------------------------------------------
 * `tier` (1|2|3 ⇢ rows 0–2 / 3–4 / 5–6) is the one authoritative field. (The
 * old `difficulty` display alias is retired — derive a word from the tier with
 * `tierLabel()` if one is ever wanted; the per-board `difficulty` in
 * authored/word-web-boards.json is authoring INTENT, a different thing.) Two
 * structural knobs, both build-enforced:
 *
 *   1. THE HERRING BUDGET TIGHTENS AS YOU CLIMB. "Tighter" is read as *the
 *      traps get tighter*, not fewer: the solver scores every planted herring,
 *      and each tier sets both a cap and a MINIMUM TIGHTNESS. Tier 1 ships at
 *      most one loose trap (a near-clean board); tier 3 must ship 2–3 traps
 *      and every one of them must score ≥ HERRING_TIGHT — a real 5th-member or
 *      cross-category pull, not a coincidence. A board that cannot meet its
 *      tier's bar is demoted, never faked.
 *   2. CATEGORIES GET SUBTLER. Tier 1 keeps its trivia gimme (≤1, always at
 *      the yellow tier, per AAA 2.9). Tier 3 forbids trivia outright and
 *      requires ≥2 SUBTLE categories — wordplay you have to hear or unscramble
 *      (rhymes, anagrams, silent letters, hidden words, heteronyms) rather than
 *      the blunt substring/compound kind ("Contains TEN", "___ FIRE") that
 *      reads straight off the tiles.
 *
 * Input:  content/authored/word-web-boards.json (the curated legacy boards).
 * Output: content/generated/word-web.json, each board enriched with:
 *   - `type` per group (semantic / trivia / wordplay) and 2.9 enforcement:
 *     ≤1 trivia category per board, ALWAYS at the easiest tier (yellow),
 *     ≥2 categories solvable purely from letters/wordplay on the tiles
 *     (excess trivia / thin semantics are swapped for bank wordplay groups);
 *   - a red-herring budget (2.7/2.8): a build-time solver enumerates
 *     unintended 4-groupings under affix / doubled-letter / rhyme /
 *     cross-board-semantic heuristics and FAILS THE BUILD on any complete
 *     unintended grouping; planted herrings (≤3, 5th-member or cross-category
 *     traps) are emitted as `ambiguousWords`;
 *   - ROUND 7 (AAA 2.10 [BEAT]): the trap is emitted WITH ITS RELATION —
 *     `herrings: [{ words, relation, detail }]`, relation ∈ rhyme /
 *     shared-affix / doubled-letter / semantic. `ambiguousWords` (the flat
 *     intruder list the layout clusters on) is derived from it and unchanged.
 *     Without the relation the room could only say "no": the acknowledged-
 *     herring line named neither the words nor the thread, so a −2-step guess
 *     bought nothing the shake had not already said. The bar's own example
 *     ("they *do* all rhyme, don't they?") is informative BECAUSE it names the
 *     relation. Every tier now also carries a floor of ≥1 trap (tier 1 used to
 *     ship `minHerrings: 0`, and 22 of 55 boards had an empty trap list — on
 *     40% of nights the one channel meant to beat Connections was dead);
 *   - an adversarial opening `layout` (2.6): herrings clustered adjacently,
 *     no gift rows (no row holds 3+ of one group);
 *   - ROUND 14 (AAA 2.11 [BEAT]): two PLAUSIBILITY-SOLVED `decoys` per group.
 *     They used to be drawn uniformly at random from other boards' same-tier
 *     themes with no test but "must read differently from the answer", and 206
 *     of the 211 mechanically-checkable ones described NONE of their group's
 *     four words. Every decoy is now a label the group's own tiles satisfy —
 *     2 or 3 of the four wherever the language allows it (77% of the shelf),
 *     never zero, never all four — preferring the ones the board's planted
 *     herrings also answer to. See `labelSatisfiedBy` / `assignDecoys`.
 *   - ROUND 14: the anti-wallpaper cap gains a coarser counter keyed on
 *     MECHANIC FAMILY (`familyOf`), a visibility rule that keeps a bare
 *     edge-token sort out of blue and purple (2.12), a re-anchoring pass for a
 *     label that names a tile on its own board (2.8), and a victim order that
 *     ranks categories by QUALITY so the composer stops eating the good ones.
 *
 * Run:    npx tsx content/generate-wordweb.ts
 * Author: npx tsx content/generate-wordweb.ts --report
 *
 * `--report` is the authoring loop (round 10, the 51 → 150 board expansion).
 * The build is a hard fail by design — an unintended complete grouping is not
 * a warning — but a hard fail is useless feedback when you are writing forty
 * boards at a sitting: it names the first sixteen problems and stops. Report
 * mode diagnoses EVERY authored board against its intended tier without
 * throwing (tone gate, unintended groupings, category composition, measured
 * trap tightness) so a board can be fixed where it was written.
 */

const SEED = 20260801;

// ---------------------------------------------------------------------------
// Category taxonomy (2.9). Every theme MUST be tagged; unknown themes fail.
// ---------------------------------------------------------------------------

type GroupType = 'semantic' | 'trivia' | 'wordplay';

/** Franchise / proper-noun / crystallized-knowledge categories. */
const TRIVIA_THEMES = new Set([
  'Beatles Songs', 'Board Games', 'Broadway Musicals', 'Clue Board Game Weapons',
  'DC Comics Heroes', 'Disney Princess Names', 'Disney Villains',
  'Famous Chrises', 'Famous Davids', 'Famous Jennifers', 'Famous Johns',
  'Famous Michaels', 'Famous Roberts', 'Famous Toms', 'Famous Williams',
  'Friends Characters', 'Genericized Trademarks', 'Greek Gods',
  'Harry Potter Houses', 'Indiana Jones Films', 'James Bond Films',
  'Marvel Avengers', 'Monopoly Properties', 'One-Word Band Names',
  'One-Word Movie Titles', 'One-Word Oscar Winners', 'Pixar Movie Titles',
  'Shakespeare Plays', 'Star Wars Names', 'TV Shows Starting with "The"',
  'Taylor Swift Albums',
]);

/** Letters-visible / word-property categories beyond the pattern rules below. */
const WORDPLAY_THEMES = new Set([
  'Palindromes', 'Semordnilaps', 'Heteronyms', 'Contronyms',
  'Contronyms (Own Opposite)', 'Onomatopoeia', 'Portmanteau Words',
  'Contains Roman Numerals', 'Hidden Numbers (Spelled Out)',
  'Things That Can Be "Iron"',
  // ROUND 13 — the six new shape mechanics (see SHAPE_THEMES in
  // lib/wordweb-ladder.ts). Wordplay by 2.9's definition: everything you need
  // to prove them is printed on the tile.
  'Words with All Five Vowels', 'Letters in Alphabetical Order',
  'Spelled Without a Vowel', 'Three Vowels in a Row',
  'The Same Letter Three Times', 'Made of a Repeated Syllable',
]);

/**
 * ROUND 10 BUG FIX — the round-6 typography pass set every authored theme in
 * curly quotes, and the three theme SETS above are written with straight ones.
 * From that moment `TRIVIA_THEMES.has('TV Shows Starting with “The”')` was
 * false, so that category shipped tagged `semantic`: it dodged the 2.9 trivia
 * cap, dodged the trivia-sits-at-yellow rule (it shipped at BLUE on web-24),
 * and would have dodged tier 3's outright ban. `Things That Can Be “Iron”`
 * lost its wordplay tag the same way. This is the exact shape of the round-7
 * `Contains "X"` escape — a quotation mark silently switching off a fairness
 * rule — so membership is now asked of a canonical form rather than of the
 * bytes the typography pass happened to leave behind.
 */
function canon(theme: string): string {
  return theme.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

function typeOfTheme(rawTheme: string): GroupType {
  const theme = canon(rawTheme);
  if (TRIVIA_THEMES.has(theme)) return 'trivia';
  if (WORDPLAY_THEMES.has(theme)) return 'wordplay';
  if (theme.includes('___')) return 'wordplay';
  if (/^Can (Be|Follow|Precede) /.test(theme)) return 'wordplay';
  if (/^Contains /.test(theme)) return 'wordplay';
  if (/^Hidden /.test(theme)) return 'wordplay';
  if (/^(Anagrams of|Rhymes with) /.test(theme)) return 'wordplay';
  if (/^(Silent|Starts|Two Pairs)/.test(theme)) return 'wordplay';
  // Round 10 — three more families the letters themselves prove. The 150-board
  // shelf needs roughly 150 subtle categories and the old vocabulary (five
  // families plus eight named ones) could not supply them without the same
  // eight themes becoming wallpaper.
  if (/^Homophones/.test(theme)) return 'wordplay';
  if (/^Add an? /.test(theme)) return 'wordplay';
  if (/^Drop /.test(theme)) return 'wordplay';
  return 'semantic';
}

/**
 * SUBTLE categories (the tier-3 bar): the thread is real but invisible on a
 * first read — you have to say the words aloud, unscramble them, or notice a
 * word hiding inside another. The blunt kind ("Contains TEN", "___ FIRE",
 * "Can Precede KEEPER") reads straight off the tiles and stays at tiers 1–2.
 */
const SUBTLE_THEMES = new Set([
  'Palindromes', 'Semordnilaps', 'Heteronyms', 'Contronyms',
  'Contronyms (Own Opposite)', 'Onomatopoeia', 'Portmanteau Words',
  'Contains Roman Numerals',
  // ROUND 13 — subtle in exactly the sense tier 3 means: real, provable on the
  // tile, invisible on a first read. Nobody looks at QUEUE, BEAUTY, AQUEOUS
  // and PLATEAU and sees three vowels in a row; they see four unrelated words.
  'Words with All Five Vowels', 'Letters in Alphabetical Order',
  'Spelled Without a Vowel', 'Three Vowels in a Row',
  'The Same Letter Three Times', 'Made of a Repeated Syllable',
]);

function isSubtleTheme(rawTheme: string): boolean {
  const theme = canon(rawTheme);
  if (SUBTLE_THEMES.has(theme)) return true;
  if (/^(Anagrams of|Rhymes with) /.test(theme)) return true;
  if (/^Hidden /.test(theme)) return true;
  if (/^Silent /.test(theme)) return true;
  if (/^(Two Pairs|Starts and Ends)/.test(theme)) return true;
  // A homophone thread has to be HEARD (you cannot see that QUEUE is a "Q"),
  // and an add-a-letter / drop-a-letter thread has to be performed on the word
  // before it is visible at all. Both are subtle in exactly the sense tier 3
  // means: real, provable on the tile, invisible on a first read.
  if (/^Homophones/.test(theme)) return true;
  if (/^Add an? /.test(theme)) return true;
  if (/^Drop /.test(theme)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// ROUND 14 — MECHANIC FAMILIES (AAA 2.9), VISIBILITY (2.12) and CATEGORY
// QUALITY (the composer's victim order).
// ---------------------------------------------------------------------------

/**
 * ROUND 14 — THE ANTI-WALLPAPER CAP HAS TO SEE THE MECHANIC, NOT THE STRING.
 *
 * `BANK_REUSE_CAP` counts an exact theme STRING, so it cannot tell that
 * `Contains "TEN"`, `Contains "CAR"` and `Contains "ICE"` are one trick wearing
 * three coats. Measured on the round-13 shelf of 162 boards: `Contains "X"` on
 * 105 boards (65%), a compound-modifier category on 96 (59%), `Rhymes with "X"`
 * on 86 (53%). "Two Pairs of Double Letters" now shows up once every 54 boards
 * and *some flavour of Contains* two nights in three — the cap moved the
 * wallpaper, it did not remove it.
 *
 * A FAMILY is the deduction the player performs, which is the thing that gets
 * learned. It is counted per BOARD (a family is wallpaper if you meet it on too
 * many nights, not if one board happens to use it twice).
 */
type Family =
  | 'rhyme' | 'contains' | 'compound' | 'silent' | 'letter-swap'
  | 'hidden' | 'homophone' | 'anagram' | 'letter-shape' | 'semantic' | 'trivia';

/** Wordplay whose thread is a property of the word's SHAPE, not of a token. */
const LETTER_SHAPE_THEMES = new Set([
  'Palindromes', 'Semordnilaps', 'Heteronyms', 'Contronyms',
  'Contronyms (Own Opposite)', 'Onomatopoeia', 'Portmanteau Words',
  'Contains Roman Numerals', 'Two Pairs of Double Letters',
  'Starts and Ends with the Same Letter',
  'Words with All Five Vowels', 'Letters in Alphabetical Order',
  'Spelled Without a Vowel', 'Three Vowels in a Row',
  'The Same Letter Three Times', 'Made of a Repeated Syllable',
]);

function familyOf(rawTheme: string): Family {
  const theme = canon(rawTheme);
  if (TRIVIA_THEMES.has(theme)) return 'trivia';
  if (LETTER_SHAPE_THEMES.has(theme)) return 'letter-shape';
  if (/^(Two Pairs|Starts and Ends)/.test(theme)) return 'letter-shape';
  if (/^Rhymes with /.test(theme)) return 'rhyme';
  if (/^Anagrams of /.test(theme)) return 'anagram';
  if (/^Hidden /.test(theme)) return 'hidden';
  if (/^Homophones/.test(theme)) return 'homophone';
  if (/^Silent /.test(theme)) return 'silent';
  if (/^(Add an? |Drop )/.test(theme)) return 'letter-swap';
  if (theme.includes('___') || /^Can (Be|Follow|Precede) /.test(theme)) return 'compound';
  if (/^Contains /.test(theme)) return 'contains';
  if (typeOfTheme(theme) === 'wordplay') return 'letter-shape';
  return 'semantic';
}

/** The families the anti-wallpaper budget polices (semantics are the point). */
const WALLPAPER_FAMILIES: readonly Family[] = [
  'rhyme', 'contains', 'compound', 'silent', 'letter-swap',
  'hidden', 'homophone', 'anagram', 'letter-shape',
];

/**
 * ROUND 13 (REVIEW_AA §5.8) — THE LETTER MECHANICS, and the line the round-14
 * family budget did not draw.
 *
 * The review's finding was that 67.3% of shipped groups are one of eleven
 * label templates, and that *"by week two the player is running a checklist
 * rather than solving: find the rhyme group, find the letter-string group,
 * split the remainder."* The checklist is real and it is made of these eight
 * families — the ones where the deduction is an operation on letters or sounds
 * and is therefore identical every time you meet it. `compound` is
 * deliberately NOT among them: it is a template by label form and a fresh
 * search of English by content (see `LETTER_MECHANIC_FAMILIES` in
 * lib/wordweb-ladder.ts for the full argument, and `qualityOf` for the ruling
 * this repository already made about it).
 *
 * Kept as its own list rather than derived from `WALLPAPER_FAMILIES` because
 * the two answer different questions: that one asks "is this trick wallpaper
 * across the shelf", this one asks "is this board two letter puzzles in a
 * trench coat". The review's first live board carried TWO `Contains` groups.
 */
const LETTER_MECHANIC_FAMILY: readonly Family[] = [
  'rhyme', 'contains', 'silent', 'letter-swap',
  'hidden', 'homophone', 'anagram', 'letter-shape',
];

function isLetterMechanicTheme(rawTheme: string): boolean {
  return LETTER_MECHANIC_FAMILY.includes(familyOf(rawTheme));
}

function letterMechanicCount(groups: readonly { theme: string }[]): number {
  return groups.filter((g) => isLetterMechanicTheme(g.theme)).length;
}

/**
 * ROUND 14 — ONE LABEL PER MECHANIC.
 *
 * `Things That Can Be Big` (TOP / DIPPER / LEAGUE / PICTURE) and `BIG ___` are
 * the same category wearing two label formats, and the shelf shipped both. The
 * "Things That Can Be" form is also the mushier of the two — a circus big top
 * cannot *be* big, it is a BIG TOP — and, worse, it typed as SEMANTIC, so the
 * composer counted 64 of the shelf's best compound categories as plain English
 * and ate them to reach a wordplay floor they already satisfied.
 *
 * The modifiers below are the ones whose compound reading is the category:
 * `FLAT ___` is FLAT TIRE / FLAT NOTE / FLAT SODA / FLAT DENIAL. Deliberately
 * NOT here: the past participles (`Caught`, `Thrown`, `Stirred`, `Beaten`…),
 * where the thread is "you can VERB this" — a meaning relation, not a compound
 * — and which stay semantic and stay labelled as they were written.
 */
const COMPOUND_MODIFIERS = new Set([
  'Iron', 'Flat', 'Sharp', 'Royal', 'Fresh', 'Sweet', 'Silver', 'Hard',
  'Loose', 'Golden', 'Open', 'Big', 'Bitter', 'Blue', 'Wild', 'Sticky',
  'Tough', 'Rich', 'Crisp', 'Brass', 'Vintage', 'Salty', 'Overdue',
]);

/** `Things That Can Be Flat` → `FLAT ___`. Idempotent; everything else passes. */
function normaliseTheme(rawTheme: string): string {
  const m = canon(rawTheme).match(/^Things That Can Be [“"]?([A-Za-z]+)[”"]?$/);
  if (m && COMPOUND_MODIFIERS.has(m[1]!)) return `${m[1]!.toUpperCase()} ___`;
  return rawTheme;
}

/**
 * ROUND 14 (AAA 2.12) — HOW LOUD A CATEGORY IS ON THE TILES.
 *
 * 2.12 asks that the easiest group be found first on ≥70% of boards, and the
 * round-13 shelf inverted it on a quarter of the top slot: 8 PURPLE groups were
 * bare prefix/suffix sorts — web-22's `Contains "CAR"` was CARGO, CARTON,
 * CARPET, CARNIVAL. Four words that all *start* with CAR is the first thing any
 * eye finds on a 16-tile grid; it will be solved first on ~100% of boards,
 * which inverts the criterion rather than missing it by a margin.
 *
 *   3 = the token sits at the same place in all four words (a sort, not a
 *       deduction) — may only ship at yellow or green.
 *   2 = a token you can see but have to hunt for.
 *   1 = a thread you have to hear, unscramble or know.
 */
const VISIBILITY_LOUD = 3;

function visibilityOf(rawTheme: string, words: readonly string[]): number {
  const theme = canon(rawTheme);
  const m = theme.match(/^Contains "([A-Z]+)"$/);
  if (!m) return familyOf(theme) === 'contains' ? 2 : 1;
  const tok = m[1]!;
  const at = words.map((w) => w.indexOf(tok));
  if (at.some((i) => i < 0)) return 2;
  if (words.every((w) => w.startsWith(tok))) return VISIBILITY_LOUD;
  if (words.every((w) => w.endsWith(tok))) return VISIBILITY_LOUD;
  if (new Set(at).size === 1) return VISIBILITY_LOUD;
  return 2;
}

/**
 * ROUND 14 — THE COMPOSER EATS THE GOOD CATEGORIES, NOT JUST THE WALLPAPER.
 *
 * Only 70.8% of authored groups survived into the round-13 pool, and the
 * victims were chosen by COLOUR SLOT, not by quality: web-1 lost
 * `Things That Can Be "Iron"` (FIST/WILL/CURTAIN/MAN) and `___ BAR`
 * (CANDY/SALAD/SPACE/CROW) — two of the best categories in the authored file —
 * for two instances of the same letter-addition mechanic on one board. Nine
 * more boards lost `Things That Roll`, `Things That Stick`, `Things That Pop`
 * and their siblings the same way, to satisfy the wordplay FLOOR rather than
 * the trivia cap.
 *
 *   3 PROTECTED — a compound or second-meaning category (`___ BAR`,
 *     `IRON ___`, `Can Follow "EYE"`). These ARE wordplay under 2.9's own
 *     definition, so the answer is to type them as wordplay, never to replace
 *     them. Never a victim, at any tier.
 *   2 GOOD — a property category (`Things That Roll`): the words have to be
 *     tested against a verb rather than looked up in a list.
 *   1 LOOSE — a plain taxonomy (`Basketball Terms`, `Vegetables`): the kind of
 *     category the bank can genuinely improve on.
 *
 * A board that can only reach its intended tier by eating a PROTECTED category
 * does not reach it: `replaceGroups` returns null and the caller composes it
 * one tier down, where its own categories survive. web-1 shipped as four
 * letter-puzzles at tier 3 for exactly this reason; it is a tier-2 board.
 */
const QUALITY_PROTECTED = 3;

function qualityOf(rawTheme: string): number {
  const theme = canon(rawTheme);
  if (familyOf(theme) === 'compound') return QUALITY_PROTECTED;
  if (/^Things (That|You) /.test(theme)) return 2;
  /**
   * ROUND 17 — A CATEGORY ABOUT THIS BUILDING IS WORTH AS MUCH AS A PROPERTY
   * CATEGORY, AND THIS LINE IS WHY THE FIRST MANOR BATCH VANISHED.
   *
   * `The Manor Staff` and `Things a Housekeeper Counts` are plain taxonomies
   * by shape, so they scored 1 — LOOSE, the composer's first-choice victim,
   * "the kind of category the bank can genuinely improve on". They were drawn
   * three times each like every other pool and then eaten to meet a wordplay
   * floor, and five of fourteen survived onto a hundred and fifty-five boards.
   * The bank cannot improve on them: what they carry is not taxonomic quality
   * but the only thing sixteen words on a page cannot otherwise have, which is
   * a reason to be THESE sixteen words. They are still evictable — they are
   * not `QUALITY_PROTECTED` — the composer simply reaches past them first.
   */
  if (MANOR_THEMES.has(theme)) return 2;
  return 1;
}

function isProtectedTheme(rawTheme: string): boolean {
  return qualityOf(rawTheme) === QUALITY_PROTECTED;
}

/**
 * ROUND 14 — WHAT `minPlain` IS ACTUALLY COUNTING.
 *
 * The round-10 floor exists so that "a board of four letter-puzzles has no way
 * in for a player who does not already see the trick", and it counted
 * `semantic + trivia` because those were the only two types. A COMPOUND
 * category is the third: `___ BAR` and `IRON ___` are read in English and
 * solved by thinking of phrases, not by looking at letters. 2.9 counts them as
 * wordplay (they are solvable from the tiles without outside knowledge) and the
 * way-in floor counts them as plain, and both are true of the same category —
 * which is precisely why they are the ones the composer must never eat.
 */
function isPlainish(rawTheme: string): boolean {
  return typeOfTheme(rawTheme) !== 'wordplay' || familyOf(rawTheme) === 'compound';
}

function plainCount(groups: readonly { theme: string }[]): number {
  return groups.filter((g) => isPlainish(g.theme)).length;
}

// ---------------------------------------------------------------------------
// Wordplay replacement bank — swapped in where a board falls short of the
// 2.9 floor (≥2 wordplay) or over the trivia cap. All verifiable on the tiles.
// ---------------------------------------------------------------------------

/**
 * ROUND 11 — A BANK GROUP IS A POOL, NOT A HAND.
 *
 * `words` used to be the four tiles the theme shipped, and `BANK_REUSE_CAP`
 * let four boards take the same four. That is exactly what the pool measured:
 * the 51 legacy boards carried 204 group instances built from only 126
 * distinct word-sets, with CALM/SALMON/WOULD/YOLK ("Silent L") on four
 * separate nights and BALLOON/COFFEE/RACCOON/SUCCESS on four more — the same
 * four tiles, four times, to a player who visits the Library daily. (The 112
 * newer boards were clean only because the bank was already exhausted by the
 * time the generator reached them, which is luck, not a rule.)
 *
 * Every group is a pool of 6–8 verified members now, and each use draws a
 * DISTINCT four from it (`bankDraws`). `usedSets` is global and seeded with
 * every authored set, so no 4-word set can ship twice from any source; the
 * validator fails the build if one does.
 */
interface BankGroup { theme: string; words: string[] }

const WORDPLAY_BANK: BankGroup[] = [
  { theme: 'Contains "TEN"', words: ['OFTEN', 'KITTEN', 'TENDER', 'EXTEND', 'LISTEN', 'INTEND', 'MITTEN', 'TENSION'] },
  { theme: 'Contains "CAR"', words: ['SCARF', 'SCARCE', 'CARGO', 'CARTON', 'CARPET', 'CARNIVAL', 'POSTCARD', 'SCARLET'] },
  { theme: 'Contains "PEA"', words: ['SPEAK', 'PEACH', 'REPEAT', 'APPEAR', 'PEANUT', 'PEASANT', 'PEACEFUL', 'SPEARMINT'] },
  { theme: 'Contains "WIN"', words: ['WINDOW', 'TWINE', 'WINTER', 'WINCE', 'WINDMILL', 'REWIND', 'TWINKLE', 'WINGSPAN'] },
  { theme: 'Contains "APE"', words: ['GRAPE', 'PAPER', 'ESCAPE', 'SHAPE', 'LANDSCAPE', 'DRAPERY', 'TAPESTRY', 'CAPER'] },
  { theme: 'Contains "RAT"', words: ['PIRATE', 'CRATER', 'SCRATCH', 'OPERATE', 'GRATEFUL', 'STRATEGY', 'DECORATE', 'SEPARATE'] },
  { theme: 'Silent First Letters', words: ['KNIGHT', 'WRIST', 'GNOME', 'PSALM', 'KNUCKLE', 'GNARL', 'HONEST', 'HOUR'] },
  { theme: 'Anagrams of "LISTEN"', words: ['SILENT', 'ENLIST', 'TINSEL', 'INLETS'] },
  { theme: 'Rhymes with "SNOW"', words: ['THOUGH', 'PLATEAU', 'BESTOW', 'AGLOW', 'ALTHOUGH', 'THROW', 'GLOW', 'ESCROW'] },
  { theme: 'Rhymes with "BLUE"', words: ['THROUGH', 'CANOE', 'ADIEU', 'DEBUT', 'SHAMPOO', 'BAMBOO', 'RENEW', 'PURSUE'] },
  { theme: '___ FIRE', words: ['CAMP', 'CROSS', 'CEASE', 'WILD', 'BACK', 'BUSH', 'SPIT', 'MIS'] },
  { theme: '___ FALL', words: ['WATER', 'NIGHT', 'RAIN', 'FOOT', 'WIND', 'SNOW', 'PIT', 'DOWN'] },
  { theme: 'Can Precede "KEEPER"', words: ['BEE', 'BOOK', 'GATE', 'GOAL', 'HOUSE', 'SHOP', 'PEACE', 'SCORE'] },
  { theme: 'Can Follow "EYE"', words: ['BALL', 'BROW', 'LASH', 'SHADOW', 'SIGHT', 'WITNESS', 'PIECE', 'GLASS'] },
  { theme: 'Can Precede "STICK"', words: ['CANDLE', 'CHOP', 'YARD', 'LIP', 'DRUM', 'MATCH', 'BROOM', 'JOY'] },
  { theme: 'Can Follow "RAIN"', words: ['BOW', 'COAT', 'DROP', 'FOREST', 'FALL', 'WATER', 'STORM', 'CHECK'] },
  // ROUND 9 (safety sweep): BULLET left this group — the compound reads as
  // armour, but the TILE reads as ammunition and the Library sets it in Fell
  // caps. SHATTER and TAMPER are the same shape of word without the weapon.
  { theme: '___ PROOF', words: ['SHATTER', 'WEATHER', 'FOOL', 'CHILD', 'WATER', 'SOUND', 'FIRE', 'RUST'] },
  { theme: 'Two Pairs of Double Letters', words: ['BALLOON', 'COFFEE', 'SUCCESS', 'RACCOON', 'ADDRESS', 'MATTRESS', 'HAPPINESS', 'BOOKKEEPER'] },
  { theme: 'Starts and Ends with the Same Letter', words: ['EDGE', 'TREAT', 'NYLON', 'KIOSK', 'TROUT', 'SALADS', 'MUSEUM', 'TWILIGHT'] },
  { theme: 'Hidden Body Parts', words: ['CHARMING', 'SHIPMENT', 'FEARLESS', 'RIBBON', 'SHINGLE', 'SCALPEL', 'PALMISTRY', 'FLIPPER'] },
  { theme: 'Hidden Animals', words: ['SCOWL', 'SPIGOT', 'CATALOG', 'DOGMA', 'CROWD', 'BEETLE', 'HENCE', 'GOATEE'] },
  { theme: '___ SMITH', words: ['BLACK', 'LOCK', 'GOLD', 'WORD', 'TIN', 'SILVER', 'ARROW', 'TUNE'] },
  { theme: 'Can Follow "HAND"', words: ['SHAKE', 'BOOK', 'WRITING', 'CUFF', 'BAG', 'MADE', 'RAIL', 'SOME'] },
  { theme: 'Can Precede "LIGHT"', words: ['DAY', 'MOON', 'CANDLE', 'LAMP', 'SUN', 'STAR', 'FLASH', 'HIGH'] },
  { theme: 'Rhymes with "MOON"', words: ['TUNE', 'DUNE', 'PRUNE', 'STREWN', 'LAGOON', 'BALLOON', 'CARTOON', 'MONSOON'] },
  { theme: 'Rhymes with "EIGHT"', words: ['WEIGHT', 'FREIGHT', 'STRAIGHT', 'AWAIT', 'DEBATE', 'ESTATE', 'ORNATE', 'SKATE'] },
  { theme: 'Rhymes with "CHAIR"', words: ['THEIR', 'WHERE', 'FLAIR', 'BEWARE', 'AFFAIR', 'DECLARE', 'PREPARE', 'SOLITAIRE'] },
  { theme: 'Anagrams of "TRACE"', words: ['CRATE', 'REACT', 'CATER', 'CARET'] },
  { theme: 'Anagrams of "PALEST"', words: ['PLATES', 'STAPLE', 'PETALS', 'PLEATS', 'PASTEL'] },
  { theme: 'Anagrams of "SPARE"', words: ['PEARS', 'REAPS', 'PARSE', 'SPEAR', 'PARES'] },
  { theme: 'Silent "B"', words: ['CLIMB', 'THUMB', 'SUBTLE', 'DOUBT', 'LAMB', 'COMB', 'CRUMB', 'PLUMBER'] },
  { theme: 'Silent "L"', words: ['CALM', 'WOULD', 'SALMON', 'YOLK', 'PALM', 'HALF', 'CHALK', 'FOLK'] },
  { theme: 'Silent "W"', words: ['WRENCH', 'ANSWER', 'WRINKLE', 'AWRY', 'WRIST', 'WRAP', 'SWORD', 'WREATH'] },
  { theme: 'Silent Letters at the End', words: ['COMB', 'LAMB', 'HYMN', 'COLUMN', 'AUTUMN', 'THUMB', 'CRUMB', 'SOLEMN'] },
  { theme: 'Hidden Numbers', words: ['CANINE', 'OFTEN', 'HONEST', 'STONEWARE', 'ATONE', 'KITTEN', 'FEMININE', 'MONEY'] },
  { theme: 'Rhymes with "TREE"', words: ['KEY', 'QUAY', 'DEBRIS', 'FLEA', 'AGREE', 'DEGREE', 'MARQUEE', 'DECREE'] },
  { theme: 'Silent "H"', words: ['GHOST', 'RHYME', 'WHISTLE', 'SCHEME', 'HONEST', 'HOUR', 'RHUBARB', 'GHERKIN'] },
  { theme: 'Anagrams of "NOTES"', words: ['STONE', 'TONES', 'ONSET', 'STENO'] },
  { theme: 'Contains "ONE"', words: ['ATONE', 'PHONE', 'ZONE', 'CLONE', 'HONEY', 'MONEY', 'STONE', 'THRONE'] },
  { theme: 'Contains "ART"', words: ['PARTY', 'CHART', 'SMART', 'DEPART', 'QUARTER', 'ARTIST', 'CARTOON', 'PARTNER'] },
  { theme: 'Contains "AGE"', words: ['MANAGE', 'VILLAGE', 'PACKAGE', 'VOYAGE', 'LUGGAGE', 'COTTAGE', 'MESSAGE', 'GARAGE'] },
  { theme: 'Contains "EAR"', words: ['HEART', 'SEARCH', 'PEARL', 'YEARN', 'LEARNED', 'CLEARING', 'RESEARCH', 'APPEAR'] },
  { theme: 'Contains "ICE"', words: ['SLICE', 'PRICE', 'NOTICE', 'SPICE', 'JUICE', 'SERVICE', 'PRACTICE', 'OFFICER'] },
  { theme: 'Contains "AIR"', words: ['CHAIR', 'STAIR', 'REPAIR', 'AFFAIR', 'FAIRY', 'PRAIRIE', 'DAIRY', 'ECLAIR'] },
  { theme: '___ HOUSE', words: ['LIGHT', 'GREEN', 'FARM', 'TREE', 'WARE', 'BOAT', 'DOLL', 'HEN'] },
  { theme: '___ BOARD', words: ['KEYS', 'CARD', 'SURF', 'DASH', 'CHALK', 'SKATE', 'BILL', 'SIGN'] },
  { theme: '___ STORM', words: ['BRAIN', 'SAND', 'SNOW', 'THUNDER', 'HAIL', 'RAIN', 'DUST', 'FIRE'] },
  { theme: 'Can Precede "BERRY"', words: ['BLUE', 'STRAW', 'RASP', 'ELDER', 'BLACK', 'GOOSE', 'HACK', 'DEW'] },
  { theme: 'Can Follow "SUN"', words: ['FLOWER', 'SHINE', 'RISE', 'BEAM', 'SET', 'DIAL', 'LIGHT', 'BURST'] },
  { theme: 'Can Precede "WORK"', words: ['HOME', 'NET', 'FRAME', 'CLOCK', 'PATCH', 'TEAM', 'HAND', 'FIRE'] },
  { theme: 'Contains "OWN"', words: ['BROWN', 'CROWN', 'DOWNY', 'FROWN', 'TOWNS', 'GOWNS', 'CLOWN', 'KNOWN'] },
  { theme: 'Contains "AND"', words: ['GARLAND', 'ISLAND', 'SANDAL', 'MEANDER', 'CANDLE', 'HANDLE', 'BANDAGE', 'GRANDEUR'] },
  { theme: 'Contains "OLD"', words: ['GOLDEN', 'BOLDER', 'HOLDER', 'SOLDER', 'COLDEST', 'FOLDER', 'SCOLDED', 'MOLDING'] },
  { theme: 'Contains "TEA"', words: ['STEAM', 'INSTEAD', 'TEAPOT', 'STEADY', 'TEACHER', 'STEALTH', 'PLATEAU', 'TEASPOON'] },
  { theme: 'Contains "ROW"', words: ['ARROW', 'BURROW', 'SPARROW', 'THROW', 'BROWSE', 'CROWD', 'GROWTH', 'NARROW'] },
  { theme: 'Contains "AME"', words: ['FLAME', 'BLAME', 'SESAME', 'CARAMEL', 'GAMES', 'NAMELESS', 'FRAMEWORK', 'CAMEL'] },
  { theme: 'Contains "ARM"', words: ['HARMONY', 'CHARMED', 'GARMENT', 'ALARM', 'FARMER', 'WARMTH', 'MARMALADE', 'CHARMING'] },
  { theme: 'Contains "ILL"', words: ['WILLOW', 'MILLER', 'THRILL', 'CHILLY', 'VILLAGE', 'PILLOW', 'BRILLIANT', 'VANILLA'] },
  { theme: '___ WOOD', words: ['DRIFT', 'PLY', 'ROSE', 'TEAK', 'FIRE', 'HARD', 'SANDAL', 'BASS'] },
  { theme: '___ MARK', words: ['LAND', 'BENCH', 'TRADE', 'CHECK', 'BOOK', 'POST', 'EAR', 'HALL'] },
  { theme: 'Palindromes', words: ['LEVEL', 'RADAR', 'KAYAK', 'ROTOR', 'CIVIC', 'REFER', 'MADAM', 'TENET'] },
  { theme: 'Semordnilaps', words: ['DRAWER', 'STOPS', 'DIAPER', 'DEVIL', 'SLEEK', 'STRAW', 'DESSERTS', 'KNITS'] },
  { theme: 'Onomatopoeia', words: ['SIZZLE', 'RUSTLE', 'CLATTER', 'MURMUR', 'WHISPER', 'CRACKLE', 'JINGLE', 'PATTER'] },
  { theme: 'Portmanteau Words', words: ['BRUNCH', 'SMOG', 'MOTEL', 'MOPED', 'CHORTLE', 'SITCOM', 'TELETHON', 'CAMCORDER'] },
  { theme: 'Heteronyms', words: ['MINUTE', 'DESERT', 'WIND', 'REFUSE', 'PRESENT', 'CONTENT', 'OBJECT', 'SEPARATE'] },
  { theme: 'Contronyms (Own Opposite)', words: ['DUST', 'CLEAVE', 'SANCTION', 'OVERSIGHT', 'SCREEN', 'TRIM', 'BOLT', 'WEATHER'] },
  { theme: 'Silent "K"', words: ['KNEE', 'KNOT', 'KNACK', 'KNUCKLE', 'KNEAD', 'KNOWLEDGE', 'KNITTING', 'KNAPSACK'] },
  { theme: 'Silent "G"', words: ['SIGN', 'DESIGN', 'CAMPAIGN', 'FOREIGN', 'REIGN', 'ASSIGN', 'CHAMPAGNE', 'GNOME'] },
  { theme: 'Silent "T"', words: ['CASTLE', 'LISTEN', 'FASTEN', 'WHISTLE', 'BUSTLE', 'THISTLE', 'GLISTEN', 'RUSTLE'] },
  { theme: 'Silent "P"', words: ['RECEIPT', 'CUPBOARD', 'RASPBERRY', 'CORPS', 'PSALM', 'PNEUMATIC', 'PTARMIGAN', 'PSEUDONYM'] },
  { theme: 'Silent "D"', words: ['HANDKERCHIEF', 'HANDSOME', 'SANDWICH', 'HEDGEHOG', 'BADGER', 'LODGER', 'GRUDGE', 'PLEDGE'] },
  { theme: 'Silent "C"', words: ['SCISSORS', 'SCENE', 'MUSCLE', 'SCENT', 'SCEPTRE', 'ASCEND', 'DESCEND', 'SCYTHE'] },
  { theme: 'Silent "U"', words: ['GUARD', 'GUEST', 'BUILD', 'TONGUE', 'GUITAR', 'GUILTY', 'BISCUIT', 'COLLEAGUE'] },
  { theme: 'Homophones of Numbers', words: ['WON', 'ATE', 'TOO', 'FORE'] },
  { theme: 'Homophones of Animals', words: ['BARE', 'HAIR', 'FLEE', 'DEAR', 'MOOSE', 'EWE', 'DOE', 'LYNX'] },
  { theme: 'Homophones of Trees', words: ['FUR', 'BEACH', 'PAIR', 'YEW', 'PINE', 'ELM', 'ASH', 'BIRCH'] },
  { theme: 'Homophones of Musical Notes', words: ['DOUGH', 'RAY', 'SEW', 'TEA', 'FAR', 'ME', 'DOE'] },
  { theme: 'Add an "S" for a New Word', words: ['CARE', 'TONE', 'PARK', 'HOP', 'TAKE', 'PIN', 'MILE', 'COLD'] },
  { theme: 'Add a "T" for a New Word', words: ['RAIN', 'HERE', 'RUST', 'RIP', 'READ', 'ROUT', 'ROLL', 'HEIR'] },
  { theme: 'Add a "B" for a New Word', words: ['RIGHT', 'LAND', 'READ', 'LUSH', 'RUSH', 'LAZE', 'RIDGE', 'LOOM'] },
  { theme: 'Add a "C" for a New Word', words: ['HARM', 'RUST', 'LOVER', 'RATE', 'LAMP', 'RAFT', 'OVER', 'HEST'] },
  { theme: 'Add a "W" for a New Word', words: ['HEAT', 'RING', 'RITE', 'HALE', 'RECK', 'RAP', 'ITCH', 'AGES'] },
  { theme: 'Add a "P" for a New Word', words: ['LANE', 'RIDE', 'LUMP', 'EACH', 'LATE', 'RIME', 'ANTS', 'LOUGH'] },
  /**
   * ROUND 17 — three more rhyme families, from the same pool-count argument as
   * the six letters below. Every member is verified against the vendored CMU
   * pronouncing dictionary, so the categories are true by SOUND and
   * deliberately not by spelling (BRAIN with PLANE, CROWN with NOUN).
   */
  { theme: 'Rhymes with "CHAIN"', words: ['BRAIN', 'TRAIN', 'PLAIN', 'CRANE', 'LANE', 'GAIN', 'MAIN', 'CANE'] },
  { theme: 'Rhymes with "CROWN"', words: ['TOWN', 'BROWN', 'CLOWN', 'GOWN', 'NOUN', 'DOWN', 'FROWN', 'RENOWN'] },
  { theme: 'Rhymes with "WHEEL"', words: ['SEAL', 'MEAL', 'PEEL', 'HEEL', 'REEL', 'DEAL', 'EEL', 'ZEAL'] },
  /**
   * ROUND 17 — SIX MORE LETTERS, AND THE REASON IS A POOL COUNT.
   *
   * The shelf's binding resource is not category quality, it is bank SUPPLY:
   * `BANK_REUSE_CAP` lets each theme onto three boards, so a pool of N themes
   * can furnish 3N of them, and seventy-four boards left the round-16 shelf
   * with "no replacement for over-cap theme". Sixteen of those name an
   * add-a-letter theme. Every base word below is a familiar, cozy-gated word
   * that becomes another word when the letter is inserted somewhere — checked
   * against the shipped dictionary, which is the same check `labelSatisfiedBy`
   * makes of them at build time.
   */
  { theme: 'Add an "F" for a New Word', words: ['USED', 'RIGHT', 'LIGHT', 'EAST', 'ABLE', 'EVER', 'ACTION', 'LOWER'] },
  { theme: 'Add an "I" for a New Word', words: ['MOST', 'WATER', 'RATE', 'POST', 'MORE', 'PLACE'] },
  { theme: 'Add a "K" for a New Word', words: ['MONEY', 'NIGHT', 'PLAN', 'STAR', 'THAN', 'SPAR'] },
  { theme: 'Add an "N" for a New Word', words: ['HAVE', 'LIKE', 'PRICE', 'YEAR', 'LINE', 'TAKE', 'AREA', 'THIS'] },
  { theme: 'Add a "U" for a New Word', words: ['SITE', 'STATE', 'CASE', 'FORM', 'SAVE', 'ACTION', 'BOND'] },
  { theme: 'Add a "Y" for a New Word', words: ['HOME', 'NEWS', 'PRICE', 'HEALTH', 'READ', 'NEED', 'PART', 'FULL'] },
  { theme: 'Drop the First Letter for a New Word', words: ['BRAIN', 'CHAIR', 'STONE', 'PLACE', 'SPARK', 'CLOVE', 'TRAIL', 'BREED'] },
  { theme: 'Drop the Last Letter for a New Word', words: ['HEARTH', 'PLANET', 'STARE', 'CLOVER', 'CARTON', 'BRANDY', 'SHEEP', 'GRAPES'] },
  /**
   * ROUND 12 — "HIDDEN X" MEANS HIDDEN (AAA 2.9 [BEAT], and the tone gate).
   *
   * Two defects lived in these six pools and both shipped.
   *
   *   1. MIDGET carried MIDGE here, and web-44 set it in Fell caps on a tile.
   *      It is a slur for people with dwarfism; it passed only because
   *      TONE_WORDS had no entry for it. Gated now (content/generate-gate.ts),
   *      and `assertBankIsClean()` below lints the POOLS at build time so the
   *      next one cannot enter the same way — until round 12 the gate ran on
   *      composed boards only, so a pool member the composer never happened to
   *      draw was never read by anything.
   *   2. Half of three shipped boards falsified their own category: web-28's
   *      "Hidden Vegetables" printed LEEKS and PEASE, web-46's "Hidden Musical
   *      Instruments" printed LUTES and TUBAS, web-43's "Hidden Birds" printed
   *      CRANES. Those are the noun with a plural on it — the vegetable is not
   *      hidden inside anything, it IS the tile. A board that teaches "the bird
   *      is concealed" in one half and "the bird is printed" in the other is
   *      the exact fairness complaint Connections gets and this generator
   *      exists to fix. Every bare inflection is gone (YAMS, LEEKS, PEASE,
   *      OKRAS, LUTES, PIANOS, TUBAS, MELONS, CRANES, SWALLOWED, DATED), and
   *      `assertBankIsClean()` fails the build on the next one.
   *
   * The same pass caught two members that hid NOTHING — CHERISH (no fruit in
   * it; the author meant CHERRY, which it does not contain) and THREAD (no
   * THREE) — because the lint now requires a carrier to actually contain its
   * token. Carriers are chosen so a drawn hand names four DIFFERENT things.
   */
  { theme: 'Hidden Insects', words: ['ANTLER', 'BEETROOT', 'MOTHER', 'PLANTAIN', 'CANTALOUPE', 'TICKET', 'WASPISH', 'STAGNATE'] },
  { theme: 'Hidden Trees', words: ['PINEAPPLE', 'ASHAMED', 'FIRST', 'HELMET', 'PALMISTRY', 'OAKUM', 'STEAK', 'SPINELESS'] },
  { theme: 'Hidden Birds', words: ['CROWD', 'LANTERN', 'HENCE', 'GULLIBLE', 'ROOKIE', 'BOWLING', 'WRENCH', 'HAWKER'] },
  { theme: 'Hidden Fruits', words: ['PLUMBER', 'FIGURE', 'MANDATE', 'PEARL', 'LIMEADE', 'GRAPEVINE', 'LEMONADE', 'IMPEACH'] },
  { theme: 'Hidden Vegetables', words: ['PEASANT', 'CORNER', 'BEETLE', 'KALEIDOSCOPE', 'SLEEK', 'ORCHARD', 'CARIBBEAN', 'ARCHIVE'] },
  { theme: 'Hidden Musical Instruments', words: ['ORGANIC', 'HARPOON', 'VIOLATED', 'CELLOPHANE', 'CONUNDRUM', 'ABSOLUTE', 'EMBASSY', 'THORNY'] },
  { theme: 'Rhymes with "LIGHT"', words: ['WRITE', 'HEIGHT', 'POLITE', 'TONIGHT', 'DELIGHT', 'INVITE', 'IGNITE', 'RECITE'] },
  { theme: 'Rhymes with "DAY"', words: ['BOUQUET', 'CROCHET', 'BALLET', 'CABARET', 'CHALET', 'OBEY', 'BETRAY', 'DISPLAY'] },
  { theme: 'Rhymes with "MOOD"', words: ['BREWED', 'SHREWD', 'PRUDE', 'CHEWED', 'INCLUDE', 'PURSUED', 'RENEWED', 'CRUDE'] },
  { theme: 'Rhymes with "TIME"', words: ['CLIMB', 'MIME', 'CHIME', 'SUBLIME', 'GRIME', 'PRIME', 'SLIME', 'RHYME'] },
  { theme: 'Rhymes with "STAR"', words: ['BIZARRE', 'GUITAR', 'AJAR', 'CIGAR', 'BAZAAR', 'AFAR', 'SITAR', 'SPAR'] },
  { theme: 'Rhymes with "SPEAK"', words: ['ANTIQUE', 'UNIQUE', 'CRITIQUE', 'BOUTIQUE', 'OBLIQUE', 'MYSTIQUE', 'PHYSIQUE', 'TECHNIQUE'] },
  { theme: 'Rhymes with "BREAD"', words: ['THREAD', 'SAID', 'INSTEAD', 'AHEAD', 'SPREAD', 'TREAD', 'MISLED', 'WIDESPREAD'] },
  { theme: 'Rhymes with "LAUGH"', words: ['GIRAFFE', 'GRAPH', 'CARAFE', 'STAFF', 'CALF', 'HALF', 'BEHALF', 'CHAFF'] },
  { theme: 'Rhymes with "ROSE"', words: ['DOZE', 'THOSE', 'GLOWS', 'PROSE', 'SUPPOSE', 'COMPOSE', 'OPPOSE', 'TOES'] },
  { theme: '___ CAKE', words: ['PAN', 'CUP', 'CHEESE', 'SHORT', 'OAT', 'FRUIT', 'SPONGE', 'CARROT'] },
  { theme: '___ BOX', words: ['MAIL', 'SAND', 'TOOL', 'JUKE', 'MATCH', 'SHOE', 'ICE', 'WINDOW'] },
  { theme: '___ CASE', words: ['BRIEF', 'SUIT', 'STAIR', 'BOOK', 'SHOW', 'PILLOW', 'PENCIL', 'NUT'] },
  { theme: '___ HORSE', words: ['SEA', 'RACE', 'CART', 'HOBBY', 'WORK', 'CLOTHES', 'ROCKING', 'PACK'] },
  { theme: '___ PAPER', words: ['NEWS', 'WALL', 'SAND', 'WRAPPING', 'NOTE', 'FLY', 'TISSUE', 'GRAPH'] },
  { theme: '___ POT', words: ['TEA', 'JACK', 'FLOWER', 'CROCK', 'STOCK', 'HOT', 'MELTING', 'CHIMNEY'] },
  { theme: '___ ROOM', words: ['BATH', 'MUSH', 'CLASS', 'BALL', 'REST', 'COURT', 'STORE', 'SHOW'] },
  { theme: '___ STONE', words: ['LIME', 'CORNER', 'KEY', 'MILE', 'BRIM', 'CURB', 'GRAVEL', 'FLAG'] },
  { theme: '___ WATER', words: ['RAIN', 'SALT', 'FRESH', 'UNDER', 'BREAK', 'DISH', 'TIDE', 'SEA'] },
  { theme: '___ BOAT', words: ['SAIL', 'ROW', 'GRAVY', 'LIFE', 'STEAM', 'HOUSE', 'FERRY', 'TUG'] },
  { theme: '___ BREAD', words: ['CORN', 'GINGER', 'SHORT', 'FLAT', 'SODA', 'SWEET', 'SPICE', 'WHEAT'] },
  { theme: '___ MILL', words: ['WIND', 'TREAD', 'SAW', 'PEPPER', 'WATER', 'RUN', 'GRIST', 'TEXTILE'] },
  { theme: '___ PIPE', words: ['BAG', 'DRAIN', 'WIND', 'TAIL', 'STOVE', 'PAN', 'STAND', 'BLOW'] },
  { theme: 'Can Follow "BOOK"', words: ['CASE', 'SHELF', 'MARK', 'WORM', 'KEEPER', 'BINDING', 'STORE', 'LET'] },
  { theme: 'Can Follow "SNOW"', words: ['FLAKE', 'DRIFT', 'BALL', 'MAN', 'STORM', 'SHOE', 'PLOUGH', 'FALL'] },
  { theme: 'Can Follow "FIRE"', words: ['PLACE', 'WOOD', 'FLY', 'WORKS', 'SIDE', 'LIGHT', 'GUARD', 'STORM'] },
  { theme: 'Can Follow "MOON"', words: ['LIGHT', 'BEAM', 'STONE', 'WALK', 'LIT', 'RISE', 'SHINE', 'FLOWER'] },
  { theme: 'Can Follow "TEA"', words: ['POT', 'SPOON', 'CUP', 'BAG', 'ROOM', 'TIME', 'HOUSE', 'CAKE'] },
  { theme: 'Can Precede "MAKER"', words: ['WATCH', 'HAT', 'MATCH', 'PEACE', 'SHOE', 'HOME', 'DRESS', 'TROUBLE'] },
  { theme: 'Can Precede "PRINT"', words: ['FOOT', 'FINGER', 'BLUE', 'NEWS', 'THUMB', 'IMPRINT', 'RE', 'PAW'] },

  /**
   * ROUND 12 — THIRTY MORE POOLS, BECAUSE THE CAP NEEDS SOMEWHERE TO GO.
   *
   * Making `BANK_REUSE_CAP` bind authored themes (see its docstring) turns
   * ~30 authored group instances into forced replacements, and the shelf owes
   * two wordplay categories per board and two SUBTLE ones at tier 3 on top of
   * that. With the round-11 bank the arithmetic did not close: the first run
   * under the cap dropped 22 boards — the whole newest batch, which is exactly
   * where the over-used themes were concentrated — not because those boards
   * were unfair but because nothing was left to give them. Deleting a round's
   * growth is not a fix for a round's padding.
   *
   * Two thirds of what follows is SUBTLE (rhyme / anagram / silent-letter /
   * hidden-word / add-a-letter), because that is the narrow shelf and the one
   * tier 3 draws on. Every member is verified against its own claim: the
   * rhymes rhyme, the anagrams are exact, the silent letters are silent, and
   * the hidden words are hidden rather than printed (`assertBankIsClean`).
   */
  { theme: 'Rhymes with "CHEESE"', words: ['FREEZE', 'SEIZE', 'TEASE', 'BREEZE', 'PLEASE', 'SQUEEZE', 'APPEASE', 'TRAPEZE'] },
  { theme: 'Rhymes with "GREEN"', words: ['SCENE', 'MACHINE', 'ROUTINE', 'SERENE', 'MARINE', 'CUISINE', 'CANTEEN', 'BETWEEN'] },
  { theme: 'Rhymes with "SMILE"', words: ['AISLE', 'PROFILE', 'EXILE', 'WHILE', 'TRIAL', 'DENIAL', 'STYLE', 'AWHILE'] },
  { theme: 'Rhymes with "CLOUD"', words: ['PROUD', 'ALOUD', 'CROWD', 'VOWED', 'PLOUGHED', 'ENDOWED', 'ALLOWED', 'BOWED'] },
  { theme: 'Rhymes with "FLOWER"', words: ['HOUR', 'SHOWER', 'POWER', 'TOWER', 'DEVOUR', 'SCOUR', 'GLOWER', 'COWER'] },
  { theme: 'Rhymes with "PURSE"', words: ['VERSE', 'WORSE', 'NURSE', 'REHEARSE', 'DIVERSE', 'TERSE', 'COERCE', 'IMMERSE'] },
  { theme: 'Rhymes with "MOUSE"', words: ['HOUSE', 'BLOUSE', 'GROUSE', 'SPOUSE', 'DOUSE', 'ROUSE', 'ESPOUSE'] },
  { theme: 'Rhymes with "BRUSH"', words: ['HUSH', 'CRUSH', 'LUSH', 'PLUSH', 'THRUSH', 'BLUSH', 'GUSH', 'SLUSH'] },
  { theme: 'Rhymes with "SHOWN"', words: ['ALONE', 'CYCLONE', 'POSTPONE', 'CHAPERONE', 'CONDONE', 'BACKBONE', 'MILESTONE', 'OZONE'] },
  { theme: 'Rhymes with "FRIEND"', words: ['ATTEND', 'EXTEND', 'DEPEND', 'SUSPEND', 'AMEND', 'ASCEND', 'COMMEND', 'TRANSCEND'] },
  { theme: 'Rhymes with "TABLE"', words: ['CABLE', 'STABLE', 'LABEL', 'FABLE', 'GABLE', 'ENABLE', 'UNSTABLE', 'SABLE'] },
  { theme: 'Silent "N"', words: ['AUTUMN', 'COLUMN', 'SOLEMN', 'HYMN', 'CONDEMN', 'LIMN'] },
  { theme: 'Silent "S"', words: ['ISLAND', 'AISLE', 'ISLE', 'DEBRIS', 'VISCOUNT', 'CHASSIS', 'RENDEZVOUS', 'BOURGEOIS'] },
  { theme: 'Anagrams of "STEAM"', words: ['MEATS', 'TEAMS', 'TAMES', 'MATES'] },
  { theme: 'Anagrams of "LEAST"', words: ['STEAL', 'SLATE', 'STALE', 'TALES', 'TEALS'] },
  { theme: 'Anagrams of "STARE"', words: ['RATES', 'TEARS', 'ASTER', 'TARES', 'RESAT'] },
  { theme: 'Anagrams of "PARTIES"', words: ['PIRATES', 'PASTIER', 'TRAIPSE', 'PIASTER'] },
  { theme: 'Add an "E" for a New Word', words: ['HUG', 'CUT', 'MAT', 'PIN', 'TAP', 'CAP', 'MAN', 'RAT'] },
  { theme: 'Add an "R" for a New Word', words: ['BEAD', 'BUSH', 'CASH', 'FEE', 'GOWN', 'PAY', 'TICK', 'BAND'] },
  { theme: 'Add an "L" for a New Word', words: ['BACK', 'FIGHT', 'PANT', 'CAPE', 'SIGHT', 'COVE', 'BEAK', 'PACE'] },
  { theme: 'Homophones of Weather Words', words: ['REIGN', 'REIN', 'HALE', 'MISSED', 'DUE'] },
  { theme: 'Hidden Colors', words: ['TANGERINE', 'REDUNDANT', 'MOROSE', 'PLUMMET', 'CRUSTY', 'CHAMBER', 'MARIGOLD', 'GREYHOUND'] },
  { theme: 'Hidden Weather', words: ['TRAINER', 'MISTAKE', 'REGALE', 'WINDOW', 'SUNDRY', 'FOGGY', 'SLICE', 'DEWY'] },
  { theme: '___ SHIP', words: ['FRIEND', 'HARD', 'LEADER', 'PART', 'MEMBER', 'SPACE', 'TOWN', 'CHAMPION'] },
  { theme: '___ LINE', words: ['OUT', 'HEAD', 'TIME', 'COAST', 'PIPE', 'LIFE', 'GUIDE', 'SIDE'] },
  { theme: '___ BALL', words: ['FOOT', 'BASE', 'SNOW', 'EYE', 'MEAT', 'ODD', 'HAND', 'HAIR'] },
  { theme: '___ YARD', words: ['COURT', 'BACK', 'SHIP', 'DOCK', 'JUNK', 'FARM', 'VINE', 'BARN'] },
  { theme: '___ CLOTH', words: ['TABLE', 'WASH', 'LOIN', 'BROAD', 'DISH', 'SACK', 'OIL', 'CHEESE'] },
  { theme: '___ WORM', words: ['EARTH', 'BOOK', 'SILK', 'GLOW', 'TAPE', 'WOOD', 'RING', 'INCH'] },
  { theme: '___ CHAIR', words: ['ARM', 'HIGH', 'WHEEL', 'DECK', 'EASY', 'PUSH', 'LAWN', 'SEDAN'] },
  { theme: '___ POST', words: ['SIGN', 'LAMP', 'GATE', 'GOAL', 'MILE', 'BED', 'OUT', 'FENCE'] },
  { theme: '___ GLASS', words: ['HOUR', 'SPY', 'EYE', 'LOOKING', 'SUN', 'PLEXI', 'FIBRE', 'WINE'] },
  { theme: '___ CARD', words: ['POST', 'WILD', 'PLACE', 'FLASH', 'SCORE', 'CREDIT', 'BIRTHDAY', 'REPORT'] },
  { theme: 'Can Follow "TABLE"', words: ['CLOTH', 'SPOON', 'TOP', 'WARE', 'LAND', 'MAT', 'TALK', 'LEG'] },
  { theme: 'Can Follow "STAR"', words: ['FISH', 'LIGHT', 'GAZER', 'DUST', 'BOARD', 'LET', 'BURST', 'STRUCK'] },
  { theme: 'Can Precede "FLOWER"', words: ['SUN', 'WALL', 'MAY', 'WILD', 'BELL', 'CORN', 'ELDER', 'PASSION'] },

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ROUND 13 (REVIEW_AA §5.8) — THE VARIETY BATCH.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ARCHITECTURE_BUDGET's own docstring predicted this work and named its
   * size: *"Getting every family under 40% needs roughly forty more authored
   * pools in those five families, which is an AUTHORING task the generator
   * cannot do for itself."* This is that task. The five thin families —
   * anagram, homophone, letter-shape, hidden, letter-swap — supplied about 165
   * hands between them against a shelf that needs ~330 wordplay slots, so the
   * composer reached for `Contains "X"` and `Rhymes with "X"` not because they
   * are good but because they are infinite: English will hand you a fifth
   * carrier for any substring and a fifth rhyme for any sound, and it will not
   * hand you a fifth anagram of SPRITE.
   *
   * SIX OF THESE ARE MECHANICS THE SHELF HAS NEVER HAD, and they are the
   * direct answer to "eleven templates". `Words with All Five Vowels`,
   * `Letters in Alphabetical Order`, `Spelled Without a Vowel`, `Three Vowels
   * in a Row`, `The Same Letter Three Times` and `Made of a Repeated Syllable`
   * are not sentence frames with a token dropped in — there is no token, and
   * no twelfth template to learn. Each is provable on the tile with nothing
   * but the printed letters, which is what AAA 2.9 [BEAT] means by solvable
   * from the tiles, and none of them is visible on a first read, which is what
   * tier 3 means by subtle. Nobody looks at QUEUE / BEAUTY / AQUEOUS / PLATEAU
   * and sees three vowels in a row. They see four unrelated words, and then
   * they see it, and that second moment is the whole product.
   */

  /**
   * ROUND 18 — AND THEY ARE RE-ORDERED AND PART-RESTOCKED FOR THE SAME REASON
   * THE HOUSE POOLS WERE (see `assertManorCollides`).
   *
   * `tests/puzzles/wordweb-ladder.test.ts` asserts all six are on the shelf,
   * and it went red the moment the composer started choosing between equally
   * legal boards by contested tiles: `Letters in Alphabetical Order`, `Three
   * Vowels in a Row` and `Made of a Repeated Syllable` stopped shipping
   * entirely, because a pool no other category on a board can argue with loses
   * every tie. That is the same failure the house pools had and it has the
   * same answer — the members that make the mechanic true are also, where the
   * language allows it, words the rest of the bank is built out of: HILLY and
   * BILLOWY double an L, FLOOR and GEEGEE double the letter a rhyme family
   * doubles, TARTAR carries ART, the `-OUS` words are fifth members of each
   * other's neighbours. Round 17 widened these pools for the same reason and
   * hit the same ceiling from the other side; a pool is eight words wide
   * (`DRAW_PATTERNS` reaches index 7) so this is a re-choice, not a widening.
   *
   * The colliders sit at indices 1, 2 and 5 — a hitting set of the twelve draw
   * patterns — so every hand the pool can deal carries one.
   */
  // ── Six new shape mechanics ────────────────────────────────────────────
  { theme: 'Words with All Five Vowels', words: ['SEQUOIA', 'EDUCATION', 'DIALOGUE', 'EQUATION', 'FACETIOUS', 'MENDACIOUS', 'HOUSEMAID', 'TAMBOURINE'] },
  { theme: 'Letters in Alphabetical Order', words: ['ALMOST', 'HILLY', 'FLOOR', 'CHINTZ', 'EFFORT', 'BEEFY', 'KNOTTY', 'BILLOWY'] },
  // GYPSY is the obvious eighth member and is a slur for Romani people; GLYPH
  // is a better word anyway in a lexicographer's house.
  { theme: 'Spelled Without a Vowel', words: ['RHYTHM', 'MYTH', 'NYMPH', 'LYNX', 'SYLPH', 'GLYPH', 'TRYST', 'SHYLY'] },
  { theme: 'Three Vowels in a Row', words: ['QUEUE', 'AQUEOUS', 'GASEOUS', 'BEAUTY', 'MIAOW', 'NAUSEOUS', 'RADIOED', 'OBSEQUIOUS'] },
  { theme: 'The Same Letter Three Times', words: ['BANANA', 'ELEVEN', 'TATTOO', 'INDIVIDUAL', 'ENTERTAINMENT', 'DEFENDED', 'ASSESSED', 'SEVENTEEN'] },
  { theme: 'Made of a Repeated Syllable', words: ['MURMUR', 'TARTAR', 'COUSCOUS', 'CANCAN', 'BONBON', 'GEEGEE', 'DODO', 'POMPOM'] },

  // ── Anagram: the family English is stingiest with ──────────────────────
  // Only sets with four or more members BESIDES the anchor are usable, and
  // there are not many. These four are the richest the language offers at
  // familiar-word frequency.
  { theme: 'Anagrams of "SPOT"', words: ['POTS', 'TOPS', 'STOP', 'OPTS', 'POST'] },
  { theme: 'Anagrams of "SPRITE"', words: ['STRIPE', 'PRIEST', 'ESPRIT', 'RIPEST', 'TRIPES'] },
  { theme: 'Anagrams of "TRIANGLE"', words: ['INTEGRAL', 'ALTERING', 'ALERTING', 'RELATING'] },
  { theme: 'Anagrams of "PAINTERS"', words: ['PANTRIES', 'PERTAINS', 'REPAINTS', 'PINASTER'] },

  // ── Homophone: heard, never seen ───────────────────────────────────────
  { theme: 'Homophones of Letters', words: ['BEE', 'SEA', 'JAY', 'QUEUE', 'WHY', 'TEE', 'ARE', 'EX'] },
  { theme: 'Homophones of Countries', words: ['GREASE', 'CHILLY', 'WHALES', 'HUNGRY', 'ROAM', 'SOUL'] },
  { theme: 'Homophones of Fruit', words: ['PAIR', 'PARE', 'PLUMB', 'BURY', 'CURRENT'] },
  { theme: 'Homophones of Musical Instruments', words: ['LOOT', 'LIAR', 'VIAL', 'BASE'] },
  { theme: 'Homophones of Body Parts', words: ['WASTE', 'HEAL', 'NAVAL', 'MUSSEL', 'TOW'] },

  // ── Letter-swap: the operation you perform before the thread exists ────
  { theme: 'Add an "H" for a New Word', words: ['SOP', 'TIN', 'CAT', 'WERE', 'SORE', 'TREAD', 'TICK', 'COP'] },
  { theme: 'Add a "G" for a New Word', words: ['RAIN', 'LOVE', 'OLD', 'LEAN', 'RIM', 'ROAN', 'RAVE', 'LARE'] },
  { theme: 'Add an "M" for a New Word', words: ['ILK', 'OTHER', 'ASK', 'ICE', 'ARCH', 'EAT', 'ORE', 'ATE'] },
  { theme: 'Add a "D" for a New Word', words: ['EAR', 'RIFT', 'ONE', 'RAG', 'ROLL', 'OWN', 'RIP', 'ROVE'] },

  // ── Silent letters: the one silent pool the shelf kept running out of ──
  { theme: 'Silent "GH"', words: ['THOUGH', 'DAUGHTER', 'NEIGHBOUR', 'WEIGHT', 'HEIGHT', 'BOUGHT', 'DELIGHT', 'STRAIGHT'] },

  // ── Hidden: two more things to conceal ─────────────────────────────────
  { theme: 'Hidden Drinks', words: ['WHALE', 'ORIGIN', 'CRUMB', 'IMPORTANT', 'MEADOW', 'IMAGINE', 'DRUMMER', 'REPORTER'] },
  { theme: 'Hidden Tools', words: ['TRAWLER', 'SHAWL', 'PROFILE', 'PLANET', 'GRASP', 'WAXED', 'SERVICE', 'ADVICE'] },

  /**
   * ── Compound frames ───────────────────────────────────────────────────
   * The compound family carries the highest board share on the shelf and
   * that is a consequence of arithmetic rather than of taste: AAA 2.9 puts a
   * hard floor of two tiles-solvable categories on every board, the round-13
   * cap allows at most one letter puzzle below tier 3, so the second slot is a
   * compound on almost every board it can be. What matters, then, is that the
   * FRAME is never the same frame — the deduction is a search of English and
   * the search is only fresh if the phrase is. These take the shelf past
   * ninety distinct compound labels, which at three boards apiece is more than
   * the pool can spend.
   */
  { theme: '___ WORD', words: ['CROSS', 'PASS', 'BY', 'FORE', 'KEY', 'WATCH', 'BUZZ', 'CATCH'] },
  { theme: '___ PLATE', words: ['NAME', 'BOOK', 'HOT', 'COPPER', 'NUMBER', 'SIDE', 'FACE', 'BREAST'] },
  { theme: '___ LEAF', words: ['GOLD', 'TEA', 'FIG', 'LOOSE', 'FLY', 'OVER', 'CLOVER', 'BAY'] },
  { theme: '___ SCAPE', words: ['LAND', 'SEA', 'CITY', 'MOON', 'SOUND', 'DREAM', 'TOWN', 'ESCAPE'] },
  { theme: '___ CRAFT', words: ['AIR', 'WITCH', 'SPACE', 'HOVER', 'STAGE', 'WOOD', 'STATE', 'PRIEST'] },
  { theme: '___ HOLDER', words: ['CANDLE', 'PLACE', 'SHARE', 'PEN', 'CUP', 'TITLE', 'RECORD', 'STAKE'] },
  { theme: '___ BELL', words: ['BLUE', 'DOOR', 'HARE', 'COW', 'HAND', 'SLEIGH', 'BAR', 'SCHOOL'] },
  { theme: '___ STAND', words: ['BAND', 'GRAND', 'HAT', 'INK', 'KICK', 'NEWS', 'UMBRELLA', 'WITNESS'] },
  { theme: 'Can Follow "PAPER"', words: ['WEIGHT', 'BACK', 'CLIP', 'WORK', 'MILL', 'CHASE', 'THIN', 'TRAIL'] },
  { theme: 'Can Follow "INK"', words: ['WELL', 'POT', 'STAND', 'BLOT', 'JET', 'PAD', 'HORN', 'STONE'] },
  // Eight more frames, for margin. A composed board spends one compound and a
  // theme may only appear on three boards, so the compound shelf is what caps
  // the composed batch; at fifty-eight frames the shelf landed exactly on its
  // 150-board floor, which is the round-9 anti-pattern (a pool-size test
  // policing a fairness decision). These buy it room to breathe.
  { theme: '___ TRAP', words: ['SAND', 'FIRE', 'SPEED', 'MOUSE', 'CLAP', 'TOUR', 'BEAR', 'FLY'] },
  { theme: '___ ROOT', words: ['BEET', 'GRASS', 'TAP', 'SQUARE', 'ARROW', 'BURDOCK', 'HORSE', 'GINGER'] },
  { theme: '___ LOCK', words: ['PAD', 'GRID', 'WED', 'FET', 'AIR', 'OAR', 'INTER', 'FORE'] },
  { theme: '___ TABLE', words: ['TIME', 'VEGE', 'DRESSING', 'TURN', 'ROUND', 'CARD', 'BEDSIDE', 'PICNIC'] },
  { theme: 'Can Follow "SEA"', words: ['SHORE', 'WEED', 'FARER', 'SHELL', 'BOARD', 'SON', 'SCAPE', 'PLANE'] },
  { theme: 'Can Follow "DAY"', words: ['BREAK', 'DREAM', 'LIGHT', 'TIME', 'BOOK', 'CARE', 'ROOM', 'BED'] },
  { theme: 'Can Precede "STONE"', words: ['LIME', 'BRIM', 'CORNER', 'MILE', 'GRIND', 'HAIL', 'CURB', 'KERB'] },
  { theme: 'Can Precede "BOARD"', words: ['CUP', 'SKIRT', 'DASH', 'SIGN', 'CHESS', 'HEAD', 'SNOW', 'CARD'] },
];
/**
 * ROUND 13 (REVIEW_AA §5.8) — THE PLAIN-ENGLISH BANK, AND WHY THERE WASN'T ONE.
 *
 * The review's charge was that 67.3% of shipped groups are one of eleven
 * mechanical templates. Measuring the AUTHORED file against the SHIPPED pool
 * settles where that came from, and it is not the authors: 398 of 668 authored
 * groups (59.6%) are plain-English categories, and only 204 of 624 shipped ones
 * (32.7%) were. The composer ate 194 of them.
 *
 * It ate them because it had no choice. AAA 2.9 gives every board a floor of
 * two categories solvable from the tiles, `replaceGroups` reaches for the bank
 * when a board is short, and every group in the bank was wordplay — so the only
 * move available to a composer that needed to change something was to make the
 * board MORE mechanical. Nine rounds of anti-wallpaper caps were all pushing on
 * the same rope: they could change WHICH letter puzzle landed, never whether a
 * letter puzzle landed.
 *
 * This is the missing half. These pools are the way in — the category she reads
 * rather than decodes — and they exist so the letter-mechanic cap has somewhere
 * to evict TO. Two authoring rules, both load-bearing:
 *
 *   - CONCRETE, NOT CLEVER. Every member is a thing you can picture. A plain
 *     taxonomy is the correct yellow group and it is not supposed to be
 *     interesting on its own; it is supposed to be the door.
 *   - IN THE HOUSE'S VOICE WHERE THE HOUSE WOULD PLAUSIBLY SAY IT. `Rooms
 *     Below Stairs`, `Marks on Paper`, `Things a Cat Sleeps On`, `Sounds a
 *     House Makes at Night` are all true categories of English AND true of this
 *     manor, which costs nothing and is the difference between a puzzle set in
 *     a lexicographer's house and a puzzle. (§5.9 is a separate item and this
 *     does not discharge it; it is the part of it that was free.)
 */
/**
 * ROUND 17 — THE HOUSE IS IN THE THREADS, OR THE LIBRARY BELONGS TO NO GAME.
 *
 * The owner's steer for this round was that the word puzzles are too small a
 * part of Lexicon Manor and that the mechanics are not built around them.
 * The Library's version of that charge is measurable and was measured:
 * scanning all 612 shipped threads for the house, its staff, its
 * lexicographer or his dictionary returned SIX hits, five of which are
 * incidental (`___ HOUSE`, `Things in a Lighthouse`). One thread in the
 * whole shelf was written for this building — web-s64's
 * `Sounds a House Makes at Night` — and it is the best proof available that
 * the good version exists, because it is an ordinary Connections category
 * that could only have come from here.
 *
 * Every group below is that template again. None of them is a manor-flavoured
 * gimmick: each is a category any word game could print, whose four words a
 * stranger can solve with no knowledge of this house at all (AAA 2.9's
 * fairness promise is untouched). What they buy is the thing sixteen words on
 * a page cannot otherwise have — a reason to be THESE sixteen words. A player
 * who has met Fern, the cat and the lexicographer's foul papers gets a second
 * reading of `What a Lexicographer Collects` for free; a player who has not
 * gets a perfectly ordinary category about slips and citations.
 *
 * They are plain semantic supply and pay every rule the rest of the bank
 * pays: the theme cap, the family budget, the uniqueness solver, the tone
 * gate. Kept as their OWN list rather than merged into `SEMANTIC_BANK` for
 * one reason: `synthesiseBoards` composes two thirds of the shelf out of the
 * banks, and until it was told to reach for the house first it drew five of
 * these fourteen across a hundred and fifty boards. A shelf is not about the
 * manor because a manor category exists in a pool; it is about the manor
 * because the composer spends one.
 */
const MANOR_BANK: BankGroup[] = [
  { theme: 'The Manor Staff', words: ['BUTLER', 'GAMEKEEPER', 'DAIRYMAID', 'GOVERNESS', 'COACHMAN', 'FOOTMAN', 'HOUSEKEEPER', 'VALET'] },
  { theme: 'Parts of a Dictionary Entry', words: ['HEADWORD', 'USAGE', 'ILLUSTRATION', 'DEFINITION', 'ETYMOLOGY', 'COLLOCATION', 'VARIANT', 'PLURAL'] },
  { theme: 'What a Lexicographer Collects', words: ['CITATIONS', 'COINAGES', 'NICKNAMES', 'PROVERBS', 'MISPRINTS', 'SPELLINGS', 'BOOKPLATES', 'IDIOMS'] },
  { theme: "Things on a Lexicographer's Desk", words: ['BLOTTER', 'INKWELL', 'PAPERWEIGHT', 'MAGNIFIER', 'LEDGER', 'INKSTAND', 'QUILL', 'ALMANAC'] },
  { theme: 'Rooms of a Great House', words: ['LIBRARY', 'BALLROOM', 'GALLERY', 'STUDY', 'CONSERVATORY', 'SCHOOLROOM', 'PARLOUR', 'NURSERY'] },
  { theme: 'Things a Housekeeper Counts', words: ['LINEN', 'CANDLES', 'TEASPOONS', 'SILVER', 'GUESTS', 'PILLOWCASES', 'BROOMS', 'TOWELS'] },
  { theme: 'Things the House Came With', words: ['DEBTS', 'DEEDS', 'CHANDELIERS', 'PORTRAITS', 'RUMOURS', 'STAIRCASES', 'DRAUGHTS', 'GHOST'] },
  { theme: 'Things a House Guest Leaves Behind', words: ['GLOVE', 'UMBRELLA', 'HAIRPIN', 'SCARF', 'IMPRESSION', 'HANDBAG', 'FOOTPRINTS', 'APOLOGY'] },
  // MURMUR is deliberately absent: it is one of eight members of the wordplay
  // bank's `Made of a Repeated Syllable`, one of the thinnest pools on the
  // shelf, and a word spent here is a hand that pool cannot deal.
  { theme: 'Sounds in an Empty Corridor', words: ['ECHO', 'FOOTFALL', 'RATTLE', 'WHISPER', 'CLATTER', 'TOLLING', 'RUSTLE', 'SCUFF'] },
  { theme: 'Things Found Behind a Bookcase', words: ['DUST', 'DRAUGHT', 'WALLPAPER', 'HINGE', 'COBWEB', 'HANDBILL', 'DOORFRAME', 'KEYHOLE'] },
  { theme: 'Things a Detective Notices', words: ['ALIBI', 'FOOTPRINT', 'HANDPRINT', 'TREMOR', 'HESITATION', 'EARRING', 'SOOT', 'SCRATCH'] },
  // Dewey again, from the other side of the desk.
  { theme: 'Things a Cat Knocks Off a Desk', words: ['PENCIL', 'TEACUP', 'NOTEBOOK', 'SPECTACLES', 'ERASER', 'PAPERCLIP', 'CANDLESTICK', 'STAPLER'] },
  { theme: 'Parts of a Word', words: ['STEM', 'ROOT', 'SYLLABLE', 'PREFIX', 'SUFFIX', 'ACCENT', 'PARTICLE', 'ENDING'] },
  { theme: 'Things That Are Catalogued', words: ['VOLUMES', 'ARTEFACTS', 'SEASHELLS', 'SPECIMENS', 'CURIOSITIES', 'GEMSTONES', 'MOTHS', 'STARS'] },
  /**
   * ROUND 18 — four more, written collider-first. A house category is cheap to
   * think of and expensive to place, and the four below were chosen for
   * subjects the manor genuinely has that ALSO happen to be full of words the
   * ordinary bank is built out of: a coach house of CARRIAGEs and HANDCARTs
   * next to `Contains "CAR"`, a cupboard of BROOMS and a CARPETBAG next to
   * `Rhymes with "MOON"`, a post tray of POSTCARDS and BILLS, a gardener's
   * armful of WINDFALLS and MUSHROOMS.
   */
  { theme: 'Things in the Coach House', words: ['HARNESS', 'CARRIAGE', 'HANDCART', 'SADDLE', 'BRIDLE', 'TOOLBOX', 'LUGGAGE', 'MUDGUARD'] },
  { theme: 'Things Kept Under the Stairs', words: ['BOOTS', 'BROOMS', 'UMBRELLAS', 'MOUSETRAP', 'GALOSHES', 'CARPETBAG', 'DUSTPAN', 'OILCAN'] },
  { theme: 'Things the Post Brings', words: ['LETTERS', 'POSTCARDS', 'BILLS', 'PARCELS', 'INVITATIONS', 'NEWSPAPERS', 'TELEGRAMS', 'CIRCULARS'] },
  { theme: 'Things a Gardener Brings Indoors', words: ['FIREWOOD', 'WINDFALLS', 'BLUEBELLS', 'CUTTINGS', 'PRESERVES', 'MUSHROOMS', 'SEEDLINGS', 'KINDLING'] },
];

/** The themes that are about this building — see `qualityOf`. */
const MANOR_THEMES: ReadonlySet<string> = new Set(MANOR_BANK.map((g) => canon(g.theme)));

const SEMANTIC_BANK: BankGroup[] = [
  { theme: 'Words for Rain', words: ['DRIZZLE', 'DOWNPOUR', 'SQUALL', 'DELUGE', 'TORRENT', 'CLOUDBURST', 'SPRINKLE', 'SHOWER'] },
  { theme: 'Kitchen Utensils', words: ['WHISK', 'LADLE', 'SPATULA', 'COLANDER', 'GRATER', 'SIEVE', 'TONGS', 'PEELER'] },
  { theme: 'Parts of a Book', words: ['SPINE', 'PREFACE', 'INDEX', 'MARGIN', 'CHAPTER', 'GLOSSARY', 'ENDPAPER', 'COLOPHON'] },
  { theme: 'Things Found in an Attic', words: ['TRUNK', 'COBWEB', 'RAFTER', 'HEIRLOOM', 'CRATE', 'LANTERN', 'ALBUM', 'MOTHBALL'] },
  { theme: 'Garden Birds', words: ['ROBIN', 'SPARROW', 'STARLING', 'BLACKBIRD', 'WARBLER', 'FINCH', 'WAGTAIL', 'NUTHATCH'] },
  { theme: 'Kinds of Soup', words: ['BROTH', 'CHOWDER', 'BISQUE', 'MINESTRONE', 'GAZPACHO', 'POTTAGE', 'BOUILLON', 'GUMBO'] },
  // Dewey. The category is true of any cat and every one of these is a thing
  // he is found on somewhere in the manor's own dialogue.
  { theme: 'Things a Cat Sleeps On', words: ['CUSHION', 'WINDOWSILL', 'MANUSCRIPT', 'RADIATOR', 'ARMCHAIR', 'LAUNDRY', 'KEYBOARD', 'DOORMAT'] },
  { theme: 'Units of Measurement', words: ['FURLONG', 'FATHOM', 'HECTARE', 'GALLON', 'OUNCE', 'LEAGUE', 'CUBIT', 'ACRE'] },
  { theme: 'Mountain Features', words: ['SUMMIT', 'RIDGE', 'CREVASSE', 'SCREE', 'CORRIE', 'GULLY', 'SADDLE', 'PRECIPICE'] },
  { theme: 'Kinds of Cloud', words: ['CIRRUS', 'CUMULUS', 'STRATUS', 'NIMBUS', 'THUNDERHEAD', 'WISP', 'VAPOUR', 'HAZE'] },
  { theme: 'Things That Come in Pairs', words: ['TROUSERS', 'BINOCULARS', 'PLIERS', 'TWEEZERS', 'CUFFLINKS', 'EARRINGS', 'SPECTACLES', 'BOOKENDS'] },
  { theme: 'Things That Melt', words: ['BUTTER', 'GLACIER', 'WAX', 'SNOWMAN', 'FONDUE', 'ICICLE', 'TARMAC', 'SORBET'] },
  { theme: 'Things That Creak', words: ['FLOORBOARD', 'HINGE', 'ROWLOCK', 'STAIRCASE', 'BEDSTEAD', 'GATEPOST', 'WICKER', 'MAST'] },
  { theme: 'Things You Post', words: ['LETTER', 'PARCEL', 'BANNS', 'INVITATION', 'TELEGRAM', 'NOTICE', 'CIRCULAR', 'PACKET'] },
  { theme: 'Herbs', words: ['THYME', 'SAGE', 'BASIL', 'OREGANO', 'ROSEMARY', 'TARRAGON', 'CHERVIL', 'MARJORAM'] },
  { theme: 'Fabrics', words: ['VELVET', 'LINEN', 'TWEED', 'MUSLIN', 'CHIFFON', 'CORDUROY', 'TAFFETA', 'HESSIAN'] },
  { theme: 'Things in a Toolbox', words: ['SPANNER', 'CHISEL', 'AWL', 'MALLET', 'BRADAWL', 'RASP', 'SCRIBER', 'GIMLET'] },
  { theme: 'Things That Ring', words: ['DOORBELL', 'ALARM', 'TELEPHONE', 'CHIME', 'CARILLON', 'HANDBELL', 'TAMBOURINE', 'TRIANGLE'] },
  { theme: 'Sounds a House Makes at Night', words: ['CREAK', 'TICK', 'DRIP', 'SETTLE', 'GURGLE', 'SIGH', 'GROAN', 'KNOCK'] },
  { theme: 'Kinds of Path', words: ['LANE', 'TOWPATH', 'BRIDLEWAY', 'ALLEY', 'CAUSEWAY', 'BOARDWALK', 'TRACK', 'GINNEL'] },
  { theme: 'Kinds of Light', words: ['GLIMMER', 'GLARE', 'SHIMMER', 'BEAM', 'GLINT', 'RADIANCE', 'FLICKER', 'DAZZLE'] },
  { theme: 'Things That Are Kept', words: ['SECRET', 'PROMISE', 'DIARY', 'LEDGER', 'VIGIL', 'COUNSEL', 'ACCOUNT', 'RECORD'] },
  { theme: 'Old Words for Money', words: ['GUINEA', 'FLORIN', 'GROAT', 'SHILLING', 'FARTHING', 'SOVEREIGN', 'DOUBLOON', 'DUCAT'] },
  { theme: 'Things That Fold', words: ['MAP', 'DECKCHAIR', 'ORIGAMI', 'NAPKIN', 'ACCORDION', 'WALLET', 'EASEL', 'LADDER'] },
  { theme: 'Rooms Below Stairs', words: ['SCULLERY', 'PANTRY', 'LARDER', 'CELLAR', 'BOOTROOM', 'STILLROOM', 'KITCHEN', 'BUTTERY'] },
  { theme: 'Kinds of Handwriting', words: ['COPPERPLATE', 'SCRAWL', 'CURSIVE', 'SHORTHAND', 'ITALIC', 'LONGHAND', 'PRINTING', 'SCRIPT'] },
  { theme: 'Things That Tick', words: ['CLOCK', 'METRONOME', 'STOPWATCH', 'TIMER', 'CRICKET', 'WOODWORM', 'PENDULUM', 'GEIGER'] },
  { theme: 'Things in a Sewing Basket', words: ['THIMBLE', 'BOBBIN', 'PINCUSHION', 'BODKIN', 'SKEIN', 'HANK', 'REEL', 'NEEDLE'] },
  { theme: 'Kinds of Wind', words: ['GALE', 'BREEZE', 'ZEPHYR', 'GUST', 'SIROCCO', 'MISTRAL', 'DRAUGHT', 'TRADEWIND'] },
  { theme: 'Things That Are Sealed', words: ['ENVELOPE', 'JAR', 'VERDICT', 'DEPOSITION', 'PACT', 'HATCH', 'DOCUMENT', 'CANISTER'] },
  // The best of them, and the reason the house should own this room: every one
  // of these is a mark a lexicographer would recognise on his own foul papers.
  { theme: 'Marks on Paper', words: ['BLOT', 'CREASE', 'WATERMARK', 'FOXING', 'DOGEAR', 'SMUDGE', 'ASTERISK', 'RULING'] },
  { theme: 'Kinds of Knot', words: ['BOWLINE', 'HITCH', 'SHEEPSHANK', 'GRANNY', 'REEF', 'TANGLE', 'LASHING', 'BIGHT'] },

  /**
   * The second half of the plain bank, and the reason there is a second half:
   * a composed board spends TWO of these and the shelf wants a hundred of
   * them, so thirty-two pools ran the synthesiser dry at seventy boards. These
   * eighteen are what took it to a hundred and sixty-five.
   *
   * The house keeps creeping into them and that is deliberate — `Kinds of
   * Poem`, `Things Written in Margins`, `Kinds of Puzzle`, `Parts of a
   * Fireplace`, `Kinds of Doorway` (whose LINTEL is the name of the channel
   * that carries his engravings) are all ordinary English categories that a
   * lexicographer's manor would also happen to contain. A Word Web board is
   * sixteen words on a page; the cheapest way for it to belong to this game
   * rather than to any game is for those sixteen words to be things that are
   * in the building.
   */
  { theme: 'Types of Cheese', words: ['CHEDDAR', 'STILTON', 'BRIE', 'GOUDA', 'WENSLEYDALE', 'ROQUEFORT', 'HALLOUMI', 'MASCARPONE'] },
  { theme: 'Things That Have Teeth', words: ['COMB', 'ZIP', 'COG', 'RAKE', 'KEY', 'GEAR', 'SPROCKET', 'PINION'] },
  { theme: 'Parts of a Staircase', words: ['TREAD', 'RISER', 'NEWEL', 'BANISTER', 'LANDING', 'NOSING', 'STRINGER', 'BALUSTER'] },
  { theme: 'Kinds of Hat', words: ['BOWLER', 'FEDORA', 'BERET', 'TRILBY', 'BONNET', 'TURBAN', 'PANAMA', 'SOMBRERO'] },
  { theme: 'Kinds of Pasta', words: ['PENNE', 'FUSILLI', 'RIGATONI', 'TAGLIATELLE', 'ORZO', 'FARFALLE', 'LINGUINE', 'MACARONI'] },
  { theme: 'Trees of the Hedgerow', words: ['HAWTHORN', 'BLACKTHORN', 'HAZEL', 'ELDER', 'HOLLY', 'ROWAN', 'WILLOW', 'ALDER'] },
  { theme: 'Musical Directions', words: ['LEGATO', 'STACCATO', 'FORTE', 'ADAGIO', 'CRESCENDO', 'PIANISSIMO', 'ANDANTE', 'VIVACE'] },
  { theme: 'Kinds of Puzzle', words: ['ACROSTIC', 'REBUS', 'CRYPTOGRAM', 'CONUNDRUM', 'RIDDLE', 'LABYRINTH', 'SUDOKU', 'TANGRAM'] },
  { theme: 'Parts of a Fireplace', words: ['GRATE', 'FENDER', 'ANDIRON', 'HEARTH', 'POKER', 'BELLOWS', 'SCUTTLE', 'TRIVET'] },
  { theme: 'Things Kept in a Drawer', words: ['CUTLERY', 'RECEIPTS', 'STRING', 'BATTERIES', 'CANDLES', 'TEATOWELS', 'SHOELACES', 'CORKS'] },
  { theme: 'Kinds of Ship', words: ['SCHOONER', 'FRIGATE', 'GALLEON', 'CLIPPER', 'KETCH', 'BARQUE', 'SLOOP', 'CUTTER'] },
  { theme: 'Things That Are Ironed', words: ['SHIRT', 'PLEAT', 'TABLECLOTH', 'HANDKERCHIEF', 'CUFF', 'COLLAR', 'PILLOWCASE', 'APRON'] },
  { theme: 'Kinds of Window', words: ['CASEMENT', 'DORMER', 'ORIEL', 'SASH', 'SKYLIGHT', 'LANCET', 'FANLIGHT', 'MULLION'] },
  // A property category with a joke in it: three of these are weather and the
  // rest are trouble, and both are genuinely "brewed".
  { theme: 'Things That Are Brewed', words: ['COFFEE', 'STORM', 'TROUBLE', 'MISCHIEF', 'POTION', 'KOMBUCHA', 'REBELLION', 'SCANDAL'] },
  { theme: 'Kinds of Doorway', words: ['ARCHWAY', 'PORCH', 'THRESHOLD', 'LINTEL', 'PORTAL', 'GATEWAY', 'VESTIBULE', 'ALCOVE'] },
  { theme: 'Things Written in Margins', words: ['GLOSS', 'QUERY', 'CORRECTION', 'DOODLE', 'INITIALS', 'OBJECTION', 'REMINDER', 'ASIDE'] },
  { theme: 'Kinds of Nail', words: ['TACK', 'BRAD', 'RIVET', 'SPIKE', 'CLOUT', 'DOWEL', 'SPRIG', 'BOLT'] },
  { theme: 'Kinds of Poem', words: ['SONNET', 'HAIKU', 'ELEGY', 'LIMERICK', 'BALLAD', 'VILLANELLE', 'EPIGRAM', 'SESTINA'] },

  ...MANOR_BANK,
];

/**
 * How many boards may share one THEME before it feels like wallpaper.
 *
 * ROUND 12 — THIS IS NO LONGER A BANK RULE. It was named `BANK_REUSE_CAP`,
 * documented as the anti-wallpaper rule, and enforced through `bankUse`, which
 * was incremented ONLY on bank draws (the two `bankUse.set` calls). Authored
 * themes never touched the counter, so the rule did not apply to the source
 * the shelf actually grew from: "Two Pairs of Double Letters" was authored onto
 * 16 of 167 boards — 7 of the 12 boards in the newest batch — and shipped on
 * 17, and 'Silent "T"', Heteronyms, Palindromes, Semordnilaps, 'Silent "GH"',
 * Onomatopoeia and 'Silent "K"' were all over the cap too. A player who visits
 * the Library nightly met the same brown-paper category one night in ten.
 *
 * `themeUse` now counts EVERY shipped use, from either source: an authored
 * group whose theme is already at the cap is a forced replacement victim in
 * `replaceGroups` (see `overCapGroups`), and `validate` hard-fails — not
 * warns — if anything gets past it.
 */
const BANK_REUSE_CAP = 3;

/**
 * ROUND 14 — the coarser counter, keyed on MECHANIC FAMILY (see `familyOf`).
 *
 * `BANK_REUSE_CAP` is keyed on the theme STRING, which is why the round-13
 * shelf could hold `Contains "X"` on 65% of its boards while no single
 * `Contains` string appeared more than three times. This is the same rule one
 * level up: how many BOARDS may carry *some flavour of* a given trick.
 *
 * 40% of the shelf is the target the finding asked for. The number below is
 * expressed as a share and turned into a board count against the authored
 * corpus, so it does not silently loosen when the shelf grows.
 */
const FAMILY_BOARD_SHARE = 0.62;

/**
 * ROUND 13 (REVIEW_AA §5.8) — ONE CAP WAS THE WRONG SHAPE OF RULE.
 *
 * A single share applied to every family reads as even-handed and is not,
 * because the families are not interchangeable. The review's complaint was
 * that *"by week two the player is running a checklist"* — and a checklist
 * needs two things: a short list of tricks, and the confidence that tonight's
 * board is on it. Measured before this round: `Contains` on 59.6% of boards
 * and `Rhymes with` on 53.8%, so two entries covered most evenings and the
 * checklist worked. The remaining six letter families sat at 4–20% and were
 * decoration.
 *
 * So the cap that matters is the one on the LETTER MECHANICS, individually,
 * and it is severe: no single one of them may be the trick on more than a
 * third of nights. Under it there is no such thing as "the rhyme group" —
 * two nights in three there isn't one — and a checklist you are wrong about
 * two thirds of the time is not a checklist, it is a guess.
 *
 * `compound` is deliberately held to a looser number and the reason is
 * arithmetic, not affection. AAA 2.9 [BEAT] puts a hard floor of two
 * tiles-solvable categories on every board; the round-13 cap allows at most
 * one letter puzzle below tier 3; so the second of those two slots is a
 * compound frame on nearly every board it can be, and driving the compound
 * share down would mean either lowering a [BEAT] floor or putting the second
 * letter puzzle back. Between "most boards carry one of ninety distinct
 * compound frames" and "most boards carry two letter puzzles", the first is
 * plainly the better evening — and the compound family is the one AAA 2.9's
 * own round-16 ruling calls read rather than decoded.
 */
const LETTER_FAMILY_BOARD_SHARE = 0.66;

/** How many boards each mechanic family may appear on. */
let FAMILY_BOARD_CAP = Number.POSITIVE_INFINITY;
let LETTER_FAMILY_CAP = Number.POSITIVE_INFINITY;

function familyCapFor(f: Family): number {
  return LETTER_MECHANIC_FAMILY.includes(f) ? LETTER_FAMILY_CAP : FAMILY_BOARD_CAP;
}

/** Boards (not groups) that have shipped each family. */
const familyBoards = new Map<Family, number>();

/**
 * ROUND 14 (AAA 2.12) — the share of boards whose YELLOW group is plain
 * English (semantic, trivia or a compound) rather than a letter trick. 2.12
 * asks the easiest group to be found first on ≥70% of boards; a gimme that is
 * itself a letter puzzle is not a gimme.
 */
const PLAIN_YELLOW_TARGET = 0.65;
let plainYellowShipped = 0;
let boardsShipped = 0;

/**
 * ROUND 12 — WHAT EACH "HIDDEN X" CATEGORY IS ALLOWED TO HIDE.
 *
 * The pools were never linted at authoring time: the tone gate and the
 * fairness solver both run on *composed boards*, so a pool member the composer
 * happened not to draw was read by nothing at all, and a member that hid
 * nothing (CHERISH has no CHERRY in it; THREAD has no THREE) or that simply
 * printed the answer with an S on it (LEEKS, TUBAS, CRANES) shipped unread.
 * These lists turn "Hidden X" into a checkable claim.
 */
const HIDDEN_TOKENS: Record<string, readonly string[]> = {
  'Hidden Numbers': ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'],
  'Hidden Numbers (Spelled Out)': ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'],
  'Hidden Colors': ['RED', 'BLUE', 'GREEN', 'TAN', 'ROSE', 'PLUM', 'JADE', 'GREY', 'PINK', 'GOLD', 'RUST', 'TEAL', 'AMBER', 'CORAL', 'OLIVE', 'INDIGO'],
  'Hidden Instruments': ['HARP', 'ORGAN', 'LUTE', 'VIOLA', 'CELLO', 'DRUM', 'HORN', 'BASS', 'OBOE', 'PIANO', 'TUBA', 'FIFE', 'BANJO', 'LYRE', 'SITAR', 'FLUTE'],
  'Hidden Musical Instruments': ['HARP', 'ORGAN', 'LUTE', 'VIOLA', 'CELLO', 'DRUM', 'HORN', 'BASS', 'OBOE', 'PIANO', 'TUBA', 'FIFE', 'BANJO', 'LYRE', 'SITAR', 'FLUTE'],
  'Hidden Body Parts': ['ARM', 'HIP', 'EAR', 'RIB', 'SHIN', 'SCALP', 'PALM', 'LIP', 'CHIN', 'HEEL', 'CALF', 'EYE', 'JAW', 'GUM', 'HAND', 'FOOT', 'SKIN', 'LUNG', 'LIVER', 'BROW', 'NOSE', 'NECK', 'KNEE', 'SHOULDER'],
  'Hidden Animals': ['COW', 'PIG', 'CAT', 'DOG', 'CROW', 'BEE', 'HEN', 'GOAT', 'APE', 'RAT', 'OWL', 'FOX', 'BAT', 'ANT', 'EWE', 'SOW'],
  'Hidden Birds': ['CROW', 'OWL', 'HEN', 'GULL', 'SWALLOW', 'ROOK', 'WREN', 'HAWK', 'DOVE', 'LARK', 'EMU', 'TERN', 'IBIS'],
  'Hidden Trees': ['PINE', 'ASH', 'FIR', 'ELM', 'PALM', 'OAK', 'BEECH', 'TEAK', 'YEW', 'MAPLE', 'CEDAR', 'BIRCH', 'LARCH', 'ASPEN'],
  'Hidden Fruits': ['PLUM', 'FIG', 'DATE', 'PEAR', 'LIME', 'GRAPE', 'LEMON', 'PEACH', 'APPLE', 'MELON', 'MANGO', 'CHERRY', 'OLIVE'],
  'Hidden Vegetables': ['PEA', 'CORN', 'BEET', 'KALE', 'LEEK', 'CHARD', 'BEAN', 'CHIVE', 'YAM', 'OKRA', 'ONION', 'TURNIP', 'CRESS'],
  'Hidden Insects': ['ANT', 'BEE', 'MOTH', 'WASP', 'GNAT', 'TICK', 'MIDGE', 'FLEA', 'APHID'],
  'Hidden Weather': ['RAIN', 'SNOW', 'HAIL', 'MIST', 'FOG', 'GALE', 'SUN', 'ICE', 'DEW', 'WIND', 'STORM', 'SLEET', 'FROST'],
  // ROUND 13 — two more things to conceal (see the variety batch above).
  'Hidden Drinks': ['ALE', 'TEA', 'GIN', 'RUM', 'PORT', 'WINE', 'MEAD', 'COLA', 'CIDER', 'STOUT', 'MOCHA'],
  'Hidden Tools': ['AWL', 'FILE', 'PLANE', 'RASP', 'AXE', 'VICE', 'SAW', 'DRILL', 'CHISEL', 'MALLET', 'LATHE'],
};

/**
 * The suffixes that turn the noun into itself. A "Hidden X" member may not be
 * its own token, nor the token wearing one of these — that is the noun printed
 * on the tile, which is the opposite of the category's claim (AAA 2.9).
 * Derivational endings are deliberately NOT here: MOTHER is not a moth and
 * HAWKER is not a hawk, and both are honest carriers.
 */
const INFLECTIONS = ['S', 'ES', 'ED', 'ING', 'IES'] as const;

/**
 * True when `word` is `token` wearing nothing but an inflection — the noun
 * printed on the tile. The bare `D` case is admitted only for an E-final token
 * (DATE → DATED), because CROW → CROWD is a different word and an honest
 * carrier, and a rule that cannot tell those apart would purge the good ones.
 */
function isInflectionOf(token: string, word: string): boolean {
  if (word === token) return true;
  if (INFLECTIONS.some((sfx) => word === token + sfx)) return true;
  return token.endsWith('E') && word === `${token}D`;
}

/** The hidden token this member honestly carries, or null if it carries none. */
function hiddenTokenOf(theme: string, word: string): string | null {
  const tokens = HIDDEN_TOKENS[canon(theme)];
  if (!tokens) return null;
  for (const t of tokens) {
    if (!word.includes(t)) continue;
    if (isInflectionOf(t, word)) continue;
    return t;
  }
  return null;
}

/**
 * Every "Hidden X" group — from the bank OR from the authored file — must hide
 * what it says it hides. Reasons a member fails, in the order they bit us:
 * it is the bare noun with a plural/participle on it (LEEKS, TUBAS, CRANES,
 * SWALLOWED, DATED); or it contains no member of the category at all
 * (CHERISH, THREAD, CALIBER).
 */
function hiddenGroupProblems(theme: string, words: readonly string[]): string[] {
  if (!(canon(theme) in HIDDEN_TOKENS)) {
    return /^Hidden /.test(canon(theme)) ? [`"${theme}" has no token list — add one to HIDDEN_TOKENS`] : [];
  }
  const out: string[] = [];
  for (const w of words) {
    if (hiddenTokenOf(theme, w)) continue;
    const tokens = HIDDEN_TOKENS[canon(theme)]!;
    const bare = tokens.find((t) => isInflectionOf(t, w));
    out.push(bare
      ? `"${theme}": ${w} prints ${bare}, it does not hide it`
      : `"${theme}": ${w} hides nothing on the list`);
  }
  return out;
}

/**
 * ROUND 12 — the pools themselves are linted, once, before anything is
 * composed. Until now the cozy tone gate ran on the sixteen words of a
 * COMPOSED board, so MIDGET sat in `WORDPLAY_BANK` for as long as it took the
 * composer to draw the hand that carried it — and once drawn it went straight
 * past the gate anyway, because TONE_WORDS had no entry for it. A pool is
 * shipped content the moment it is written down; it is read here.
 */
function assertBankIsClean(): void {
  const problems: string[] = [];
  // ROUND 13 — the semantic bank is read here too. It is shipped content the
  // moment it is written down, and a pool nothing lints is exactly how MIDGET
  // reached a tile in round 12.
  const ALL_BANKS = [...WORDPLAY_BANK, ...SEMANTIC_BANK];
  for (const g of ALL_BANKS) {
    for (const w of g.words) {
      if (!toneOk(w.toLowerCase())) problems.push(`bank "${g.theme}": ${w} fails the tone gate`);
      if (!/^[A-Z]+$/.test(w)) problems.push(`bank "${g.theme}": ${w} is not plain caps`);
    }
    if (new Set(g.words).size !== g.words.length) problems.push(`bank "${g.theme}" repeats a word`);
    problems.push(...hiddenGroupProblems(g.theme, g.words).map((p) => `bank ${p}`));
  }
  // ROUND 13 — and a plain-English pool must actually type as plain English.
  // `Things That Can Be Flat` would silently become `FLAT ___` at load and
  // arrive here as wordplay, which would let the eviction "lower" a board's
  // mechanic count without lowering it.
  for (const g of SEMANTIC_BANK) {
    if (typeOfTheme(g.theme) !== 'semantic') {
      problems.push(`semantic bank "${g.theme}" types as ${typeOfTheme(g.theme)}`);
    }
  }
  const themes = ALL_BANKS.map((g) => canon(g.theme));
  if (new Set(themes).size !== themes.length) problems.push('bank has a duplicate theme');
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`the wordplay bank is not shippable: ${problems.length} problem(s)`);
  }
}

/** Bank groups whose thread is subtle (the tier-3 supply). */
const SUBTLE_BANK = WORDPLAY_BANK.filter((b) => isSubtleTheme(b.theme));

/**
 * ROUND 13 — the compound shelf, which is what an over-cap letter puzzle is
 * replaced BY. It is wordplay under 2.9 (solvable from the tiles, no outside
 * knowledge) and plain English under the way-in floor, which is exactly the
 * combination that lets the composer meet the wordplay floor without asking
 * the player to decode a third thing tonight.
 */
const COMPOUND_BANK = WORDPLAY_BANK.filter((b) => familyOf(b.theme) === 'compound');

/**
 * ROUND 13 — the two banks, in the order the eviction prefers them: a compound
 * keeps the board's wordplay count intact, a plain category lowers it. Both are
 * better outcomes than a second letter puzzle.
 */
const WAY_IN_BANK: BankGroup[] = [...COMPOUND_BANK, ...SEMANTIC_BANK];

/** Canonical key for a 4-word set — order-independent, the unit of repetition. */
function setKey(words: readonly string[]): string {
  return [...words].sort().join('|');
}

/**
 * Every 4-word set already spoken for, from ANY source (authored group or a
 * previous bank draw). Seeded below, once the authored boards are loaded.
 */
const usedSets = new Set<string>();

/**
 * The distinct four-word hands a pool can deal, in a fixed order. Deliberately
 * spread across the pool (0-3, 4-7, evens, odds, …) so consecutive uses of one
 * theme share as few tiles as possible rather than sliding a window by one.
 */
const DRAW_PATTERNS: readonly (readonly number[])[] = [
  [0, 1, 2, 3], [4, 5, 6, 7], [0, 2, 4, 6], [1, 3, 5, 7],
  [0, 1, 6, 7], [2, 3, 4, 5], [0, 3, 5, 6], [1, 2, 4, 7],
  /**
   * ROUND 13 — patterns for the pools that CANNOT be eight words wide.
   *
   * Every pattern above reaches index 4 or beyond except the first, so a
   * five-word pool deals exactly one hand and a four-word pool deals one. That
   * is fine for `Contains "X"`, where the language will supply as many carriers
   * as you like, and it is the binding constraint on the two families the
   * shelf is thinnest in: a set of mutual anagrams is as big as English says it
   * is (SPRITE has five, TRIANGLE has four, most have two), and homophone
   * groups are the same. REVIEW_AA §5.8 measured anagram as the trick on 4.5%
   * of boards and homophone on 5.8% — those numbers were a pattern table, not
   * an editorial choice. These four reach no further than index 6, so a
   * five-word pool now deals three hands and a seven-word pool deals seven.
   */
  [1, 2, 3, 4], [0, 1, 3, 4], [0, 2, 3, 5], [1, 2, 4, 6],
];

function bankDraws(group: BankGroup): BankGroup[] {
  const out: BankGroup[] = [];
  const seen = new Set<string>();
  for (const pattern of DRAW_PATTERNS) {
    if (pattern.some((i) => i >= group.words.length)) continue;
    const words = pattern.map((i) => group.words[i]!);
    const key = setKey(words);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ theme: group.theme, words });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Load the authored boards
// ---------------------------------------------------------------------------

interface RawGroup { theme: string; tier: 'yellow' | 'green' | 'blue' | 'purple'; words: string[] }
/**
 * Per-BOARD authoring tag in content/authored/word-web-boards.json: the tier
 * the author was aiming at. It is authoring INTENT (INTENDED_TIER below turns
 * it into a starting tier, and pass 2 demotes boards that don't earn it), not
 * the retired puzzle-level `difficulty` alias — shipped boards carry `tier`
 * and nothing else.
 */
type AuthoredDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

interface RawBoard { id: string; difficulty: AuthoredDifficulty; groups: RawGroup[] }

interface OutGroup extends RawGroup { type: GroupType; decoys: string[] }

/**
 * AAA 2.10 [BEAT] — the acknowledged herring, with the thread it pretends to
 * be. `words` is the WHOLE set that shares the relation (the group it imitates
 * plus its intruders), so the room can match a selection against it: ≥3 of her
 * four tiles inside the set means she really was chasing this trap.
 */
/**
 * ROUND 11 adds `hidden-string`, and it is a correction as much as an
 * addition. A `Contains "HAM"` group's trap is HAMMER — a word with the
 * group's string buried in the middle of it — and that was being emitted as
 * `shared-affix`, the same label as four words that all end in -GHT. They are
 * not the same deduction and they do not deserve the same sentence: one is
 * "these share an edge", the other is "this one is hiding your group inside
 * it". The mislabel is also most of why the pool measured 68% shared-affix.
 */
type HerringRelation = 'rhyme' | 'shared-affix' | 'doubled-letter' | 'semantic' | 'hidden-string';
interface OutHerring {
  words: string[];
  relation: HerringRelation;
  /** The shared letters, when the relation is one you can point at. */
  detail?: string;
}

interface OutBoard extends WordWebPuzzle {
  /** Manor row band — authoritative (rows 0–2 / 3–4 / 5–6). */
  tier: Tier;
  groups: OutGroup[];
  ambiguousWords: string[];
  herrings: OutHerring[];
  layout: string[];
}

// ---------------------------------------------------------------------------
// The three manor tiers
// ---------------------------------------------------------------------------

/**
 * The authored difficulty is the *intent*; measured structure confirms it.
 *
 * ROUND 10: `medium` used to aim at tier 1, which meant NOTHING in the corpus
 * aimed at tier 2 — every tier-2 board in the shelf was a demoted tier-3 board
 * or a tier-3 board spilled by the cap. That was survivable at 51 boards and
 * absurd at 150: the middle of the house was furnished entirely with failures.
 * The four authored words now map onto the three shelves directly, and pass 2
 * still demotes anything that does not measure up.
 */
const INTENDED_TIER: Record<string, Tier> = {
  easy: 1, medium: 2, hard: 3, expert: 3,
};

interface RoomTierSpec {
  /** Trivia gimmes: allowed at the bottom of the house, banned at the top. */
  maxTrivia: number;
  minWordplay: number;
  /** Categories you must hear/unscramble rather than read off the tiles. */
  minSubtle: number;
  /**
   * ROUND 10 — the floor the bank may not compose away. `replaceGroups` was
   * free to swap EVERY authored category for a bank wordplay group, and on 29
   * of 152 shipped boards it had: four letter-puzzles in a row, no plain
   * English anywhere. That is not a Connections board, it is a cryptic
   * crossword with the clues removed, and it is exactly the "boring board"
   * the owner said to cut rather than pad the count with. Tier 1 — the row
   * the player stands on most nights — keeps two.
   *
   * PLAIN means "not a letter puzzle": semantic OR trivia. Counting only
   * `semantic` made the trivia gimme structurally impossible at tier 1 (two
   * semantics + a gimme leaves one slot, and the tier owes two wordplay), so
   * the composer ate every gimme in the pool to satisfy a floor that was
   * measuring the wrong thing. A trivia category is a category you read in
   * English; it belongs on this side of the line.
   */
  minPlain: number;
  /**
   * ROUND 13 (REVIEW_AA §5.8) — HOW MANY LETTER PUZZLES ONE BOARD MAY BE.
   *
   * The review's live board carried two `Contains` groups at different colour
   * bands, and 78.7% of the shelf ran two or more letter mechanics. That is
   * the checklist: once a board is half letter-puzzle, the method that solves
   * one group solves the next, and the evening collapses into "find the
   * substring group, find the rhyme group, split the remainder."
   *
   * The number is 1 at the bottom of the house and 2 at the top, and it is 2
   * at the top for a reason rather than by compromise: `minSubtle` is 2 there
   * (the round-4 owner directive — tier-3 categories must be heard or
   * unscrambled, not read), and every subtle category is by definition a
   * letter mechanic. So tier 3's two letter puzzles ARE its two subtle
   * categories, and `validate` additionally requires them to be two DIFFERENT
   * families: a board may be a rhyme and an anagram, never two rhymes.
   *
   * A compound frame does not count against this. See `LETTER_MECHANIC_FAMILY`.
   */
  maxLetterMechanics: number;
  /** The herring budget: how many planted traps, and how tight each must pull. */
  minHerrings: number;
  maxHerrings: number;
  minHerringScore: number;
}

/** Solver score at which a trap counts as a real pull, not a coincidence. */
const HERRING_TIGHT = 2;
/**
 * …and the score at which it is still a pull a player can actually follow:
 * three words across two groups sharing something visible, so the odd one out
 * reads as belonging with the pair. Only the SURPLUS above a tier's floor may
 * be bought at this price — see `shippedHerrings`.
 */
const HERRING_LOOSE = 1;

const TIER_SPECS: Record<Tier, RoomTierSpec> = {
  // Round 7: tier 1's floor was 0, so 22 of 55 shipped boards carried an empty
  // trap list and the AAA 2.10 acknowledged-herring channel could never fire on
  // them. A tier-1 board still ships at most ONE loose trap — the near-clean
  // board is the point — but it must ship that one, and pass 2 drops any board
  // the planter cannot supply rather than shipping a room that can only say no.
  // ROUND 13 — tier 1's subtle floor moves 0 → 1, and it is the FINISH FLOOR
  // wearing a name the generator already had. A board needs one category that
  // is a real transformation or its purple group is only the leftovers, which
  // is Koster's fourth complaint verbatim ("the hardest group solves itself").
  // Measured on the round-12 shelf, 11 boards had no group scoring ≥5 at all;
  // every one of them was a tier-1 board with `minSubtle: 0`.
  //
  // ROUND 17 (BENCHMARKS §2) — THE CEILINGS, AND WHY THEY ALL MOVED UP ONE.
  //
  // Measured on the round-16 shelf of 153 boards: `ambiguousWords` averaged
  // 1.12 per board, median 1, and only 18 boards (12%) carried the 2–4
  // CONTESTED TILES that BENCHMARKS §2 records as Connections' working range.
  // A contested tile is not a garnish on the format, it IS the format: with
  // one of them, three of the four threads are uncontested and the evening is
  // a sort. Wyna Liu's own authoring note — "red herrings are first-class
  // content" — is a statement about how many, not about whether.
  //
  // The FLOORS are untouched. A floor that cannot be met drops the board
  // (`shipsHere`), and the round-13/14 pool is already lean; raising them
  // would have bought contested tiles by shrinking the shelf, which is the
  // trade this project has refused twice. The ceilings cost nothing they
  // cannot afford, because the budget is spent only where the board's own
  // supply of tight threads reaches — and where the colour ladder can still
  // describe the result honestly, which is what `fitHerrings` checks.
  1: { maxTrivia: 1, minWordplay: 2, minSubtle: 1, minPlain: 2, maxLetterMechanics: 1, minHerrings: 1, maxHerrings: 2, minHerringScore: 1 },
  2: { maxTrivia: 1, minWordplay: 2, minSubtle: 1, minPlain: 1, maxLetterMechanics: 2, minHerrings: 1, maxHerrings: 3, minHerringScore: HERRING_TIGHT },
  3: { maxTrivia: 0, minWordplay: 2, minSubtle: 2, minPlain: 1, maxLetterMechanics: 3, minHerrings: 2, maxHerrings: 4, minHerringScore: HERRING_TIGHT },
};

const here = dirname(fileURLToPath(import.meta.url));
const authoredBoards = (JSON.parse(
  readFileSync(join(here, 'authored', 'word-web-boards.json'), 'utf8'),
) as RawBoard[]).map((b) => ({
  ...b,
  // ROUND 14 — one label per mechanic (see `normaliseTheme`). Done at load so
  // every downstream reader — typing, family census, victim order, the decoy
  // solver and the shipped JSON — sees the same string.
  groups: b.groups.map((g) => ({ ...g, theme: normaliseTheme(g.theme) })),
}));

/**
 * ROUND 13 (REVIEW_AA §5.8) — COMPOSED BOARDS, AND WHY THEY ARE NOT A CHEAT.
 *
 * The round-13 rules — one letter puzzle below tier 3, never two of the same
 * family, a way in, a real finish, a colour ladder that has to climb — cost
 * the shelf 156 boards down to 135. That is the correct behaviour of every one
 * of those rules and it is still a content regression: the round-10 note
 * records that at 51 boards a player who visits the Library nightly exhausts
 * the bottom of the house inside a fortnight, and the answer to "the shelf is
 * repetitive" cannot be "here is less of it".
 *
 * So the shortfall is made up from the banks. The important thing about this,
 * and the reason it is not the "mechanically novel but boring board" the brief
 * warned against: EVERY CATEGORY ON A COMPOSED BOARD IS HAND-AUTHORED. What
 * the machine chooses is the COMBINATION — and that is exactly what it already
 * chose for two thirds of the shelf, since `replaceGroups` has been swapping
 * bank categories into authored boards for nine rounds. A composed board is an
 * authored board all four of whose slots happened to need filling.
 *
 * It is composed to the shape the round-13 rules want rather than patched into
 * it: two plain categories she can enter through, one compound frame, one
 * subtle mechanic to finish on. And it passes through the identical pipeline —
 * tier composition, the red-herring solver, the trap planter, the decoy
 * solver, the colour ladder, `shipsHere` and `validate`. The one difference is
 * at the top of pass 2: an unintended complete grouping in an AUTHORED board
 * is a build failure, because a human wrote it and should fix it; in a
 * composed board it is simply a combination that did not work, and the board
 * leaves without comment.
 */
const COMPOSED_PREFIX = 'web-s';

/**
 * ROUND 13 — A CHEAP STAND-IN FOR THE HERRING SOLVER, USED ONLY WHILE
 * COMPOSING.
 *
 * The first composed batch was built from pools chosen to be as far apart as
 * possible, which is right for uniqueness and wrong for everything else: a
 * board whose four categories share nothing has no fifth-member pulls, so the
 * real solver found no tight traps, `meetsTier` demoted the whole batch to
 * tier 1, and the shelf came out 70/40/49 with the middle of the house
 * starved. A board wants its groups to ALMOST collide — that is what a red
 * herring is.
 *
 * ROUND 18 — DEMOTED TO A TIE-BREAK, AND WHAT IT WAS GETTING WRONG.
 *
 * The paragraph that used to stand here said the real measurement could not
 * run at composition time because the phonetic dictionary is loaded further
 * down this file. That was a fact about the ORDER OF THE DECLARATIONS and
 * nothing else; the shelf is now composed at the bottom of the file (see
 * `boards`) and `contestedHere` asks the shipping detector directly.
 *
 * The proxy is kept because it measures something the detector deliberately
 * does not: how much the sixteen words RUB, whether or not any rub is
 * complete enough to score. But it is not a contested-tile count and never
 * was, and three specific blindnesses made it the wrong thing to steer on:
 *
 *   - it is blind to RHYME, which is the single largest pull kind on the
 *     shelf (81 of the 279 named threads at HEAD);
 *   - it is blind to COMPLETENESS. A trap scores because a word is a fifth
 *     member of a group all four of whose words share the pattern; two words
 *     of one group sharing an edge with two of another is noise the solver
 *     will never name, and the proxy paid two points for each;
 *   - it is blind to WHICH TILE. Ten collisions that all point at the same
 *     word are one contested tile, and BENCHMARKS §2 grades the board on the
 *     count of tiles, not of collisions.
 */
function roughTraps(groups: readonly { words: readonly string[] }[]): number {
  const edges = (w: string): string[] => (w.length < 4 ? [] : [w.slice(0, 3), w.slice(-3)]);
  let n = 0;
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      for (const a of groups[i]!.words) {
        for (const b of groups[j]!.words) {
          if (edges(a).some((e) => edges(b).includes(e))) { n += 2; continue; }
          if (edges(a).some((e) => b.includes(e)) || edges(b).some((e) => a.includes(e))) n += 1;
        }
      }
    }
  }
  return n;
}

/**
 * ROUND 18 (BENCHMARKS §2) — THE COMPOSER BUILDS THE BOARD FROM ITS CONTESTED
 * TILES.
 *
 * How many DIFFERENT tiles this hand of categories would let the room argue
 * about, at the tier's own tightness and at the loose band the surplus is
 * bought in — measured with `findTraps`/`contestedCapacity`, the same two
 * functions `fitHerrings` uses on the finished board. Nothing here can invent
 * a trap: if this returns 2 and pass 2 ships 1, pass 2 is right and the
 * difference is the tier gate or the colour ladder refusing it.
 *
 * This is the answer to the round-17 finding. Raising the trap budget moved
 * the headline by 0.04 because the budget was never what was binding: the
 * shelf offered ONE contestable tile on 124 of 217 candidate boards, and two
 * thirds of the shelf is composed by the loop below out of pools whose
 * combination was chosen by a proxy that could not count tiles. A board is
 * cheapest to contest before it exists.
 */
function contestedHere(hands: readonly BankGroup[]): { tight: number; loose: number } {
  const groups: RawGroup[] = hands.map((g, i) => ({
    theme: g.theme, tier: TIER_ORDER[i % TIER_ORDER.length]!, words: [...g.words],
  }));
  const traps = findTraps(groups);
  return {
    tight: contestedCapacity(traps, HERRING_TIGHT),
    loose: contestedCapacity(traps, HERRING_LOOSE),
  };
}

/**
 * The top of Connections' band (BENCHMARKS §2). `CONTESTED_TARGET` is what the
 * evening needs and is what the tight count saturates at; a board with more
 * loose pulls than that is not better, it is busy.
 */
const CONTESTED_BAND_TOP = 4;

function synthesiseBoards(target: number, rng: () => number): RawBoard[] {
  const out: RawBoard[] = [];
  const spentSets = new Set<string>(authoredBoards.flatMap((b) => b.groups.map((g) => setKey(g.words))));
  const spentThemes = new Map<string, number>();
  for (const b of authoredBoards) {
    for (const g of b.groups) spentThemes.set(canon(g.theme), (spentThemes.get(canon(g.theme)) ?? 0) + 1);
  }
  const hands = (pool: BankGroup[]) => pool.flatMap(bankDraws);
  const plain = hands(SEMANTIC_BANK);
  const compound = hands(COMPOUND_BANK);
  const subtle = hands(SUBTLE_BANK);

  const affordable = (g: BankGroup) =>
    (spentThemes.get(canon(g.theme)) ?? 0) < BANK_REUSE_CAP && !spentSets.has(setKey(g.words));
  const take = (g: BankGroup) => {
    spentThemes.set(canon(g.theme), (spentThemes.get(canon(g.theme)) ?? 0) + 1);
    spentSets.add(setKey(g.words));
  };

  // Rotate through the subtle families so the composed batch does not become
  // its own monoculture — the exact failure this whole round is about.
  const subtleByFamily = new Map<Family, BankGroup[]>();
  for (const g of subtle) {
    const f = familyOf(g.theme);
    subtleByFamily.set(f, [...(subtleByFamily.get(f) ?? []), g]);
  }
  const families = [...subtleByFamily.keys()].sort();
  /**
   * ROUND 13 — a composed board never aims at tier 1, and the reason is the
   * trap planter. Tier 1 keeps `minPlain: 2`, so on a board of two plain
   * categories the planter has nothing it is allowed to swap, and 54 of the
   * first composed batch left with "0 traps, no intruder" — a board on which
   * AAA 2.10's acknowledged herring can never fire. Aimed at tier 2 the
   * planter has one plain slot to spend and can buy the board a thread to
   * talk about; pass 2 then demotes it to tier 1 anyway if that is where its
   * measured traps put it, which is the correct way round.
   */
  /**
   * ROUND 17 — 'easy' rejoins the rotation, and the round-13 objection above
   * has been answered by a different change. Tier 1 keeps `minPlain: 2`, so on
   * a two-plain board the trap PLANTER has nothing it is allowed to swap —
   * which was fatal while planting was the only way a board could get a
   * thread. It is not any more: `pickBankGroup` now chooses, among the hands
   * the board was taking anyway, the four words that leave a fifth member on
   * the board, so a tier-1 composed board can arrive with a contested tile
   * already in it. Pass 2 still demotes or drops it if it cannot.
   */
  const DIFFICULTIES: AuthoredDifficulty[] = ['medium', 'easy', 'medium', 'hard', 'easy'];

  for (let i = 0; out.length < target && i < target * 12; i += 1) {
    const fam = families[i % families.length]!;
    const sub = (subtleByFamily.get(fam) ?? []).filter(affordable);
    if (sub.length === 0) continue;
    /**
     * ROUND 17 — ROUND-ROBIN INSIDE THE FAMILY, NOT JUST ACROSS FAMILIES.
     *
     * The rotation above spreads the composed batch across the mechanic
     * FAMILIES, and then took a hand from that family at random — so
     * `letter-shape`, which is fifteen different themes wearing one family
     * name, was a fifteen-sided die rolled a few dozen times. Three of the six
     * shape mechanics round 13 authored (`Words with All Five Vowels`,
     * `Three Vowels in a Row`, `Made of a Repeated Syllable`) came up short
     * often enough that their few boards all died at a later gate and they
     * stopped shipping at all, which
     * `tests/puzzles/wordweb-ladder.test.ts` catches by name. Least-spent
     * theme first, seeded pick among the equals: the die is now fair.
     */
    const thinnest = Math.min(...sub.map((g) => spentThemes.get(canon(g.theme)) ?? 0));
    const freshest = sub.filter((g) => (spentThemes.get(canon(g.theme)) ?? 0) === thinnest);
    const s = pick(createRngFrom(rng), freshest);
    const used = new Set(s.words);
    const fits = (g: BankGroup) => affordable(g) && g.words.every((w) => !used.has(w));

    /**
     * ROUND 18 — among the hands that legally fit, take the one that leaves
     * the board arguing about the most DIFFERENT tiles: tight pulls first
     * (they are what the tier's floor is met from), then loose ones, and only
     * then `roughTraps`, which is now what it always was — a measure of how
     * much the sixteen words rub, used to break ties between hands the
     * detector cannot separate. Deterministic: ties break on the theme label.
     */
    const rank = (g: BankGroup, sofar: readonly BankGroup[]): readonly number[] => {
      const { tight, loose } = contestedHere([...sofar, g]);
      return [
        Math.min(tight, CONTESTED_TARGET),
        Math.min(loose, CONTESTED_BAND_TOP),
        // ROUND 18 — below both contested measures and above the rub: the
        // house wins a slot it has already tied for. See `pickBankGroup`.
        MANOR_THEMES.has(canon(g.theme)) ? 1 : 0,
        roughTraps([...sofar, g]),
      ];
    };
    const trappiest = (options: BankGroup[], sofar: readonly BankGroup[]): BankGroup =>
      options
        .map((g) => ({ g, score: rank(g, sofar) }))
        .sort((a, b) => {
          for (let i = 0; i < a.score.length; i += 1) {
            if (a.score[i]! !== b.score[i]!) return b.score[i]! - a.score[i]!;
          }
          return a.g.theme < b.g.theme ? -1 : 1;
        })[0]!.g;

    const cOptions = compound.filter(fits);
    if (cOptions.length === 0) continue;
    const c = trappiest(cOptions, [s]);
    for (const w of c.words) used.add(w);

    /**
     * ROUND 17 — THE COMPOSER SPENDS ITS FIRST PLAIN SLOT ON THE HOUSE.
     *
     * `MANOR_BANK` existed for one build before this line and was drawn five
     * times across a hundred and fifty-five boards, because `plain` is forty
     * pools wide and nothing preferred one over another. A shelf is not about
     * the manor because a manor category exists in a pool.
     *
     * NOT DONE HERE, and the two measurements that say why. Composed as
     * `manor.filter(fits)` outright the shelf fell from 155 boards to 148
     * (floor 150), and as a thumb on `trappiest`'s scale it fell to 145 while
     * the manor count went DOWN: this slot is also where a composed board buys
     * the near-collisions that become its contested tiles, and fourteen pools
     * cannot supply what forty-seven can.
     *
     * The manor pools were being drawn here all along — three boards each,
     * like every other pool. They were being EATEN afterwards, by
     * `replaceGroups`, whose victim order takes the lowest-`qualityOf`
     * category first and scored `Things a Housekeeper Counts` at 1 (a plain
     * taxonomy) exactly as it scores `Vegetables`. The fix belongs there, and
     * it is one line: a category that is about this building is worth as much
     * as a property category, so the composer eats something else.
     */
    const p1Options = plain.filter(fits);
    if (p1Options.length === 0) continue;
    const p1 = trappiest(p1Options, [s, c]);
    for (const w of p1.words) used.add(w);

    /**
     * ROUND 13 — EVERY THIRD COMPOSED BOARD IS BUILT FOR THE TOP OF THE HOUSE.
     *
     * The first version of this composed one shape — two plain categories, a
     * compound and one subtle mechanic — which is a tier-1/2 board by
     * construction, because tier 3 owes TWO subtle categories. So the composed
     * batch could not reach the shelf that needed it most and tier 3 stayed at
     * 34 boards against a floor of 45. The second subtle group is drawn from a
     * DIFFERENT family, which is the rule the top of the house has to keep
     * anyway (`validate`'s twin check) and is also the whole point: a tier-3
     * board is two different transformations, never the same one twice.
     */
    const wantsTop = i % 2 === 1;
    const s2Options = wantsTop
      ? subtle.filter((g) => fits(g) && familyOf(g.theme) !== fam)
      : [];
    const s2 = s2Options.length > 0 ? trappiest(s2Options, [s, c, p1]) : null;
    if (s2) for (const w of s2.words) used.add(w);

    const p2Options = plain.filter((g) => fits(g) && canon(g.theme) !== canon(p1.theme));
    if (!s2 && p2Options.length === 0) continue;
    const p2 = s2 ?? trappiest(p2Options, [s, c, p1]);

    for (const g of [s, c, p1, p2]) take(g);
    // The colours here are a placeholder — pass 2 assigns the real ones from
    // `lateralOf` — but they must be four distinct slots for the loaders and
    // the report to read the board at all.
    out.push({
      id: `${COMPOSED_PREFIX}${String(out.length + 1).padStart(2, '0')}`,
      // A two-subtle board asks for the top shelf; pass 2 demotes it if its
      // measured traps do not earn it.
      difficulty: s2 ? 'hard' : DIFFICULTIES[out.length % DIFFICULTIES.length]!,
      groups: [
        { theme: p1.theme, tier: 'yellow', words: [...p1.words] },
        { theme: p2.theme, tier: 'green', words: [...p2.words] },
        { theme: c.theme, tier: 'blue', words: [...c.words] },
        { theme: s.theme, tier: 'purple', words: [...s.words] },
      ],
    });
  }
  return out;
}

/** The shelf size tests/content.test.ts holds the pool to. */
const POOL_FLOOR = 150;

/**
 * ROUND 17 — 180 → 260. This is the number of composed CANDIDATES, not of
 * shipped boards: every one of them still goes through the same tier
 * composition, herring solver, colour ladder and `shipsHere` as an authored
 * board, and roughly half of them leave. It was raised because this round
 * spends supply — the trap budget contests more tiles, and a board that
 * cannot describe its own difficulty at any budget leaves rather than lying
 * — and `POOL_FLOOR` is a promise to a player who visits the Library nightly.
 * The synthesiser stops early when the banks are spent, so the only cost of a
 * larger target is build time.
 */
const COMPOSED_TARGET = 260;

/**
 * ROUND 14 — the English lexicon, for the two jobs the corpus cannot do:
 * re-anchoring a label whose anchor word is sitting on its own board (2.8), and
 * checking whether a compound decoy is real (2.11). `[word, frequencyRank]`,
 * rank −1 meaning "not in the frequency corpus at all".
 */
const LEXICON: Map<string, number> = new Map(
  (JSON.parse(readFileSync(join(here, 'data', 'dictionary.json'), 'utf8')) as [string, number][])
    .map(([w, r]) => [w.toUpperCase(), r] as const),
);
const isWord = (w: string): boolean => LEXICON.has(w);
/** A familiar word — the only kind a label may anchor on. */
const isFamiliar = (w: string): boolean => {
  const r = LEXICON.get(w);
  return r !== undefined && r > 0 && r < 60000;
};

// ---------------------------------------------------------------------------
// 2.9 — trivia cap + wordplay floor via bank replacement, trivia → yellow
// ---------------------------------------------------------------------------

const TIER_ORDER = ['yellow', 'green', 'blue', 'purple'] as const;
const bankUse = new Map<string, number>();

/**
 * Compose `board` to satisfy `tier`'s category floors, then plant that tier's
 * traps. Returns null when the bank cannot supply what the tier needs (the
 * caller then tries the tier below) — a board is never shipped pretending to
 * a tier it does not structurally meet.
 */
/** Why the last `replaceGroups` refusal happened, for the drop report. */
let lastRefusal = '';

/**
 * ROUND 18 — a board the composer has finished with, carrying the one fact
 * `redealHands` needs and nothing downstream reads: which of its four
 * categories the BANK dealt, and which a person wrote.
 */
interface ComposedBoard extends RawBoard { banked: string[] }

function replaceGroups(
  board: RawBoard,
  tier: Tier,
  rng: () => number,
  /**
   * ROUND 11 (AAA 2.7 / 2.12) — WHICH COLOUR SLOT GIVES WAY.
   *
   * The victim order was hard-coded to TIER_ORDER, so the composer always ate
   * green first, then blue, then purple, and the shipped pool came out as one
   * template: 86 of 163 boards were yellow-semantic / green-semantic /
   * blue-wordplay / purple-wordplay, and every board was therefore solvable by
   * the same shortcut regardless of its words. The order is a parameter now
   * and `main` picks, per board, whichever admissible preference lands on the
   * least-represented composition — variety that costs the board nothing,
   * because every candidate has already passed the same fairness gates.
   */
  slotPref: readonly RawGroup['tier'][] = TIER_ORDER,
): ComposedBoard | null {
  const spec = TIER_SPECS[tier];
  let groups = board.groups.map((g) => ({ ...g, words: [...g.words] }));

  const typed = () => groups.map((g) => ({ g, type: typeOfTheme(g.theme) }));
  const count = (t: GroupType) => typed().filter((x) => x.type === t).length;
  const subtleCount = () => groups.filter((g) => isSubtleTheme(g.theme)).length;

  // Groups eligible for replacement, worst-first: trivia beyond this tier's
  // allowance, then blunt wordplay, then green/blue/purple semantics. At tier 1
  // the yellow semantic anchor stays; at tier 3 nothing is sacred but the
  // subtle groups we have already installed.
  const replacementOrder = (needWordplay = false): RawGroup[] => {
    const t = typed().filter((x) => !isProtectedTheme(x.g.theme));
    const extraTrivia = t.filter((x) => x.type === 'trivia').slice(spec.maxTrivia).map((x) => x.g);
    const bluntWordplay = t
      .filter((x) => x.type === 'wordplay' && !isSubtleTheme(x.g.theme))
      .map((x) => x.g);
    // The semantic floor is spent before anything else is: once a board is
    // down to its last plain-English categories they stop being replaceable,
    // and the composer either finds a blunt-wordplay victim or gives up on
    // this tier (the caller then tries the tier below).
    //
    // ROUND 14 — WORST FIRST, MEASURED BY QUALITY AND NOT BY COLOUR. The order
    // used to be the colour-slot preference alone, so a plain taxonomy
    // (`Basketball Terms`) and a property category (`Things That Roll`) were
    // equally edible and the slot decided which went. Quality decides now, and
    // the slot only breaks ties; PROTECTED categories were filtered out above
    // and are never offered at all.
    const spare = plainCount(groups) - spec.minPlain;
    const semantics = spare <= 0 ? [] : t
      .filter((x) => x.type === 'semantic' && (tier === 3 || x.g.tier !== 'yellow'))
      .sort((a, b) => qualityOf(a.g.theme) - qualityOf(b.g.theme)
        || slotPref.indexOf(a.g.tier) - slotPref.indexOf(b.g.tier))
      .map((x) => x.g)
      .slice(0, spare);
    // Last resort: a trivia category that is WITHIN the cap. Once the semantic
    // floor is real, a board of two semantics + one trivia + one wordplay has
    // no other way to reach the 2-wordplay floor, and the gimme is the least
    // valuable thing on it (2.9 caps trivia at one; it never requires one).
    const spareTrivia = t.filter((x) => x.type === 'trivia').slice(0, spec.maxTrivia).map((x) => x.g);
    // When the board is short of WORDPLAY, replacing one wordplay group with
    // another cannot help — offering blunt wordplay as a victim just spins the
    // loop until its guard trips and the whole board is refused. Ask only for
    // victims whose replacement actually moves the count.
    if (needWordplay) return [...extraTrivia, ...semantics, ...spareTrivia];
    return [...extraTrivia, ...semantics, ...bluntWordplay, ...spareTrivia];
  };

  const boardWords = () => new Set(groups.flatMap((g) => g.words));
  const boardThemes = () => new Set(groups.map((g) => g.theme));
  const boardFamilies = () => new Set(groups.map((g) => familyOf(g.theme)));

  /**
   * A bank group may only land if the resulting board still has ZERO
   * unintended complete groupings (2.7). Without this the subtle bank happily
   * manufactures them — "Rhymes with EIGHT" next to an existing KNIGHT gives
   * four words sharing suffix GHT, which is exactly the failure the solver
   * refuses to ship.
   */
  /**
   * ROUND 14 — the family budget is spent HERE, where the wallpaper is made.
   * A family this board already carries costs nothing extra (the cap counts
   * boards); a family the pool has nearly spent is refused outright, and among
   * what is left the least-used family wins. This is the lever that reaches the
   * two thirds of the shelf the composer touches, without eating a single
   * authored category to do it.
   */
  const familyAdmissible = (theme: string): boolean => {
    const f = familyOf(theme);
    if (!WALLPAPER_FAMILIES.includes(f)) return true;
    if (boardFamilies().has(f)) return true;
    return (familyBoards.get(f) ?? 0) < familyCapFor(f);
  };
  const familyLoad = (theme: string): number => {
    const f = familyOf(theme);
    if (boardFamilies().has(f)) return -1;   // already on this board: free
    return familyBoards.get(f) ?? 0;
  };

  /**
   * ROUND 13 (REVIEW_AA §5.8) — would taking this hand make the board another
   * letter puzzle too many? Two separate refusals, and they are different
   * claims:
   *
   *   - the per-board CAP (`maxLetterMechanics`): a tier-1 board is allowed to
   *     ask her to decode exactly once;
   *   - and, at tier 3 where the cap is 2, the two may not be the same family.
   *     `familyAdmissible` deliberately lets a family the board already
   *     carries land again for free — that is right for the pool-wide
   *     wallpaper budget it serves and wrong here, and it is precisely how the
   *     review's first live board came to hold `Contains "OWN"` and
   *     `Contains "RAM"` at two different colours.
   */
  const letterOk = (theme: string, victim: RawGroup): boolean => {
    if (!isLetterMechanicTheme(theme)) return true;
    const rest = groups.filter((g) => g !== victim);
    if (letterMechanicCount(rest) + 1 > spec.maxLetterMechanics) return false;
    return !rest.some((g) => familyOf(g.theme) === familyOf(theme));
  };

  const pickBankGroup = (from: BankGroup[], victim: RawGroup): BankGroup | null => {
    const words = boardWords();
    const themes = boardThemes();
    // Each candidate is a specific HAND out of a pool, and a hand that has
    // already shipped anywhere is not a candidate at all (round 11).
    const usable = from.flatMap(bankDraws).filter(
      (b) =>
        (bankUse.get(canon(b.theme)) ?? 0) < BANK_REUSE_CAP &&
        !themes.has(b.theme) &&
        !usedSets.has(setKey(b.words)) &&
        familyAdmissible(b.theme) &&
        letterOk(b.theme, victim) &&
        b.words.every((w) => !words.has(w)) &&
        boardFailures(
          groups.map((g) => (g === victim ? { theme: b.theme, tier: g.tier, words: b.words } : g)),
        ).length === 0,
    );
    if (usable.length === 0) return null;
    const best = Math.min(...usable.map((b) => familyLoad(b.theme)));
    const leanest = usable.filter((b) => familyLoad(b.theme) === best);
    /**
     * ROUND 17 (BENCHMARKS §2) — THE FREE HALF OF THE CONTESTED-TILE FIX.
     *
     * Every swap that reaches this line is already spending a bank theme, and
     * until now it spent it blind: among the hands from the least-used family
     * it took one at random. A bank group is a POOL of six to eight verified
     * members and each use draws a distinct FOUR from it (round 11), so which
     * four is a free choice — and the four decide whether any word on this
     * board is a fifth member of the incoming category, which is what a
     * contested tile IS. Measured: the shelf goes from 147 boards contesting
     * 1.29 tiles to 155 contesting 1.38, at no cost in either direction.
     *
     * The trap planter can also buy contested tiles, but it buys them with a
     * whole extra theme out of a bank the pool has already nearly spent —
     * aiming the planter at two contested tiles took the shelf from 141 boards
     * to 128. Choosing better among hands the board was taking anyway costs
     * nothing at all.
     *
     * IT DOES RE-WEIGHT THE SHELF'S CATEGORIES, and the answer to that is
     * supply rather than a thumb on this scale. A `Contains "X"` pool collides
     * with more boards than `Three Vowels in a Row` does, so ranking on
     * collisions pushed the eleven label templates up to exactly the 65%
     * ceiling `tests/puzzles/wordweb-ladder.test.ts` holds and squeezed three
     * of the six round-13 shape mechanics off the shelf entirely. Guarding it
     * here — preferring an un-templated theme first, or as a tie-break among
     * equally colliding hands — costs the shelf six or seven boards and takes
     * it under the 150 floor. The three thin pools were widened instead (see
     * `WORDPLAY_BANK`), which fixes the cause: a pool that can only deal one
     * hand cannot survive a shelf that wants three.
     */
    const contested = leanest.map((b) => contestedCapacity(
      findTraps(groups.map((g) => (
        g === victim ? { theme: b.theme, tier: g.tier, words: b.words } : g))),
      // Measured at the tier's OWN tightness. Measured at the loose band
      // instead — the band the surplus is allowed to be bought in — the shelf
      // fell from 155 boards to 150 and the share of boards inside the 2–4
      // band fell with it: a hand chosen for a loose collision is a hand not
      // chosen for a tight one, and the tight ones are what the tier's floor
      // is met from.
      spec.minHerringScore,
    ));
    const most = Math.min(CONTESTED_TARGET, Math.max(...contested));
    /**
     * ROUND 18 — and among the hands that tie on the tier's own tightness, the
     * one that also leaves a LOOSE pull on a second tile. The round-17 note
     * above is about replacing the tight measure with the loose one, which
     * cost five boards; this is the loose measure as a tie-break under it,
     * which cannot change which hand wins on tightness and is free.
     */
    const tied = leanest.filter((_, i) => contested[i]! >= most);
    const loose = tied.map((b) => contestedCapacity(
      findTraps(groups.map((g) => (
        g === victim ? { theme: b.theme, tier: g.tier, words: b.words } : g))),
      HERRING_LOOSE,
    ));
    const mostLoose = Math.min(CONTESTED_BAND_TOP, Math.max(...loose));
    const trappiest = tied.filter((_, i) => loose[i]! >= mostLoose);
    /**
     * ROUND 18 (STATUS §5.9) — AND WHERE THAT LEAVES A CHOICE, THE HOUSE WINS.
     *
     * Round 17 tried to buy the manor a place in the shelf twice — composing
     * the plain slot out of `MANOR_BANK` outright (155 → 148 boards) and
     * putting a thumb on the composer's collision score (→ 145, with the manor
     * count going DOWN) — and both failed for the same reason: a house pool
     * that could not contest a tile was competing against pools that could,
     * and buying it a slot meant buying it with a thread. That trade no longer
     * exists. `assertManorCollides` guarantees every house hand carries a word
     * something else on a board can argue with, so a house hand reaches this
     * line having ALREADY won or tied on contested tiles, and preferring it
     * here cannot cost the board the thing round 17 was protecting. Below the
     * contested filter, never above it: the house is a reason to choose
     * between equals, not a reason to ship a quieter board.
     */
    /**
     * ROUND 18 — A POOL THE SHELF HAS NEVER ONCE USED IS NOT STRUCK OUT BY A
     * PREFERENCE, AND THIS IS THE RULE THAT KEEPS THE SIX SHAPE MECHANICS.
     *
     * `trappiest` is a hard FILTER, so a category nothing on a board can argue
     * with loses every single draw it is ever offered for — and there is one
     * pool in the bank that structurally cannot argue with anything:
     * `Spelled Without a Vowel` is RHYTHM/MYTH/NYMPH/LYNX/SYLPH/GLYPH/TRYST/
     * SHYLY, and a word with no vowel in it shares no rhyme, no three-letter
     * edge and none of the bank's `Contains` tokens with any other pool. It is
     * the best category on the shelf by the round-13 argument (nobody sees it,
     * and then they do) and this round's tie-break drove it off the shelf
     * altogether, which `tests/puzzles/wordweb-ladder.test.ts` caught by name.
     *
     * Contested tiles are a preference between equally legal boards; "the
     * shelf actually stocks its thin families" is a rule. So a shape hand
     * rejoins the draw rather than being filtered out of it — not preferred,
     * just present, competing on the same seeded pick as the trappiest hands.
     *
     * It rejoins for all three of its draws, not only its first, and the
     * measurement says why: `Spelled Without a Vowel` and `Three Vowels in a
     * Row` were composed onto exactly two boards each and all four died at a
     * later gate — two on the colour ladder and two on "0 traps, no intruder",
     * which is the same structural fact arriving as a drop instead of as a
     * filter. A pool that ships nothing because both of its two boards
     * happened to fail is not stocked, and `BANK_REUSE_CAP` already caps this
     * at three boards a pool.
     *
     * THE SHAPE FAMILY ONLY, and the narrowness is the argument rather than a
     * fudge. `LETTER_SHAPE_THEMES` is defined in this file as "wordplay whose
     * thread is a property of the word's SHAPE, not of a token" — and a
     * category with no token in it is precisely a category that has nothing
     * for another category to take hold of. Every other family anchors on
     * something a fifth word can carry (a substring, a sound, a compound
     * partner), so every other family can compete on contested tiles and
     * should. Applied to the whole bank this exemption instead handed the
     * compound frames — the fattest family there is, already sitting on its
     * wallpaper ceiling — a free first draw each, and `validate` failed the
     * build at 113 of 161 boards against a 70% budget.
     */
    const unspent = (b: BankGroup) => familyOf(b.theme) === 'letter-shape';
    const debut = leanest.filter(unspent);
    const runners = debut.length === 0 || trappiest.some(unspent)
      ? trappiest
      : [...trappiest, ...debut];
    const house = runners.filter((b) => MANOR_THEMES.has(canon(b.theme)));
    return pick(createRngFrom(rng), house.length > 0 ? house : runners);
  };

  /** Themes this attempt drew from the bank (already counted by `swapIn`). */
  const fromBank = new Set<string>();

  const swapIn = (victim: RawGroup, bank: BankGroup) => {
    bankUse.set(canon(bank.theme), (bankUse.get(canon(bank.theme)) ?? 0) + 1);
    fromBank.add(canon(bank.theme));
    usedSets.add(setKey(bank.words));
    groups = groups.map((g) =>
      g === victim ? { theme: bank.theme, tier: g.tier, words: [...bank.words] } : g,
    );
  };

  /**
   * ROUND 12 (AAA 2.6 / volume-quality) — THE CAP BINDS THE AUTHORED FILE TOO.
   *
   * `bankUse` counted bank draws only, so the anti-wallpaper rule the file
   * documents never applied to the source the shelf actually grew from: "Two
   * Pairs of Double Letters" was authored onto 16 of 167 boards (7 of the 12
   * in the newest batch, whose word sets were near-clones of each other — the
   * pool is ~20 words wide and cannot supply 16 honest hands), and seven more
   * themes sat over budget. An authored group whose theme has already been
   * spent is a FORCED victim here, before any composition work, and it gives
   * way to a like-for-like replacement so the tier's floors are untouched:
   * subtle for subtle, wordplay for wordplay, and a plain category only when
   * the board can spare it.
   */
  // The spent set is fixed on entry. Reading `bankUse` live inside the loop
  // churns forever: the replacement's own count reaches the cap the moment it
  // is taken, so the next pass evicts the group it just installed.
  const spentThemes = new Set(
    groups.map((g) => canon(g.theme))
      .filter((t) => (bankUse.get(t) ?? 0) >= BANK_REUSE_CAP),
  );
  let capGuard = 0;
  for (;;) {
    const victim = groups.find((g) => spentThemes.has(canon(g.theme)));
    if (!victim) break;
    if (capGuard++ >= 4) { lastRefusal = 'theme cap churn'; return null; }
    const plainSpare = plainCount(groups) - spec.minPlain;
    const subtleSpare = subtleCount() - spec.minSubtle;
    const wordplayOk = typeOfTheme(victim.theme) === 'wordplay' || plainSpare > 0;
    // Like for like first — a subtle victim should leave a subtle category
    // behind it. But the subtle shelf is the narrow one, and refusing the
    // board outright when it happens to be empty deleted 22 boards (the whole
    // newest batch, which is where the over-used themes were concentrated) for
    // a floor the board still met. The blunt bank is allowed second, and only
    // while the tier's own subtle floor survives the swap.
    const bank = (isSubtleTheme(victim.theme) ? pickBankGroup(SUBTLE_BANK, victim) : null)
      ?? (wordplayOk && (!isSubtleTheme(victim.theme) || subtleSpare > 0)
        ? pickBankGroup(WORDPLAY_BANK, victim)
        : null)
      // ROUND 13 — like for like, at last. An over-used PLAIN category on a
      // board that cannot spare a plain slot used to refuse the whole board
      // ("no replacement for over-cap theme"), which was the single largest
      // cause of dropped boards, because the bank had nothing plain in it.
      ?? (typeOfTheme(victim.theme) !== 'wordplay' ? pickBankGroup(SEMANTIC_BANK, victim) : null);
    if (!bank) { lastRefusal = `no replacement for over-cap theme "${victim.theme}"`; return null; }
    swapIn(victim, bank);
  }

  /**
   * ROUND 14 — the same eviction, one level up: a MECHANIC FAMILY the pool has
   * already spent (see `FAMILY_BOARD_SHARE`). A protected compound category is
   * never a victim here either — the shelf's compound floor is authored, and
   * `familyAdmissible` is what stops the composer adding to it — so what this
   * loop actually evicts is the third `Contains "X"` flavour of the night.
   */
  const spentFamilies = new Set(
    groups.map((g) => familyOf(g.theme))
      .filter((f) => WALLPAPER_FAMILIES.includes(f) && (familyBoards.get(f) ?? 0) >= familyCapFor(f)),
  );
  let famGuard = 0;
  for (;;) {
    const victim = groups.find(
      (g) => spentFamilies.has(familyOf(g.theme)) && !isProtectedTheme(g.theme),
    );
    if (!victim) break;
    if (famGuard++ >= 4) break;
    const plainSpare = plainCount(groups) - spec.minPlain;
    const subtleSpare = subtleCount() - spec.minSubtle;
    const wordplayOk = typeOfTheme(victim.theme) === 'wordplay' || plainSpare > 0;
    const fresh = (pool: BankGroup[]) => pool.filter((b) => !spentFamilies.has(familyOf(b.theme)));
    const bank = (isSubtleTheme(victim.theme) ? pickBankGroup(fresh(SUBTLE_BANK), victim) : null)
      ?? (wordplayOk && (!isSubtleTheme(victim.theme) || subtleSpare > 0)
        ? pickBankGroup(fresh(WORDPLAY_BANK), victim)
        : null);
    // No replacement in an under-used family: keep the authored category. A
    // budget is a reason to prefer variety, never a reason to ship a hole.
    if (!bank) break;
    swapIn(victim, bank);
  }

  /**
   * ROUND 13 (REVIEW_AA §5.8) — THE BOARD IS NOT ALLOWED TO BE TWO LETTER
   * PUZZLES, AND THE AUTHORED FILE IS FULL OF BOARDS THAT ARE.
   *
   * This is the eviction the whole finding turns on, so it is worth being
   * exact about what it evicts INTO. The bank is entirely wordplay, but it is
   * not entirely letter mechanics: roughly a third of it is compound frames
   * (`___ SMITH`, `Can Follow "BOOK"`, `___ CAKE`), and a compound is the one
   * replacement that satisfies 2.9's wordplay floor while REDUCING the number
   * of times the evening asks her to decode something. So an over-cap letter
   * puzzle gives way to a compound, never to another letter puzzle, and if no
   * compound will land the authored category stays and pass 2's tier gate
   * decides whether the board ships at all.
   *
   * The victim is chosen worst-first among the letter mechanics, by the same
   * quality order the rest of the composer uses, and a group the tier needs
   * for its SUBTLE floor is never offered: at tier 3 the two letter puzzles
   * ARE the two subtle categories, and eating one to satisfy a cap that
   * permits two would be the composer arguing with itself.
   */
  let letterGuard = 0;
  for (;;) {
    const over = letterMechanicCount(groups) - spec.maxLetterMechanics;
    const twins = groups.filter((g) => isLetterMechanicTheme(g.theme))
      .filter((g, _i, arr) => arr.filter((x) => familyOf(x.theme) === familyOf(g.theme)).length > 1);
    if (over <= 0 && twins.length === 0) break;
    if (letterGuard++ >= 4) break;
    const subtleSpare = subtleCount() - spec.minSubtle;
    // Prefer evicting one of a duplicated pair (two rhymes on one board is
    // worse than one rhyme plus one anagram), then the lowest-quality letter
    // mechanic the board can spare.
    const candidates = (twins.length > 0 ? twins : groups.filter((g) => isLetterMechanicTheme(g.theme)))
      .filter((g) => !isSubtleTheme(g.theme) || subtleSpare > 0)
      .sort((a, b) => qualityOf(a.theme) - qualityOf(b.theme)
        || (a.theme < b.theme ? -1 : 1));
    // A plain category may only land while the board can still spare the
    // wordplay it costs (2.9's floor of two is a [BEAT] and is never lowered
    // to make a variety budget close).
    const wordplaySpare = count('wordplay') - spec.minWordplay;
    const pool = wordplaySpare > 0 ? WAY_IN_BANK : COMPOUND_BANK;
    let swapped = false;
    for (const victim of candidates) {
      const bank = pickBankGroup(pool, victim);
      if (!bank) continue;
      swapIn(victim, bank);
      swapped = true;
      break;
    }
    if (!swapped) break;
  }

  // Enforce this tier's composition: trivia cap, wordplay floor, subtle floor.
  // A tier that still owes a SUBTLE category may only take a subtle group —
  // taking a blunt one instead is how a tier-3 board used to quietly ship with
  // tier-1 categories.
  let guard = 0;
  for (;;) {
    const trivia = count('trivia');
    const wordplay = count('wordplay');
    const subtle = subtleCount();
    const plain = plainCount(groups);
    if (trivia <= spec.maxTrivia && wordplay >= spec.minWordplay
      && subtle >= spec.minSubtle && plain >= spec.minPlain) break;
    // ROUND 14: the bank is entirely wordplay, so nothing it can deal ever
    // RAISES the plain count. A board short of the way-in floor used to spin
    // this loop until the guard tripped, six wasted swaps deep, and report
    // itself as "churn"; it is a refusal, and saying so is what let the drop
    // report name real causes.
    if (plain < spec.minPlain) {
      lastRefusal = `${plain} plain categories, tier ${tier} needs ${spec.minPlain} and the bank deals only wordplay`;
      return null;
    }
    if (guard++ >= 8) { lastRefusal = 'composition churn'; return null; }

    const order = replacementOrder(wordplay < spec.minWordplay);
    /**
     * ROUND 13 — WHEN THE BOARD OWES A SUBTLE CATEGORY AND IS ALREADY AT ITS
     * LETTER-MECHANIC CAP, THE VICTIM MUST BE A LETTER MECHANIC.
     *
     * Every subtle category is a letter mechanic, so on a board holding (say)
     * one `Contains "TEN"` at tier 2's cap of one, adding the subtle group the
     * tier owes is refused by `letterOk` no matter which group gives way — and
     * `replacementOrder` offers the semantics first, so the composer ate a
     * plain category, tried again, was refused again, and finally gave up with
     * "the bank has no subtle hand left in an under-used family". That was 21
     * of the 107-board build's drops and the diagnosis was a lie: the bank was
     * full, the swap was simply pointed at the wrong group. Trading the blunt
     * letter puzzle for the subtle one keeps the count flat and is what the
     * tier was asking for in the first place.
     */
    const atLetterCap = letterMechanicCount(groups) >= spec.maxLetterMechanics;
    const victim = (subtle < spec.minSubtle && atLetterCap
      ? order.find((g) => isLetterMechanicTheme(g.theme) && !isSubtleTheme(g.theme))
      : undefined)
      ?? order.find((g) => !isSubtleTheme(g.theme));
    if (!victim) {
      lastRefusal = `no expendable category left (needs ${spec.minWordplay}w/${spec.minSubtle}subtle/${spec.minPlain}plain, has ${wordplay}w/${subtle}subtle/${plain}plain)`;
      return null;
    }
    const bank = subtle < spec.minSubtle
      ? pickBankGroup(SUBTLE_BANK, victim)
      : pickBankGroup(WORDPLAY_BANK, victim);
    if (!bank) {
      lastRefusal = `the bank has no ${subtle < spec.minSubtle ? 'subtle ' : ''}hand left in an under-used family`;
      return null;
    }
    swapIn(victim, bank);
  }

  // --- plant the tier's traps -----------------------------------------------
  // Detection alone leaves the authored boards nearly trap-free, so the
  // generator PLANTS: it swaps a replaceable group for the bank group that
  // maximises tight traps (5th members and letter-rule intruders), never at
  // the cost of a complete unintended grouping or this tier's composition.
  const compositionOk = (gs: RawGroup[]): boolean => {
    const types = gs.map((g) => typeOfTheme(g.theme));
    return types.filter((t) => t === 'trivia').length <= spec.maxTrivia
      && types.filter((t) => t === 'wordplay').length >= spec.minWordplay
      && plainCount(gs) >= spec.minPlain
      && letterMechanicCount(gs) <= spec.maxLetterMechanics
      && gs.filter((g) => isSubtleTheme(g.theme)).length >= spec.minSubtle;
  };

  /**
   * ROUND 11 — the RELATION plant. 65 of 166 boards could only ever offer a
   * `hidden-string` trap, so no amount of choosing between what a board
   * already has could get the pool's dominant thread under budget: the supply
   * itself was monotone. Once a board's trap floor is met, the planter is
   * allowed ONE further swap whose only purpose is to give the room a second
   * kind of sentence to say — and only if it keeps every trap the board
   * already had, its composition, and its zero unintended groupings.
   *
   * ROUND 17 — AND "A SECOND KIND" IS NOW ASKED AS A COUNT, NOT AS A PRICE.
   *
   * The round-11 trigger was `relationCost > RELATION_PRESSURE`: reach for a
   * second thread when the cheapest thread you have is an expensive one. That
   * is a question about the pool's diet, and it answers "no" for a board whose
   * single thread happens to be a cheap relation — which is exactly the board
   * with one thread. `relationSpread` asks the question the player feels: can
   * this board pull two different ways at all? Both triggers stay, because
   * they catch different boards, and the plant is still refused unless it
   * keeps every trap, the composition and the zero unintended groupings.
   */
  const RELATION_PRESSURE = BASE_RELATION_LOAD['doubled-letter'];
  const relTotalNow = Math.max(1, [...relTally.values()].reduce((a, b) => a + b, 0));
  let plants = 0;
  for (;;) {
    const boardTraps = findTraps(groups);
    const have = trapCapacity(boardTraps, spec.minHerringScore);
    const spread = relationSpread(groups, spec.minHerringScore);
    /**
     * ROUND 17 — CONTESTED TILES ARE A TIE-BREAK HERE AND A DECISION IN
     * `pickBankGroup`, AND THE ASYMMETRY IS THE MEASUREMENT.
     *
     * A board's traps overwhelmingly point at ONE outside word (the fifth
     * member of whichever group happens to share a pattern), so "one thread"
     * and "three threads" were routinely the same single contested tile: 118
     * of 141 boards contested exactly one tile against a ceiling of two to
     * four. But making the planter *reach* for a second contested tile spends
     * a whole extra bank theme, and the bank is the scarce resource — that
     * version of this change took the shelf from 141 boards to 128, and a
     * board that leaves contests no tiles at all. So the reaching is done for
     * free, one level up, by choosing WHICH FOUR WORDS a swap the board was
     * having anyway deals in; down here the count only decides which of
     * several equally legal plants to make.
     */
    const needTraps = have < spec.minHerrings;
    const needRelation = !needTraps && plants === 0
      && (spread < RELATION_SPREAD_MIN
        || relationCost(groups, spec.minHerringScore) > RELATION_PRESSURE);
    if ((!needTraps && !needRelation) || plants++ >= 4) break;
    const words = boardWords();
    const themes = boardThemes();
    let best: {
      victim: RawGroup; bank: BankGroup; traps: number; tiles: number;
      slot: number; rel: number; spread: number;
    } | null = null;
    for (const victim of groups) {
      for (const bank of WORDPLAY_BANK.flatMap(bankDraws)) {
        if ((bankUse.get(canon(bank.theme)) ?? 0) >= BANK_REUSE_CAP) continue;
        if (themes.has(bank.theme)) continue;
        if (usedSets.has(setKey(bank.words))) continue;
        // ROUND 14: the planter was the third, invisible source of wallpaper —
        // it reached for `Contains "X"` because that trap scores highest, and
        // it was free to do so on every board. It pays the family budget too.
        if (!familyAdmissible(bank.theme)) continue;
        // …and it never eats a protected compound category to plant a trap.
        if (isProtectedTheme(victim.theme)) continue;
        if (bank.words.some((w) => words.has(w) && !victim.words.includes(w))) continue;
        const next = groups.map((g) =>
          g === victim ? { theme: bank.theme, tier: g.tier, words: [...bank.words] } : g);
        if (!compositionOk(next)) continue;
        if (boardFailures(next).length > 0) continue;
        // ROUND 17 — one `findTraps` per candidate, read four ways. It used to
        // be three (`tightTrapCount`, `relationCost` and `relationSpread` each
        // ran their own) and the planter is the hot loop of the whole build.
        const nextTraps = findTraps(next);
        const nextPicks = chooseTraps(
          nextTraps,
          scoresOf(nextTraps).filter((h) => h.score >= spec.minHerringScore),
          Number.POSITIVE_INFINITY,
          () => 0,
        );
        const traps = nextPicks.length;
        const tiles = Math.min(
          new Set(nextPicks.map((p) => p.intruder)).size, CONTESTED_TARGET,
        );
        const relations = new Set(
          nextTraps.filter((t) => t.score >= spec.minHerringScore).map((t) => t.relation),
        );
        // Round 11: among plants that buy the same number of traps, prefer the
        // one that lands on the slot this board's preference order names first
        // — the planter used to be a second, invisible source of the ssww
        // monoculture (it always swapped whichever group it met first) — and,
        // before that, the one whose traps can be NAMED with an under-used
        // relation. The planter reached for `Contains "X"` almost every time
        // (it scores 3, the highest there is), and `Contains "X"` is always a
        // shared-affix trap, which is most of why 68% of the shelf's
        // acknowledged herrings said the same thing.
        const slot = slotPref.indexOf(victim.tier);
        const rel = relations.size === 0 ? 1 : Math.min(...[...relations].map(
          (r) => (relTally.get(r) ?? 0) / relTotalNow + BASE_RELATION_LOAD[r],
        ));
        // ROUND 17 — and how many DIFFERENT threads the board could then name,
        // saturated at the two the evening needs (a third kind buys the player
        // nothing the second did not already buy).
        const spreadNext = Math.min(relations.size, RELATION_SPREAD_MIN);
        // Traps BEYOND the tier's floor buy nothing (the budget caps what
        // ships), so the comparison saturates there and relation variety wins
        // from that point on. Without the saturation the planter always chose
        // the `Contains "X"` group — it scores 3, the highest there is — and
        // the whole shelf ended up saying the same sentence on a wrong guess.
        const reach = Math.min(traps, spec.minHerrings);
        const bestReach = Math.min(best?.traps ?? -1, spec.minHerrings);
        const bestTiles: number = best?.tiles ?? -1;
        const bestSpread: number = best?.spread ?? -1;
        // Priority: meet the tier's thread floor, then contest a second tile,
        // then be able to say a second KIND of thing, then say the least tired
        // thing, then depth, then the slot this board's victim order names.
        const rank = [reach, tiles, spreadNext, -rel, traps, -slot];
        const bestRank = [bestReach, bestTiles, bestSpread, -(best?.rel ?? 1),
          best?.traps ?? -1, -(best?.slot ?? 99)];
        let better = !best;
        for (let i = 0; !better && best && i < rank.length; i += 1) {
          if (rank[i]! > bestRank[i]! + 1e-9) better = true;
          else if (rank[i]! < bestRank[i]! - 1e-9) break;
        }
        if (!better && best
          && rank.every((v, i) => Math.abs(v - bestRank[i]!) <= 1e-9)
          && bank.theme < best.bank.theme) better = true;
        if (better) {
          best = { victim, bank, traps, tiles, slot, rel, spread: spreadNext };
        }
      }
    }
    if (!best) break;
    if (needTraps && best.traps <= have) break;
    // A relation plant must not cost the board a trap, and must actually buy
    // the thread it was run for — a wider spread of threads, or a cheaper one.
    if (needRelation && (best.traps < have
      || (best.spread <= Math.min(spread, RELATION_SPREAD_MIN)
        && best.rel >= relationCost(groups, spec.minHerringScore) - 1e-9))) break;
    swapIn(best.victim, best.bank);
  }

  // Trivia always sits at the easiest tier: swap tiers with the yellow group.
  const trivia = groups.find((g) => typeOfTheme(g.theme) === 'trivia');
  if (trivia && trivia.tier !== 'yellow') {
    const yellow = groups.find((g) => g.tier === 'yellow')!;
    yellow.tier = trivia.tier;
    trivia.tier = 'yellow';
  }

  // Round 12: every SURVIVING authored theme is spent against the same cap the
  // bank pays (the bank's own draws were counted in `swapIn`). Without this
  // half the ledger was blank and the rule only bound half the corpus.
  for (const g of groups) {
    const k = canon(g.theme);
    if (!fromBank.has(k)) bankUse.set(k, (bankUse.get(k) ?? 0) + 1);
  }
  // Round 14: and the family ledger, once per BOARD per family — the unit the
  // player actually meets ("some flavour of Contains, two nights in three").
  for (const f of boardFamilies()) {
    if (WALLPAPER_FAMILIES.includes(f)) familyBoards.set(f, (familyBoards.get(f) ?? 0) + 1);
  }

  return { ...board, groups, banked: [...fromBank] };
}

/**
 * ROUND 18 (BENCHMARKS §2) — THE LAST FREE CHOICE ON THE BOARD IS WHICH FOUR.
 *
 * Round 17 found that a bank group is a POOL of six to eight verified members
 * and each use draws a distinct FOUR, so which four is free — and taught
 * `pickBankGroup` to spend that freedom on contested tiles. It could only
 * spend it with the information it had AT THE MOMENT OF THE SWAP: the hand
 * that best collided with a half-composed board, judged at the tier's own
 * tightness, among the hands from the least-loaded mechanic family. By the
 * time the composer is finished the board has moved underneath that choice —
 * the planter has swapped another group, a theme-cap eviction has landed a
 * third — and the four words that were the trappiest hand are frequently no
 * longer the trappiest hand of their own pool.
 *
 * So the hands are re-dealt once, against the finished board. This is the
 * cheapest lever in the file and the only one left that costs the shelf
 * NOTHING: the category does not change, so its type, its mechanic family,
 * its quality, its slot, the theme ledger and the family ledger are all
 * untouched, and every candidate hand is four members of the same
 * hand-authored pool that `assertBankIsClean` has already linted. What it
 * cannot do is loosen a rule — a re-deal that would complete an unintended
 * grouping (2.7), repeat a shipped four-word set (2.8) or collide with a word
 * already on the board is refused, and if nothing beats the hand it has, it
 * keeps the hand it has.
 *
 * WHICH GROUPS MAY BE RE-DEALT. Every group the bank dealt, and — this is
 * where most of the reach is, because five sixths of the shelf is authored
 * boards and only one or two of their four categories are ever swapped — every
 * AUTHORED group whose four words are all members of a bank pool of the same
 * category. That second condition is what keeps this honest: it means the pool
 * IS the category a person wrote (the authored file and the bank share the
 * label and the members, which is how `bankUse` can charge them against one
 * ledger), so a re-deal moves four members of a hand-authored eight-member
 * list, exactly as it does for a bank group. Where the authored words are NOT
 * all in the pool, the pool is a different list wearing the same label and the
 * group keeps the four words the author chose.
 */
const BANK_BY_THEME = new Map<string, BankGroup>();
for (const g of [...WORDPLAY_BANK, ...SEMANTIC_BANK]) BANK_BY_THEME.set(canon(g.theme), g);

function redealHands(board: ComposedBoard): ComposedBoard {
  const banked = new Set(board.banked);
  const groups = board.groups.map((g) => ({ ...g, words: [...g.words] }));
  const rank = (gs: readonly RawGroup[]): readonly number[] => {
    const traps = findTraps(gs);
    return [
      Math.min(contestedCapacity(traps, HERRING_TIGHT), CONTESTED_TARGET),
      Math.min(contestedCapacity(traps, HERRING_LOOSE), CONTESTED_BAND_TOP),
    ];
  };
  const better = (a: readonly number[], b: readonly number[]): boolean => {
    for (let i = 0; i < a.length; i += 1) {
      if (a[i]! !== b[i]!) return a[i]! > b[i]!;
    }
    return false;
  };
  // Two passes: raising one group's hand can make a second group's spare
  // members newly worth having. It converges long before this in practice.
  for (let pass = 0; pass < 2; pass += 1) {
    let moved = false;
    for (const g of groups) {
      const pool = BANK_BY_THEME.get(canon(g.theme));
      if (!pool) continue;
      const members = new Set(pool.words);
      if (!banked.has(canon(g.theme)) && !g.words.every((w) => members.has(w))) continue;
      const elsewhere = new Set(groups.filter((x) => x !== g).flatMap((x) => x.words));
      const held = rank(groups);
      const gains: { words: string[]; key: string; r: readonly number[] }[] = [];
      for (const hand of bankDraws(pool)) {
        const key = setKey(hand.words);
        if (key === setKey(g.words)) continue;
        if (usedSets.has(key)) continue;
        if (hand.words.some((w) => elsewhere.has(w))) continue;
        const next = groups.map((x) => (x === g ? { ...x, words: [...hand.words] } : x));
        if (boardFailures(next).length > 0) continue;
        const r = rank(next);
        if (better(r, held)) gains.push({ words: [...hand.words], key, r });
      }
      if (gains.length === 0) continue;
      // Deterministic: the biggest gain, ties broken on the set key.
      gains.sort((a, b) => (better(a.r, b.r) ? -1 : better(b.r, a.r) ? 1 : (a.key < b.key ? -1 : 1)));
      const won = gains[0]!;
      usedSets.add(won.key);
      g.words = won.words;
      moved = true;
    }
    if (!moved) break;
  }
  return { ...board, groups };
}

/** Deterministic sub-rng: fold the parent stream into a fresh seed. */
function createRngFrom(rng: () => number): () => number {
  return createRng(Math.floor(rng() * 0x7fffffff));
}

// ---------------------------------------------------------------------------
// 2.7 / 2.8 — the red-herring solver
// ---------------------------------------------------------------------------

const phonetics = loadPhonetics();

/**
 * All pattern-derived word sets on a board. Each carries the RELATION it is
 * built from (and, where you can point at it, the shared letters) so the trap
 * the solver finds can be named out loud in the room (AAA 2.10).
 */
interface PatternSet {
  key: string;
  relation: HerringRelation;
  detail?: string;
  words: Set<string>;
}

function patternSets(words: string[]): PatternSet[] {
  const sets = new Map<string, PatternSet>();
  const add = (key: string, relation: HerringRelation, detail: string | undefined, w: string) => {
    let s = sets.get(key);
    if (!s) sets.set(key, (s = { key, relation, detail, words: new Set() }));
    s.words.add(w);
  };
  for (const w of words) {
    if (w.length >= 5) add(`suffix:${w.slice(-3)}`, 'shared-affix', w.slice(-3), w);
    if (w.length >= 5) add(`prefix:${w.slice(0, 3)}`, 'shared-affix', w.slice(0, 3), w);
    /**
     * ROUND 12 (AAA 2.10 [BEAT] / 2.7) — THE DOUBLED LETTER MUST BE THE SAME
     * DOUBLED LETTER.
     *
     * This was one bucket: any word containing any doubled letter joined
     * `doubled-letter`, so the "thread" the room bought a wrong guess with was
     * "these words each contain some repeated character" — a property roughly
     * a third of English has, and a grouping no Connections player has ever
     * chased. 52 of the 55 shipped doubled-letter traps had NO doubled letter
     * in common (web-2's was CHILLY/GIRAFFE/MILLER/STAFF/THRILL/WILLOW;
     * web-4's ran DD, FF, OO, KK, EE, LL, CC, SS across six words), and the
     * room charged −2 steps to say "CURRENT, FURROW, KEEP double a letter."
     * The bar's model line ("they *do* all rhyme, don't they?") is informative
     * BECAUSE the relation is real; billing noise as a bought insight is the
     * round-6 misinformation defect in a tighter gate.
     *
     * One bucket per letter, and the letter travels as `detail`, so the room
     * can say "CURRENT, FURROW, SCURRY all double an R" — a thread the player
     * can check on the tiles and could genuinely have been following. Traps
     * that cannot meet it now simply do not exist, which is the demotion the
     * finding asked for: a board with one honest trap beats one with a fake.
     *
     * It also makes `patternFailures` honest in the other direction. The old
     * bucket failed a build when any four words on a board happened to contain
     * any doubled letters — an "unintended complete grouping" nobody could
     * have seen — while four words that genuinely all double an L slid past
     * inside the noise.
     */
    for (const m of new Set((w.match(/([A-Z])\1/g) ?? []).map((p) => p[0]!))) {
      add(`doubled:${m}${m}`, 'doubled-letter', `${m}${m}`, w);
    }
    for (const key of phonetics.rhymeKeysOf(w.toLowerCase())) add(`rhyme:${key}`, 'rhyme', undefined, w);
  }
  return [...sets.values()];
}

/**
 * Cross-board semantic heuristic: another board's intended group acts as a
 * semantic cluster; if ≥4 of its words appear on THIS board, that's a
 * complete unintended semantic grouping.
 */
function crossBoardClusters(board: RawBoard, all: RawBoard[]): { name: string; words: string[] }[] {
  const here = new Set(board.groups.flatMap((g) => g.words));
  const found: { name: string; words: string[] }[] = [];
  for (const other of all) {
    if (other.id === board.id) continue;
    for (const g of other.groups) {
      const overlap = g.words.filter((w) => here.has(w));
      if (overlap.length >= 4) found.push({ name: `${other.id}:"${g.theme}"`, words: overlap });
    }
  }
  return found;
}

/**
 * Semantic 5th-member traps, verified by the corpus rather than guessed at:
 * when three of this board's words sit together inside ANOTHER authored
 * board's category, and two of them belong to one group here while the third
 * belongs elsewhere, that third word genuinely reads as a fifth member. Worth
 * the same as a letter-pattern 5th member (HERRING_TIGHT) — it is the one
 * semantic pull we can prove.
 */
function crossBoardTrapSets(board: RawBoard, all: RawBoard[]): Trap[] {
  const groupOf = new Map<string, RawGroup>();
  for (const g of board.groups) for (const w of g.words) groupOf.set(w, g);
  const traps: Trap[] = [];
  for (const other of all) {
    if (other.id === board.id) continue;
    for (const g of other.groups) {
      const overlap = g.words.filter((w) => groupOf.has(w));
      if (overlap.length !== 3) continue;
      const byGroup = new Map<RawGroup, string[]>();
      for (const w of overlap) {
        const own = groupOf.get(w)!;
        byGroup.set(own, [...(byGroup.get(own) ?? []), w]);
      }
      if (byGroup.size !== 2) continue;
      const minority = [...byGroup.values()].find((ws) => ws.length === 1);
      if (minority) {
        traps.push({
          key: `semantic:${other.id}:${g.theme}`,
          words: overlap,
          intruders: [minority[0]!],
          relation: 'semantic',
          score: HERRING_TIGHT,
        });
      }
    }
  }
  return traps;
}

function sameMembers(a: Iterable<string>, b: string[]): boolean {
  const s = new Set(a);
  return b.length === s.size && b.every((w) => s.has(w));
}

/**
 * Intra-board half of the 2.7 solver: complete unintended groupings formed by
 * a shared letter/sound pattern. Used both by solveBoard and, at composition
 * time, to veto a bank swap that would create one.
 */
/**
 * ROUND 12 — THE COMPOSER MUST SEE THE CLUSTER VETO TOO.
 *
 * `pickBankGroup` and the planter vetoed a swap that would create an
 * unintended complete grouping *by pattern*, but not one created by SEMANTICS
 * — four words that are somebody else's whole category. That check only ran in
 * pass 2, where it is a hard build failure, so every widening of the bank
 * turned into a game of whack-a-mole: install a rhyme pool, watch an unrelated
 * board fail because its new hand happened to complete another board's
 * `Contains "ICE"`. Every composed group is either an authored group or a bank
 * hand, so the union of those two IS the universe of categories a board can
 * accidentally complete, and it can be indexed by word once and asked in
 * sixteen lookups.
 */
const CORPUS_SETS: string[][] = [];
const CORPUS_INDEX = new Map<string, number[]>();
function indexCorpusSets(sets: readonly (readonly string[])[]): void {
  for (const words of sets) {
    const i = CORPUS_SETS.push([...words]) - 1;
    for (const w of words) CORPUS_INDEX.set(w, [...(CORPUS_INDEX.get(w) ?? []), i]);
  }
}

/** Somebody else's whole category, complete on this board. */
function clusterFailures(groups: readonly RawGroup[]): string[] {
  const here = new Set(groups.flatMap((g) => g.words));
  const hits = new Map<number, number>();
  for (const w of here) {
    for (const i of CORPUS_INDEX.get(w) ?? []) hits.set(i, (hits.get(i) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const [i, n] of hits) {
    if (n < 4) continue;
    const overlap = CORPUS_SETS[i]!.filter((w) => here.has(w));
    if (groups.some((g) => sameMembers(overlap, g.words))) continue;
    out.push(`semantic cluster: ${overlap.join(', ')}`);
  }
  return out;
}

/** Every unintended complete grouping a board can carry, pattern or semantic. */
function boardFailures(groups: readonly RawGroup[]): string[] {
  return [...patternFailures(groups), ...clusterFailures(groups)];
}

function patternFailures(groups: readonly RawGroup[]): string[] {
  const words = groups.flatMap((g) => g.words);
  const intended = groups.map((g) => g.words);
  const failures: string[] = [];
  for (const ps of patternSets(words)) {
    if (ps.words.size === 4 && !intended.some((g) => sameMembers(ps.words, g))) {
      failures.push(`pattern ${ps.key}: ${[...ps.words].join(', ')}`);
    }
  }
  return failures;
}

/**
 * Returns build-failing unintended complete groupings and every scored trap
 * the solver found, tightest first. The tier gate decides how many of them
 * actually ship (`minHerringScore` / `maxHerrings`).
 */
interface ScoredHerring { word: string; score: number }

/**
 * A discovered trap: the whole set of words that share a relation, which of
 * them are the intruders (the words the set makes look like they belong when
 * they do not), and what the relation IS. Round 7: this used to return only a
 * word→score map, which is why the room could charge for a wrong guess and
 * then say nothing but "no" — the relation existed at build time and was
 * thrown away before it reached the player (AAA 2.10 [BEAT]).
 */
interface Trap {
  key: string;
  words: string[];
  intruders: string[];
  relation: HerringRelation;
  detail?: string;
  score: number;
}

/**
 * Trap discovery, extracted so composition can *plant* traps rather than only
 * discover them (round 4: tier 3 must ship 2–3 tight ones). Score ≥ 2 means a
 * real pull — a 5th member of a complete group, or a word that literally
 * satisfies another group's stated letter rule.
 */
function findTraps(groups: readonly RawGroup[]): Trap[] {
  const words = groups.flatMap((g) => g.words);
  const groupOf = new Map<string, RawGroup>();
  for (const g of groups) for (const w of g.words) groupOf.set(w, g);
  const traps: Trap[] = [];

  for (const ps of patternSets(words)) {
    const set = [...ps.words];
    if (set.length === 5 || set.length === 6) {
      // A full group + 1–2 extras sharing its pattern: 5th-member traps.
      const byGroup = new Map<RawGroup, string[]>();
      for (const w of set) {
        const g = groupOf.get(w)!;
        byGroup.set(g, [...(byGroup.get(g) ?? []), w]);
      }
      const dominant = [...byGroup.entries()].find(([, ws]) => ws.length === 4);
      if (dominant) {
        traps.push({
          key: ps.key,
          words: set,
          intruders: set.filter((w) => groupOf.get(w) !== dominant[0]),
          relation: ps.relation,
          detail: ps.detail,
          score: 2,
        });
      }
    }
    if (set.length === 3) {
      // Three words sharing a visible pattern across two groups: the minority
      // word(s) read as belonging with the pair — soft cross-category traps.
      const counts = new Map<RawGroup, number>();
      for (const w of set) counts.set(groupOf.get(w)!, (counts.get(groupOf.get(w)!) ?? 0) + 1);
      if (counts.size === 2) {
        const minority = [...counts.entries()].find(([, n]) => n === 1);
        if (minority) {
          traps.push({
            key: ps.key,
            words: set,
            intruders: set.filter((w) => groupOf.get(w) === minority[0]),
            relation: ps.relation,
            detail: ps.detail,
            score: 1,
          });
        }
      }
    }
  }

  // "Contains X" themes are letter-verifiable: an outside word containing X is
  // a cross-category trap for that group.
  //
  // ROUND 7 BUG FIX: this pattern used to require STRAIGHT U+0022 quotes. The
  // round-6 typography pass set every authored theme in curly quotes, so from
  // that moment the tightest, most nameable trap class on the board — "OUT",
  // "EAR", "OVER", "IGHT" and eleven more — scored ZERO on every authored
  // group, and only survived on the straight-quoted bank groups. Four boards
  // shipped trap-free purely because of a quotation mark. Both handednesses
  // are accepted, and `typeset()` is idempotent, so this holds whichever way
  // the authored file is set.
  for (const g of groups) {
    const m = g.theme.match(/^Contains [“"]([A-Z]+)[”"]$/);
    if (!m) continue;
    const outside = words.filter((w) => groupOf.get(w) !== g && w.includes(m[1]!));
    if (outside.length === 0) continue;
    traps.push({
      key: `contains:${m[1]!}`,
      words: [...g.words, ...outside],
      intruders: outside,
      relation: 'hidden-string',
      detail: m[1]!,
      score: 3,
    });
  }

  traps.push(...anchorTraps(groups));
  return traps;
}

/**
 * ROUND 14 (AAA 2.8 / 2.10) — the label's own anchor, sitting on the board.
 * Emitted as a trap so the tier machinery treats it like any other, and keyed
 * `anchor:` so `shippedHerrings` can give it absolute priority: this is the one
 * herring a board is not allowed to leave unnamed.
 */
const ANCHOR_TRAP_PREFIX = 'anchor:';

function anchorTraps(groups: readonly RawGroup[]): Trap[] {
  const onBoard = new Set(groups.flatMap((g) => g.words));
  const out: Trap[] = [];
  for (const g of groups) {
    if (!anchorIsFifthMember(g.theme, g.words, onBoard)) continue;
    const a = anchorOf(g.theme)!;
    out.push({
      key: `${ANCHOR_TRAP_PREFIX}${canon(g.theme)}`,
      words: [...g.words, a.word],
      intruders: [a.word],
      relation: a.kind === 'contains' ? 'hidden-string' : a.kind === 'rhyme' ? 'rhyme' : 'shared-affix',
      // ROUND 13 — every anchor trap points at its anchor, not only the
      // `Contains` ones. An `___ WORD` label with the tile WORD on the board,
      // or `Anagrams of "LEAPS"` beside LEAPS, emitted `shared-affix` with
      // nothing to name, and 2.10's whole claim over Connections is that a
      // wrong guess buys a SENTENCE. The word the label is built on is exactly
      // the thing to say out loud.
      detail: a.word,
      score: 4,
    });
  }
  return out;
}

/** The per-word herring score the tier gates read, folded out of the traps. */
function scoresOf(traps: readonly Trap[]): ScoredHerring[] {
  const herringScore = new Map<string, number>();
  for (const t of traps) {
    for (const w of t.intruders) herringScore.set(w, (herringScore.get(w) ?? 0) + t.score);
  }
  return [...herringScore.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([word, score]) => ({ word, score }));
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * ROUND 12 (AAA 2.7 [BEAT]) — A TIER'S TRAP FLOOR COUNTS THREADS, NOT WORDS.
 *
 * `TIER_SPECS[3]` says `minHerrings: 2` and the file docstring says "tier 3
 * must ship 2–3 traps". What was measured was `ambiguousWords.length` — the
 * flat INTRUDER-WORD list — and what shipped was `herrings.length`, the named
 * threads, which `herringSets` dedupes by pattern key. Two intruder words
 * caught by the same `suffix:GHT` are one trap and one sentence; they counted
 * as two. Result: 25 of the 52 shipped tier-3 boards carried exactly ONE
 * named trap while passing a 2-trap check, so the row the player pays the most
 * steps to reach ran at tier-1 trap density on 48% of its boards and no test
 * could see it.
 *
 * Selection is therefore done in threads from here on. Each chosen trap must
 * contribute a NEW pattern key AND a NEW intruder word, which makes
 * `herrings.length === ambiguousWords.length` an invariant rather than a
 * coincidence, and makes the tier floor mean what it says. Eligibility is
 * unchanged: a word is a candidate intruder when its aggregate herring score
 * clears the tier's `minHerringScore`.
 */
/**
 * ROUND 17 — THE SECOND THREAD IS CHOSEN KNOWING WHAT THE FIRST ONE WAS.
 *
 * Selection used to rank the whole trap list ONCE, against a cost that could
 * only see the pool-wide tallies, and then walk it. That is the right shape
 * while a board ships one thread and the wrong one the moment it ships three:
 * a board holding four rhyme traps and one doubled-letter trap took the three
 * cheapest, which were three rhymes, and the evening said the same sentence
 * three times. Pool-wide the relations looked healthy (no relation over 30% of
 * named threads) because the variety lived BETWEEN boards; what the player
 * meets is one board at a time.
 *
 * So the walk is greedy and the cost is re-asked at every step with the picks
 * so far — which is what lets `shippedHerrings` charge a board for repeating
 * itself. `trapCapacity` passes a constant cost and is unaffected: with a
 * constant cost this is the same deterministic order it always was (score,
 * then key).
 */
function chooseTraps(
  traps: readonly Trap[],
  eligible: readonly ScoredHerring[],
  max: number,
  cost: (
    trap: Trap, intruder: string, picked: readonly { trap: Trap; intruder: string }[],
  ) => number,
  /**
   * ROUND 17 — threads this board has already committed to, so a second call
   * at a looser tightness tops the budget up rather than starting again. See
   * `shippedHerrings`: the tier's FLOOR is met at the tier's own tightness and
   * only the surplus may come from the looser band.
   */
  already: readonly { trap: Trap; intruder: string }[] = [],
): { trap: Trap; intruder: string }[] {
  const score = new Map(eligible.map((h) => [h.word, h.score] as const));
  // A set of fewer than 3 words can never satisfy the room's ≥3-of-4 match
  // rule, so it would be a trap the player can never actually trip.
  const usable = traps.filter(
    (t) => t.words.length >= 3 && t.intruders.some((w) => score.has(w)),
  );
  const bestIntruder = (t: Trap, taken: ReadonlySet<string>): string | null =>
    t.intruders
      .filter((w) => score.has(w) && !taken.has(w))
      .sort((a, b) => score.get(b)! - score.get(a)! || (a < b ? -1 : 1))[0] ?? null;

  const out: { trap: Trap; intruder: string }[] = [...already];
  const keys = new Set<string>(already.map((p) => p.trap.key));
  const taken = new Set<string>(already.map((p) => p.intruder));
  while (out.length < max) {
    const picked = out;
    let best: { trap: Trap; intruder: string; cost: number } | null = null;
    for (const t of usable) {
      if (keys.has(t.key)) continue;
      // Prefer a word no other shipped thread has claimed — the intruder list
      // is what the opening layout clusters on and what the priced intruder
      // hint draws from, so spreading it is worth something. But two threads
      // MAY name the same word: HAMMER caught by `contains:HAM` and by
      // `suffix:MER` is two different sentences about two different sets, and
      // refusing the second one cost the top shelf fifteen boards for no gain
      // the player can feel.
      const intruder = bestIntruder(t, taken) ?? bestIntruder(t, EMPTY);
      if (!intruder) continue;
      const c = cost(t, intruder, picked);
      if (best === null
        || c < best.cost - 1e-9
        || (Math.abs(c - best.cost) <= 1e-9
          && (t.score > best.trap.score
            || (t.score === best.trap.score && t.key < best.trap.key)))) {
        best = { trap: t, intruder, cost: c };
      }
    }
    if (!best) break;
    keys.add(best.trap.key);
    taken.add(best.intruder);
    out.push({ trap: best.trap, intruder: best.intruder });
  }
  return out;
}

/** How many DISTINCT threads this trap list can acknowledge at `minScore`. */
function trapCapacity(traps: readonly Trap[], minScore: number): number {
  const eligible = scoresOf(traps).filter((h) => h.score >= minScore);
  return chooseTraps(traps, eligible, Number.POSITIVE_INFINITY, () => 0).length;
}

/** The same measurement, for a board the composer is still assembling. */
function tightTrapCount(groups: readonly RawGroup[], minScore: number): number {
  return trapCapacity(findTraps(groups), minScore);
}

/**
 * ROUND 17 (BENCHMARKS §2) — HOW MANY DIFFERENT TILES THIS BOARD CONTESTS.
 *
 * Not the same number as `trapCapacity`, and the gap between them is the whole
 * finding. `ambiguousWords` is the deduped INTRUDER list, so two threads about
 * the same word are two named threads and one contested tile; the round-16
 * shelf shipped 1.12 contested tiles on a mean of 1.6 threads. A board that
 * contests one tile is a board where three of the four categories are
 * uncontested, whatever the trap census says.
 */
function contestedCapacity(traps: readonly Trap[], minScore: number): number {
  const eligible = scoresOf(traps).filter((h) => h.score >= minScore);
  const picks = chooseTraps(traps, eligible, Number.POSITIVE_INFINITY, () => 0);
  return new Set(picks.map((p) => p.intruder)).size;
}

/** How many contested tiles the format wants on a board (BENCHMARKS §2: 2–4). */
const CONTESTED_TARGET = 2;

/**
 * ROUND 17 — HOW MANY DIFFERENT KINDS OF THREAD THIS BOARD COULD NAME.
 *
 * `relationCost` answers "is this board's cheapest thread an over-used one",
 * which is a question about the POOL. This one is the question about the
 * EVENING: can the board say two different sentences, or only one sentence
 * twice? Measured on the round-16 shelf with a detector that reads the tiles
 * and ignores the generator's own bookkeeping, 119 of 153 boards carried a
 * cross-group pull and 38 of those (32%) could only ever pull one way — by
 * rhyme. That is the "find the rhyme that isn't the rhyme group" meta.
 */
function relationSpread(groups: readonly RawGroup[], minScore: number): number {
  return new Set(
    findTraps(groups).filter((t) => t.score >= minScore).map((t) => t.relation),
  ).size;
}

/** The board should be able to pull at least two different ways. */
const RELATION_SPREAD_MIN = 2;

/**
 * ROUND 11 — how tired the relations this board's tight traps can be named
 * with already are, as a pool-wide share (0 = a thread nothing has used yet).
 * Read by the planter so it stops reaching for `Contains "X"` every time.
 */
function relationCost(groups: readonly RawGroup[], minScore: number): number {
  const total = Math.max(1, [...relTally.values()].reduce((a, b) => a + b, 0));
  const relations = new Set(
    findTraps(groups).filter((t) => t.score >= minScore).map((t) => t.relation),
  );
  if (relations.size === 0) return 1;
  return Math.min(...[...relations].map(
    (r) => (relTally.get(r) ?? 0) / total + BASE_RELATION_LOAD[r],
  ));
}

/**
 * Composition (pass 1) runs to completion BEFORE a single herring is assigned
 * (pass 2), so the live `relTally` is empty while the planter is choosing and
 * cannot steer it. This is the standing prior it uses instead: how oversupplied
 * each thread is in the corpus as written. `hidden-string` is the glut — every
 * `Contains "X"` group generates one and the trap scores 3, the highest there
 * is — and `semantic` is the scarcity. Small enough (≤0.06) that a live tally
 * still outvotes it once pass 2 is running.
 *
 * ROUND 17 — RHYME WAS PRICED AS A SCARCITY AND IT IS THE OTHER GLUT.
 *
 * It sat at 0.02, equal to `doubled-letter` and equal to `RELATION_PRESSURE`
 * itself, which had a consequence nobody wrote down: `needRelation` requires
 * `relationCost > RELATION_PRESSURE`, so a board whose ONLY tight thread was a
 * rhyme priced out at exactly 0.02 and the diversity plant never fired on it.
 * The one board shape that most needed a second kind of thread was the one
 * shape structurally exempt from being given one. Measured: `rhyme` is the
 * largest single pull kind on the shelf (68 boards of 153) and the sole pull
 * on 38 — dead level with `hidden-string`, which was priced at three times as
 * much. It is priced as what it is.
 */
const BASE_RELATION_LOAD: Record<HerringRelation, number> = {
  'hidden-string': 0.06,
  rhyme: 0.06,
  'shared-affix': 0.04,
  'doubled-letter': 0.02,
  semantic: 0,
};

function solveBoard(
  board: RawBoard,
  all: RawBoard[],
): { failures: string[]; herrings: ScoredHerring[]; traps: Trap[] } {
  const failures = patternFailures(board.groups);
  const intended = board.groups.map((g) => g.words);

  // Cross-board semantic clusters.
  for (const cluster of crossBoardClusters(board, all)) {
    if (!intended.some((g) => sameMembers(cluster.words, g))) {
      failures.push(`semantic cluster ${cluster.name}: ${cluster.words.join(', ')}`);
    }
  }

  // Letter/sound traps plus the corpus-verified semantic ones.
  const traps = [...findTraps(board.groups), ...crossBoardTrapSets(board, all)];
  return { failures, herrings: scoresOf(traps), traps };
}

// ---------------------------------------------------------------------------
// 2.6 — adversarial opening layout
// ---------------------------------------------------------------------------

function rowOf(i: number): number {
  return Math.floor(i / 4);
}

/** No row may hold 3+ words of one intended group (gift rows). */
function hasGiftRow(order: string[], groupIndex: Map<string, number>): boolean {
  for (let r = 0; r < 4; r++) {
    const counts = new Map<number, number>();
    for (let c = 0; c < 4; c++) {
      const gi = groupIndex.get(order[r * 4 + c]!)!;
      counts.set(gi, (counts.get(gi) ?? 0) + 1);
      if (counts.get(gi)! >= 3) return true;
    }
  }
  return false;
}

/** Needs only an id and the composed groups — asks for exactly that. */
function buildLayout(
  board: { id: string; groups: readonly RawGroup[] },
  herrings: string[],
  seed: number,
): string[] {
  const words = board.groups.flatMap((g) => g.words);
  const groupIndex = new Map<string, number>();
  board.groups.forEach((g, i) => g.words.forEach((w) => groupIndex.set(w, i)));

  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = createRng(seed + attempt * 7919);
    const rest = shuffle(rng, words.filter((w) => !herrings.includes(w)));
    // Cluster the herrings adjacently, at a spot that varies per board.
    const cluster = shuffle(rng, [...herrings]);
    const insertAt = herrings.length > 0 ? Math.floor(rng() * (rest.length + 1)) : 0;
    const order = [...rest.slice(0, insertAt), ...cluster, ...rest.slice(insertAt)];
    if (!hasGiftRow(order, groupIndex)) return order;
  }
  // Constraint could not be met (should not happen with 4x4 groups).
  throw new Error(`${board.id}: could not build an adversarial layout`);
}

// ---------------------------------------------------------------------------
// ROUND 14 (AAA 2.11 [BEAT]) — THE PLAUSIBILITY SOLVER.
//
// The naming act is the Library's one [BEAT] over Connections, and it shipped
// as a rubber stamp. Decoys were drawn UNIFORMLY AT RANDOM from other boards'
// same-tier themes, with no test but "must read differently from the answer",
// and it showed: of the 211 shipped decoys that were mechanically checkable
// (`Contains "X"`), 206 matched ZERO of their group's four words. Driven at
// 390x844 on web-d13, the last four tiles were BLACK / TABLE / HILL / DESK and
// the three buttons were "Things in a Cinema", 'Can Follow "HONEY"' and
// "___ TOP". Two of those are obviously dead; the third is satisfied by all
// four words and is arguably a second right answer.
//
// A label is now ADMISSIBLE as a decoy only if the group's own words satisfy
// it 2 or 3 times out of 4: two is the threshold at which the choice is a
// decision, four would be a second correct answer. `validate` hard-fails on a
// shipped decoy that nothing satisfies.
// ---------------------------------------------------------------------------

/**
 * Every category the corpus knows, as a set of member words. This is what
 * makes a SEMANTIC label checkable: "two of these four really are things in a
 * cinema" is a fact about the authored file, not a guess.
 */
const THEME_MEMBERS = new Map<string, Set<string>>();
function indexThemeMembers(groups: readonly { theme: string; words: readonly string[] }[]): void {
  for (const g of groups) {
    const k = canon(g.theme);
    let set = THEME_MEMBERS.get(k);
    if (!set) THEME_MEMBERS.set(k, (set = new Set()));
    for (const w of g.words) set.add(w);
  }
}

/**
 * ROUND 17 (AAA 2.11 [BEAT]) — THE SENSE SHELF: PLAIN-ENGLISH DECOYS.
 *
 * THE FINDING. Of 1,224 shipped decoy labels, 19 were plain English and 1,205
 * were string templates — `Contains "X"` ×357, `Add an "X" for a New Word`
 * ×285, `Rhymes with "X"` ×92. Six of the 194 plain-English groups on the
 * shelf were offered a single plain-English alternative; the other 188 were
 * offered `Weather Phenomena` against `Contains "URR"` and `Contains "BLIZZ"`.
 * The naming act is the Library's one invention over Connections and its wrong
 * answers were giving themselves away BY SHAPE: whatever the label says, the
 * one that looks like a sentence is the answer.
 *
 * WHY THE CORPUS COULD NOT SUPPLY THEM. `labelSatisfiedBy` proves a semantic
 * label by membership: "two of these four really are things in a cinema" is a
 * fact about the authored file. But the uniqueness solver spends the whole
 * build making sure no four words of a board sit together in another category,
 * and the natural consequence is that hardly any TWO do either. The corpus is
 * six hundred categories wide and each word is in one or two of them.
 *
 * WHAT THIS IS. Broad sense fields — the kind of thing a category could be
 * about, rather than a category — indexed exactly like a corpus theme, so a
 * label drawn from here is checkable on the tiles by the same rule as every
 * other label. They are DECOY SUPPLY ONLY: nothing here is ever a board's
 * answer, so `assertBankIsClean` does not police them and no board can ship
 * one as a theme. What a player sees is three plausible sentences, one of
 * which is true of all four tiles and two of which are true of two or three.
 */
const SENSE_BANK: readonly { theme: string; words: readonly string[] }[] = [
  { theme: 'Things Found in a Kitchen', words: ['WHISK', 'GRATER', 'PEELER', 'TONGS', 'MUG', 'POT', 'LOAF', 'BREAD', 'SALT', 'SUGAR', 'JAM', 'NAPKIN', 'TUREEN', 'DECANTER', 'CROCK', 'THERMOS', 'FAUCET', 'TEASPOON', 'TEACUP', 'BEAKER', 'BASKET', 'BUCKET', 'CASK', 'TROUGH', 'FUNNEL', 'RULER', 'MATCHA', 'OOLONG', 'ROOIBOS', 'COFFEE', 'SUGAR', 'BUTTER', 'CRACKERS', 'OATCAKES', 'PRESERVES', 'CHUTNEY'] },
  { theme: 'Things You Can Eat', words: ['BREAD', 'LOAF', 'CAKE', 'COOKIE', 'SCONE', 'PIE', 'TART', 'TARTLET', 'PANCAKE', 'MUFFIN', 'DONUT', 'CROISSANT', 'ECLAIR', 'MACARON', 'BROWNIE', 'STOLLEN', 'POPCORN', 'PEANUT', 'PISTACHIO', 'COCONUT', 'APPLE', 'CHERRY', 'GRAPES', 'STRAWBERRY', 'RASPBERRY', 'BLUEBERRY', 'GOOSEBERRY', 'QUINCE', 'SLOE', 'CARROT', 'RADISH', 'CUCUMBER', 'LETTUCE', 'TOMATO', 'CORN', 'EGG', 'BEEF', 'CHICKEN', 'SALAD', 'SANDWICH', 'PIZZA', 'TACO', 'TORTILLA', 'LASAGNA', 'SPAGHETTI', 'MACARONI', 'RAVIOLI', 'CHEDDAR', 'BRIE', 'GOUDA', 'FETA', 'HALLOUMI', 'MASCARPONE', 'ROQUEFORT', 'WENSLEYDALE', 'BROTH', 'CHOWDER', 'BISQUE', 'MINESTRONE', 'GAZPACHO', 'BOUILLON', 'JAM', 'HONEY', 'SUGAR', 'CHOUX', 'FILO', 'SHORTCRUST', 'VANILLA', 'CAYENNE', 'OREGANO', 'PARSLEY', 'BASIL', 'THYME', 'CHAMOMILE'] },
  { theme: 'Things That Are Sweet', words: ['CAKE', 'COOKIE', 'SCONE', 'PIE', 'TART', 'TARTLET', 'PANCAKE', 'MUFFIN', 'DONUT', 'ECLAIR', 'MACARON', 'BROWNIE', 'STOLLEN', 'JAM', 'SUGAR', 'HONEY', 'VANILLA', 'PRESERVES', 'CHERRY', 'APPLE', 'GRAPES', 'STRAWBERRY', 'RASPBERRY', 'BLUEBERRY', 'GOOSEBERRY', 'BLOSSOM', 'NECTAR', 'PROPOLIS', 'SMILE', 'PRAISE', 'SENTIMENT'] },
  { theme: 'Things Found in a Garden', words: ['ANEMONE', 'BUTTERCUP', 'CLOVER', 'THISTLE', 'NETTLE', 'BRAMBLE', 'HAWTHORN', 'MOSS', 'SEDUM', 'JASMINE', 'SAPLING', 'SEEDLING', 'TWIG', 'PETAL', 'STAMEN', 'SEPAL', 'COMPOST', 'TROWEL', 'SECATEURS', 'PITCHFORK', 'GRAVEL', 'BOULDER', 'STONE', 'HIVE', 'WEB', 'COBWEB', 'BIRD', 'SKYLARK', 'GULL', 'EARWIG', 'APHID', 'WEEVIL', 'SLUG', 'FROG', 'BUTTERFLY', 'FIREFLY', 'BLOSSOM', 'FLOWER', 'FLOWERS', 'PLANT', 'ROOTS', 'WINDFALL', 'BARN', 'GATEPOST', 'BENCH', 'SHELTER', 'WREATH', 'BOUQUET'] },
  { theme: 'Things That Grow', words: ['SAPLING', 'SEEDLING', 'TWIG', 'ROOTS', 'MOSS', 'CLOVER', 'THISTLE', 'NETTLE', 'BRAMBLE', 'HAWTHORN', 'JASMINE', 'BLOSSOM', 'FLOWER', 'FLOWERS', 'PLANT', 'HAIR', 'CHILD', 'CRYSTAL', 'STALACTITE', 'DEPTH', 'TROUBLE', 'BUSINESS', 'MEMORY', 'CROWD', 'RANKS', 'CHARGES'] },
  { theme: 'Things You See in the Sky', words: ['CLOUD', 'CIRRUS', 'CUMULUS', 'STRATUS', 'NIMBUS', 'MOON', 'SUN', 'COMET', 'AURORA', 'THUNDER', 'GALE', 'BREEZE', 'TRADEWIND', 'KITE', 'BALLOON', 'DRONE', 'BIRD', 'GULL', 'SKYLARK', 'PELICAN', 'PUFFIN', 'TERN', 'BUTTERFLY', 'FIREFLY', 'FLIGHT', 'SIGNAL', 'SPIRE', 'TURRET'] },
  { theme: 'Things Made of Metal', words: ['ANCHOR', 'BOLT', 'BUCKLE', 'CHAIN', 'CHISEL', 'COIN', 'COMPASS', 'CUTTER', 'FILE', 'GRATER', 'HAMMER', 'HINGE', 'KEYS', 'LATCH', 'NEEDLE', 'PIN', 'PLIERS', 'POKER', 'RULER', 'SPRIG', 'TACK', 'BRAD', 'THIMBLE', 'TONGS', 'TROWEL', 'WHISK', 'ZIPPER', 'STIRRUP', 'HELMET', 'BELL', 'HANDBELL', 'DOORBELL', 'CHIME', 'HORN', 'CORNET', 'TUBA', 'TROMBONE', 'SAXOPHONE', 'EUPHONIUM', 'TIMPANI', 'RACKET', 'SECATEURS', 'PITCHFORK', 'FAUCET', 'TOGGLE', 'SWITCH', 'FUSE', 'FILAMENT', 'BALLAST'] },
  { theme: 'Things Made of Cloth', words: ['BLANKET', 'CURTAINS', 'NAPKIN', 'TOWEL', 'LINEN', 'VELVET', 'DENIM', 'TWEED', 'LACE', 'RIBBON', 'VEIL', 'SCARF', 'JACKET', 'COAT', 'CARDIGAN', 'GLOVES', 'BOOTS', 'CAP', 'BERET', 'TRILBY', 'BOWLER', 'FEDORA', 'TURBAN', 'CLOCHE', 'LEOTARD', 'RAGLAN', 'GARTER', 'HEM', 'PLAIT', 'SKEIN', 'THREAD', 'WOOL', 'BUNTING', 'CANOPY', 'TENT', 'BAG', 'BAGS', 'CLOTHES', 'SUIT', 'SHADE', 'SASH'] },
  { theme: 'Things You Wear', words: ['JACKET', 'COAT', 'CARDIGAN', 'GLOVES', 'BOOTS', 'CAP', 'BERET', 'TRILBY', 'BOWLER', 'FEDORA', 'TURBAN', 'CLOCHE', 'LEOTARD', 'RAGLAN', 'GARTER', 'SCARF', 'VEIL', 'HELMET', 'VISOR', 'ANKLET', 'BRACELET', 'BROOCH', 'EARRING', 'LOCKET', 'NECKLACE', 'PENDANT', 'CROWN', 'RING', 'BEADS', 'SPECTACLES', 'UMBRELLA', 'SUIT', 'CLOTHES', 'SUNSCREEN', 'GRIN', 'SMILE', 'HAIR'] },
  { theme: 'Things That Hold Water', words: ['BUCKET', 'BEAKER', 'MUG', 'POT', 'TUREEN', 'DECANTER', 'CASK', 'CROCK', 'THERMOS', 'TROUGH', 'FUNNEL', 'PIPETTE', 'MOAT', 'CANAL', 'BATH', 'SPONGE', 'KELP', 'CLOUD', 'WELL', 'TEACUP', 'BASKET', 'CANOE', 'KAYAK', 'FERRY'] },
  { theme: 'Things That Make a Noise', words: ['BELL', 'HANDBELL', 'DOORBELL', 'CHIME', 'ALARM', 'SIREN', 'WHISTLE', 'RATTLE', 'HORN', 'CORNET', 'TUBA', 'TROMBONE', 'SAXOPHONE', 'EUPHONIUM', 'TIMPANI', 'CELLO', 'ORGAN', 'TAMBOURINE', 'CLOCK', 'CRICKET', 'CREAK', 'DRIP', 'GURGLE', 'SIGH', 'GROAN', 'CLATTER', 'PATTER', 'RUSTLE', 'WHISPER', 'ECHO', 'LAUGH', 'VOICE', 'THUNDER', 'EXPLOSION', 'PUNCH', 'NOISE', 'CONCERT', 'SYMPHONY', 'PARROT', 'GULL', 'DOG', 'COW', 'PIG', 'SHEEP'] },
  { theme: 'Things in a Toolshed', words: ['CHISEL', 'FILE', 'HAMMER', 'PLANE', 'PLIERS', 'TROWEL', 'SECATEURS', 'PITCHFORK', 'BROOM', 'LADDER', 'BUCKET', 'TACK', 'BRAD', 'BOLT', 'ROPE', 'TWINE', 'STRING', 'GLUE', 'COMPOST', 'PLOW', 'TRACTOR', 'CRATE', 'SHARPENER', 'CUTTER', 'RULER', 'LEVEL', 'CLAMP'] },
  { theme: 'Things Found on a Desk', words: ['BLOTTER', 'INKWELL', 'QUILL', 'ERASER', 'STAPLER', 'COASTER', 'NOTEBOOK', 'PAPER', 'PAGE', 'INDEX', 'MARGIN', 'GLOSSARY', 'CHAPTER', 'SPINE', 'ENDPAPER', 'SCROLL', 'LETTER', 'NOTICE', 'MAP', 'ATLAS', 'CATALOG', 'RECEIPTS', 'CITATIONS', 'SLIPS', 'PROVERBS', 'RULER', 'SHARPENER', 'LAMP', 'CLOCK', 'MUG', 'FILE', 'PIN', 'RECORD', 'TIMETABLE', 'PLACECARD', 'SPECTACLES', 'TEACUP'] },
  { theme: 'Things in a Church', words: ['ALTAR', 'PEW', 'BISHOP', 'ANGEL', 'CROSS', 'BELL', 'CANDLE', 'CANDLES', 'CANDELABRA', 'ORGAN', 'SPIRE', 'VESTIBULE', 'PORCH', 'ARCH', 'LANCET', 'SCROLL', 'VOWS', 'PRAYER', 'PRAISE', 'WREATH', 'VEIL', 'HYMN'] },
  { theme: 'Things at a Circus', words: ['ACROBAT', 'CLOWN', 'JUGGLER', 'RINGMASTER', 'BALLERINA', 'TENT', 'STALL', 'RAFFLE', 'TOMBOLA', 'PARTY', 'CROWD', 'BALLOON', 'POPCORN', 'BUNTING', 'CANOPY', 'LEOTARD', 'RATTLE', 'WHIP', 'CAMEL', 'HORSE', 'PARROT', 'TRAPEZE'] },
  { theme: 'Living Creatures', words: ['CAMEL', 'HORSE', 'COW', 'PIG', 'SHEEP', 'DOG', 'CAT', 'BEAGLE', 'BULLDOG', 'POODLE', 'DALMATIAN', 'HAMSTER', 'MEERKAT', 'FENNEC', 'TURTLE', 'OCTOPUS', 'SEAHORSE', 'STARFISH', 'URCHIN', 'LIMPET', 'SCALLOP', 'MINNOW', 'FROG', 'SLUG', 'EARWIG', 'APHID', 'WEEVIL', 'CRICKET', 'BUTTERFLY', 'FIREFLY', 'SCORPION', 'BIRD', 'GULL', 'TERN', 'ROOK', 'PUFFIN', 'PELICAN', 'SKYLARK', 'PARROT', 'JELLYFISH', 'CHICKEN', 'GOOSE'] },
  { theme: 'Things That Float', words: ['BALLOON', 'KITE', 'BUBBLE', 'CANOE', 'KAYAK', 'FERRY', 'SCHOONER', 'FRIGATE', 'SLOOP', 'YACHT', 'SHIP', 'RAFT', 'CORKS', 'LILYPAD', 'KELP', 'MOSS', 'FEATHER', 'CLOUD', 'MOON', 'IDEA', 'RUMOUR', 'DRONE', 'SPONGE'] },
  { theme: 'Things That Are Round', words: ['BALL', 'BALLOON', 'BUBBLE', 'COIN', 'RING', 'WREATH', 'MOON', 'SUN', 'EARTH', 'PLATE', 'REEL', 'SPOOL', 'BUTTON', 'HIVE', 'DONUT', 'MACARON', 'PANCAKE', 'SCONE', 'CLOCK', 'COMPASS', 'MONITOR', 'RACKET', 'DRUM', 'TAMBOURINE', 'BASKETBALL', 'SOCCER', 'TOMATO'] },
  { theme: 'Things at a Party', words: ['BALLOON', 'BUNTING', 'CANDLE', 'CANDLES', 'CAKE', 'POPCORN', 'CRACKERS', 'RAFFLE', 'TOMBOLA', 'GIFT', 'RIBBON', 'CROWD', 'GUESTS', 'PLACECARD', 'TOAST', 'CHAMPAGNE', 'JOKE', 'JOKER', 'MUSIC', 'CONCERT', 'RECEPTION', 'INVITATION'] },
  { theme: 'Things That Open and Close', words: ['DOOR', 'GATEWAY', 'PORTAL', 'HATCH', 'CASEMENT', 'DORMER', 'SASH', 'SKYLIGHT', 'FANLIGHT', 'LANCET', 'ORIEL', 'DRAWBRIDGE', 'LATCH', 'HINGE', 'BUCKLE', 'ZIPPER', 'TOGGLE', 'BOOK', 'UMBRELLA', 'SHELL', 'EYE', 'LIPS', 'CURTAINS', 'VENT', 'FLUE', 'DAMPER', 'TRAP'] },
  { theme: 'Things in a Music Room', words: ['CELLO', 'ORGAN', 'TUBA', 'TROMBONE', 'SAXOPHONE', 'CORNET', 'EUPHONIUM', 'TIMPANI', 'TAMBOURINE', 'HORN', 'CHINREST', 'PEGBOX', 'FRET', 'REEDS', 'ROSIN', 'TUNER', 'BATON', 'CONDUCTOR', 'SYMPHONY', 'CONCERT', 'ADAGIO', 'STACCATO', 'PIANISSIMO', 'VIVACE', 'JAZZ', 'BLUES', 'REGGAE', 'FOLK', 'RECORD', 'CHIME'] },
  { theme: 'Things Found at the Seaside', words: ['ANCHOR', 'MAST', 'SCHOONER', 'FRIGATE', 'SLOOP', 'YACHT', 'FERRY', 'CANOE', 'KAYAK', 'SANDCASTLE', 'BUCKET', 'SHELL', 'SCALLOP', 'LIMPET', 'URCHIN', 'STARFISH', 'SEAHORSE', 'OCTOPUS', 'JELLYFISH', 'KELP', 'GULL', 'TERN', 'PUFFIN', 'PELICAN', 'BREEZE', 'GALE', 'TIDE', 'BAY', 'ROPE', 'BOWLINE', 'HITCH', 'REEF', 'SHEEPSHANK', 'BIGHT', 'LASHING', 'SUNSCREEN'] },
  { theme: 'Things That Are Soft', words: ['BLANKET', 'CUSHION', 'FEATHER', 'MOSS', 'WOOL', 'VELVET', 'LACE', 'SPONGE', 'DOUGH', 'BUTTER', 'PETAL', 'BLOSSOM', 'HAIR', 'SKIN', 'LIPS', 'WHISPER', 'SIGH', 'SMILE', 'SHADE', 'LAUNDRY', 'TOWEL', 'CURTAINS'] },
  { theme: 'Parts of a Building', words: ['HALL', 'LANDING', 'STAIRCASE', 'BANISTER', 'BALUSTER', 'NEWEL', 'RISER', 'TREAD', 'NOSING', 'STRINGER', 'RAFTER', 'HAYLOFT', 'PANTRY', 'NURSERY', 'GALLERY', 'BALLROOM', 'CONSERVATORY', 'PORCH', 'VESTIBULE', 'ALCOVE', 'PORTAL', 'GATEWAY', 'CASEMENT', 'DORMER', 'ORIEL', 'SASH', 'SKYLIGHT', 'FANLIGHT', 'LANCET', 'JAMB', 'MANTEL', 'HEARTH', 'FLUE', 'PLINTH', 'SPIRE', 'TURRET', 'WALLS', 'SHELF', 'DOOR', 'ROOST', 'MOAT', 'KEEP'] },
  { theme: 'Things That Are Cold', words: ['ICE', 'SNOW', 'FROST', 'GALE', 'BREEZE', 'MARBLE', 'GRANITE', 'BASALT', 'SHALE', 'STONE', 'CRYSTAL', 'STALACTITE', 'MOON', 'SILENCE', 'SHOULDER', 'FEET', 'COMFORT', 'THERMOS', 'CELLAR', 'DRAUGHT'] },
  { theme: 'Things You Can Hold in One Hand', words: ['COIN', 'KEYS', 'MUG', 'PIN', 'THIMBLE', 'NEEDLE', 'REEL', 'BUTTON', 'BUCKLE', 'BRACELET', 'LOCKET', 'PENDANT', 'BROOCH', 'EARRING', 'QUILL', 'ERASER', 'STAPLER', 'RULER', 'SHARPENER', 'TROWEL', 'CHISEL', 'FILE', 'HAMMER', 'PLIERS', 'TONGS', 'WHISK', 'PEELER', 'GRATER', 'TEACUP', 'TEASPOON', 'SCONE', 'MACARON', 'APPLE', 'CHERRY', 'MAP', 'LETTER', 'BAG'] },
];

const sortedLetters = (w: string): string => [...w].sort().join('');

/**
 * Familiar, cozy-gated English by rhyme key, most-familiar first — the supply
 * the decoy synthesiser and the re-anchorer draw on. Built once, on demand.
 */
let familiarByRhymeCache: Map<string, string[]> | null = null;
function familiarByRhyme(): Map<string, string[]> {
  if (familiarByRhymeCache) return familiarByRhymeCache;
  const out = new Map<string, string[]>();
  const words = [...LEXICON.keys()]
    .filter((w) => w.length >= 3 && isFamiliar(w) && gateOk(w.toLowerCase()))
    .sort((a, b) => LEXICON.get(a)! - LEXICON.get(b)!);
  for (const w of words) {
    for (const key of phonetics.rhymeKeysOf(w.toLowerCase())) {
      out.set(key, [...(out.get(key) ?? []), w]);
    }
  }
  familiarByRhymeCache = out;
  return out;
}

/** A compound the language actually has: BLACK+TOP, HILL+TOP, DESK+TOP. */
function compoundExists(a: string, b: string): boolean {
  return isWord(a + b);
}

/**
 * Does `word` satisfy `label` — under the same heuristics the herring solver
 * runs, plus corpus membership for the categories no rule can model?
 *
 * Deliberately generous on the corpus side and strict on the mechanical side:
 * a false NO costs a candidate decoy (there are hundreds), a false YES ships a
 * decoy the player can disprove on the tiles.
 */
function labelSatisfiedBy(rawLabel: string, word: string): boolean {
  const label = canon(rawLabel);
  if (THEME_MEMBERS.get(label)?.has(word)) return true;
  let m: RegExpMatchArray | null;
  if ((m = label.match(/^Contains "([A-Z]+)"$/))) return word.includes(m[1]!);
  if ((m = label.match(/^Rhymes with "([A-Z]+)"$/))) {
    return word === m[1]! || phonetics.rhymesWith(word.toLowerCase(), m[1]!.toLowerCase());
  }
  if ((m = label.match(/^Anagrams of "([A-Z]+)"$/))) {
    return sortedLetters(word) === sortedLetters(m[1]!);
  }
  if ((m = label.match(/^Can Follow "([A-Z]+)"$/))) return compoundExists(m[1]!, word);
  if ((m = label.match(/^Can Precede "([A-Z]+)"$/))) return compoundExists(word, m[1]!);
  if ((m = label.match(/^___ ([A-Z]+)$/))) return compoundExists(word, m[1]!);
  if ((m = label.match(/^([A-Z]+) ___$/))) return compoundExists(m[1]!, word);
  if (/^Hidden /.test(label)) return hiddenTokenOf(label, word) !== null;
  if (label === 'Palindromes') return word === [...word].reverse().join('');
  if (label === 'Semordnilaps') return isWord([...word].reverse().join(''));
  if (label === 'Two Pairs of Double Letters') {
    return new Set((word.match(/([A-Z])\1/g) ?? [])).size >= 2;
  }
  if (label === 'Starts and Ends with the Same Letter') return word[0] === word[word.length - 1];
  if ((m = label.match(/^Add an? "([A-Z])" for a New Word$/))) {
    const ch = m[1]!;
    for (let i = 0; i <= word.length; i++) {
      if (isWord(word.slice(0, i) + ch + word.slice(i))) return true;
    }
    return false;
  }
  if (label === 'Drop the First Letter for a New Word') return isWord(word.slice(1));
  if (label === 'Drop the Last Letter for a New Word') return isWord(word.slice(0, -1));
  return false;
}

/** How many of a group's four words a candidate label describes. */
function satisfactionOf(label: string, words: readonly string[]): number {
  return words.filter((w) => labelSatisfiedBy(label, w)).length;
}

/**
 * ROUND 14 (AAA 2.8) — THE LABEL'S OWN ANCHOR IS A CANDIDATE MEMBER.
 *
 * 28 of 162 shipped boards printed a category label naming a word sitting on
 * the same board; 25 were deliberate one-away traps and were flagged in
 * `ambiguousWords`. Three were neither flagged nor survivable: web-c01's
 * `Anagrams of "SEPAL"` with SEPAL itself a tile in "Parts of a Flower",
 * web-d05's `Rhymes with "PLUM"` with PLUM in "Things in a Fruit Bowl",
 * web-d25's `Rhymes with "DATE"` with DATE in "Things in a Diary". A word
 * rhymes with itself and is an anagram of itself, so each of those boards had
 * FIVE words satisfying a four-word category — the exact 2.8 break the solver
 * exists to prevent, missed because the checker never asked whether the label's
 * own anchor was on the board.
 */
function anchorOf(rawTheme: string): { kind: 'rhyme' | 'anagram' | 'contains' | 'compound'; word: string } | null {
  const theme = canon(rawTheme);
  let m: RegExpMatchArray | null;
  if ((m = theme.match(/^Rhymes with "([A-Z]+)"$/))) return { kind: 'rhyme', word: m[1]! };
  if ((m = theme.match(/^Anagrams of "([A-Z]+)"$/))) return { kind: 'anagram', word: m[1]! };
  if ((m = theme.match(/^Contains "([A-Z]+)"$/))) return { kind: 'contains', word: m[1]! };
  if ((m = theme.match(/^Can (?:Follow|Precede) "([A-Z]+)"$/))) return { kind: 'compound', word: m[1]! };
  if ((m = theme.match(/^(?:___ ([A-Z]+)|([A-Z]+) ___)$/))) {
    return { kind: 'compound', word: (m[1] ?? m[2])! };
  }
  return null;
}

/** True when the anchor word, standing on this board, is a fifth member. */
function anchorIsFifthMember(theme: string, group: readonly string[], onBoard: ReadonlySet<string>): boolean {
  const a = anchorOf(theme);
  if (!a || !onBoard.has(a.word) || group.includes(a.word)) return false;
  // A word rhymes with itself, is an anagram of itself and contains itself.
  // A compound anchor does not compound with itself unless the language says so.
  return a.kind !== 'compound' || compoundExists(a.word, a.word);
}

/**
 * Re-anchor a label whose anchor is a tile on its own board. The replacement
 * has to be a familiar English word that satisfies the category exactly as the
 * old anchor did for all four members, and that is not itself on the board.
 */
function reAnchor(theme: string, group: readonly string[], onBoard: ReadonlySet<string>): string | null {
  const a = anchorOf(theme);
  if (!a) return null;
  const candidates: string[] = [];
  if (a.kind === 'rhyme') {
    const keys = new Set(phonetics.rhymeKeysOf(a.word.toLowerCase()));
    for (const key of keys) {
      for (const w of familiarByRhyme().get(key) ?? []) {
        if (onBoard.has(w)) continue;
        if (!group.every((g) => phonetics.rhymesWith(g.toLowerCase(), w.toLowerCase()))) continue;
        candidates.push(w);
      }
    }
  } else if (a.kind === 'anagram') {
    const key = sortedLetters(group[0]!);
    for (const w of LEXICON.keys()) {
      if (onBoard.has(w) || !isFamiliar(w) || sortedLetters(w) !== key) continue;
      if (!gateOk(w.toLowerCase())) continue;
      candidates.push(w);
    }
  }
  if (candidates.length === 0) return null;
  // The most familiar word wins — the anchor is the part of the label she has
  // to recognise instantly for the category to read at all — but not the
  // function words at the very top of the frequency list: `Rhymes with "FROM"`
  // and `Rhymes with "THAT"` are technically true and read like a typo.
  const contentful = candidates.filter((w) => w.length >= 4 && LEXICON.get(w)! > 800);
  const relabel = (w: string): string =>
    theme.replace(/[“"][A-Z]+[”"]/, (q) => q[0]! + w + q[q.length - 1]!);
  /**
   * ROUND 13 — RE-ANCHORING MAY NOT CREATE WALLPAPER.
   *
   * `reAnchor` runs after the anti-wallpaper ledger is settled, so it was free
   * to spend a theme string the pool had already spent: three boards carrying
   * `Rhymes with "BLUE"` all re-anchored to the same most-familiar rhyme and
   * shipped as a fourth `Rhymes with "TRUE"`, over `BANK_REUSE_CAP`, and the
   * build failed on a rule none of the three boards had broken. Frequency
   * still decides, but only among the labels the pool can still afford.
   */
  const pool = contentful.length > 0 ? contentful : candidates;
  const affordable = pool.filter((w) => (bankUse.get(canon(relabel(w))) ?? 0) < BANK_REUSE_CAP);
  const chosen = (affordable.length > 0 ? affordable : pool)
    .sort((x, y) => (LEXICON.get(x)! - LEXICON.get(y)!) || (x < y ? -1 : 1))[0]!;
  // The ledger is charged for the new label and refunded for the old one, so a
  // later re-anchor on another board sees the truth.
  const before = canon(theme);
  bankUse.set(before, Math.max(0, (bankUse.get(before) ?? 1) - 1));
  const after = canon(relabel(chosen));
  bankUse.set(after, (bankUse.get(after) ?? 0) + 1);
  return relabel(chosen);
}

// ---------------------------------------------------------------------------
// 2.11 — decoy labels for the act of naming
// ---------------------------------------------------------------------------

/** The lowest number of a group's four words a decoy may describe. */
const DECOY_MIN_SATISFIED = 2;
/** …and the highest: four would be a second right answer, not a decoy. */
const DECOY_MAX_SATISFIED = 3;

/**
 * Every `Contains "X"` label that exactly 2–3 of these four words satisfy,
 * longest string first. This is the synthesiser of last resort and it never
 * comes up empty on real English: some pair of four words always shares a
 * bigram, and every claim it makes is one the player can check on the glass.
 */
function containsCandidates(words: readonly string[], min: number): string[] {
  const counts = new Map<string, number>();
  for (const w of new Set(words)) {
    const seen = new Set<string>();
    for (let n = 5; n >= 2; n--) {
      for (let i = 0; i + n <= w.length; i++) seen.add(w.slice(i, i + n));
    }
    for (const s of seen) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n >= min && n <= DECOY_MAX_SATISFIED)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || (a[0] < b[0] ? -1 : 1))
    .map(([s]) => `Contains "${s}"`);
}

/** Needs only an id and the composed groups — asks for exactly that. */
function assignDecoys(finals: { id: string; groups: OutGroup[]; herrings: OutHerring[] }[]): void {
  // Every label the shelf and the bank between them can offer, canonical-keyed
  // so `Contains "ICE"` and `Contains “ICE”` are one candidate (round 9).
  const labelPool = new Map<string, string>();
  for (const b of finals) for (const g of b.groups) labelPool.set(canon(g.theme), g.theme);
  for (const b of WORDPLAY_BANK) labelPool.set(canon(b.theme), b.theme);
  // ROUND 17 — the sense shelf, which exists only to be offered here.
  for (const s of SENSE_BANK) labelPool.set(canon(s.theme), s.theme);

  for (const board of finals) {
    const rng = createRng([...board.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, SEED));
    /**
     * ROUND 9: dedupe on the CANONICAL theme, not the raw string.
     *
     * The shelf is half-typeset — `Contains "ICE"` in the wordplay bank,
     * `Contains “ICE”` in an authored board — and both print identically
     * through `typeset()` in WordWebView. Raw-string exclusion therefore let
     * web-26 offer the player a naming choice whose decoy READ exactly like
     * the real answer: two identical buttons, one right. Caught by
     * tests/puzzles/anchors.test.ts, which compares the typeset labels.
     */
    const own = new Set(board.groups.map((g) => canon(g.theme)));
    // AAA 2.10's own model line — "they *do* all rhyme, don't they?" — is what
    // a good decoy sounds like, so the board's PLANTED herrings get first
    // refusal: a label that also describes an intruder the layout has already
    // clustered next to this group is the thread she may really have followed.
    const herringWords = new Set(board.herrings.flatMap((h) => h.words));
    /**
     * ROUND 14 — and one label per BOARD, not just per group. The first pass
     * offered `Add an "S" for a New Word` as a decoy on three of web-1's four
     * groups, which turns the naming act into the same three buttons four
     * nights running inside one board. Reuse is a last resort, not a default.
     */
    const boardUsed = new Set<string>();

    for (const g of board.groups) {
      const decoys: string[] = [];
      const taken = new Set<string>();
      let allowReuse = false;
      const offer = (label: string): void => {
        if (decoys.length >= 2) return;
        if (own.has(canon(label)) || taken.has(canon(label))) return;
        if (!allowReuse && boardUsed.has(canon(label))) return;
        taken.add(canon(label));
        boardUsed.add(canon(label));
        decoys.push(label);
      };

      /**
       * ROUND 17 (AAA 2.11 [BEAT]) — A DECOY MUST NOT BE SPOTTABLE BY SHAPE.
       *
       * `Weather Phenomena` beside `Contains "URR"` and `Contains "BLIZZ"` is
       * not a three-way choice, it is a one-way choice printed three times:
       * the label that reads like a sentence is the answer and the labels that
       * read like a regex are not, and a player learns that in one evening.
       * Measured on the round-16 shelf: 1,205 of 1,224 decoys were string
       * templates, and 188 of the 194 plain-English groups were given two
       * mechanical decoys apiece.
       *
       * The rule is that a decoy should be of the SAME KIND as the truth. For
       * a plain-English category that means another plain-English category
       * (the sense shelf is what makes that supply exist); for a wordplay
       * category it means another label of the same MECHANIC FAMILY — a rhyme
       * group is offered another rhyme, a compound frame another compound —
       * because `Rhymes with "MOON"` beside `Add an "S" for a New Word` gives
       * the shape away exactly as badly in the other direction.
       *
       * Nothing here relaxes the round-14 bar: every label offered still has
       * to be satisfied by 2–3 of the group's own four words, and the old
       * order runs underneath as the fallback for a group its own kind cannot
       * supply.
       */
      const wantsPlain = typeOfTheme(g.theme) !== 'wordplay';
      const ownFamily = familyOf(g.theme);
      const kindOf = (label: string): 'plain' | Family =>
        (typeOfTheme(label) !== 'wordplay' ? 'plain' : familyOf(label));
      const matches = (label: string): boolean =>
        (wantsPlain ? kindOf(label) === 'plain' : kindOf(label) === ownFamily);

      /** Corpus labels this group's own tiles satisfy `min`..`max` times. */
      const fromCorpus = (min: number, max: number, sameKindOnly = false): void => {
        const scored: { label: string; n: number; herring: boolean }[] = [];
        for (const [key, label] of labelPool) {
          if (own.has(key)) continue;
          if (sameKindOnly && !matches(label)) continue;
          const n = satisfactionOf(label, g.words);
          if (n < min || n > max) continue;
          const herring = [...herringWords].some(
            (w) => !g.words.includes(w) && labelSatisfiedBy(label, w),
          );
          scored.push({ label, n, herring });
        }
        // Herring-backed first (AAA 2.10's own model line — "they *do* all
        // rhyme, don't they?" — is what a good decoy sounds like), then the
        // label the most of her tiles fit, then a seeded shuffle so the shelf
        // does not converge on one favourite decoy.
        for (const c of shuffle(rng, scored)
          .sort((a, b) => Number(b.herring) - Number(a.herring) || b.n - a.n)) {
          offer(c.label);
        }
      };

      /**
       * Synthesis, for the group no corpus label happens to half-describe.
       * The corpus is 600-odd categories wide and most of them describe none of
       * any given four words, so this is not a rare path: it is what makes
       * "satisfied by ≥2" affordable at all. A synthesised label is held to the
       * same bar as a corpus one and is *more* checkable, not less — the player
       * can disprove it on the tiles, which is the whole point of the act.
       */
      const fromRhyme = (): void => {
        for (const w of g.words) {
          if (decoys.length >= 2) return;
          for (const key of phonetics.rhymeKeysOf(w.toLowerCase())) {
            const anchor = (familiarByRhyme().get(key) ?? []).find((cand) => {
              if (g.words.includes(cand)) return false;
              const label = `Rhymes with "${cand}"`;
              if (own.has(label) || taken.has(label)) return false;
              const n = satisfactionOf(label, g.words);
              return n >= DECOY_MIN_SATISFIED && n <= DECOY_MAX_SATISFIED;
            });
            if (!anchor) continue;
            offer(`Rhymes with "${anchor}"`);
            break;
          }
        }
      };

      // Its own kind first, at the round-14 bar…
      fromCorpus(DECOY_MIN_SATISFIED, DECOY_MAX_SATISFIED, true);
      if (ownFamily === 'rhyme') fromRhyme();
      // …then any kind, which is the round-14 order unchanged.
      fromCorpus(DECOY_MIN_SATISFIED, DECOY_MAX_SATISFIED);
      fromRhyme();
      // A letter string exactly two or three of her tiles carry. Longest first,
      // because a longer string is a more tempting claim and a more specific
      // thing to check.
      for (const label of containsCandidates(g.words, DECOY_MIN_SATISFIED)) offer(label);
      /**
       * THE ONE-TILE FLOOR, and why it is not the ≥2 the finding asked for.
       *
       * Four semantically unrelated words can share NOTHING mechanical: web-d24's
       * SALTY ___ is AIR / SNACK / LANGUAGE / DOG, whose four spellings have not
       * one bigram in common, no two of which rhyme, and no two of which sit in
       * any other authored category together. For a group like that the ≥2 rule
       * is not strict, it is unsatisfiable — so the last resort is a label ONE
       * tile genuinely answers to, which is still a claim she can test and still
       * strictly better than the round-13 shelf, where 206 of 211 checkable
       * decoys described *none* of their four. `validate` fails the build at
       * zero and the census prints how many decoys clear the ≥2 preference.
       */
      if (decoys.length < 2) fromCorpus(1, 1);
      for (const label of containsCandidates(g.words, 1)) offer(label);
      // Only now may a label already spoken for on this board come back.
      if (decoys.length < 2) {
        allowReuse = true;
        fromCorpus(DECOY_MIN_SATISFIED, DECOY_MAX_SATISFIED);
        for (const label of containsCandidates(g.words, 1)) offer(label);
      }
      g.decoys = decoys;
    }
  }
}

// ---------------------------------------------------------------------------
// Build + validate
// ---------------------------------------------------------------------------

/** Does this composed board satisfy `tier`'s category + herring gates? */
function meetsTier(board: RawBoard, traps: readonly Trap[], tier: Tier): boolean {
  const spec = TIER_SPECS[tier];
  const types = board.groups.map((g) => typeOfTheme(g.theme));
  if (types.filter((t) => t === 'trivia').length > spec.maxTrivia) return false;
  if (types.filter((t) => t === 'wordplay').length < spec.minWordplay) return false;
  if (plainCount(board.groups) < spec.minPlain) return false;
  if (letterMechanicCount(board.groups) > spec.maxLetterMechanics) return false;
  if (board.groups.filter((g) => isSubtleTheme(g.theme)).length < spec.minSubtle) return false;
  // Round 12: THREADS, not intruder words — see `chooseTraps`. A board that
  // cannot reach its tier's floor in distinct traps demotes to the tier below
  // rather than shipping at tier-1 trap density with a tier-3 label.
  return trapCapacity(traps, spec.minHerringScore) >= spec.minHerrings;
}

// ---------------------------------------------------------------------------
// ROUND 11 — THE ARCHITECTURE BUDGET (AAA 2.7 / 2.12)
//
// The herring budget was met board by board and violated pool-wide. Measured
// on the round-10 shelf: 86 of 163 boards carried the identical group-type
// signature (yellow semantic / green semantic / blue wordplay / purple
// wordplay); the planted herring's home group sat in the same colour slot on
// 111 of 161 traps; and 119 of 175 named traps were `shared-affix`. So every
// board was solvable by one learned shortcut — find the substring group, find
// the fifth word containing that substring, hand it to a semantic group —
// whatever its words were. The individual traps are good; 163 boards of one
// architecture is volume, not variety, and Connections varies its architecture
// day to day precisely so the meta cannot be learned.
//
// These four tallies are the pool-wide budget. Nothing here can make a board
// unfair: every candidate the steering chooses between has already passed the
// same per-board gates (2.7's zero unintended groupings, 2.8's uniqueness,
// 2.9's composition floors, the tier's trap tightness). The budget only
// decides WHICH of several equally legal boards ships.
// ---------------------------------------------------------------------------

type Slot = RawGroup['tier'];

/** How often each group-type signature (by colour slot) has shipped. */
const sigTally = new Map<string, number>();
/** How often a shipped trap's home group sat in each colour slot. */
const homeTally = new Map<Slot, number>();
/** How often each relation has been the named thread of a shipped trap. */
const relTally = new Map<HerringRelation, number>();

/**
 * The board's architecture: WHICH FOUR DEDUCTIONS it asks for.
 *
 * ROUND 13 — this used to be the four group TYPES read off in colour order
 * (`sswwq`), and that measure dies the moment colours are assigned from
 * measured difficulty (see `chooseColours`): "plain English first,
 * transformation last" is now the promise the ladder MAKES, so every board
 * says it and a budget on the signature would either be vacuous or would
 * forbid the ladder from working. What should still vary night to night is
 * which tricks she meets, and `familySignature` is that.
 */
function signatureOf(groups: readonly RawGroup[]): string {
  return familySignature(groups);
}

/** The four admissible victim orders `main` chooses between. */
const SLOT_PREFS: readonly (readonly Slot[])[] = [
  ['green', 'blue', 'purple', 'yellow'],
  ['purple', 'blue', 'green', 'yellow'],
  ['blue', 'green', 'purple', 'yellow'],
  ['purple', 'green', 'blue', 'yellow'],
];

/**
 * The traps this tier actually ships: tight enough, capped by the budget, and
 * — round 11 — chosen so the pool spreads its traps across the four colour
 * slots and the four relations instead of piling them all on one of each.
 * Score still decides between equals; the tallies only break the ties that
 * `slice(0, maxHerrings)` used to break by alphabet.
 */
function shippedHerrings(
  board: RawBoard,
  herrings: ScoredHerring[],
  traps: readonly Trap[],
  tier: Tier,
  /**
   * ROUND 17 — how many threads this board is being ASKED for, which is the
   * tier's ceiling on the first attempt and less on the retries. See
   * `fitHerrings`: a board ships as many contested tiles as its own colour
   * ladder can carry while still describing itself honestly.
   */
  budget: number = TIER_SPECS[tier].maxHerrings,
  /**
   * The pool-wide spread tallies are a LEDGER, and a speculative attempt must
   * not write to it. `fitHerrings` calls this repeatedly to find the widest
   * budget that fits and commits exactly once.
   */
  commit = true,
): { ship: string[]; named: OutHerring[] } {
  const spec = TIER_SPECS[tier];
  const scored = herrings.filter((h) => h.score >= spec.minHerringScore);
  /**
   * ROUND 13 — the slot a word's group is HEADING FOR, not the one it wears.
   *
   * The board's colours are assigned after this function returns (see
   * `chooseColours` in pass 2), because a trap is part of a group's
   * difficulty. So the home-slot spread this budget polices has to be read
   * off the provisional ladder — the colours the board would wear with no
   * traps planted — rather than off the authored colours, which by this point
   * mean nothing at all.
   */
  const provisional = chooseColours(board.groups, EMPTY);
  const slotOf = new Map<string, Slot>();
  board.groups.forEach((g, i) => { for (const w of g.words) slotOf.set(w, provisional[i]!); });

  /**
   * ROUND 13 (REVIEW_AA §5.8, AAA 2.12) — THE BOARD NEVER TRAPS ITS OWN WAY IN.
   *
   * A planted intruder is a word that belongs to one group and advertises
   * another, and it raises the difficulty of the group it belongs to — which
   * is right, and is why `lateralOf` counts it. It also means that planting
   * one in the easiest category makes the easiest category not easy: measured
   * on the first ladder-assigned build, 74 of ~250 traps homed in the group
   * that would wear yellow, and every one of them either pushed that group out
   * of yellow's band or flattened the board's climb below three.
   *
   * So the gimme is off the table as a trap host. This is a fairness gain in
   * its own right and not merely a tidying: 2.12 asks that the easiest group be
   * found first on ≥70% of boards, and a trapped gimme is precisely the board
   * where it is not. Connections plants in easy groups freely and it is exactly
   * why its yellow sometimes isn't yellow.
   *
   * The fallback is deliberate. If a board's ONLY tight threads live in its
   * gimme, refusing them would leave it with nothing to say on a wrong guess —
   * AAA 2.10's channel dead — and a board that cannot talk is worse than a
   * board with a hard yellow. It takes the trap, and the ladder check then
   * decides whether the result still describes itself honestly.
   *
   * ROUND 17 — AND THAT LAST SENTENCE IS NOW THE WHOLE RULE.
   *
   * The round-13 rule was written as an absolute FILTER with a fallback, and
   * the filter is what capped the format's headline number. Measured with the
   * ceilings raised and hand selection contesting what it could: 75 boards had
   * a second contestable tile available and only 38 shipped one, and the debug
   * dump gave one reason on nearly every board — the second tile lived in the
   * group that would wear yellow, so it was struck out before the budget was
   * ever consulted. (web-a03's two candidates were DRAIN in the blue group and
   * HEEL in the yellow one; web-b01's were CUMULUS in yellow and SHOE in
   * green.)
   *
   * The claim behind the rule was never "yellow may not be contested", it was
   * "a contested yellow stops being a way in" — and that is a MEASURABLE
   * claim, not a structural one. `lateralOf` charges a trapped group its trap,
   * `LATERAL_BANDS` puts yellow's ceiling at 3, and `MIN_LADDER_RISE` requires
   * the climb; a plain taxonomy scores 1 and can carry a trap and still be the
   * easiest thing on the board, while a compound frame scores 4 and cannot.
   * The round-13 code could not tell those two apart because the colours were
   * not assigned yet at this point in the pipeline. `fitHerrings` can: it
   * fits the budget and the colours together and steps the budget down until
   * the ladder is honest.
   *
   * So the gimme is priced rather than fenced. `WAY_IN` sits above the spread
   * shares and below `ANOTHER_SENTENCE_ABOUT_THE_SAME_TILE`, which is the
   * ordering the format wants: contest a tile outside the gimme first;
   * failing that, contest one inside the gimme (the ladder gets a veto);
   * only then say a second thing about a tile she has already been warned of.
   */
  const eligible = scored;

  // Shares, not raw counts: there are four colour slots and five relations but
  // they fill at wildly different rates, and summing the raw tallies let the
  // bigger number decide every tie on its own.
  const homeTotal = Math.max(1, [...homeTally.values()].reduce((a, b) => a + b, 0));
  const relTotal = Math.max(1, [...relTally.values()].reduce((a, b) => a + b, 0));
  const cost = (
    trap: Trap, word: string, picked: readonly { trap: Trap; intruder: string }[],
  ): number => {
    // ROUND 14: an anchor trap is the label naming a tile it does not own. It
    // is the one herring a board may not ship silently (AAA 2.8), so it always
    // wins the budget.
    if (trap.key.startsWith(ANCHOR_TRAP_PREFIX)) return -1000;
    const home = (homeTally.get(slotOf.get(word)!) ?? 0) / homeTotal;
    const rel = (relTally.get(trap.relation) ?? 0) / relTotal;
    /**
     * ROUND 17 — THE BOARD MAY NOT SAY THE SAME SENTENCE TWICE IF IT HAS
     * ANOTHER ONE TO SAY.
     *
     * `home` and `rel` are pool-wide shares and both are bounded above by 1,
     * so `SAME_THREAD` at 10 is not a weight in a blend, it is an ordering: a
     * thread of a kind this board has already named loses to ANY thread of a
     * kind it has not, and only ties with another repeat. When the board has
     * nothing else to offer, every candidate carries the same penalty and the
     * shares decide as before — the rule costs such a board nothing.
     */
    const SAME_THREAD = 10;
    const repeats = picked.filter((p) => p.trap.relation === trap.relation).length;
    /**
     * ROUND 17, AND THIS IS THE ONE THAT MOVED THE HEADLINE NUMBER.
     *
     * `ambiguousWords` is derived from the picks BY DEDUPING THEM, so two
     * threads naming the same tile ship as two named threads and ONE contested
     * tile. Measured with the ceilings already raised: 118 of 141 boards
     * shipped exactly one contested tile, and the debug dump said why —
     * `scoresOf` returned a single eligible intruder on almost every board,
     * and the budget was being spent on second and third sentences about that
     * same word. The board was contested in one place and talked about it
     * three times.
     *
     * A second sentence about a tile she has already been warned about is
     * worth strictly less than a first sentence about a tile she has not, so
     * it is priced above even a repeated relation. It is still a preference,
     * not a ban: a board with one contested tile and three things to say about
     * it says all three rather than going quiet.
     */
    const ANOTHER_SENTENCE_ABOUT_THE_SAME_TILE = 40;
    const saidBefore = picked.filter((p) => p.intruder === word).length;
    /** …and the gimme is contested last of the tiles, never first (2.12). */
    const WAY_IN = 20;
    const gimme = slotOf.get(word) === 'yellow' ? WAY_IN : 0;
    // The relation is weighted heavier because it is the thing the room SAYS
    // out loud on a wrong guess (AAA 2.10); a shelf whose every acknowledged
    // herring says "they do all share those letters" is one learnable trap.
    return home + rel * 4 + gimme + repeats * SAME_THREAD
      + saidBefore * ANOTHER_SENTENCE_ABOUT_THE_SAME_TILE;
  };

  // ROUND 12: one pick per THREAD (see `chooseTraps`) — a distinct pattern key
  // each — so the tier's floor and the room's stock of sentences are the same
  // number. Round 11 chose intruder WORDS and then named whatever trap each
  // happened to fall in, which is how two words inside one `suffix:GHT` shipped
  // as "two traps" and spoke once. `ambiguousWords` is derived from the picks
  // and deduped; it is the layout's clustering list, not the budget.
  /**
   * ROUND 17 (BENCHMARKS §2) — THE TIER'S FLOOR IS TIGHT; THE SURPLUS NEED
   * NOT BE.
   *
   * Measured after the ceilings moved: the budget went unspent on 164 of 167
   * boards for want of TIGHT THREADS and on 3 for want of ladder headroom.
   * The ceiling was never what was binding — supply was — and the supply of
   * score-≥2 threads (a fifth member of a complete group, or a word that
   * literally answers another group's stated rule) is roughly one per board
   * because that is how often four hand-written categories nearly collide.
   *
   * A score-1 thread is the OTHER thing Connections plants: three words across
   * two groups that share something an eye can see, so the odd one out reads
   * as belonging with the pair. It is a weaker pull and it is a real one — the
   * room's ≥3-of-4 rule fires on it, and the sentence it buys on a wrong guess
   * is as true as any other.
   *
   * What the tier promises is unchanged and is still checked: the tier's FLOOR
   * of threads is met at the tier's own `minHerringScore` before this line
   * runs, and only the SURPLUS above that floor may come from the looser band.
   * A tier-3 board still ships two tight threads; it may now also be pulling
   * in two more directions while she solves it, which is what the format is.
   */
  const tight = chooseTraps(traps, eligible, budget, cost);
  const loose = herrings.filter((h) => h.score >= HERRING_LOOSE);
  const distinct = (picks: readonly { intruder: string }[]) =>
    new Set(picks.map((p) => p.intruder)).size;
  /**
   * ROUND 18 (BENCHMARKS §2) — A FULL BUDGET IS NOT THE SAME THING AS A
   * CONTESTED BOARD, AND THIS TEST WAS ASKING THE WRONG ONE.
   *
   * The round-17 rule was "top the budget up from the looser band only when
   * the tight threads did not fill it", which is exactly right about the
   * tier's promise and silently wrong about this round's number. A tier-3
   * board holding four tight threads that all name the SAME tile filled its
   * budget of four, so the looser band was never consulted at all — and the
   * board shipped four sentences about one word while a score-1 pull on a
   * second word sat in the trap list unread. Measured on the shelf this fixes:
   * 14 boards had a second contestable tile available and shipped one.
   *
   * So the budget is topped up when the tight picks fill it and CONTEST TOO
   * LITTLE. The tier's floor is untouched and is still met at the tier's own
   * tightness — `already` keeps exactly `minHerrings` tight threads — and the
   * result is taken only if it contests more tiles than the tight-only
   * selection did, so this can never make a board quieter.
   */
  const enough = tight.length >= budget && distinct(tight) >= CONTESTED_TARGET;
  const widened = spec.minHerringScore <= HERRING_LOOSE || enough
    ? tight
    : chooseTraps(
      traps, loose, budget, cost,
      tight.slice(0, Math.max(spec.minHerrings, tight.length >= budget ? spec.minHerrings : tight.length)),
    );
  const picks = distinct(widened) > distinct(tight) || tight.length < budget ? widened : tight;

  const ship: string[] = [];
  const named: OutHerring[] = [];
  /**
   * ROUND 18 — DEDUPE ON WHAT THE PLAYER READS, NOT ON WHAT THE PICKER COUNTS.
   *
   * `chooseTraps` refuses to pick the same `trap.key` twice, and round 12's
   * note above calls that "one trap, one sentence". It is not: the key is the
   * PATTERN the solver found (`contains:LAND`, `suffix:LAND`), and two
   * different keys can flatten into one identical `OutHerring` — same
   * relation, same detail, same word list — because the emitted thread throws
   * the pattern away and keeps only what the herring line says out loud.
   * Five shipped boards did exactly this: web-39 named
   * `hidden-string/MAN :: COMMAND DEMAND MAN ROMANCE WOMAN` TWICE, word for
   * word, and the room charged for two threads while saying one sentence
   * twice. Deduping on the emitted identity is the only place that can see it.
   *
   * A repeated RELATION is deliberately still allowed: web-32's two `rhyme`
   * threads are ALTHOUGH/DOUGH/THOUGH and FLEA/ME/TEA, which are two different
   * sounds and two different sentences. Only a thread identical in relation,
   * detail AND words is one trap wearing two coats.
   */
  const saidAlready = new Set<string>();
  for (const { trap, intruder } of picks) {
    const said = `${trap.relation}|${trap.detail ?? ''}|${[...trap.words].sort().join(',')}`;
    if (saidAlready.has(said)) continue;
    saidAlready.add(said);
    if (!ship.includes(intruder)) ship.push(intruder);
    if (commit) {
      homeTally.set(slotOf.get(intruder)!, (homeTally.get(slotOf.get(intruder)!) ?? 0) + 1);
      relTally.set(trap.relation, (relTally.get(trap.relation) ?? 0) + 1);
    }
    named.push({
      words: [...trap.words].sort(),
      relation: trap.relation,
      ...(trap.detail ? { detail: trap.detail } : {}),
    });
  }
  return { ship, named };
}

/**
 * ROUND 17 (BENCHMARKS §2) — AS MANY CONTESTED TILES AS THE LADDER CAN CARRY.
 *
 * Raising the ceilings is only half the change, and on its own it is the
 * wrong half. A planted intruder raises the measured difficulty of the group
 * it belongs to (`lateralOf`'s trap axis), so a board handed four threads can
 * push a green group past green's band or flatten its own climb — and
 * `shipsHere` drops a board whose colours no longer describe it, which would
 * have bought contested tiles by shrinking the shelf.
 *
 * The budget is therefore fitted rather than spent: try the tier's ceiling,
 * and step down one thread at a time until the resulting colours are honest,
 * never below the tier's floor. A board that can carry four carries four; a
 * board that can only carry its floor is unchanged from the round-16 shelf.
 * Nothing here can loosen a rule — the ladder check it answers to is the same
 * `ladderProblems` that `shipsHere` and `validate` run, and a board that
 * cannot pass it at its floor still leaves.
 */
/** Why the contested-tile budget went unspent, pool-wide. Census only. */
const fitBlocked = {
  supply: 0, ladder: 0, shipped: 0, boards: 0, capacity: new Map<number, number>(),
};

/**
 * ROUND 18 (standing rule 2 — a metric's name must match what it computes).
 * `fitBlocked.capacity` is tallied over every board `fitHerrings` is called
 * on, which includes the sixty-odd that then leave at their tier gate, so
 * "tiles AVAILABLE" was a census of candidates being read as a census of the
 * shelf. Kept per board id, so the report can ask it of the boards that ship.
 */
const capacityOf = new Map<string, number>();

function fitHerrings(
  board: RawBoard,
  herrings: ScoredHerring[],
  traps: readonly Trap[],
  tier: Tier,
): { ship: string[]; named: OutHerring[]; colours: Slot[]; budget: number } {
  const spec = TIER_SPECS[tier];
  /**
   * WHY a board ships fewer contested tiles than its tier allows — the census
   * prints this split, because "raise the ceiling" and "the ceiling was never
   * what was binding" are different rounds of work and only the measurement
   * can say which one this is.
   */
  const capacity = contestedCapacity(traps, HERRING_LOOSE);
  capacityOf.set(board.id, capacity);
  fitBlocked.capacity.set(capacity, (fitBlocked.capacity.get(capacity) ?? 0) + 1);
  if (capacity < spec.maxHerrings) fitBlocked.supply += 1;
  let fallback: { ship: string[]; named: OutHerring[]; colours: Slot[]; budget: number } | null = null;
  for (let budget = spec.maxHerrings; budget >= spec.minHerrings; budget -= 1) {
    const { ship, named } = shippedHerrings(board, herrings, traps, tier, budget, false);
    const colours = chooseColours(board.groups, new Set(ship));
    const probe: CensusBoard = {
      id: board.id,
      tier,
      groups: board.groups.map((g, i) => ({ theme: g.theme, tier: colours[i]!, words: g.words })),
      ambiguousWords: ship,
    };
    const ok = ladderProblems(probe).length === 0;
    if (fallback === null || ok) fallback = { ship, named, colours, budget };
    if (ok) break;
  }
  // Commit the accepted budget to the pool-wide spread ledger, once.
  const chosen = fallback!;
  /**
   * ROUND 18 (standing rule 2) — this counted `capacity >= spec.maxHerrings`,
   * so a board that could contest two tiles, was allowed three, and was cut to
   * ONE by the colour ladder was filed under "want of tight threads" — the
   * ladder census only ever saw boards whose supply reached the tier ceiling.
   * The question is whether the ladder took a tile the board actually had.
   */
  if (chosen.budget < Math.min(capacity, spec.maxHerrings)) fitBlocked.ladder += 1;
  fitBlocked.shipped += chosen.ship.length;
  fitBlocked.boards += 1;
  const final = shippedHerrings(board, herrings, traps, tier, chosen.budget, true);
  return { ...chosen, ship: final.ship, named: final.named };
}

/**
 * The authoring loop (round 10). Diagnoses every authored board AS WRITTEN —
 * before any bank substitution — against the tier its `difficulty` claims, and
 * never throws. Composition shortfalls the bank can cover are reported as
 * `wants` (the generator will patch them, at the cost of a bank slot); the two
 * things the bank cannot cover — an unintended complete grouping and a gated
 * word — are reported as `BROKEN` and must be fixed in the JSON.
 */
function report(): void {
  let broken = 0;
  let short = 0;
  for (const b of boards) {
    const tier = INTENDED_TIER[b.difficulty] ?? 1;
    const spec = TIER_SPECS[tier];
    const words = b.groups.flatMap((g) => g.words);
    const hard: string[] = [];
    const soft: string[] = [];

    if (new Set(words).size !== 16) hard.push(`${new Set(words).size} unique words`);
    if (new Set(b.groups.map((g) => g.tier)).size !== 4) hard.push('group tiers not distinct');
    for (const w of words) if (!toneOk(w.toLowerCase())) hard.push(`tone gate: ${w}`);
    hard.push(...patternFailures(b.groups));
    for (const c of crossBoardClusters(b, boards)) {
      if (!b.groups.some((g) => sameMembers(c.words, g.words))) {
        hard.push(`semantic cluster ${c.name}: ${c.words.join(', ')}`);
      }
    }

    const types = b.groups.map((g) => typeOfTheme(g.theme));
    const trivia = types.filter((t) => t === 'trivia').length;
    const wordplay = types.filter((t) => t === 'wordplay').length;
    const subtle = b.groups.filter((g) => isSubtleTheme(g.theme)).length;
    if (trivia > spec.maxTrivia) soft.push(`trivia ${trivia} > ${spec.maxTrivia}`);
    if (wordplay < spec.minWordplay) soft.push(`wordplay ${wordplay} < ${spec.minWordplay}`);
    if (subtle < spec.minSubtle) soft.push(`subtle ${subtle} < ${spec.minSubtle}`);
    const tight = tightTrapCount(b.groups, spec.minHerringScore);
    if (tight < spec.minHerrings) soft.push(`traps ${tight} < ${spec.minHerrings} @score≥${spec.minHerringScore}`);

    if (hard.length > 0) {
      broken++;
      console.log(`BROKEN ${b.id} (t${tier}) — ${hard.join(' ; ')}`);
    } else if (soft.length > 0) {
      short++;
      console.log(`wants  ${b.id} (t${tier}) — ${soft.join(' ; ')}`);
    }
  }
  const byTier = ([1, 2, 3] as Tier[])
    .map((t) => `t${t}: ${boards.filter((b) => (INTENDED_TIER[b.difficulty] ?? 1) === t).length}`)
    .join(', ');
  console.log(`\n${boards.length} authored boards (${byTier}) — ${broken} broken, ${short} needing bank help.`);
}

function main() {
  const rng = createRng(SEED);
  // The family budget is a SHARE; turn it into a board count once, against the
  // corpus that is about to be composed, so it cannot loosen as the shelf grows.
  /**
   * ROUND 13 — the shares are shares OF THE SHELF, not of the source corpus.
   * They were measured against `boards.length`, which was the same number
   * until composed boards started making up the shortfall; from that moment a
   * corpus of 237 bought a 45%-of-boards family a licence to appear on 107 of
   * a 154-board shelf, and the cap silently stopped binding. `POOL_FLOOR` is
   * the shelf size the content tests hold the pool to, so a share of it is a
   * share of what the player actually meets.
   */
  FAMILY_BOARD_CAP = Math.round(POOL_FLOOR * FAMILY_BOARD_SHARE);
  LETTER_FAMILY_CAP = Math.round(POOL_FLOOR * LETTER_FAMILY_BOARD_SHARE);

  // Pass 1: compose each board for its INTENDED tier (trivia cap, wordplay
  // floor, subtlety floor). The authored difficulty is the intent; pass 2
  // decides whether the board's measured traps earn it.
  const intent = new Map<string, Tier>(
    boards.map((b) => [b.id, INTENDED_TIER[b.difficulty] ?? 1]),
  );
  const composedTier = new Map<string, Tier>();
  // The composer mutates two globals (which bank themes and which 4-word sets
  // are spoken for), so a speculative attempt has to be undoable.
  const snap = () => ({
    bank: new Map(bankUse), sets: new Set(usedSets), fams: new Map(familyBoards),
  });
  const restore = (s: ReturnType<typeof snap>) => {
    bankUse.clear();
    for (const [k, v] of s.bank) bankUse.set(k, v);
    usedSets.clear();
    for (const k of s.sets) usedSets.add(k);
    familyBoards.clear();
    for (const [k, v] of s.fams) familyBoards.set(k, v);
  };

  /**
   * ROUND 12 — a board whose categories are all already spent LEAVES.
   *
   * This used to throw. That was right while the only thing that could
   * exhaust was the bank (an exhausted bank is a generator bug), and wrong the
   * moment the anti-wallpaper cap started binding authored themes: a board
   * written entirely out of categories three other boards already used has
   * nothing of its own to say, and the honest outcome is the one the rest of
   * the file already takes — it leaves rather than lowering the floor for
   * everyone else. The pool-size floors (tests/content.test.ts ≥150 total,
   * tests/puzzles/anchors.test.ts ≥45 per tier) are what police the total.
   */
  const unbuildable: string[] = [];
  const composed: RawBoard[] = boards.flatMap((b): RawBoard[] => {
    for (let t = intent.get(b.id)!; t >= 1; t--) {
      const before = snap();
      /**
       * ROUND 11 (the architecture budget) — try every admissible victim
       * order and keep whichever produces the LEAST-shipped composition. All
       * of them have passed the same tier gates by the time they are compared,
       * so this buys variety at no cost to fairness; the tally is what stops
       * the pool converging on one template again.
       */
      let best: { board: ComposedBoard; state: ReturnType<typeof snap>; seen: number } | null = null;
      for (const pref of SLOT_PREFS) {
        restore(before);
        const attempt = replaceGroups(b, t as Tier, rng, pref);
        if (!attempt) continue;
        const state = snap();
        /**
         * ROUND 13 — THE COLOURS ARE NO LONGER A VARIABLE HERE.
         *
         * This loop used to try seven `SLOT_SWAPS` variants of every attempt
         * and then run `repairLoudSlots` over each, hunting for a colour
         * arrangement that scored well on a novelty tally. Three heuristics,
         * none of which measured a board's difficulty, and REVIEW_AA §5.8
         * measured the result: across 156 shipped boards yellow's mean lateral
         * distance was 4.38 and green's was 4.15 — the ladder ran BACKWARDS on
         * average — with a purple-minus-yellow spread of 0.33. All three are
         * retired. Colours are assigned once, at the end of pass 2, from
         * `lateralOf`, after the traps are known (`chooseColours`); what this
         * loop still chooses between is which CATEGORIES ship, which is the
         * thing it was always actually good at.
         */
        const variant = attempt;
        // A board that KEEPS its authored trivia gimme gets a head start: the
        // composer is allowed to eat a within-cap trivia category as a last
        // resort to reach the wordplay floor, and with a full bank it started
        // doing that often enough to strip the gimme off the bottom of the
        // house entirely (AAA 2.9 caps trivia at one; it never asked for zero).
        const gimme = variant.groups.some((g) => typeOfTheme(g.theme) === 'trivia');
        /**
         * ROUND 13 (AAA 2.12) — THE WAY-IN FLOOR, which is what
         * `PLAIN_YELLOW_TARGET` was reaching for and could not hold.
         *
         * The old rule counted whether the group WEARING yellow was plain
         * English, which a colour swap could satisfy without changing a single
         * word on the board. The question that matters is whether the board
         * HAS a category she can enter through at all — one she reads rather
         * than decodes (`isWayIn`: lateral distance ≤ 3). 16 of the 156
         * round-12 boards had none, and their yellow group was "plain" only
         * because a compound frame counts as plain English for a different
         * and correct reason. A variant with a way in wins outright.
         */
        const wayIn = variant.groups.some(isWayIn);
        const finish = variant.groups.some((g) => intrinsicLateral(g) >= FINISH_MIN);
        /**
         * ROUND 18 (BENCHMARKS §2) — AND HOW MANY TILES THE VARIANT CONTESTS,
         * WHICH THIS LOOP HAS NEVER ASKED.
         *
         * Four admissible compositions of the same board are compared here on
         * signature novelty, a gimme, a way in and a finish — every property
         * the round-13/14 rounds cared about and not the one this round is
         * graded on. They have all passed the identical tier gates by now, so
         * a board with two contestable tiles and a board with one are equally
         * legal and the loop was taking whichever had the rarer type
         * signature. Weighted at 6 it sits below the way-in floor (8), which
         * is a fairness rule and outranks everything, and above the signature
         * tally, which is a variety budget with headroom (top share 12%
         * against a 25% ceiling) — so the pool buys contested tiles with the
         * slack it has rather than with a board.
         */
        const tiles = Math.min(
          contestedCapacity(findTraps(variant.groups), HERRING_LOOSE), CONTESTED_TARGET,
        );
        const seen = (sigTally.get(signatureOf(variant.groups)) ?? 0)
          - (gimme ? 3 : 0)
          - (wayIn ? 8 : 0)
          - (finish ? 4 : 0)
          - tiles * 3;
        if (!best || seen < best.seen) best = { board: variant, state, seen };
      }
      if (best) {
        restore(best.state);
        // ROUND 18 — the winning combination of CATEGORIES is settled; the
        // four words each bank category puts on the board are not, and that
        // choice is free (see `redealHands`).
        const finalBoard = redealHands(best.board);
        const sig = signatureOf(finalBoard.groups);
        sigTally.set(sig, (sigTally.get(sig) ?? 0) + 1);
        composedTier.set(b.id, t as Tier);
        boardsShipped += 1;
        const y = finalBoard.groups.find((g) => g.tier === 'yellow');
        if (y && isPlainish(y.theme)) plainYellowShipped += 1;
        return [finalBoard];
      }
      restore(before);
    }
    unbuildable.push(`${b.id} (${lastRefusal})`);
    return [];
  });

  /**
   * Pass 1b (ROUND 14, AAA 2.8) — RE-ANCHOR ANY LABEL THAT NAMES ITS OWN
   * FIFTH MEMBER. `Rhymes with "PLUM"` on a board carrying the tile PLUM is a
   * four-word category with five satisfying words; so is
   * `Anagrams of "SEPAL"` beside the tile SEPAL. The anchor moves to a
   * familiar word that satisfies the same four tiles and is NOT on the board
   * ('Rhymes with "SUMMIT"' rather than 'Rhymes with "PLUM"'); a board whose
   * anchor cannot be moved leaves, because the alternative is shipping the
   * uniqueness break the solver exists to prevent.
   */
  const reAnchored: string[] = [];
  const acknowledged: string[] = [];
  const anchored = composed.map((b) => {
    const onBoard = new Set(b.groups.flatMap((g) => g.words));
    for (const g of b.groups) {
      if (!anchorIsFifthMember(g.theme, g.words, onBoard)) continue;
      const fixed = reAnchor(g.theme, g.words, onBoard);
      if (fixed) {
        reAnchored.push(`${b.id} "${g.theme}" → "${fixed}"`);
        g.theme = fixed;
        continue;
      }
      /**
       * `Contains "ICE"` cannot be re-anchored — the token IS the category —
       * so the board takes 2.8's other admissible outcome: the anchor becomes
       * an ACKNOWLEDGED herring. `anchorTraps` emits it as a scored trap and
       * `shippedHerrings` gives it absolute priority, so the tile is on the
       * intruder list, clustered by the opening layout, and named out loud on
       * a wrong guess. A five-word label the room can talk about is a trap;
       * only a silent one is a defect.
       */
      acknowledged.push(`${b.id} "${g.theme}" ⊃ ${anchorOf(g.theme)!.word}`);
    }
    return b;
  });

  // Pass 2: herring solver → tier confirmation (demote, never fake) → layout.
  const allFailures: string[] = [];
  /**
   * ROUND 18 — AN AUTHORED BOARD CAN BE BROKEN BY A BOARD NOBODY WROTE, AND
   * THEN IT IS THE MACHINE'S HAND THAT LEAVES.
   *
   * `crossBoardClusters` reads every other board's categories as semantic
   * clusters, so "web-b11 carries four words that are somebody's whole
   * category" depends on what the composer happened to deal that build. The
   * round-13 rule below is right about the two ordinary cases and had no
   * answer for this one: the first build after the composer started choosing
   * its hands by contested tiles dealt web-s12 the hand BROWN/CLOWN/GOWN/NOUN
   * out of `Rhymes with "CROWN"`, which made four tiles a person had written
   * onto web-b11 four years of rounds ago into an unintended complete
   * grouping, and the build stopped with "fix the authored boards". There is
   * nothing to fix in web-b11. The composed board is the thing that arrived,
   * so it is the thing that leaves, and the survivors are re-solved against
   * the shelf that is actually left — dropping a board changes what every
   * other board's clusters are measured against.
   */
  let pool = anchored;
  let solvedAll = pool.map((b) => ({ board: b, ...solveBoard(b, pool) }));
  const evicted: string[] = [];
  const blamesComposed = new RegExp(`^semantic cluster (${COMPOSED_PREFIX}\\d+):`);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const blamed = new Set<string>();
    for (const s of solvedAll) {
      if (s.board.id.startsWith(COMPOSED_PREFIX)) continue;
      for (const f of s.failures) {
        const m = f.match(blamesComposed);
        if (m) blamed.add(m[1]!);
      }
    }
    if (blamed.size === 0) break;
    for (const id of blamed) evicted.push(id);
    pool = pool.filter((b) => !blamed.has(b.id));
    solvedAll = pool.map((b) => ({ board: b, ...solveBoard(b, pool) }));
  }
  /**
   * ROUND 13 — a composed board that collides simply leaves; an AUTHORED board
   * that collides is a build failure, because a person wrote it and a person
   * should fix it. Same solver, same standard, different remedy.
   */
  const collided = solvedAll.filter(
    (s) => s.failures.length > 0 && s.board.id.startsWith(COMPOSED_PREFIX),
  ).map((s) => s.board.id);
  const solved = solvedAll.filter((s) => !collided.includes(s.board.id));
  for (const s of solved) for (const f of s.failures) allFailures.push(`${s.board.id}: ${f}`);
  if (allFailures.length > 0) {
    console.error(allFailures.join('\n'));
    throw new Error(`word-web solver found ${allFailures.length} unintended complete grouping(s) — fix the authored boards`);
  }

  let demoted = 0;
  const built: OutBoard[] = solved.map(({ board: b, herrings, traps }) => {
    const wanted = composedTier.get(b.id)!;
    let tier = wanted;
    while (tier > 1 && !meetsTier(b, traps, tier)) tier = (tier - 1) as Tier;
    if (tier !== wanted) demoted++;
    /**
     * ROUND 13 (REVIEW_AA §5.8) — THE COLOURS ARE ASSIGNED HERE, FROM THE
     * MEASUREMENT, AND NOWHERE ELSE.
     *
     * This is the last moment at which the board is fully known: the
     * categories are fixed, the solver has run, and — crucially — the traps
     * that ship have been chosen. A planted intruder is part of a group's
     * difficulty (it is the board pulling against you while you solve it), so
     * a ladder assigned before `shippedHerrings` would be grading a board that
     * does not exist yet.
     *
     * ROUND 17 — which is exactly why the trap budget and the colours are now
     * decided together (`fitHerrings`) rather than one after the other.
     */
    const { ship, named, colours } = fitHerrings(b, herrings, traps, tier);
    const layout = buildLayout(b, ship, SEED + [...b.id].reduce((h, c) => h + c.charCodeAt(0), 0));
    return {
      id: b.id,
      tier,
      groups: b.groups.map((g, i) => ({
        ...g,
        tier: colours[i]!,
        type: typeOfTheme(g.theme),
        decoys: [] as string[],
      })),
      ambiguousWords: ship,
      herrings: named,
      layout,
    };
  });

  // Round 7: a board with no trap is a board on which AAA 2.10's acknowledged
  // herring can never fire — the wrong guess buys nothing but "no". Drop it
  // rather than ship a night where the Library is Connections with our prices.
  //
  // ROUND 10 adds the second half of that sentence. Demotion lands a board on
  // a tier it was not composed for, and tier 1 asks for something tier 2 does
  // not — two plain-English categories. A board that arrives at the bottom of
  // the house one category short is not "nearly right", it is a board the
  // composer never built; it leaves rather than lowering the floor for
  // everyone else.
  const shipsHere = (b: OutBoard): boolean => {
    const spec = TIER_SPECS[b.tier];
    const types = b.groups.map((g) => g.type);
    // Round 12: the floor is NAMED THREADS — the number of different sentences
    // the room can say on a wrong guess — not the length of the intruder list.
    /**
     * ROUND 13 (REVIEW_AA §5.8) — A BOARD THAT CANNOT DESCRIBE ITS OWN
     * DIFFICULTY DOES NOT SHIP.
     *
     * The colour ladder could have been a build failure — it is one in
     * `validate`, as a backstop against hand-edited JSON — but a hard failure
     * is the wrong instrument here, for the same reason the tier gates are
     * demotions rather than throws: "this board's four categories do not form
     * a climb" is an editorial fact about that board, not a bug in the
     * generator. Three shapes leave here, and each is a real defect the shelf
     * used to ship:
     *
     *   - NO WAY IN — every category is a compound or a letter puzzle, so
     *     there is nothing to solve first (`Can Precede "LIGHT"` was the
     *     easiest group on two boards);
     *   - NO MIDDLE — three of the four are gimmes, so the board is over in
     *     ninety seconds and then stuck;
     *   - NO CLIMB — purple is within two of yellow, which is the flat board
     *     the review described as "the difficulty colours are decorative"
     *     arriving one board at a time.
     */
    if (ladderProblems(b).length > 0) return false;
    // …and a board that is two rhymes, or two silent letters, is one puzzle
    // printed twice. The composer evicts these where the bank can supply a
    // replacement; where it cannot, the board leaves rather than teaching the
    // player that the Library repeats itself within a single evening.
    const fams = b.groups.filter((g) => isLetterMechanicTheme(g.theme)).map((g) => familyOf(g.theme));
    if (new Set(fams).size !== fams.length) return false;
    /**
     * ROUND 14's visibility rule, kept and moved. A bare edge-token sort in
     * the two slots the player is meant to reach last inverts 2.12 rather than
     * missing it by a margin. Under the measured ladder this is nearly always
     * impossible by construction; where it survives, the board is one whose
     * other three categories are even easier, and that board has no middle.
     */
    if (b.groups.some((g) => visibilityOf(g.theme, g.words) >= VISIBILITY_LOUD
      && (g.tier === 'blue' || g.tier === 'purple'))) return false;
    return b.herrings.length >= spec.minHerrings
      && b.ambiguousWords.length >= 1
      && plainCount(b.groups) >= spec.minPlain
      && types.filter((t) => t === 'wordplay').length >= spec.minWordplay
      && types.filter((t) => t === 'trivia').length <= spec.maxTrivia
      && letterMechanicCount(b.groups) <= spec.maxLetterMechanics
      && b.groups.filter((g) => isSubtleTheme(g.theme)).length >= spec.minSubtle;
  };
  const kept = built.filter(shipsHere);
  /**
   * ROUND 14 — THE DROPS ARE NAMED. Five authored boards left the shelf
   * silently in round 13 and the docs went on counting 167; a board that does
   * not ship is an editorial fact, not a rounding error.
   */
  const droppedIds = built.filter((b) => !shipsHere(b)).map((b) => {
    const spec = TIER_SPECS[b.tier];
    const why: string[] = [];
    if (b.herrings.length < spec.minHerrings) why.push(`${b.herrings.length} traps < ${spec.minHerrings}`);
    if (b.ambiguousWords.length < 1) why.push('no intruder');
    if (plainCount(b.groups) < spec.minPlain) why.push(`${plainCount(b.groups)} plain < ${spec.minPlain}`);
    if (b.groups.filter((g) => g.type === 'wordplay').length < spec.minWordplay) why.push('short of the wordplay floor');
    if (b.groups.filter((g) => isSubtleTheme(g.theme)).length < spec.minSubtle) why.push('short of the subtle floor');
    if (letterMechanicCount(b.groups) > spec.maxLetterMechanics) {
      why.push(`${letterMechanicCount(b.groups)} letter mechanics > ${spec.maxLetterMechanics}`);
    }
    for (const lp of ladderProblems(b)) why.push(`ladder: ${lp.detail}`);
    return `${b.id} @t${b.tier} (${why.join(', ') || 'tier gate'})`;
  });
  const dropped = built.length - kept.length;

  /**
   * ROUND 11 (AAA 2.8 / content quality) — NO 4-WORD SET SHIPS TWICE.
   *
   * The bank can no longer deal the same hand (every draw is checked against
   * `usedSets`), which leaves exactly one source of repetition: the authored
   * file itself, where three sets are written on two boards each
   * (BROCCOLI/CARROT/CELERY/SPINACH on web-11 and web-31, DAISY/LILY/ROSE/TULIP
   * on web-14 and web-54, CRAYON/MARKER/PEN/PENCIL on web-15 and web-50). The
   * later board leaves rather than printing four tiles the player has already
   * met — and `validate` hard-fails if anything slips past this, so a future
   * generator change cannot quietly reintroduce the shelf of near-copies.
   */
  const shippedSets = new Set<string>();
  const out: OutBoard[] = [];
  const deduped: string[] = [];
  for (const b of kept) {
    const keys = b.groups.map((g) => setKey(g.words));
    if (keys.some((k) => shippedSets.has(k))) { deduped.push(b.id); continue; }
    for (const k of keys) shippedSets.add(k);
    out.push(b);
  }

  // Pass 2b: balance. Every board that CAN be tier 3 does not have to BE tier
  // 3 — the bottom rows are visited far more often than the top, so the tier-3
  // shelf keeps only the trappiest TIER3_CAP boards and the rest settle into
  // tier 2 (whose gates they already clear).
  // ROUND 10: 18 was the whole tier-3 shelf when the pool was 51 boards. At 150
  // it would have pinned the top of the house at twelve percent of the content
  // while the middle bulged to eighty boards — the opposite of the ~50/50/50
  // the shelf is meant to hold. The cap still does its original job (a board
  // that CAN be tier 3 need not BE tier 3, and the trappiest ones win the
  // shelf); it is simply sized to the pool it is now sorting.
  const TIER3_CAP = 52;
  const top = out.filter((b) => b.tier === 3)
    .sort((a, b) => b.ambiguousWords.length - a.ambiguousWords.length || (a.id < b.id ? -1 : 1));
  for (const b of top.slice(TIER3_CAP)) {
    b.tier = 2;
    // Round 12: the TRAP list is what the budget counts, so it is what gets
    // trimmed; the intruder list is re-derived from what survives (a word whose
    // only thread was dropped is no longer a planted herring) and the opening
    // layout is rebuilt, because 2.6 asks the survivors to sit adjacent and a
    // subset of an adjacent run need not be one.
    /**
     * ROUND 13 — dropping a trap changes a group's measured difficulty, so the
     * ladder is re-read rather than left describing the board this one used to
     * be. (Missing this is exactly how the colours drifted decorative before.)
     *
     * ROUND 17 — and it is re-read at EVERY length the trim could stop at, for
     * the reason `fitHerrings` exists: the demotion re-costs the board, and a
     * board that was honest carrying four threads at tier 3 need not be honest
     * carrying the first three of them. It keeps the longest prefix whose
     * colours still describe it, never fewer than tier 2's floor. `validate`
     * fails the build if this ever ships a board it did not fix, so the loop
     * cannot quietly paper over a ladder break.
     */
    /**
     * ROUND 18 (BENCHMARKS §2) — THE TRIM KEEPS ONE THREAD PER TILE FIRST.
     *
     * `full.slice(0, n)` keeps a PREFIX of the thread list, and the order of
     * that list is the order `shippedHerrings` chose them in, which is cost
     * order and not tile order. A board demoted off the tier-3 shelf can
     * therefore lose its only sentence about its second contested tile while
     * keeping a second sentence about its first — the trim undoing what the
     * budget just bought. Re-ordered so that the first thread about each
     * distinct tile comes first and the repeats follow, every prefix length
     * contests as many tiles as it can. HONEST ABOUT ITS SIZE: measured on
     * this shelf it moves nothing, because the cost function already prices a
     * repeat tile at 40 and so rarely puts one before a first. It is kept
     * because the hazard is real and free to close, not because it paid.
     */
    const shipped = [...b.ambiguousWords];
    const seenTile = new Set<string>();
    const firstPerTile: OutHerring[] = [];
    const repeats: OutHerring[] = [];
    for (const h of b.herrings) {
      const tile = shipped.find((w) => h.words.includes(w));
      if (tile !== undefined && !seenTile.has(tile)) { seenTile.add(tile); firstPerTile.push(h); }
      else repeats.push(h);
    }
    const full = [...firstPerTile, ...repeats];
    const spec2 = TIER_SPECS[2];
    for (let n = Math.min(full.length, spec2.maxHerrings); n >= spec2.minHerrings; n -= 1) {
      b.herrings = full.slice(0, n);
      // Round 12: the TRAP list is what the budget counts, so it is what gets
      // trimmed; the intruder list is re-derived from what survives (a word
      // whose only thread was dropped is no longer a planted herring) and the
      // opening layout is rebuilt, because 2.6 asks the survivors to sit
      // adjacent and a subset of an adjacent run need not be one.
      b.ambiguousWords = shipped.filter((w) => b.herrings.some((h) => h.words.includes(w)));
      const recoloured = chooseColours(b.groups, new Set(b.ambiguousWords));
      b.groups.forEach((g, i) => { g.tier = recoloured[i]!; });
      if (ladderProblems(b).length === 0 || n === spec2.minHerrings) break;
    }
    b.layout = buildLayout(
      b, b.ambiguousWords, SEED + [...b.id].reduce((h, c) => h + c.charCodeAt(0), 0),
    );
  }

  // Pass 3: decoys for the naming act.
  assignDecoys(out);

  validate(out);

  /**
   * ROUND 12 — the generator sets its own type. Bank themes are written with
   * straight quotes (`Contains "TEN"`) and the shipped corpus must carry curly
   * ones, so every regeneration used to leave the pool failing
   * `content:lint-typography` until somebody remembered to run it with
   * `--fix` — which means `npm run content:all` red on a clean checkout, and a
   * half-typeset word-web.json is exactly the defect round 11 spent a pass on.
   * `typesetDeep` is idempotent, so this is a no-op on anything already set.
   */
  writeFileSync(join(here, 'generated', 'word-web.json'), JSON.stringify(typesetDeep(out)));
  const perTier = ([1, 2, 3] as Tier[]).map((t) => {
    const arr = out.filter((b) => b.tier === t);
    const avgHerrings = arr.reduce((a, b) => a + b.herrings.length, 0) / Math.max(1, arr.length);
    const subtle = arr.reduce((a, b) => a + b.groups.filter((g) => isSubtleTheme(g.theme)).length, 0) / Math.max(1, arr.length);
    return `t${t} (${tierLabel(t)}): ${arr.length} boards (~${avgHerrings.toFixed(1)} traps, ~${subtle.toFixed(1)} subtle cats)`;
  }).join(', ');
  const trivia = out.filter((b) => b.groups.some((g) => g.type === 'trivia')).length;
  const byRelation = new Map<string, number>();
  for (const b of out) for (const h of b.herrings) byRelation.set(h.relation, (byRelation.get(h.relation) ?? 0) + 1);
  const sigs = architectureCensus(out);
  const keptCapacity = new Map<number, number>();
  let unrealised = 0;
  for (const b of out) {
    const cap = capacityOf.get(b.id) ?? 0;
    keptCapacity.set(cap, (keptCapacity.get(cap) ?? 0) + 1);
    if (cap >= CONTESTED_TARGET && b.ambiguousWords.length < CONTESTED_TARGET) unrealised += 1;
  }
  const shippedCapacity = [...keptCapacity].sort((a, b) => a[0] - b[0])
    .map(([k, n]) => `${k}:${n}`).join(' ');
  const familyLine = sigs.families
    .map(([f, n]) => `${f} ${n} (${((n / Math.max(1, out.length)) * 100).toFixed(0)}%)`).join(', ');
  const shapeLine = sigs.shape.map(([w, n]) => `${w}w ${n}`).join(', ');
  console.log(
    `word-web.json: ${out.length} boards — ${perTier}; ${demoted} demoted for want of tight traps, ` +
    `${dropped} dropped at their tier gate${droppedIds.length ? ` (${droppedIds.join('; ')})` : ''}, ` +
    `${reAnchored.length} labels re-anchored off their own board${reAnchored.length ? ` (${reAnchored.join('; ')})` : ''}, ` +
    `${acknowledged.length} labels whose anchor is a tile, forced onto the intruder list${acknowledged.length ? ` (${acknowledged.join('; ')})` : ''}, ` +
    `${evicted.length} composed boards evicted for breaking an authored one`
    + `${evicted.length ? ` (${evicted.join(', ')})` : ''}, ` +
    `${unbuildable.length} dropped for having no category left to itself`
    + `${unbuildable.length ? ` (${unbuildable.join(', ')})` : ''}, ${deduped.length} dropped for repeating a shipped 4-word set` +
    `${deduped.length ? ` (${deduped.join(', ')})` : ''}, ` +
    `${trivia} with a (yellow-tier) trivia category, bank hands dealt: ${[...bankUse.values()].reduce((a, b) => a + b, 0)}; ` +
    `named herrings by relation: ${[...byRelation].map(([r, n]) => `${r} ${n}`).join(', ')}\n` +
    `  architecture: signatures ${sigs.signatures.map(([s, n]) => `${s} ${n}`).join(', ')}` +
    ` (top ${(sigs.topShare * 100).toFixed(0)}%); trap home slot ${sigs.home.map(([s, n]) => `${s} ${n}`).join(', ')};` +
    ` relations ${sigs.relations.map(([r, n]) => `${r} ${n}`).join(", ")} (top ${(sigs.topRelationShare * 100).toFixed(0)}%)\n` +
    `  families: ${familyLine} (budget ${(ARCHITECTURE_BUDGET.maxFamilyShare * 100).toFixed(0)}%);` +
    ` wordplay per board: ${shapeLine};` +
    ` plain yellow ${(sigs.plainYellowShare * 100).toFixed(0)}%;` +
    ` decoys ${sigs.decoys}, ${(sigs.decoyPlausibleShare * 100).toFixed(0)}% satisfied by ≥2 of their own four\n` +
    `  contested tiles: ${(sigs.contestedMean).toFixed(2)} mean, ${(sigs.contestedInBand * 100).toFixed(0)}%`
    + ` in Connections' 2–4 band (BENCHMARKS §2); budget unspent for want of tight threads on`
    + ` ${fitBlocked.supply} boards, for want of ladder headroom on ${fitBlocked.ladder};`
    + ` threads per board: ${sigs.threadSpread};`
    + ` tiles AVAILABLE on the SHIPPED shelf: ${shippedCapacity};`
    + ` unrealised (available ≥2, shipped 1): ${unrealised}`,
  );
}

/**
 * ROUND 11 — the pool-wide architecture census. Board-level fairness is
 * necessary and was never the problem; this is the measurement that catches a
 * shelf of 163 boards with one learnable shape.
 */
function architectureCensus(puzzles: readonly OutBoard[]) {
  const sig = new Map<string, number>();
  for (const p of puzzles) {
    const s = signatureOf(p.groups);
    sig.set(s, (sig.get(s) ?? 0) + 1);
  }
  const signatures = [...sig].sort((a, b) => b[1] - a[1]);
  const home = new Map<Slot, number>();
  let herrings = 0;
  let affix = 0;
  for (const p of puzzles) {
    for (const w of p.ambiguousWords) {
      const g = p.groups.find((x) => x.words.includes(w));
      if (g) home.set(g.tier, (home.get(g.tier) ?? 0) + 1);
    }
    for (const h of p.herrings) {
      herrings += 1;
      if (h.relation === 'shared-affix') affix += 1;
    }
  }
  const homeTotal = [...home.values()].reduce((a, b) => a + b, 0);
  const byRelation = new Map<HerringRelation, number>();
  for (const p of puzzles) {
    for (const h of p.herrings) byRelation.set(h.relation, (byRelation.get(h.relation) ?? 0) + 1);
  }
  const relations = [...byRelation].sort((a, b) => b[1] - a[1]);
  // ROUND 14 — the mechanic-family census: how many BOARDS carry some flavour
  // of each trick, and how many wordplay categories each board runs.
  const fam = new Map<Family, number>();
  for (const p of puzzles) {
    for (const f of new Set(p.groups.map((g) => familyOf(g.theme)))) {
      if (WALLPAPER_FAMILIES.includes(f)) fam.set(f, (fam.get(f) ?? 0) + 1);
    }
  }
  const families = [...fam].sort((a, b) => b[1] - a[1]);
  const shape = new Map<number, number>();
  for (const p of puzzles) {
    const w = p.groups.filter((g) => g.type === 'wordplay').length;
    shape.set(w, (shape.get(w) ?? 0) + 1);
  }
  const plainYellow = puzzles.filter((p) => {
    const y = p.groups.find((g) => g.tier === 'yellow');
    return !!y && isPlainish(y.theme);
  }).length;
  // ROUND 14 (AAA 2.11) — how many shipped decoys are a real decision: a label
  // ≥2 of the group's own four words answer to.
  let decoys = 0;
  let decoysPlausible = 0;
  for (const p of puzzles) {
    for (const g of p.groups) {
      for (const d of g.decoys) {
        decoys += 1;
        if (satisfactionOf(d, g.words) >= DECOY_MIN_SATISFIED) decoysPlausible += 1;
      }
    }
  }
  /**
   * ROUND 17 (BENCHMARKS §2) — THE HEADLINE NUMBER OF THE FORMAT.
   *
   * A contested tile is a word the board makes look like it belongs somewhere
   * it does not. Connections runs 2–4 of them; the round-16 shelf ran 1.12,
   * median 1, which means three of every four threads were uncontested and the
   * evening was a sort rather than a puzzle.
   */
  const contested = puzzles.map((p) => p.ambiguousWords.length);
  const contestedMean = contested.length === 0
    ? 0 : contested.reduce((a, b) => a + b, 0) / contested.length;
  const inBand = contested.filter((n) => n >= 2 && n <= 4).length;
  const threads = new Map<number, number>();
  for (const n of contested) threads.set(n, (threads.get(n) ?? 0) + 1);
  return {
    contestedMean,
    contestedInBand: contested.length === 0 ? 0 : inBand / contested.length,
    threadSpread: [...threads].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}:${n}`).join(' '),
    decoys,
    decoyPlausibleShare: decoys === 0 ? 0 : decoysPlausible / decoys,
    families,
    topFamilyShare: puzzles.length === 0 ? 0 : (families[0]?.[1] ?? 0) / puzzles.length,
    shape: [...shape].sort((a, b) => a[0] - b[0]),
    plainYellowShare: puzzles.length === 0 ? 0 : plainYellow / puzzles.length,
    signatures,
    topShare: puzzles.length === 0 ? 0 : (signatures[0]?.[1] ?? 0) / puzzles.length,
    home: TIER_ORDER.map((s) => [s, home.get(s) ?? 0] as const),
    homeShares: TIER_ORDER.map((s) => (homeTotal === 0 ? 0 : (home.get(s) ?? 0) / homeTotal)),
    relations,
    topRelation: relations[0]?.[0] ?? null,
    topRelationShare: herrings === 0 ? 0 : (relations[0]?.[1] ?? 0) / herrings,
    affixShare: herrings === 0 ? 0 : affix / herrings,
  };
}

/**
 * The architecture budget, as enforceable numbers (AAA 2.7 / 2.12). Set to
 * what the shipped corpus can actually hold with its fairness gates intact —
 * see the round-11 note above `sigTally` for what each one is answering, and
 * the generator's own census line for where the pool currently sits.
 */
const ARCHITECTURE_BUDGET = {
  /**
   * ROUND 13 — the signature is now the board's FAMILY multiset (which four
   * deductions it asks for), not the four group types read off in colour
   * order. The old measure died the day `chooseColours` started assigning
   * colours from measured difficulty: "plain English first, transformation
   * last" became the promise the ladder MAKES, so `swww` immediately owned
   * 50% of the shelf and a 35% cap on it was a cap on the fix. What must
   * still vary night to night is which tricks she meets. Measured: 65
   * distinct family signatures, top one 13%.
   */
  maxSignatureShare: 0.20,
  /** Every colour slot must host at least this share of the planted traps. */
  minHomeSlotShare: 0.12,
  /** …and no single relation may be the named thread of more than this many. */
  maxRelationShare: 0.40,
  /**
   * NO SINGLE MECHANIC FAMILY IS THE TRICK ON MORE THAN THIS SHARE OF BOARDS.
   *
   * Two numbers, because the families are not interchangeable — see
   * `LETTER_FAMILY_BOARD_SHARE` for the full argument. In short: AAA 2.9
   * [BEAT] puts a hard floor of two tiles-solvable categories on every board
   * and the round-13 cap allows at most one letter puzzle below tier 3, so the
   * second slot is a compound frame on most boards it can be. Driving the
   * compound share down would mean lowering a [BEAT] floor or putting the
   * second letter puzzle back, and the second letter puzzle is the thing
   * REVIEW_AA §5.8 was actually complaining about.
   *
   * Measured over the shipped shelf, round 13 against round 12:
   *   compound 65% (was 62%), rhyme 51% (was 54%), contains 44% (was 60%),
   *   silent 23%, letter-shape 20% (was 10%), letter-swap 15%, hidden 14%,
   *   homophone 11% (was 6%), anagram 8% (was 4%).
   * The five thin families are where the round's authoring went and it shows;
   * `contains` fell sixteen points because the per-board cap stopped the trap
   * planter reaching for it on every board it touched.
   *
   * `LETTER_FAMILY_BOARD_SHARE` was swept at the end of the round, with the
   * composed batch in place: at 0.45 the shelf falls to 137 boards (floor 150,
   * tests/content.test.ts); at 0.50, 148 boards and 42 at tier 3 (floor 45,
   * tests/puzzles/anchors.test.ts); at 0.58, 158 boards and 55/54/49. The
   * binding resource is subtle-category SUPPLY — every subtle theme is capped
   * at four boards and tier 3 owes two of them per board — so tightening this
   * further is another authoring round in anagram, homophone and letter-shape,
   * not a knob.
   */
  maxFamilyShare: 0.70,
  /** …and the letter mechanics, which are what a checklist is made of. */
  maxLetterFamilyShare: 0.55,
  /**
   * The gimme must read as a gimme (2.12). Raised from 0.60: with the way-in
   * floor enforced per board and the colours assigned from the measurement,
   * yellow is a plain-English category on 94% of the shelf rather than 69%,
   * and the remainder are the pop-out sorts (`Contains "ANT"` over four words
   * that all end in ANT), which read as gimmes for a different reason.
   */
  minPlainYellowShare: 0.85,
} as const;

/** The 2.7–2.9 validator — the build fails on any violating board. */
function validate(puzzles: OutBoard[]): void {
  const problems: string[] = [];

  // ROUND 11 (AAA 2.8) — no 4-word set ships twice, from any source.
  const seenSets = new Map<string, string>();
  for (const p of puzzles) {
    for (const g of p.groups) {
      const k = setKey(g.words);
      const owner = seenSets.get(k);
      if (owner) problems.push(`${p.id}: "${g.theme}" repeats ${owner}'s tiles (${g.words.join('/')})`);
      else seenSets.set(k, p.id);
    }
  }

  /**
   * ROUND 12 (AAA 2.6 / volume-quality) — THE ANTI-WALLPAPER CAP APPLIES TO
   * EVERY THEME, WHATEVER WROTE IT.
   *
   * `BANK_REUSE_CAP` was documented as the rule against a category becoming
   * wallpaper and enforced only where the bank dealt, so it did not apply to
   * the source the shelf grew from. Shipped before this check: "Two Pairs of
   * Double Letters" ×17, Heteronyms ×7, 'Silent "T"' ×7, 'Silent "G"' ×6,
   * "Drop the First Letter" ×6, Palindromes ×5, "Homophones of Animals" ×5,
   * 'Silent "GH"' ×5, and ten more over budget. This is a hard fail, not a
   * soft warning: a soft warning is what the last three rounds had.
   */
  const themeTally = new Map<string, string[]>();
  for (const p of puzzles) {
    for (const g of p.groups) {
      const k = canon(g.theme);
      themeTally.set(k, [...(themeTally.get(k) ?? []), p.id]);
    }
  }
  for (const [theme, ids] of [...themeTally].sort()) {
    if (ids.length > BANK_REUSE_CAP) {
      problems.push(
        `pool: "${theme}" is the category on ${ids.length} boards (cap ${BANK_REUSE_CAP}) — ${ids.join(', ')}`,
      );
    }
  }

  // ROUND 11 (AAA 2.7 / 2.12) — the pool-wide architecture budget.
  const census = architectureCensus(puzzles);
  if (census.topShare > ARCHITECTURE_BUDGET.maxSignatureShare) {
    problems.push(
      `pool: "${census.signatures[0]![0]}" is ${(census.topShare * 100).toFixed(0)}% of the shelf ` +
      `(budget ${(ARCHITECTURE_BUDGET.maxSignatureShare * 100).toFixed(0)}%) — one learnable shape`,
    );
  }
  census.homeShares.forEach((share, i) => {
    if (share < ARCHITECTURE_BUDGET.minHomeSlotShare) {
      problems.push(
        `pool: only ${(share * 100).toFixed(0)}% of planted traps live in the ${TIER_ORDER[i]} group ` +
        `(floor ${(ARCHITECTURE_BUDGET.minHomeSlotShare * 100).toFixed(0)}%) — the trap always sits in the same slot`,
      );
    }
  });
  if (census.topRelationShare > ARCHITECTURE_BUDGET.maxRelationShare) {
    problems.push(
      `pool: ${(census.topRelationShare * 100).toFixed(0)}% of named traps are ${census.topRelation} ` +
      `(budget ${(ARCHITECTURE_BUDGET.maxRelationShare * 100).toFixed(0)}%) — one learnable trap`,
    );
  }
  // ROUND 14 (AAA 2.9) — the anti-wallpaper cap, keyed on the MECHANIC.
  for (const [family, n] of census.families) {
    const share = n / Math.max(1, puzzles.length);
    const budget = LETTER_MECHANIC_FAMILY.includes(family)
      ? ARCHITECTURE_BUDGET.maxLetterFamilyShare
      : ARCHITECTURE_BUDGET.maxFamilyShare;
    if (share > budget) {
      problems.push(
        `pool: "${family}" is the trick on ${n} of ${puzzles.length} boards ` +
        `(${(share * 100).toFixed(0)}%, budget ${(budget * 100).toFixed(0)}%) — wallpaper`,
      );
    }
  }
  // ROUND 14 (AAA 2.12) — the easiest tier is the one she reads in English.
  if (census.plainYellowShare < ARCHITECTURE_BUDGET.minPlainYellowShare) {
    problems.push(
      `pool: yellow is a letter trick on ${((1 - census.plainYellowShare) * 100).toFixed(0)}% of boards ` +
      `(plain-yellow floor ${(ARCHITECTURE_BUDGET.minPlainYellowShare * 100).toFixed(0)}%) — the gimme is not a gimme`,
    );
  }

  for (const p of puzzles) {
    if (p.groups.length !== 4) problems.push(`${p.id}: ${p.groups.length} groups`);
    const words = p.groups.flatMap((g) => g.words);
    if (new Set(words).size !== 16 || words.length !== 16) problems.push(`${p.id}: needs 16 unique words`);
    // The cozy tone gate: every tile is set in the manor's own type (task 2).
    for (const w of words) {
      if (!toneOk(w.toLowerCase())) problems.push(`${p.id}: "${w}" fails the tone gate`);
    }
    if (new Set(p.groups.map((g) => g.tier)).size !== 4) problems.push(`${p.id}: tiers not distinct`);
    // ROUND 12 (AAA 2.9 [BEAT]) — a "Hidden X" board may not print X.
    for (const g of p.groups) {
      problems.push(...hiddenGroupProblems(g.theme, g.words).map((x) => `${p.id}: ${x}`));
    }

    // 2.9 + the round-4 tier gates
    const spec = TIER_SPECS[p.tier];
    const trivia = p.groups.filter((g) => g.type === 'trivia');
    if (trivia.length > spec.maxTrivia) {
      problems.push(`${p.id}: ${trivia.length} trivia categories (tier ${p.tier} allows ${spec.maxTrivia})`);
    }
    if (trivia.some((g) => g.tier !== 'yellow')) problems.push(`${p.id}: trivia not at the easiest tier`);
    if (p.groups.filter((g) => g.type === 'wordplay').length < spec.minWordplay) {
      problems.push(`${p.id}: fewer than ${spec.minWordplay} wordplay categories`);
    }
    // Round 10 — the plain-English floor. A board of four letter-puzzles has
    // no way in for a player who does not already see the trick.
    const plain = plainCount(p.groups);
    if (plain < spec.minPlain) {
      problems.push(`${p.id}: ${plain} plain categories (tier ${p.tier} needs ${spec.minPlain})`);
    }
    const subtle = p.groups.filter((g) => isSubtleTheme(g.theme)).length;
    if (subtle < spec.minSubtle) {
      problems.push(`${p.id}: ${subtle} subtle categories (tier ${p.tier} needs ${spec.minSubtle})`);
    }

    /**
     * ROUND 13 (REVIEW_AA §5.8) — THE PER-BOARD LETTER-MECHANIC CAP.
     *
     * *"My first live board carried two 'Contains' groups (OWN and RAM) at
     * different difficulty bands."* — and 78.7% of the shelf ran two or more
     * letter mechanics of some flavour. Hard fail, both halves: the count, and
     * the rule that the tier-3 pair must be two different deductions.
     */
    const letters = p.groups.filter((g) => isLetterMechanicTheme(g.theme));
    if (letters.length > spec.maxLetterMechanics) {
      problems.push(
        `${p.id}: ${letters.length} letter mechanics at tier ${p.tier} (cap ${spec.maxLetterMechanics}) — `
        + letters.map((g) => `"${g.theme}"`).join(', '),
      );
    }
    const letterFamilies = letters.map((g) => familyOf(g.theme));
    if (new Set(letterFamilies).size !== letterFamilies.length) {
      problems.push(
        `${p.id}: two ${letterFamilies.find((f, i) => letterFamilies.indexOf(f) !== i)} groups on one board — `
        + letters.map((g) => `"${g.theme}"`).join(', '),
      );
    }

    /**
     * ROUND 13 (REVIEW_AA §5.8) — THE DIFFICULTY COLOURS ARE NOT DECORATIVE.
     *
     * `ladderProblems` re-derives every group's lateral distance from the
     * shipped board and asks three questions of the four colours: is each one
     * inside the band its colour promises, do they run in order, and does the
     * board actually climb. On the round-12 shelf this failed on 140 of 156
     * boards — 196 outright inversions, where a group wearing purple was
     * measurably easier than the one wearing green. It is a hard fail now;
     * `chooseColours` is what makes it pass, and it passes by construction, so
     * this block exists to catch the day somebody edits the JSON by hand.
     */
    for (const lp of ladderProblems(p)) {
      problems.push(`${p.id}: colour ladder — ${lp.detail}`);
    }

    /**
     * 2.7 — the tier's herring budget (cap AND floor; AAA's ≤3 still holds).
     *
     * ROUND 12: this block asserted `ambiguousWords.length` — the flat
     * INTRUDER-WORD list — against a spec whose field is named `minHerrings`
     * and whose docstring says "tier 3 must ship 2–3 traps". Two words caught
     * by one `suffix:GHT` are one trap and one sentence, and they satisfied a
     * two-trap check, so half the top shelf shipped at tier-1 trap density
     * with a tier-3 label and nothing could see it. The TRAP budget is asserted
     * against `herrings` (the named threads); the intruder list keeps its own,
     * differently-named assertion below.
     */
    /**
     * ROUND 17 — the second operand used to be a literal 3, standing for AAA
     * 2.7's "planted herrings ≤3". BENCHMARKS §2 puts Connections at 2–4
     * CONTESTED TILES and the round-16 shelf measured 1.12; 2.7's ceiling was
     * therefore the binding constraint on the one number the format is built
     * out of, and it has been re-ruled at 4 in AAA_BAR §2.7. The tier's own
     * ceiling is what the build asserts, which is what the field was always
     * called.
     */
    if (p.herrings.length > spec.maxHerrings) {
      problems.push(`${p.id}: ${p.herrings.length} named traps (tier ${p.tier} budget ${spec.maxHerrings})`);
    }
    if (p.herrings.length < spec.minHerrings) {
      problems.push(`${p.id}: ${p.herrings.length} named traps (tier ${p.tier} needs ${spec.minHerrings})`);
    }
    // The intruder list is DERIVED from the traps (one word per thread, deduped
    // where two threads name the same word), so it is never longer than the
    // budget and never empty on a board that has a trap. Deliberately a
    // separate, differently-named assertion: conflating the two is the defect
    // this block was rewritten for.
    if (p.ambiguousWords.length > p.herrings.length) {
      problems.push(`${p.id}: ${p.ambiguousWords.length} intruders against ${p.herrings.length} named traps`);
    }
    if (new Set(p.ambiguousWords).size !== p.ambiguousWords.length) {
      problems.push(`${p.id}: the intruder list repeats a word`);
    }
    if (p.herrings.length > 0 && p.ambiguousWords.length === 0) {
      problems.push(`${p.id}: named traps with no intruder to cluster on`);
    }
    if (p.ambiguousWords.some((w) => !words.includes(w))) problems.push(`${p.id}: herring not on board`);

    // 2.10 — every shipped trap is NAMED. A herring the room cannot describe
    // is a −2-step guess that buys nothing, which is the criterion's whole
    // complaint; and a set of fewer than 3 words can never be matched by the
    // ≥3-of-4 rule the room uses, so it would be dead copy.
    const RELATIONS = ['rhyme', 'shared-affix', 'doubled-letter', 'semantic', 'hidden-string'];
    if (p.herrings.length === 0 && p.ambiguousWords.length > 0) {
      problems.push(`${p.id}: ${p.ambiguousWords.length} herrings but none named`);
    }
    for (const h of p.herrings) {
      if (!RELATIONS.includes(h.relation)) problems.push(`${p.id}: unknown herring relation "${h.relation}"`);
      if (h.words.length < 3) problems.push(`${p.id}: herring set of ${h.words.length} can never be matched`);
      if (new Set(h.words).size !== h.words.length) problems.push(`${p.id}: herring set repeats a word`);
      for (const w of h.words) if (!words.includes(w)) problems.push(`${p.id}: herring word "${w}" not on board`);
      if ((h.relation === 'shared-affix' || h.relation === 'hidden-string') && !h.detail) {
        problems.push(`${p.id}: shared-affix herring with no letters to point at`);
      }
      /**
       * ROUND 12 (AAA 2.10) — a doubled-letter trap must name the SAME doubled
       * letter, and every member must actually carry it. "These words each
       * contain some repeated character" is a property ~30% of English shares
       * and a grouping nobody chases; 52 of 55 shipped doubled-letter traps
       * had no doubled letter in common, so the −2-step guess bought noise
       * dressed as an insight.
       */
      if (h.relation === 'doubled-letter') {
        if (!h.detail || !/^([A-Z])\1$/.test(h.detail)) {
          problems.push(`${p.id}: doubled-letter herring with no shared pair to name`);
        } else if (h.words.some((w) => !w.includes(h.detail!))) {
          problems.push(`${p.id}: doubled-letter herring "${h.detail}" not carried by every member`);
        }
      }
    }
    // Every shipped intruder is described by at least one named set.
    for (const w of p.ambiguousWords) {
      if (!p.herrings.some((h) => h.words.includes(w))) {
        problems.push(`${p.id}: herring "${w}" has no named relation`);
      }
    }

    // 2.6
    if (p.layout.length !== 16 || new Set(p.layout).size !== 16 || p.layout.some((w) => !words.includes(w))) {
      problems.push(`${p.id}: layout is not a permutation of the 16 words`);
    }

    // ROUND 14 (AAA 2.12) — a group whose token sits at the same place in all
    // four words is a sort, not a deduction, and may not wear the two colours
    // the player is meant to reach last.
    for (const g of p.groups) {
      if (visibilityOf(g.theme, g.words) >= VISIBILITY_LOUD && (g.tier === 'blue' || g.tier === 'purple')) {
        problems.push(
          `${p.id}: "${g.theme}" is a bare edge-token sort at ${g.tier} — 2.12 inverted (${g.words.join('/')})`,
        );
      }
    }

    /**
     * ROUND 14 (AAA 2.8) — THE LABEL'S OWN ANCHOR IS A CANDIDATE MEMBER.
     * Either the anchor has been moved off the board (`reAnchor`) or the tile
     * it names is an acknowledged herring — on the intruder list, clustered by
     * the layout, and named on a wrong guess. Silence is the failure.
     */
    const onBoard = new Set(words);
    for (const g of p.groups) {
      if (!anchorIsFifthMember(g.theme, g.words, onBoard)) continue;
      const anchor = anchorOf(g.theme)!.word;
      const named = p.ambiguousWords.includes(anchor)
        && p.herrings.some((h) => h.words.includes(anchor));
      if (!named) {
        problems.push(
          `${p.id}: "${g.theme}" is satisfied by the unflagged tile ${anchor} — five words, four slots`,
        );
      }
    }

    // 2.11
    for (const g of p.groups) {
      // Distinctness is judged on the CANONICAL label, because that is what
      // the player sees after typeset() — see assignDecoys.
      const labels = [g.theme, ...g.decoys].map(canon);
      if (g.decoys.length !== 2 || new Set(labels).size !== 3) {
        problems.push(`${p.id}: "${g.theme}" needs 2 decoys that read differently from it (${labels.join(' / ')})`);
      }
      /**
       * ROUND 14 (AAA 2.11 [BEAT]) — A DECOY NOTHING SATISFIES IS NOT A CHOICE.
       * 206 of the 211 mechanically-checkable decoys on the round-13 shelf
       * matched none of their group's four words, which turns the one act of
       * naming the Library owns into a rubber stamp with two dead options.
       * Hard fail at zero, and at four — a label every tile answers to is a
       * second right answer, not a decoy.
       */
      for (const d of g.decoys) {
        const n = satisfactionOf(d, g.words);
        if (n === 0) {
          problems.push(`${p.id}: decoy "${d}" for "${g.theme}" fits none of ${g.words.join('/')}`);
        } else if (n === g.words.length) {
          problems.push(`${p.id}: decoy "${d}" fits every word of "${g.theme}" — a second right answer`);
        }
      }
    }
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`word-web validation failed with ${problems.length} problem(s)`);
  }
}

assertBankIsClean();

/**
 * ROUND 18 (STATUS §5.9, BENCHMARKS §2) — THE HOUSE VOICE AND THE TRAP DENSITY
 * ARE THE SAME THING, OR THE HOUSE DOES NOT SHIP.
 *
 * THE FINDING THIS ANSWERS. Round 17 authored fourteen house categories, proved
 * all fourteen were drawn three times each, and then measured six manor threads
 * on a shelf of six hundred and eight: the trap planter swapped THIRTY-SEVEN OF
 * FORTY-TWO of them back out. The reason was structural and four separate knobs
 * failed to fix it (STATUS §5.9 records the costs: 155 → 151 boards, → 149,
 * → 148). A house-voiced category is written for its subject, so it is
 * semantically ISOLATED — none of its words is a fifth member of anything else
 * on the board — so it contests nothing, so every composition rule that reaches
 * for a contested tile reaches past it. House voice and trap density were
 * opposed, and a budget cannot reconcile two things that are opposed.
 *
 * THE ANSWER IS NOT A KNOB, IT IS THE AUTHORING RULE. A house pool is written
 * in two registers at once: some of its members make the category TRUE (the
 * voice — GOVERNESS, PROVERBS, KEYHOLE), and at least three of them are also
 * ordinary English words that the ordinary bank is built out of — a carrier of
 * a `Contains "X"` token, a fifth member of a rhyme family, a word that doubles
 * the letter another pool's whole hand doubles. GAMEKEEPER is staff AND it is a
 * word with AME in it. CARRIAGE is in the coach house AND it carries CAR and
 * AGE. HANDBILL was behind the bookcase AND it doubles an L. The house category
 * stops being the thing the planter evicts and becomes the thing that gives the
 * board something to argue about, so every rule that reaches for a contested
 * tile now reaches FOR it.
 *
 * WHAT THIS GATE CHECKS, AND THAT IT CAN GO RED. The colliders are placed so
 * that EVERY hand `bankDraws` can deal from a house pool carries at least one
 * of them — a hitting set of the twelve draw patterns needs only indices 1, 2
 * and 5 (or 1, 2 and 6), which is why the pools read naturally rather than
 * being three-quarters wordplay. RUN AGAINST THE ROUND-17 POOLS IT GOES RED —
 * 53 problems: 9 of the 14 pools below the collider floor and 44 dealable
 * hands with nothing in them that anything else on a board could argue with,
 * `What a Lexicographer Collects` accounting for 13 of them because
 * CITATIONS/SLIPS/VARIANTS/PROVERBS/MISPRINTS/EPITHETS/IDIOMS/ODDITIES collide
 * with nothing in the bank at all. That is the pool this gate was written to
 * condemn, and it condemns it.
 *
 * It reads the SHIPPING detector's own key function (`patternSets`) rather than
 * a second implementation of the same idea, so a change to what counts as a
 * pattern changes this gate too.
 */
/** How many members of a house pool must be able to contest a tile. */
const MANOR_COLLIDER_FLOOR = 3;

function assertManorCollides(): void {
  /** Pattern keys some ordinary bank hand carries on ALL FOUR of its words —
   *  i.e. keys against which an outside word is a scored fifth member — and
   *  the `Contains "X"` tokens, whose carriers are the tightest traps there are. */
  const anchorKeys = new Map<string, string>();
  const tokens: { token: string; theme: string }[] = [];
  const poolWords = new Map<string, Set<string>>();
  for (const pool of [...WORDPLAY_BANK, ...SEMANTIC_BANK]) {
    poolWords.set(pool.theme, new Set(pool.words));
    if (MANOR_THEMES.has(canon(pool.theme))) continue;
    const m = pool.theme.match(/^Contains "([A-Z]+)"$/);
    if (m) tokens.push({ token: m[1]!, theme: pool.theme });
    for (const hand of bankDraws(pool)) {
      for (const ps of patternSets(hand.words)) {
        if (ps.words.size === 4 && !anchorKeys.has(ps.key)) anchorKeys.set(ps.key, pool.theme);
      }
    }
  }
  /** The ordinary categories `word` would be a fifth member of. */
  const collidesWith = (word: string): string[] => {
    const out: string[] = [];
    for (const ps of patternSets([word])) {
      const theme = anchorKeys.get(ps.key);
      if (theme && !poolWords.get(theme)!.has(word)) out.push(theme);
    }
    for (const { token, theme } of tokens) {
      if (word.includes(token) && !poolWords.get(theme)!.has(word)) out.push(theme);
    }
    return [...new Set(out)];
  };

  const problems: string[] = [];
  for (const pool of MANOR_BANK) {
    const colliders = new Set(pool.words.filter((w) => collidesWith(w).length > 0));
    if (colliders.size < MANOR_COLLIDER_FLOOR) {
      problems.push(
        `house pool "${pool.theme}" has ${colliders.size} member(s) that could contest a tile,`
        + ` and needs ${MANOR_COLLIDER_FLOOR} — a category the bank cannot argue with is a`
        + ` category the planter will swap out`,
      );
    }
    for (const hand of bankDraws(pool)) {
      if (hand.words.some((w) => colliders.has(w))) continue;
      problems.push(
        `house pool "${pool.theme}" can deal ${hand.words.join('/')}, and no word in it is a`
        + ' fifth member of any ordinary bank category',
      );
    }
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`the house pools cannot contest a tile: ${problems.length} problem(s)`);
  }
}
assertManorCollides();

/**
 * ROUND 18 (BENCHMARKS §2) — THE SHELF IS COMPOSED HERE, AT THE BOTTOM OF THE
 * FILE, BECAUSE THE COMPOSER NOW USES THE REAL TRAP DETECTOR.
 *
 * This declaration used to sit beside `COMPOSED_TARGET`, five hundred lines
 * above `patternSets` and the phonetic dictionary, and `synthesiseBoards`
 * therefore could not ask the question its whole job is to answer: does this
 * combination of four categories contest a tile? It asked `roughTraps`
 * instead — a letters-only proxy that counts how MANY near-collisions a board
 * has, saturating at nothing, blind to rhyme, blind to whether a collision is
 * a fifth member of a COMPLETE group (which is what the solver scores) and
 * blind to whether two collisions point at the same tile (which is the number
 * the format is graded on). Two thirds of the shelf is composed, so the proxy
 * was the shelf's supply of contested tiles.
 *
 * Nothing here changes what a board must PASS. The composer is a chooser
 * between candidates, all of which still go through the herring solver, the
 * tier gates, the colour ladder, `shipsHere` and `validate`. It simply gets to
 * see the same board pass 2 will see. Moved rather than made lazy so the
 * ordering stays a fact of the file you can read top to bottom.
 */
const boards: RawBoard[] = [
  ...authoredBoards,
  ...synthesiseBoards(COMPOSED_TARGET, createRng(SEED + 991)),
];
// Every authored set is spoken for before the bank deals a single hand.
for (const b of boards) for (const g of b.groups) usedSets.add(setKey(g.words));

// ROUND 14 — the corpus, as CATEGORIES, so the decoy solver can ask whether a
// semantic label ("Things in a Cinema") is true of a word rather than guessing.
indexThemeMembers([
  ...boards.flatMap((b) => b.groups),
  ...WORDPLAY_BANK.flatMap((b) => bankDraws(b)),
  ...SEMANTIC_BANK.flatMap((b) => bankDraws(b)),
  // ROUND 17 — and the sense shelf, which is decoy supply and nothing else.
  ...SENSE_BANK.map((s) => ({ theme: s.theme, words: s.words })),
]);
indexCorpusSets([
  ...boards.flatMap((b) => b.groups.map((g) => g.words)),
  ...WORDPLAY_BANK.flatMap(bankDraws).map((b) => b.words),
  ...SEMANTIC_BANK.flatMap(bankDraws).map((b) => b.words),
]);
/**
 * ROUND 14 — run only as the process ENTRY POINT, and export the predicates
 * the shipped pool is judged by.
 *
 * `main()` used to execute at module scope, so importing this file wrote a
 * build artifact as a side effect and no test could ever ask it a question —
 * exactly the hole `generate-forgotten-word.ts` closed in round 6. The
 * round-14 gates (decoy plausibility, mechanic family, visibility, the label's
 * own anchor) are all judgments about the SHIPPED JSON, and a judgment nothing
 * can re-ask is a judgment that rots: `tests/content.test.ts` re-runs them over
 * `content/generated/word-web.json` so a hand-edit or a future generator change
 * fails CI rather than the wife's evening.
 */
export {
  ARCHITECTURE_BUDGET, DECOY_MIN_SATISFIED, VISIBILITY_LOUD, WALLPAPER_FAMILIES,
  anchorIsFifthMember, anchorOf, canon, familyOf, isPlainish, labelSatisfiedBy,
  satisfactionOf, typeOfTheme, visibilityOf,
};

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  if (process.argv.includes('--report')) report();
  else main();
}
