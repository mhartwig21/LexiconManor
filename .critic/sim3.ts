import { simulateCampaigns, simulateDays, medianOf, quantileOf, PROFILE_DECENT, PROFILE_SKILLED, PROFILE_GREAT, PROFILE_SKIPPER, campaignProfileForDay, simulateDay, reserveToTop } from '../src/engine/economy/simulate';
import { createRng } from '../src/engine/rng';
import { BASE_DAY_BUDGET } from '../src/engine/economy/steps';

const N=400, D=45;
const c = simulateCampaigns(PROFILE_DECENT, N, D, 77);
console.log('### 4.10b/f — DECENT minutes per day across the campaign');
for (const d of [1,2,3,5,8,12,15,20,25,30,35,40,45]) {
  const m = c.map(x=>x.days[d-1]!.minutes);
  const rooms = c.map(x=>x.days[d-1]!.rooms);
  console.log(`  day ${String(d).padStart(2)}: med=${medianOf(m).toFixed(1)}min p90=${quantileOf(m,.9).toFixed(1)} rooms med=${medianOf(rooms)} solved med=${medianOf(c.map(x=>x.days[d-1]!.roomsSolved))}`);
}
console.log('\n### 4.10a — SKIPPER');
const sk = simulateDays(PROFILE_SKIPPER, 500, 9);
console.log(`  maxRow med=${medianOf(sk.map(d=>d.maxRow))} p90=${quantileOf(sk.map(d=>d.maxRow),.9)} max=${Math.max(...sk.map(d=>d.maxRow))} minutes med=${medianOf(sk.map(d=>d.minutes)).toFixed(1)} reachedSanctum=${(100*sk.filter(d=>d.reachedSanctum).length/500).toFixed(1)}%`);
console.log('\n### 4.10c — GREAT single days');
const gr = simulateDays(PROFILE_GREAT, 500, 11);
console.log(`  maxRow med=${medianOf(gr.map(d=>d.maxRow))} p90=${quantileOf(gr.map(d=>d.maxRow),.9)} landing=${(100*gr.filter(d=>d.reachedSanctum).length/500).toFixed(1)}%`);
console.log('\n### 4.10d invariant');
console.log(`  reserveToTop(1, skilled walkback 0) = ${reserveToTop(1,{walkbackPerRow:0})} vs BASE_DAY_BUDGET ${BASE_DAY_BUDGET}`);

console.log('\n### 4.10g — the seal, both profiles');
for (const [name, prof] of [['DECENT',PROFILE_DECENT],['SKILLED',PROFILE_SKILLED]] as const){
  const cc = simulateCampaigns(prof as any, N, D, 31);
  const all = cc.flatMap(x=>x.days);
  const violetDays = all.filter(d=>d.fragmentsFound>0).length/all.length;
  const madeOut = all.filter(d=>d.pagesMadeOut>0).length/all.length;
  const overnight = all.filter(d=>d.sealedBacklog>0).length/all.length;
  const backlogMed = medianOf(all.map(d=>d.sealedBacklog));
  console.log(`  ${name}: violet-met ${(100*violetDays).toFixed(1)}% | made-out day ${(100*madeOut).toFixed(1)}% | sealed overnight ${(100*overnight).toFixed(1)}% | backlog med ${backlogMed} p90 ${quantileOf(all.map(d=>d.sealedBacklog),.9)}`);
  // solver-of-nothing tripwire
}
