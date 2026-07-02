import type { AchievementDef, NodeResult, RunRecord, SaveFile } from './types';
import { ACHIEVEMENTS, PERKS } from './effects';

/**
 * Achievement evaluation over lifetime history (run records + the current
 * run's node results so unlocks fire mid-run, not only at run end).
 */

export interface LifetimeTotals {
  nodesCompleted: number;
  bossesDefeated: number;
  perfectClears: number;
  runsCompleted: number;
  winsByMode: Record<string, number>;
  bestHiveScoreNoEntropy: number;
}

export function computeLifetimeTotals(history: RunRecord[], currentRunResults: NodeResult[]): LifetimeTotals {
  const allResults = [...history.flatMap((r) => r.nodeResults), ...currentRunResults];
  const winsByMode: Record<string, number> = {};
  let perfectClears = 0;
  for (const r of allResults) {
    if (!r.won) continue;
    winsByMode[r.mode] = (winsByMode[r.mode] ?? 0) + 1;
    if (r.wrongAttempts === 0) perfectClears++;
  }
  return {
    nodesCompleted: allResults.filter((r) => r.won).length,
    bossesDefeated:
      history.reduce((s, r) => s + r.bossesDefeated, 0) +
      currentRunResults.filter((r) => r.won && r.isBoss).length,
    perfectClears,
    runsCompleted: history.filter((r) => r.outcome === 'victory').length,
    winsByMode,
    bestHiveScoreNoEntropy: 0, // supplied via checkAchievements opts when a hive game ends
  };
}

/**
 * Return newly earned achievements (not already in the save).
 * `hiveScoreNoEntropy` is the just-finished hive score if entropy stayed 0.
 */
export function checkAchievements(
  save: Pick<SaveFile, 'earnedAchievementIds'>,
  totals: LifetimeTotals,
  opts?: { hiveScoreNoEntropy?: number },
): AchievementDef[] {
  const earned: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.earnedAchievementIds.includes(a.id)) continue;
    const c = a.condition;
    const met =
      c.kind === 'nodes_completed' ? totals.nodesCompleted >= c.count
      : c.kind === 'bosses_defeated' ? totals.bossesDefeated >= c.count
      : c.kind === 'perfect_clears' ? totals.perfectClears >= c.count
      : c.kind === 'mode_wins' ? (totals.winsByMode[c.mode] ?? 0) >= c.count
      : c.kind === 'hive_score_no_entropy' ? (opts?.hiveScoreNoEntropy ?? 0) >= c.score
      : c.kind === 'runs_completed' ? totals.runsCompleted >= c.count
      : false;
    if (met) earned.push(a);
  }
  return earned;
}

/** Perks unlocked by a set of achievement ids. */
export function perksUnlockedBy(achievementIds: string[]): string[] {
  return PERKS.filter((p) => achievementIds.includes(p.unlockedBy)).map((p) => p.id);
}
