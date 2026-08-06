/**
 * Typography for authored copy — OWNER: A2 (this round), used by content
 * build-time lints and by the room views that render authored strings.
 *
 * ═══ THE BUG THIS FILE EXISTS TO KILL ═════════════════════════════════════
 * Straight quotes render as a RIGHT-CURLY MARK ON BOTH SIDES. U+0022 (") and
 * U+0027 (') are typewriter marks with no handedness; the game's serif faces
 * (IM Fell English, EB Garamond) draw them as a single sloped comma-shape, so
 *
 *     Anagrams of "LISTEN"        →   Anagrams of ”LISTEN”
 *     Contains "OUT"              →   Contains ”OUT”
 *     The 'late' is silent        →   The ’late’ is silent
 *
 * The opening mark leans the wrong way in every one. Confirmed on the Library
 * showcase, across the word-web theme bank, and in the Study's wrong-guess
 * toast (ForgottenWordView). It is a small thing that makes the page look
 * like a text file instead of a book — and the manor's whole visual claim is
 * that it is a book.
 *
 * ═══ TWO DEFENCES, DELIBERATELY BOTH ══════════════════════════════════════
 *   1. `typeset()` — a render-time fix, applied where authored/generated
 *      strings reach the screen. It handles copy this round does not own (the
 *      word-web theme bank lives in `content/generate-wordweb.ts`) and it is
 *      idempotent, so already-typeset copy passes through untouched.
 *   2. `straightQuoteProblems()` — a build-time lint over authored content, so
 *      new copy cannot reintroduce the marks. Render-time repair alone would
 *      make the defect invisible-but-present; the lint is what keeps the
 *      source honest.
 *
 * Pure: no fs, no DOM. Safe to import from a Node script or from the app.
 */

export const OPEN_DOUBLE = '“';   // “
export const CLOSE_DOUBLE = '”';  // ”
export const OPEN_SINGLE = '‘';   // ‘
export const CLOSE_SINGLE = '’';  // ’

/** U+0022 straight double quote. */
export const STRAIGHT_DOUBLE = '"';
/** U+0027 straight single quote / apostrophe. */
export const STRAIGHT_SINGLE = "'";

const isWordChar = (c: string) => /[A-Za-z0-9]/.test(c);
const isDigit = (c: string) => /[0-9]/.test(c);

/**
 * Set one line of copy properly: straight quotes become handed curly quotes,
 * apostrophes become U+2019.
 *
 * Rules, in order of application to each U+0027:
 *   - between two word characters  → apostrophe (`don't`, `manor's`)
 *   - immediately before a digit   → apostrophe (elided year: `'09`)
 *   - a known elision (`'tis`, `'em`, `'round`…) → apostrophe
 *   - closing an open single quote → closing single
 *   - opening, but ONLY when a later U+0027 exists to close it → opening single
 *   - anything else                → apostrophe (never leave a stray opener)
 *
 * U+0022 simply alternates open/close across the string, which is what a
 * writer means every time.
 *
 * Idempotent: text containing only curly marks is returned unchanged.
 */
export function typeset(text: string): string {
  if (!text || (!text.includes(STRAIGHT_DOUBLE) && !text.includes(STRAIGHT_SINGLE))) {
    return text;
  }
  /** Elisions that open with an apostrophe rather than a quotation. */
  const ELISIONS = /^(tis|twas|twere|em|til|till|round|neath|cause|bout|n')\b/i;

  let out = '';
  let doubleOpen = false;
  let singleOpen = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === STRAIGHT_DOUBLE) {
      out += doubleOpen ? CLOSE_DOUBLE : OPEN_DOUBLE;
      doubleOpen = !doubleOpen;
      continue;
    }
    if (ch !== STRAIGHT_SINGLE) {
      out += ch;
      continue;
    }
    const prev = text[i - 1] ?? '';
    const next = text[i + 1] ?? '';
    if (isWordChar(prev) && isWordChar(next)) { out += CLOSE_SINGLE; continue; }
    if (isDigit(next)) { out += CLOSE_SINGLE; continue; }
    if (!isWordChar(prev) && ELISIONS.test(text.slice(i + 1))) { out += CLOSE_SINGLE; continue; }
    if (singleOpen) { out += CLOSE_SINGLE; singleOpen = false; continue; }
    const hasCloser = text.indexOf(STRAIGHT_SINGLE, i + 1) !== -1;
    if (hasCloser && !isWordChar(prev)) { out += OPEN_SINGLE; singleOpen = true; continue; }
    out += CLOSE_SINGLE;
  }
  // An unbalanced opener would print a mark with nothing to answer it.
  return singleOpen ? out.replace(new RegExp(`${OPEN_SINGLE}(?=[^${OPEN_SINGLE}]*$)`), CLOSE_SINGLE) : out;
}

export interface QuoteProblem {
  /** Where it was found: file path + a JSON-ish path to the string. */
  where: string;
  /** Which mark: the straight double or the straight single. */
  mark: 'U+0022' | 'U+0027';
  /** The offending line, and how it should have been set. */
  text: string;
  suggestion: string;
}

/** Every straight quote in one string, with the typeset form to replace it. */
export function straightQuoteProblems(where: string, text: string): QuoteProblem[] {
  const problems: QuoteProblem[] = [];
  if (typeof text !== 'string') return problems;
  const suggestion = typeset(text);
  if (text.includes(STRAIGHT_DOUBLE)) {
    problems.push({ where, mark: 'U+0022', text, suggestion });
  }
  if (text.includes(STRAIGHT_SINGLE)) {
    problems.push({ where, mark: 'U+0027', text, suggestion });
  }
  return problems;
}

/** Recursively walk any parsed JSON value, linting every string it holds. */
export function walkForStraightQuotes(value: unknown, where: string): QuoteProblem[] {
  if (typeof value === 'string') return straightQuoteProblems(where, value);
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => walkForStraightQuotes(v, `${where}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([k, v]) => walkForStraightQuotes(v, `${where}.${k}`));
  }
  return [];
}

/** Recursively typeset every string in a parsed JSON value (same shape back). */
export function typesetDeep<T>(value: T): T {
  if (typeof value === 'string') return typeset(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => typesetDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, typesetDeep(v)]),
    ) as unknown as T;
  }
  return value;
}

/** One line per problem, for a build log. */
export function formatQuoteProblem(p: QuoteProblem): string {
  return `${p.where}: straight quote ${p.mark} in authored copy\n    is:     ${p.text}\n    should: ${p.suggestion}`;
}
