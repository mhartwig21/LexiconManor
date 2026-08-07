/**
 * Sweep the two levers that trade REVIEW_AA §5.1's daily-legibility target
 * against §5's "never a first-week walkover", so the choice is made on measured
 * numbers instead of taste.  node scripts/sweep.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const VOL = 'content/authored/volumes/volume-1.json';
const SIM = 'src/engine/economy/simulate.ts';
const volBak = readFileSync(VOL, 'utf8');
const simBak = readFileSync(SIM, 'utf8');

// candidate lintel sets (study is always d3+d6)
const LINTEL_SETS = {
  L5: ['v1-d1', 'v1-e1', 'v1-d2', 'v1-e3', 'v1-d5'],
  L6: ['v1-d1', 'v1-e1', 'v1-d2', 'v1-e3', 'v1-d5', 'v1-d4'],
  L7: ['v1-d1', 'v1-e1', 'v1-d2', 'v1-e3', 'v1-d5', 'v1-d4', 'v1-e5'],
  L8: ['v1-d1', 'v1-e1', 'v1-d2', 'v1-e3', 'v1-d5', 'v1-d4', 'v1-e5', 'v1-e2'],
};

try {
  for (const [name, lintel] of Object.entries(LINTEL_SETS)) {
    for (const pity of [3, 2, 1]) {
      const vol = JSON.parse(volBak);
      for (const f of vol.fragments) {
        if (lintel.includes(f.id)) f.channel = 'lintel';
        else if (f.id === 'v1-d3' || f.id === 'v1-d6') f.channel = 'study';
        else delete f.channel;
      }
      writeFileSync(VOL, `${JSON.stringify(vol, null, 2)}\n`);
      writeFileSync(SIM, simBak.replace(/pityDays: \d+/, `pityDays: ${pity}`));
      const out = execFileSync('npx', ['tsx', 'scripts/review-metrics.ts'], {
        encoding: 'utf8', shell: true,
      });
      const grab = (block, re) => (block.match(re) || [, '?'])[1];
      const dec = out.split('PROFILE_SKILLED')[0];
      const ski = out.split('PROFILE_SKILLED')[1];
      console.log(
        `${name} pity=${pity} | DECENT legible ${grab(dec, /first 14 (\S+)/)} win d${grab(dec, /VOLUME WIN\s+median day (\d+)/)} <=7d ${grab(dec, /walkover\)\s+(\S+)/)}`
        + ` || SKILLED legible ${grab(ski, /first 14 (\S+)/)} win d${grab(ski, /VOLUME WIN\s+median day (\d+)/)} <=7d ${grab(ski, /walkover\)\s+(\S+)/)}`,
      );
    }
  }
} finally {
  writeFileSync(VOL, volBak);
  writeFileSync(SIM, simBak);
  console.log('(restored)');
}
