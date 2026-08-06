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
 *   - an adversarial opening `layout` (2.6): herrings clustered adjacently,
 *     no gift rows (no row holds 3+ of one group);
 *   - two plausible same-tier `decoys` per group for the 2.11 act of naming.
 *
 * Run: npx tsx content/generate-wordweb.ts
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

function typeOfTheme(theme: string): GroupType {
  if (TRIVIA_THEMES.has(theme)) return 'trivia';
  if (WORDPLAY_THEMES.has(theme)) return 'wordplay';
  if (theme.includes('___')) return 'wordplay';
  if (/^Can (Be|Follow|Precede) /.test(theme)) return 'wordplay';
  if (/^Contains /.test(theme)) return 'wordplay';
  if (/^Hidden /.test(theme)) return 'wordplay';
  if (/^(Anagrams of|Rhymes with) /.test(theme)) return 'wordplay';
  if (/^(Silent|Starts|Two Pairs)/.test(theme)) return 'wordplay';
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

function isSubtleTheme(theme: string): boolean {
  if (SUBTLE_THEMES.has(theme)) return true;
  if (/^(Anagrams of|Rhymes with) /.test(theme)) return true;
  if (/^Hidden /.test(theme)) return true;
  if (/^Silent /.test(theme)) return true;
  if (/^(Two Pairs|Starts and Ends)/.test(theme)) return true;
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
interface OutBoard extends WordWebPuzzle {
  /** Manor row band — authoritative (rows 0–2 / 3–4 / 5–6). */
  tier: Tier;
  groups: OutGroup[];
  ambiguousWords: string[];
  layout: string[];
}

// ---------------------------------------------------------------------------
// The three manor tiers
// ---------------------------------------------------------------------------

/** The authored difficulty is the *intent*; measured structure confirms it. */
const INTENDED_TIER: Record<string, Tier> = {
  easy: 1, medium: 1, hard: 3, expert: 3,
};

interface RoomTierSpec {
  /** Trivia gimmes: allowed at the bottom of the house, banned at the top. */
  maxTrivia: number;
  minWordplay: number;
  /** Categories you must hear/unscramble rather than read off the tiles. */
  minSubtle: number;
  /** The herring budget: how many planted traps, and how tight each must pull. */
  minHerrings: number;
  maxHerrings: number;
  minHerringScore: number;
}

/** Solver score at which a trap counts as a real pull, not a coincidence. */
const HERRING_TIGHT = 2;

const TIER_SPECS: Record<Tier, RoomTierSpec> = {
  1: { maxTrivia: 1, minWordplay: 2, minSubtle: 0, minHerrings: 0, maxHerrings: 1, minHerringScore: 1 },
  2: { maxTrivia: 1, minWordplay: 2, minSubtle: 1, minHerrings: 1, maxHerrings: 2, minHerringScore: HERRING_TIGHT },
  3: { maxTrivia: 0, minWordplay: 2, minSubtle: 2, minHerrings: 2, maxHerrings: 3, minHerringScore: HERRING_TIGHT },
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
  const replacementOrder = (): RawGroup[] => {
    const t = typed();
    const extraTrivia = t.filter((x) => x.type === 'trivia').slice(spec.maxTrivia).map((x) => x.g);
    const bluntWordplay = t
      .filter((x) => x.type === 'wordplay' && !isSubtleTheme(x.g.theme))
      .map((x) => x.g);
    const semantics = t
      .filter((x) => x.type === 'semantic' && (tier === 3 || x.g.tier !== 'yellow'))
      .sort((a, b) => TIER_ORDER.indexOf(a.g.tier) - TIER_ORDER.indexOf(b.g.tier))
      .map((x) => x.g);
    return [...extraTrivia, ...semantics, ...bluntWordplay];
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
    if (trivia <= spec.maxTrivia && wordplay >= spec.minWordplay && subtle >= spec.minSubtle) break;
    if (guard++ >= 6) return null;

    const victim = replacementOrder().find((g) => !isSubtleTheme(g.theme));
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

/** All pattern-derived word sets on a board, by a printable pattern name. */
function patternSets(words: string[]): Map<string, Set<string>> {
  const sets = new Map<string, Set<string>>();
  const add = (name: string, w: string) => {
    let s = sets.get(name);
    if (!s) sets.set(name, (s = new Set()));
    s.add(w);
  };
  for (const w of words) {
    if (w.length >= 5) add(`suffix:${w.slice(-3)}`, w);
    if (w.length >= 5) add(`prefix:${w.slice(0, 3)}`, w);
    if (/([A-Z])\1/.test(w)) add('doubled-letter', w);
    for (const key of phonetics.rhymeKeysOf(w.toLowerCase())) add(`rhyme:${key}`, w);
  }
  return sets;
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
function crossBoardTraps(board: RawBoard, all: RawBoard[]): Map<string, number> {
  const groupOf = new Map<string, RawGroup>();
  for (const g of board.groups) for (const w of g.words) groupOf.set(w, g);
  const scores = new Map<string, number>();
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
      if (minority) scores.set(minority[0]!, (scores.get(minority[0]!) ?? 0) + HERRING_TIGHT);
    }
  }
  return scores;
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
  for (const [name, set] of patternSets(words)) {
    if (set.size === 4 && !intended.some((g) => sameMembers(set, g))) {
      failures.push(`pattern ${name}: ${[...set].join(', ')}`);
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
 * Trap scoring, extracted so composition can *plant* traps rather than only
 * discover them (round 4: tier 3 must ship 2–3 tight ones). Score ≥ 2 means a
 * real pull — a 5th member of a complete group, or a word that literally
 * satisfies another group's stated letter rule.
 */
function scoreTraps(groups: readonly RawGroup[]): ScoredHerring[] {
  const words = groups.flatMap((g) => g.words);
  const groupOf = new Map<string, RawGroup>();
  for (const g of groups) for (const w of g.words) groupOf.set(w, g);

  const herringScore = new Map<string, number>();
  const bump = (w: string, n: number) => herringScore.set(w, (herringScore.get(w) ?? 0) + n);

  for (const [, set] of patternSets(words)) {
    if (set.size === 5 || set.size === 6) {
      // A full group + 1–2 extras sharing its pattern: 5th-member traps.
      const byGroup = new Map<RawGroup, string[]>();
      for (const w of set) {
        const g = groupOf.get(w)!;
        byGroup.set(g, [...(byGroup.get(g) ?? []), w]);
      }
      const dominant = [...byGroup.entries()].find(([, ws]) => ws.length === 4);
      if (dominant) for (const w of set) if (groupOf.get(w) !== dominant[0]) bump(w, 2);
    }
    if (set.size === 3) {
      // Three words sharing a visible pattern across two groups: the minority
      // word(s) read as belonging with the pair — soft cross-category traps.
      const counts = new Map<RawGroup, number>();
      for (const w of set) counts.set(groupOf.get(w)!, (counts.get(groupOf.get(w)!) ?? 0) + 1);
      if (counts.size === 2) {
        const minority = [...counts.entries()].find(([, n]) => n === 1);
        if (minority) for (const w of set) if (groupOf.get(w) === minority[0]) bump(w, 1);
      }
    }
  }

  // "Contains X" themes are letter-verifiable: an outside word containing X is
  // a cross-category trap for that group.
  for (const g of groups) {
    const m = g.theme.match(/^Contains "([A-Z]+)"$/);
    if (!m) continue;
    for (const w of words) {
      if (groupOf.get(w) !== g && w.includes(m[1]!)) bump(w, 3);
    }
  }

  return [...herringScore.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([word, score]) => ({ word, score }));
}

/** How many traps on this board pull tightly enough to count for a tier. */
function tightTrapCount(groups: readonly RawGroup[], minScore: number): number {
  return scoreTraps(groups).filter((h) => h.score >= minScore).length;
}

function solveBoard(board: RawBoard, all: RawBoard[]): { failures: string[]; herrings: ScoredHerring[] } {
  const failures = patternFailures(board.groups);
  const intended = board.groups.map((g) => g.words);

  // Cross-board semantic clusters.
  for (const cluster of crossBoardClusters(board, all)) {
    if (!intended.some((g) => sameMembers(cluster.words, g))) {
      failures.push(`semantic cluster ${cluster.name}: ${cluster.words.join(', ')}`);
    }
  }

  // Letter/sound traps plus the corpus-verified semantic ones.
  const scores = new Map(scoreTraps(board.groups).map((h) => [h.word, h.score] as const));
  for (const [word, score] of crossBoardTraps(board, all)) {
    scores.set(word, (scores.get(word) ?? 0) + score);
  }
  const herrings: ScoredHerring[] = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([word, score]) => ({ word, score }));

  return { failures, herrings };
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
  const out: OutBoard[] = solved.map(({ board: b, herrings }) => {
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
      layout,
    };
  });

  // Pass 2b: balance. Every board that CAN be tier 3 does not have to BE tier
  // 3 — the bottom rows are visited far more often than the top, so the tier-3
  // shelf keeps only the trappiest TIER3_CAP boards and the rest settle into
  // tier 2 (whose gates they already clear).
  const TIER3_CAP = 18;
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
  console.log(
    `word-web.json: ${out.length} boards — ${perTier}; ${demoted} demoted for want of tight traps, ` +
    `${trivia} with a (yellow-tier) trivia category, bank groups used: ${[...bankUse.values()].reduce((a, b) => a + b, 0)}`,
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

main();
