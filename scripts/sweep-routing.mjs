/**
 * Scratch: sweep how many fragments the lintel channel carries, and report the
 * two quantities that are in tension — REVIEW_AA §5.1's legible-day rate and
 * AAA 4.10e's campaign length. Rewrites the volume JSON per candidate, shells
 * out (both models read the JSON at module load), restores at the end.
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PATH = 'content/authored/volumes/volume-1.json';
const BACKUP = 'volume-1.sweep-backup.json';
copyFileSync(PATH, BACKUP);

const base = JSON.parse(readFileSync(BACKUP, 'utf8'));

// Candidate lintel sets, in reveal order — always keeping v1-d1 (revealOrder 1,
// the day-1 definition line §5.1 demands) at the head.
const LINTEL_ORDER = ['v1-d1', 'v1-e1', 'v1-d2', 'v1-e2', 'v1-e3', 'v1-d4', 'v1-e5', 'v1-d5', 'v1-e4', 'v1-e6'];
const STUDY = ['v1-d3', 'v1-d6'];

function apply(nLintel) {
  const lintel = new Set(LINTEL_ORDER.slice(0, nLintel));
  const v = JSON.parse(JSON.stringify(base));
  for (const f of v.fragments) {
    if (STUDY.includes(f.id)) { f.channel = 'study'; continue; }
    if (lintel.has(f.id)) f.channel = 'lintel';
    else delete f.channel;           // falls back to inference => violet/parlor only
  }
  writeFileSync(PATH, JSON.stringify(v, null, 2) + '\n');
}

console.log('nLintel | DECENT win | SKILLED win | SKILLED<=7 | DECENT legible14 | owed14 | frag16(D)');
for (const n of [2, 4, 5, 6, 7, 8, 9, 10]) {
  apply(n);
  const out = execFileSync('npx', ['tsx', 'scripts/sweep-probe.ts'], { encoding: 'utf8', shell: true });
  console.log(String(n).padStart(7) + ' | ' + out.trim());
}

copyFileSync(BACKUP, PATH);
console.log('\nrestored', PATH);
