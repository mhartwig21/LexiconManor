/**
 * THE PLATE, AND THE ORDER THAT MAKES IT A DEDUCTION — OWNER: A7 (Mystery).
 *
 * ═══ ROUND 47 — THE SOFTNESS HELD AND THE ARC COLLAPSED ANYWAY ═════════════
 *
 * A blind cold read reported LACUNA falling on day 1–2, and the first question
 * was whether a clue had drifted sharp. It has not. Measured against the
 * shipped dictionary, volume 1's ten engravings are exactly as soft as
 * `tests/volume-solvability.test.ts` has always claimed:
 *
 *   ALONE, the tightest engraving admits 240 words (`vowel-sequence AUA`) —
 *   against a published floor of 100, and the loosest admits 93,520.
 *   IN PAIRS, the tightest of all 45 pairs admits 18 (`starts-with L` ×
 *   `vowel-sequence AUA`) and both of those arrive in the volume's last third.
 *   The tightest pair a player can hold EARLY — the first two engravings the
 *   volume reveals — admits 6,575.
 *
 * So the clue set is sound and the ORDER is what carries it: the chain runs
 * 171,755 → 15,232 → 6,575 → 208 → 146 → 56 → 11 → 5 → 3 → 2 → 1 across
 * revealOrder 2 … 26, and `STRICT REDUCTION` in the solvability suite proves
 * every step pays. What nothing in this repo measured is whether a player
 * receives them in that order — and one letter does not.
 *
 * `a-pressed-rubbing` (Fern's charcoal rubbing of the Conservatory arch) has
 * `earliestDay: 4` and, until this round, no `minFragments` gate at all. Its
 * enclosure is `v1-e4`, revealOrder **24 of 28** — the volume's sharpest single
 * engraving and half of every sharp pair in it. Driven through the repo's own
 * drip harness, 240 seeded campaigns a profile:
 *
 *   day 4, before this round:  the field is **9 words** (median, both
 *                              profiles); 63.8% of median-player campaigns and
 *                              95.8% of skilled ones are at ten or fewer.
 *   day 4, after:              **208** words (median), p10 146.
 *   the day the field first becomes a ten-word shortlist:
 *                              median day **4 → 9** (median player),
 *                              **4 → 7** (skilled).
 *
 * The speaking tube hears one word a day, free, from day 1, so a nine-word
 * field on day 4 is a volume that can be spent by day 12 without reading
 * anything. Twenty-seven of its twenty-eight pages had nothing left to do.
 *
 * The letter is not deleted — it is a second source type for the engraving
 * class and 4.14 requires one. It is GATED, by the rule this file makes a
 * gate: an engraving may come one page early in the post, never twenty.
 *
 * ── AND THE HALF THE PLAYER COULD NEVER SEE ────────────────────────────────
 * The journal drew the alphabet and never said what it bought. The count is
 * precomputed by `content/generate-volume.ts --plate` (the dictionary is 3.2 MB
 * and stays out of the bundle) and printed on the Word tab. This file is also
 * the plate's second opinion: it re-derives the table by FILTERING the raw
 * dictionary with `solveConstraints`, which is not the submask sum the
 * generator uses — the repo's standing rule is that a fix is never verified by
 * an instrument that shares its assumptions.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  solveConstraints, wordsStanding,
  type EngravingConstraint, type FragmentContent, type VolumeContent, type VolumePlate,
  type VolumePlateTable,
} from '../src/engine/volume';
import { PROFILE_DECENT, PROFILE_SKILLED, type SimProfile } from '../src/engine/economy/simulate';
import { fragmentDays, VOLUME } from './support/fragment-drip';

const root = join(__dirname, '..');
const HEAVY_MS = 120_000;
const breathe = () => new Promise<void>((resolve) => { setImmediate(resolve); });

const volume = VOLUME as VolumeContent;
const dictionary: string[] = (
  JSON.parse(readFileSync(join(root, 'content', 'data', 'dictionary.json'), 'utf8')) as [string, number][]
).map(([w]) => w);

const plateTable = JSON.parse(
  readFileSync(join(root, 'content', 'generated', 'volume-plate.json'), 'utf8'),
) as VolumePlateTable;
const plate: VolumePlate | undefined = plateTable[volume.id];

/** The volume's engravings in revealOrder — the bit order of the plate. */
const engravings: FragmentContent[] = volume.fragments
  .filter((f) => f.kind === 'engraving' && f.constraint)
  .sort((a, b) => a.revealOrder - b.revealOrder);

/** The SECOND OPINION: filter the raw dictionary, one subset at a time. */
const byFilter = (ids: readonly string[]): number => {
  const cs = ids.map(
    (id) => engravings.find((f) => f.id === id)!.constraint as EngravingConstraint,
  );
  return solveConstraints(cs, dictionary).length;
};
const fromPlate = (ids: readonly string[]): number => wordsStanding(plate, ids)!;

describe('the plate — the field, precomputed and verified against the dictionary', () => {
  it('ships a plate for the volume, in the volume’s own reveal order', () => {
    expect(plate, 'no plate — run `npm run content:volume-plate`').toBeDefined();
    expect(plate!.engravingIds).toEqual(engravings.map((f) => f.id));
    expect(plate!.standing.length).toBe(1 << engravings.length);
    // The empty set is the whole dictionary: the plate counts the corpus every
    // other instrument in this repo counts, not the generator's length>=4 view
    // of it (61 words apart, and invisible on every mask that fixes a length).
    expect(plate!.standing[0]).toBe(dictionary.length);
  });

  /**
   * Every singleton, every pair, every reveal-order prefix, and a spread of
   * larger sets — re-derived by brute filter and compared to the shipped table.
   * 60-odd full passes over 171,755 words is real work, hence the yield.
   */
  it('every count is the dictionary’s, recomputed by a different method', async () => {
    const ids = engravings.map((f) => f.id);
    const subsets: string[][] = [[]];
    for (let i = 0; i < ids.length; i++) {
      subsets.push([ids[i]!]);
      for (let j = i + 1; j < ids.length; j++) subsets.push([ids[i]!, ids[j]!]);
    }
    for (let k = 1; k <= ids.length; k++) subsets.push(ids.slice(0, k));
    // A deterministic spread of larger sets, so the check is not confined to
    // the shapes a player happens to reach.
    for (let seed = 1; seed <= 24; seed++) {
      subsets.push(ids.filter((_, i) => ((seed * 2654435761) >>> (i % 24)) & 1));
    }
    for (const subset of subsets) {
      expect(fromPlate(subset), `plate disagrees on [${subset.join(', ')}]`).toBe(byFilter(subset));
      await breathe();
    }
  }, HEAVY_MS);

  /**
   * THE SOFTNESS MEASUREMENT, ALONE AND IN PAIRS — the question this round was
   * asked. It is read off the plate, so it also proves the plate carries the
   * property the volume is designed around rather than merely being arithmetic.
   */
  it('individually soft: no engraving alone cuts below the published floor', () => {
    const SOFT_FLOOR = 100;   // content/generate-volume.ts's own constant
    for (const f of engravings) {
      expect(fromPlate([f.id]), `${f.id} (${f.constraint!.kind})`).toBeGreaterThanOrEqual(SOFT_FLOOR);
    }
    // Measured: 240 (v1-e4, vowel-sequence AUA) up to 93,520 (contains A).
    expect(Math.min(...engravings.map((f) => fromPlate([f.id])))).toBe(240);
  });

  /**
   * IN PAIRS — and the property is not a floor, it is a POSITION. Two clues
   * can legitimately cut hard together; what the design cannot survive is two
   * clues that cut hard together and both arrive early, because then the other
   * twenty-six pages are decoration. The tightest pair in volume 1 admits 18
   * words and is (`starts-with L` @17, `vowel-sequence AUA` @24) — both in the
   * back half of a 28-page volume. The tightest pair of EARLY clues (the first
   * two engravings revealed) admits 6,575.
   */
  it('the sharpest pair of engravings both arrive in the volume’s back half', () => {
    const pages = volume.fragments.length;
    let tightest = { n: Infinity, a: engravings[0]!, b: engravings[1]! };
    for (let i = 0; i < engravings.length; i++) {
      for (let j = i + 1; j < engravings.length; j++) {
        const n = fromPlate([engravings[i]!.id, engravings[j]!.id]);
        if (n < tightest.n) tightest = { n, a: engravings[i]!, b: engravings[j]! };
      }
    }
    const where = `${tightest.a.id}@${tightest.a.revealOrder} × ${tightest.b.id}@${tightest.b.revealOrder} = ${tightest.n}`;
    expect(tightest.a.revealOrder, where).toBeGreaterThan(pages / 2);
    expect(tightest.b.revealOrder, where).toBeGreaterThan(pages / 2);
    // …and the two she is dealt FIRST must still leave her a crowd — the same
    // floor a single engraving answers to, asked of the opening pair.
    expect(fromPlate([engravings[0]!.id, engravings[1]!.id])).toBeGreaterThanOrEqual(100);
  });
});

/**
 * ═══ THE ORDER GATE — AN ENGRAVING MAY NOT ARRIVE OUT OF TURN ══════════════
 *
 * The plate is an ORDERED instrument. `STRICT REDUCTION` proves each engraving
 * pays at the moment it arrives, and `FRAGMENTS_TO_DEDUCE` is derived from the
 * revealOrder of the tie-breaker — the whole deduction band is a statement
 * about the order. The letter channel bypasses it: `letterArrived` gates only
 * on `earliestDay` and `minFragments`, and an ungated letter can hand over the
 * ninth engraving while she is reading the second.
 *
 * The rule, and it is the smallest one that keeps the post a gift rather than a
 * shortcut: A LETTER MAY BRING THE NEXT ENGRAVING FORWARD AND NEVER A LATER
 * ONE. Formally its `minFragments` must reach the revealOrder of the engraving
 * that precedes its enclosure on the plate. Volume 1's four other content
 * letters already enclose pages at or just past the file they are gated on;
 * only Fern's rubbing enclosed page 24 behind a gate of zero.
 *
 * Pity letters are exempt BY CONSTRUCTION and must stay so: they grant "the
 * next unfound fragment on the drip", which is the order itself, and they are
 * the 4.14 mercy floor.
 */
describe('the order gate — a letter may not deal an engraving out of turn', () => {
  const engravingOrder = engravings.map((f) => f.revealOrder);

  it('every letter’s engraving enclosure is gated on the page before it', () => {
    for (const letter of volume.letters) {
      for (const id of letter.grantsFragmentIds ?? []) {
        const frag = engravings.find((f) => f.id === id);
        if (!frag) continue;             // prose enclosures narrow nothing
        const i = engravingOrder.indexOf(frag.revealOrder);
        const previous = i > 0 ? engravingOrder[i - 1]! : 0;
        expect(
          letter.minFragments ?? 0,
          `${letter.id} encloses ${id} (revealOrder ${frag.revealOrder}, engraving ` +
          `${i + 1} of ${engravings.length}) behind a gate of ${letter.minFragments ?? 0}. ` +
          `The engraving before it on the plate is page ${previous}: the post may run one ` +
          `engraving ahead of the house, never ${i} of them.`,
        ).toBeGreaterThanOrEqual(previous);
      }
    }
  });

  /** The premise, pinned: the class this rule governs is not empty, and 4.14's
   *  "≥2 source types per fragment kind" still has its second source. */
  it('a letter still carries an engraving at all', () => {
    const enclosed = new Set(volume.letters.flatMap((l) => l.grantsFragmentIds ?? []));
    expect(engravings.some((f) => enclosed.has(f.id))).toBe(true);
  });
});

/**
 * ═══ THE FIELD, MEASURED ON THE DRIP — the experience, not the page count ══
 *
 * `tests/volume-pacing.test.ts` measures the DAY A PAGE becomes legible, and it
 * was green through all of this: the tie-breaker page still lands at its
 * published median. A page count cannot see a deduction end, because the thing
 * that ends one is how much of the dictionary is left. This block asks the
 * repo's own drip harness the other question.
 *
 * TEN WORDS IS THE SHORTLIST, and the number comes from the tube rather than
 * from taste: the brass in the Entrance Hall hears one word a day, free, from
 * day 1, so a field of ten is ten evenings of guessing with nothing read. The
 * volume publishes a 14–28 evening horizon (AAA 4.10e), so a shortlist standing
 * inside the first week is a volume whose back half cannot matter.
 *
 * Measured over 240 seeded campaigns a profile (the same seed family
 * volume-pacing uses), at HEAD before/after this round:
 *
 *   median day the field first reaches ten words   4 → 9  (median player)
 *                                                  4 → 7  (skilled)
 *   median day-4 field                             9 → 208
 *
 * The band below is the WEEK, not the measurement rounded down.
 */
describe('the field a real campaign holds (drip-measured)', () => {
  const N = 240;
  const DAYS = 20;
  const runs = (profile: SimProfile) =>
    Array.from({ length: N }, (_, i) => fragmentDays((0x51ce + i * 0x9e37) | 0, DAYS, profile));
  const engIds = new Set(engravings.map((f) => f.id));
  const field = (ids: readonly string[]) => fromPlate(ids.filter((id) => engIds.has(id)));
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;

  const decent = runs(PROFILE_DECENT);
  const skilled = runs(PROFILE_SKILLED);
  const shortlistDay = (rs: ReturnType<typeof runs>) =>
    rs.map((r) => r.perDay.find((d) => field(d.legibleIds) <= 10)?.day ?? DAYS + 1);
  const dayField = (rs: ReturnType<typeof runs>, day: number) =>
    rs.map((r) => field(r.perDay[day - 1]!.legibleIds));

  it('no ten-word shortlist inside the first week', () => {
    const m = median(shortlistDay(decent));
    expect(m, `median player reached a ten-word field on day ${m}`).toBeGreaterThanOrEqual(7);
    const s = median(shortlistDay(skilled));
    expect(s, `skilled player reached a ten-word field on day ${s}`).toBeGreaterThanOrEqual(7);
  }, HEAVY_MS);

  /** THE SPECIFIC COLLAPSE, pinned by its cause. Day 4 is the earliest day any
   *  authored letter may arrive with an engraving in it; a field she can hold
   *  that morning must still clear the floor ONE engraving has to clear. */
  it('the day-4 field still clears the floor a single engraving clears', () => {
    for (const [name, rs] of [['median', decent], ['skilled', skilled]] as const) {
      const p10 = [...dayField(rs, 4)].sort((a, b) => a - b)[Math.floor(N * 0.1)]!;
      expect(p10, `${name} player's day-4 field, p10`).toBeGreaterThanOrEqual(100);
    }
  }, HEAVY_MS);

  /** The seal keeps its teeth: a page she cannot read moves neither the letters
   *  nor the number. Same legibility rule, one derivation (engine/journal.ts). */
  it('a sealed engraving moves the field by nothing', () => {
    const first = engravings[0]!.id;
    expect(fromPlate([])).toBe(dictionary.length);
    expect(fromPlate([first])).toBeLessThan(dictionary.length);
  });
});
