import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary, bandOf, type Dictionary, type Band } from './lib/dictionary';
import { gateOk } from './generate-gate';
import { createRng, pick, randInt, shuffle, type Rng } from '../src/engine/rng';
import { findPath, centerIndex, gridSize, maxFindableFor, MIN_ASK_SHARE, straightestTurns } from '../src/engine/twistle';
import { tierLabel } from '../src/engine/rooms/adapters/tier-select';
import type { TwistlePuzzle, Tier } from '../src/engine/types';

/**
 * Twistle grid generator with guaranteed solvability:
 *  1. Seed words are placed on the board via backtracking (king-move
 *     adjacency, no tile reuse within a word, crossings allowed).
 *  2. Empty tiles are filled with letters weighted by English frequency.
 *  3. A trie-based solver enumerates EVERY findable dictionary word, and the
 *     board ships TWO lists off it (round 28): `targetWords` — the WORKS, the
 *     ask — and `extraWords` — the STUDIES, everything else she can trace under
 *     the rules the room states. Between them they are the complete honest
 *     accept-list, so a player's valid find is never rejected; `targetCount` is
 *     provably achievable out of the works alone.
 *  4. Every word in BOTH lists passes the cozy gate (generate-gate.ts): the
 *     Gallery prints works and studies alike as chips on the deck.
 *
 * ---------------------------------------------------------------------------
 * THREE TIERS, MAPPED TO MANOR ROWS (owner directive, round 4: "bigger grids,
 * twistier paths")
 * ---------------------------------------------------------------------------
 * `tier` (1|2|3 ⇢ rows 0–2 / 3–4 / 5–6) is the one authoritative field. (The
 * old `difficulty` display alias is retired — derive a word from the tier with
 * `tierLabel()` if one is ever wanted.)
 *
 * The escalation is now carried by BOTH halves of the directive:
 *
 *   0. BOARD SIZE. Tiers 1–2 keep the classic 5×5; TIER 3 IS A 6×6. Eleven
 *      extra tiles is a materially different room to read — the eye can no
 *      longer take the whole board in one fixation — and it is what makes the
 *      tortuosity floors below reachable at all: a 5×5 simply does not have
 *      room for many 5+ letter words that turn four times through one tile.
 *      `size` ships on every puzzle; engine/twistle.ts and TwistleView derive
 *      their metrics from the board, so nothing is told the size twice.
 *   1. TORTUOSITY FLOOR. Every target's shortest valid trace is measured for
 *      *turns* (direction changes between consecutive steps). It climbs
 *      1 → 2 → 4, so no tier ships a target that reads straight off a row.
 *   2. LENGTH FLOOR. minLength is 5 at every tier: no tier offers the
 *      four-letter chaff the eye finds for free.
 *   3. THE CENTRE CONSTRAINT. Tiers 2–3 set `centerRequired`, forcing every
 *      trace through the board's centre tile — a Wordle-hard-mode-shaped knob
 *      that constrains the player rather than adding content (AAA 3.8).
 *      On the 6×6 the centre is `centerIndex(6)` = tile 14 (row 2, col 2): one
 *      of the four middle tiles, chosen by the engine so the generator, the
 *      solver and the marked tile in the view can never disagree.
 *   4. THE ASK, AS A SHARE OF THE BOARD — never thinner than one word in five
 *      of what the board offers (`MIN_ASK_SHARE`, round 26), and the ask's
 *      CHEAPEST possible set is never words she already had in her head
 *      (`minEntryRank`).
 *
 * ---------------------------------------------------------------------------
 * ROUND 26 — THE GALLERY WAS NOT A PUZZLE, AND THE MEASUREMENT SAYS WHY
 * ---------------------------------------------------------------------------
 * Across the 210 boards this file used to ship, **tier 1 asked five words of a
 * median 106-word pool** (need/pool 0.047) with a median 56 of those available
 * at exactly the four-letter minimum, and — scored against Norvig rank — **the
 * fifth-commonest findable word sat at rank 305, i.e. inside the three hundred
 * commonest words in English.** The whole room could therefore be cleared by
 * typing words you already had in your head, in about twenty seconds, without
 * ever looking at the grid as a grid. Both hostile reviewers cleared it
 * instantly and stopped respecting the room; because it was also the highest
 * reward-per-minute cell in the house, the rational player farmed it and never
 * opened the Conservatory.
 *
 * The fix is NOT "ask for more words". A word search is not a puzzle because it
 * is long; it is a puzzle because finding the target set requires SEEING
 * something. Tier 3 was already the proof — 6 of 28 at minLength 5 with a
 * four-turn floor and the centre rule — so tiers 1–2 borrow its recipe rather
 * than its length (BENCHMARKS §3, Wordle hard mode: *difficulty by CONSTRAINING
 * the player, not by adding content*):
 *
 *   | knob                       | tier 1        | tier 2        | tier 3 |
 *   |----------------------------|---------------|---------------|--------|
 *   | minLength                  | 4 → **5**    | 4 → **5**    | 5 |
 *   | minTurns                   | 0 → **1**    | 2             | 4 |
 *   | centerRequired             | false         | false → **true** | true |
 *   | maxFindable                | none → **25**| none → **30**| none → **30** |
 *   | targetCount                | 5             | 7 → **6**    | 6 |
 *
 * NOTE WHAT DID NOT MOVE. Tier 1 still asks for FIVE words. The critic proposed
 * 5 → 12, and the measurement says the count was never the defect: 5 of 106 is
 * a broken room and 5 of 23 is not. Three of the knobs above shrink the board's
 * answer space and only one touches the ask, downward. What that buys is a room
 * that is a puzzle without being a chore — and, as it turns out, the only fix
 * the manor's clock could afford (see `ROOM_EFFORT.twistle`).
 *
 * What it does to the 210 boards actually shipped, measured before and after
 * against the vendored Norvig corpus:
 *
 *   | measurement                        | tier 1        | tier 2        | tier 3 |
 *   |------------------------------------|---------------|---------------|--------|
 *   | median findable pool               | 106 → **23** | 85 → **21**  | 28 → **22** |
 *   | fattest pool on any board          | 173 → **25** | 167 → **30** | 76 → **30** |
 *   | median ask / pool                  | 0.048 → **0.217** | 0.082 → **0.286** | 0.214 → **0.273** |
 *   | THINNEST ask on any board          | 0.029 → **0.200** | 0.042 → **0.200** | 0.079 → **0.200** |
 *   | words at exactly the minimum length| 57 → **12**  | 38 → **9**   | 0 → 0 |
 *   | cheapest solve, median board       | rank 305 → **2,581** | 608 → **3,540** | 6,740 → **8,812** |
 *   | CHEAPEST SOLVE, WORST BOARD        | rank **125** → **1,044** | 224 → **1,010** | 1,319 → **3,050** |
 *
 * The last row is the one that matters, and it is the metric the room is now
 * generated and gated on (`minEntryRank` below, replayed against the shipped
 * JSON in `tests/puzzles/twistle-boards.test.ts`): sort a board's findable
 * words by frequency and read off the `targetCount`-th — that is the EASIEST
 * POSSIBLE SOLVE, the last word of the cheapest set that clears the room. It
 * used to be the 125th commonest word in English on the worst tier-1 board.
 * No board in the house now answers to anything inside the top thousand.
 *
 * Three of the four knobs SHRINK the board's answer space rather than growing
 * the ask; `targetCount` rises only far enough to bring the share into line
 * with tier 3's. `ROOM_EFFORT.twistle` was re-derived in the same commit — a
 * room is paid for the work it asks for, and this changed the work.
 *
 * ---------------------------------------------------------------------------
 * ROUND 28 — AND THE SAME KNOBS REFUSED WORDS SHE COULD SEE (BENCHMARKS §8)
 * ---------------------------------------------------------------------------
 * Every one of those knobs narrowed what the room ACCEPTS, and nothing measured
 * what that did to what she can physically TRACE. At tier 3 the four-corner
 * floor **refused 1,610 known, traceable, printable words across the seventy
 * boards — a median 23 a board, against 22 accepted (only 11 of them words she
 * plausibly knows).** More known words refused than accepted, for a rule the
 * header never stated, answered with "isn't in the lexicon", which was false.
 *
 * The corner floor is not deleted — it is what makes the ask a puzzle, and
 * round 26 is not being unwound. It is DEMOTED from a rule of acceptance to a
 * rule of the ASK. The filter below now runs in two passes: `accepted` applies
 * every rule the board states (length, centre, cozy gate, frequency band) and
 * the corner floor then SORTS that list into `targets` (works) and `studies`
 * (`extraWords`). Studies are accepted, kept and scored, and they do not open
 * the room, so the one-word-in-five ask share above is measured on the works
 * exactly as it was and nothing about the economy moves.
 *
 * Measured on the pool this file now ships: known traceable printable words
 * refused goes **1,610 / 51 / 3 → 0 / 0 / 0** at tiers 3 / 2 / 1, and what a
 * tier-3 board accepts of the words she knows goes from a median 11 to 35.
 */

const TARGET_PER_TIER = 70; // 3 tiers => 210 total
const SEED = 20260702;

/*
 * THE ASK IS NEVER THINNER THAN ONE WORD IN FIVE — `MIN_ASK_SHARE`, and it lives
 * in `src/engine/twistle.ts` beside the rest of the board contract so the
 * shipped-pool test can read it without importing (and therefore running) this
 * generator. See the comment there for the derivation.
 */

/** Board side length per tier — the Gallery itself grows at the top. */
const SIZES: Record<Tier, number> = { 1: 5, 2: 5, 3: 6 };

// Letter frequency weights for filling gaps (rough English distribution).
const FILL_LETTERS = 'eeeeeeeeeeeetttttttttaaaaaaaaoooooooiiiiiiinnnnnnnsssssshhhhhhrrrrrrddddllllcccuuummwwffggyyppbbvk';

interface TierSpec {
  /** Frequency bands allowed for the words the player must find. */
  targetBands: Band[];
  seedWordCount: number;
  targetCount: number;
  minFindable: number;
  centerRequired: boolean;
  minLength: number;
  /** Every shipped target must turn at least this many times. */
  minTurns: number;
  /**
   * The twist bar that actually bites: sort the targets by how straight their
   * easiest trace is and read off the `targetCount`-th — that is the twistiest
   * word the player is FORCED to draw to clear the room (everything below it
   * is a gimme they can take instead). Tier 1 caps it so the bottom rows offer
   * near-straight runs; tiers 2 and 3 floor it so no straight-line shortcut
   * exists.
   */
  minEntryTurns: number;
  maxEntryTurns: number;
  /**
   * ROUND 26 — THE EASIEST POSSIBLE SOLVE, AS A FREQUENCY FLOOR.
   *
   * The same construction as `minEntryTurns`, applied to vocabulary instead of
   * geometry: sort the board's targets by Norvig frequency rank and read off
   * the `targetCount`-th. That word is the last one a player needs if she takes
   * the cheapest possible route through the room, so its rank IS the difficulty
   * of clearing the board by reflex. Before this round the median tier-1 board
   * answered 305 and the worst answered **125** — the 125th commonest word in
   * English cleared a Gallery. The floor puts the cheapest solve outside the
   * top thousand words at every tier.
   */
  minEntryRank: number;
}

const SPECS: Record<Tier, TierSpec> = {
  // TIER 1 — the ground floor, and 62% of the rooms the median player enters.
  // Still the gentlest Gallery in the house (5×5, no centre rule, and the
  // entry twist capped at 2 so the eighth-easiest target is never a
  // corkscrew), but no longer a free one: 5+ letters and at least one turn on
  // EVERY target means nothing reads straight off a row.
  1: { targetBands: ['everyday'], seedWordCount: 7, targetCount: 5, minFindable: 11,
       centerRequired: false, minLength: 5, minTurns: 1, minEntryTurns: 1, maxEntryTurns: 2,
       minEntryRank: 1000 },
  // TIER 2 — the same ask on a harder board (BENCHMARKS §3: constrain the
  // player, don't add content). What escalates from tier 1 is not the number
  // of words but the board: every target turns at least twice AND crosses the
  // marked centre tile, a rule the room states at rest in its header and marks
  // on the glass before it can cost anything.
  2: { targetBands: ['everyday'], seedWordCount: 7, targetCount: 6, minFindable: 12,
       centerRequired: true, minLength: 5, minTurns: 2, minEntryTurns: 2, maxEntryTurns: 99,
       minEntryRank: 1000 },
  // 6×6: more tiles to seed (10 words; the rest of the board fills with
  // frequency noise), and the twist bar goes up a notch now that there is room
  // for it — EVERY tier-3 target turns at least four times (the old 5×5 tier 3
  // asked for three), so the entry twist is ≥4 by construction. minFindable
  // rises to the lower rows' floor as well: the top of the manor should offer
  // no less CHOICE than the ground floor, only harder traces.
  3: { targetBands: ['everyday', 'familiar'], seedWordCount: 10, targetCount: 6, minFindable: 12,
       centerRequired: true, minLength: 5, minTurns: 4, minEntryTurns: 4, maxEntryTurns: 99,
       minEntryRank: 1500 },
};


// --- path tortuosity --------------------------------------------------------

/*
 * ROUND 28 — `straightestTurns` MOVED TO `src/engine/twistle.ts`.
 * The Gallery's ladder scores a work at `letters + 2 × corners` off the same
 * straightest trace this generator gates on, so the function had to be somewhere
 * the engine can import. It could never move the other way: this file runs
 * `main()` on import. Two copies of it is exactly how a ladder starts
 * disagreeing with the pool it ranks.
 */

// --- placement ------------------------------------------------------------

function neighbors(index: number, n: number): number[] {
  const r = Math.floor(index / n);
  const c = index % n;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
    }
  }
  return out;
}

/**
 * Try to lay `word` onto the partial grid, reusing matching tiles.
 * `through` (tier 3's centre tile) forces the placed path to cross a given
 * tile — seeding real words through the marked tile is what gives a
 * `centerRequired` board enough centre-crossing targets to be worth shipping.
 */
function placeWord(grid: (string | null)[], word: string, rng: Rng, n: number, through?: number): boolean {
  const tryFrom = (pos: number, depth: number, path: number[]): number[] | null => {
    const need = word[depth]!;
    const cell = grid[pos];
    if (cell !== null && cell !== need) return null;
    const nextPath = [...path, pos];
    if (depth === word.length - 1) {
      return through === undefined || nextPath.includes(through) ? nextPath : null;
    }
    for (const nb of shuffle(rng, neighbors(pos, n))) {
      if (nextPath.includes(nb)) continue;
      const r = tryFrom(nb, depth + 1, nextPath);
      if (r) return r;
    }
    return null;
  };

  for (const start of shuffle(rng, Array.from({ length: n * n }, (_, i) => i))) {
    const path = tryFrom(start, 0, []);
    if (path) {
      path.forEach((pos, i) => { grid[pos] = word[i]!; });
      return true;
    }
  }
  return false;
}

// --- solving ---------------------------------------------------------------

interface TrieNode {
  children: Map<string, TrieNode>;
  word: string | null;
}

function buildTrie(words: Iterable<string>): TrieNode {
  const root: TrieNode = { children: new Map(), word: null };
  for (const w of words) {
    let node = root;
    for (const ch of w) {
      let next = node.children.get(ch);
      if (!next) {
        next = { children: new Map(), word: null };
        node.children.set(ch, next);
      }
      node = next;
    }
    node.word = w;
  }
  return root;
}

/** All dictionary words (4-8 letters) findable on the grid. */
function solveGrid(grid: string[], trie: TrieNode, n: number): Set<string> {
  const found = new Set<string>();
  const visit = (pos: number, node: TrieNode, used: boolean[]) => {
    const next = node.children.get(grid[pos]!);
    if (!next) return;
    used[pos] = true;
    if (next.word && next.word.length >= 4) found.add(next.word);
    for (const nb of neighbors(pos, n)) {
      if (!used[nb]) visit(nb, next, used);
    }
    used[pos] = false;
  };
  const used = new Array(n * n).fill(false);
  for (let i = 0; i < n * n; i++) visit(i, trie, used);
  return found;
}

// --- generation -------------------------------------------------------------

/**
 * Shipped shape. `tier` is authoritative and `size` is explicit on every board
 * so the view never has to infer a 6×6 from a tile count.
 */
type GeneratedTwistlePuzzle = TwistlePuzzle & {
  tier: Tier; size: number;
  /** Round 28: both classes ship on every board, never optionally. */
  extraWords: string[]; minTurns: number;
};

/**
 * The turn count of the `targetCount`-th easiest target: the twist the player
 * cannot avoid on the way to a solve. Returns Infinity if the pool is short.
 */
function entryTurns(turns: number[], targetCount: number): number {
  if (turns.length < targetCount) return Infinity;
  return [...turns].sort((a, b) => a - b)[targetCount - 1]!;
}

/**
 * The Norvig frequency rank of the `targetCount`-th COMMONEST target: the last
 * word of the cheapest set that clears the board, and therefore the honest
 * difficulty of solving it out of reflex. Unranked words sort last (`UNRANKED`),
 * which is correct — a word the corpus never saw is not a gimme. Returns 0
 * (i.e. "trivially clearable") if the pool is short, so a thin board cannot
 * sneak through the floor.
 */
const UNRANKED = 1_000_000;

function entryRank(ranks: number[], targetCount: number): number {
  if (ranks.length < targetCount) return 0;
  return [...ranks].sort((a, b) => a - b)[targetCount - 1]!;
}

function generatePuzzle(
  dict: Dictionary,
  trie: TrieNode,
  pools: Record<Band, string[]>,
  tier: Tier,
  rng: Rng,
  index: number,
): GeneratedTwistlePuzzle | null {
  const spec = SPECS[tier];
  const n = SIZES[tier];
  const total = n * n;
  const centre = centerIndex(n);
  const grid: (string | null)[] = new Array(total).fill(null);

  // Seed the grid with real words (longer first — they're hardest to fit).
  // On a centre-ruled board the first few seeds are forced through the marked
  // tile, so the solver has centre-crossing material to find.
  const pool = spec.targetBands.flatMap((b) => pools[b]);
  const seeds = shuffle(rng, pool).slice(0, 90).sort((a, b) => b.length - a.length);
  const throughCentre = spec.centerRequired ? Math.ceil(spec.seedWordCount / 2) : 0;
  let placed = 0;
  for (const word of seeds) {
    if (placed >= spec.seedWordCount) break;
    const through = placed < throughCentre ? centre : undefined;
    if (placeWord(grid, word, rng, n, through)) placed++;
  }
  if (placed < spec.seedWordCount) return null;

  const filled = grid.map((c) => c ?? FILL_LETTERS[randInt(rng, FILL_LETTERS.length)]!);
  const upper = filled.map((c) => c.toUpperCase());

  // Enumerate everything findable, then split it into the two classes the room
  // ships (round 28, BENCHMARKS §8). ACCEPTED is every word she can trace under
  // the rules the board STATES; the corner floor sorts the accepted words into
  // WORKS (the ask) and STUDIES (accepted, scored, never refused) — it no
  // longer decides whether a real word is a word.
  const findable = solveGrid(filled, trie, n);
  const rules = { minLength: spec.minLength, centerRequired: spec.centerRequired };
  const turnsByWord = new Map<string, number>();
  const accepted = [...findable].filter((w) => {
    if (w.length < spec.minLength) return false;
    if (!spec.targetBands.includes(bandOf(dict.rankOf(w)))) return false;
    // The Gallery prints everything it accepts — the cozy gate applies (task 2).
    if (!gateOk(w)) return false;
    // Under centerRequired / minLength the trie solver over-counts; the
    // tortuosity pass re-verifies each word against the real rules and
    // records the straightest trace the player could draw.
    const turns = straightestTurns(upper, w.toUpperCase(), rules);
    if (turns === null) return false;
    turnsByWord.set(w, turns);
    return true;
  });
  const targets = accepted.filter((w) => turnsByWord.get(w)! >= spec.minTurns);
  const studies = accepted.filter((w) => turnsByWord.get(w)! < spec.minTurns);
  if (targets.length < Math.max(spec.minFindable, spec.targetCount + 4)) return null;
  // ROUND 26 — the ask may never be thinner than one word in five of the board
  // it is asked on (`MIN_ASK_SHARE`). This rejects the haystacks: a 5×5 whose
  // fair-target pool runs to a hundred words is a room you clear by reflex.
  if (targets.length > maxFindableFor(spec.targetCount)) return null;
  const entry = entryTurns(targets.map((w) => turnsByWord.get(w)!), spec.targetCount);
  if (entry < spec.minEntryTurns || entry > spec.maxEntryTurns) return null;
  // ROUND 26 — and the cheapest set of words that clears this board must not be
  // words she already had in her head (see `minEntryRank`).
  const rank = entryRank(targets.map((w) => { const r = dict.rankOf(w); return r > 0 ? r : UNRANKED; }), spec.targetCount);
  if (rank < spec.minEntryRank) return null;

  return {
    id: `twistle-t${tier}-${index}`,
    tier,
    size: n,
    grid: upper,
    targetWords: targets.map((w) => w.toUpperCase()).sort(),
    // ROUND 28 — what the board ACCEPTS beyond what it asks for. Every one of
    // these is a word round 17's corner floor refused with "isn't in the
    // lexicon", which was false: they clear the length floor, they cross the
    // marked tile, they pass the cozy gate and they sit in the tier's own
    // frequency band. They are hung as studies now.
    extraWords: studies.map((w) => w.toUpperCase()).sort(),
    minTurns: spec.minTurns,
    targetCount: spec.targetCount,
    rules,
  };
}

function main() {
  const dict = loadDictionary();
  const rng = createRng(SEED);

  const pools: Record<Band, string[]> = { everyday: [], familiar: [], advanced: [], obscure: [] };
  for (const w of dict.words) {
    if (w.length < 4 || w.length > 7) continue;
    pools[bandOf(dict.rankOf(w))].push(w);
  }
  const trie = buildTrie([...dict.words].filter((w) => w.length >= 4 && w.length <= 8));

  const puzzles: GeneratedTwistlePuzzle[] = [];
  for (const tier of [1, 2, 3] as Tier[]) {
    let made = 0;
    let attempts = 0;
    while (made < TARGET_PER_TIER && attempts < TARGET_PER_TIER * 400) {
      attempts++;
      const p = generatePuzzle(dict, trie, pools, tier, rng, made + 1);
      if (p) {
        puzzles.push(p);
        made++;
      }
    }
    const n = SIZES[tier];
    console.log(`tier ${tier} (${tierLabel(tier)}): ${made} puzzles, ${n}×${n} (${attempts} attempts)`);
    // A half-filled tier is a content bug, not a smaller pool: the manor's rows
    // would quietly start serving a neighbouring tier's boards.
    if (made < TARGET_PER_TIER) {
      throw new Error(`twistle tier ${tier}: only ${made}/${TARGET_PER_TIER} boards in ${attempts} attempts — loosen the tier ${tier} spec`);
    }
  }

  validate(puzzles, dict);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'twistle.json');
  writeFileSync(outPath, JSON.stringify(puzzles));
  console.log(`twistle.json: ${puzzles.length} puzzles`);
}

/** Fail the build on any unsolvable, unfair, or off-tier puzzle. */
function validate(puzzles: GeneratedTwistlePuzzle[], dict: Dictionary) {
  const problems: string[] = [];
  for (const p of puzzles) {
    const spec = SPECS[p.tier];
    const n = SIZES[p.tier];
    if (p.size !== n) problems.push(`${p.id}: size ${p.size} is not tier ${p.tier}'s board (${n})`);
    if (p.grid.length !== n * n) problems.push(`${p.id}: grid is ${p.grid.length} tiles, not ${n}×${n}`);
    if (gridSize(p.grid) !== p.size) problems.push(`${p.id}: declared size disagrees with the grid`);
    if (p.targetWords.length < p.targetCount) problems.push(`${p.id}: targetCount ${p.targetCount} > ${p.targetWords.length} findable`);
    if (p.targetWords.length > maxFindableFor(p.targetCount)) {
      problems.push(`${p.id}: ${p.targetCount} of ${p.targetWords.length} findable is an ask of ${(p.targetCount / p.targetWords.length).toFixed(3)}, under the ${MIN_ASK_SHARE.toFixed(3)} floor`);
    }
    if (p.targetCount !== spec.targetCount) problems.push(`${p.id}: targetCount ${p.targetCount} != tier ${p.tier} ask ${spec.targetCount}`);
    // ROUND 28 — the accept-list. A study must be a word she could really have
    // traced (or the room is accepting nonsense), must not also be a work, and
    // must genuinely fall short of the corner floor (or it belonged in the ask).
    if (p.minTurns !== spec.minTurns) problems.push(`${p.id}: minTurns ${p.minTurns} != tier ${p.tier} corner floor ${spec.minTurns}`);
    const works = new Set(p.targetWords);
    for (const w of p.extraWords) {
      if (works.has(w)) problems.push(`${p.id}: ${w} ships as both a work and a study`);
      if (w.length < p.rules.minLength) problems.push(`${p.id}: study ${w} is under the stated minimum`);
      if (findPath(p.grid, w, p.rules) === null) problems.push(`${p.id}: study ${w} has no valid trace`);
      if (!gateOk(w.toLowerCase())) problems.push(`${p.id}: study ${w} fails the cozy gate`);
      const t = straightestTurns(p.grid, w, p.rules);
      if (t !== null && t >= spec.minTurns) problems.push(`${p.id}: study ${w} turns ${t} — it is a work`);
    }
    if (p.rules.minLength !== spec.minLength) problems.push(`${p.id}: minLength ${p.rules.minLength} != tier ${p.tier} floor ${spec.minLength}`);
    if (p.rules.centerRequired !== spec.centerRequired) problems.push(`${p.id}: centerRequired != tier ${p.tier} rule`);
    const turns: number[] = [];
    for (const w of p.targetWords) {
      const path = findPath(p.grid, w, p.rules);
      if (path === null) problems.push(`${p.id}: target ${w} has no valid path`);
      else if (p.rules.centerRequired && !path.includes(centerIndex(n))) {
        problems.push(`${p.id}: target ${w} misses the marked centre tile`);
      }
      if (!gateOk(w.toLowerCase())) problems.push(`${p.id}: target ${w} fails the cozy gate`);
      const t = straightestTurns(p.grid, w, p.rules);
      if (t === null) continue;
      turns.push(t);
      if (t < spec.minTurns) problems.push(`${p.id}: ${w} turns ${t} < tier ${p.tier} floor ${spec.minTurns}`);
    }
    const entry = entryTurns(turns, p.targetCount);
    if (entry < spec.minEntryTurns || entry > spec.maxEntryTurns) {
      problems.push(`${p.id}: entry turns ${entry} outside tier ${p.tier} twist band ${spec.minEntryTurns}–${spec.maxEntryTurns}`);
    }
    const rank = entryRank(p.targetWords.map((w) => { const r = dict.rankOf(w); return r > 0 ? r : UNRANKED; }), p.targetCount);
    if (rank < spec.minEntryRank) {
      problems.push(`${p.id}: the cheapest solve ends on rank ${rank}, inside tier ${p.tier}'s reflex floor of ${spec.minEntryRank}`);
    }
  }
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`twistle validation failed with ${problems.length} problem(s)`);
  }
}

main();
