import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, pick, shuffle } from '../src/engine/rng';
import { loadPhonetics } from './lib/phonetics';
import { toneOk } from './generate-gate';
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
 *   - two plausible same-tier `decoys` per group for the 2.11 act of naming.
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
// Wordplay replacement bank — swapped in where a board falls short of the
// 2.9 floor (≥2 wordplay) or over the trivia cap. All verifiable on the tiles.
// ---------------------------------------------------------------------------

interface BankGroup { theme: string; words: string[] }

const WORDPLAY_BANK: BankGroup[] = [
  { theme: 'Contains "TEN"', words: ['OFTEN', 'KITTEN', 'TENDER', 'EXTEND'] },
  { theme: 'Contains "CAR"', words: ['SCARF', 'OSCAR', 'CARGO', 'CARTON'] },
  { theme: 'Contains "PEA"', words: ['SPEAK', 'PEACH', 'REPEAT', 'APPEAR'] },
  { theme: 'Contains "WIN"', words: ['WINDOW', 'TWINE', 'WINTER', 'WINCE'] },
  { theme: 'Contains "APE"', words: ['GRAPE', 'PAPER', 'ESCAPE', 'SHAPE'] },
  { theme: 'Contains "RAT"', words: ['PIRATE', 'CRATER', 'SCRATCH', 'OPERATE'] },
  { theme: 'Silent First Letters', words: ['KNIGHT', 'WRIST', 'GNOME', 'PSALM'] },
  { theme: 'Anagrams of "LISTEN"', words: ['SILENT', 'ENLIST', 'TINSEL', 'INLETS'] },
  { theme: 'Rhymes with "SNOW"', words: ['THOUGH', 'PLATEAU', 'BESTOW', 'AGLOW'] },
  { theme: 'Rhymes with "BLUE"', words: ['THROUGH', 'CANOE', 'ADIEU', 'DEBUT'] },
  { theme: '___ FIRE', words: ['CAMP', 'CROSS', 'CEASE', 'WILD'] },
  { theme: '___ FALL', words: ['WATER', 'NIGHT', 'RAIN', 'FOOT'] },
  { theme: 'Can Precede "KEEPER"', words: ['BEE', 'BOOK', 'GATE', 'GOAL'] },
  { theme: 'Can Follow "EYE"', words: ['BALL', 'BROW', 'LASH', 'SHADOW'] },
  { theme: 'Can Precede "STICK"', words: ['CANDLE', 'CHOP', 'YARD', 'LIP'] },
  { theme: 'Can Follow "RAIN"', words: ['BOW', 'COAT', 'DROP', 'FOREST'] },
  { theme: '___ PROOF', words: ['BULLET', 'WEATHER', 'FOOL', 'CHILD'] },
  { theme: 'Two Pairs of Double Letters', words: ['BALLOON', 'COFFEE', 'SUCCESS', 'RACCOON'] },
  { theme: 'Starts and Ends with the Same Letter', words: ['EDGE', 'TREAT', 'NYLON', 'KIOSK'] },
  { theme: 'Hidden Body Parts', words: ['CHARMING', 'SHIPMENT', 'FEARLESS', 'RIBBON'] },
  { theme: 'Hidden Animals', words: ['SCOWL', 'SPIGOT', 'CATALOG', 'DOGMA'] },
  { theme: '___ SMITH', words: ['BLACK', 'LOCK', 'GOLD', 'WORD'] },
  { theme: 'Can Follow "HAND"', words: ['SHAKE', 'BOOK', 'WRITING', 'CUFF'] },
  { theme: 'Can Precede "LIGHT"', words: ['DAY', 'MOON', 'CANDLE', 'LAMP'] },

  // --- subtle bank (round 4): the tier-3 supply. Threads you have to say
  // aloud, unscramble, or catch hiding inside another word.
  { theme: 'Rhymes with "MOON"', words: ['TUNE', 'DUNE', 'PRUNE', 'STREWN'] },
  { theme: 'Rhymes with "EIGHT"', words: ['WEIGHT', 'FREIGHT', 'STRAIGHT', 'SLEIGH'] },
  { theme: 'Rhymes with "CHAIR"', words: ['THEIR', 'WHERE', 'FLAIR', 'BEWARE'] },
  { theme: 'Anagrams of "TRACE"', words: ['CRATE', 'REACT', 'CATER', 'CARET'] },
  { theme: 'Anagrams of "PALEST"', words: ['PLATES', 'STAPLE', 'PETALS', 'PLEATS'] },
  { theme: 'Anagrams of "SPARE"', words: ['PEARS', 'REAPS', 'PARSE', 'SPEAR'] },
  { theme: 'Silent "B"', words: ['CLIMB', 'THUMB', 'SUBTLE', 'DOUBT'] },
  { theme: 'Silent "L"', words: ['CALM', 'WOULD', 'SALMON', 'YOLK'] },
  { theme: 'Silent "W"', words: ['WRENCH', 'ANSWER', 'WRINKLE', 'AWRY'] },
  { theme: 'Silent Letters at the End', words: ['COMB', 'LAMB', 'HYMN', 'COLUMN'] },
  { theme: 'Hidden Numbers', words: ['CANINE', 'OFTEN', 'HONEST', 'STONEWARE'] },
  { theme: 'Rhymes with "TREE"', words: ['KEY', 'QUAY', 'DEBRIS', 'FLEA'] },
  { theme: 'Silent "H"', words: ['GHOST', 'RHYME', 'WHISTLE', 'SCHEME'] },
  { theme: 'Anagrams of "NOTES"', words: ['STONE', 'TONES', 'ONSET', 'STENO'] },

  // --- planting stock (round 4): blunt but letter-verifiable groups whose
  // stated rule other board words keep accidentally satisfying — the raw
  // material the trap-planter uses to hit a tier's herring budget.
  { theme: 'Contains "ONE"', words: ['ATONE', 'PHONE', 'ZONE', 'CLONE'] },
  { theme: 'Contains "ART"', words: ['PARTY', 'CHART', 'SMART', 'DEPART'] },
  { theme: 'Contains "AGE"', words: ['MANAGE', 'VILLAGE', 'PACKAGE', 'VOYAGE'] },
  { theme: 'Contains "EAR"', words: ['HEART', 'SEARCH', 'PEARL', 'YEARN'] },
  { theme: 'Contains "ICE"', words: ['SLICE', 'PRICE', 'NOTICE', 'SPICE'] },
  { theme: 'Contains "AIR"', words: ['CHAIR', 'STAIR', 'REPAIR', 'AFFAIR'] },
  { theme: '___ HOUSE', words: ['LIGHT', 'GREEN', 'FARM', 'TREE'] },
  { theme: '___ BOARD', words: ['KEYS', 'CARD', 'SURF', 'DASH'] },
  { theme: '___ STORM', words: ['BRAIN', 'SAND', 'SNOW', 'THUNDER'] },
  { theme: 'Can Precede "BERRY"', words: ['BLUE', 'STRAW', 'RASP', 'ELDER'] },
  { theme: 'Can Follow "SUN"', words: ['FLOWER', 'SHINE', 'RISE', 'BEAM'] },
  { theme: 'Can Precede "WORK"', words: ['HOME', 'NET', 'FRAME', 'CLOCK'] },

  // --- round 7: MORE planting stock. Tier 1's herring floor rose from 0 to 1
  // (22 of 55 shipped boards used to carry an empty trap list, so on 40% of
  // nights AAA 2.10's acknowledged herring could not fire at all), and the
  // planter promptly ran the old stock dry: six boards had to be dropped for
  // want of a bank group that could seed a trap without manufacturing a
  // complete unintended grouping. These are deliberately common letter
  // strings, which is exactly what makes them good trap seed.
  { theme: 'Contains "OWN"', words: ['BROWN', 'CROWN', 'DOWNY', 'FROWN'] },
  { theme: 'Contains "AND"', words: ['GARLAND', 'ISLAND', 'SANDAL', 'MEANDER'] },
  { theme: 'Contains "OLD"', words: ['GOLDEN', 'BOLDER', 'HOLDER', 'SOLDER'] },
  { theme: 'Contains "TEA"', words: ['STEAM', 'INSTEAD', 'TEAPOT', 'STEADY'] },
  { theme: 'Contains "ROW"', words: ['ARROW', 'BURROW', 'SPARROW', 'THROW'] },
  { theme: 'Contains "AME"', words: ['FLAME', 'BLAME', 'SESAME', 'CARAMEL'] },
  { theme: 'Contains "ARM"', words: ['HARMONY', 'CHARMED', 'GARMENT', 'ALARM'] },
  { theme: 'Contains "ILL"', words: ['WILLOW', 'MILLER', 'THRILL', 'CHILLY'] },
  { theme: '___ WOOD', words: ['DRIFT', 'PLY', 'ROSE', 'TEAK'] },
  { theme: '___ MARK', words: ['LAND', 'BENCH', 'TRADE', 'CHECK'] },
];
/** How many boards may share one bank group before it feels like wallpaper. */
const BANK_REUSE_CAP = 4;

/** Bank groups whose thread is subtle (the tier-3 supply). */
const SUBTLE_BANK = WORDPLAY_BANK.filter((b) => isSubtleTheme(b.theme));

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
type HerringRelation = 'rhyme' | 'shared-affix' | 'doubled-letter' | 'semantic';
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
  /** The herring budget: how many planted traps, and how tight each must pull. */
  minHerrings: number;
  maxHerrings: number;
  minHerringScore: number;
}

/** Solver score at which a trap counts as a real pull, not a coincidence. */
const HERRING_TIGHT = 2;

const TIER_SPECS: Record<Tier, RoomTierSpec> = {
  // Round 7: tier 1's floor was 0, so 22 of 55 shipped boards carried an empty
  // trap list and the AAA 2.10 acknowledged-herring channel could never fire on
  // them. A tier-1 board still ships at most ONE loose trap — the near-clean
  // board is the point — but it must ship that one, and pass 2 drops any board
  // the planter cannot supply rather than shipping a room that can only say no.
  1: { maxTrivia: 1, minWordplay: 2, minSubtle: 0, minPlain: 2, minHerrings: 1, maxHerrings: 1, minHerringScore: 1 },
  2: { maxTrivia: 1, minWordplay: 2, minSubtle: 1, minPlain: 1, minHerrings: 1, maxHerrings: 2, minHerringScore: HERRING_TIGHT },
  3: { maxTrivia: 0, minWordplay: 2, minSubtle: 2, minPlain: 1, minHerrings: 2, maxHerrings: 3, minHerringScore: HERRING_TIGHT },
};

const here = dirname(fileURLToPath(import.meta.url));
const boards = JSON.parse(
  readFileSync(join(here, 'authored', 'word-web-boards.json'), 'utf8'),
) as RawBoard[];

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
function replaceGroups(board: RawBoard, tier: Tier, rng: () => number): RawBoard | null {
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
    const t = typed();
    const extraTrivia = t.filter((x) => x.type === 'trivia').slice(spec.maxTrivia).map((x) => x.g);
    const bluntWordplay = t
      .filter((x) => x.type === 'wordplay' && !isSubtleTheme(x.g.theme))
      .map((x) => x.g);
    // The semantic floor is spent before anything else is: once a board is
    // down to its last plain-English categories they stop being replaceable,
    // and the composer either finds a blunt-wordplay victim or gives up on
    // this tier (the caller then tries the tier below).
    const spare = count('semantic') + count('trivia') - spec.minPlain;
    const semantics = spare <= 0 ? [] : t
      .filter((x) => x.type === 'semantic' && (tier === 3 || x.g.tier !== 'yellow'))
      .sort((a, b) => TIER_ORDER.indexOf(a.g.tier) - TIER_ORDER.indexOf(b.g.tier))
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

  /**
   * A bank group may only land if the resulting board still has ZERO
   * unintended complete groupings (2.7). Without this the subtle bank happily
   * manufactures them — "Rhymes with EIGHT" next to an existing KNIGHT gives
   * four words sharing suffix GHT, which is exactly the failure the solver
   * refuses to ship.
   */
  const pickBankGroup = (from: BankGroup[], victim: RawGroup): BankGroup | null => {
    const words = boardWords();
    const themes = boardThemes();
    const usable = from.filter(
      (b) =>
        (bankUse.get(b.theme) ?? 0) < BANK_REUSE_CAP &&
        !themes.has(b.theme) &&
        b.words.every((w) => !words.has(w)) &&
        patternFailures(
          groups.map((g) => (g === victim ? { theme: b.theme, tier: g.tier, words: b.words } : g)),
        ).length === 0,
    );
    if (usable.length === 0) return null;
    return pick(createRngFrom(rng), usable);
  };

  const swapIn = (victim: RawGroup, bank: BankGroup) => {
    bankUse.set(bank.theme, (bankUse.get(bank.theme) ?? 0) + 1);
    groups = groups.map((g) =>
      g === victim ? { theme: bank.theme, tier: g.tier, words: [...bank.words] } : g,
    );
  };

  // Enforce this tier's composition: trivia cap, wordplay floor, subtle floor.
  // A tier that still owes a SUBTLE category may only take a subtle group —
  // taking a blunt one instead is how a tier-3 board used to quietly ship with
  // tier-1 categories.
  let guard = 0;
  for (;;) {
    const trivia = count('trivia');
    const wordplay = count('wordplay');
    const subtle = subtleCount();
    const plain = count('semantic') + trivia;
    if (trivia <= spec.maxTrivia && wordplay >= spec.minWordplay
      && subtle >= spec.minSubtle && plain >= spec.minPlain) break;
    if (guard++ >= 6) return null;

    const victim = replacementOrder(wordplay < spec.minWordplay)
      .find((g) => !isSubtleTheme(g.theme));
    if (!victim) return null;
    const bank = subtle < spec.minSubtle
      ? pickBankGroup(SUBTLE_BANK, victim)
      : pickBankGroup(WORDPLAY_BANK, victim);
    if (!bank) return null;
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
      && types.filter((t) => t !== 'wordplay').length >= spec.minPlain
      && gs.filter((g) => isSubtleTheme(g.theme)).length >= spec.minSubtle;
  };

  let plants = 0;
  while (tightTrapCount(groups, spec.minHerringScore) < spec.minHerrings && plants++ < 4) {
    const words = boardWords();
    const themes = boardThemes();
    let best: { victim: RawGroup; bank: BankGroup; traps: number } | null = null;
    for (const victim of groups) {
      for (const bank of WORDPLAY_BANK) {
        if ((bankUse.get(bank.theme) ?? 0) >= BANK_REUSE_CAP) continue;
        if (themes.has(bank.theme)) continue;
        if (bank.words.some((w) => words.has(w) && !victim.words.includes(w))) continue;
        const next = groups.map((g) =>
          g === victim ? { theme: bank.theme, tier: g.tier, words: [...bank.words] } : g);
        if (!compositionOk(next)) continue;
        if (patternFailures(next).length > 0) continue;
        const traps = tightTrapCount(next, spec.minHerringScore);
        if (!best || traps > best.traps
          || (traps === best.traps && bank.theme < best.bank.theme)) {
          best = { victim, bank, traps };
        }
      }
    }
    if (!best || best.traps <= tightTrapCount(groups, spec.minHerringScore)) break;
    swapIn(best.victim, best.bank);
  }

  // Trivia always sits at the easiest tier: swap tiers with the yellow group.
  const trivia = groups.find((g) => typeOfTheme(g.theme) === 'trivia');
  if (trivia && trivia.tier !== 'yellow') {
    const yellow = groups.find((g) => g.tier === 'yellow')!;
    yellow.tier = trivia.tier;
    trivia.tier = 'yellow';
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
    if (/([A-Z])\1/.test(w)) add('doubled-letter', 'doubled-letter', undefined, w);
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
      relation: 'shared-affix',
      detail: m[1]!,
      score: 3,
    });
  }

  return traps;
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

function scoreTraps(groups: readonly RawGroup[]): ScoredHerring[] {
  return scoresOf(findTraps(groups));
}

/** How many traps on this board pull tightly enough to count for a tier. */
function tightTrapCount(groups: readonly RawGroup[], minScore: number): number {
  return scoreTraps(groups).filter((h) => h.score >= minScore).length;
}

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

function buildLayout(board: RawBoard, herrings: string[], seed: number): string[] {
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
// 2.11 — decoy labels for the act of naming
// ---------------------------------------------------------------------------

/** Needs only an id and the composed groups — asks for exactly that. */
function assignDecoys(finals: { id: string; groups: OutGroup[] }[]): void {
  for (const board of finals) {
    const rng = createRng([...board.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, SEED));
    const own = new Set(board.groups.map((g) => g.theme));
    for (const g of board.groups) {
      const pool = finals
        .filter((b) => b.id !== board.id)
        .flatMap((b) => b.groups.filter((x) => x.tier === g.tier).map((x) => x.theme))
        .filter((t) => !own.has(t));
      const decoys: string[] = [];
      let guard = 0;
      while (decoys.length < 2 && guard++ < 200 && pool.length > 0) {
        const t = pick(rng, pool);
        if (!decoys.includes(t)) decoys.push(t);
      }
      g.decoys = decoys;
    }
  }
}

// ---------------------------------------------------------------------------
// Build + validate
// ---------------------------------------------------------------------------

/** Does this composed board satisfy `tier`'s category + herring gates? */
function meetsTier(board: RawBoard, herrings: ScoredHerring[], tier: Tier): boolean {
  const spec = TIER_SPECS[tier];
  const types = board.groups.map((g) => typeOfTheme(g.theme));
  if (types.filter((t) => t === 'trivia').length > spec.maxTrivia) return false;
  if (types.filter((t) => t === 'wordplay').length < spec.minWordplay) return false;
  if (types.filter((t) => t !== 'wordplay').length < spec.minPlain) return false;
  if (board.groups.filter((g) => isSubtleTheme(g.theme)).length < spec.minSubtle) return false;
  const tight = herrings.filter((h) => h.score >= spec.minHerringScore);
  return tight.length >= spec.minHerrings;
}

/** The traps this tier actually ships: tight enough, capped by the budget. */
function shippedHerrings(herrings: ScoredHerring[], tier: Tier): string[] {
  const spec = TIER_SPECS[tier];
  return herrings
    .filter((h) => h.score >= spec.minHerringScore)
    .slice(0, spec.maxHerrings)
    .map((h) => h.word);
}

/**
 * AAA 2.10 — the shipped traps, WITH the thread they imitate. One entry per
 * shipped intruder (its tightest trap), deduped by pattern so a word caught by
 * both `suffix:GHT` and `rhyme:AY1T` is acknowledged once. `words` carries the
 * whole set, which is what lets the room require ≥3 of the player's four tiles
 * inside a trap before it claims she was chasing it.
 */
function herringSets(traps: readonly Trap[], ship: readonly string[]): OutHerring[] {
  const out: OutHerring[] = [];
  const seenKeys = new Set<string>();
  for (const word of ship) {
    const candidates = traps
      .filter((t) => t.intruders.includes(word) && !seenKeys.has(t.key))
      .sort((a, b) => b.score - a.score || b.words.length - a.words.length || (a.key < b.key ? -1 : 1));
    const best = candidates[0];
    if (!best) continue;
    seenKeys.add(best.key);
    out.push({
      words: [...best.words].sort(),
      relation: best.relation,
      ...(best.detail ? { detail: best.detail } : {}),
    });
  }
  return out;
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

  // Pass 1: compose each board for its INTENDED tier (trivia cap, wordplay
  // floor, subtlety floor). The authored difficulty is the intent; pass 2
  // decides whether the board's measured traps earn it.
  const intent = new Map<string, Tier>(
    boards.map((b) => [b.id, INTENDED_TIER[b.difficulty] ?? 1]),
  );
  const composedTier = new Map<string, Tier>();
  const composed = boards.map((b) => {
    for (let t = intent.get(b.id)!; t >= 1; t--) {
      const snapshot = new Map(bankUse);
      const attempt = replaceGroups(b, t as Tier, rng);
      if (attempt) {
        composedTier.set(b.id, t as Tier);
        return attempt;
      }
      bankUse.clear();
      for (const [k, v] of snapshot) bankUse.set(k, v);
    }
    throw new Error(`${b.id}: cannot be composed at any tier (bank exhausted?)`);
  });

  // Pass 2: herring solver → tier confirmation (demote, never fake) → layout.
  const allFailures: string[] = [];
  const solved = composed.map((b) => ({ board: b, ...solveBoard(b, composed) }));
  for (const s of solved) for (const f of s.failures) allFailures.push(`${s.board.id}: ${f}`);
  if (allFailures.length > 0) {
    console.error(allFailures.join('\n'));
    throw new Error(`word-web solver found ${allFailures.length} unintended complete grouping(s) — fix the authored boards`);
  }

  let demoted = 0;
  const built: OutBoard[] = solved.map(({ board: b, herrings, traps }) => {
    const wanted = composedTier.get(b.id)!;
    let tier = wanted;
    while (tier > 1 && !meetsTier(b, herrings, tier)) tier = (tier - 1) as Tier;
    if (tier !== wanted) demoted++;
    const ship = shippedHerrings(herrings, tier);
    const layout = buildLayout(b, ship, SEED + [...b.id].reduce((h, c) => h + c.charCodeAt(0), 0));
    return {
      id: b.id,
      tier,
      groups: b.groups.map((g) => ({ ...g, type: typeOfTheme(g.theme), decoys: [] as string[] })),
      ambiguousWords: ship,
      herrings: herringSets(traps, ship),
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
    return b.ambiguousWords.length >= spec.minHerrings
      && types.filter((t) => t !== 'wordplay').length >= spec.minPlain
      && types.filter((t) => t === 'wordplay').length >= spec.minWordplay
      && types.filter((t) => t === 'trivia').length <= spec.maxTrivia
      && b.groups.filter((g) => isSubtleTheme(g.theme)).length >= spec.minSubtle;
  };
  const out = built.filter(shipsHere);
  const dropped = built.length - out.length;

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
    b.ambiguousWords = b.ambiguousWords.slice(0, TIER_SPECS[2].maxHerrings);
  }

  // Pass 3: decoys for the naming act.
  assignDecoys(out);

  validate(out);

  writeFileSync(join(here, 'generated', 'word-web.json'), JSON.stringify(out));
  const perTier = ([1, 2, 3] as Tier[]).map((t) => {
    const arr = out.filter((b) => b.tier === t);
    const avgHerrings = arr.reduce((a, b) => a + b.ambiguousWords.length, 0) / Math.max(1, arr.length);
    const subtle = arr.reduce((a, b) => a + b.groups.filter((g) => isSubtleTheme(g.theme)).length, 0) / Math.max(1, arr.length);
    return `t${t} (${tierLabel(t)}): ${arr.length} boards (~${avgHerrings.toFixed(1)} traps, ~${subtle.toFixed(1)} subtle cats)`;
  }).join(', ');
  const trivia = out.filter((b) => b.groups.some((g) => g.type === 'trivia')).length;
  const byRelation = new Map<string, number>();
  for (const b of out) for (const h of b.herrings) byRelation.set(h.relation, (byRelation.get(h.relation) ?? 0) + 1);
  console.log(
    `word-web.json: ${out.length} boards — ${perTier}; ${demoted} demoted for want of tight traps, ` +
    `${dropped} dropped for having none at all, ` +
    `${trivia} with a (yellow-tier) trivia category, bank groups used: ${[...bankUse.values()].reduce((a, b) => a + b, 0)}; ` +
    `named herrings by relation: ${[...byRelation].map(([r, n]) => `${r} ${n}`).join(', ')}`,
  );
}

/** The 2.7–2.9 validator — the build fails on any violating board. */
function validate(puzzles: OutBoard[]): void {
  const problems: string[] = [];
  for (const p of puzzles) {
    if (p.groups.length !== 4) problems.push(`${p.id}: ${p.groups.length} groups`);
    const words = p.groups.flatMap((g) => g.words);
    if (new Set(words).size !== 16 || words.length !== 16) problems.push(`${p.id}: needs 16 unique words`);
    // The cozy tone gate: every tile is set in the manor's own type (task 2).
    for (const w of words) {
      if (!toneOk(w.toLowerCase())) problems.push(`${p.id}: "${w}" fails the tone gate`);
    }
    if (new Set(p.groups.map((g) => g.tier)).size !== 4) problems.push(`${p.id}: tiers not distinct`);

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
    const plain = p.groups.filter((g) => g.type !== 'wordplay').length;
    if (plain < spec.minPlain) {
      problems.push(`${p.id}: ${plain} plain categories (tier ${p.tier} needs ${spec.minPlain})`);
    }
    const subtle = p.groups.filter((g) => isSubtleTheme(g.theme)).length;
    if (subtle < spec.minSubtle) {
      problems.push(`${p.id}: ${subtle} subtle categories (tier ${p.tier} needs ${spec.minSubtle})`);
    }

    // 2.7 — the tier's herring budget (cap AND floor; AAA's ≤3 still holds)
    if (p.ambiguousWords.length > Math.min(3, spec.maxHerrings)) {
      problems.push(`${p.id}: ${p.ambiguousWords.length} herrings (tier ${p.tier} budget ${spec.maxHerrings})`);
    }
    if (p.ambiguousWords.length < spec.minHerrings) {
      problems.push(`${p.id}: ${p.ambiguousWords.length} herrings (tier ${p.tier} needs ${spec.minHerrings})`);
    }
    if (p.ambiguousWords.some((w) => !words.includes(w))) problems.push(`${p.id}: herring not on board`);

    // 2.10 — every shipped trap is NAMED. A herring the room cannot describe
    // is a −2-step guess that buys nothing, which is the criterion's whole
    // complaint; and a set of fewer than 3 words can never be matched by the
    // ≥3-of-4 rule the room uses, so it would be dead copy.
    const RELATIONS = ['rhyme', 'shared-affix', 'doubled-letter', 'semantic'];
    if (p.herrings.length === 0 && p.ambiguousWords.length > 0) {
      problems.push(`${p.id}: ${p.ambiguousWords.length} herrings but none named`);
    }
    for (const h of p.herrings) {
      if (!RELATIONS.includes(h.relation)) problems.push(`${p.id}: unknown herring relation "${h.relation}"`);
      if (h.words.length < 3) problems.push(`${p.id}: herring set of ${h.words.length} can never be matched`);
      if (new Set(h.words).size !== h.words.length) problems.push(`${p.id}: herring set repeats a word`);
      for (const w of h.words) if (!words.includes(w)) problems.push(`${p.id}: herring word "${w}" not on board`);
      if (h.relation === 'shared-affix' && !h.detail) {
        problems.push(`${p.id}: shared-affix herring with no letters to point at`);
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

    // 2.11
    for (const g of p.groups) {
      if (g.decoys.length !== 2 || g.decoys.includes(g.theme)) problems.push(`${p.id}: "${g.theme}" needs 2 decoys`);
    }
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`word-web validation failed with ${problems.length} problem(s)`);
  }
}

if (process.argv.includes('--report')) report();
else main();
