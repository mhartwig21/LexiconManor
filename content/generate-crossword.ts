import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, pick, shuffle, type Rng } from '../src/engine/rng';
import {
  validateCrosswordPuzzle,
  type CrosswordDir, type CrosswordEntry, type CrosswordPuzzle,
} from '../src/engine/puzzles/crossword';
import { gateOk } from './generate-gate';
import { tierLabel } from '../src/engine/rooms/adapters/tier-select';
import type { Tier } from '../src/engine/types';

/**
 * Mini-crossword generator for The Linen Closet. OWNER: A5.
 *
 * Assembles criss-cross layouts from the hand-authored clue bank
 * (content/authored/crossword-clues.json). The solver check is structural
 * honesty: every maximal run of ≥2 letters in the finished grid is exactly
 * one clued entry (no accidental words the player is never clued about),
 * intersections agree, and the layout is one connected piece — enforced by
 * validateCrosswordPuzzle, the same routine the tests replay over the
 * shipped pool.
 *
 * Every clue-bank word must exist in enable1 (build fails otherwise): the
 * Closet never asks for a word the house dictionary would refuse.
 *
 * ---------------------------------------------------------------------------
 * THREE TIERS, MAPPED TO MANOR ROWS (owner directive, round 4: "5x5 tier 3
 * with harder clue styles")
 * ---------------------------------------------------------------------------
 *   tier 1 — a 4×4 closet, 3 entries, easy words with plain definition clues.
 *   tier 2 — the full 5×5, 4 entries, easy+medium words, plain clues.
 *   tier 3 — 5×5, 5 entries (a denser criss-cross), the whole bank including
 *            hard/expert words, and at least MIN_WRY_ENTRIES of the clues are
 *            drawn from the bank's `wry` pool: misdirecting, double-meaning,
 *            manor-voiced clues rather than dictionary glosses. Difficulty here
 *            is a knob on how the CLUE reads, not on how much there is to do —
 *            AAA 3.8's hard-mode philosophy.
 *
 * ---------------------------------------------------------------------------
 * ROUND 24 — ONE CLUE, ONE NIGHT (REVIEW_AA 5.9)
 * ---------------------------------------------------------------------------
 * Both reviewers landed on the same measurement: 360 shipped entries carried
 * 155 unique clues, because a word owned exactly one plain sentence and one
 * wry one and the generator reused them up to twelve times. Playing a tier in
 * order, the tenth tier-1 closet was three of three clues already solved.
 *
 * A word now owns a POOL of clues and every use spends a fresh one, tracked
 * across all three tiers (see `spent`), so no sentence is printed twice
 * anywhere in the ninety puzzles. The clue pool doubles as the reuse cap: an
 * answer can appear as many times as it has clues and no more, which took the
 * worst answer from SUN ×12 to ×4. Ratio: 0.431 → 1.000, gated at
 * MIN_UNIQUE_CLUE_RATIO on the way out.
 */

const SEED = 20260806;
const dir = dirname(fileURLToPath(import.meta.url));

/**
 * Per-WORD authoring tag in content/authored/crossword-clues.json. This is a
 * property of the word+clue pair (how hard that answer is to see), NOT the
 * retired puzzle-level `difficulty` alias — a tier-3 closet is built FROM these
 * tags, it does not carry one.
 */
type ClueDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

/**
 * A bank word and every clue ever written for it.
 *
 * ROUND 24 (REVIEW_AA 5.9). This used to be one `clue` and one optional
 * `wry`, and both reviewers measured the same consequence: 360 shipped
 * entries carried 155 unique clues (43.1%) because a word reused four times
 * in a tier printed the SAME sentence four times, and up to twelve times
 * across the three tiers. "Parchment guide" appeared eight times; so did
 * "Mrs. Bramble's morning ritual" — the house voice memorised by the eighth
 * Linen Closet, after which the room is a typing test.
 *
 * So a word now owns a POOL of clues, and each use spends a fresh one. Two
 * consequences fall out of that and both are wanted:
 *   · the clue pool is also the reuse cap. A word can appear exactly as many
 *     times in the whole 90-puzzle pool as it has clues (four), where the old
 *     per-tier MAX_WORD_USES let SUN headline twelve.
 *   · uniqueness is structural, not policed. assignClues() never hands back a
 *     sentence it has already spent, so the shipped ratio is 1.000 by
 *     construction and the gate at the bottom of main() only has to confirm it.
 */
interface ClueDef {
  word: string;
  /** Plain-register clues: a definition, a place in the house, a use. */
  clues: string[];
  /** Misdirecting / double-meaning clues. Tier 3 spends these first. */
  wry: string[];
  difficulty: ClueDifficulty;
}

const DIFFS: ClueDifficulty[] = ['easy', 'medium', 'hard', 'expert'];
const TIERS: Tier[] = [1, 2, 3];

/** Grid side per tier — the closet itself grows. */
const SIZES: Record<Tier, number> = { 1: 4, 2: 5, 3: 5 };
const TARGET: Record<Tier, number> = { 1: 30, 2: 30, 3: 30 };
const ENTRIES: Record<Tier, number> = { 1: 3, 2: 4, 3: 5 };
/** Bank words a tier may draw on (by their authored difficulty). */
const BANK_DIFFS: Record<Tier, ClueDifficulty[]> = {
  1: ['easy'],
  2: ['easy', 'medium'],
  3: ['easy', 'medium', 'hard', 'expert'],
};
/** Every puzzle must headline at least one word of one of these difficulties. */
const HEADLINE_DIFFS: Record<Tier, ClueDifficulty[]> = {
  1: ['easy'], 2: ['medium'], 3: ['hard', 'expert'],
};
/** Tier 3 must read at least this many clues in the harder, wry style. */
const MIN_WRY_ENTRIES = 2;
/** Every bank word owes at least this many plain clues and this many wry ones. */
const MIN_PLAIN_CLUES = 2;
const MIN_WRY_CLUES = 1;
/**
 * The shipped pool must be at least this unique. It is 1.000 by construction
 * (see ClueDef) — the gate exists so that a future edit which reintroduces
 * clue sharing fails the build instead of quietly halving the room's life.
 */
const MIN_UNIQUE_CLUE_RATIO = 0.98;

type TieredCrosswordPuzzle = CrosswordPuzzle & { tier: Tier };

interface Placed { dir: CrosswordDir; row: number; col: number; word: ClueDef; }

function toPuzzle(
  id: string, tier: Tier, placed: Placed[], clueOf: (p: Placed) => string,
): TieredCrosswordPuzzle {
  const SIZE = SIZES[tier];
  // Real-crossword numbering: entry starts in reading order.
  const sorted = [...placed].sort((a, b) => a.row - b.row || a.col - b.col || (a.dir === 'across' ? -1 : 1));
  const numberOf = new Map<string, number>();
  let n = 0;
  const entries: CrosswordEntry[] = sorted.map((p) => {
    const startKey = `${p.row},${p.col}`;
    let num = numberOf.get(startKey);
    if (num === undefined) {
      num = ++n;
      numberOf.set(startKey, num);
    }
    return {
      id: `${num}${p.dir === 'across' ? 'A' : 'D'}`,
      dir: p.dir,
      row: p.row,
      col: p.col,
      answer: p.word.word,
      clue: clueOf(p),
    };
  });
  return { id, tier, size: SIZE, entries };
}

/** Structural problems, ignoring the entry-count rule while mid-build. */
function partialProblems(tier: Tier, placed: Placed[]): string[] {
  // Layout only — the clue text is chosen after a layout is accepted, so any
  // non-empty placeholder does here.
  const puzzle = toPuzzle('partial', tier, placed, (p) => p.word.clues[0]!);
  return validateCrosswordPuzzle(puzzle).filter((p) => !p.includes('entries (want'));
}

/**
 * How much of a word's clue pool has been spent, across the WHOLE shipped
 * pool — not per tier. A cursor never rewinds, so no sentence is printed
 * twice anywhere in the Linen Closet.
 */
interface Cursor { plain: number; wry: number }

/** Which register a tier reaches for first, and whether it may fall back. */
const REGISTER: Record<Tier, { prefer: 'plain' | 'wry'; fallback: boolean }> = {
  // Tiers 1 and 2 promise plain definition clues and never quietly hand over
  // a misdirection: difficulty at those rows is the WORD, not the reading. If
  // a word's plain pool is spent, the word is simply unavailable down there.
  1: { prefer: 'plain', fallback: false },
  2: { prefer: 'plain', fallback: false },
  // Tier 3 is the wry row (AAA 3.8: hard mode is a knob on how the clue
  // reads). Plain is the fallback so a five-entry criss-cross is never
  // blocked by one exhausted wry pool.
  3: { prefer: 'wry', fallback: true },
};

/** Can this word still be clued at this tier? */
function available(def: ClueDef, tier: Tier, spent: Map<string, Cursor>): boolean {
  const c = spent.get(def.word) ?? { plain: 0, wry: 0 };
  const hasPlain = c.plain < def.clues.length;
  const hasWry = c.wry < def.wry.length;
  const { prefer, fallback } = REGISTER[tier];
  const first = prefer === 'plain' ? hasPlain : hasWry;
  return first || (fallback && (prefer === 'plain' ? hasWry : hasPlain));
}

/**
 * Choose a fresh clue for every placed word WITHOUT committing: the caller
 * only commits once the whole puzzle is accepted, so a rejected layout does
 * not burn a sentence. Returns null when the tier's promise cannot be kept
 * (tier 1 out of plain clues, tier 3 short of its wry quota).
 */
function planClues(
  tier: Tier, placed: Placed[], spent: Map<string, Cursor>,
): { plan: Map<string, string>; commit: Map<string, Cursor> } | null {
  const commit = new Map<string, Cursor>();
  const plan = new Map<string, string>();
  const { prefer, fallback } = REGISTER[tier];
  let wryCount = 0;
  for (const p of placed) {
    const def = p.word;
    const c = commit.get(def.word) ?? { ...(spent.get(def.word) ?? { plain: 0, wry: 0 }) };
    commit.set(def.word, c);
    const takePlain = () => (c.plain < def.clues.length ? def.clues[c.plain++]! : null);
    const takeWry = () => (c.wry < def.wry.length ? def.wry[c.wry++]! : null);
    const order = prefer === 'wry' ? [takeWry, takePlain] : [takePlain, takeWry];
    const wanted = fallback ? order : order.slice(0, 1);
    let text: string | null = null;
    let usedWry = false;
    for (const take of wanted) {
      text = take();
      if (text !== null) { usedWry = take === takeWry; break; }
    }
    if (text === null) return null;
    if (usedWry) wryCount++;
    plan.set(def.word, text);
  }
  if (tier === 3 && wryCount < MIN_WRY_ENTRIES) return null;
  return { plan, commit };
}

function tryBuild(rng: Rng, tier: Tier, bank: ClueDef[], exact: ClueDef[], count: number): Placed[] | null {
  const SIZE = SIZES[tier];
  const first = pick(rng, exact);
  if (first.word.length > SIZE) return null;
  const placed: Placed[] = [{
    dir: 'across',
    row: Math.floor((SIZE - 1) / 2),
    col: Math.floor((SIZE - first.word.length) / 2),
    word: first,
  }];
  const used = new Set([first.word]);

  let stalls = 0;
  while (placed.length < count && stalls < 40) {
    stalls++;
    const host = pick(rng, placed);
    const p = Math.floor(rng() * host.word.word.length);
    const letter = host.word.word[p]!;
    const hostRow = host.dir === 'down' ? host.row + p : host.row;
    const hostCol = host.dir === 'across' ? host.col + p : host.col;
    const newDir: CrosswordDir = host.dir === 'across' ? 'down' : 'across';

    const candidates = shuffle(rng, bank.filter((c) => !used.has(c.word) && c.word.includes(letter)));
    for (const cand of candidates.slice(0, 25)) {
      const positions = [...cand.word].map((ch, i) => (ch === letter ? i : -1)).filter((i) => i >= 0);
      const q = pick(rng, positions);
      const row = newDir === 'down' ? hostRow - q : hostRow;
      const col = newDir === 'across' ? hostCol - q : hostCol;
      if (row < 0 || col < 0) continue;
      if (newDir === 'down' && row + cand.word.length > SIZE) continue;
      if (newDir === 'across' && col + cand.word.length > SIZE) continue;
      const attempt: Placed[] = [...placed, { dir: newDir, row, col, word: cand }];
      if (partialProblems(tier, attempt).length > 0) continue;
      placed.push({ dir: newDir, row, col, word: cand });
      used.add(cand.word);
      stalls = 0;
      break;
    }
  }
  return placed.length === count ? placed : null;
}

function main() {
  const rng = createRng(SEED);
  const raw = JSON.parse(readFileSync(join(dir, 'authored', 'crossword-clues.json'), 'utf8')) as { clues: ClueDef[] };
  const enable1 = new Set(
    readFileSync(join(dir, 'data', 'enable1.txt'), 'utf8').split('\n').map((w) => w.trim().toUpperCase()),
  );

  // Bank validation: hard failures — the Closet never clues a non-word.
  const problems: string[] = [];
  const seen = new Set<string>();
  /** Every clue sentence in the bank, so no two words can share one. */
  const clueOwner = new Map<string, string>();
  for (const c of raw.clues) {
    if (seen.has(c.word)) problems.push(`${c.word}: duplicate bank word`);
    seen.add(c.word);
    if (!/^[A-Z]{3,5}$/.test(c.word)) problems.push(`${c.word}: not 3–5 uppercase letters`);
    if (!enable1.has(c.word)) problems.push(`${c.word}: not in enable1`);
    // The cozy gate: the Closet prints its answers in the manor's voice (task 2).
    if (!gateOk(c.word.toLowerCase())) problems.push(`${c.word}: fails the cozy gate`);
    if (!DIFFS.includes(c.difficulty)) problems.push(`${c.word}: bad difficulty ${c.difficulty}`);
    if (!Array.isArray(c.clues) || c.clues.length < MIN_PLAIN_CLUES) {
      problems.push(`${c.word}: needs ${MIN_PLAIN_CLUES}+ plain clues, has ${c.clues?.length ?? 0}`);
    }
    if (!Array.isArray(c.wry) || c.wry.length < MIN_WRY_CLUES) {
      problems.push(`${c.word}: needs ${MIN_WRY_CLUES}+ wry clues, has ${c.wry?.length ?? 0}`);
    }
    for (const text of [...(c.clues ?? []), ...(c.wry ?? [])]) {
      if (text.trim().length < 3) problems.push(`${c.word}: empty clue`);
      // The 390px clue bar is the constraint; see CrosswordView's .lc-clue.
      if (text.length > 60) problems.push(`${c.word}: clue too long for the 390px clue bar — "${text}"`);
      const owner = clueOwner.get(text);
      if (owner !== undefined) problems.push(`${c.word}: clue "${text}" already belongs to ${owner}`);
      clueOwner.set(text, c.word);
    }
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`crossword clue bank failed validation with ${problems.length} problem(s)`);
  }

  const puzzles: TieredCrosswordPuzzle[] = [];
  /**
   * Spent clues, carried ACROSS the tiers. This is the change that closes
   * REVIEW_AA 5.9: the map used to be re-created per tier, so a word could
   * headline four tier-1 closets, four tier-2 closets and four tier-3
   * closets — the same twelve sentences, twelve nights running.
   */
  const spent = new Map<string, Cursor>();
  for (const tier of TIERS) {
    const size = SIZES[tier];
    const bank = raw.clues.filter(
      (c) => BANK_DIFFS[tier].includes(c.difficulty) && c.word.length <= size,
    );
    const exact = bank.filter((c) => HEADLINE_DIFFS[tier].includes(c.difficulty));
    const signatures = new Set<string>();
    let made = 0;
    let attempts = 0;
    while (made < TARGET[tier] && attempts < TARGET[tier] * 600) {
      attempts++;
      const live = bank.filter((c) => available(c, tier, spent));
      const liveExact = exact.filter((c) => available(c, tier, spent));
      if (liveExact.length === 0) break;
      const placed = tryBuild(rng, tier, live, liveExact, ENTRIES[tier]);
      if (!placed) continue;
      if (!placed.some((p) => HEADLINE_DIFFS[tier].includes(p.word.difficulty))) continue;
      const sig = placed.map((p) => p.word.word).sort().join('|');
      if (signatures.has(sig)) continue;
      // Tier 3's promise (MIN_WRY_ENTRIES clues in the harder style) is now
      // decided by which clues are still unspent, not by which words own one.
      const chosen = planClues(tier, placed, spent);
      if (!chosen) continue;
      const puzzle = toPuzzle(
        `crossword-t${tier}-${made + 1}`, tier, placed, (p) => chosen.plan.get(p.word.word)!,
      );
      if (validateCrosswordPuzzle(puzzle).length > 0) continue;
      signatures.add(sig);
      for (const [word, cursor] of chosen.commit) spent.set(word, cursor);
      puzzles.push(puzzle);
      made++;
    }
    console.log(`tier ${tier} (${tierLabel(tier)}): ${made} puzzles, ${size}×${size}, ${ENTRIES[tier]} entries (${attempts} attempts)`);
  }

  // Final replay of the shipped pool + the tier gates.
  const finalProblems = puzzles.flatMap((p) => validateCrosswordPuzzle(p).map((m) => `${p.id}: ${m}`));
  const wryTexts = new Set(raw.clues.flatMap((c) => c.wry));
  for (const p of puzzles) {
    if (p.size !== SIZES[p.tier]) finalProblems.push(`${p.id}: ${p.size}×${p.size} is not tier ${p.tier}'s grid`);
    if (p.entries.length !== ENTRIES[p.tier]) finalProblems.push(`${p.id}: ${p.entries.length} entries, tier ${p.tier} wants ${ENTRIES[p.tier]}`);
    if (p.tier === 3) {
      const wry = p.entries.filter((e) => wryTexts.has(e.clue)).length;
      if (wry < MIN_WRY_ENTRIES) finalProblems.push(`${p.id}: only ${wry} wry clues (tier 3 needs ${MIN_WRY_ENTRIES})`);
    }
  }

  /**
   * REVIEW_AA 5.9's number, measured on the way out. A clue repeated across a
   * 90-puzzle pool is the house being told it has run out of things to say.
   */
  const entries = puzzles.flatMap((p) => p.entries);
  const uniqueClues = new Set(entries.map((e) => e.clue)).size;
  const uniqueAnswers = new Set(entries.map((e) => e.answer)).size;
  const ratio = uniqueClues / entries.length;
  if (ratio < MIN_UNIQUE_CLUE_RATIO) {
    finalProblems.push(
      `unique clues per entry is ${ratio.toFixed(3)}, below the ${MIN_UNIQUE_CLUE_RATIO} floor`,
    );
  }
  if (finalProblems.length > 0) {
    console.error(finalProblems.slice(0, 20).join('\n'));
    throw new Error(`crossword validation failed with ${finalProblems.length} problem(s)`);
  }

  const answerUses = new Map<string, number>();
  for (const e of entries) answerUses.set(e.answer, (answerUses.get(e.answer) ?? 0) + 1);
  const worstAnswer = [...answerUses.entries()].sort((a, b) => b[1] - a[1])[0]!;

  writeFileSync(join(dir, 'generated', 'crossword.json'), JSON.stringify(puzzles));
  console.log(`crossword.json: ${puzzles.length} puzzles, ${entries.length} entries`);
  console.log(`  unique clues   ${uniqueClues}/${entries.length} (${ratio.toFixed(3)})`);
  console.log(`  unique answers ${uniqueAnswers}/${entries.length}, most-used ${worstAnswer[0]} ×${worstAnswer[1]}`);
}

main();
