/**
 * Straight-quote lint over authored content — OWNER: A2 (round 6).
 *
 *   npx tsx content/lint-typography.ts
 *
 * Exits non-zero on any U+0022 (") or U+0027 (') in a shipped authored string.
 * Wired into `content:verify`; the same pure walk runs in
 * `tests/typography.test.ts`, so `vitest run` enforces it too.
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
 * The fix is always mechanical — `typeset()` prints the correct line for every
 * problem it reports, so a failure comes with its own patch.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatQuoteProblem, walkForStraightQuotes, type QuoteProblem } from './lib/typography';

const here = dirname(fileURLToPath(import.meta.url));
export const AUTHORED_ROOT = join(here, 'authored');

/** Every authored JSON file, recursively. */
export function authoredFiles(root: string = AUTHORED_ROOT): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.json')) out.push(full);
    }
  };
  walk(root);
  return out;
}

/** Lint the authored corpus. Returns [] when every mark is properly set. */
export function lintAuthoredTypography(root: string = AUTHORED_ROOT): QuoteProblem[] {
  const problems: QuoteProblem[] = [];
  for (const file of authoredFiles(root)) {
    const where = relative(join(here, '..'), file).replace(/\\/g, '/');
    problems.push(...walkForStraightQuotes(JSON.parse(readFileSync(file, 'utf-8')), where));
  }
  return problems;
}

const invokedDirectly = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url).replace(/\\/g, '/').endsWith(
    process.argv[1].replace(/\\/g, '/').split('/').slice(-2).join('/'),
  );

if (invokedDirectly) {
  const problems = lintAuthoredTypography();
  if (problems.length > 0) {
    for (const p of problems) console.error(`✗ ${formatQuoteProblem(p)}`);
    console.error(`\n${problems.length} straight quote(s) in authored copy.`);
    process.exit(1);
  }
  console.log(`✓ typography: ${authoredFiles().length} authored files, no straight quotes`);
}
