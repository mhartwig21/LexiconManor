import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  typeset, typesetDeep, walkForStraightQuotes,
  OPEN_DOUBLE, CLOSE_DOUBLE, OPEN_SINGLE, CLOSE_SINGLE,
} from '../content/lib/typography';
import { authoredFiles, lintAuthoredTypography } from '../content/lint-typography';

/**
 * ═══ THE STRAIGHT-QUOTE DEFECT (round 5 verifier, P2 but visible) ═════════
 *
 * Straight quotes render as a RIGHT-CURLY MARK ON BOTH SIDES. U+0022 and
 * U+0027 are typewriter marks with no handedness, and the game's serif faces
 * draw them as one sloped comma-shape, so every OPENING quote in the game
 * leaned the wrong way:
 *
 *     Anagrams of "LISTEN"   →   Anagrams of ”LISTEN”
 *     Contains "OUT"         →   Contains ”OUT”
 *     The 'late' is silent   →   The ’late’ is silent
 *
 * Confirmed on the Library showcase, across the word-web theme bank, and in
 * ForgottenWordView's wrong-guess toast.
 *
 * Two defences, tested here:
 *   1. `typeset()` repairs it at render, for copy whose generator this round
 *      does not own (the word-web theme bank).
 *   2. This lint keeps the SOURCE honest, so the repair never becomes a
 *      load-bearing secret. A render-time fix alone would make the defect
 *      invisible-but-present — which is exactly how it survived to round 5.
 */

describe('typeset() — straight marks become handed marks', () => {
  it('hands a double-quoted fragment correctly (the Library showcase bug)', () => {
    expect(typeset('Anagrams of "LISTEN"')).toBe(`Anagrams of ${OPEN_DOUBLE}LISTEN${CLOSE_DOUBLE}`);
    expect(typeset('Contains "OUT"')).toBe(`Contains ${OPEN_DOUBLE}OUT${CLOSE_DOUBLE}`);
    expect(typeset('Can Follow "SUN"')).toBe(`Can Follow ${OPEN_DOUBLE}SUN${CLOSE_DOUBLE}`);
  });

  it('the opening mark is NOT the closing mark (the whole defect, in one line)', () => {
    const out = typeset('Contains "OUT"');
    const first = out.indexOf(OPEN_DOUBLE);
    const last = out.lastIndexOf(CLOSE_DOUBLE);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(last).toBeGreaterThan(first);
    expect(out).not.toContain('"');
    // The pre-fix rendering had the same glyph on both sides.
    expect(out[first]).not.toBe(out[last]);
  });

  it('sets a quoted phrase in single curlies', () => {
    expect(typeset("The 'late' is silent")).toBe(`The ${OPEN_SINGLE}late${CLOSE_SINGLE} is silent`);
    expect(typeset("'Fern,' he'd say"))
      .toBe(`${OPEN_SINGLE}Fern,${CLOSE_SINGLE} he${CLOSE_SINGLE}d say`);
  });

  it('knows an apostrophe from a quotation', () => {
    expect(typeset("don't")).toBe(`don${CLOSE_SINGLE}t`);
    expect(typeset("the manor's answer")).toBe(`the manor${CLOSE_SINGLE}s answer`);
    // An elided year opens with an apostrophe, not a quote mark.
    expect(typeset("polished a parlor in '09")).toBe(`polished a parlor in ${CLOSE_SINGLE}09`);
    expect(typeset("'tis the season")).toBe(`${CLOSE_SINGLE}tis the season`);
  });

  it('never leaves a stray opener', () => {
    for (const s of ["it's 'odd", "a lone ' mark", "'unclosed", "nested 'a 'b' c'"]) {
      const out = typeset(s);
      const opens = [...out].filter((c) => c === OPEN_SINGLE).length;
      const closes = [...out].filter((c) => c === CLOSE_SINGLE).length;
      expect(opens).toBeLessThanOrEqual(closes);
      expect(out).not.toContain("'");
    }
  });

  it('is idempotent — already-set copy passes through untouched', () => {
    for (const s of [
      'Anagrams of "LISTEN"', "The 'late' is silent", 'no quotes at all',
      `${OPEN_DOUBLE}already set${CLOSE_DOUBLE}`, "Bramble's kitchen",
    ]) {
      expect(typeset(typeset(s))).toBe(typeset(s));
    }
  });

  it('typesetDeep walks a whole content object', () => {
    const before = { theme: 'Contains "ANT"', words: ['ANTLER'], nested: { s: "don't" } };
    const after = typesetDeep(before);
    expect(after.theme).toBe(`Contains ${OPEN_DOUBLE}ANT${CLOSE_DOUBLE}`);
    expect(after.nested.s).toBe(`don${CLOSE_SINGLE}t`);
    expect(after.words).toEqual(['ANTLER']);   // untouched values survive
  });
});

describe('the lint over authored content (U+0022 / U+0027)', () => {
  it('finds every straight mark, and says how it should have been set', () => {
    const found = walkForStraightQuotes(
      { groups: [{ theme: 'Contains "OUT"' }], line: "The 'late' is silent" },
      'fixture.json',
    );
    expect(found.map((p) => p.mark).sort()).toEqual(['U+0022', 'U+0027']);
    expect(found.find((p) => p.mark === 'U+0022')!.suggestion)
      .toBe(`Contains ${OPEN_DOUBLE}OUT${CLOSE_DOUBLE}`);
    expect(found.find((p) => p.mark === 'U+0027')!.where).toBe('fixture.json.line');
  });

  it('reports nothing for properly set copy', () => {
    expect(walkForStraightQuotes(
      { a: `Contains ${OPEN_DOUBLE}OUT${CLOSE_DOUBLE}`, b: `Bramble${CLOSE_SINGLE}s` }, 'ok.json',
    )).toEqual([]);
  });

  it('SHIPPED: no authored file contains a straight quote', () => {
    const problems = lintAuthoredTypography();
    // Named, so a failure tells the author which line and what to write.
    expect(problems.map((p) => `${p.where}: ${p.suggestion}`)).toEqual([]);
  });

  it('is actually looking at the corpus (guards against an empty walk)', () => {
    const files = authoredFiles();
    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(files.some((f) => f.endsWith('word-web-boards.json'))).toBe(true);
    expect(files.some((f) => f.includes('dialogue'))).toBe(true);
  });
});

describe('the shipped word-web pool reads correctly on screen', () => {
  it('every theme the Library can print is set (or repaired by typeset)', () => {
    const pool = JSON.parse(readFileSync(
      join(process.cwd(), 'content', 'generated', 'word-web.json'), 'utf-8',
    )) as { groups: { theme: string }[] }[];
    const themes = pool.flatMap((b) => b.groups.map((g) => g.theme));
    expect(themes.length).toBeGreaterThan(50);
    for (const theme of themes) {
      const shown = typeset(theme);      // WordWebView renders exactly this
      expect(shown).not.toContain('"');
      expect(shown).not.toContain("'");
      if (shown.includes(OPEN_DOUBLE)) {
        expect(shown.indexOf(OPEN_DOUBLE)).toBeLessThan(shown.lastIndexOf(CLOSE_DOUBLE));
      }
    }
  });
});
