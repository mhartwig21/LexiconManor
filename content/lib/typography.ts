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

// ---------------------------------------------------------------------------
// The third corpus: copy that lives in source (round 12)
// ---------------------------------------------------------------------------

/**
 * ═══ THE CORPUS THE LINT COULD NOT READ ═══════════════════════════════════
 *
 * Round 6 linted `content/authored/**`; round 12 widened it to
 * `content/generated/**` (the files the app actually imports). Both are JSON.
 * A third of the game's player-visible copy is neither: it is written inline
 * in `.ts`/`.tsx` — the rooms' verdict toasts, the cabinet's plate names, the
 * chrome's notices. Nothing had ever looked at it, and it carries the same
 * defect, in the same faces, on the same screens:
 *
 *     TwistleView   "The tiles won't connect so"
 *     TwistleView   `${fb.word} isn't in the lexicon`
 *     HiveView      `${fb.word} +${fb.points} — you've reached ${rung}`
 *     deck.ts       "Posy's lost word" / "Posy's deputy sash"
 *
 * Straight apostrophes beside the properly-set ones the JSON corpus prints on
 * the very same screen. All five were patched in round 8 (round-13 tree) and
 * the exception list is now empty; the five lines above are kept as the worked
 * example of what this scanner is for, not as an outstanding list.
 *
 * WHY THIS SCANS RATHER THAN GREPS. In source, U+0027 is mostly a string
 * DELIMITER — a grep for it is all false positive. So this walks the file with
 * a four-state scanner (code / comment / string / template) and reports the one
 * shape that is unambiguously prose: an apostrophe BETWEEN TWO LETTERS inside a
 * literal (`won't`, `Posy's`, `you've`). No identifier, path, flag key or class
 * name looks like that, and measured over all 125 files of `src/` the rule
 * returns five hits and five true positives.
 *
 * U+0022 is deliberately NOT reported here even though it is reported in JSON.
 * In source it is overwhelmingly a diagnostic quoting an identifier back to a
 * developer — 39 of the 44 raw hits were `validate.ts` build errors of the form
 * `goto "x" does not exist`, plus CSS selectors — none of which ever reaches a
 * player or a serif face. A lint with a 90% false-positive rate is a lint
 * somebody turns off, and turning it off is how round 5 happened.
 *
 * Comments are skipped entirely: they are for us, not for her.
 */
export function sourceCopyProblems(where: string, source: string): QuoteProblem[] {
  const problems: QuoteProblem[] = [];
  const n = source.length;
  let i = 0;

  const isLetter = (c: string | undefined) => !!c && /[A-Za-z]/.test(c);

  /** Read a literal that has already had its opening delimiter consumed. */
  const readLiteral = (quote: string, start: number): number => {
    let j = start;
    let body = '';
    while (j < n) {
      const c = source[j]!;
      // Escapes are UNESCAPED into the body, not copied verbatim: written as
      // 'Posy\'s lost word' the apostrophe is still an apostrophe on screen,
      // and a scanner that kept the backslash would see `\` beside the mark
      // instead of `y` and wave the line through. (`\n` folding to `n` is
      // harmless — this rule only looks at letters either side of a mark.)
      if (c === '\\') { body += source[j + 1] ?? ''; j += 2; continue; }
      if (c === quote) break;
      // A template's ${...} is code, not copy — skip it wholesale so an
      // expression's own strings are scanned as code on the next pass.
      if (quote === '`' && c === '$' && source[j + 1] === '{') {
        let depth = 1;
        j += 2;
        while (j < n && depth > 0) {
          if (source[j] === '{') depth++;
          else if (source[j] === '}') depth--;
          j++;
        }
        body += ' ';
        continue;
      }
      if (quote === '`' && c === '\n') { body += c; j++; continue; }
      if (quote !== '`' && c === '\n') break;  // unterminated; bail
      body += c;
      j++;
    }
    // Now judge the body.
    for (let k = 0; k < body.length; k++) {
      const c = body[k]!;
      if (c === STRAIGHT_SINGLE && isLetter(body[k - 1]) && isLetter(body[k + 1])) {
        problems.push({
          where, mark: 'U+0027', text: body, suggestion: typeset(body),
        });
        break;
      }
    }
    return j + 1;
  };

  while (i < n) {
    const c = source[i]!;
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === STRAIGHT_SINGLE || c === STRAIGHT_DOUBLE || c === '`') {
      i = readLiteral(c, i + 1);
      continue;
    }
    i++;
  }
  return problems;
}
