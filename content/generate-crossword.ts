import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, pick, shuffle, type Rng } from '../src/engine/rng';
import {
  checkedCells, crossedCells, entryCells, openCells, validateCrosswordPuzzle,
  type CrosswordDir, type CrosswordEntry, type CrosswordPuzzle,
} from '../src/engine/puzzles/crossword';
import { gateOk } from './generate-gate';
import { tierLabel } from '../src/engine/rooms/adapters/tier-select';
import type { Tier } from '../src/engine/types';

/**
 * Generator for The Linen Closet. OWNER: A5.
 *
 * ---------------------------------------------------------------------------
 * ROUND 29 — THE ROOM STOPS BEING A CROSSWORD AND GROWS A HEM
 * ---------------------------------------------------------------------------
 * The owner's ruling (docs/LINEN_CLOSET.md) and the benchmark written to go
 * with it (docs/BENCHMARKS.md §10, NYT Acrostic) are the spec here. The short
 * version: this room's clue bank provably cannot fill a checked grid, so its
 * letters are checked the way an Acrostic's are — by a SPINE.
 *
 * Every puzzle now marks ONE square per entry. Read in clue order the marked
 * letters spell a further bank word, and that word is clued in the list with
 * the rest. Two numbers say why:
 *   · before, 190 of 360 shipped entries (52.8%) had at most ONE letter that
 *     anything on the board could contradict. A wrong word looked exactly as
 *     right as a right one until she paid for a check.
 *   · a marked square only earns its keep on a letter NO crossing already
 *     covers, so the search prefers uncrossed cells and the pool is gated at
 *     MIN_FRESH_SPINE_RATIO. Marking crossings would leave the number above
 *     where it was and pass every other gate in this file.
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
 *   tier 1 — a 4×4 closet, 3 entries + a 3-letter hem, easy words, plain clues.
 *   tier 2 — the full 5×5, 4 entries + a 4-letter hem, easy+medium, plain clues.
 *   tier 3 — 5×5, 4 entries + a 4-letter hem, the whole bank including
 *            hard/expert words, and at least MIN_WRY_ENTRIES of the clues are
 *            drawn from the bank's `wry` pool: misdirecting, double-meaning,
 *            manor-voiced clues rather than dictionary glosses. Difficulty here
 *            is a knob on how the CLUE reads, not on how much there is to do —
 *            AAA 3.8's hard-mode philosophy.
 *
 * ROUND 29 MOVED TIER 3 FROM FIVE ENTRIES TO FOUR, and that is a deliberate
 * SHORTENING, declared because the evening has no clock left. Tier 3 used to
 * print 5 clues and ask for ~17 letters; it prints 5 (4 entries + the hem) and
 * asks for ~14. The reading load is flat, the typing load is down, and the hem
 * is read rather than typed. The room does not lengthen. It also could not:
 * five clue rows over a five-rank board is 132px more than a 375x667 stage
 * has, which is why three of five clues were clipped off the glass at HEAD.
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
const ENTRIES: Record<Tier, number> = { 1: 3, 2: 4, 3: 4 };
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
/**
 * THE CLOCK, AS A CONSTRAINT ON THE CONTENT.
 *
 * The evening has no time left to give, so a room that gains a clue row must
 * not also gain squares to fill. Measured on the pool this replaces, a board
 * asked for a mean of 8.40 / 13.30 / 16.10 letters at tiers 1 / 2 / 3
 * (medians 8 / 13 / 16, ranges 7-10, 11-16, 13-18) — and the hem's freshness
 * rule pulls the search TOWARD sparser layouts, because fewer crossings means
 * more uncrossed letters to mark.
 * Unconstrained it took tiers 1 and 2 to medians of 9 and 14.5: the room
 * quietly getting longer to pay for its own fix, which is the one thing this
 * campaign is not allowed to do.
 *
 * Two numbers hold it, and they are deliberately different in kind:
 *   · MEAN_OPEN_CELLS is the CLOCK. A board is only accepted while the tier's
 *     running mean stays at or under the MEAN THE OLD POOL SHIPPED — 8.40 and
 *     13.30 — and at tier 3 under 14, which is 2.1 below its old 16.10. Mean
 *     against mean is the honest comparison; a cap at the old MEDIAN was built
 *     first and rejected, because at tier 1 the median IS the floor once an
 *     all-fresh hem is required, so it shipped 13 identical-sized boards.
 *   · MAX_OPEN_CELLS is the board's old worst case, kept so that variety
 *     survives the mean: some closets are still 7 squares and some are still
 *     10, which a flat cap at the median destroyed (it shipped 13 tier-1
 *     boards, every one of them identical in size).
 *
 * The room's typing load is therefore flat at the bottom of the ladder and
 * down at the top, and the extra thing on the glass is a sentence to READ.
 */
const MEAN_OPEN_CELLS: Record<Tier, number> = { 1: 8.4, 2: 13.3, 3: 14 };
const MAX_OPEN_CELLS: Record<Tier, number> = { 1: 10, 2: 16, 3: 16 };
/**
 * THE GATE THIS ROUND EXISTS TO PASS, and it goes red on the obvious build.
 *
 * A marked square on a cell that is ALREADY a crossing buys the room nothing:
 * that letter was checked before the hem existed, and the entry's unchecked
 * letters stay unchecked. So a layout that cannot spell ANY bank word out of
 * uncrossed cells is thrown away rather than marked lazily — 32,979 of them
 * were, to ship these 76 boards, and that is where the pool went from 90 to
 * 76 (tier 1 hardest, 30 -> 16). The variety bill is declared in STATUS.
 *
 * PROVEN RED, not assumed. The first build of this generator took the first
 * candidate word that could be spelled at all, falling back to crossed cells
 * rather than discarding the layout. It produced 90 perfectly valid puzzles
 * that passed every other gate in this file and measured **0.679** here, with
 * 50 of 330 entries still carrying a single checked letter. That is the exact
 * failure this round exists to close, and it is what a floor of 1.0 refuses.
 * `tests/puzzles/micro2.test.ts` replays the same arithmetic on a hand-built
 * board that marks a crossing, and watches it fail.
 */
const MIN_FRESH_SPINE_RATIO = 1;
/**
 * And the number the hem is FOR: no entry may be left with a single checked
 * letter. Before the hem this was 52.8% of the pool (190 of 360 entries).
 *
 * It follows from the gate above — every entry has at least one crossing
 * (the layout is connected) and now exactly one uncrossed marked square — but
 * it is measured independently rather than argued, because the argument has a
 * premise (connectivity) that lives in another file.
 */
const MAX_THIN_ENTRY_RATIO = 0;
/**
 * THE CLUE ROW IS ONE LINE, AND THAT IS A CONTENT RULE NOW.
 *
 * The clue panel's budget at 375x667 is five rows of 28px (a5micro.css), and
 * 28px is one line of the room's 15px body serif. A clue that wraps takes two,
 * and five rows becomes six — which is the overflow this round exists to end,
 * arriving through the back door. Measured live in system Edge at 375x667: the
 * longest sentence the bank held (46 chars, "Posy saves the crimson for letters
 * that matter") rendered 40.7px in a 28px row. 42 fits with room to spare.
 *
 * The HEM's row is tighter than an entry's, because it spends part of its width
 * naming itself, so it gets its own smaller ceiling. Both are re-measured live
 * against the bank's actual longest sentence by .critic/lc-drive.mjs rather
 * than trusted as character counts.
 */
const MAX_CLUE_CHARS = 42;
const MAX_HEM_CLUE_CHARS = 38;
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
 * Assign one marked cell per entry so the marked letters spell `answer` in
 * clue order. FRESH FIRST: a cell no crossing already checks is worth strictly
 * more than one that is, so the whole assignment is attempted over uncrossed
 * cells before crossed cells are allowed in at all. Returns null when the
 * layout cannot spell the word.
 */
function assignSpine(puzzle: CrosswordPuzzle, answer: string, freshOnly: boolean): number[] | null {
  if (answer.length !== puzzle.entries.length) return null;
  const crossed = crossedCells(puzzle);
  const optionsFor = (i: number) => {
    const e = puzzle.entries[i]!;
    return entryCells(puzzle, e).filter(
      (c, k) => e.answer[k] === answer[i] && (!freshOnly || !crossed.has(c)),
    );
  };
  const search = (i: number, used: Set<number>): number[] | null => {
    if (i === answer.length) return [];
    for (const cell of optionsFor(i)) {
      if (used.has(cell)) continue;
      used.add(cell);
      const rest = search(i + 1, used);
      if (rest) return [cell, ...rest];
      used.delete(cell);
    }
    return null;
  };
  return search(0, new Set());
}

/**
 * Choose a fresh clue for every placed word — and for the hem's word —
 * WITHOUT committing: the caller only commits once the whole puzzle is
 * accepted, so a rejected layout does not burn a sentence. Returns null when
 * the tier's promise cannot be kept (tier 1 out of plain clues, tier 3 short
 * of its wry quota).
 */
function planClues(
  tier: Tier, placed: Placed[], spine: ClueDef, spent: Map<string, Cursor>,
): { plan: Map<string, string>; spineClue: string; commit: Map<string, Cursor> } | null {
  const commit = new Map<string, Cursor>();
  const plan = new Map<string, string>();
  const { prefer, fallback } = REGISTER[tier];
  let wryCount = 0;
  // The hem's clue is drawn from the same pools and the same cursors as an
  // entry's, so "no sentence is printed twice anywhere in the Linen Closet"
  // still holds across all 420 printed clues rather than only the 360 entries.
  for (const p of [...placed.map((x) => x.word), spine].map((word) => ({ word }))) {
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
  return { plan, spineClue: plan.get(spine.word)!, commit };
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
      // The 375px clue ROW is the constraint now, and it is one line tall.
      if (text.length > MAX_CLUE_CHARS) {
        problems.push(`${c.word}: ${text.length} chars wraps the 375px clue row (max ${MAX_CLUE_CHARS}) — "${text}"`);
      }
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
  let noFresh = 0;
  for (const tier of TIERS) {
    const size = SIZES[tier];
    const bank = raw.clues.filter(
      (c) => BANK_DIFFS[tier].includes(c.difficulty) && c.word.length <= size,
    );
    const exact = bank.filter((c) => HEADLINE_DIFFS[tier].includes(c.difficulty));
    const signatures = new Set<string>();
    let made = 0;
    let attempts = 0;
    /** Squares shipped at this tier so far — the clock's running total. */
    let sqSum = 0;
    while (made < TARGET[tier] && attempts < TARGET[tier] * 2000) {
      attempts++;
      const live = bank.filter((c) => available(c, tier, spent));
      const liveExact = exact.filter((c) => available(c, tier, spent));
      if (liveExact.length === 0) break;
      const placed = tryBuild(rng, tier, live, liveExact, ENTRIES[tier]);
      if (!placed) continue;
      if (!placed.some((p) => HEADLINE_DIFFS[tier].includes(p.word.difficulty))) continue;
      const sig = placed.map((p) => p.word.word).sort().join('|');
      if (signatures.has(sig)) continue;

      // ── THE HEM ──────────────────────────────────────────────────────────
      // The layout is fixed before the spine is looked for, because the spine
      // reads in CLUE order and clue order is not known until the entries are
      // numbered. `bare` is the same board without a spine, used only so
      // assignSpine can ask its geometry questions.
      const bare = toPuzzle(`spine-probe-t${tier}`, tier, placed, (p) => p.word.clues[0]!);
      const squares = openCells(bare).length;
      if (squares > MAX_OPEN_CELLS[tier]) continue;
      if ((sqSum + squares) / (made + 1) > MEAN_OPEN_CELLS[tier]) continue;
      const answers = new Set(bare.entries.map((e) => e.answer));
      const spineWords = shuffle(rng, live.filter(
        (c) => c.word.length === bare.entries.length && !answers.has(c.word),
      ));
      // TWO PASSES, AND THE ORDER IS THE GATE. The first pass demands that
      // EVERY marked square land on a letter no crossing already checks; only
      // if no word in the bank can do that does the second pass allow a marked
      // square onto a crossing. Taking the first word that spells at all — the
      // obvious implementation — measured 0.679 fresh and left 50 of 330
      // entries with a single checked letter, which is the defect this round
      // exists to close, passing every other gate in the file.
      let spine: { def: ClueDef; cells: number[] } | null = null;
      for (const cand of spineWords) {
        const cells = assignSpine(bare, cand.word, true);
        if (cells) { spine = { def: cand, cells }; break; }
      }
      if (!spine) { noFresh++; continue; }

      // Tier 3's promise (MIN_WRY_ENTRIES clues in the harder style) is now
      // decided by which clues are still unspent, not by which words own one.
      const chosen = planClues(tier, placed, spine.def, spent);
      if (!chosen) continue;
      if (chosen.spineClue.length > MAX_HEM_CLUE_CHARS) continue;
      const puzzle: TieredCrosswordPuzzle = {
        ...toPuzzle(
          `crossword-t${tier}-${made + 1}`, tier, placed, (p) => chosen.plan.get(p.word.word)!,
        ),
        spine: { answer: spine.def.word, clue: chosen.spineClue, cells: spine.cells },
      };
      if (validateCrosswordPuzzle(puzzle).length > 0) continue;
      signatures.add(sig);
      for (const [word, cursor] of chosen.commit) spent.set(word, cursor);
      puzzles.push(puzzle);
      sqSum += squares;
      made++;
    }
    console.log(`tier ${tier} (${tierLabel(tier)}): ${made} puzzles, ${size}×${size}, ${ENTRIES[tier]} entries (${attempts} attempts)`);
  }

  // Final replay of the shipped pool + the tier gates.
  const finalProblems = puzzles.flatMap((p) => validateCrosswordPuzzle(p).map((m) => `${p.id}: ${m}`));
  const wryTexts = new Set(raw.clues.flatMap((c) => c.wry));
  let spineCells = 0;
  let freshSpineCells = 0;
  let thinEntries = 0;
  let letterSlots = 0;
  let checkedSlots = 0;
  for (const p of puzzles) {
    if (p.size !== SIZES[p.tier]) finalProblems.push(`${p.id}: ${p.size}×${p.size} is not tier ${p.tier}'s grid`);
    if (p.entries.length !== ENTRIES[p.tier]) finalProblems.push(`${p.id}: ${p.entries.length} entries, tier ${p.tier} wants ${ENTRIES[p.tier]}`);
    if (p.tier === 3) {
      const wry = [...p.entries.map((e) => e.clue), p.spine!.clue].filter((c) => wryTexts.has(c)).length;
      if (wry < MIN_WRY_ENTRIES) finalProblems.push(`${p.id}: only ${wry} wry clues (tier 3 needs ${MIN_WRY_ENTRIES})`);
    }
    if (!p.spine) { finalProblems.push(`${p.id}: no hem`); continue; }
    for (const e of p.entries) {
      if (e.clue.length > MAX_CLUE_CHARS) finalProblems.push(`${p.id} ${e.id}: clue wraps the row (${e.clue.length} chars)`);
    }
    if (p.spine.clue.length > MAX_HEM_CLUE_CHARS) {
      finalProblems.push(`${p.id}: hem clue wraps its row (${p.spine.clue.length} chars, max ${MAX_HEM_CLUE_CHARS})`);
    }
    // The two fairness numbers BENCHMARKS §10 scores this room on.
    const crossed = crossedCells(p);
    const checked = checkedCells(p);
    for (const cell of p.spine.cells) {
      spineCells++;
      if (!crossed.has(cell)) freshSpineCells++;
    }
    for (const e of p.entries) {
      const cells = entryCells(p, e);
      letterSlots += cells.length;
      const k = cells.filter((c) => checked.has(c)).length;
      checkedSlots += k;
      if (k <= 1) thinEntries++;
    }
  }
  console.log(`  layouts thrown away for want of an all-fresh hem: ${noFresh}`);
  for (const tier of TIERS) {
    const sq = puzzles.filter((p) => p.tier === tier).map((p) => openCells(p).length).sort((a, b) => a - b);
    if (!sq.length) continue;
    const mean = sq.reduce((a, b) => a + b, 0) / sq.length;
    console.log(`  tier ${tier} squares to fill: mean ${mean.toFixed(2)} (cap ${MEAN_OPEN_CELLS[tier]}), median ${sq[Math.floor(sq.length / 2)]}, range ${sq[0]}-${sq[sq.length - 1]}`);
    if (mean > MEAN_OPEN_CELLS[tier]) finalProblems.push(`tier ${tier} ships a mean of ${mean.toFixed(2)} squares, over the ${MEAN_OPEN_CELLS[tier]} the old pool asked for — the room got longer`);
  }
  const entryCount = puzzles.reduce((n, p) => n + p.entries.length, 0);
  const freshRatio = spineCells === 0 ? 0 : freshSpineCells / spineCells;
  const thinRatio = entryCount === 0 ? 1 : thinEntries / entryCount;
  if (freshRatio < MIN_FRESH_SPINE_RATIO) {
    finalProblems.push(
      `only ${(freshRatio * 100).toFixed(1)}% of marked squares fall on an uncrossed letter, `
      + `below the ${MIN_FRESH_SPINE_RATIO} floor — the hem is checking letters the crossings already checked`,
    );
  }
  if (thinRatio > MAX_THIN_ENTRY_RATIO) {
    finalProblems.push(
      `${thinEntries} of ${entryCount} entries still carry at most one checked letter `
      + `(${(thinRatio * 100).toFixed(1)}%, floor ${MAX_THIN_ENTRY_RATIO})`,
    );
  }

  /**
   * REVIEW_AA 5.9's number, measured on the way out. A clue repeated across a
   * 90-puzzle pool is the house being told it has run out of things to say.
   */
  const entries = puzzles.flatMap((p) => p.entries);
  // The hem's clue is PRINTED, so it counts here: 420 sentences, not 360.
  const printed = [...entries.map((e) => e.clue), ...puzzles.map((p) => p.spine!.clue)];
  const uniqueClues = new Set(printed).size;
  const uniqueAnswers = new Set(entries.map((e) => e.answer)).size;
  const ratio = uniqueClues / printed.length;
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
  console.log(`crossword.json: ${puzzles.length} puzzles, ${entries.length} entries + ${puzzles.length} hems`);
  console.log(`  unique clues   ${uniqueClues}/${printed.length} (${ratio.toFixed(3)})`);
  console.log(`  unique answers ${uniqueAnswers}/${entries.length}, most-used ${worstAnswer[0]} ×${worstAnswer[1]}`);
  console.log(`  marked squares on an uncrossed letter ${freshSpineCells}/${spineCells} (${freshRatio.toFixed(3)})`);
  console.log(`  entries with <=1 checked letter ${thinEntries}/${entryCount} (${thinRatio.toFixed(3)})`);
  console.log(`  letters under outside check ${checkedSlots}/${letterSlots} (${(checkedSlots / letterSlots).toFixed(3)})`);
}

main();
