/**
 * scripts/gate-vite.config.ts — the config the LIVE GATES spawn vite with.
 * OWNER: visual-nav (scripts/*). It is the root config plus one thing.
 *
 * WHY IT EXISTS. Agents share this checkout, and a sibling agent's browser
 * profile lives in `.playtest/userdata/` inside the repo. Vite's dev watcher
 * walks the project root, so it opens that profile's live session files and
 * dies on Windows the moment the other agent's browser touches one:
 *
 *   Error: EBUSY: resource busy or locked, watch
 *   'C:\...\lexicon-loop-v2\.playtest\userdata\Default\Sessions\Session_…'
 *
 * The dev server then exits mid-walk and the gate reports
 * `net::ERR_CONNECTION_REFUSED` or "Execution context was destroyed" — a red
 * gate that says nothing about the game, which is worse than a slow one,
 * because the next round has to re-derive that it was noise. (It also fires as
 * a spurious HMR full-reload when another agent writes anywhere in the tree.)
 *
 * Nothing here changes what is SERVED — same base, same plugins, same module
 * graph — only which paths the watcher subscribes to. The gates still drive
 * the real app off the real source.
 */

import { defineConfig, mergeConfig, type UserConfig } from 'vite';
import baseConfig from '../vite.config';

const gate: UserConfig = {
  server: {
    watch: {
      ignored: [
        '**/.playtest/**',   // sibling agents' browser profiles (the EBUSY)
        '**/dist/**',
        '**/.git/**',
        '**/node_modules/**',
        '**/*.png',
        '**/tasks/**',
      ],
    },
  },
};

// The root config is now a config FUNCTION (it needs ConfigEnv to know whether
// it is being loaded for `vite preview`, where the stale-dist guard fires —
// REVIEW_AA §0). Resolve it against the same env we were handed, then merge.
export default defineConfig(async (env) => {
  const resolved = typeof baseConfig === 'function' ? await baseConfig(env) : baseConfig;
  return mergeConfig(resolved as UserConfig, gate);
});
