/**
 * A7 (dialogue-mystery) round-14 measurements.
 *  - the silent band: days between `legible >= THIN_FILE_THRESHOLD` and
 *    `legible >= fragmentsToDeduce[0]` (AAA 4.16)
 *  - the knowing-but-locked-out gap (AAA 5.1/5.2)
 *  - the seal, both profiles (AAA 4.10g)
 */
import {
  simulateCampaigns, medianOf, quantileOf, PROFILE_DECENT, PROFILE_SKILLED, KNOWLEDGE,
} from '../src/engine/economy/simulate';
import { THIN_FILE_THRESHOLD } from '../src/engine/journal';

const N = 400, D = 45;

for (const [name, prof] of [['DECENT', PROFILE_DECENT], ['SKILLED', PROFILE_SKILLED]] as const) {
  const cc = simulateCampaigns(prof as never, N, D, 31);
  const all = cc.flatMap((x) => x.days);
  const pct = (n: number) => `${(100 * n / all.length).toFixed(1)}%`;
  console.log(`\n### ${name}`);
  console.log(`  violet-met ${pct(all.filter((d) => d.fragmentsFound > 0).length)}`
    + ` | made-out day ${pct(all.filter((d) => d.pagesMadeOut > 0).length)}`
    + ` | sealed overnight ${pct(all.filter((d) => d.sealedBacklog > 0).length)}`
    + ` | backlog med ${medianOf(all.map((d) => d.sealedBacklog))}`
    + ` p90 ${quantileOf(all.map((d) => d.sealedBacklog), 0.9)}`);

  // Re-derive the legible curve per campaign day by replaying the recorded
  // deduction/landing days (SimCampaignResult exposes the endpoints only, so
  // the band is measured from those plus the model's own thresholds).
  const ded = cc.map((c) => c.deductionDay).filter((d): d is number => d !== null);
  const land = cc.map((c) => c.firstSanctumReachDay).filter((d): d is number => d !== null);
  const win = cc.map((c) => c.volumeWinDay).filter((d): d is number => d !== null);
  console.log(`  deduction med ${medianOf(ded)} (n=${ded.length})`
    + ` | first landing med ${medianOf(land)} (n=${land.length})`
    + ` | win med ${medianOf(win)} (n=${win.length})`);
  // The knowing-but-locked-out gap: days between knowing the word and winning.
  const gaps = cc.filter((c) => c.deductionDay !== null && c.volumeWinDay !== null)
    .map((c) => c.volumeWinDay! - c.deductionDay!);
  console.log(`  knowing-but-locked-out gap med ${medianOf(gaps)} p90 ${quantileOf(gaps, 0.9)}`);
  console.log(`  fragmentsNeeded band ${KNOWLEDGE.fragmentsToDeduce.join('..')}`
    + ` | THIN_FILE_THRESHOLD ${THIN_FILE_THRESHOLD}`);
}
