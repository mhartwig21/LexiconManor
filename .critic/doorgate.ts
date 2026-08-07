import { simulateCampaigns, medianOf, quantileOf, PROFILE_DECENT, PROFILE_SKILLED } from '../src/engine/economy/simulate';
import { createRng } from '../src/engine/rng';

/** Re-score published campaigns with the LIVE gate: standing on the landing is
 *  not enough — the drafted landing room must also open north (atSanctumDoor). */
function rescore(camps: any[], p: number, seed: number) {
  const rng = createRng(seed);
  const out = camps.map((c) => {
    let first: number|null = null, win: number|null = null;
    for (let i=0;i<c.days.length;i++){
      const atDoor = c.days[i].reachedSanctum && rng() < p;
      if (atDoor && first===null) first = i+1;
      if (atDoor && win===null && c.deductionDay!==null && (i+1)>=c.deductionDay) win = i+1;
    }
    return { first, win };
  });
  return out;
}
const N=400,D=45,NEVER=1e9;
for (const [name,prof] of [['DECENT',PROFILE_DECENT],['SKILLED',PROFILE_SKILLED]] as const){
  const camps = simulateCampaigns(prof as any, N, D, 4242);
  for (const [label,p] of [['as simulated (no door gate)',1],['picks the north card when offered (p=0.61)',0.608],['takes a card at random (p=0.28)',0.277]] as const){
    const r = rescore(camps, p as number, 99);
    const first = r.map(x=>x.first??NEVER), win = r.map(x=>x.win??NEVER);
    const fh = first.filter(x=>x!==NEVER), wh = win.filter(x=>x!==NEVER);
    console.log(`${name.padEnd(8)} ${String(label).padEnd(42)} first: med ${medianOf(first)} p90 ${quantileOf(first,.9)} never ${(100*(1-fh.length/N)).toFixed(1)}% | win: med ${medianOf(win)} never45 ${(100*(1-wh.length/N)).toFixed(1)}%`);
  }
  console.log('');
}
