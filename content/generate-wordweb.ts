import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, pick, shuffle } from '../src/engine/rng';
import { loadPhonetics } from './lib/phonetics';
import type { Difficulty, WordWebPuzzle } from '../src/engine/types';

/**
 * The Library's Word Web generator — the fairness pass Connections never had
 * (AAA 2.6–2.11, BENCHMARKS §"our two structural fixes").
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
  { theme: 'Starts and Ends with the Same Letter', words: ['EDGE', 'TREAT', 'NYLON', 'DREAD'] },
  { theme: 'Hidden Body Parts', words: ['CHARMING', 'SHIPMENT', 'FEARLESS', 'RIBBON'] },
  { theme: 'Hidden Animals', words: ['SCOWL', 'SPIGOT', 'CATALOG', 'DOGMA'] },
  { theme: '___ SMITH', words: ['BLACK', 'LOCK', 'GOLD', 'WORD'] },
  { theme: 'Can Follow "HAND"', words: ['SHAKE', 'BOOK', 'WRITING', 'CUFF'] },
  { theme: 'Can Precede "LIGHT"', words: ['DAY', 'MOON', 'CANDLE', 'LAMP'] },
];
const BANK_REUSE_CAP = 3;

// ---------------------------------------------------------------------------
// Load the authored boards
// ---------------------------------------------------------------------------

interface RawGroup { theme: string; tier: 'yellow' | 'green' | 'blue' | 'purple'; words: string[] }
interface RawBoard { id: string; difficulty: Difficulty; groups: RawGroup[] }

interface OutGroup extends RawGroup { type: GroupType; decoys: string[] }
interface OutBoard extends WordWebPuzzle {
  groups: OutGroup[];
  ambiguousWords: string[];
  layout: string[];
}

const here = dirname(fileURLToPath(import.meta.url));
const boards = JSON.parse(
  readFileSync(join(here, 'authored', 'word-web-boards.json'), 'utf8'),
) as RawBoard[];

// ---------------------------------------------------------------------------
// 2.9 — trivia cap + wordplay floor via bank replacement, trivia → yellow
// ---------------------------------------------------------------------------

const TIER_ORDER = ['yellow', 'green', 'blue', 'purple'] as const;
const bankUse = new Map<string, number>();

function replaceGroups(board: RawBoard, rng: () => number): RawBoard {
  let groups = board.groups.map((g) => ({ ...g, words: [...g.words] }));

  const typed = () => groups.map((g) => ({ g, type: typeOfTheme(g.theme) }));

  // Groups eligible for replacement, worst-first: trivia beyond the first,
  // then green/blue/purple semantics. The yellow semantic anchor stays.
  const replacementOrder = (): RawGroup[] => {
    const t = typed();
    const extraTrivia = t.filter((x) => x.type === 'trivia').slice(1).map((x) => x.g);
    const semantics = t
      .filter((x) => x.type === 'semantic' && x.g.tier !== 'yellow')
      .sort((a, b) => TIER_ORDER.indexOf(a.g.tier) - TIER_ORDER.indexOf(b.g.tier))
      .map((x) => x.g);
    return [...extraTrivia, ...semantics];
  };

  const boardWords = () => new Set(groups.flatMap((g) => g.words));
  const boardThemes = () => new Set(groups.map((g) => g.theme));

  const pickBankGroup = (): BankGroup | null => {
    const words = boardWords();
    const themes = boardThemes();
    const usable = WORDPLAY_BANK.filter(
      (b) =>
        (bankUse.get(b.theme) ?? 0) < BANK_REUSE_CAP &&
        !themes.has(b.theme) &&
        b.words.every((w) => !words.has(w)),
    );
    if (usable.length === 0) return null;
    return pick(createRngFrom(rng), usable);
  };

  // Enforce: ≤1 trivia, ≥2 wordplay.
  let guard = 0;
  while (guard++ < 8) {
    const t = typed();
    const triviaCount = t.filter((x) => x.type === 'trivia').length;
    const wordplayCount = t.filter((x) => x.type === 'wordplay').length;
    if (triviaCount <= 1 && wordplayCount >= 2) break;

    const victim = replacementOrder()[0];
    if (!victim) throw new Error(`${board.id}: no replaceable group left (trivia ${triviaCount}, wordplay ${wordplayCount})`);
    const bank = pickBankGroup();
    if (!bank) throw new Error(`${board.id}: wordplay bank exhausted (raise BANK_REUSE_CAP or add groups)`);
    bankUse.set(bank.theme, (bankUse.get(bank.theme) ?? 0) + 1);
    groups = groups.map((g) =>
      g === victim ? { theme: bank.theme, tier: g.tier, words: [...bank.words] } : g,
    );
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

function sameMembers(a: Iterable<string>, b: string[]): boolean {
  const s = new Set(a);
  return b.length === s.size && b.every((w) => s.has(w));
}

/**
 * Returns build-failing unintended complete groupings and the planted-herring
 * list (≤3) for a board.
 */
function solveBoard(board: RawBoard, all: RawBoard[]): { failures: string[]; herrings: string[] } {
  const failures: string[] = [];
  const words = board.groups.flatMap((g) => g.words);
  const intended = board.groups.map((g) => g.words);
  const groupOf = new Map<string, RawGroup>();
  for (const g of board.groups) for (const w of g.words) groupOf.set(w, g);

  const herringScore = new Map<string, number>();
  const bump = (w: string, n: number) => herringScore.set(w, (herringScore.get(w) ?? 0) + n);

  // Letter/sound patterns.
  for (const [name, set] of patternSets(words)) {
    if (set.size === 4 && !intended.some((g) => sameMembers(set, g))) {
      // Four words, one shared pattern, not an intended group — a competing
      // complete grouping a careful player could commit to. Never ships.
      failures.push(`pattern ${name}: ${[...set].join(', ')}`);
    }
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

  // Cross-board semantic clusters.
  for (const cluster of crossBoardClusters(board, all)) {
    if (!intended.some((g) => sameMembers(cluster.words, g))) {
      failures.push(`semantic cluster ${cluster.name}: ${cluster.words.join(', ')}`);
    }
  }

  // "Contains X" themes are letter-verifiable: an outside word containing X is
  // a cross-category trap for that group.
  for (const g of board.groups) {
    const m = g.theme.match(/^Contains "([A-Z]+)"$/);
    if (!m) continue;
    for (const w of words) {
      if (groupOf.get(w) !== g && w.includes(m[1]!)) bump(w, 3);
    }
  }

  const herrings = [...herringScore.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([w]) => w);

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

function assignDecoys(finals: (RawBoard & { groups: OutGroup[] })[]): void {
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

function main() {
  const rng = createRng(SEED);

  // Pass 1: 2.9 composition (trivia cap, wordplay floor, trivia → yellow).
  const composed = boards.map((b) => replaceGroups(b, rng));

  // Pass 2: herring solver + layout.
  const allFailures: string[] = [];
  const out: OutBoard[] = composed.map((b) => {
    const { failures, herrings } = solveBoard(b, composed);
    for (const f of failures) allFailures.push(`${b.id}: ${f}`);
    const layout = failures.length === 0 ? buildLayout(b, herrings, SEED + [...b.id].reduce((h, c) => h + c.charCodeAt(0), 0)) : [];
    return {
      id: b.id,
      difficulty: b.difficulty,
      groups: b.groups.map((g) => ({ ...g, type: typeOfTheme(g.theme), decoys: [] as string[] })),
      ambiguousWords: herrings,
      layout,
    };
  });

  if (allFailures.length > 0) {
    console.error(allFailures.join('\n'));
    throw new Error(`word-web solver found ${allFailures.length} unintended complete grouping(s) — fix the authored boards`);
  }

  // Pass 3: decoys for the naming act.
  assignDecoys(out);

  validate(out);

  writeFileSync(join(here, 'generated', 'word-web.json'), JSON.stringify(out));
  const withHerrings = out.filter((b) => b.ambiguousWords.length > 0).length;
  const trivia = out.filter((b) => b.groups.some((g) => g.type === 'trivia')).length;
  console.log(
    `word-web.json: ${out.length} boards — ${withHerrings} with planted herrings, ` +
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
    if (new Set(p.groups.map((g) => g.tier)).size !== 4) problems.push(`${p.id}: tiers not distinct`);

    // 2.9
    const trivia = p.groups.filter((g) => g.type === 'trivia');
    if (trivia.length > 1) problems.push(`${p.id}: ${trivia.length} trivia categories (max 1)`);
    if (trivia.some((g) => g.tier !== 'yellow')) problems.push(`${p.id}: trivia not at the easiest tier`);
    if (p.groups.filter((g) => g.type === 'wordplay').length < 2) problems.push(`${p.id}: fewer than 2 wordplay categories`);

    // 2.7
    if (p.ambiguousWords.length > 3) problems.push(`${p.id}: ${p.ambiguousWords.length} herrings (max 3)`);
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
