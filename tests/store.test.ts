import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Integration test: a full run played through the zustand store —
 * start, clear nodes to the boss, level up three times, win the run,
 * then verify the chronicle record and a defeat path.
 */

// Minimal localStorage for the store's persistence layer.
const backing = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => void backing.set(k, v),
  removeItem: (k: string) => void backing.delete(k),
  clear: () => backing.clear(),
} as Storage;

const { useGameStore } = await import('../src/app/store');
const { playableNodes, isNodeUnlocked } = await import('../src/engine/map');
const { createEmptySave } = await import('../src/engine/run');

function resetStore() {
  backing.clear();
  useGameStore.setState({ save: createEmptySave('Player'), lastOutcome: null });
}

function clearNode(nodeId: string, wrongAttempts = 0) {
  const s = useGameStore.getState();
  s.enterNode(nodeId);
  s.finishNode({
    mode: 'word-web',
    puzzleId: `test-${nodeId}`,
    baseScore: 300,
    wrongAttempts,
    durationMs: 30_000,
  });
}

/** Clear playable nodes until the boss unlocks, then kill the boss. */
function clearLevel() {
  const store = useGameStore.getState;
  let guard = 0;
  for (;;) {
    const map = store().currentMap()!;
    const run = store().save.activeRun!;
    if (isNodeUnlocked(map, run, map.bossId)) {
      clearNode(map.bossId);
      return;
    }
    const next = playableNodes(map, run).find((n) => n.kind !== 'boss');
    expect(next, 'a non-boss node should be playable').toBeDefined();
    clearNode(next!.id);
    if (++guard > 40) throw new Error('level never completed');
  }
}

describe('game store', () => {
  beforeEach(resetStore);

  it('plays a full victorious run: 3 levels, boss level-ups, chronicle record', () => {
    const store = useGameStore.getState;
    store().startNewRun();
    expect(store().save.activeRun!.level).toBe(1);

    clearLevel(); // level 1 boss
    expect(store().save.activeRun!.level).toBe(2);
    clearLevel(); // level 2 boss
    expect(store().save.activeRun!.level).toBe(3);
    clearLevel(); // final boss

    // Run is over and folded into history.
    expect(store().save.activeRun).toBeNull();
    expect(store().lastOutcome!.runWon).toBe(true);
    const record = store().save.runHistory.at(-1)!;
    expect(record.outcome).toBe('victory');
    expect(record.bossesDefeated).toBe(3);
    expect(record.nodesCompleted).toBeGreaterThanOrEqual(12);
    expect(record.totalScore).toBeGreaterThan(0);
    expect(record.nodeResults.length).toBe(record.nodesCompleted);

    // Boss kills guarantee glyph drops; at least some should have been kept.
    expect(record.glyphsEarned.length).toBeGreaterThan(0);
    // Lifetime achievements fired along the way.
    expect(store().save.earnedAchievementIds).toContain('five-nodes');
    expect(store().save.earnedAchievementIds).toContain('boss-slayer');
    expect(store().save.unlockedPerkIds).toContain('expanding-mind');
  });

  it('wrong attempts drain mind points and defeat folds the run into history', () => {
    const store = useGameStore.getState;
    store().startNewRun();
    const runsBefore = store().save.runHistory.length;
    const mind = store().save.activeRun!.mindPoints;
    const map = store().currentMap()!;
    const node = playableNodes(map, store().save.activeRun!)[0]!;
    store().enterNode(node.id);

    for (let i = 0; i < mind; i++) store().applyWrongAttempt();

    expect(store().save.activeRun).toBeNull();
    expect(store().save.runHistory.length).toBe(runsBefore + 1);
    expect(store().save.runHistory.at(-1)!.outcome).toBe('defeat');
  });

  it('abandoning a run records it as abandoned', () => {
    const store = useGameStore.getState;
    store().startNewRun();
    store().abandonRun();
    expect(store().save.activeRun).toBeNull();
    expect(store().save.runHistory.at(-1)!.outcome).toBe('abandoned');
  });

  it('persists across store reloads via localStorage', async () => {
    const store = useGameStore.getState;
    store().startNewRun();
    const runId = store().save.activeRun!.runId;
    const { loadSave } = await import('../src/app/save');
    const reloaded = loadSave();
    expect(reloaded.activeRun?.runId).toBe(runId);
  });
});
