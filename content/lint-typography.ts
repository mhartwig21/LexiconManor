/**
 * Straight-quote lint over the SHIPPED corpus — OWNER: A2 (round 6, widened
 * round 12).
 *
 *   npx tsx content/lint-typography.ts          # report, exit 1 on any problem
 *   npx tsx content/lint-typography.ts --fix    # rewrite each file typeset
 *
 * Exits non-zero on any U+0022 (") or U+0027 (') in a shipped string. Wired
 * into `content:verify`; the same pure walk runs in `tests/typography.test.ts`,
 * so `vitest run` enforces it too.
 *
 * WHY IT IS A HARD ERROR AND NOT A WARNING
 * Straight marks have no handedness. The game's serif faces draw both U+0022
 * and U+0027 as a single right-leaning comma-shape, so an opening quote comes
 * out backwards *every time* — `Anagrams of ”LISTEN”`, `The ’late’ is silent`.
 * The room views repair it at render (`typeset()`), but a render-time repair
 * that nobody can see failing is how the defect got to round 5 in the first
 * place: this lint is what keeps the SOURCE honest, so the repair stays a
 * safety net rather than a load-bearing secret.
 *
 * ═══ ROUND 12 — THE EXCEPTION THAT WAS THE WHOLE HOLE ═════════════════════
 * The lint walked `content/authored/**` only. The app does not ship
 * `content/authored`: `src/app/pools.ts` imports `content/generated/*.json`,
 * and *that* is what the player reads. The gap was not theoretical —
 *
 *   1. `content/generated/crossword.json` carried 90 straight apostrophes in
 *      35 distinct Linen Closet clues (`Tea's pale partner`,
 *      `Mrs. Bramble's morning ritual`) while its own authored bank
 *      (`content/authored/crossword-clues.json`, which the lint DID walk) had
 *      been typeset correctly in round 6. The generated pool was simply stale
 *      — never re-run after the fix — and `CrosswordView` is one of the two
 *      views that does not call `typeset()` on the way to the glass, so the
 *      round-6 defect was still on screen in the Linen Closet.
 *   2. `content/generated/word-web.json` was MIXED: 168 themes typeset, 115
 *      not. Mixed is worse than uniformly wrong, because the naming act (AAA
 *      2.11) offers the true theme beside two decoys drawn from the same bank
 *      and de-duplicates them by string equality. Board `web-d06` therefore
 *      offered `Can Follow “TEA”` and `Can Follow "TEA"` in one triple; both
 *      render identically after `typeset()`, so the player was shown the same
 *      label twice and one of them silently forfeited the perfect grade.
 *
 * So the corpus this walks is now "everything the build ships", authored and
 * generated alike, and `--fix` applies the mechanical patch `typeset()` was
 * always able to print.
 *
 * The generated pools stay minified (one line, no indent) — that is how their
 * generators write them, and `--fix` must not turn a typography change into a
 * whole-file reflow.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatQuoteProblem, sourceCopyProblems, typesetDeep, walkForStraightQuotes,
  type QuoteProblem,
} from './lib/typography';

const here = dirname(fileURLToPath(import.meta.url));
export const AUTHORED_ROOT = join(here, 'authored');
export const GENERATED_ROOT = join(here, 'generated');

/** Every root the build ships to the player. Authored is the source of truth;
 *  generated is what `src/app/pools.ts` actually imports. Both are read. */
export const SHIPPED_ROOTS: readonly string[] = [AUTHORED_ROOT, GENERATED_ROOT];

/** Every JSON file under a root, recursively, in a stable order. */
export function authoredFiles(root: string | readonly string[] = SHIPPED_ROOTS): string[] {
  const roots = typeof root === 'string' ? [root] : root;
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.json')) out.push(full);
    }
  };
  for (const r of roots) walk(r);
  return out;
}

/** Repo-relative, forward-slashed — the form a build log should print. */
const label = (file: string) => relative(join(here, '..'), file).replace(/\\/g, '/');

/** Lint the shipped corpus. Returns [] when every mark is properly set. */
export function lintAuthoredTypography(
  root: string | readonly string[] = SHIPPED_ROOTS,
): QuoteProblem[] {
  const problems: QuoteProblem[] = [];
  for (const file of authoredFiles(root)) {
    problems.push(...walkForStraightQuotes(JSON.parse(readFileSync(file, 'utf-8')), label(file)));
  }
  return problems;
}

/**
 * Apply the patch the lint already knows how to print. Returns the files it
 * changed. Minified files stay minified; pretty-printed files keep two-space
 * indent and a trailing newline, which is how the authored corpus is written.
 */
export function fixShippedTypography(
  root: string | readonly string[] = SHIPPED_ROOTS,
): string[] {
  const changed: string[] = [];
  for (const file of authoredFiles(root)) {
    const before = readFileSync(file, 'utf-8');
    const parsed = JSON.parse(before);
    if (walkForStraightQuotes(parsed, label(file)).length === 0) continue;
    const minified = !before.includes('\n', before.indexOf('\n') + 1) && !/\n\s+/.test(before);
    const body = JSON.stringify(typesetDeep(parsed), null, minified ? undefined : 2);
    writeFileSync(file, minified ? body : `${body}\n`);
    changed.push(label(file));
  }
  return changed;
}

// ---------------------------------------------------------------------------
// The third corpus: player copy written inline in .ts/.tsx (round 12)
// ---------------------------------------------------------------------------

export const SRC_ROOT = join(here, '..', 'src');

/** Every TypeScript source file, recursively, in a stable order. */
export function sourceFiles(root: string = SRC_ROOT): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

/**
 * Straight apostrophes in copy that lives in source rather than in JSON.
 * See `sourceCopyProblems` in lib/typography.ts for why this rule is narrow.
 */
export function lintSourceCopy(root: string = SRC_ROOT): QuoteProblem[] {
  const problems: QuoteProblem[] = [];
  for (const file of sourceFiles(root)) {
    problems.push(...sourceCopyProblems(label(file), readFileSync(file, 'utf-8')));
  }
  return problems;
}

/**
 * ═══ THE FIVE THAT ARE NAMED RATHER THAN SILENTLY WAIVED ══════════════════
 *
 * These are real defects, found by the rule above, in files the round-12
 * backlog pass does not own: the two anchor room views and the deck's cabinet
 * plate names belong to the room-typography and content owners this round, and
 * a shared checkout is not the place to reach across a territory line for a
 * five-character edit.
 *
 * They are listed rather than skipped because AAA 6.19's own note is the house
 * ruling on this shape: a criterion "being silently waived in the meantime …
 * is worse than either answer — a criterion no critic can pass or fail." Each
 * entry is the exact offending string and the exact patch. The test in
 * tests/typography.test.ts asserts this list is neither incomplete NOR STALE,
 * so fixing one and leaving its entry behind fails just as loudly as not
 * fixing it. Deleting the line is the whole of the follow-up.
 *
 * ROUND 8 (round-13 tree): all five were patched by the verifier — TwistleView
 * won’t/isn’t, HiveView you’ve, deck.ts Posy’s ×2 — so the list is now EMPTY,
 * which is the state it is supposed to reach. It stays exported (and stays
 * asserted-non-stale) so the next round's named defect has a place to sign,
 * not because anything is outstanding.
 */
export const SOURCE_COPY_EXCEPTIONS: readonly string[] = [];
/** Template literals arrive with their `${…}` holes blanked, so they are
 *  matched by the words around the mark rather than by the whole line. */
export const SOURCE_COPY_EXCEPTION_FRAGMENTS: readonly string[] = [];

const isExcepted = (p: QuoteProblem): boolean =>
  SOURCE_COPY_EXCEPTIONS.includes(p.text.trim()) ||
  SOURCE_COPY_EXCEPTION_FRAGMENTS.some((f) => p.text.includes(f));

/** Source-copy problems nobody has signed for. This is the one that must be []. */
export function outstandingSourceCopyProblems(root: string = SRC_ROOT): QuoteProblem[] {
  return lintSourceCopy(root).filter((p) => !isExcepted(p));
}

/** Listed exceptions that no longer correspond to a real hit — i.e. fixed. */
export function staleSourceCopyExceptions(root: string = SRC_ROOT): string[] {
  const found = lintSourceCopy(root);
  const live = (needle: string) =>
    found.some((p) => p.text.trim() === needle || p.text.includes(needle));
  return [...SOURCE_COPY_EXCEPTIONS, ...SOURCE_COPY_EXCEPTION_FRAGMENTS].filter((e) => !live(e));
}

const invokedDirectly = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url).replace(/\\/g, '/').endsWith(
    process.argv[1].replace(/\\/g, '/').split('/').slice(-2).join('/'),
  );

if (invokedDirectly) {
  if (process.argv.includes('--fix')) {
    const changed = fixShippedTypography();
    for (const f of changed) console.log(`↻ ${f}`);
    console.log(`${changed.length} file(s) typeset.`);
  }
  const problems = [...lintAuthoredTypography(), ...outstandingSourceCopyProblems()];
  const stale = staleSourceCopyExceptions();
  for (const e of stale) {
    console.error(`✗ SOURCE_COPY_EXCEPTIONS still lists "${e}", which is fixed — delete the line.`);
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`✗ ${formatQuoteProblem(p)}`);
    console.error(`\n${problems.length} straight quote(s) in shipped copy.`);
    console.error('Run `npx tsx content/lint-typography.ts --fix` to apply the patch above.');
  }
  if (problems.length > 0 || stale.length > 0) process.exit(1);

  const signed = SOURCE_COPY_EXCEPTIONS.length + SOURCE_COPY_EXCEPTION_FRAGMENTS.length;
  console.log(`✓ typography: ${authoredFiles().length} shipped files, no straight quotes`);
  console.log(
    `  source copy: ${sourceFiles().length} files clean, ${signed} named exception(s) outstanding`,
  );
  for (const p of lintSourceCopy().filter(isExcepted)) {
    console.log(`  · ${p.where}: ${p.text.trim()}  →  ${p.suggestion.trim()}`);
  }
}
