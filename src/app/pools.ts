/**
 * app/pools.ts — OWNER: A8 (Platform).
 *
 * Async content-pool registry (AAA 9.6 + 7.3). This is the ONE runtime module
 * allowed to pull content/generated/* and content/authored/* into the app,
 * and it does so exclusively via dynamic import(), so Rollup emits all
 * content as the lazy 'content' chunk (vite.config.ts manualChunks keeps the
 * chunk name stable, and the SW still precaches it — offline play, AAA 7.4 —
 * it just no longer blocks first paint/parse).
 *
 * Contract (adjudicated this round):
 *   - bootPlatform() fires loadPools() right after first paint, so the fetch
 *     overlaps the title/blueprint render;
 *   - the day-start / draft gate AWAITS loadPools() before the first
 *     select*() call;
 *   - everything downstream stays SYNCHRONOUS by reading through getPools()
 *     once resolved — no async select() contract change in the engine.
 *
 * MIGRATION (owners of the listed files — tracked as shared-file requests):
 * app/content.ts, app/content/volumes.ts, engine/dialogue/content.ts,
 * engine/puzzles/*-adapter.ts and engine/rooms/adapters/* must drop their
 * static content JSON imports and read through getPools() (keeping their own
 * validated casts, exactly as they cast today). Until the LAST static import
 * is gone the content chunk still loads eagerly and the AAA 9.6 budget gate
 * in scripts/build-sw-precache.ts stays red.
 *
 * In Node/vitest, loadPools() works as-is (dynamic JSON import); tests that
 * exercise selectors synchronously can `await loadPools()` in beforeAll.
 */

import type {
  WordWebPuzzle,
  HivePuzzle,
  TwistlePuzzle,
  ForgottenWordPuzzle,
} from '../engine/types';

/**
 * Raw pools, one entry per shipped content file. The four core game pools
 * carry engine types; adapter-specific pools stay `unknown` here on purpose —
 * their shapes are owned (and cast, backed by generators/validators) by the
 * importing adapter, not by the platform.
 */
export interface ContentPools {
  wordWeb: WordWebPuzzle[];
  hive: HivePuzzle[];
  twistle: TwistlePuzzle[];
  forgottenWord: ForgottenWordPuzzle[];
  cipher: unknown;
  crossword: unknown;
  sudoku: unknown;
  /** content/authored/dialogue/<character>.json, keyed by character id. */
  dialogue: Record<string, unknown>;
  /** content/authored/volumes/*.json, in play order. */
  volumes: unknown[];
}

let pools: ContentPools | null = null;
let loading: Promise<ContentPools> | null = null;

/**
 * Kick (or join) the one content fetch. Idempotent; safe to fire-and-forget
 * from boot and await again at the day-start gate.
 */
export function loadPools(): Promise<ContentPools> {
  loading ??= Promise.all([
    import('../../content/generated/word-web.json'),
    import('../../content/generated/hive.json'),
    import('../../content/generated/twistle.json'),
    import('../../content/generated/forgotten-word.json'),
    import('../../content/generated/cipher.json'),
    import('../../content/generated/crossword.json'),
    import('../../content/authored/dialogue/bramble.json'),
    import('../../content/authored/dialogue/ellery.json'),
    import('../../content/authored/dialogue/posy.json'),
    import('../../content/authored/dialogue/fern.json'),
    import('../../content/authored/dialogue/dewey.json'),
    import('../../content/authored/dialogue/portrait.json'),
    import('../../content/authored/volumes/volume-1.json'),
  ]).then(
    ([
      wordWeb,
      hive,
      twistle,
      forgottenWord,
      cipher,
      crossword,
      bramble,
      ellery,
      posy,
      fern,
      dewey,
      portrait,
      volume1,
    ]) => {
      pools = {
        wordWeb: wordWeb.default as WordWebPuzzle[],
        hive: hive.default as HivePuzzle[],
        twistle: twistle.default as TwistlePuzzle[],
        forgottenWord: forgottenWord.default as ForgottenWordPuzzle[],
        cipher: cipher.default,
        crossword: crossword.default,
        dialogue: {
          bramble: bramble.default,
          ellery: ellery.default,
          posy: posy.default,
          fern: fern.default,
          dewey: dewey.default,
          portrait: portrait.default,
        },
        volumes: [volume1.default],
      };
      return pools;
    },
  );
  // A failed fetch (flaky network before the SW has precached) must not wedge
  // the game: clear the memo so the awaited day-start gate can retry.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/**
 * Synchronous read for selectors/adapters. Only legal after loadPools()
 * resolved — the day-start/draft gate guarantees that ordering; throwing here
 * means a call site ran before the gate, which is a bug, not a race to paper
 * over.
 */
export function getPools(): ContentPools {
  if (!pools) {
    throw new Error(
      'Content pools not loaded yet — await loadPools() (app/pools.ts) at the day-start gate before selecting puzzles.',
    );
  }
  return pools;
}

/** True once getPools() is safe. */
export function poolsReady(): boolean {
  return pools !== null;
}

/**
 * Lazy const-shaped view over a slice of the loaded pools. Adapters and
 * content modules keep their `export const POOL` contract (synchronous,
 * array/record/set-shaped) while the JSON itself rides the lazy 'content'
 * chunk: the underlying read is deferred to the first property touch and
 * memoized. Touching a lazy pool before loadPools() resolved surfaces
 * getPools()'s ordering error — a bug at the call site, not a race.
 *
 * `target` must match the eventual shape's kind so exotic checks stay honest:
 * `[]` (default) for array pools, `{}` for records, `new Set()` for sets.
 */
export function lazyContent<T extends object>(read: () => T, target?: object): T {
  let cache: T | null = null;
  const src = (): T => (cache ??= read());
  return new Proxy((target ?? []) as T, {
    get(_t, prop, _recv) {
      const v = Reflect.get(src(), prop);
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(src()) : v;
    },
    has: (_t, prop) => Reflect.has(src(), prop),
    ownKeys: () => Reflect.ownKeys(src()),
    getOwnPropertyDescriptor(t, prop) {
      const d = Object.getOwnPropertyDescriptor(src(), prop);
      if (!d) return undefined;
      // Proxy invariant: a prop that is non-configurable on the target (an
      // array's 'length') must not be reported configurable.
      const td = Object.getOwnPropertyDescriptor(t, prop);
      if (td && !td.configurable) return d;
      return { ...d, configurable: true };
    },
  });
}
