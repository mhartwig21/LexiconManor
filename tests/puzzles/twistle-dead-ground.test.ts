import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import twistleData from '../../content/generated/twistle.json';
import preRound43 from './fixtures/twistle-pre-round43.json';
import type { TwistlePuzzle } from '../../src/engine/types';
import {
  centerIndex, puzzleSize, startTwistle, submitTwistleWord,
  BARREN_MIN_WORDS, MAX_BARREN_CLUSTER, barrenClusterSizes,
} from '../../src/engine/twistle';

/**
 * tests/puzzles/twistle-dead-ground.test.ts — ROUND 43's metric, ROUND 48's gate.
 *
 * Owner, from play: *"There is a lot of letter placements that totally close off
 * any ability to ever form a word. That is not fun. It is okay to have some, but
 * it is too much — like c c c all next to each other."*
 *
 * ═══ WHAT THIS FILE CLAIMED ABOUT ITSELF, AND WHAT IS ACTUALLY TRUE ════════
 *
 * Round 43 shipped this gate under a header that said it "shares as little of
 * the generator as the question allows", and listed three independences: its own
 * dictionary (raw ENABLE off disk), its own enumeration (a DFS that never calls
 * `tileCoverage`), and the room itself (`submitTwistleWord` rather than a
 * re-implementation of the accept rules). Two of the three are real. **The third
 * is the decisive one and it is the opposite of independent.**
 *
 * `submitTwistleWord` accepts a word if and only if it is in `targetWords` or
 * `extraWords` — set membership in the board's own published lists. So the raw
 * ENABLE walk throws away everything it found that the lists do not contain, and
 * what is left is exactly the set `content/generate-twistle.ts` validates
 * against. The frequency line is asserted equal to the generator's. The coverage
 * union is the same union. At the decisive step this gate asks the generator's
 * question, of the generator's words, and gets the generator's answer — by a
 * different code path, which is a checksum, not an audit.
 *
 * Round 43's own independence test read `extra > 0` and passed. **The surplus is
 * 2.2%** (measured below): the enumerator traces 1.022 words for every one the
 * verdict uses, because round 38 already grew `extraWords` to every ENABLE word
 * the grid can spell that survives the blocklist. True, and materially empty.
 *
 * That is why the shipped pool reads a largest barren cluster of **exactly 2 at
 * every tier**, sitting flush on a ceiling of 2: a rejection sampler that
 * refuses anything over 2 produces a population whose maximum is 2, and a gate
 * that re-runs the sampler's own predicate can only ever confirm it. A gate
 * pinned to the line it was tuned to, proving what it assumes, is the failure
 * this project has recorded more times than any other.
 *
 * ═══ SO THE CEILING IS DEFENDED AS A RULING, AND THE GATE IS MADE RED-ABLE ══
 *
 * **The ceiling is not a statistic and margin would be wrong.** `MAX_BARREN_CLUSTER
 * = 2` is a transcription of the owner's sentence — a barren PAIR is allowed
 * anywhere, a barren THREE is not, because his example of too much is three
 * touching. Asking a ruling for headroom means asking the generator to enforce
 * ≤1, which the same sentence forbids ("it is okay to have some"). A ruling gate
 * is *supposed* to sit on its line. What it is not allowed to do is sit there
 * where nothing could ever push it off, so three things changed:
 *
 *   1. THE CONDEMNED POPULATION IS CHECKED IN, WHOLE. Round 43 proved the
 *      ceiling could fail by hand-copying ONE board out of the old JSON. The
 *      whole pre-round-43 pool is now a fixture (`fixtures/twistle-pre-round43.json`,
 *      the 210 boards at commit fbef228) and the identical reading runs over it:
 *      **103 offending boards, 13 / 30 / 60 by tier, worst walls 6 / 9 / 15.**
 *      Those figures are asserted EXACTLY, because the fixture is frozen: the
 *      only thing that can move them is this file's own instrument changing,
 *      which is precisely what a gate on a gate should catch.
 *   2. THE "SURVIVES MOVING THE LINE" PROOF IS RETIRED AS A PROOF. Re-running
 *      at rank ≤ 60,000 cannot fail and round 43 said so in its own comment —
 *      a wider vocabulary can only ADD findable words, so a board clean at 20k
 *      is clean at 60k by monotonicity. It is kept, relabelled honestly: it is
 *      an INSTRUMENT self-check (it would catch a `readBoard` that miscounts),
 *      not evidence about the pool.
 *   3. THE LINE IS MOVED IN THE DIRECTION THAT CAN DISAGREE — TIGHTER. Halving
 *      the line to rank ≤ 10,000 can only REMOVE words, so clusters can only
 *      grow, and the question becomes one the generator never asks: **is this
 *      pool better ground, or is it just a pool tuned at 20,000?** A fix that
 *      bought its cleanliness by threading rank-19,000 words through corners
 *      would show no improvement here. Measured, mean largest barren cluster:
 *
 *        | at rank ≤ 10,000  | tier 1 | tier 2 | tier 3 | all  |
 *        |-------------------|--------|--------|--------|------|
 *        | pre-round-43 pool | 4.714  | 5.171  | 11.586 | 7.157|
 *        | the shipped pool  | 3.971  | 4.657  |  7.300 | 5.310|
 *
 *      The assertion is the DIRECTION at every tier, not the magnitudes. The
 *      magnitudes are two frozen artifacts and a bound on them would be the
 *      ceil(measured) habit with a new face; the direction is what the design
 *      requires, and it is what a line-tuned regeneration would break.
 *
 * **AND THE DEBT IS PUBLISHED RATHER THAN IMPLIED.** The round-43 fix is a fix
 * at and above the design's line. At rank ≤ 10,000 the shipped pool still has
 * **155 of 210 boards over the ceiling and a worst wall of 21**; at ≤ 15,000,
 * 90 boards and a worst wall of 12. Nothing in this file has ever claimed the
 * ground is clean at every line, and now nothing in it can be read that way.
 *
 * ═══ WHAT IS MEASURED, AND THE MEASUREMENT THAT WAS WRONG FIRST ════════════
 *
 * The obvious metric — a tile on no findable word — is DEAD ON ARRIVAL as a
 * gate. Against the board's accept-list it reads median 0 at every tier on the
 * pool that shipped before round 43, so a gate written on it would have gone
 * green without a grid changing. The accept-list is the wrong denominator:
 * round 38 grew it to 26,107 ENABLE words, so a tile "serving 22 words"
 * routinely means AIVERS, AKEES and twenty others she will never type.
 *
 * So the denominator is the words FINDABLE IN PRACTICE — accepted AND known —
 * and the unit is the CLUSTER, because clusters are what the owner complained
 * about. Barren pairs remain on purpose (median 2 / 3 / 5 barren tiles a board,
 * in ones and twos): a search with nothing to reject is not a search.
 */

const POOL = twistleData as TwistlePuzzle[];
/**
 * The 210 boards as they shipped before round 43 (commit fbef228), frozen. This
 * is the population the ceiling was written to condemn, and the only way a
 * ruling gate can be shown red is to run it whole against one.
 */
const CONDEMNED = preRound43 as unknown as TwistlePuzzle[];

/**
 * The heavy walks below enumerate every legal trace on 420 boards against the
 * whole of ENABLE. That is real work and it is deliberate — the shipped pool is
 * the thing under test, not a sample of it — so it gets a stated budget and
 * yields the event loop between boards. Two deploys have died with every test
 * passing because one file starved the vitest worker reporter.
 */
const HEAVY_MS = 240_000;
const breathe = () => new Promise<void>((resolve) => { setImmediate(resolve); });

/** "She plausibly knows it" — round 28's line, and the design's line here. */
const KNOWN_RANK = 20_000;
/** The tautological direction: wider can only add words. Instrument check only. */
const WIDER_RANK = 60_000;
/** The design's line HALVED — the direction that can disagree with the pool. */
const TIGHT_RANK = 10_000;

/** Raw ENABLE, read here rather than through the generator's dictionary. */
function loadEnable(): { words: Set<string>; prefixes: Set<string> } {
  const words = new Set<string>();
  const prefixes = new Set<string>();
  for (const line of readFileSync('content/data/enable1.txt', 'utf8').split('\n')) {
    const w = line.trim().toUpperCase();
    if (w.length === 0) continue;
    words.add(w);
    for (let i = 1; i <= w.length; i++) prefixes.add(w.slice(0, i));
  }
  return { words, prefixes };
}

/** Norvig ranks read straight off the raw counts, not off dictionary.json. */
function loadRanks(): Map<string, number> {
  const ranks = new Map<string, number>();
  const lines = readFileSync('content/data/count_1w.txt', 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const w = lines[i]!.split('\t')[0]!.trim().toUpperCase();
    if (w.length > 0 && !ranks.has(w)) ranks.set(w, i + 1);
  }
  return ranks;
}

const ENABLE = loadEnable();
const RANK = loadRanks();
const rankOf = (w: string) => RANK.get(w.toUpperCase()) ?? Number.MAX_SAFE_INTEGER;

/** King-move neighbours, computed here so the walk borrows nothing. */
function kingNeighbours(n: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    const nb: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) nb.push(rr * n + cc);
      }
    }
    out.push(nb);
  }
  return out;
}

/**
 * Every ENABLE word traceable on this grid under the rules the board STATES,
 * and every tile that lies on some legal trace of it. A word's coverage is the
 * union over all its readings: a tile the player could route through is alive
 * whether or not one particular walk chose it.
 */
function enumerateBoard(p: TwistlePuzzle): Map<string, Set<number>> {
  const grid = p.grid;
  const n = puzzleSize(p);
  const centre = centerIndex(n);
  const nb = kingNeighbours(n);
  const found = new Map<string, Set<number>>();
  const used = new Array<boolean>(n * n).fill(false);
  const path: number[] = [];

  const walk = (pos: number, prefix: string, hitCentre: boolean) => {
    const s = prefix + grid[pos]!;
    if (!ENABLE.prefixes.has(s)) return;
    used[pos] = true;
    path.push(pos);
    const hit = hitCentre || pos === centre;
    if (s.length >= p.rules.minLength && ENABLE.words.has(s) && (hit || !p.rules.centerRequired)) {
      let tiles = found.get(s);
      if (!tiles) { tiles = new Set<number>(); found.set(s, tiles); }
      for (const t of path) tiles.add(t);
    }
    for (const x of nb[pos]!) if (!used[x]) walk(x, s, hit);
    path.pop();
    used[pos] = false;
  };
  for (let i = 0; i < n * n; i++) walk(i, '', false);
  return found;
}

/**
 * Does the ROOM take this word? Asked of the room rather than re-implemented —
 * and stated plainly, because the header depends on it: this is set membership
 * in the board's own `targetWords` / `extraWords`, so it is the ONE step where
 * this gate and the generator are the same instrument.
 */
function roomAccepts(p: TwistlePuzzle, word: string): boolean {
  const { result } = submitTwistleWord(p, startTwistle(p), word);
  return result.kind === 'valid' || result.kind === 'study';
}

/**
 * One enumeration of a board, kept at every rank so the readings at three
 * different lines cost one walk instead of three. `traceable` is every ENABLE
 * word the grid can spell; `accepted` is the subset the room takes, with the
 * rank that decides whether she plausibly knows it.
 */
interface BoardScan {
  puzzle: TwistlePuzzle;
  n: number;
  traceable: number;
  accepted: { rank: number; tiles: Set<number> }[];
}

function scanBoard(p: TwistlePuzzle): BoardScan {
  const n = puzzleSize(p);
  const traced = enumerateBoard(p);
  const accepted: { rank: number; tiles: Set<number> }[] = [];
  for (const [word, tiles] of traced) {
    if (!roomAccepts(p, word)) continue;
    accepted.push({ rank: rankOf(word), tiles });
  }
  return { puzzle: p, n, traceable: traced.size, accepted };
}

interface BoardReading {
  barren: number[];
  worst: number;
  served: number[];
  practical: number;
}

function readScan(scan: BoardScan, cut: number): BoardReading {
  const { n } = scan;
  const served = new Array<number>(n * n).fill(0);
  let practical = 0;
  for (const w of scan.accepted) {
    if (w.rank > cut) continue;
    practical += 1;
    for (const t of w.tiles) served[t]! += 1;
  }
  const barren: number[] = [];
  for (let i = 0; i < n * n; i++) if (served[i]! < BARREN_MIN_WORDS) barren.push(i);
  return { barren, worst: barrenClusterSizes(barren, n)[0] ?? 0, served, practical };
}

async function scanPool(pool: TwistlePuzzle[]): Promise<BoardScan[]> {
  const out: BoardScan[] = [];
  for (const p of pool) {
    out.push(scanBoard(p));
    await breathe();
  }
  return out;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Mean largest barren cluster per tier, at one line. */
function meanWorstByTier(scans: BoardScan[], cut: number): Map<number, number> {
  const byTier = new Map<number, number[]>();
  for (const s of scans) {
    const list = byTier.get(s.puzzle.tier!) ?? [];
    list.push(readScan(s, cut).worst);
    byTier.set(s.puzzle.tier!, list);
  }
  return new Map([...byTier].map(([t, ws]) => [t, mean(ws)]));
}

describe('the Gallery ships no wall of barren ground', () => {
  it('agrees with the generator on the frequency line, and asserts it rather than assuming it', () => {
    // The one thing this gate SHARES on purpose. If the two lines ever drift,
    // the sentence in this file's header becomes a lie, so it is checked.
    const derived = (JSON.parse(readFileSync('content/data/dictionary.json', 'utf8')) as [string, number][])
      .filter(([, r]) => r > 0);
    let checked = 0;
    for (const [w, r] of derived) {
      if (checked >= 20_000) break;
      expect(rankOf(w), `${w}: dictionary.json rank vs raw count_1w line`).toBe(r);
      checked += 1;
    }
    expect(checked).toBe(20_000);
  });

  it('measures how little of the verdict is NOT the generator’s own list (surplus 2.2%)', async () => {
    // Round 43 published this as independence. It is half of one. The walk must
    // find every word the room accepts (or the room accepts words nobody can
    // trace) and it must find MORE — but every one of those extras is then
    // thrown away by `roomAccepts`, so the surplus proves the ENUMERATOR is
    // independent and proves nothing about the VERDICT. Both halves are
    // measured here so the header's claim can be read off a number.
    let missing = 0;
    let extra = 0;
    let accepted = 0;
    for (const p of POOL) {
      const traced = new Set(enumerateBoard(p).keys());
      for (const w of [...p.targetWords, ...(p.extraWords ?? [])]) if (!traced.has(w)) missing += 1;
      for (const w of traced) {
        if (roomAccepts(p, w)) accepted += 1;
        else extra += 1;
      }
      await breathe();
    }
    expect(missing, 'accepted words this gate could not trace').toBe(0);
    expect(extra, 'traceable dictionary words the room refuses — must not be zero').toBeGreaterThan(0);
    /*
     * AND THE SIZE OF THE SURPLUS, WHICH IS THE POINT. Round 43 read `extra > 0`
     * as independence. Measured, the surplus is **2.2%** — the enumerator traces
     * 1.022 words for every one the verdict uses, because `extraWords` is
     * already every ENABLE word the grid can spell that survives the blocklist
     * and the Norvig join. So the claim was true and materially empty: 97.8% of
     * what decides this gate is the generator's own list. Printed every run, and
     * bounded so that nobody can restore the old reading of it: if this surplus
     * ever grew past a tenth, `extraWords` would have started leaving traceable
     * words off the boards and the ACCEPT-LIST would be the bug — which is round
     * 38's defect exactly, and the reason this file exists in the shape it does.
     */
    console.log(`  enumerator traces ${(1 + extra / accepted).toFixed(3)}× the words the verdict uses`
      + ` (surplus ${(100 * extra / accepted).toFixed(1)}%)`);
    expect(extra / accepted, 'traced-but-refused share of the verdict set').toBeLessThan(0.1);
  }, HEAVY_MS);

  it('has no board with a barren run longer than the ceiling', async () => {
    const scans = await scanPool(POOL);
    const offenders: string[] = [];
    const byTier = new Map<number, BoardReading[]>();
    for (const s of scans) {
      const reading = readScan(s, KNOWN_RANK);
      if (reading.worst > MAX_BARREN_CLUSTER) {
        offenders.push(`${s.puzzle.id}: a wall of ${reading.worst} king-adjacent tiles, each serving under ${BARREN_MIN_WORDS} findable-in-practice words`);
      }
      const list = byTier.get(s.puzzle.tier!) ?? [];
      list.push(reading);
      byTier.set(s.puzzle.tier!, list);
    }
    for (const [tier, rs] of [...byTier].sort((a, b) => a[0] - b[0])) {
      // Printed every run so a regression is legible before it is red.
      console.log(`  tier ${tier}: barren tiles median ${median(rs.map((r) => r.barren.length))}`
        + `, largest wall median ${median(rs.map((r) => r.worst))} max ${Math.max(...rs.map((r) => r.worst))}`
        + `, findable-in-practice words median ${median(rs.map((r) => r.practical))}`
        + `, median tile serves ${median(rs.map((r) => median(r.served)))}`);
    }
    expect(offenders.join('\n')).toBe('');
  }, HEAVY_MS);

  it('goes RED on the WHOLE pool it was written to condemn, board for board', async () => {
    // The proof, run over the population rather than over one hand-copied board.
    // Frozen fixture ⇒ frozen expectations: every figure below is exact, so a
    // change to this file's own reading shows up here as a broken gate rather
    // than as a quietly different verdict on the pool it is supposed to police.
    const scans = await scanPool(CONDEMNED);
    expect(scans.length).toBe(210);
    const worstByTier = new Map<number, number[]>();
    for (const s of scans) {
      const list = worstByTier.get(s.puzzle.tier!) ?? [];
      list.push(readScan(s, KNOWN_RANK).worst);
      worstByTier.set(s.puzzle.tier!, list);
    }
    const over = (t: number) => worstByTier.get(t)!.filter((w) => w > MAX_BARREN_CLUSTER).length;
    const worst = (t: number) => Math.max(...worstByTier.get(t)!);
    expect([over(1), over(2), over(3)], 'boards over the ceiling, by tier').toEqual([13, 30, 60]);
    expect(over(1) + over(2) + over(3), 'offending boards in the condemned pool').toBe(103);
    expect([worst(1), worst(2), worst(3)], 'worst wall in each tier').toEqual([6, 9, 15]);
    // …and the shipped pool's own worst wall is the ceiling itself, which is
    // what a RULING enforced by rejection sampling looks like. It is stated
    // here, beside the population it replaced, so nobody reads the flush fit as
    // a margin: a wall of 3 is refused at generation, so 2 is the maximum a
    // conforming pool can have. See the header — the ceiling is the owner's
    // sentence, not a tuned statistic, and headroom on it would mean shipping
    // boards he asked for.
    const shipped = await scanPool(POOL);
    expect(Math.max(...shipped.map((s) => readScan(s, KNOWN_RANK).worst))).toBe(MAX_BARREN_CLUSTER);
  }, HEAVY_MS);

  it('is better GROUND, not a pool tuned at 20,000 — the line moved TIGHTER', async () => {
    /*
     * The direction that can disagree. Halving the line removes words, so
     * clusters can only grow; a pool that bought its cleanliness at 20,000 by
     * threading rank-19,000 words through its corners would come out no better
     * than the pool it replaced. That is the failure this asserts against, and
     * it is the plausible one — it is what a lazy fix to this exact complaint
     * looks like.
     *
     * The assertion is the DIRECTION at every tier. The magnitudes are printed
     * and published in the header, and are deliberately NOT bounded: they are
     * properties of two frozen artifacts, and a bound read off them would be
     * the ceil(measured) habit that a verifier has just caught five times.
     */
    const shipped = await scanPool(POOL);
    const condemned = await scanPool(CONDEMNED);
    const now = meanWorstByTier(shipped, TIGHT_RANK);
    const before = meanWorstByTier(condemned, TIGHT_RANK);
    for (const tier of [1, 2, 3]) {
      console.log(`  tier ${tier} @ rank ≤ ${TIGHT_RANK}: mean worst wall `
        + `${before.get(tier)!.toFixed(3)} → ${now.get(tier)!.toFixed(3)}`);
      expect(now.get(tier)!, `tier ${tier} mean worst wall at rank ≤ ${TIGHT_RANK}`)
        .toBeLessThan(before.get(tier)!);
    }
    // THE DEBT, PUBLISHED RATHER THAN IMPLIED. The fix holds at and above the
    // design's line and does not hold below it. This asserts the debt is real
    // (so nobody deletes the sentence as stale) and prints its size.
    const overAtTight = shipped.filter((s) => readScan(s, TIGHT_RANK).worst > MAX_BARREN_CLUSTER).length;
    console.log(`  DEBT: at rank ≤ ${TIGHT_RANK} the shipped pool still has ${overAtTight}/210 boards `
      + `over the ceiling, worst wall ${Math.max(...shipped.map((s) => readScan(s, TIGHT_RANK).worst))}`);
    expect(overAtTight).toBeGreaterThan(0);
  }, HEAVY_MS);

  it('reads the same board consistently as the line widens — an INSTRUMENT check, not a pool check', async () => {
    // Round 43 shipped this as "the finding survives moving the line". It does
    // not survive anything: a wider vocabulary can only ADD findable words, so
    // `worst(60k) ≤ worst(20k)` holds for every board by monotonicity and the
    // old comment reasoned it out in full before asserting it. Kept, relabelled:
    // it is a self-check on `readScan`, which would catch a reading that
    // miscounts coverage or clusters. It is evidence about this file, not about
    // the Gallery.
    const scans = await scanPool(POOL);
    for (const s of scans) {
      const tight = readScan(s, KNOWN_RANK);
      const wide = readScan(s, WIDER_RANK);
      expect(wide.practical, `${s.puzzle.id}: widening the line lost words`)
        .toBeGreaterThanOrEqual(tight.practical);
      expect(wide.worst, `${s.puzzle.id}: widening the line grew a wall`)
        .toBeLessThanOrEqual(tight.worst);
    }
  }, HEAVY_MS);
});
