/**
 * The Library's end-screen grade line. OWNER: A3.
 *
 * Split out of `WordWebView.tsx` in round 34 for the same reason `herring-line.ts`
 * was split out in round 12: it is a sentence the room is contractually
 * required to keep true, and a sentence like that is a testable object
 * (`tests/puzzles/anchors.test.ts`). It was not testable while it lived inside
 * the component, and while it was not testable it shipped false.
 *
 * ═══ WHAT SHIPPED FALSE (COMPREHENSION, cold read 11 Aug, item 14) ═════════
 *
 * The room's closing verdict took ONE input — `costedMistakes + hintsBought` —
 * and the room asks TWO questions. The second is the act of naming (AAA 2.11),
 * which is the Library's own invention and not borrowed from Connections: the
 * last four fall together and she must say what binds them. Getting it wrong
 * forfeits `perfect` in the adapter (`isPerfect` reads `namedCorrectly`), so it
 * genuinely costs her something — but the line printed underneath knew nothing
 * about it, and a clean board with a misnamed thread printed:
 *
 *     Woven.
 *     Every thread true, first time.
 *     It called itself “Kinds of Knot”.
 *
 * — the middle line congratulating her on precisely what the line beneath it
 * corrects. A grader reading that stack cannot conclude anything except that
 * the naming question is decoration, which is exactly what the cold read
 * concluded and wrote down.
 *
 * The name is one of the two grade inputs now, so the copy cannot contradict
 * the verdict standing next to it. Nothing about the ECONOMY moved — the
 * adapter has always gated `perfect` on the name and still does; what moved is
 * that the room now says so, both before she chooses (`.ww-name__stake`) and
 * after (here).
 */

/**
 * Warm, never shame-adjacent (AAA 2.14).
 *
 * @param mistakes  costed wrong guesses + bought nudges
 * @param namedTrue whether the final thread was named correctly. `true` when
 *                  the board never reached a naming act at all, because a
 *                  grade must not deduct for a question the room did not ask.
 */
export function endCopy(mistakes: number, namedTrue: boolean): string {
  if (!namedTrue) {
    // The weaving really was clean; only the naming missed. Say both, in that
    // order, so it lands as a grade and not a scolding — and never claim the
    // thing the line below it is about to correct.
    return mistakes === 0
      ? 'Every thread true — all but the name of the last.'
      : 'The web holds, though the last thread went by another name.';
  }
  // ROUND 16 (AAA 2.14): this used to read 'Perfect! Every thread true.' and
  // sat directly under the title 'Perfect!', so the perfect solve — and ONLY
  // the perfect solve — printed the grade twice, stacked. It read as a copy bug
  // rather than a grade. The title carries the word; the line carries the
  // reason, exactly like the other three.
  if (mistakes === 0) return 'Every thread true, first time.';
  if (mistakes === 1) return 'Splendid weaving.';
  if (mistakes === 2) return 'Well pieced-together.';
  return 'Got there — the web holds.';
}
