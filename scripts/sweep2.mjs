import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const VOL = 'content/authored/volumes/volume-1.json';
const SIM = 'src/engine/economy/simulate.ts';
const VOLTS = 'src/engine/volume.ts';
const volBak = readFileSync(VOL, 'utf8');
const simBak = readFileSync(SIM, 'utf8');
const vtsBak = readFileSync(VOLTS, 'utf8');

const LINTEL_SETS = {
  L5: ['v1-d1', 'v1-e1', 'v1-d2', 'v1-e3', 'v1-d5'],
  L7: ['v1-d1', 'v1-e1', 'v1-d2', 'v1-e3', 'v1-d5', 'v1-d4', 'v1-e5'],
  L8: ['v1-d1', 'v1-e1', 'v1-d2', 'v1-e3', 'v1-d5', 'v1-d4', 'v1-e5', 'v1-e2'],
};

try {
  for (const [name, lintel] of Object.entries(LINTEL_SETS)) {
    for (const pity of [2, 1]) {
      for (const floor of [13, 14, 15]) {
        const vol = JSON.parse(volBak);
        for (const f of vol.fragments) {
          if (lintel.includes(f.id)) f.channel = 'lintel';
          else if (f.id === 'v1-d3' || f.id === 'v1-d6') f.channel = 'study';
          else delete f.channel;
        }
        writeFileSync(VOL, `${JSON.stringify(vol, null, 2)}\n`);
        writeFileSync(SIM, simBak.replace(/pityDays: \d+/, `pityDays: ${pity}`));
        writeFileSync(VOLTS, vtsBak.replace(
          /FRAGMENTS_TO_DEDUCE: readonly \[number, number\] = \[\d+, 17\]/,
          `FRAGMENTS_TO_DEDUCE: readonly [number, number] = [${floor}, 17]`));
        const out = execFileSync('npx', ['tsx', 'scripts/review-metrics.ts'], {
          encoding: 'utf8', shell: true,
        });
        const g = (b, re) => (b.match(re) || [, '?'])[1];
        const dec = out.split('PROFILE_SKILLED')[0];
        const ski = out.split('PROFILE_SKILLED')[1];
        console.log(
          `${name} pity=${pity} floor=${floor} | DEC leg ${g(dec, /first 14 (\S+)/)} win d${g(dec, /VOLUME WIN\s+median day (\d+)/)} w7 ${g(dec, /walkover\)\s+(\S+)/)} n45 ${g(dec, /tail\)\s+(\S+)/)}`
          + ` || SKI leg ${g(ski, /first 14 (\S+)/)} win d${g(ski, /VOLUME WIN\s+median day (\d+)/)} w7 ${g(ski, /walkover\)\s+(\S+)/)}`,
        );
      }
    }
  }
} finally {
  writeFileSync(VOL, volBak);
  writeFileSync(SIM, simBak);
  writeFileSync(VOLTS, vtsBak);
  console.log('(restored)');
}
