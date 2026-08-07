import { simulateCampaigns, medianOf, quantileOf, PROFILE_DECENT, PROFILE_SKILLED } from '../src/engine/economy/simulate';
for (const [name, prof] of [['DECENT', PROFILE_DECENT], ['SKILLED', PROFILE_SKILLED]] as const) {
  for (const [N, seed] of [[200, 31], [200, 77], [400, 31], [120, 5]] as const) {
    const all = simulateCampaigns(prof as never, N, 45, seed).flatMap((c) => c.days);
    const r = (f: (d: typeof all[number]) => boolean) => (100 * all.filter(f).length / all.length).toFixed(1);
    console.log(`${name} N=${N} seed=${seed}: violet ${r((d) => d.fragmentsFound > 0)}% madeOut ${r((d) => d.pagesMadeOut > 0)}% overnight ${r((d) => d.sealedBacklog > 0)}% backlogMed ${medianOf(all.map((d) => d.sealedBacklog))} p90 ${quantileOf(all.map((d) => d.sealedBacklog), 0.9)}`);
  }
}
