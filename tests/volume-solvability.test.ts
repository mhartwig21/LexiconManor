/**
 * The solvability proof — OWNER: A7 (Mystery).
 *
 * The Forgotten Word meta-mystery ships only if its engraved constraint set
 * is *individually soft but jointly sufficient*: each engraving alone admits
 * a crowd of dictionary words (no single fragment spoils the answer), while
 * all of them together admit exactly one word — the volume's answer.
 * Verified against the real shipped dictionary, not a fixture.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  constraintAdmits, solveConstraints, normalizeGuess,
  type EngravingConstraint, type VolumeContent,
} from '../src/engine/volume';

const volume = JSON.parse(
  readFileSync(join(__dirname, '..', 'content', 'authored', 'volumes', 'volume-1.json'), 'utf8'),
) as VolumeContent;

const dictionary: string[] = (
  JSON.parse(
    readFileSync(join(__dirname, '..', 'content', 'data', 'dictionary.json'), 'utf8'),
  ) as [string, number][]
).map(([w]) => w);

const engravings = volume.fragments.filter((f) => f.kind === 'engraving');
const constraints = engravings.map((f) => f.constraint!) as EngravingConstraint[];

/** Below this many admitted words a single engraving is a spoiler, not a clue. */
const SOFT_FLOOR = 100;

describe('volume-1 solvability (constraints admit exactly one dictionary answer)', () => {
  it('ships a real dictionary and a real constraint set', () => {
    expect(dictionary.length).toBeGreaterThan(100_000);
    expect(engravings.length).toBeGreaterThanOrEqual(4);
    for (const f of engravings) expect(f.constraint, f.id).toBeDefined();
  });

  it('the answer is a dictionary word', () => {
    expect(dictionary).toContain(volume.answer.toLowerCase());
  });

  it('jointly sufficient: the full engraving set admits exactly the answer', () => {
    const admitted = solveConstraints(constraints, dictionary);
    expect(admitted).toEqual([volume.answer.toLowerCase()]);
  });

  it(`individually soft: every single engraving admits ≥${SOFT_FLOOR} words`, () => {
    for (const f of engravings) {
      let admits = 0;
      for (const w of dictionary) if (constraintAdmits(f.constraint!, w)) admits++;
      expect(admits, `${f.id} (${f.constraint!.kind})`).toBeGreaterThanOrEqual(SOFT_FLOOR);
    }
  });

  /**
   * ═══ ROUND-10 BLOCKER: THE CLUE THAT SAID NOTHING ═══════════════════════
   *
   * Volume 1's fifth engraving — `one-letter-twice`, etched round the Study
   * inkstand — admitted EXACTLY the candidate pair the state before it already
   * admitted: {lacuna, laguna} → {lacuna, laguna}. Zero bits. A player who
   * climbed for it, solved for it, filed it and read Ellery's note on it
   * learned nothing whatsoever, and nothing in the build could tell — the
   * solvability suite only ever checked the constraint SET, which is
   * order-blind, and every engraving in the set is individually soft and
   * jointly sufficient whether or not any one of them does any work.
   *
   * The fix had to be positional, and there is only one place it could be.
   * The set narrows 171755 → 15232 → 298 → 22 → 2 → 2 → 1, so after the vowel
   * clue only two words remain and the sixth engraving (the hard C, cut into
   * the Sanctum door itself) is what separates them. Nothing inserted at
   * position five can both cut that pair and leave the sixth a job. So the
   * inkstand's doubling clue moved to where it does real work — revealOrder 11,
   * ahead of the vowels — and the chain now reads
   * 171755 → 15232 → 298 → 22 → **11** → 2 → 1.
   *
   * THE ASSERTION BELOW IS THE PART THAT MATTERS. "Individually soft, jointly
   * sufficient" is not enough of a contract: it passes happily for a clue that
   * is implied by the ones before it. A clue must also PAY — every engraving,
   * in the order the volume reveals them, has to leave the player with a
   * strictly smaller shortlist than she had a moment ago.
   *
   * (This is deliberately the ORDERED statement and not "every constraint is
   * load-bearing given the others". The set is over-determined on purpose —
   * the robustness case below requires exactly that, so that losing any one
   * engraving still leaves the volume winnable — and in an over-determined set
   * several constraints are individually redundant while every one of them
   * still narrows the field at the moment it arrives.)
   */
  it('STRICT REDUCTION: every engraving, in revealOrder, narrows the field', () => {
    const ordered = [...engravings].sort((a, b) => a.revealOrder - b.revealOrder);
    let pool = dictionary;
    const trace: string[] = [];
    for (const f of ordered) {
      const before = pool.length;
      pool = pool.filter((w) => constraintAdmits(f.constraint!, w));
      trace.push(`${f.id} (${f.constraint!.kind}): ${before} → ${pool.length}`);
      expect(
        pool.length,
        `${f.id} (${f.constraint!.kind}) admits the same ${before} words as the state ` +
        `before it — a clue that yields no information. Chain so far:\n  ${trace.join('\n  ')}`,
      ).toBeLessThan(before);
      // …and it must never narrow to nothing: the answer survives every step.
      expect(pool, `${f.id} eliminated the answer`).toContain(volume.answer.toLowerCase());
    }
    // The last engraving is the one that finishes the job.
    expect(pool).toEqual([volume.answer.toLowerCase()]);
  });

  it('robust: no single lost engraving leaves the mystery unsolvable in principle', () => {
    // Dropping any one constraint must still admit the answer (and stay a
    // short shortlist — the player can finish by elimination at the door).
    for (const drop of constraints) {
      const rest = constraints.filter((c) => c !== drop);
      const admitted = solveConstraints(rest, dictionary);
      expect(admitted, `without ${drop.kind}`).toContain(volume.answer.toLowerCase());
      expect(admitted.length, `without ${drop.kind}`).toBeLessThanOrEqual(8);
    }
  });

  it('every accepted spelling normalizes to letters-only uppercase', () => {
    expect(volume.accepted.map(normalizeGuess)).toContain(normalizeGuess(volume.answer));
    for (const a of volume.accepted) expect(normalizeGuess(a)).toMatch(/^[A-Z]+$/);
  });
});

describe('volume-1 content integrity', () => {
  const FLAG_RE = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){1,2}$/;

  it('fragment ids are unique and revealOrder is a dense 1..N sequence', () => {
    const ids = volume.fragments.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const orders = volume.fragments.map((f) => f.revealOrder).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i + 1));
  });

  it('kinds, groups and categories are well-formed', () => {
    for (const f of volume.fragments) {
      expect(['definition-line', 'engraving', 'testimony'], f.id).toContain(f.kind);
      expect(['puzzle', 'parlor', 'utility', 'mystery'], f.id).toContain(f.sourceRoomCategory);
      expect(f.text.length, f.id).toBeGreaterThan(0);
      expect(f.text.length, `${f.id} must fit a journal card`).toBeLessThanOrEqual(260);
    }
  });

  it('the definition poem is complete: 6 lines, each with an interpretation', () => {
    const lines = volume.fragments.filter((f) => f.kind === 'definition-line');
    expect(lines.length).toBe(6);
    for (const l of lines) expect(l.interpretation, l.id).toBeTruthy();
  });

  it('every engraving carries a constraint and a plain interpretation', () => {
    for (const e of engravings) {
      expect(e.constraint, e.id).toBeDefined();
      expect(e.interpretation, e.id).toBeTruthy();
    }
  });

  it('cross-references point at real fragments', () => {
    const ids = new Set(volume.fragments.map((f) => f.id));
    for (const f of volume.fragments) {
      for (const r of f.relatedIds ?? []) expect(ids.has(r), `${f.id} → ${r}`).toBe(true);
    }
  });

  it('letters are unique, reference real fragments, and their flags are legal', () => {
    const ids = volume.letters.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    const fragIds = new Set(volume.fragments.map((f) => f.id));
    for (const l of volume.letters) {
      for (const g of l.grantsFragmentIds ?? []) expect(fragIds.has(g), `${l.id} grants ${g}`).toBe(true);
      expect(`vol.${volume.id}.opened-${l.id}`).toMatch(FLAG_RE);
      expect(l.body.length, l.id).toBeGreaterThan(0);
    }
    expect(`vol.${volume.id}.solved`).toMatch(FLAG_RE);
  });

  it('every fragment class is reachable via ≥2 source types (AAA 4.14)', () => {
    // Channel 1: the room drip covers every fragment (deterministic, with
    // cross-category fallback). Channel 2: letters — a static grant per kind,
    // plus pity letters that deliver whatever the drip is stuck on.
    const kinds = ['definition-line', 'engraving', 'testimony'] as const;
    const staticGrants = new Set(volume.letters.flatMap((l) => l.grantsFragmentIds ?? []));
    for (const kind of kinds) {
      const viaLetter = volume.fragments.some((f) => f.kind === kind && staticGrants.has(f.id));
      expect(viaLetter, `a letter should carry at least one ${kind}`).toBe(true);
    }
    expect(volume.letters.filter((l) => l.pity).length).toBeGreaterThanOrEqual(2);
  });

  it('no shipped copy uses defeat language (AAA 4.12 string lint, this file’s slice)', () => {
    const text = JSON.stringify(volume).toLowerCase();
    // Word-boundary match: "closes" must not trip the "lose" lint.
    for (const banned of ['fail', 'failure', 'lose', 'loser', 'death', 'damage', 'defeat']) {
      expect(new RegExp(`\\b${banned}\\b`).test(text), banned).toBe(false);
    }
  });
});
