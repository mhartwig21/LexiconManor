import { simulateCampaigns, medianOf, quantileOf, PROFILE_DECENT, PROFILE_SKILLED, PROFILE_GREAT, simulateDays } from '../src/engine/economy/simulate';

function stats(name: string, profile: any, seeds: number[], n = 300, days = 45) {
  console.log(`\n=== ${name} (${n} campaigns/seed, ${days} days) ===`);
  for (const seed of seeds) {
    const c = simulateCampaigns(profile, n, days, seed);
    const reach = c.map(x => x.firstSanctumReachDay);
    const win = c.map(x => x.volumeWinDay);
    const ded = c.map(x => x.deductionDay);
    const reachHit = reach.filter(x => x !== null) as number[];
    const winHit = win.filter(x => x !== null) as number[];
    const dedHit = ded.filter(x => x !== null) as number[];
    const pct = (a: number) => (100*a).toFixed(1)+'%';
    console.log(
      `seed ${seed}: reach med=${medianOf(reachHit)} p75=${quantileOf(reachHit,0.75)} p90=${quantileOf(reachHit,0.9)} never=${pct(1-reachHit.length/n)} day1=${pct(reach.filter(d=>d===1).length/n)} | ` +
      `deduce med=${dedHit.length?medianOf(dedHit):'-'} never=${pct(1-dedHit.length/n)} | ` +
      `win med=${winHit.length?medianOf(winHit):'-'} p75=${winHit.length?quantileOf(winHit,0.75):'-'} never45=${pct(1-winHit.length/n)} by35=${pct(win.filter(d=>d!==null&&d<=35).length/n)} wk1=${pct(win.filter(d=>d!==null&&d<=7).length/n)}`
    );
  }
}
const seeds = [1,2,3,4,5,101,202,303];
stats('DECENT', PROFILE_DECENT, seeds);
stats('SKILLED', PROFILE_SKILLED, seeds);
