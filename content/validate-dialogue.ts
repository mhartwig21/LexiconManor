/**
 * Dialogue content validator — OWNER: A6 (Dialogue). Build-time gate
 * (ARCHITECTURE §5, AAA 5.5/5.6/5.11): run with
 *
 *   npx tsx content/validate-dialogue.ts
 *
 * Exits non-zero on any issue. The same pure validator runs in
 * tests/dialogue-content.test.ts, so `vitest run` also enforces it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DialogueFile } from '../src/engine/dialogue/schema';
import { validateDialogueSet } from '../src/engine/dialogue/validate';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'authored', 'dialogue');

const files: DialogueFile[] = [];
for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const raw = JSON.parse(readFileSync(join(dir, name), 'utf-8')) as DialogueFile;
  if (`${raw.character}.json` !== name) {
    console.error(`✗ ${name}: file name does not match character "${raw.character}"`);
    process.exit(1);
  }
  files.push(raw);
}

const issues = validateDialogueSet(files);

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`✗ [${issue.file}]${issue.nodeId ? ` ${issue.nodeId}:` : ''} ${issue.message}`);
  }
  console.error(`\n${issues.length} dialogue issue(s). Build blocked.`);
  process.exit(1);
}

const totals = files
  .map((f) => `${f.character}: ${f.nodes.length} nodes / ${f.nodes.reduce((n, x) => n + x.lines.length, 0)} lines`)
  .join('\n  ');
console.log(`✓ dialogue content valid\n  ${totals}`);
