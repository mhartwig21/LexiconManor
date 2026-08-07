/** Scratch diagnosis: WHY a competent evening's first 14 days are dry. */
import { PROFILE_DECENT, simulateDay, campaignProfileForDay } from '../src/engine/economy/simulate';
import { createRng } from '../src/engine/rng';
import { fragmentDays } from '../tests/support/fragment-drip';

const runs = Array.from({ length: 240 }, (_, i) => fragmentDays((0x51ce + i * 0x9e37) | 0, 14, PROFILE_DECENT));

// How often is a day dry, by day index?
for (let d = 0; d < 14; d++) {
  const dry = runs.filter((r) => r.perDay[d]!.legible === 0).length;
  console.log(`day ${String(d + 1).padStart(2)}: dry on ${(100 * dry / runs.length).toFixed(1)}% of campaigns`);
}

// How often does a competent evening solve at least one room at all?
let solvedDays = 0, total = 0;
const hist: Record<number, number> = {};
for (let seed = 0; seed < 240; seed++) {
  const rng = createRng((0x51ce + seed * 0x9e37) | 0);
  const timeRng = createRng(((0x51ce + seed * 0x9e37) ^ 0x715e17) | 0);
  for (let day = 1; day <= 14; day++) {
    const r = simulateDay(rng, campaignProfileForDay(PROFILE_DECENT, day), timeRng, { sealedBacklog: 0 });
    total += 1;
    if (r.roomsSolved > 0) solvedDays += 1;
    hist[r.roomsSolved] = (hist[r.roomsSolved] ?? 0) + 1;
  }
}
console.log(`\ncompetent evening solves >=1 room on ${(100 * solvedDays / total).toFixed(1)}% of the first 14 days`);
console.log('roomsSolved histogram:', hist);
