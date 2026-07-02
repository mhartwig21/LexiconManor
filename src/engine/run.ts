import type { RunState, RunRecord, NodeResult, GameMode, SaveFile } from './types';
import { STARTING_MIND_POINTS, BOSS_VICTORY_MIND_BONUS, FINAL_LEVEL } from './types';
import { perkById } from './effects';
import { finalNodeScore } from './scoring';

/**
 * Run lifecycle: start -> (node attempts, mind point changes) -> victory/defeat.
 * All transitions are pure; timestamps and ids come from the caller so the
 * engine stays deterministic and testable.
 */

export function startRun(opts: {
  runId: string;
  seed: number;
  now: number;
  activePerkIds: string[];
}): RunState {
  let mind = STARTING_MIND_POINTS;
  let maxMind = STARTING_MIND_POINTS;
  for (const id of opts.activePerkIds) {
    const perk = perkById(id);
    if (perk.effect.type === 'bonus_starting_mind') mind += perk.effect.value;
    if (perk.effect.type === 'max_mind_boost') {
      maxMind += perk.effect.value;
      mind += perk.effect.value;
    }
  }
  return {
    runId: opts.runId,
    seed: opts.seed,
    level: 1,
    mindPoints: Math.min(mind, maxMind),
    maxMindPoints: maxMind,
    shieldCharges: 0,
    entropyImmunityCharges: 0,
    pendingScoreMultiplier: 0,
    glyphInventory: [],
    completedNodeIds: [],
    currentNodeId: null,
    totalScore: 0,
    status: 'active',
    startedAt: opts.now,
  };
}

/**
 * Lose mind points, consuming shield charges first.
 * Sets status to 'defeat' when points reach 0.
 */
export function loseMindPoints(run: RunState, amount: number): RunState {
  if (run.status !== 'active' || amount <= 0) return run;
  let remaining = amount;
  let shields = run.shieldCharges;
  while (remaining > 0 && shields > 0) {
    shields--;
    remaining--;
  }
  const mindPoints = Math.max(0, run.mindPoints - remaining);
  return {
    ...run,
    shieldCharges: shields,
    mindPoints,
    status: mindPoints === 0 ? 'defeat' : run.status,
  };
}

export function gainMindPoints(run: RunState, amount: number): RunState {
  return { ...run, mindPoints: Math.min(run.maxMindPoints, run.mindPoints + amount) };
}

export interface NodeCompletionInput {
  nodeId: string;
  mode: GameMode;
  puzzleId: string;
  isBoss: boolean;
  baseScore: number;
  wrongAttempts: number;
  durationMs: number;
}

export interface NodeCompletionOutcome {
  run: RunState;
  result: NodeResult;
  leveledUp: boolean;
  runWon: boolean;
}

/**
 * Record a won node: apply score (consuming any pending multiplier),
 * advance the level on boss kills, and finish the run after the final boss.
 */
export function completeNode(run: RunState, input: NodeCompletionInput): NodeCompletionOutcome {
  if (run.status !== 'active') throw new Error('completeNode on inactive run');
  if (run.completedNodeIds.includes(input.nodeId)) throw new Error(`node already completed: ${input.nodeId}`);

  const score = finalNodeScore({
    baseScore: input.baseScore,
    mode: input.mode,
    level: run.level,
    scoreMultiplierPercent: run.pendingScoreMultiplier,
  });

  let next: RunState = {
    ...run,
    pendingScoreMultiplier: 0,
    entropyImmunityCharges: Math.max(0, run.entropyImmunityCharges - 1),
    completedNodeIds: [...run.completedNodeIds, input.nodeId],
    currentNodeId: null,
    totalScore: run.totalScore + score,
  };

  let leveledUp = false;
  let runWon = false;
  if (input.isBoss) {
    if (run.level >= FINAL_LEVEL) {
      runWon = true;
      next = { ...next, status: 'victory' };
    } else {
      leveledUp = true;
      next = gainMindPoints({ ...next, level: run.level + 1 }, BOSS_VICTORY_MIND_BONUS);
    }
  }

  const result: NodeResult = {
    nodeId: input.nodeId,
    mode: input.mode,
    puzzleId: input.puzzleId,
    isBoss: input.isBoss,
    won: true,
    score,
    wrongAttempts: input.wrongAttempts,
    durationMs: input.durationMs,
    level: run.level,
  };

  return { run: next, result, leveledUp, runWon };
}

/** Convert a finished (or abandoned) run into a permanent chronicle record. */
export function toRunRecord(
  run: RunState,
  nodeResults: NodeResult[],
  opts: { endedAt: number; glyphsEarned: string[]; perksUnlocked: string[]; abandoned?: boolean },
): RunRecord {
  const bossesDefeated =
    (run.status === 'victory' ? 1 : 0) + Math.max(0, run.level - 1); // one boss per level advanced
  return {
    runId: run.runId,
    startedAt: run.startedAt,
    endedAt: opts.endedAt,
    outcome: opts.abandoned ? 'abandoned' : run.status === 'victory' ? 'victory' : 'defeat',
    levelReached: run.level,
    nodesCompleted: run.completedNodeIds.length,
    bossesDefeated,
    totalScore: run.totalScore,
    nodeResults,
    glyphsEarned: opts.glyphsEarned,
    perksUnlocked: opts.perksUnlocked,
  };
}

export function createEmptySave(profileName: string): SaveFile {
  return {
    version: 1,
    profileName,
    activeRun: null,
    activeRunResults: [],
    activeRunGlyphs: [],
    runHistory: [],
    unlockedPerkIds: [],
    activePerkLoadout: [],
    earnedAchievementIds: [],
    seenPuzzleIds: { 'word-web': [], hive: [], twistle: [], 'forgotten-word': [] },
    settings: { soundEnabled: true, reducedMotion: false },
  };
}
