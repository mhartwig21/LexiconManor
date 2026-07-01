import type { GameMode, RunRecord } from './types';

/**
 * Chronicle statistics derived from run history — everything the stats
 * page needs, computed from the save file (no server, no extra storage).
 */

export interface ModeStats {
  played: number;
  won: number;
  winRate: number; // 0..1
  bestScore: number;
  avgScore: number;
  perfectClears: number;
}

export interface ChronicleStats {
  totalRuns: number;
  victories: number;
  defeats: number;
  abandoned: number;
  bestRunScore: number;
  totalNodesCompleted: number;
  totalBossesDefeated: number;
  currentStreak: number; // consecutive victorious runs, most recent first
  bestStreak: number;
  totalPlayTimeMs: number;
  byMode: Record<GameMode, ModeStats>;
}

const MODES: GameMode[] = ['word-web', 'hive', 'twistle', 'forgotten-word'];

export function computeChronicleStats(history: RunRecord[]): ChronicleStats {
  const byMode = Object.fromEntries(
    MODES.map((m) => [m, { played: 0, won: 0, winRate: 0, bestScore: 0, avgScore: 0, perfectClears: 0 }]),
  ) as Record<GameMode, ModeStats>;

  const scoreSums: Record<string, number> = {};
  for (const run of history) {
    for (const r of run.nodeResults) {
      const s = byMode[r.mode];
      s.played++;
      if (r.won) {
        s.won++;
        if (r.wrongAttempts === 0) s.perfectClears++;
      }
      s.bestScore = Math.max(s.bestScore, r.score);
      scoreSums[r.mode] = (scoreSums[r.mode] ?? 0) + r.score;
    }
  }
  for (const m of MODES) {
    const s = byMode[m];
    s.winRate = s.played > 0 ? s.won / s.played : 0;
    s.avgScore = s.played > 0 ? Math.round((scoreSums[m] ?? 0) / s.played) : 0;
  }

  // Streaks over completed (non-abandoned) runs in chronological order.
  const completed = [...history]
    .filter((r) => r.outcome !== 'abandoned')
    .sort((a, b) => a.endedAt - b.endedAt);
  let bestStreak = 0;
  let streak = 0;
  for (const run of completed) {
    streak = run.outcome === 'victory' ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  let currentStreak = 0;
  for (let i = completed.length - 1; i >= 0 && completed[i]!.outcome === 'victory'; i--) currentStreak++;

  return {
    totalRuns: history.length,
    victories: history.filter((r) => r.outcome === 'victory').length,
    defeats: history.filter((r) => r.outcome === 'defeat').length,
    abandoned: history.filter((r) => r.outcome === 'abandoned').length,
    bestRunScore: history.reduce((m, r) => Math.max(m, r.totalScore), 0),
    totalNodesCompleted: history.reduce((s, r) => s + r.nodesCompleted, 0),
    totalBossesDefeated: history.reduce((s, r) => s + r.bossesDefeated, 0),
    currentStreak,
    bestStreak,
    totalPlayTimeMs: history.reduce((s, r) => s + Math.max(0, r.endedAt - r.startedAt), 0),
    byMode,
  };
}
