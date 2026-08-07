/**
 * scripts/build.ts — OWNER: build-integrity (REVIEW_AA §0 / §5.5).
 *
 * The build, with one invariant: **a build that does not fully succeed leaves
 * no dist/ behind.**
 *
 * The old `build` script was `tsc --noEmit && vite build`. `&&` stops the
 * chain, which is correct, but it stops it *without cleaning up* — and vite
 * only empties outDir when it actually runs. So a red `tsc` left the previous
 * dist/ sitting there looking exactly like a good one, and `vite preview`
 * served it. That is how two hostile reviews came to be written about a build
 * from several days earlier.
 *
 * So: dist/ is deleted BEFORE the first step, and deleted again if any step
 * fails. There is never a window in which a partial or stale dist exists and
 * looks servable. The same rule covers the post-build steps
 * (`build-sw-precache.ts` rewrites dist/sw.js and dist/manifest.webmanifest in
 * place — a failure halfway through that leaves a half-stamped dist, so it too
 * must take the whole directory down with it).
 *
 * Usage:
 *   npm run build          — clean · typecheck · vite build · verify
 *   npm run build:pages    — the above plus the deploy gates and SW precache
 */

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, checkDist, formatVerdict } from './dist-guard';

const PAGES = process.argv.includes('--pages');
const DIST = join(REPO_ROOT, 'dist');
const VIA = PAGES ? 'npm run build:pages' : 'npm run build';

interface Step {
  label: string;
  cmd: string;
}

const TYPECHECK: Step = {
  label: 'typecheck (tsc --noEmit)',
  cmd: 'node node_modules/typescript/bin/tsc --noEmit',
};
const VITE_BUILD: Step = {
  label: 'vite build',
  cmd: 'node node_modules/vite/bin/vite.js build',
};
const SW_PRECACHE: Step = {
  label: 'inject SW precache + base-path integrity (AAA 7.5)',
  cmd: 'node node_modules/tsx/dist/cli.mjs scripts/build-sw-precache.ts',
};

const PAGES_GATES: Step[] = [
  { label: 'grain asset check', cmd: 'node scripts/gen-grain.mjs --check' },
  { label: 'chrome clearance lint', cmd: 'node scripts/lint-chrome-clearance.mjs' },
  { label: 'chrome clearance lint (self-test)', cmd: 'node scripts/lint-chrome-clearance.mjs --self-test' },
  { label: 'content verification', cmd: 'npm run content:verify' },
];

const steps: Step[] = PAGES
  ? [...PAGES_GATES, TYPECHECK, VITE_BUILD, SW_PRECACHE]
  : [TYPECHECK, VITE_BUILD];

function nukeDist(): void {
  if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
}

function die(headline: string, detail: string[]): never {
  nukeDist();
  const rule = '─'.repeat(72);
  console.error(
    ['', rule, `  BUILD FAILED — ${headline}`, rule, ...detail.map((d) => `  ${d}`), rule, ''].join('\n'),
  );
  process.exit(1);
}

function runPipeline(): void {
  // 1. Clean first. Nothing survives a failure from here on.
  nukeDist();
  console.log(`· dist/ cleared — nothing to serve until this build finishes (${VIA})`);

  for (const [i, step] of steps.entries()) {
    console.log(`\n· [${i + 1}/${steps.length}] ${step.label}`);
    const r = spawnSync(step.cmd, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, MANOR_BUILD_VIA: VIA },
    });
    if (r.status !== 0) {
      die(`${step.label} exited ${r.status ?? 'with a signal'}`, [
        'dist/ has been removed, so nothing stale can be previewed or deployed',
        'in place of this build. Fix the error above and run the build again.',
      ]);
    }
  }
}

// 2. Run it, then verify our own output: the guard that protects `vite preview`
//    has to pass here too, or the build is lying about itself.
//
//    One retry, and only for `stale`. Several agents share this checkout, so a
//    sibling writing a source file during the ~30s build is routine, not a
//    defect — and the resulting dist genuinely does not match the tree, so it
//    must not be blessed. Retrying once absorbs the common case; failing after
//    two says something true, which is that the tree is changing faster than it
//    can be built reproducibly.
const ATTEMPTS = 2;
let verdict = null as ReturnType<typeof checkDist> | null;

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  if (attempt > 1) {
    console.log(
      `\n· source moved while the build was running — attempt ${attempt}/${ATTEMPTS}\n`,
    );
  }
  runPipeline();
  verdict = checkDist(REPO_ROOT, DIST);
  if (verdict.ok || verdict.code !== 'stale') break;
}

if (!verdict || !verdict.ok) {
  die(`the finished dist/ failed its own freshness check [${verdict?.code ?? 'unknown'}]`, [
    ...(verdict?.lines ?? []),
    '',
    `Source changed during ${ATTEMPTS} consecutive builds, so no dist here can be`,
    'said to match the tree. Let the other writes settle, then build again.',
  ]);
}

console.log(`\n${formatVerdict(verdict)}`);
console.log(`✓ ${VIA} complete.`);
