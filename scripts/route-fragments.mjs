/**
 * REVIEW_AA §5.1 routing pass, applied as data rather than by hand so the
 * table below IS the decision and can be re-read in one screen.
 *
 * `channel` = which SOLVE pays the page (absent → the violet drip / a parlor
 * scene owns it). `sourceRoomCategory` = where the fiction puts it.
 *
 *   node scripts/route-fragments.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = new URL('../content/authored/volumes/volume-1.json', import.meta.url);

/** id → channel ('' = no solve channel; the drip or a character owns it) */
const ROUTE = {
  'v1-d1': 'lintel', // order  1 — THE DAY-ONE LINE. §5.1's explicit ask.
  'v1-e1': 'lintel', // order  2 — "six letters"
  'v1-t2': '',       // order  3 — parlor
  'v1-d2': 'lintel', // order  4
  'v1-e2': '',       // order  5 — drip
  'v1-t4': '',       // order  6 — parlor
  'v1-d3': 'study',  // order  7 — the Study's own unfinished entry
  'v1-e3': 'lintel', // order  8 — "begins with L"
  'v1-t3': '',       // order  9 — parlor
  'v1-d4': 'lintel', // order 10 — keeps the channel alive through week two
  'v1-e5': 'lintel', // order 11
  'v1-t1': '',       // order 12 — parlor
  'v1-d5': 'lintel', // order 13 — a late line an ordinary solve still pays
  'v1-e4': '',       // order 14 — drip
  'v1-d6': 'study',  // order 15
  'v1-e6': '',       // order 16 — the tie-breaker stays behind the climb
  'v1-t5': '',       // order 17 — parlor
};

const vol = JSON.parse(readFileSync(PATH, 'utf8'));
for (const f of vol.fragments) {
  if (!(f.id in ROUTE)) throw new Error(`unrouted fragment ${f.id}`);
  const ch = ROUTE[f.id];
  if (ch) f.channel = ch;
  else delete f.channel;
}
writeFileSync(PATH, `${JSON.stringify(vol, null, 2)}\n`, 'utf8');

const count = (c) => vol.fragments.filter((f) => f.channel === c).length;
console.log(`lintel ${count('lintel')}  study ${count('study')}  unchanneled ${count(undefined)}`);
