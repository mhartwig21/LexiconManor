import type { TwistlePuzzle, TwistleRules } from './types';

/**
 * Twistle (n×n grid word search) engine.
 * Words trace king-move-adjacent paths without reusing a tile. The same
 * path solver validates player submissions here and puzzle solvability
 * in the content generator.
 *
 * ROUND 4 — grid size is no longer a module constant. `TwistlePuzzle.size`
 * declares the side length (default 5) so a tier-3 Gallery can ship a 6×6
 * board. Nothing needs to be told the size twice: a square grid carries it in
 * `grid.length`, so `findPath` and the solver derive it and every existing
 * caller keeps its signature. GRID_SIZE / CENTER_INDEX remain exported as the
 * DEFAULT board's metrics — do not use them to index a puzzle whose `size`
 * you have not checked.
 */

/** Side length of the default board. */
export const GRID_SIZE = 5;
/** Centre tile of the DEFAULT 5×5 board. For any puzzle use `centerIndex()`. */
export const CENTER_INDEX = 12;

/** Side length of a square grid, derived from its tile count. */
export function gridSize(grid: string[]): number {
  return Math.round(Math.sqrt(grid.length));
}

/**
 * Centre tile index of an n×n board.
 *
 * Odd n has a true centre and this returns it (n=5 → 12, n=7 → 24), so the
 * default board is unchanged. Even n has no single centre tile, so we name one
 * of the four middle tiles — the upper-left of them (n=6 → 14, i.e. row 2,
 * col 2). The naive `floor(n²/2)` lands on the LEFT WALL for even n (n=6 → 18,
 * row 3 col 0), which would turn tier 3's centre rule into an edge-hugging
 * rule; this is the fix that makes a 6×6 `centerRequired` board honest.
 * Generator, solver and view all read this one function, so the marked tile
 * and the enforced tile can never disagree.
 */
export function centerIndex(n: number): number {
  const mid = Math.floor((n - 1) / 2);
  return mid * n + mid;
}

/** The board's side length: the declared `size`, else derived from the grid. */
export function puzzleSize(puzzle: Pick<TwistlePuzzle, 'grid' | 'size'>): number {
  return puzzle.size ?? gridSize(puzzle.grid);
}

/**
 * ═══ THE ASK IS NEVER THINNER THAN ONE WORD IN FIVE (round 26) ═════════════
 *
 * The Gallery's defect was a RATIO, not a count. Measured over the 210 boards
 * shipped before this round, tier 1 asked **5 target words of a median 106-word
 * findable pool** — need/pool 0.047 — and the fifth-commonest of those words
 * sat at Norvig rank 305, i.e. inside the three hundred commonest words in
 * English. Five of 106 is a rounding error of a board however many minutes it
 * takes, so the room could be cleared out of reflex without ever reading the
 * grid as a grid.
 *
 * So the generator now rejects any board whose findable pool is fat enough to
 * make its own ask trivial, at a ceiling DERIVED from that board's
 * `targetCount` (`maxFindableFor`) rather than typed in per tier: raising an
 * ask automatically permits a proportionally larger board, and lowering one
 * cannot quietly re-open the gap.
 *
 * ONE IN FIVE, AND WHY THAT RATHER THAN A BIGGER ASK. It is tier 3's own
 * shipped share — the one tier both hostile reviewers left alone — so the
 * bottom of the manor is now held to the standard the top already met. Working
 * it as a SHARE is what lets the Gallery stay short: the room is fixed by
 * shrinking the board's answer space (a 5-letter floor, a turn floor on every
 * target, the centre rule from tier 2 up), not by asking for twelve words. A
 * word search is not a puzzle because it is long.
 *
 * Measured on the pool this ships: the tier-1 board went from a median 106
 * findable words to 23, the thinnest ask on any of the 210 boards from 0.029 to
 * 0.200, and the fattest board in the house from 173 findable words to 30.
 *
 * It lives here rather than in `content/generate-twistle.ts` because that file
 * runs `main()` on import; the shipped-pool test needs the number, not the
 * generator.
 */
export const MIN_ASK_SHARE = 1 / 5;

/** The fattest findable pool a board asking `targetCount` words may ship. */
export function maxFindableFor(targetCount: number): number {
  return Math.floor(targetCount / MIN_ASK_SHARE);
}

/**
 * ═══ ROUND 28 — A TRACED REAL WORD IS NEVER REFUSED (BENCHMARKS §8) ════════
 *
 * Round 17 hardened the Gallery with three knobs — a 5-letter floor, a corner
 * floor on every target, the centre rule down to tier 2 — and every one of them
 * narrowed what the room ACCEPTS without narrowing what the player can
 * physically TRACE. Measured by independent trie enumeration over the pool that
 * shipped, **tier 3's four-corner floor refused a median 26 words per board that
 * a player plausibly knows (Norvig rank ≤ 20,000) while accepting 22** — more
 * known words refused than accepted, for a rule the room never stated.
 *
 * Re-measured here against the vendored corpus, setting aside the cozy gate's
 * own refusals (which are an editorial choice, not a rule of play): **1,610
 * known, traceable, printable words refused across the seventy tier-3 boards, a
 * median of 23 a board** — against 22 words accepted, of which only 11 are ones
 * she plausibly knows. Tiers 1 and 2 refused 3 and 51 in total and were clean.
 *
 * A word search's single worst feeling is tracing a word you can SEE and being
 * told it is not a word. Strands designs that feeling out of existence
 * (BENCHMARKS §8): a theme word counts, **any other real word is accepted and
 * worth something**, and only a non-word gets the shake. Two classes of
 * accepted word; no class of refused real word.
 *
 * So the Gallery ships two lists now, and the fix is on the ACCEPT-LIST rather
 * than on the player:
 *
 *   WORKS  (`targetWords`)  the ask. Constrained exactly as round 17 left it —
 *                           `minLength` letters, `minTurns` corners, through the
 *                           marked tile where the board says so. `targetCount`
 *                           of these and only these open the room, so round 26's
 *                           one-word-in-five ask share is untouched and the board
 *                           still cannot be cleared out of reflex.
 *   STUDIES (`extraWords`)  everything else on the grid she can trace and
 *                           plausibly knows: same length floor, same centre rule,
 *                           same cozy gate, same frequency bands — only the
 *                           corner floor missing. Accepted, kept, scored. They do
 *                           NOT open the room.
 *
 * Measured on the pool this ships, by the same enumeration: **0 known traceable
 * printable words refused, on all 210 boards, at every tier** — 1,610 → 0 at
 * tier 3, 51 → 0 at tier 2, 3 → 0 at tier 1. What a tier-3 board accepts of the
 * words she knows goes from a median 11 to 35. The only refusals left in the
 * house are the cozy gate's 175 (TRANS, NUDES, ANGER, PENIS, COCAINE…), which
 * are a deliberate editorial choice and not a rule she could obey if she saw it.
 *
 * ═══ ROUND 38 — THAT MEASUREMENT COULD NOT HAVE FAILED ═════════════════════
 *
 * Two rounds fixed this room's accept-list and both certified themselves with an
 * instrument built out of the thing under test. `content/generate-twistle.ts`
 * enumerated the board with a trie of dictionary words **4 to 8 letters long**,
 * so a nine-letter word was not refused by a rule — it was INVISIBLE, to the
 * generator and to the gate that measured the generator. The gate in
 * `tests/puzzles/twistle-boards.test.ts` then drew "a word she plausibly knows"
 * at **Norvig rank ≤ 20,000**, which is exactly where `bandOf` draws the
 * `everyday` band — i.e. exactly the filter tiers 1 and 2 were applying. Two
 * blind spots, each of them the same shape as the rule it was meant to audit.
 *
 * Re-measured in round 38 by an enumerator that shares neither (a separate
 * implementation, in another language, walking every legal path on the shipped
 * board against the whole of ENABLE at every length, ranked off the raw Norvig
 * counts, and then asking `submitTwistleWord` itself what the room does with
 * each word), the pool round 28 shipped refused, per board, a MEDIAN:
 *
 *   | refused, traceable, printable | tier 1 | tier 2 | tier 3 |
 *   |-------------------------------|--------|--------|--------|
 *   | rank ≤ 20,000 (ROUND 28'S OWN LINE) |  1 |  1 |  1 |
 *   | rank 20,000–60,000            |   19   |   18   |    1   |
 *   | rank 60,000–120,000           |   13   |   12   |   22   |
 *   | any dictionary word           |   81   |   69   |  110   |
 *
 * SNAIL, SPADE, GLARE, STRIDE, GRIDS, CLOUT, LINGER, BUSHES — refused. And the
 * two blind spots meet on the sharpest number of the round: **240 refusals at
 * rank ≤ 20,000, round 28's own bar, on 128 of the 210 boards. 184 are the cozy
 * gate's. The other 56 are all nine and ten letters** — CONDITIONS (452),
 * CONDITION (1,067), PROPERTIES (1,344), DESCRIBED (1,828), ADDRESSED (4,310),
 * IMPRESSIVE (6,716), CORRECTED (8,789) — so every counter-example to round 28's
 * claim sat in the one length window its instrument could not enumerate. That is
 * not bad luck; it is what happens when a gate is built from the thing it audits.
 *
 * THE FIX IS THE SAME FIX, FINISHED. Round 28 demoted the corner floor from a
 * rule of acceptance to a rule of the ASK; round 38 does the same to the other
 * two — the frequency band and the length window — and states them where the ask
 * is composed (`ASK_MAX_LENGTH`, `targetBands`) instead of leaving them as
 * properties of a solver. **Acceptance is now: five letters, a legal trace, the
 * marked tile where the board marks one, and the cozy gate. Nothing else.**
 * Every word of the dictionary she can draw is a work or a study.
 *
 * Measured after, by the same independent enumerator: **the ONLY refusal left
 * anywhere in the house is the cozy gate's — 534 of them (138 / 143 / 253),
 * every single one a word the manor will not print** (DEATH, PENIS, ANGER,
 * SLUTS, NIGGER, CANCER…). Zero refusals for any rule of play, at any tier, at
 * any rank, at any length. Not a number that was aimed at: the enumerator counts
 * refusals by cause, and this cause is the one the manor chose on purpose.
 * The accept-list went 7,685 words to 26,107 across the 210 boards, and the
 * boards themselves — every grid, every work, every published band of the ask —
 * are byte-identical to the pool round 28 shipped.
 */

/**
 * ═══ THE LADDER (BENCHMARKS §1, §8) ═══════════════════════════════════════
 *
 * `foundWords.length >= targetCount` was a binary win: no score, no rank, no
 * "seven to Genius". BENCHMARKS §1 calls the Bee's ladder *the retention
 * machine*; §8 records that Strands has no ladder at all, and why the Gallery
 * cannot copy that — Strands is a once-a-day ritual with a theme reveal for a
 * payoff, and this is a room she meets forty times in a campaign.
 *
 * A word search has better material to rank on than a Bee does, because a
 * traced word carries a SHAPE as well as a length. So:
 *
 *     a letter is a point, and a corner is two.
 *
 * A work scores `letters + 2 × corners`, counted off its STRAIGHTEST trace — a
 * word is only as twisty as its easiest reading, the same rule the generator
 * gates on, so the score can never disagree with the pool. A study scores 1,
 * exactly as the Bee pays 1 for a four-letter word: it counts, it is never
 * nothing, and it cannot be farmed into a rank.
 *
 * WHY THE DOOR IS STILL A COUNT AND NOT A SCORE. If the room opened on points, a
 * tier-3 board's forty-odd studies would open it without a single work found,
 * and round 26's defect walks back in wearing a ladder. The door stays on the
 * constrained class (BENCHMARKS §8: *keep the door on the constrained class*);
 * the ladder ranks everything. What that buys is a real decision the room did
 * not have — **the exhibition opens the moment the last work is hung, so
 * anything else you want, you find first.**
 *
 * Measured over the 210 boards this ships, on both extremes of how a solve can
 * be taken: the CHEAPEST solve (the `targetCount` commonest works) scores a
 * median 21 / 28 / 24% of the board's maximum, and the LOWEST-SCORING solve that
 * can open a board scores a median 16 / 23 / 22% and never less than 13%. So a
 * player who merely solves lands on **rung 2 at worst and rung 4 at best on
 * every board at every tier** — never on the floor, and never with nothing left
 * above her. `Curator's Eye` is this room's Queen Bee: every work and every
 * study on the board, and it is not meant to be reached.
 */

/**
 * ═══ THE ROOM STATES ITS OWN RULES, AND THEY ARE TRUE (round 28) ══════════
 *
 * Round 17's header read `{targetCount} words · {minLength}+ letters`, and at
 * tier 3 that was **false**: the four-corner floor meant nothing under six
 * letters counted anywhere in the tier (measured on the pool it shipped —
 * 0 works of exactly five letters across all seventy tier-3 boards), so the one
 * line on the glass that states the rules of play misstated them on the hardest
 * boards in the house. Round 17 noticed and left it.
 *
 * It is fixed by making the sentence true rather than by deleting a clause,
 * because the two-class board finally lets it be true: `5+ letters` is now the
 * ACCEPTANCE floor and it really is reachable — a five-letter trace on a tier-3
 * board is a study, and a study is accepted, kept and scored. The corner floor
 * is stated separately, where it belongs, on the ask.
 *
 * These live in the engine rather than in TwistleView because a sentence the
 * room is CONTRACTUALLY required to keep true is a testable object.
 * `tests/puzzles/twistle-boards.test.ts` reads them back against the shipped
 * JSON, clause by clause.
 */
export interface TwistleRuleLines {
  /** What makes a trace legal at all — the ACCEPTANCE rule. */
  trace: string;
  /** What the room is asking for — the CONSTRAINED class, corner floor and all. */
  ask: string;
  /** The two above, in the one line the room prints. Never hidden. */
  line: string;
  /** The gesture and the second class — decorative reserve, may be dropped. */
  studies: string;
}

/**
 * ONE LINE, TWO CLAUSES, AND THE REASON IT IS ONE LINE. Measured live in Edge:
 * at 375×667 a tier-3 Gallery has 551px of stage for an 82px header, a 330px
 * 6×6 board and a 161px deck, and it fit round 17's header with three pixels to
 * spare. Two paragraphs plus a ladder row measured 592px — a scrollbar, which
 * the owner does not accept. So the clauses are composed into one wrapped line
 * (36px at every tier rather than 54px) and the ladder rides the toast slot the
 * room already reserves. Nothing true was dropped to buy it.
 */
export function twistleRuleLines(puzzle: TwistlePuzzle): TwistleRuleLines {
  const corners = puzzle.minTurns ?? 0;
  const trace = `${puzzle.rules.minLength}+ letters`
    + (puzzle.rules.centerRequired ? ', through the marked tile' : '');
  const ask = corners > 1
    ? `${puzzle.targetCount} works, ${corners}+ corners each`
    : corners === 1
      ? `${puzzle.targetCount} works, a corner each`
      : `${puzzle.targetCount} works`;
  return {
    trace,
    ask,
    line: `${trace} · ${ask}`,
    studies: 'Trace through touching tiles. Any other word you find hangs as a study.',
  };
}

/** What a STUDY is worth — the Bee's four-letter word, one point. */
export const STUDY_POINTS = 1;
/** A corner is worth two letters. Shape is what makes this room a puzzle. */
export const CORNER_POINTS = 2;

/** What one WORK is worth: a letter a point, a corner two. */
export function workPoints(word: string, corners: number): number {
  return word.length + CORNER_POINTS * corners;
}

/** A rung, as a fraction of the board's own maximum (BENCHMARKS §1's curve). */
export interface TwistleRung {
  name: string;
  /** Fraction of `twistleMaxScore` at which this rung is reached. */
  at: number;
}

/**
 * Placed against the shipped pool rather than chosen for the sound of it: rung
 * 2 sits just under the LOWEST-scoring set of works that can open any board in
 * the house, so a player who merely solves always arrives there and never above
 * it. `tests/puzzles/twistle-boards.test.ts` re-derives both facts off the JSON.
 *
 * ROUND 38 — RE-PLACED, BECAUSE THE DENOMINATOR MOVED. The board's maximum is
 * every word it accepts, and this round the accept-list stopped being bounded by
 * a frequency band and a solver's blind spot (see the note below): a median
 * board went from 22 accepted words to 101, and the leanest solve in the house
 * from 0.13 of the maximum to 0.10. The curve is the same shape one notch
 * lower — 0.06/0.12/0.30/0.55 → 0.04/0.08/0.20/0.40 — and it is placed the same
 * way it was: 0.08 is two points under the leanest solve in the house (0.10),
 * exactly as 0.12 was one point under 0.13. Measured after the move: every
 * cheapest and every leanest solve on all 210 boards lands on rung 2, 3 or 4,
 * with something still above it. The rungs were NOT re-typed until the fraction
 * they answer to had been re-measured — a ladder tuned to keep a number green is
 * this project's own standing failure.
 */
export const TWISTLE_RANKS: readonly TwistleRung[] = [
  { name: 'Bare Wall', at: 0 },
  { name: 'First Nail', at: 0.04 },
  { name: 'Small Hang', at: 0.08 },
  { name: 'Full Wall', at: 0.20 },
  { name: 'Salon Hang', at: 0.40 },
  { name: 'Curator’s Eye', at: 1 },
];

/**
 * Every word this board accepts, and what it is worth. Memoised per puzzle
 * object: a work's corner count is a branch-and-bound walk of the grid, and the
 * view asks for the board's maximum on every render.
 */
const POINTS_CACHE = new WeakMap<TwistlePuzzle, Map<string, number>>();

export function twistlePoints(puzzle: TwistlePuzzle): Map<string, number> {
  const hit = POINTS_CACHE.get(puzzle);
  if (hit) return hit;
  const points = new Map<string, number>();
  for (const w of puzzle.targetWords) {
    const corners = straightestTurns(puzzle.grid, w, puzzle.rules);
    points.set(w.toUpperCase(), workPoints(w, corners ?? 0));
  }
  for (const w of puzzle.extraWords ?? []) {
    // Works win any collision: a word the room asks for is never a study.
    if (!points.has(w.toUpperCase())) points.set(w.toUpperCase(), STUDY_POINTS);
  }
  POINTS_CACHE.set(puzzle, points);
  return points;
}

/** Everything on the board, hung — the top rung, and not meant to be reached. */
export function twistleMaxScore(puzzle: TwistlePuzzle): number {
  let total = 0;
  for (const v of twistlePoints(puzzle).values()) total += v;
  return total;
}

/** What she has hung so far. */
export function twistleScore(puzzle: TwistlePuzzle, state: TwistleState): number {
  const points = twistlePoints(puzzle);
  let total = 0;
  for (const w of state.foundWords) total += points.get(w) ?? 0;
  for (const w of state.foundStudies ?? []) total += points.get(w) ?? 0;
  return total;
}

export interface TwistleStanding {
  score: number;
  max: number;
  /** Index into `TWISTLE_RANKS`. */
  rung: number;
  name: string;
  /** The next rung and the points still owed to it — the "7 to Genius" hook. */
  next: { name: string; points: number } | null;
}

/** Her standing on the wall, right now. */
export function twistleStanding(puzzle: TwistlePuzzle, state: TwistleState): TwistleStanding {
  const max = twistleMaxScore(puzzle);
  const score = twistleScore(puzzle, state);
  const fraction = max > 0 ? score / max : 0;
  let rung = 0;
  for (let i = 0; i < TWISTLE_RANKS.length; i++) {
    if (fraction + 1e-9 >= TWISTLE_RANKS[i]!.at) rung = i;
  }
  const up = TWISTLE_RANKS[rung + 1];
  return {
    score,
    max,
    rung,
    name: TWISTLE_RANKS[rung]!.name,
    next: up ? { name: up.name, points: Math.max(1, Math.ceil(up.at * max) - score) } : null,
  };
}

/**
 * The straightest trace this word has on the grid, in CORNERS — or null if the
 * word cannot be traced under the rules at all. A word is only as easy as its
 * easiest reading, so this minimises over every legal trace: a word with any
 * straight reading counts as straight.
 *
 * It lived in `content/generate-twistle.ts` until round 28, when the score
 * started reading it too. That file runs `main()` on import, so the engine could
 * never have imported it the other way round — and two copies of this function
 * is exactly how a ladder starts disagreeing with the pool it ranks.
 *
 * Branch-and-bound rather than "enumerate every trace and take the min": on a
 * 6×6 board a common word can have hundreds of readings, and this runs for every
 * candidate of every generator attempt. Pruning at `corners >= best` (and
 * bailing the moment a straight reading is found) collapses it.
 */
export function straightestTurns(grid: string[], word: string, rules: TwistleRules): number | null {
  const target = word.toUpperCase();
  if (target.length < rules.minLength) return null;
  const n = gridSize(grid);
  const centre = centerIndex(n);
  const used = new Array<boolean>(grid.length).fill(false);
  let best = Infinity;

  const walk = (pos: number, depth: number, prevStep: number, turns: number, hitCentre: boolean) => {
    if (depth === target.length) {
      if (rules.centerRequired && !hitCentre) return;
      best = turns;
      return;
    }
    for (const nb of neighbors(pos, n)) {
      if (used[nb]) continue;
      if (grid[nb] !== target[depth]) continue;
      // Direction as a small integer: (dr+1)*3 + (dc+1).
      const step = (Math.floor(nb / n) - Math.floor(pos / n) + 1) * 3 + ((nb % n) - (pos % n) + 1);
      const t = prevStep >= 0 && step !== prevStep ? turns + 1 : turns;
      if (t >= best) continue;
      used[nb] = true;
      walk(nb, depth + 1, step, t, hitCentre || nb === centre);
      used[nb] = false;
      if (best === 0) return;
    }
  };

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== target[0]) continue;
    used[i] = true;
    walk(i, 1, -1, 0, i === centre);
    used[i] = false;
    if (best === 0) break;
  }
  return best === Infinity ? null : best;
}

export interface TwistleState {
  puzzleId: string;
  /** WORKS — the constrained class. These, and only these, open the room. */
  foundWords: string[];
  /**
   * STUDIES — real words she traced that the room did not ask for. Optional on
   * the type because a snapshot written before round 28 has no such field;
   * every read here goes through `?? []` rather than trusting the shape.
   */
  foundStudies?: string[];
  wrongAttempts: number;
  status: 'playing' | 'won';
}

export type TwistleSubmit =
  | { kind: 'valid'; word: string; won: boolean }
  /** Accepted, kept, scored — and it does not open the room (BENCHMARKS §8). */
  | { kind: 'study'; word: string; points: number }
  | { kind: 'invalid'; reason: 'too-short' | 'not-on-grid' | 'breaks-rule' | 'not-a-word' | 'already-found' | 'finished' };

export function startTwistle(puzzle: TwistlePuzzle): TwistleState {
  return { puzzleId: puzzle.id, foundWords: [], foundStudies: [], wrongAttempts: 0, status: 'playing' };
}

/** King-move neighbours of `index` on an n×n board. */
export function neighbors(index: number, n: number = GRID_SIZE): number[] {
  const r = Math.floor(index / n);
  const c = index % n;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
    }
  }
  return out;
}

/**
 * Find a tile path spelling `word` under the given rules, or null.
 * Depth-first with tile-reuse prevention; grids are 25–36 tiles so this is fast.
 */
export function findPath(grid: string[], word: string, rules: TwistleRules): number[] | null {
  const target = word.toUpperCase();
  if (target.length < rules.minLength) return null;

  // Size comes from the grid itself, so 5×5 and 6×6 boards use one solver and
  // every existing caller keeps its three-argument signature.
  const size = gridSize(grid);
  const centre = centerIndex(size);

  const walk = (path: number[], depth: number): number[] | null => {
    if (depth === target.length) {
      if (rules.centerRequired && !path.includes(centre)) return null;
      return path;
    }
    const last = path[path.length - 1]!;
    for (const n of neighbors(last, size)) {
      if (path.includes(n)) continue;
      if (grid[n] !== target[depth]) continue;
      const found = walk([...path, n], depth + 1);
      if (found) return found;
    }
    return null;
  };

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== target[0]) continue;
    const found = walk([i], 1);
    if (found) return found;
  }
  return null;
}

export function submitTwistleWord(
  puzzle: TwistlePuzzle,
  state: TwistleState,
  rawWord: string,
): { state: TwistleState; result: TwistleSubmit } {
  if (state.status !== 'playing') return { state, result: { kind: 'invalid', reason: 'finished' } };
  const word = rawWord.toUpperCase().trim();

  if (word.length < puzzle.rules.minLength) {
    return { state, result: { kind: 'invalid', reason: 'too-short' } };
  }
  const studies = state.foundStudies ?? [];
  if (state.foundWords.includes(word) || studies.includes(word)) {
    return { state, result: { kind: 'invalid', reason: 'already-found' } };
  }
  const path = findPath(puzzle.grid, word, puzzle.rules);
  if (!path) {
    const reason = findPath(puzzle.grid, word, { ...puzzle.rules, centerRequired: false })
      ? 'breaks-rule'
      : 'not-on-grid';
    return { state: { ...state, wrongAttempts: state.wrongAttempts + 1 }, result: { kind: 'invalid', reason } };
  }
  if (!puzzle.targetWords.includes(word)) {
    // ROUND 28 — before it is a refusal, ask whether the board ACCEPTS it. A
    // study is a real word she traced under every rule the room states; the
    // only thing it lacks is the corner floor of the ask, and it costs nothing.
    if ((puzzle.extraWords ?? []).includes(word)) {
      return {
        state: { ...state, foundStudies: [...studies, word] },
        result: { kind: 'study', word, points: twistlePoints(puzzle).get(word) ?? STUDY_POINTS },
      };
    }
    return { state: { ...state, wrongAttempts: state.wrongAttempts + 1 }, result: { kind: 'invalid', reason: 'not-a-word' } };
  }

  const foundWords = [...state.foundWords, word];
  const won = foundWords.length >= puzzle.targetCount;
  return {
    state: { ...state, foundWords, status: won ? 'won' : 'playing' },
    result: { kind: 'valid', word, won },
  };
}

/** Instant-solve support: fill with targets until the count is met. */
export function solveTwistle(puzzle: TwistlePuzzle, state: TwistleState): TwistleState {
  const needed = puzzle.targetCount - state.foundWords.length;
  const extra = puzzle.targetWords.filter((w) => !state.foundWords.includes(w)).slice(0, Math.max(0, needed));
  return { ...state, foundWords: [...state.foundWords, ...extra], status: 'won' };
}
