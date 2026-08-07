/**
 * REVIEW_AA's own metrics, re-measured — so a round can show movement rather
 * than claim it.
 *
 * The review closes with: *"How to know it worked. Not by re-reading this
 * document. Re-run `simulateCampaigns(PROFILE_DECENT, …)` and require: first
 * Sanctum guess by median day ≤ 3; a legible fragment on ≥ 90% of the first 14
 * days; no day ending with more than ~20% of the budget unspent."* This script
 * is that instruction, executable, printing each number beside the one the
 * review published.
 *
 *   npx tsx scripts/review-metrics.ts
 */
import {
  PROFILE_DECENT, PROFILE_SKILLED, simulateCampaigns,
} from '../src/engine/economy/simulate';

const N = 400;
const DAYS = 45;
const SEEDS = [909, 4660, 1301, 77];

const NEVER = 9999;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
function share(xs: number[], p: (n: number) => boolean): number {
  return xs.filter(p).length / xs.length;
}
function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function run(profile: typeof PROFILE_DECENT, label: string) {
  const all = SEEDS.flatMap((s) => simulateCampaigns(profile, N, DAYS, s));

  const speak = all.map((c) => c.firstSpeakDay ?? NEVER);
  const landing = all.map((c) => c.firstLandingDay ?? NEVER);
  const reach = all.map((c) => c.firstSanctumReachDay ?? NEVER);
  const win = all.map((c) => c.volumeWinDay ?? NEVER);
  const deduce = all.map((c) => c.deductionDay ?? NEVER);

  // (b) fraction of the first 14 days on which a competent evening files a
  // legible fragment — REVIEW_AA §5.1's success metric, verbatim.
  let legibleDayHits = 0;
  let legibleDayTotal = 0;
  let filedDayHits = 0;
  for (const c of all) {
    for (const d of c.days.slice(0, 14)) {
      if ((d.legibleToday ?? 0) > 0) legibleDayHits++;
      if ((d.filedToday ?? 0) > 0) filedDayHits++;
      legibleDayTotal++;
    }
  }

  // The review's third gate: "no day ending with more than ~20% of the budget
  // unspent and unspendable". Budget = what she spent, refunded, and had left.
  const unspent = all.flatMap((c) =>
    c.days.map((d) => {
      const budget = d.spent - d.refunded + d.stepsLeft;
      return budget > 0 ? d.stepsLeft / budget : 0;
    }),
  );

  console.log(`\n===== ${label}  (${all.length} campaigns, ${DAYS} days, seeds ${SEEDS.join('/')}) =====`);
  console.log(`(a) first SPEAK at the Sanctum      median day ${median(speak)}   (never: ${pct(share(speak, (d) => d === NEVER))})`);
  console.log(`    first LANDING (the climb)       median day ${median(landing)}   (never: ${pct(share(landing, (d) => d === NEVER))})`);
  console.log(`    first AT-DOOR (the gate)        median day ${median(reach)}   (never: ${pct(share(reach, (d) => d === NEVER))})`);
  console.log(`(b) LEGIBLE-fragment days, first 14 ${pct(legibleDayHits / legibleDayTotal)}   (filed: ${pct(filedDayHits / legibleDayTotal)})`);
  console.log(`(c) deduction                       median day ${median(deduce)}`);
  console.log(`    VOLUME WIN                      median day ${median(win)}`);
  console.log(`      won <= 7 d (walkover)         ${pct(share(win, (d) => d <= 7))}`);
  console.log(`      won <= 28 d                   ${pct(share(win, (d) => d <= 28))}`);
  console.log(`      won <= 35 d                   ${pct(share(win, (d) => d <= 35))}`);
  console.log(`      won <= 45 d                   ${pct(share(win, (d) => d <= 45))}`);
  console.log(`      NEVER inside 45 d (the tail)  ${pct(share(win, (d) => d === NEVER))}`);
  console.log(`    unspent budget at day end       median ${pct(median(unspent))}  p90 ${pct([...unspent].sort((a, b) => a - b)[Math.floor(unspent.length * 0.9)]!)}`);
}

run(PROFILE_DECENT, 'PROFILE_DECENT — "the MEDIAN evening, i.e. the owner"');
run(PROFILE_SKILLED, 'PROFILE_SKILLED');
