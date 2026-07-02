import { describe, expect, it } from 'vitest';
import { generateLevelMap, isNodeUnlocked, isStuck, playableNodes, type LevelMap } from '../src/engine/map';
import type { GameMode } from '../src/engine/types';

const MODES: GameMode[] = ['word-web', 'hive', 'twistle'];

function reachableFrom(map: LevelMap, start: string): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [p, c] of map.edges) {
      if (p === cur && !seen.has(c)) {
        seen.add(c);
        queue.push(c);
      }
    }
  }
  return seen;
}

describe('level map generation', () => {
  it('is deterministic for the same seed and level', () => {
    const a = generateLevelMap({ seed: 123, level: 1, availableModes: MODES });
    const b = generateLevelMap({ seed: 123, level: 1, availableModes: MODES });
    expect(a).toEqual(b);
    const c = generateLevelMap({ seed: 124, level: 1, availableModes: MODES });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('every node is reachable from start, and the boss is reachable, at all levels and many seeds', () => {
    for (let level = 1; level <= 3; level++) {
      for (let seed = 1; seed <= 50; seed++) {
        const map = generateLevelMap({ seed, level, availableModes: MODES, bossMode: 'word-web' });
        const reachable = reachableFrom(map, map.startId);
        for (const n of map.nodes) {
          expect(reachable.has(n.id), `seed ${seed} L${level}: ${n.id} unreachable`).toBe(true);
        }
        expect(reachable.has(map.bossId)).toBe(true);
      }
    }
  });

  it('respects availableModes for regular nodes; boss mode is independent', () => {
    const map = generateLevelMap({ seed: 5, level: 2, availableModes: ['word-web'], bossMode: 'forgotten-word' });
    for (const n of map.nodes) {
      if (n.id === map.bossId) expect(n.mode).toBe('forgotten-word');
      else expect(n.mode).toBe('word-web');
    }
    const map2 = generateLevelMap({ seed: 5, level: 2, availableModes: MODES, bossMode: 'twistle' });
    expect(map2.nodes.find((n) => n.id === map2.bossId)!.mode).toBe('twistle');
  });

  it('unlock progression: children of start are playable immediately; boss is not', () => {
    const map = generateLevelMap({ seed: 9, level: 1, availableModes: MODES });
    const run = { completedNodeIds: [] as string[] };
    const playable = playableNodes(map, run);
    expect(playable.length).toBeGreaterThan(0);
    for (const n of playable) expect(n.layer).toBe(1);
    expect(isNodeUnlocked(map, run, map.bossId)).toBe(false);
  });

  it('completing a full path unlocks the boss and never strands the player', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const map = generateLevelMap({ seed, level: 1, availableModes: MODES });
      const run = { completedNodeIds: [] as string[] };
      // Greedily complete any playable node until the boss unlocks.
      let guard = 0;
      while (!isNodeUnlocked(map, run, map.bossId)) {
        expect(isStuck(map, run), `seed ${seed} stuck`).toBe(false);
        const next = playableNodes(map, run).find((n) => n.kind !== 'boss');
        expect(next, `seed ${seed}: no playable non-boss node`).toBeDefined();
        run.completedNodeIds.push(next!.id);
        expect(++guard).toBeLessThan(30);
      }
    }
  });

  it('mystery nodes exist and sit away from the start', () => {
    const map = generateLevelMap({ seed: 3, level: 2, availableModes: MODES });
    const mysteries = map.nodes.filter((n) => n.kind === 'mystery');
    expect(mysteries.length).toBeGreaterThan(0);
    for (const m of mysteries) expect(m.layer).toBeGreaterThanOrEqual(2);
  });
});
