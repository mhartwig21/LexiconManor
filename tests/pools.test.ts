/**
 * tests/pools.test.ts — OWNER: A8 (Platform).
 *
 * The async content-pool registry contract (AAA 9.6, app/pools.ts):
 * getPools() before loadPools() is a bug and throws; after one await, every
 * pool is present, non-empty, and reads are synchronous and stable.
 */

import { describe, it, expect } from 'vitest';
import { loadPools, getPools, poolsReady } from '../src/app/pools';

describe('app/pools registry (AAA 9.6 lazy content contract)', () => {
  it('throws on getPools() before loadPools() resolves', () => {
    // Module state is fresh in this file's module graph until we await below.
    if (!poolsReady()) {
      expect(() => getPools()).toThrow(/loadPools/);
    }
  });

  it('loads every pool with one await and reads synchronously after', async () => {
    const pools = await loadPools();
    expect(poolsReady()).toBe(true);
    expect(getPools()).toBe(pools); // same object, no re-fetch

    expect(pools.wordWeb.length).toBeGreaterThan(0);
    expect(pools.hive.length).toBeGreaterThan(0);
    expect(pools.twistle.length).toBeGreaterThan(0);
    expect(pools.forgottenWord.length).toBeGreaterThan(0);
    // Adapter pool shapes are owned by their adapters — the registry only
    // guarantees presence.
    for (const pool of [
      pools.cipher,
      pools.crossword,
      pools.sudoku,
    ]) {
      expect(pool).toBeTruthy();
      expect(typeof pool).toBe('object');
    }
    for (const who of ['bramble', 'ellery', 'posy', 'fern', 'dewey', 'portrait']) {
      expect(pools.dialogue[who]).toBeTruthy();
    }
    expect(pools.volumes.length).toBeGreaterThan(0);
  });

  it('memoizes: loadPools() twice is the same promise resolution', async () => {
    const [a, b] = await Promise.all([loadPools(), loadPools()]);
    expect(a).toBe(b);
  });
});
