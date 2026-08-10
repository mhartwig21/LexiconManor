import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FINISH_MIN,
  LATERAL_BANDS,
  LETTER_MECHANIC_FAMILIES,
  MIN_LADDER_RISE,
  SLOTS,
  WAY_IN_MAX,
  canonTheme,
  chooseColours,
  familySignature,
  familyOfTheme,
  intrinsicLateral,
  isWayIn,
  ladderProblems,
  lateralOf,
  templateOf,
  type CensusBoard,
  type CensusFamily,
} from '../../content/lib/wordweb-ladder';
import { familyOf } from '../../content/generate-wordweb';

/**
 * THE COLOUR LADDER MEANS SOMETHING — REVIEW_AA §5.8.
 *
 * The review's second charge against the Library was three words long:
 * *"the difficulty colours are decorative."* It was true, and the measurement
 * that proved it is reproducible from `scripts/wordweb-mechanics.ts`. On the
 * round-12 shelf of 156 boards:
 *
 *   - yellow's mean lateral distance was 4.38 and green's was 4.15 — the
 *     second band was, on average, EASIER than the first;
 *   - the spread from yellow to purple was 0.33 points on a nine-point scale;
 *   - 196 individual groups wore a colour that inverted the group before it;
 *   - and 140 of the 156 boards (89.7%) failed at least one of the three
 *     checks below.
 *
 * Connections' yellow→purple ladder is a promise about how much lateral
 * thinking a group demands, and the reveal is the moment the board pays that
 * promise off. Ours made no promise at all, so the reveal was noise.
 *
 * This file is the test the brief asked for: it fails if a board's colours do
 * not match its measured difficulty. It reads only the SHIPPED pool and
 * re-derives every number from `content/lib/wordweb-ladder.ts`, so it is a
 * genuine audit of the artifact rather than a re-run of the generator — a
 * hand-edited word-web.json fails here exactly as a generator regression would.
 */

const POOL = JSON.parse(
  readFileSync(join(process.cwd(), 'content', 'generated', 'word-web.json'), 'utf8'),
) as CensusBoard[];

describe('the Word Web colour ladder (REVIEW_AA §5.8)', () => {
  it('the pool is stocked', () => {
    expect(POOL.length).toBeGreaterThanOrEqual(150);
    for (const b of POOL) expect(b.groups, b.id).toHaveLength(4);
  });

  /**
   * THE HEADLINE ASSERTION. Three questions of every board's four colours:
   * is each group inside the band its colour promises, do the four run in
   * order, and does the board actually climb (purple − yellow ≥ 3)?
   */
  it('every board’s colours describe its own difficulty', () => {
    const problems = POOL.flatMap((b) => ladderProblems(b).map((p) => `${p.boardId}: ${p.detail}`));
    expect(problems, problems.slice(0, 10).join(' ; ')).toEqual([]);
  });

  it('the ladder climbs across the whole shelf, not only board by board', () => {
    const mean = (slot: (typeof SLOTS)[number]) => {
      const xs = POOL.map((b) => {
        const g = b.groups.find((x) => x.tier === slot)!;
        return lateralOf(g, new Set(b.ambiguousWords ?? [])).total;
      });
      return xs.reduce((a, x) => a + x, 0) / xs.length;
    };
    const [y, g, bl, p] = [mean('yellow'), mean('green'), mean('blue'), mean('purple')];
    // Strictly increasing means, in order. The round-12 shelf had g < y.
    expect(g, `green ${g.toFixed(2)} vs yellow ${y.toFixed(2)}`).toBeGreaterThan(y);
    expect(bl, `blue ${bl.toFixed(2)} vs green ${g.toFixed(2)}`).toBeGreaterThan(g);
    expect(p, `purple ${p.toFixed(2)} vs blue ${bl.toFixed(2)}`).toBeGreaterThan(bl);
    // …and the climb is a climb. Round 12 measured 0.33.
    expect(p - y, `pool-wide spread ${(p - y).toFixed(2)}`).toBeGreaterThanOrEqual(3);
  });

  /**
   * WHAT EACH COLOUR PROMISES, stated as the two floors a player can feel.
   * The middle two bands are deliberately wide (the model can honestly tell
   * "plain" from "operation" and cannot honestly rank the third-hardest
   * category against the second-hardest), so the ends carry the meaning.
   */
  it('every board has a way in — a category read, not decoded', () => {
    const bad = POOL.filter((b) => !b.groups.some(isWayIn))
      .map((b) => `${b.id}: ${b.groups.map((g) => g.theme).join(' | ')}`);
    expect(bad, bad.slice(0, 5).join(' ; ')).toEqual([]);
    // …and it is the one wearing yellow.
    for (const b of POOL) {
      const yellow = b.groups.find((g) => g.tier === 'yellow')!;
      expect(intrinsicLateral(yellow), `${b.id} yellow "${yellow.theme}"`)
        .toBeLessThanOrEqual(WAY_IN_MAX);
    }
  });

  it('every board has a finish — a category that demands a transformation', () => {
    for (const b of POOL) {
      const purple = b.groups.find((g) => g.tier === 'purple')!;
      const total = lateralOf(purple, new Set(b.ambiguousWords ?? [])).total;
      expect(total, `${b.id} purple "${purple.theme}"`).toBeGreaterThanOrEqual(FINISH_MIN);
    }
  });

  it('the trivia gimme is pinned to yellow, and there is at most one', () => {
    for (const b of POOL) {
      const trivia = b.groups.filter((g) => familyOfTheme(g.theme) === 'trivia');
      expect(trivia.length, b.id).toBeLessThanOrEqual(1);
      for (const g of trivia) expect(g.tier, `${b.id} "${g.theme}"`).toBe('yellow');
    }
  });

  /**
   * The colours are a FUNCTION of the board, so re-deriving them from the
   * shipped words and labels must reproduce exactly what shipped. This is what
   * makes the ladder auditable rather than merely asserted: if a future change
   * assigns colours anywhere other than `chooseColours`, this fails.
   */
  it('the shipped colours are reproducible from the shipped board', () => {
    const drift: string[] = [];
    for (const b of POOL) {
      const expected = chooseColours(b.groups, new Set(b.ambiguousWords ?? []));
      b.groups.forEach((g, i) => {
        if (g.tier !== expected[i]) drift.push(`${b.id} "${g.theme}" wears ${g.tier}, measures ${expected[i]}`);
      });
    }
    expect(drift, drift.slice(0, 6).join(' ; ')).toEqual([]);
  });

  it('the bands are the ones the spec documents', () => {
    expect(LATERAL_BANDS.yellow[1]).toBe(WAY_IN_MAX);
    expect(LATERAL_BANDS.purple[0]).toBe(FINISH_MIN);
    expect(MIN_LADDER_RISE).toBe(3);
  });
});

/**
 * THE MECHANIC CONCENTRATION — REVIEW_AA §5.8's first charge.
 *
 * *"67.3% of shipped groups are one of eleven mechanical templates"*, and
 * *"my first live board carried TWO 'Contains' groups (OWN and RAM) at
 * different difficulty bands"*. The classifier in
 * `scripts/wordweb-mechanics.ts` confirmed the 67.3% exactly. These are the
 * assertions that stop it coming back.
 */
describe('the Word Web mechanic concentration (REVIEW_AA §5.8)', () => {
  const letterMechanics = (b: CensusBoard) =>
    b.groups.filter((g) => LETTER_MECHANIC_FAMILIES.includes(familyOfTheme(g.theme)));

  /**
   * THE RULE THE REVIEW'S LIVE BOARD BROKE. A board may ask her to decode
   * once at the bottom of the house, twice in the middle and three times at
   * the top — and never twice in the same way. Two rhymes, or two substring
   * hunts, is one puzzle printed twice.
   */
  it('no board runs two groups of the same letter mechanic', () => {
    const twins: string[] = [];
    for (const b of POOL) {
      const fams = letterMechanics(b).map((g) => familyOfTheme(g.theme));
      if (new Set(fams).size !== fams.length) {
        twins.push(`${b.id}: ${letterMechanics(b).map((g) => g.theme).join(' | ')}`);
      }
    }
    expect(twins, twins.join(' ; ')).toEqual([]);
  });

  it('the per-board letter-mechanic cap holds at every tier', () => {
    const CAP: Record<number, number> = { 1: 1, 2: 2, 3: 3 };
    for (const b of POOL) {
      expect(letterMechanics(b).length, `${b.id} @t${b.tier}: ${letterMechanics(b).map((g) => g.theme).join(' | ')}`)
        .toBeLessThanOrEqual(CAP[b.tier] ?? 3);
    }
  });

  /**
   * The pool-wide figures. These are floors on the improvement, not on the
   * measurement — they are set a little looser than what shipped so that the
   * next fairness tightening fails on the rule it belongs to rather than here.
   * Measured round 13 against round 12: templated 61.6% (was 67.3%), letter
   * mechanics 46.4% (was 50.2%), boards running two or more 61.4% (was 75.0%).
   */
  it('the template concentration is below where the review found it', () => {
    const groups = POOL.flatMap((b) => b.groups);
    const templated = groups.filter((g) => templateOf(g.theme) !== 'other').length;
    expect(templated / groups.length, `${templated}/${groups.length} templated`)
      .toBeLessThan(0.65);

    const letters = groups.filter((g) => LETTER_MECHANIC_FAMILIES.includes(familyOfTheme(g.theme))).length;
    expect(letters / groups.length, `${letters}/${groups.length} letter mechanics`)
      .toBeLessThan(0.50);

    const two = POOL.filter((b) => letterMechanics(b).length >= 2).length;
    expect(two / POOL.length, `${two}/${POOL.length} boards run two or more`)
      .toBeLessThan(0.70);
  });

  it('no single letter mechanic is the trick on more than half the nights', () => {
    const tally = new Map<CensusFamily, number>();
    for (const b of POOL) {
      for (const f of new Set(b.groups.map((g) => familyOfTheme(g.theme)))) {
        if (LETTER_MECHANIC_FAMILIES.includes(f)) tally.set(f, (tally.get(f) ?? 0) + 1);
      }
    }
    const over = [...tally]
      .filter(([, n]) => n / POOL.length > 0.55)
      .map(([f, n]) => `${f} ${n}/${POOL.length}`);
    expect(over, over.join(' ; ')).toEqual([]);
    // …and the thin families are actually stocked, which is what stops the
    // composer falling back on the two fat ones. Round 12: anagram 4.5%,
    // homophone 5.8%, letter-shape 10.3%.
    for (const f of ['anagram', 'homophone', 'letter-shape'] as const) {
      expect((tally.get(f) ?? 0) / POOL.length, `${f} share`).toBeGreaterThanOrEqual(0.06);
    }
  });

  it('the six mechanics added this round are actually on the shelf', () => {
    const NEW = [
      'Words with All Five Vowels', 'Letters in Alphabetical Order',
      'Spelled Without a Vowel', 'Three Vowels in a Row',
      'The Same Letter Three Times', 'Made of a Repeated Syllable',
    ];
    const shipped = new Set(POOL.flatMap((b) => b.groups.map((g) => canonTheme(g.theme))));
    const missing = NEW.filter((t) => !shipped.has(t));
    expect(missing, missing.join(' ; ')).toEqual([]);
    // None of them is one of the eleven templates — that is the point of them.
    for (const t of NEW) expect(templateOf(t), t).toBe('other');
  });

  it('the shelf is many architectures, not one', () => {
    const tally = new Map<string, number>();
    for (const b of POOL) {
      const s = familySignature(b.groups);
      tally.set(s, (tally.get(s) ?? 0) + 1);
    }
    expect(tally.size).toBeGreaterThanOrEqual(40);
    const top = [...tally.values()].sort((a, b) => b - a)[0]!;
    expect(top / POOL.length).toBeLessThanOrEqual(0.20);
  });

  /**
   * The audit and the auditee must agree. `scripts/wordweb-mechanics.ts` reads
   * the shipped pool through `content/lib/wordweb-ladder.ts`; the generator
   * keeps its own `familyOf`, written independently and used to steer
   * composition. Two implementations of one taxonomy is a defect waiting to
   * happen — round 10 lost a whole fairness rule to a curly quotation mark —
   * so this pins them together over every label that actually ships.
   */
  it('the generator’s family taxonomy and the ladder’s agree on every shipped label', () => {
    const drift: string[] = [];
    for (const theme of new Set(POOL.flatMap((b) => b.groups.map((g) => g.theme)))) {
      const a = familyOf(theme) as string;
      const b = familyOfTheme(theme) as string;
      if (a !== b) drift.push(`"${theme}": generator says ${a}, ladder says ${b}`);
    }
    expect(drift, drift.slice(0, 6).join(' ; ')).toEqual([]);
  });
});
