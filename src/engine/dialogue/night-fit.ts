/**
 * ── WHAT MRS. BRAMBLE HAS ROOM TO SAY (round 25) ────────────────────────────
 *
 * Round 24 shipped thirty authored goodnights and published this as the number
 * that proved they fitted:
 *
 *     "the fullest possible night (four ledger rows, a two-line beat) still
 *      fits 375x667 with no scroll"
 *
 * Both halves were wrong. The digest never printed four ledger rows — it
 * printed FIVE (Rooms drafted / Rooms solved / Steps spent / Fragments found /
 * Letters read), so the case that was measured was not the fullest one; and it
 * did not fit. Re-measured live at HEAD on the real worst case, the digest was
 * 59px past the glass with `overflow-y: auto` quietly turned on, and the
 * Journal stand-aside's box bottom sat at 702 on a 667px screen — a control
 * written, shipped, and off the phone. A two-line beat with only THREE rows
 * already overflowed by 22px.
 *
 * A prose claim in a commit message cannot fail. This can. Every number below
 * was measured in system Edge at 375x667 (the binding size — 390x844 has 105px
 * of slack on the same content), and the budget is DERIVED from them rather
 * than asserted: the tally's height comes from `NIGHT_TALLY_LABELS.length`, so
 * a seventh tally row re-derives what is left for the beat, and the authored
 * pool is checked against the result by `validateDialogueFile` (which is what
 * `npm run content:verify` runs) and again by tests/night-and-choices.test.ts.
 * Writing a longer goodnight, or adding a row under it, fails the build.
 *
 * THE MODEL IS DELIBERATELY PESSIMISTIC. `charsPerLine` is 36 against a
 * measured 40.3 — the tightest ratio in the whole authored pool — so the
 * predicted wrap is never shorter than the real one. The two longest beats in
 * the file render six lines and this model calls them seven; that is the
 * safety margin, and it is on the right side.
 */

import { NIGHT_TALLY_LABELS } from '../day';

/**
 * The night digest, measured child by child at 375x667 in system Edge.
 * (scripts are throwaway; the numbers are not, so they live here.)
 */
export const NIGHT_FIT = {
  /** The short glass. Every defect this project has shipped lived here. */
  glassPx: 667,

  /**
   * Everything on the digest that is not the goodnight and not the tally:
   * both scene paddings, the seven flex gaps, "Night", the rule, the climb
   * line, the tally's note, "To tomorrow", and the two stand-asides.
   * Measured as (total column + padding) − beat − tally = 627.5 − 173.6 − 81.9.
   */
  framePx: 372.0,

  /** One rendered line of `--text-body` at `--leading-body`. */
  linePx: 24.64,
  /** "— Mrs. Bramble, turning down the lamps", at `--text-sm`. */
  attributionPx: 21.8,
  /** `.chr-night { gap }` at the short-glass breakpoint. */
  beatGapPx: 2,

  /** One GRID row of the tally — which holds TWO label/number pairs. */
  tallyRowPx: 24.64,
  tallyGapPx: 4,

  /**
   * Characters per rendered line at the digest's 34ch measure (277.4px).
   * Measured tightest ratio across all authored night lines: 40.3. Held at 36.
   */
  charsPerLine: 36,
  /** The digest wraps a spoken line in curly quotes; narration takes none. */
  quoteChars: 2,
} as const;

/** How tall the tally block is with `entries` non-zero rows, two to a row. */
export function tallyBlockPx(entries: number): number {
  if (entries <= 0) return 0;
  const rows = Math.ceil(entries / 2);
  return rows * NIGHT_FIT.tallyRowPx + (rows - 1) * NIGHT_FIT.tallyGapPx;
}

/** How tall a goodnight is: its wrapped lines, its gaps, and its signature. */
export function beatBlockPx(visualLines: number, paragraphs: number): number {
  return visualLines * NIGHT_FIT.linePx
    + paragraphs * NIGHT_FIT.beatGapPx
    + NIGHT_FIT.attributionPx;
}

/**
 * How many rendered lines the goodnight may occupy on the fullest night —
 * every tally row printing, the climb line printing, at 375x667.
 */
export function nightBeatLineBudget(
  tallyEntries: number = NIGHT_TALLY_LABELS.length,
  paragraphs = 2,
): number {
  const spare = NIGHT_FIT.glassPx
    - NIGHT_FIT.framePx
    - tallyBlockPx(tallyEntries)
    - paragraphs * NIGHT_FIT.beatGapPx
    - NIGHT_FIT.attributionPx;
  return Math.floor(spare / NIGHT_FIT.linePx);
}

/** How many lines one authored paragraph wraps to, pessimistically. */
export function paragraphVisualLines(text: string, narration = false): number {
  const chars = text.length + (narration ? 0 : NIGHT_FIT.quoteChars);
  return Math.max(1, Math.ceil(chars / NIGHT_FIT.charsPerLine));
}

/** How many lines a whole beat wraps to. */
export function beatVisualLines(
  lines: readonly { text: string; narration?: boolean }[],
): number {
  return lines.reduce((n, l) => n + paragraphVisualLines(l.text, !!l.narration), 0);
}
