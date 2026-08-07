/**
 * REVIEW_AA metric re-measurement (round 17 / verification round 10).
 *
 * Re-runs the very numbers §1, §5.1, §5.2 and §8 published, on the profile the
 * review used (PROFILE_DECENT — "the MEDIAN evening… i.e. the owner"), so
 * movement can be SEEN rather than claimed. Nothing here is a test: every band
 * printed below is pinned in tests/economy-simulation.test.ts and
 * tests/volume-pacing.test.ts, and this script drives the SAME instruments
 * (`simulateCampaigns`, `tests/support/fragment-drip.ts`) so the report and the
 * suite cannot disagree.
 *
 *   npx tsx scripts/measure-review-metrics.ts
 */
import {
  PROFILE_DECENT, PROFILE_SKILLED, simulateCampaigns, medianOf, quantileOf,
} from '../src/engine/economy/simulate';
import { fragmentDays, legibleDayShare, legibleOwedDayShare } from '../tests/support/fragment-drip';

const NEVER = 1e9;
const N = 200;
const DAYS = 45;
const SEEDS = [0x1234, 0x9911, 0x2f2f, 0xabc1];

const share = (xs: number[], p: (n: number) => boolean) => xs.filter(p).length / xs.length;
const fmt = (n: number) => (n >= NEVER ? 'never' : String(n));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function campaignMetrics(profile: typeof PROFILE_DECENT, label: string) {
  const all = SEEDS.flatMap((s) => simulateCampaigns(profile, N, DAYS, s));
  const speak = all.map((c) => c.firstSpeakDay ?? NEVER);
  const landing = all.map((c) => c.firstLandingDay ?? NEVER);
  const door = all.map((c) => c.firstSanctumReachDay ?? NEVER);
  const win = all.map((c) => c.volumeWinDay ?? NEVER);
  const answered = all.map((c) => c.answeredDay ?? NEVER);
  const deduce = all.map((c) => c.deductionDay ?? NEVER);

  console.log(`\n### ${label}  (n=${all.length}, ${DAYS}-day window)`);
  console.log(`  (a) first SAYS A WORD to the Sanctum   median ${fmt(medianOf(speak))}   p90 ${fmt(quantileOf(speak, 0.9))}   <=3: ${pct(share(speak, (d) => d <= 3))}   never: ${pct(share(speak, (d) => d >= NEVER))}`);
  console.log(`      first day she NAMES the true word  median ${fmt(medianOf(answered))}`);
  console.log(`  (c) first LANDING day                  median ${fmt(medianOf(landing))}   never: ${pct(share(landing, (d) => d >= NEVER))}`);
  console.log(`      first DOOR day (at-door gate)      median ${fmt(medianOf(door))}   never: ${pct(share(door, (d) => d >= NEVER))}`);
  console.log(`      deduction day                      median ${fmt(medianOf(deduce))}`);
  console.log(`      VOLUME WIN day                     median ${fmt(medianOf(win))}   never<=45: ${pct(share(win, (d) => d >= NEVER))}`);
  console.log(`      win <=45 ${pct(share(win, (d) => d <= 45))} · <=35 ${pct(share(win, (d) => d <= 35))} · <=28 ${pct(share(win, (d) => d <= 28))} · <=7 ${pct(share(win, (d) => d <= 7))}`);
  console.log(`      per-seed win medians: ${SEEDS.map((s) => medianOf(simulateCampaigns(profile, 150, DAYS, s).map((c) => c.volumeWinDay ?? NEVER))).map(fmt).join(', ')}`);
  console.log(`      per-seed reach medians: ${SEEDS.map((s) => medianOf(simulateCampaigns(profile, 150, DAYS, s).map((c) => c.firstSanctumReachDay ?? NEVER))).map(fmt).join(', ')}`);
}

// --- (b) + the volume horizon, through the REAL content and channels --------
function dripMetrics(profile: typeof PROFILE_DECENT, label: string) {
  const CAMPAIGNS = 240;
  const HORIZON = 60;
  const runs = Array.from(
    { length: CAMPAIGNS },
    (_, i) => fragmentDays((0x51ce + i * 0x9e37) | 0, HORIZON, profile),
  );
  const shares14 = runs.map((r) => legibleDayShare(r, 14));
  const owed14 = runs.map((r) => legibleOwedDayShare(r, 14));
  const day16 = runs.map((r) => r.legible[16] ?? HORIZON + 1);
  const day16Filed = runs.map((r) => r.filed[16] ?? HORIZON + 1);
  const day1 = runs.map((r) => (r.perDay[0]!.legible > 0 ? 1 : 0));

  console.log(`\n### fragment drip — ${label}  (${CAMPAIGNS} seeded campaigns over the real volume)`);
  console.log(`  (b) legible-fragment days / first 14   mean ${(shares14.reduce((a, b) => a + b, 0) / shares14.length).toFixed(3)}   min ${Math.min(...shares14).toFixed(3)}   p10 ${quantileOf(shares14, 0.1).toFixed(3)}   campaigns >=0.90: ${pct(share(shares14, (x) => x >= 0.9))}`);
  console.log(`      ...restricted to days still OWED   mean ${(owed14.reduce((a, b) => a + b, 0) / owed14.length).toFixed(3)}   min ${Math.min(...owed14).toFixed(3)}   p10 ${quantileOf(owed14, 0.1).toFixed(3)}   campaigns >=0.90: ${pct(share(owed14, (x) => x >= 0.9))}`);
  console.log(`      day 1 files something legible:     ${pct(day1.reduce((a, b) => a + b, 0) / day1.length)}`);
  console.log(`      LEGIBLE fragment 16   median ${medianOf(day16)}  p10 ${quantileOf(day16, 0.1)}  p90 ${quantileOf(day16, 0.9)}  max ${Math.max(...day16)}`);
  console.log(`      FILED   fragment 16   median ${medianOf(day16Filed)}  p10 ${quantileOf(day16Filed, 0.1)}  p90 ${quantileOf(day16Filed, 0.9)}  max ${Math.max(...day16Filed)}`);
}

console.log('REVIEW_AA re-measurement — the review\'s own metrics, re-run at HEAD');
campaignMetrics(PROFILE_DECENT, "PROFILE_DECENT — the review's profile");
campaignMetrics(PROFILE_SKILLED, 'PROFILE_SKILLED');
dripMetrics(PROFILE_DECENT, 'PROFILE_DECENT (a competent evening)');
dripMetrics(PROFILE_SKILLED, 'PROFILE_SKILLED');
