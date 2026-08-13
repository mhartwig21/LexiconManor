import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import cipherData from '../../content/generated/cipher.json';
import preRound52 from './fixtures/cipher-round51.json';
import { decodeMap, type CipherPuzzle } from '../../src/engine/puzzles/cipher';

/**
 * ═══ ONE DEFENSIBLE ANSWER — THE DARKROOM'S FAIRNESS GATE (round 52) ═══════
 *
 * `docs/BENCHMARKS.md` §11 graded this room on how HARD it is for six rounds
 * and never once asked whether it is FAIR. It was not: **76.0% of the
 * round-51 pool admitted a second defensible reading.** A player who had
 * solved the whole of `A HOUSE THAT MOVES KEEPS SECRETS` could hand in
 * `A HOUSE THAT LOVES KEEPS SECRETS` — every word ordinary English, every
 * letter consistent — and be told she was wrong. She was not wrong; the
 * phrase never decided.
 *
 * THE REFERENCE NEVER HAS TO ASK. A newspaper cryptogram is unique because it
 * is 60–120 letters long: each plain letter recurs across several words, so a
 * substitution breaks one of them somewhere. Nobody constructing a Cryptoquote
 * checks uniqueness. This room is 16–41 letters — the length at which
 * uniqueness stops being free — and it had inherited the reference's silence
 * along with its format.
 *
 * ─── WHY THIS IS NOT THE OBVIOUS INSTRUMENT ────────────────────────────────
 * The obvious instrument is a real cryptogram solver: index a lexicon by
 * letter pattern and backtrack for every injective mapping under which EVERY
 * word reads. It was built while this gate was being designed and it says 15
 * of 121 boards are uniquely readable. It also says what the other 106 admit —
 * `A GARDEN BO A OILS ARGUMENT`, `A HOUSE THAT BOXES FEEDS SECRETS`. Nobody
 * hands those in. A cryptogram of ANY length is lexically ambiguous, the
 * reference included; what makes the reference unique is that only one reading
 * MEANS anything, and meaning is what a word list cannot see. So the maximal
 * instrument is refused here — it condemns everything, which is exactly as
 * useless as agreeing with everything.
 *
 * WHAT IS DANGEROUS IS THE READING AT DISTANCE ONE: she has solved the board,
 * every word reads, and one cipher letter is genuinely not decided by the
 * phrase. That is a place she actually arrives.
 *
 * ─── HOW THIS FILE AVOIDS AGREEING WITH THE THING IT AUDITS ────────────────
 * `content/generate-cipher.ts` decides the reveals from the PLAINTEXT and its
 * own corpus load. This file starts from the shipped CIPHERTEXT, recovers the
 * mapping through the runtime's own `decodeMap`, re-reads `enable1.txt` and
 * `count_1w.txt` from disk, and re-derives forcedness itself. It borrows no
 * function from the generator. It is then run whole against the frozen
 * round-51 pool, where it is red on 92 boards — a ruling gate can only be
 * shown to work by running it against a population it condemns.
 */

const POOL = cipherData as (CipherPuzzle & { tier: number })[];
/** The 121 boards as they shipped before this round, frozen. */
const CONDEMNED = preRound52 as unknown as (CipherPuzzle & { tier: number })[];

/**
 * "A word she would actually produce" — the *everyday* line
 * `content/lib/dictionary.ts` publishes and BENCHMARKS §8 already defends as
 * findable in practice. This room does not get a private threshold.
 */
const ORDINARY_RANK = 20_000;
/**
 * The direction that can DISAGREE with the pool. Rank is a threshold on the
 * RIVAL, so a WIDER line admits more rivals and can only make the gate
 * stricter — it is not the tautological direction, and the pool was never
 * tuned against it. Reported, not gated: a band here would be a number fitted
 * to whatever the authoring happened to yield.
 */
const WIDER_RANK = 60_000;

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const HEAVY_MS = 120_000;
const breathe = () => new Promise<void>((resolve) => { setImmediate(resolve); });

/**
 * Raw ENABLE and raw Norvig ranks, read here rather than through any
 * generator — and read ONCE for both lines. Two passes over a 333,333-line
 * corpus inside a worker is how a suite starves its own reporter (STATUS §3.6);
 * the second line costs a `Set.add` here, not a second parse.
 */
function loadOrdinary(): { at: Set<string>; wide: Set<string> } {
  const rank = new Map<string, number>();
  const counts = readFileSync('content/data/count_1w.txt', 'utf8').split('\n');
  for (let i = 0; i < counts.length; i++) {
    const w = counts[i]!.split('\t')[0]!.trim().toUpperCase();
    if (w.length > 0 && !rank.has(w)) rank.set(w, i + 1);
  }
  // ENABLE has no one-letter entries and English has exactly two.
  const at = new Set<string>(['A', 'I']);
  const wide = new Set<string>(['A', 'I']);
  for (const line of readFileSync('content/data/enable1.txt', 'utf8').split('\n')) {
    const w = line.trim().toUpperCase();
    if (w.length < 2 || !/^[A-Z]+$/.test(w)) continue;
    const r = rank.get(w) ?? Number.MAX_SAFE_INTEGER;
    if (r <= ORDINARY_RANK) at.add(w);
    if (r <= WIDER_RANK) wide.add(w);
  }
  return { at, wide };
}

const { at: ORDINARY, wide: ORDINARY_WIDE } = loadOrdinary();

/** The reading the shipped board actually decodes to, through the runtime. */
function readingOf(p: CipherPuzzle): { words: string[]; standing: Set<string> } {
  const truth = decodeMap(p);
  const words = p.ciphertext.split(' ').map((cw) => [...cw].map((c) => truth[c] ?? c).join(''));
  return { words, standing: new Set(p.reveals.map((c) => truth[c.toUpperCase()]!)) };
}

/**
 * Plain letters this board leaves undecided: not standing at the start, and
 * replaceable throughout by a letter the reading does not already use with
 * every word it touches still ordinary English. The target must be unused —
 * the room's one stated rule is that one letter stands for one letter.
 */
function undecided(p: CipherPuzzle, ordinary: Set<string>): string[] {
  const { words, standing } = readingOf(p);
  const present = [...new Set(words.join(''))];
  const unused = ALPHABET.filter((c) => !present.includes(c));
  return present.filter((from) => {
    if (standing.has(from)) return false;
    return unused.some((to) => {
      const alt = words.map((w) => w.replaceAll(from, to));
      return alt.every((w, i) => w === words[i] || ordinary.has(w));
    });
  });
}

/** Pairs whose values can be exchanged with every word still reading. */
function exchangeable(p: CipherPuzzle, ordinary: Set<string>): [string, string][] {
  const { words, standing } = readingOf(p);
  const present = [...new Set(words.join(''))].filter((c) => !standing.has(c));
  const out: [string, string][] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const a = present[i]!;
      const b = present[j]!;
      const alt = words.map((w) => [...w].map((c) => (c === a ? b : c === b ? a : c)).join(''));
      const touched = alt.filter((w, k) => w !== words[k]);
      if (touched.length > 0 && touched.every((w) => ordinary.has(w))) out.push([a, b]);
    }
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

describe('BENCHMARKS §11 — the Darkroom accepts exactly one defensible answer', () => {
  it('detects a rival reading on a board built to carry one (instrument check)', () => {
    // Nothing to do with the pool: a hand-built board whose `D` is free
    // (`A GOOD INDEX FORGIVES A BAD MEMORY` → `… A CAD MEMORY`, and BAD/LAD/
    // PAD/TAD besides), and the same board with that letter standing.
    const plain = 'A BAD DAY';
    const cipher = 'Z QZR RZE';   // A→Z, B→Q, D→R, Y→E
    const free = { id: 'probe-free', ciphertext: cipher, plaintext: plain, reveals: [] };
    const held = { ...free, id: 'probe-held', reveals: ['Q'] };   // Q decodes to B
    expect(undecided(free, ORDINARY)).toContain('B');
    expect(undecided(held, ORDINARY)).not.toContain('B');
    // …and a letter the phrase DOES force is never reported free: no ordinary
    // word is `A ?AD ?AY` for any single substitution of A.
    expect(undecided(free, ORDINARY)).not.toContain('A');
  });

  it('leaves no letter undecided on any shipped board, at any tier', async () => {
    const offenders: string[] = [];
    for (const p of POOL) {
      const free = undecided(p, ORDINARY);
      if (free.length > 0) offenders.push(`${p.id} [t${p.tier}] "${p.plaintext}" — ${free.join('')}`);
      await breathe();
    }
    expect(offenders, `${offenders.length} board(s) admit a second defensible reading:\n`
      + offenders.slice(0, 12).join('\n')).toEqual([]);
  }, HEAVY_MS);

  it('leaves no two letters exchangeable on any shipped board', async () => {
    const offenders: string[] = [];
    for (const p of POOL) {
      const swaps = exchangeable(p, ORDINARY);
      if (swaps.length > 0) {
        offenders.push(`${p.id} "${p.plaintext}" — ${swaps.map(([a, b]) => `${a}/${b}`).join(' ')}`);
      }
      await breathe();
    }
    expect(offenders, offenders.slice(0, 12).join('\n')).toEqual([]);
  }, HEAVY_MS);

  /**
   * THE HALF THAT MAKES THE OTHER TWO MEAN SOMETHING. Both assertions above
   * are satisfiable by construction — the generator refuses to emit a board
   * that fails them — so on their own they are a checksum. Run whole against
   * the pool this round condemned, the same instrument is red on 92 of 121
   * boards, and the counts are exact because the fixture is frozen.
   */
  it('is RED on the round-51 pool it was written to condemn', async () => {
    const byTier = new Map<number, number>([[1, 0], [2, 0], [3, 0]]);
    let boards = 0;
    let swapBoards = 0;
    for (const p of CONDEMNED) {
      if (undecided(p, ORDINARY).length > 0) {
        boards++;
        byTier.set(p.tier, byTier.get(p.tier)! + 1);
      }
      if (exchangeable(p, ORDINARY).length > 0) swapBoards++;
      await breathe();
    }
    expect(CONDEMNED.length).toBe(121);
    expect(boards, 'boards with a second defensible reading, round-51 pool').toBe(92);
    expect([...byTier.values()], 'by tier').toEqual([27, 37, 28]);
    expect(swapBoards, 'boards with an exchangeable pair, round-51 pool').toBe(13);
    // 76.0% — the headline in BENCHMARKS §11 and in STATUS.
    expect(Math.round((1000 * boards) / CONDEMNED.length) / 10).toBe(76.0);
  }, HEAVY_MS);

  /**
   * The wider line is the one that can disagree: rank bounds the RIVAL, so
   * admitting more words can only find more of them. The pool was authored
   * against 20,000 and never against 60,000, and it improves there too —
   * which is the evidence that the phrases were made forcing rather than
   * made to fit a threshold. Printed, deliberately not banded.
   */
  it('improves at a line it was never authored against, and prints the symptom', async () => {
    const wideNow = POOL.filter((p) => undecided(p, ORDINARY_WIDE).length > 0).length;
    const wideBefore = CONDEMNED.filter((p) => undecided(p, ORDINARY_WIDE).length > 0).length;
    const share = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;
    const hapax = (pool: typeof POOL, tier: number) => {
      const at = pool.filter((p) => p.tier === tier);
      return median(at.map((p) => {
        const { words, standing } = readingOf(p);
        const freq: Record<string, number> = {};
        for (const ch of words.join('')) freq[ch] = (freq[ch] ?? 0) + 1;
        return Object.keys(freq).filter((c) => freq[c] === 1 && !standing.has(c)).length;
      }));
    };
    console.log(`[cipher] rivals at rank ≤${WIDER_RANK}: ${share(wideBefore, CONDEMNED.length)}`
      + ` → ${share(wideNow, POOL.length)}`);
    console.log(`[cipher] median unrevealed single-appearance letters, t1/t2/t3: `
      + `${[1, 2, 3].map((t) => hapax(CONDEMNED, t)).join('/')}`
      + ` → ${[1, 2, 3].map((t) => hapax(POOL, t)).join('/')}`);
    // ═══ THE SYMPTOM IS NOT THE DISEASE, AND THIS IS WHY IT IS NOT GATED ═══
    // The complaint that opened this round was "the median board has 6
    // unrevealed letters appearing exactly once, and a letter appearing once
    // cannot be deduced from pattern". Counted against forcedness the second
    // half is mostly false: of the 711 such letters in the round-51 pool only
    // 157 (22.1%) were undecided — a single `S` in `SECRETS` is pinned by the
    // six letters around it. The implication runs the other way (90.2% of
    // undecided letters ARE hapax), and driving the COUNT down means longer
    // phrases, which MAX_LETTERS forbids for a glass reason the owner has
    // ruled on. A metric's name must match what it computes.
    expect(wideNow / POOL.length, `${share(wideNow, POOL.length)} at the wider line`)
      .toBeLessThan(wideBefore / CONDEMNED.length);
  }, HEAVY_MS);
});
