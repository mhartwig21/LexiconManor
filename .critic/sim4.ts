import { simulateCampaigns, medianOf, quantileOf, PROFILE_DECENT, PROFILE_SKILLED } from '../src/engine/economy/simulate';
const N=300,D=45;
console.log('### late-campaign clock (days 31-45), never measured by any test');
for (const [name,prof] of [['DECENT',PROFILE_DECENT],['SKILLED',PROFILE_SKILLED]] as const){
  for (const seed of [0x1234,0x9911,0x2f2f,0xabc1]) {
    const c = simulateCampaigns(prof as any, N, D, seed);
    const w = (a:number,b:number)=>c.flatMap(x=>x.days.slice(a,b)).map(d=>d.minutes);
    const early=w(0,10), mid=w(19,30), late=w(30,45);
    console.log(`  ${name} seed ${seed.toString(16)}: early med ${medianOf(early).toFixed(1)} p90 ${quantileOf(early,.9).toFixed(1)} | mid med ${medianOf(mid).toFixed(1)} p90 ${quantileOf(mid,.9).toFixed(1)} | LATE med ${medianOf(late).toFixed(1)} p90 ${quantileOf(late,.9).toFixed(1)} p95 ${quantileOf(late,.95).toFixed(1)}`);
  }
}
console.log('\n### decent win median including NEVER (as the test computes it)');
for (const seed of [0x1234,0x9911,0x2f2f,0xabc1]) {
  const c = simulateCampaigns(PROFILE_DECENT, 150, D, seed);
  const NEVER=1e9;
  const win=c.map(x=>x.volumeWinDay??NEVER), reach=c.map(x=>x.firstSanctumReachDay??NEVER);
  console.log(`  seed ${seed.toString(16)}: reach med ${medianOf(reach)} win med ${medianOf(win)} never-win ${(100*win.filter(d=>d===NEVER).length/150).toFixed(1)}% never-reach ${(100*reach.filter(d=>d===NEVER).length/150).toFixed(1)}%`);
}
