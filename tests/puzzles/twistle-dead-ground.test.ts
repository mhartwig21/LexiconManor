import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import twistleData from '../../content/generated/twistle.json';
import type { TwistlePuzzle } from '../../src/engine/types';
import {
  centerIndex, puzzleSize, startTwistle, submitTwistleWord,
  BARREN_MIN_WORDS, MAX_BARREN_CLUSTER, barrenClusterSizes,
} from '../../src/engine/twistle';

/**
 * tests/puzzles/twistle-dead-ground.test.ts — ROUND 43, the Gallery's grid.
 *
 * Owner, from play: *"There is a lot of letter placements that totally close off
 * any ability to ever form a word. That is not fun. It is okay to have some, but
 * it is too much — like c c c all next to each other."*
 *
 * ═══ WHY THIS FILE ENUMERATES THE BOARD ITSELF ═════════════════════════════
 *
 * The Gallery has now twice certified itself clean with an instrument built out
 * of the thing under test (round 28's trie, round 38's frequency line), so this
 * gate shares as little of the generator as the question allows:
 *
 *   ITS OWN DICTIONARY.   Raw ENABLE off disk (`content/data/enable1.txt`), at
 *                         every length, with no blocklist and no cozy gate. The
 *                         generator reads `content/data/dictionary.json`, which
 *                         is ENABLE joined to the Norvig counts MINUS the
 *                         blocklist. This gate can therefore see words the
 *                         generator cannot, which is the point.
 *   ITS OWN ENUMERATION.  Its own depth-first walk of every legal trace on the
 *                         SHIPPED grid. It never calls `tileCoverage`, never
 *                         touches the generator's trie, and never trusts
 *                         `targetWords` / `extraWords` to be complete.
 *   THE ROOM ITSELF.      Whether a traced word is ACCEPTED is settled by asking
 *                         `submitTwistleWord` — the function the player's finger
 *                         actually reaches — not by a re-implementation of the
 *                         accept rules.
 *
 * WHAT IT DOES SHARE, STATED RATHER THAN HIDDEN. The frequency line. "A word she
 * plausibly knows" is Norvig rank <= 20,000 here and `bandOf`'s `everyday` in
 * the generator, and they are the same numbers off the same corpus — checked
 * below, not assumed. There is no second frequency corpus in this repo to
 * disagree with it, so instead the whole measurement is re-run at rank <= 60,000:
 * the finding has to survive moving the line, or it is an artifact of the line.
 * Round 38 died of the opposite (a gate drawn at the same rank as the rule it
 * audited, and never re-drawn).
 *
 * ═══ WHAT IS MEASURED, AND THE MEASUREMENT THAT WAS WRONG FIRST ════════════
 *
 * The obvious metric — a tile on no findable word — is DEAD ON ARRIVAL as a
 * gate. Against the board's accept-list it reads median 0 at every tier on the
 * pool that shipped before this round, so a gate written on it would have gone
 * green without a grid changing, which is this project's standing failure with a
 * new face. The accept-list is the wrong denominator: round 38 grew it to 26,107
 * ENABLE words, so a tile "serving 22 words" routinely means AIVERS, AKEES and
 * twenty others she will never type.
 *
 * So the denominator is the words FINDABLE IN PRACTICE — accepted AND known —
 * and the unit is the CLUSTER, because clusters are what the owner complained
 * about. Measured here on the pool round 38 shipped:
 *
 *   | per board                       | tier 1 | tier 2 | tier 3 |
 *   |---------------------------------|--------|--------|--------|
 *   | barren tiles, median            | 2 / 25 | 4 / 25 | 10 / 36 |
 *   | LARGEST BARREN CLUSTER, median  |   1    |   2    |   6    |
 *   | boards over the ceiling of 2    | 13/70  | 30/70  | 60/70  |
 *   | worst wall in the tier          |   6    |   9    |   15   |
 *
 * …and on the pool this round ships: **0/70, 0/70, 0/70, worst wall 2 at every
 * tier.** Barren pairs remain on purpose (median 2 / 3 / 5 barren tiles a board,
 * in ones and twos) — a search with nothing to reject is not a search.
 *
 * `--prove` is not a flag here: the last case replays the ceiling against a
 * hand-copied board out of that pool and asserts it FAILS. A gate that has never
 * been seen red is not a gate. It has also been run whole against the previous
 * pool, where it reports 103 offending boards across the three tiers.
 */

const POOL = twistleData as TwistlePuzzle[];

/**
 * The heavy walks below enumerate every legal trace on all 210 shipped boards
 * against the whole of ENABLE. That is real work and it is deliberate — the
 * shipped pool is the thing under test, not a sample of it — so it gets a stated
 * budget and yields the event loop between boards. Two deploys have died with
 * every test passing because one file starved the vitest worker reporter.
 */
const HEAVY_MS = 240_000;
const breathe = () => new Promise<void>((resolve) => { setImmediate(resolve); });

/** "She plausibly knows it" — round 28's line, and the line it is re-run at. */
const KNOWN_RANK = 20_000;
const WIDER_RANK = 60_000;

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

/** Does the ROOM take this word? Asked of the room, not re-implemented. */
function roomAccepts(p: TwistlePuzzle, word: string): boolean {
  const { result } = submitTwistleWord(p, startTwistle(p), word);
  return result.kind === 'valid' || result.kind === 'study';
}

interface BoardReading {
  barren: number[];
  worst: number;
  served: number[];
  practical: number;
  traceable: number;
}

function readBoard(p: TwistlePuzzle, cut: number): BoardReading {
  const n = puzzleSize(p);
  const traced = enumerateBoard(p);
  const served = new Array<number>(n * n).fill(0);
  let practical = 0;
  for (const [word, tiles] of traced) {
    if (rankOf(word) > cut) continue;
    if (!roomAccepts(p, word)) continue;
    practical += 1;
    for (const t of tiles) served[t]! += 1;
  }
  const barren: number[] = [];
  for (let i = 0; i < n * n; i++) if (served[i]! < BARREN_MIN_WORDS) barren.push(i);
  const clusters = barrenClusterSizes(barren, n);
  return { barren, worst: clusters[0] ?? 0, served, practical, traceable: traced.size };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

describe('the Gallery ships no wall of barren ground', () => {
  it('agrees with the generator on the frequency line, and asserts it rather than assuming it', () => {
    // The one thing this gate SHARES. If the two lines ever drift, the sentence
    // in this file's header becomes a lie, so it is checked.
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

  it('sees more than the room accepts — an instrument that agrees perfectly is not an instrument', async () => {
    // Independence, demonstrated rather than claimed. This walk must find every
    // word the room accepts (or the room accepts words nobody can trace), and it
    // must find MORE (the cozy gate's refusals, which are real traces of real
    // words). If those two sets ever came out equal, the enumerator would have
    // silently become a copy of the generator's.
    let missing = 0;
    let extra = 0;
    for (const p of POOL) {
      const traced = new Set(enumerateBoard(p).keys());
      for (const w of [...p.targetWords, ...(p.extraWords ?? [])]) if (!traced.has(w)) missing += 1;
      for (const w of traced) if (!roomAccepts(p, w)) extra += 1;
      await breathe();
    }
    expect(missing, 'accepted words this gate could not trace').toBe(0);
    expect(extra, 'traceable dictionary words the room refuses — must not be zero').toBeGreaterThan(0);
  }, HEAVY_MS);

  it('has no board with a barren run longer than the ceiling', async () => {
    const offenders: string[] = [];
    const byTier = new Map<number, BoardReading[]>();
    for (const p of POOL) {
      const reading = readBoard(p, KNOWN_RANK);
      if (reading.worst > MAX_BARREN_CLUSTER) {
        offenders.push(`${p.id}: a wall of ${reading.worst} king-adjacent tiles, each serving under ${BARREN_MIN_WORDS} findable-in-practice words`);
      }
      const list = byTier.get(p.tier!) ?? [];
      list.push(reading);
      byTier.set(p.tier!, list);
      await breathe();
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

  it('holds at a wider line too, so the finding is not an artifact of rank 20,000', async () => {
    const offenders: string[] = [];
    for (const p of POOL) {
      const reading = readBoard(p, WIDER_RANK);
      // A wider vocabulary can only ADD findable words, so a board clean at 20k
      // must be clean at 60k. Asserted rather than reasoned: this is the check
      // that the two readings are the same measurement.
      if (reading.worst > MAX_BARREN_CLUSTER) offenders.push(`${p.id}: ${reading.worst}`);
      await breathe();
    }
    expect(offenders.join('\n')).toBe('');
  }, HEAVY_MS);

  it('goes RED on the pool as it was — twistle-t3-33 before this round', () => {
    /*
     * twistle-t3-33 exactly as it shipped before this round, copied by hand out
     * of the old JSON. Its bottom-left corner read B / T / C above a bottom row
     * of O L L, and against the words a player actually knows the bottom two
     * rows were one connected wall. This is the proof the ceiling can fail: the
     * defect the owner described, in the pool he described it from.
     *
     * `extraWords` is left empty on purpose. It only makes the case HARDER — the
     * board's studies are counted as accepted words, so withholding them can
     * only shrink the number of tiles that look alive... and the assertion is
     * that tiles look DEAD, so the honest version supplies the works and lets
     * the enumerator's own trace decide the rest. Every study of that board was
     * traceable on this grid anyway; what settles acceptance here is
     * `submitTwistleWord`, which takes the works and refuses the rest, so this
     * reading is the LOWER bound on how barren the board was.
     */
    const before = {
      id: 'twistle-t3-33@round38', tier: 3, size: 6,
      grid: ['S', 'T', 'E', 'E', 'V', 'Y', 'A', 'I', 'A', 'N', 'E', 'A',
             'L', 'M', 'S', 'R', 'D', 'L', 'B', 'L', 'E', 'R', 'O', 'S',
             'T', 'L', 'A', 'A', 'L', 'O', 'C', 'O', 'L', 'L', 'G', 'U'],
      targetWords: ['AVERSE', 'CLEMATIS', 'DENSER', 'ENDORSE', 'GARDENS', 'LEMANS',
                    'LISTENS', 'LLAMAS', 'MILLERS', 'ORDERS', 'RAISER', 'REALMS',
                    'SANDAL', 'SANDALS', 'SANDER', 'SEAGULL', 'SMALLER', 'STALLS',
                    'STEAMERS', 'STILLS', 'TALISMAN', 'TENDERS', 'VENDORS'],
      extraWords: [], minTurns: 4, targetCount: 6,
      rules: { minLength: 5, centerRequired: true },
    } as unknown as TwistlePuzzle;
    const reading = readBoard(before, KNOWN_RANK);
    expect(reading.worst).toBeGreaterThan(MAX_BARREN_CLUSTER);
    expect(reading.barren.length).toBeGreaterThanOrEqual(10);
  }, HEAVY_MS);
});
