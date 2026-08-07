/**
 * REVIEW_AA's own metrics, re-measured — so a round can show movement rather
 * than claim it.
 *
 *   npx tsx scripts/review-metrics.ts
 *
 * The review closes with: *"How to know it worked. Not by re-reading this
 * document. Re-run `simulateCampaigns(PROFILE_DECENT, …)` and require: first
 * Sanctum guess by median day ≤ 3; a legible fragment on ≥ 90% of the first 14
 * days; no day ending with more than ~20% of the budget unspent."* This script
 * is that instruction, executable, printing each number beside the one the
 * review published.
 *
 * NOTHING HERE IS A TEST. Every band it prints is pinned in
 * `tests/economy-simulation.test.ts` and `tests/volume-pacing.test.ts`, and it
 * drives the SAME instruments those files do (`simulateCampaigns`,
 * `tests/support/fragment-drip.ts`) so the report and the suite cannot
 * disagree. Two instruments measure the legible-day share and they answer
 * differently on purpose — see `dripMetrics` below.
 *
 * (Round 19: this file and `scripts/measure-review-metrics.ts` were two
 * overlapping copies of the same script, written a round apart by two killed
 * agents. They are one script now, under the name the engine comments already
 * point at.)
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
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function campaignMetrics(profile: typeof PROFILE_DECENT, label: string) {
  const all = SEEDS.flatMap((s) => simulateCampaigns(profile, N, DAYS, s));
  const speak = all.map((c) => c.firstSpeakDay ?? NEVER);
  const landing = all.map((c) => c.firstLandingDay ?? NEVER);
  const door = all.map((c) => c.firstSanctumReachDay ?? NEVER);
  const win = all.map((c) => c.volumeWinDay ?? NEVER);
  const answered = all.map((c) => c.answeredDay ?? NEVER);
  const deduce = all.map((c) => c.deductionDay ?? NEVER);

  // The campaign model's own view of the legible-day share, and the review's
  // third gate: "no day ending with more than ~20% of the budget unspent".
  let legibleHits = 0, legibleTotal = 0, filedHits = 0;
  for (const c of all) {
    for (const d of c.days.slice(0, 14)) {
      if ((d.legibleToday ?? 0) > 0) legibleHits++;
      if ((d.filedToday ?? 0) > 0) filedHits++;
      legibleTotal++;
    }
  }
  const unspent = all.flatMap((c) => c.days.map((d) => {
    const budget = d.spent - d.refunded + d.stepsLeft;
    return budget > 0 ? d.stepsLeft / budget : 0;
  }));

  console.log(`\n### ${label}  (n=${all.length}, ${DAYS}-day window)`);
  console.log(`  (a) first SAYS A WORD to the Sanctum   median ${fmt(medianOf(speak))}   p90 ${fmt(quantileOf(speak, 0.9))}   <=3: ${pct(share(speak, (d) => d <= 3))}   never: ${pct(share(speak, (d) => d >= NEVER))}`);
  console.log(`      first day she NAMES the true word  median ${fmt(medianOf(answered))}`);
  console.log(`  (b) legible-fragment days, first 14    ${pct(legibleHits / legibleTotal)}   (filed: ${pct(filedHits / legibleTotal)})   [campaign model]`);
  console.log(`  (c) first LANDING day                  median ${fmt(medianOf(landing))}   never: ${pct(share(landing, (d) => d >= NEVER))}`);
  console.log(`      first DOOR day (at-door gate)      median ${fmt(medianOf(door))}   never: ${pct(share(door, (d) => d >= NEVER))}`);
  console.log(`      deduction day                      median ${fmt(medianOf(deduce))}`);
  console.log(`      VOLUME WIN day                     median ${fmt(medianOf(win))}   p10 ${fmt(quantileOf(win, 0.1))}  p90 ${fmt(quantileOf(win, 0.9))}`);
  console.log(`      win <=45 ${pct(share(win, (d) => d <= 45))} · <=35 ${pct(share(win, (d) => d <= 35))} · <=28 ${pct(share(win, (d) => d <= 28))} · <=14 ${pct(share(win, (d) => d <= 14))} · <=7 ${pct(share(win, (d) => d <= 7))} · never ${pct(share(win, (d) => d >= NEVER))}`);
  console.log(`  (d) unspent budget at day end          median ${pct(medianOf(unspent))}  p90 ${pct(quantileOf(unspent, 0.9))}`);
  console.log(`      per-seed win medians:   ${SEEDS.map((s) => medianOf(simulateCampaigns(profile, 150, DAYS, s).map((c) => c.volumeWinDay ?? NEVER))).map(fmt).join(', ')}`);
  console.log(`      per-seed reach medians: ${SEEDS.map((s) => medianOf(simulateCampaigns(profile, 150, DAYS, s).map((c) => c.firstSanctumReachDay ?? NEVER))).map(fmt).join(', ')}`);
}

/**
 * (b) and the volume horizon, through the REAL authored content and the real
 * channels — a second, stricter instrument than the campaign model's coarse
 * `KNOWLEDGE` abstraction above. It runs out of authored pages, which the
 * campaign model cannot: once the volume's 17 fragments are all filed, every
 * later day is a legible-less day and the raw share falls. `...OWED` is the
 * same fraction restricted to days the volume still had something to give,
 * which is the number REVIEW_AA §5.1's target is actually about.
 */
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
  console.log(`  (b) legible-fragment days / first 14   mean ${mean(shares14).toFixed(3)}   min ${Math.min(...shares14).toFixed(3)}   p10 ${quantileOf(shares14, 0.1).toFixed(3)}   campaigns >=0.90: ${pct(share(shares14, (x) => x >= 0.9))}`);
  console.log(`      ...restricted to days still OWED   mean ${mean(owed14).toFixed(3)}   min ${Math.min(...owed14).toFixed(3)}   p10 ${quantileOf(owed14, 0.1).toFixed(3)}   campaigns >=0.90: ${pct(share(owed14, (x) => x >= 0.9))}`);
  console.log(`      day 1 files something legible:     ${pct(mean(day1))}`);
  console.log(`      LEGIBLE fragment 16   median ${medianOf(day16)}  p10 ${quantileOf(day16, 0.1)}  p90 ${quantileOf(day16, 0.9)}  max ${Math.max(...day16)}`);
  console.log(`      FILED   fragment 16   median ${medianOf(day16Filed)}  p10 ${quantileOf(day16Filed, 0.1)}  p90 ${quantileOf(day16Filed, 0.9)}  max ${Math.max(...day16Filed)}`);
}

console.log("REVIEW_AA re-measurement — the review's own metrics, re-run at HEAD");
campaignMetrics(PROFILE_DECENT, "PROFILE_DECENT — the review's profile (\"the MEDIAN evening… i.e. the owner\")");
campaignMetrics(PROFILE_SKILLED, 'PROFILE_SKILLED');
dripMetrics(PROFILE_DECENT, 'PROFILE_DECENT (a competent evening)');
dripMetrics(PROFILE_SKILLED, 'PROFILE_SKILLED');
