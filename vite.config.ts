import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { join } from 'node:path';
import {
  REPO_ROOT,
  DEV_STAMP,
  assertFreshDist,
  makeStamp,
  writeStamp,
  type BuildStamp,
} from './scripts/dist-guard';

/**
 * BUILD INTEGRITY (REVIEW_AA §0 / §5.5) — two plugins, both load-bearing.
 *
 * The guard lives HERE rather than in an npm script on purpose: a wrapper
 * script is bypassed by `npx vite preview`, by an IDE task, by any agent that
 * reaches for the binary. This file is loaded by every vite invocation there
 * is, so the assertion cannot be routed around or forgotten. See
 * scripts/dist-guard.ts for the full rationale.
 */

/** Refuse to start a preview server on a dist that doesn't match the source. */
function noStalePreview(): Plugin {
  return {
    name: 'manor:no-stale-preview',
    // Backstop. The primary check runs in the config function below (it fires
    // before the server binds a port); this catches any vite version that
    // stops passing `isPreview` through ConfigEnv. assertFreshDist memoises,
    // so running both costs one fingerprint, not two.
    configurePreviewServer() {
      assertFreshDist(REPO_ROOT);
    },
  };
}

/** Write dist/build-stamp.json for every build, however it was invoked. */
function buildStamp(stamp: BuildStamp, active: boolean): Plugin {
  let outDir = join(REPO_ROOT, 'dist');
  return {
    name: 'manor:build-stamp',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      // Deliberately not gated on `scripts/build.ts` having spawned us: a bare
      // `npx vite build` must produce a stamped dist too, or the preview guard
      // would reject a dist that is in fact perfectly current. The stamp
      // records `via` so the guard can still warn that such a build skipped
      // the typecheck.
      if (active) writeStamp(outDir, stamp);
    },
  };
}

export default defineConfig((env) => {
  const isPreview = env.command === 'serve' && env.isPreview === true;
  const isBuild = env.command === 'build';

  // Fails loud and exits — before a port is bound, before anything is served.
  if (isPreview) assertFreshDist(REPO_ROOT);

  const base = process.env.MANOR_BASE ?? '/LexiconManor/';

  // One stamp object, used for both dist/build-stamp.json and the constant
  // compiled into the app, so the edition Chronicles prints is by construction
  // the edition the guard verified.
  const stamp: BuildStamp = isBuild
    ? makeStamp({ root: REPO_ROOT, via: process.env.MANOR_BUILD_VIA ?? 'vite', base })
    : DEV_STAMP;

  return {
    plugins: [react(), noStalePreview(), buildStamp(stamp, isBuild)],

    // Surfaced at the foot of Chronicles (ChroniclesPage.tsx) so any future
    // report can name the build it was written against. Defined in dev and
    // under vitest too — the constant must never be undefined at runtime.
    define: {
      __MANOR_BUILD__: JSON.stringify(stamp),
    },

    test: {
      // Resolve the lazy content-pool registry (app/pools.ts) before any test
      // touches a pool-backed const — mirrors the app's App-level await.
      setupFiles: ['tests/setup-pools.ts'],
      /**
       * ROUND 19 — 5s WAS A FLAKE GENERATOR, NOT A BUDGET.
       *
       * A dozen suites in this repo walk a WHOLE SHIPPED POOL on purpose —
       * every twistle trace, every sudoku technique tier, thousands of seeded
       * campaign days — because "a sample of the pool passed" is not the claim
       * any of them make. Several of those land at 1–7s alone and blow vitest's
       * 5000ms default when the other 38 files have every core busy. Two
       * different ones fell over during this round's verification and neither
       * failure named anything real: "Test timed out in 5000ms" says the
       * machine was loaded, not that the Gallery is unsolvable.
       *
       * So the budget is stated once, generously, at the level where the
       * contention actually lives. It is not a licence for slow tests — a suite
       * that genuinely needs 30s has a problem — it is the difference between a
       * red tree that means something and a red tree that means "run it again".
       */
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
    // Absolute base so service-worker scope resolution works (a relative './'
    // base breaks SW registration — ARCHITECTURE §9). GitHub Pages deploys under
    // /LexiconManor/; CI may override via MANOR_BASE. AAA 7.5 hard-checks the
    // built dist/ for this prefix in manifest start_url/scope + SW precache URLs.
    base,
    build: {
      rollupOptions: {
        output: {
          // Split the (large, rarely-changing) puzzle/dialogue/volume content
          // from app code: a content regen no longer invalidates the code chunk
          // and vice versa, and the code chunk stays under the AAA 9.6 eye.
          // The chunk is LAZY: app/pools.ts is the one runtime importer (via
          // dynamic import(), warmed after first paint by bootPlatform, awaited
          // at the day-start gate). manualChunks keeps the chunk name stable so
          // the SW precache still covers it for offline play (AAA 7.4).
          // scripts/build-sw-precache.ts hard-fails CI if the content chunk
          // ever turns eager again or eager JS exceeds 300KB gzip (AAA 9.6).
          manualChunks(id: string) {
            const p = id.replace(/\\/g, '/');
            if (p.includes('/content/generated/') || p.includes('/content/authored/')) {
              return 'content';
            }
            return undefined;
          },
        },
      },
    },
  };
});
