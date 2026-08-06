/**
 * One quoting convention for recovered text — OWNER: A7.
 *
 * The journal shows three kinds of verbatim document (definition lines,
 * engravings, testimony) and it used to quote them three different ways: the
 * poem and the engraving cards wrapped the authored string in curly quotes,
 * while testimony carried its own quotes in `volume-1.json` and the card added
 * none — so the same page mixed «“…”» drawn by the UI with «“…”» drawn by the
 * writer, and any authored string that already had them (all five testimonies)
 * risked rendering doubled the moment a card was refactored to wrap like its
 * neighbours.
 *
 * The convention, applied everywhere a fragment is shown verbatim:
 *   **the QUOTES BELONG TO THE JOURNAL, never to the content.**
 * `quoted()` strips whatever pairing the authored string arrived with and
 * re-sets one curly pair, so the rule holds no matter how the content is
 * authored later. It is idempotent and leaves quotes *inside* the line alone —
 * the engraving that quotes the Lexicographer mid-sentence keeps its nested
 * speech marks.
 */

/** Leading/trailing quote marks the journal will re-set itself. */
const LEAD = /^[“”"'‘’\s]+/;
const TRAIL = /[“”"'‘’\s]+$/;
/** Double-quote glyphs still sitting INSIDE the line (nested speech). */
const INNER = /[“”"]/g;

/** The authored line with any outer quoting removed (and edges trimmed). */
export function unquoted(text: string): string {
  return text.replace(LEAD, '').replace(TRAIL, '');
}

/**
 * The line as the journal sets it: exactly one pair of curly double quotes,
 * with any nested speech demoted to single curlies per the English nesting
 * rule. (One engraving quotes the Lexicographer mid-inscription; with both
 * levels set in “ ” the reader cannot tell which mark closes what — and,
 * before this, its own trailing ” collided with the card's, printing a
 * doubled closing quote.) A dangling inner opener is closed before the outer
 * mark so the pairs always balance.
 */
export function quoted(text: string): string {
  const bare = unquoted(text);
  if (!bare) return '';
  let open = false;
  const nested = bare.replace(INNER, () => {
    open = !open;
    return open ? '‘' : '’';
  });
  return `“${nested}${open ? '’' : ''}”`;
}
