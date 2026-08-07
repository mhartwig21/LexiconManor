/** Scratch probe for sweep-routing.mjs — one line of numbers per routing. */
import { PROFILE_DECENT, PROFILE_SKILLED, simulateCampaigns, medianOf } from '../src/engine/economy/simulate';
import { fragmentDays, legibleDayShare, legibleOwedDayShare } from '../tests/support/fragment-drip';

const NEVER = 1e9;
const d = simulateCampaigns(PROFILE_DECENT, 300, 45, 0x1234);
const s = simulateCampaigns(PROFILE_SKILLED, 300, 45, 0x1234);
const dWin = medianOf(d.map((c) => c.volumeWinDay ?? NEVER));
const sWin = medianOf(s.map((c) => c.volumeWinDay ?? NEVER));
const sFast = s.filter((c) => (c.volumeWinDay ?? NEVER) <= 7).length / s.length;

const runs = Array.from({ length: 120 }, (_, i) => fragmentDays((0x51ce + i * 0x9e37) | 0, 60, PROFILE_DECENT));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const leg = mean(runs.map((r) => legibleDayShare(r, 14)));
const owed = mean(runs.map((r) => legibleOwedDayShare(r, 14)));
const f16 = medianOf(runs.map((r) => r.legible[16] ?? 61));

console.log(`${String(dWin).padStart(10)} | ${String(sWin).padStart(11)} | ${(100 * sFast).toFixed(1).padStart(10)}% | ${leg.toFixed(3).padStart(16)} | ${owed.toFixed(3).padStart(6)} | ${String(f16).padStart(9)}`);
