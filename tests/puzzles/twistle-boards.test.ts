import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import twistleData from '../../content/generated/twistle.json';
import type { TwistlePuzzle } from '../../src/engine/types';
import {
  centerIndex, findPath, gridSize, maxFindableFor, MIN_ASK_SHARE, puzzleSize,
  startTwistle, straightestTurns, submitTwistleWord, twistleMaxScore, twistlePoints,
  twistleRuleLines, twistleStanding, TWISTLE_RANKS, STUDY_POINTS, workPoints,
} from '../../src/engine/twistle';
import { gateOk } from '../../content/generate-gate';
import { twistleAdapter } from '../../src/engine/rooms/adapters/twistle';

/**
 * tests/puzzles/twistle-boards.test.ts — OWNER: A3.
 *
 * The Gallery's board contract, replayed against the SHIPPED JSON (the same
 * discipline as micro-content-lint: the generator asserts these at build time,
 * this suite fails CI if the committed pool ever disagrees, whether or not the
 * generator was re-run honestly).
 *
 * Round 4, "bigger grids, twistier paths": tier 3 is a 6×6 board, tiers 1–2
 * stay 5×5, and every tier-3 target must still be traceable through the marked
 * centre tile. The 6×6 is the case with teeth — `centerIndex` has no true
 * centre for an even board, `GRID_SIZE`/`CENTER_INDEX` are 5×5 constants that
 * must never be used to index one of these grids, and a board whose targets
 * cannot actually be drawn is an unwinnable room.
 */

const POOL = twistleData as TwistlePuzzle[];

/** Board side length per tier — the shipped contract. */
const SIZE_BY_TIER: Record<number, number> = { 1: 5, 2: 5, 3: 6 };

/**
 * ROUND 19 — an explicit budget for the two whole-pool trace walks.
 *
 * Both of them re-run `findPath` over EVERY target of EVERY shipped board and
 * assert on each hop, which is ~3.4s and ~6.6s of real work. Under vitest's
 * default 5000ms they passed when run alone and timed out when the full suite
 * had every core busy — a flake whose failure message ("Test timed out") says
 * nothing about the Gallery and everything about the machine. The work is
 * deliberate (the shipped pool is the thing under test, not a sample of it), so
 * the budget is stated rather than the coverage reduced.
 */
const POOL_WALK_MS = 30_000;

const byTier = (tier: number) => POOL.filter((p) => p.tier === tier);

/**
 * Norvig frequency ranks, off the SAME vendored corpus the generator judges
 * with (`content/data/dictionary.json`, tracked in git precisely so a gate
 * cannot judge differently on a laptop and on a runner — see .gitignore).
 * Unranked words sort last: a word the corpus never saw is not a gimme.
 */
const RANKS = new Map<string, number>(
  (JSON.parse(readFileSync('content/data/dictionary.json', 'utf8')) as [string, number][])
    .filter(([, r]) => r > 0),
);
const rankOf = (word: string) => RANKS.get(word.toLowerCase()) ?? 1_000_000;

/**
 * THE CHEAPEST SOLVE: the frequency rank of the `targetCount`-th COMMONEST
 * findable word on a board. Sort the answers by how well-known they are and
 * count off exactly as many as the room asks for — the last one is the hardest
 * word a player needs if she takes the easiest possible route out of the room,
 * so its rank IS the difficulty of clearing the board out of reflex.
 */
const cheapestSolveRank = (p: TwistlePuzzle) =>
  p.targetWords.map(rankOf).sort((a, b) => a - b)[p.targetCount - 1]!;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;

describe('twistle board sizes (the Gallery grows at the top of the manor)', () => {
  it('ships a healthy pool at every tier', () => {
    for (const tier of [1, 2, 3]) {
      expect(byTier(tier).length, `tier ${tier}`).toBeGreaterThanOrEqual(50);
    }
  });

  it('tier 3 boards are 6×6', () => {
    const t3 = byTier(3);
    expect(t3.length).toBeGreaterThan(0);
    for (const p of t3) {
      expect(p.size, p.id).toBe(6);
      expect(p.grid.length, p.id).toBe(36);
      // Derived and declared size must agree — the engine trusts the grid.
      expect(gridSize(p.grid), p.id).toBe(6);
      expect(puzzleSize(p), p.id).toBe(6);
    }
  });

  it('tier 1 and tier 2 boards stay 5×5', () => {
    for (const tier of [1, 2]) {
      const boards = byTier(tier);
      expect(boards.length, `tier ${tier}`).toBeGreaterThan(0);
      for (const p of boards) {
        expect(p.size, p.id).toBe(5);
        expect(p.grid.length, p.id).toBe(25);
      }
    }
  });

  it('every board declares the size its tier promises', () => {
    for (const p of POOL) {
      const want = SIZE_BY_TIER[p.tier]!;
      expect(puzzleSize(p), `${p.id} (tier ${p.tier})`).toBe(want);
      expect(p.grid.every((c) => /^[A-Z]$/.test(c)), p.id).toBe(true);
    }
  });
});

describe('twistle board solvability (every shipped Gallery can be hung)', () => {
  it('every target word has a legal trace under its own rules', () => {
    for (const p of POOL) {
      for (const w of p.targetWords) {
        const path = findPath(p.grid, w, p.rules);
        expect(path, `${p.id}: ${w}`).not.toBeNull();
        // A trace never reuses a tile and never leaves the board.
        expect(new Set(path!).size, `${p.id}: ${w} reuses a tile`).toBe(w.length);
        for (const i of path!) expect(i, `${p.id}: ${w} off-board`).toBeLessThan(p.grid.length);
      }
    }
  }, POOL_WALK_MS);

  it('tier-3 traces pass through the marked centre tile of the 6×6', () => {
    const centre = centerIndex(6);
    // Guard the derivation itself: floor(n²/2) would put the "centre" of a 6×6
    // on the left wall (18); the real middle tile is row 2, col 2.
    expect(centre).toBe(14);
    for (const p of byTier(3)) {
      expect(p.rules.centerRequired, p.id).toBe(true);
      expect(p.rules.minLength, p.id).toBe(5);
      for (const w of p.targetWords) {
        expect(w.length, `${p.id}: ${w}`).toBeGreaterThanOrEqual(5);
        expect(findPath(p.grid, w, p.rules)!.includes(centre), `${p.id}: ${w}`).toBe(true);
      }
    }
  });

  it('every board can be played to a win through the real engine', () => {
    for (const p of POOL) {
      expect(p.targetWords.length, p.id).toBeGreaterThanOrEqual(p.targetCount);
      let s = startTwistle(p);
      for (const w of p.targetWords) {
        if (s.status === 'won') break;
        const r = submitTwistleWord(p, s, w);
        expect(r.result.kind, `${p.id}: ${w}`).toBe('valid');
        s = r.state;
      }
      expect(s.status, p.id).toBe('won');
      expect(s.wrongAttempts, p.id).toBe(0);
    }
  });

  /**
   * ROUND 10 — the hung sheet's contract (AAA 3.4). The Gallery's win screen
   * draws every claimed word back onto the board, and it does that by asking
   * `findPath` for the trace again rather than storing one; so for every word
   * the room can ever have accepted, the trace must exist, stay inside the
   * grid, and be a real king-move walk with no reused tile. If any of that
   * fails, the celebration silently draws a broken polyline over the letters.
   */
  it('every claimable word can be re-traced for the hung sheet', () => {
    for (const p of POOL) {
      const n = puzzleSize(p);
      for (const w of p.targetWords) {
        const path = findPath(p.grid, w, p.rules);
        expect(path, `${p.id}: ${w}`).not.toBeNull();
        expect(path!.length, `${p.id}: ${w} length`).toBe(w.length);
        expect(new Set(path!).size, `${p.id}: ${w} reuses a tile`).toBe(path!.length);
        for (const idx of path!) {
          expect(idx, `${p.id}: ${w} off-grid`).toBeGreaterThanOrEqual(0);
          expect(idx, `${p.id}: ${w} off-grid`).toBeLessThan(p.grid.length);
        }
        for (let i = 1; i < path!.length; i++) {
          const a = path![i - 1]!;
          const b = path![i]!;
          const dr = Math.abs(Math.floor(a / n) - Math.floor(b / n));
          const dc = Math.abs((a % n) - (b % n));
          expect(dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0), `${p.id}: ${w} jumps`).toBe(true);
        }
      }
    }
  }, POOL_WALK_MS);

  it('a 6×6 board played through the adapter solves and reports perfect', () => {
    const p = byTier(3)[0]!;
    let state = twistleAdapter.start(p, { tier: 3, seed: 1, volumeId: 'volume-1' });
    let solved = false;
    for (const w of p.targetWords.slice(0, p.targetCount)) {
      const r = twistleAdapter.reduce(p, state, { type: 'submit', word: w });
      state = r.state;
      solved = r.outcome.status === 'solved';
    }
    expect(solved, p.id).toBe(true);
    expect(state.costedMistakes, p.id).toBe(0);
  });
});

describe('twistle twist floors (the tier-3 promise is measured, not asserted)', () => {
  /** Direction changes along a trace — recomputed here, independent of the generator. */
  function turnsOf(path: readonly number[], n: number): number {
    let turns = 0;
    let prev: string | null = null;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!;
      const step = `${Math.floor(b / n) - Math.floor(a / n)},${(b % n) - (a % n)}`;
      if (prev !== null && step !== prev) turns++;
      prev = step;
    }
    return turns;
  }

  it('NO tier has a straight-line gimme: every target on every board turns', () => {
    // ROUND 26 — the floor climbs 1 → 2 → 4 and tier 1 is the one that moved.
    // It used to be 0 with the entry twist CAPPED at 1, i.e. the ground-floor
    // Gallery deliberately offered words that read straight off a row, which is
    // the cheapest kind of find there is. `findPath` returns *a* trace, not
    // necessarily the straightest, so this is a weaker bar than the generator's
    // (which minimises over every trace) — it is the regression guard, not the
    // spec.
    const floorByTier: Record<number, number> = { 1: 1, 2: 2, 3: 2 };
    for (const p of POOL) {
      for (const w of p.targetWords) {
        const path = findPath(p.grid, w, p.rules)!;
        expect(turnsOf(path, puzzleSize(p)), `${p.id}: ${w}`)
          .toBeGreaterThanOrEqual(floorByTier[p.tier]!);
      }
    }
  }, POOL_WALK_MS);

  it('tier 3 has no straight-line gimme: every target turns at least twice', () => {
    // findPath returns *a* trace, not necessarily the straightest, so this is a
    // weaker bar than the generator's (which minimises over all traces). It is
    // still the regression guard that matters: if the tortuosity pass is ever
    // dropped, tier-3 boards fill with straight runs and this fails.
    for (const p of byTier(3)) {
      for (const w of p.targetWords) {
        const path = findPath(p.grid, w, p.rules)!;
        expect(turnsOf(path, puzzleSize(p)), `${p.id}: ${w}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

/**
 * ═══ ROUND 26 — THE GALLERY IS A PUZZLE, MEASURED ═════════════════════════
 *
 * The owner's steer, 10 August: *"the word puzzles are too small a part of the
 * game and the mechanics are not built around them."* For this room the charge
 * was sharper than that — it was not a puzzle at all. Measured over the 210
 * boards shipped before this round:
 *
 *   * tier 1 asked **5 words of a median 106-word pool** (need/pool 0.048),
 *     with a median 57 of them available at exactly the four-letter minimum,
 *     and the fattest board in the house offered 173 findable words;
 *   * scored against the vendored Norvig corpus, **the fifth-commonest findable
 *     word sat at rank 305** on the median board and **rank 125 on the worst**
 *     — the whole room could be cleared by typing words you already had in your
 *     head, in about twenty seconds, without reading the grid as a grid.
 *
 * A word search is not a puzzle because it is long; it is a puzzle because
 * finding the target set requires SEEING something. So the fix is mostly
 * SUBTRACTIVE — a 5-letter floor and a turn floor on every target at every
 * tier, plus tier 3's centre rule pushed down to tier 2 (BENCHMARKS §3, Wordle
 * hard mode: *difficulty by constraining the player, not by adding content*) —
 * and the ask itself does not rise AT ALL: tier 1 still wants five words, tier
 * 2 wants six where it used to want seven. The share came into line with tier
 * 3's because the BOARD shrank — a median 106 findable words to 23.
 *
 * These three gates are what stop it drifting back. None of them can pass by
 * construction: each one reads the shipped JSON and each one fails on the pool
 * this repo shipped yesterday.
 */
describe('twistle is a puzzle, not a lookup (round 26)', () => {
  /** What the room asks, over what the board offers — per board, not median. */
  const askShare = (p: TwistlePuzzle) => p.targetCount / p.targetWords.length;

  it('never asks for less than one word in five of its own board', () => {
    // THE DEFECT WAS A RATIO, NOT A COUNT. Five of 106 is a rounding error of a
    // board however many minutes it takes, and the old pool ran as fat as 173
    // findable words behind a five-word ask (share 0.029). The ceiling is
    // derived from each board's OWN targetCount (`maxFindableFor`), so it
    // cannot drift from the ask it is meant to bound.
    for (const p of POOL) {
      expect(p.targetWords.length, `${p.id} pool ${p.targetWords.length} vs ask ${p.targetCount}`)
        .toBeLessThanOrEqual(maxFindableFor(p.targetCount));
      expect(askShare(p), `${p.id} ask share ${askShare(p).toFixed(3)}`)
        .toBeGreaterThanOrEqual(MIN_ASK_SHARE - 1e-9);
    }
    // Measured on the shipped pool: 0.217 / 0.286 / 0.273 at the median,
    // against 0.048 / 0.082 / 0.214 before. Asserted per TIER and ABOVE the
    // per-board floor, so a regeneration in which every board merely scrapes
    // the one-in-five rule fails here rather than passing quietly.
    for (const [tier, floor] of [[1, 0.20], [2, 0.24], [3, 0.24]] as const) {
      const s = median(byTier(tier).map(askShare));
      expect(s, `tier ${tier} median ask share ${s.toFixed(3)}`).toBeGreaterThanOrEqual(floor);
    }
    // …and it is not the whole board either — the room must still offer a
    // CHOICE of which words to take, or it is a checklist.
    for (const p of POOL) expect(askShare(p), p.id).toBeLessThan(0.75);
  });

  it('cannot be cleared out of reflex: the cheapest solve is no top-1000 word', () => {
    // THE HEADLINE METRIC, and the name says exactly what it computes: sort a
    // board's findable words by frequency, count off as many as the room asks
    // for, and look at the last one. Before this round the worst tier-1 board
    // answered to the 125th commonest word in English and the median to the
    // 305th — inside the three hundred words nobody has to search for. The
    // floor is per BOARD, because a median cannot see a single free board.
    const floorByTier: Record<number, number> = { 1: 1000, 2: 1000, 3: 1500 };
    for (const p of POOL) {
      const r = cheapestSolveRank(p);
      expect(r, `${p.id}: cheapest solve ends on rank ${r}`)
        .toBeGreaterThanOrEqual(floorByTier[p.tier]!);
    }
    // And the median has moved off the general-service vocabulary entirely
    // (~the top 2,000 words of English): measured 2,581 / 3,540 / 8,812 against
    // 305 / 608 / 6,740 before. A ratchet, not a description.
    for (const [tier, floor] of [[1, 2000], [2, 3000], [3, 6000]] as const) {
      const m = median(byTier(tier).map(cheapestSolveRank));
      expect(m, `tier ${tier} median cheapest solve rank ${m}`).toBeGreaterThanOrEqual(floor);
    }
  });

  it('offers no four-letter chaff, and states its own rules on every board', () => {
    // The length floor is 5 everywhere now (it was 4 on tiers 1–2, where a
    // median 57 words per board sat at exactly the minimum; it is 12 now).
    // `rules` is what
    // the engine enforces AND what TwistleView prints at rest, so the shipped
    // rules must match the shipped words — a board that says "5+ letters" and
    // carries a four-letter answer teaches the player the room is lying.
    const centreByTier: Record<number, boolean> = { 1: false, 2: true, 3: true };
    for (const p of POOL) {
      expect(p.rules.minLength, p.id).toBe(5);
      expect(p.rules.centerRequired, `${p.id} (tier ${p.tier})`).toBe(centreByTier[p.tier]!);
      for (const w of p.targetWords) {
        expect(w.length, `${p.id}: ${w} is under the stated minimum`)
          .toBeGreaterThanOrEqual(p.rules.minLength);
      }
      if (p.rules.centerRequired) {
        const centre = centerIndex(puzzleSize(p));
        for (const w of p.targetWords) {
          expect(findPath(p.grid, w, p.rules)!.includes(centre), `${p.id}: ${w} misses the marked tile`)
            .toBe(true);
        }
      }
    }
  }, POOL_WALK_MS);
});

/**
 * ═══ ROUND 28 — THE ACCEPT-LIST, THE COPY, AND THE LADDER ═════════════════
 *
 * Round 17 fixed this room's difficulty with three knobs and broke something
 * else doing it. Every knob narrowed what the Gallery ACCEPTS without narrowing
 * what the player can physically TRACE, and at tier 3 the four-corner floor
 * **refused a median 23 words per board that a player plausibly knows (Norvig
 * rank ≤ 20,000) while accepting 11** — more known words refused than accepted,
 * for a rule the room never stated. Tracing a word you can see and being told it
 * is not a word is the worst feeling a word search can give.
 *
 * Every gate below reads the shipped JSON, and every one of them FAILS on the
 * pool this repo shipped yesterday; the number each one condemns is recorded in
 * its own comment, measured rather than asserted.
 */

/** The four-to-eight letter window the generator's trie enumerates. */
const MIN_ENUM = 4;
const MAX_ENUM = 8;

/**
 * Every corpus word a player PLAUSIBLY KNOWS — the same rank ≤ 20,000 line the
 * `everyday` band is drawn at, and the line the independent critic measured this
 * room's refusals against.
 */
const KNOWN: string[] = [...RANKS.entries()]
  .filter(([w, r]) => r <= 20_000 && w.length >= MIN_ENUM && w.length <= MAX_ENUM)
  .map(([w]) => w.toUpperCase());

interface Node { kids: Map<string, Node>; word: string | null }
function trieOf(words: string[]): Node {
  const root: Node = { kids: new Map(), word: null };
  for (const w of words) {
    let n = root;
    for (const c of w) {
      let k = n.kids.get(c);
      if (!k) { k = { kids: new Map(), word: null }; n.kids.set(c, k); }
      n = k;
    }
    n.word = w;
  }
  return root;
}
const KNOWN_TRIE = trieOf(KNOWN);

/**
 * Every KNOWN word this grid can really be made to spell, INDEPENDENTLY of what
 * the board claims to accept: a depth-first walk of the grid against a trie of
 * the corpus, honouring exactly the rules the room states on the glass (length
 * floor, king adjacency, no tile reused, the marked tile when it is marked).
 * This is the player's hand, not the generator's list — which is the only way a
 * gate on *what the room refuses* can ever fail.
 */
function traceableKnownWords(p: TwistlePuzzle): Set<string> {
  const n = puzzleSize(p);
  const centre = centerIndex(n);
  const out = new Set<string>();
  const used = new Array<boolean>(p.grid.length).fill(false);
  const walk = (pos: number, node: Node, depth: number, hitCentre: boolean) => {
    const next = node.kids.get(p.grid[pos]!);
    if (!next) return;
    used[pos] = true;
    const centred = hitCentre || pos === centre;
    if (next.word && depth + 1 >= p.rules.minLength && (!p.rules.centerRequired || centred)) {
      out.add(next.word);
    }
    const r = Math.floor(pos / n), c = pos % n;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        const idx = nr * n + nc;
        if (!used[idx]) walk(idx, next, depth + 1, centred);
      }
    }
    used[pos] = false;
  };
  for (let i = 0; i < p.grid.length; i++) walk(i, KNOWN_TRIE, 0, false);
  return out;
}

/** Yield the event loop between tiers — STATUS' own lesson about worker timeouts. */
const breathe = () => new Promise<void>((resolve) => { setImmediate(resolve); });

describe('twistle accepts what it lets you trace (round 28, BENCHMARKS §8)', () => {
  it('ships both classes on every board', () => {
    const minTurnsByTier: Record<number, number> = { 1: 1, 2: 2, 3: 4 };
    for (const p of POOL) {
      expect(Array.isArray(p.extraWords), `${p.id} ships no study list`).toBe(true);
      expect(p.minTurns, p.id).toBe(minTurnsByTier[p.tier]!);
      const works = new Set(p.targetWords);
      for (const w of p.extraWords!) {
        // A study is shown as a chip and scored, so a broken one is a visible lie.
        expect(works.has(w), `${p.id}: ${w} is both a work and a study`).toBe(false);
        expect(w.length, `${p.id}: study ${w} under the stated minimum`)
          .toBeGreaterThanOrEqual(p.rules.minLength);
        expect(findPath(p.grid, w, p.rules), `${p.id}: study ${w} cannot be traced`).not.toBeNull();
        expect(gateOk(w.toLowerCase()), `${p.id}: study ${w} fails the cozy gate`).toBe(true);
        // …and it genuinely falls short of the ask, or it belonged in the ask.
        expect(straightestTurns(p.grid, w, p.rules)!, `${p.id}: study ${w} is a work`)
          .toBeLessThan(p.minTurns!);
      }
    }
  }, POOL_WALK_MS);

  /**
   * THE GATE THIS ROUND EXISTS FOR, and it cannot pass by construction: it never
   * reads `targetWords` to decide what ought to be findable. It walks the GRID
   * against the corpus and then asks the board what it does with each word.
   *
   * Replayed against the pool shipped at round 17 it fails on 1,610 words across
   * the seventy tier-3 boards — a median of 23 a board, against a median 11
   * known words accepted — plus 51 at tier 2 and 3 at tier 1.
   * On this pool the only known word any board still refuses is one the COZY
   * GATE refuses: 175 in the house, every one a word the manor will not print
   * (TRANS, NUDES, ANGER, PENIS, COCAINE…). That is an editorial refusal, not a
   * rule of play she can see on the board and obey, and it is the whole residue.
   */
  it('refuses no word she can trace and plausibly knows — except what the manor will not print', async () => {
    for (const tier of [1, 2, 3]) {
      const offenders: string[] = [];
      for (const p of byTier(tier)) {
        const accepted = new Set([...p.targetWords, ...(p.extraWords ?? [])]);
        for (const w of traceableKnownWords(p)) {
          if (accepted.has(w)) continue;
          if (!gateOk(w.toLowerCase())) continue; // the cozy gate's own call
          offenders.push(`${p.id}: ${w} (rank ${rankOf(w)})`);
        }
      }
      expect(offenders.slice(0, 12), `tier ${tier} refuses ${offenders.length} known traceable words`)
        .toEqual([]);
      await breathe();
    }
  }, POOL_WALK_MS);

  /**
   * The other half of the same promise: acceptance has to be worth having. A
   * tier-3 board with an empty second class has not been fixed, it has been
   * relabelled — round 17's tier-3 boards accepted a median 11 known words and
   * this pool accepts 35.
   */
  it('tier 3 really has a second class, and the lower tiers never needed one', () => {
    const studies = byTier(3).map((p) => p.extraWords!.length);
    expect(median(studies), 'tier 3 median studies').toBeGreaterThanOrEqual(20);
    expect(Math.min(...studies), 'the thinnest tier-3 board').toBeGreaterThan(0);
    // Tiers 1–2 measured a median 0 refusals before this round: the defect was
    // never theirs, and this is the pin that says so rather than a claim.
    for (const tier of [1, 2]) {
      expect(median(byTier(tier).map((p) => p.extraWords!.length)), `tier ${tier}`).toBe(0);
    }
  });

  it('a study is accepted, is not a mistake, and does not open the room', () => {
    const p = byTier(3).find((b) => b.extraWords!.length > 0)!;
    const study = p.extraWords![0]!;
    const r = submitTwistleWord(p, startTwistle(p), study);
    expect(r.result.kind, `${p.id}: ${study}`).toBe('study');
    expect(r.state.foundStudies, p.id).toEqual([study]);
    expect(r.state.status, p.id).toBe('playing');
    expect(r.state.wrongAttempts, 'a study is not a mistake').toBe(0);
    // Every study on the board, and the door is still shut.
    let s = startTwistle(p);
    for (const w of p.extraWords!) s = submitTwistleWord(p, s, w).state;
    expect(s.status, `${p.id}: studies alone opened the room`).toBe('playing');
    expect(s.foundWords.length, p.id).toBe(0);
  });
});

describe('twistle states its own rules, and they are true (round 28)', () => {
  /**
   * ROUND 17'S HEADER WAS FALSE AT TIER 3. It read `{targetCount} words ·
   * {minLength}+ letters`, and the four-corner floor meant nothing under six
   * letters counted anywhere in the tier — measured on that pool, **0 works of
   * exactly five letters across all seventy tier-3 boards**, so this gate fails
   * on it. It passes here because the stated floor is the ACCEPTANCE floor and a
   * five-letter tier-3 trace is a study (a median 29 of them per board).
   */
  it('every board can really be played at the length its header states', () => {
    for (const p of POOL) {
      const accepted = [...p.targetWords, ...(p.extraWords ?? [])];
      expect(accepted.some((w) => w.length === p.rules.minLength),
        `${p.id} says ${p.rules.minLength}+ letters and accepts nothing that short`).toBe(true);
    }
  });

  it('every clause of the header is true of the class it describes', () => {
    for (const p of POOL) {
      const lines = twistleRuleLines(p);
      expect(lines.trace).toContain(`${p.rules.minLength}+ letters`);
      expect(lines.trace.includes('marked tile'), p.id).toBe(p.rules.centerRequired);
      expect(lines.ask).toContain(`${p.targetCount} works`);
      // The corner floor is stated on the ASK, where it is true — never on the
      // acceptance rule, where round 17 left it silent and enforced it anyway.
      if (p.minTurns! > 1) expect(lines.ask).toContain(`${p.minTurns}+ corners`);
      else expect(lines.ask).toContain('a corner');
      expect(lines.trace).not.toContain('corner');
      for (const w of p.targetWords) {
        expect(straightestTurns(p.grid, w, p.rules)!, `${p.id}: work ${w} misses the stated corner floor`)
          .toBeGreaterThanOrEqual(p.minTurns!);
      }
    }
  }, POOL_WALK_MS);
});

describe('twistle has a ladder, and it is placed against the boards (round 28)', () => {
  /** The `targetCount` COMMONEST works — the reflex solve. */
  const cheapestSolve = (p: TwistlePuzzle) =>
    [...p.targetWords].sort((a, b) => rankOf(a) - rankOf(b)).slice(0, p.targetCount);
  /** The `targetCount` lowest-SCORING works — the floor of what a solve can pay. */
  const leanestSolve = (p: TwistlePuzzle) => {
    const pts = twistlePoints(p);
    return [...p.targetWords].sort((a, b) => pts.get(a)! - pts.get(b)!).slice(0, p.targetCount);
  };
  const standingOf = (p: TwistlePuzzle, words: string[]) =>
    twistleStanding(p, { ...startTwistle(p), foundWords: words });

  it('scores a letter a point and a corner two, off the straightest trace', () => {
    for (const p of POOL.slice(0, 40)) {
      const pts = twistlePoints(p);
      for (const w of p.targetWords) {
        expect(pts.get(w), `${p.id}: ${w}`).toBe(workPoints(w, straightestTurns(p.grid, w, p.rules)!));
      }
      for (const w of p.extraWords!) expect(pts.get(w), `${p.id}: study ${w}`).toBe(STUDY_POINTS);
      // The top rung is every accepted word and nothing more.
      expect(twistleMaxScore(p), p.id).toBe([...pts.values()].reduce((a, b) => a + b, 0));
    }
  }, POOL_WALK_MS);

  /**
   * THE PLACEMENT GATE. A ladder whose rungs were picked for the sound of them
   * is not a ladder — the numbers have to answer to the boards. Measured on this
   * pool: the cheapest solve scores a median 21 / 28 / 24% of the board maximum
   * and the leanest 16 / 23 / 22%, never below 13%. So rung 2 sits at 12%, one
   * point of margin under the leanest solve in the house, and a player who
   * merely solves always arrives at rung 2–4 with something still above her.
   * Move a rung and this fails; regenerate fatter boards and this fails.
   */
  it('a player who merely solves lands mid-ladder — never on the floor, never at the top', () => {
    for (const p of POOL) {
      for (const [what, words] of [['cheapest', cheapestSolve(p)], ['leanest', leanestSolve(p)]] as const) {
        const st = standingOf(p, [...words]);
        expect(st.rung, `${p.id} ${what} solve → ${st.name} (${st.score}/${st.max})`)
          .toBeGreaterThanOrEqual(2);
        expect(st.rung, `${p.id} ${what} solve → ${st.name}`)
          .toBeLessThanOrEqual(TWISTLE_RANKS.length - 2);
        expect(st.next, `${p.id} ${what} solve has nothing left to chase`).not.toBeNull();
        expect(st.next!.points, p.id).toBeGreaterThan(0);
      }
    }
  }, POOL_WALK_MS);

  it('the top rung is every word on the board, and only a full board reaches it', () => {
    for (const p of POOL.slice(0, 30)) {
      const worksOnly = standingOf(p, [...p.targetWords]);
      const everything = twistleStanding(p, {
        ...startTwistle(p), foundWords: [...p.targetWords], foundStudies: [...p.extraWords!],
      });
      expect(everything.rung, p.id).toBe(TWISTLE_RANKS.length - 1);
      expect(everything.next, p.id).toBeNull();
      expect(everything.score, p.id).toBe(twistleMaxScore(p));
      // Every WORK but no study is short of the summit wherever studies exist.
      if (p.extraWords!.length > 0) expect(worksOnly.rung, p.id).toBeLessThan(TWISTLE_RANKS.length - 1);
    }
  });

  /**
   * THE ANTI-FARM GATE, and the reason the door is a COUNT and not a score
   * (round 26's defect must not walk back in wearing a ladder): a tier-3 board
   * carries up to 77 studies, so if points opened the room, they would open it.
   * They cannot — and they must also not out-rank the ask, or the room teaches
   * her to hunt chaff. Measured: every study on a board together is worth a
   * median 11% of that board's maximum and at most 20%, against a solve's 22–24%.
   */
  it('cannot be climbed on studies alone', () => {
    for (const p of POOL) {
      const studiesOnly = twistleStanding(p, { ...startTwistle(p), foundStudies: [...p.extraWords!] });
      const solve = standingOf(p, leanestSolve(p));
      expect(studiesOnly.score, `${p.id}: the whole margin out-scores the exhibition`)
        .toBeLessThan(solve.score);
      expect(studiesOnly.rung, p.id).toBeLessThanOrEqual(solve.rung);
    }
  });
});
