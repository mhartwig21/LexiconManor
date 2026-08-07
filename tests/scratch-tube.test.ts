import { describe, it } from 'vitest';
import {
  PROFILE_DECENT, PROFILE_SKILLED, simulateCampaigns, median, quantile, share,
} from '../src/engine/economy/simulate';

function report(name: string, profile: typeof PROFILE_DECENT) {
  for (const seed of [0x51e, 0x9a2, 0x1234]) {
    const cs = simulateCampaigns(profile, 200, 45, seed);
    const won = cs.filter((c) => c.volumeWinDay !== null);
    const spoke = cs.filter((c) => c.firstSpeakDay !== null);
    const doorReached = cs.filter((c) => c.firstSanctumReachDay !== null);
    console.log(
      `${name} seed ${seed.toString(16)}\n` +
      `  firstSpeak median ${spoke.length ? median(spoke, (c) => c.firstSpeakDay!) : 'n/a'}` +
      ` p90 ${spoke.length ? quantile(spoke, 0.9, (c) => c.firstSpeakDay!) : 'n/a'}` +
      ` never ${(1 - spoke.length / cs.length).toFixed(3)}\n` +
      `  firstLanding median ${median(cs.filter((c) => c.firstLandingDay !== null), (c) => c.firstLandingDay!)}` +
      ` neverLanding ${share(cs, (c) => c.firstLandingDay === null).toFixed(3)}\n` +
      `  firstDoor median ${doorReached.length ? median(doorReached, (c) => c.firstSanctumReachDay!) : 'n/a'}` +
      ` neverDoor ${share(cs, (c) => c.firstSanctumReachDay === null).toFixed(3)}\n` +
      `  deduction median ${median(cs.filter((c) => c.deductionDay !== null), (c) => c.deductionDay!)}\n` +
      `  answered median ${median(cs.filter((c) => c.answeredDay !== null), (c) => c.answeredDay!)}\n` +
      `  win median ${won.length ? median(won, (c) => c.volumeWinDay!) : 'n/a'}` +
      ` p90 ${won.length ? quantile(won, 0.9, (c) => c.volumeWinDay!) : 'n/a'}` +
      ` unfinished ${share(cs, (c) => c.volumeWinDay === null).toFixed(3)}\n` +
      `  answered→win median ${won.length ? median(won, (c) => c.answeredToWinDays!) : 'n/a'}` +
      ` p90 ${won.length ? quantile(won, 0.9, (c) => c.answeredToWinDays!) : 'n/a'}\n` +
      `  win by day 28 ${share(cs, (c) => (c.volumeWinDay ?? 99) <= 28).toFixed(3)}` +
      ` by 35 ${share(cs, (c) => (c.volumeWinDay ?? 99) <= 35).toFixed(3)}` +
      ` inside week 1 ${share(cs, (c) => (c.volumeWinDay ?? 99) <= 7).toFixed(3)}\n` +
      `  day-1 door ${share(cs, (c) => c.firstSanctumReachDay === 1).toFixed(4)}`,
    );
  }
}

describe('scratch', () => {
  it('measures', () => {
    report('DECENT', PROFILE_DECENT);
    report('SKILLED', PROFILE_SKILLED);
  });
});
