import { simulateCampaigns, medianOf, quantileOf, PROFILE_DECENT, PROFILE_SKILLED, campaignProfileForDay } from '../src/engine/economy/simulate';

const N=400, D=60;
for (const [name, prof] of [['DECENT', PROFILE_DECENT], ['SKILLED', PROFILE_SKILLED]] as const) {
  const c = simulateCampaigns(prof as any, N, D, 77);
  console.log(`\n### ${name} — per-day P(stands on landing that day)`);
  const line: string[] = [];
  for (let d=1; d<=D; d++) {
    const p = c.filter(x=>x.days[d-1]!.reachedSanctum).length/N;
    line.push(`${d}:${(100*p).toFixed(0)}`);
  }
  console.log(line.join(' '));
  // gap between knowing and winning
  const gaps = c.filter(x=>x.volumeWinDay&&x.deductionDay).map(x=>x.volumeWinDay!-x.deductionDay!);
  console.log(`knew-but-locked-out gap: med=${medianOf(gaps)} p75=${quantileOf(gaps,.75)} p90=${quantileOf(gaps,.9)} max=${Math.max(...gaps)}`);
  const never = c.filter(x=>x.volumeWinDay===null);
  console.log(`unfinished in ${D} days: ${(100*never.length/N).toFixed(1)}% ; of those, knew the word: ${never.filter(x=>x.deductionDay!==null).length}/${never.length}`);
  const nr = c.filter(x=>x.firstSanctumReachDay===null);
  console.log(`never reached landing in ${D} days: ${(100*nr.length/N).toFixed(1)}%`);
  // arc flatness
  console.log('arc: day/tea/dawnKeys/pushBias/walkback/keyLuck');
  for (const d of [1,3,6,9,12,15,20,30,45]) {
    const p = campaignProfileForDay(prof as any, d);
    console.log(`  d${d}: tea=${p.brambleAffinity} dawnKeys=${p.dawnKeys} push=${p.pushBias.toFixed(3)} walk=${p.walkbackPerRow.toFixed(3)} keyLuck=${p.keyLuck.toFixed(3)}`);
  }
}
