import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  typeset, typesetDeep, walkForStraightQuotes, sourceCopyProblems,
  OPEN_DOUBLE, CLOSE_DOUBLE, OPEN_SINGLE, CLOSE_SINGLE,
} from '../content/lib/typography';
import {
  authoredFiles, lintAuthoredTypography,
  outstandingSourceCopyProblems, sourceFiles, staleSourceCopyExceptions,
} from '../content/lint-typography';

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
  /**
   * ═══ ROUND 18 — THE WHOLE FILE WAS ASSERTED AGAINST ITSELF ════════════════
   *
   * Every assertion below — and every assertion in `content/lint-typography.ts`
   * — is written in terms of `OPEN_DOUBLE` / `CLOSE_DOUBLE` / `OPEN_SINGLE` /
   * `CLOSE_SINGLE`, and NOTHING anywhere named the four code points. So the
   * suite says "typeset turns a straight quote into OPEN_DOUBLE" and never
   * "OPEN_DOUBLE is a left double quotation mark".
   *
   * HONEST ABOUT THE SIZE OF THE HOLE, because the two loudest failures are
   * already covered. Setting `OPEN_DOUBLE = '"'` reds three existing gates,
   * and swapping open for close reds two: this file does pin that the marks
   * are non-straight and that they differ from each other. What NOTHING pinned
   * is WHICH handed marks they are. Measured, by editing the constants and
   * running this file:
   *
   *   OPEN_DOUBLE  = '«'  (U+00AB guillemet)
   *   CLOSE_SINGLE = 'ʼ'  (U+02BC MODIFIER LETTER APOSTROPHE — a LETTER, so it
   *                        changes word boundaries and line breaking, and the
   *                        serif faces draw it differently)
   *
   * → 18 of 19 tests GREEN, only this one red. Both are handed, both are
   * non-straight, both differ from their partners, so every existing defence
   * passes them straight through and the game ships French quotes in a cozy
   * English manor.
   *
   * The external fact is Unicode, so the assertion is against Unicode, and the
   * code points are spelled as numbers rather than as glyphs — a glyph on the
   * right-hand side would move with the constant under a file-encoding
   * accident and put us back where we started.
   */
  it('pins the four marks to their code points, not to each other', () => {
    expect(OPEN_DOUBLE.codePointAt(0), 'OPEN_DOUBLE is not U+201C').toBe(0x201C);
    expect(CLOSE_DOUBLE.codePointAt(0), 'CLOSE_DOUBLE is not U+201D').toBe(0x201D);
    expect(OPEN_SINGLE.codePointAt(0), 'OPEN_SINGLE is not U+2018').toBe(0x2018);
    expect(CLOSE_SINGLE.codePointAt(0), 'CLOSE_SINGLE is not U+2019').toBe(0x2019);
    // …and each is ONE mark, so a template that interpolates them cannot be
    // silently padded, and none of them is a straight typewriter mark.
    for (const m of [OPEN_DOUBLE, CLOSE_DOUBLE, OPEN_SINGLE, CLOSE_SINGLE]) {
      expect([...m], `${m} is not a single mark`).toHaveLength(1);
      expect('"\''.includes(m), `${m} is a typewriter mark`).toBe(false);
    }
  });

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

  /**
   * ROUND 12 — THE EXCEPTION THAT WAS THE WHOLE HOLE.
   *
   * Round 6 linted `content/authored/**` and called the defect closed. The app
   * does not ship `content/authored`: `src/app/pools.ts` imports
   * `content/generated/*.json`. `content/generated/crossword.json` was stale —
   * generated before the round-6 pass — so 35 Linen Closet clues still read
   * `Tea's pale partner` on glass, in a view that (unlike WordWebView and
   * ForgottenWordView) never calls `typeset()`. The lint walks the whole
   * shipped corpus now, and this is the row that says so.
   */
  it('SHIPPED: the corpus the lint walks is the corpus the app imports', () => {
    const files = authoredFiles().map((f) => f.replace(/\\/g, '/'));
    // Every pool `src/app/pools.ts` imports must be inside the walk.
    for (const pool of [
      'word-web', 'hive', 'twistle', 'forgotten-word', 'cipher', 'crossword', 'sudoku',
    ]) {
      expect(files.some((f) => f.endsWith(`content/generated/${pool}.json`)), pool).toBe(true);
    }
    expect(files.some((f) => f.endsWith('word-web-boards.json'))).toBe(true);
    expect(files.some((f) => f.includes('dialogue'))).toBe(true);
  });

  it('is actually looking at the corpus (guards against an empty walk)', () => {
    const files = authoredFiles();
    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(files.some((f) => f.endsWith('word-web-boards.json'))).toBe(true);
    expect(files.some((f) => f.includes('dialogue'))).toBe(true);
  });

  it('the Linen Closet clue rail is set, and matches its own authored bank', () => {
    const clues = (JSON.parse(readFileSync(
      join(process.cwd(), 'content', 'generated', 'crossword.json'), 'utf-8',
    )) as { entries: { clue: string }[] }[]).flatMap((p) => p.entries.map((e) => e.clue));
    const bank = new Set((JSON.parse(readFileSync(
      join(process.cwd(), 'content', 'authored', 'crossword-clues.json'), 'utf-8',
    )) as { clues: { clues: string[]; wry: string[] }[] }).clues
      .flatMap((c) => [...c.clues, ...c.wry]));

    expect(clues.length).toBeGreaterThan(50);
    for (const clue of clues) {
      // CrosswordView prints the clue raw — the data has to be right, because
      // nothing downstream repairs it.
      expect(clue, clue).not.toContain('"');
      expect(clue, clue).not.toContain("'");
      // …and it is still the authored line, not a typeset near-miss of one.
      expect(bank.has(clue), `generated clue not in the authored bank: ${clue}`).toBe(true);
    }
  });
});

/**
 * ═══ THE THIRD CORPUS (round 12) ══════════════════════════════════════════
 *
 * Rounds 6 and 12 taught the lint to read `content/authored/**` and
 * `content/generated/**`. Both are JSON. A third of the game's player-visible
 * copy is neither — it is written inline in `.ts`/`.tsx`: the rooms' verdict
 * toasts, the cabinet's plate names. Nothing had ever looked at it, and it
 * carries the same defect on the same screens, in the same faces.
 */
describe('straight quotes in copy that lives in source', () => {
  it('the rule is precise: prose apostrophes only, never a string delimiter', () => {
    const hit = (src: string) => sourceCopyProblems('f.ts', src).map((p) => p.text.trim());
    // The shape it must catch, in each literal form.
    expect(hit(`const a = "The tiles won't connect";`)).toEqual([`The tiles won't connect`]);
    // Escaped, the mark is still a mark on screen — and the scanner unescapes
    // before judging, so `\'` cannot be used to smuggle one past the lint.
    expect(hit(`const a = 'Posy\\'s lost word';`)).toEqual([`Posy's lost word`]);
    expect(hit('const a = `${w} isn\'t in the lexicon`;')).toEqual([`isn't in the lexicon`]);
    // …and the four shapes it must not, or the lint is one somebody turns off.
    expect(hit(`const a = 'plain';\nconst b = 'kebab-case-id';`)).toEqual([]);
    expect(hit(`// she won't see this comment\nconst a = 'ok';`)).toEqual([]);
    expect(hit(`/* nor won't this */\nconst a = 'ok';`)).toEqual([]);
    expect(hit(`const a = 'http://example.com/x';`)).toEqual([]);
    // A straight double quote in source is a developer diagnostic, not copy.
    expect(hit(`throw new Error('goto "x" does not exist');`)).toEqual([]);
  });

  it('no UNSIGNED straight apostrophe in shipped source copy', () => {
    const problems = outstandingSourceCopyProblems();
    expect(problems.map((p) => `${p.where}: ${p.text.trim()} → ${p.suggestion.trim()}`)).toEqual([]);
  });

  /**
   * The five known ones are NAMED, not skipped: they live in files this pass
   * does not own (the two anchor room views and the deck's plate names), and
   * AAA 6.19's own note is the ruling — a criterion "being silently waived in
   * the meantime … is worse than either answer". This row is what stops the
   * list becoming permanent: fixing one and leaving its entry behind fails
   * exactly as loudly as not fixing it, and the failure names the line to
   * delete.
   */
  it('the exception list is not stale — a fixed line must lose its entry', () => {
    expect(staleSourceCopyExceptions()).toEqual([]);
  });

  it('the scanner is actually reading the app (guards against an empty walk)', () => {
    const files = sourceFiles().map((f) => f.replace(/\\/g, '/'));
    expect(files.length).toBeGreaterThanOrEqual(100);
    expect(files.some((f) => f.endsWith('src/ui/rooms/anchor/WordWebView.tsx'))).toBe(true);
    expect(files.some((f) => f.endsWith('src/engine/manor/deck.ts'))).toBe(true);
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
