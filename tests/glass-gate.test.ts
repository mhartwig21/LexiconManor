/**
 * tests/glass-gate.test.ts — OWNER: feedback-loop.
 *
 * WHAT THIS IS FOR. `scripts/smoke-gate.mjs` is the only thing in this repo
 * that has ever looked at a screen, and it is a browser pass — minutes, its
 * own CI job, deliberately out of the path of the fast suite. But its
 * VERDICTS are pure functions over measurements, and those cost nothing, so
 * the fast suite carries them: if the gate has stopped being able to call a
 * defect a defect, `npm test` says so in the same second as everything else,
 * without a browser anywhere in sight.
 *
 * This is the shape `tests/chrome-clearance.test.ts` established and the only
 * one in this repo with a track record: a lint wired into CI, with a self-test,
 * whose class of defect then stopped recurring.
 *
 * The fixtures live beside the verdicts in the gate itself (its `selfTest`),
 * because a fixture is only worth anything next to the rule it exercises.
 * Here we assert three things about the gate as an object:
 *
 *   1. every verdict still goes red on the measurement its defect really
 *      produced, and still stays green on the fixed form;
 *   2. the six defect classes the owner named are each covered by a PROOF that
 *      re-introduces them into the running app (`--prove`), so no class can be
 *      quietly dropped from the falsification pass;
 *   3. the gate's contract still describes THIS game — seven rooms, both
 *      shipped phones, 375 first.
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error — the gate is plain ESM JavaScript, on purpose: it is a
// driver, it runs from `node` with no build step, and CI must be able to run
// it before anything is compiled.
import { selfTest, PROOFS, COVERAGE_FLOORS } from '../scripts/smoke-gate.mjs';

describe('the glass gate can still tell a defect from a fixed form', () => {
  it('goes red on every measurement a shipped defect really produced', () => {
    // Each failure string names the fixture, so a break reads as "the gate no
    // longer catches the offer sheet that shipped scrolling 29px" rather than
    // as an assertion count.
    expect(selfTest()).toEqual([]);
  });
});

describe('the falsification pass still covers every class the gate claims', () => {
  /**
   * The six classes are the six things the owner found by playing. A proof per
   * class is what stops "the gate is green" from meaning "the gate looked".
   */
  const CLASSES = ['EDITION', 'ROOMS', 'SCROLL', 'HITS', 'CONSOLE', 'COPY'];

  it('has a re-introduced defect for each of the six classes', () => {
    const covered = new Set(PROOFS.map((p: { klass: string }) => p.klass));
    expect([...CLASSES].filter((k) => !covered.has(k))).toEqual([]);
  });

  it('states, for every proof, what it is and why it is that shape', () => {
    for (const proof of PROOFS as Array<{ id: string; why: string; css?: string; init?: unknown }>) {
      expect(proof.id, 'a proof without a name is a proof nobody can run alone').toBeTruthy();
      expect(proof.why.length, `${proof.id} does not say what it re-introduces`).toBeGreaterThan(40);
      expect(
        Boolean(proof.css) || Boolean(proof.init),
        `${proof.id} injects nothing — it would pass by construction`,
      ).toBe(true);
    }
  });
});

describe('the gate is still pointed at this game', () => {
  it('expects to measure a great deal more than nothing', () => {
    // The anti-construction floors. If someone lowers these to make a red run
    // go away, that is the change worth seeing in a diff.
    expect(COVERAGE_FLOORS.probes).toBeGreaterThanOrEqual(400);
    expect(COVERAGE_FLOORS.scenes).toBeGreaterThanOrEqual(10);
    expect(COVERAGE_FLOORS.driven).toBeGreaterThanOrEqual(5);
    expect(COVERAGE_FLOORS.copyAssertions).toBeGreaterThanOrEqual(8);
  });
});
