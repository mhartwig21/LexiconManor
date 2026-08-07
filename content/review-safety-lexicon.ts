/**
 * content/review-safety-lexicon.ts — the human-review tool for the gate.
 *
 * Prints EVERY enable1 word the safety lexicon blocks, grouped by the rule
 * that blocks it, so a person can look at the collateral before shipping a
 * new rule. This is the working half of the Scunthorpe discipline described in
 * `content/lib/safety.ts`: `tests/content-safety.test.ts` enforces that every
 * innocent carrier you already found stays listed, but only reading this
 * output tells you which carriers exist in the first place.
 *
 *   npx tsx content/review-safety-lexicon.ts             # everything
 *   npx tsx content/review-safety-lexicon.ts illness     # one category
 *   npx tsx content/review-safety-lexicon.ts :retard     # one rule
 *
 * Not wired into any build step — it answers a question, it does not gate.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offenceOf } from './lib/safety';

const here = dirname(fileURLToPath(import.meta.url));
const enable = readFileSync(join(here, 'data', 'enable1.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
const byCat = new Map<string, string[]>();
let n = 0;
for (const w of enable) {
  const r = offenceOf(w);
  if (!r) continue;
  n++;
  const k = `${r.category}:${r.stem}`;
  (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(w);
}
console.log(`blocked ${n} of ${enable.length} ENABLE words (${(100 * n / enable.length).toFixed(2)}%)`);
const arg = process.argv[2];
for (const [k, ws] of [...byCat].sort()) {
  if (arg && !k.includes(arg)) continue;
  console.log(`${k} (${ws.length}): ${ws.slice(0, 60).join(' ')}${ws.length > 60 ? ' …' : ''}`);
}
