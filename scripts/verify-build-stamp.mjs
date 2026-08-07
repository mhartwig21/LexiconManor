/**
 * scripts/verify-build-stamp.mjs — one-shot verification for REVIEW_AA §5.5(2).
 * Spawns the real preview server (so the stale-dist guard is in the path),
 * opens Chronicles at 390x844@2x, and reports the build stamp the app renders.
 * ONE browser, closed in a finally.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEdition } from './edition.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 4196);
const BASE = `http://localhost:${PORT}/LexiconManor/`;

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
server.stdout.on('data', (b) => process.stdout.write(`[preview] ${b}`));
server.stderr.on('data', (b) => process.stderr.write(`[preview:err] ${b}`));

let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`served: ${await fetchEdition(BASE)}`);

  browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await page.goto(`${BASE}#/chronicles`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const el = page.locator('[data-testid="build-stamp"]');
  const n = await el.count();
  console.log(`build-stamp elements on #/chronicles: ${n}`);
  if (n > 0) {
    console.log(`text  : ${JSON.stringify((await el.first().innerText()).trim())}`);
    console.log(`id    : ${await el.first().getAttribute('data-build-id')}`);
    console.log(`git   : ${await el.first().getAttribute('data-build-git')}`);
    console.log(`at    : ${await el.first().getAttribute('data-build-at')}`);
    const box = await el.first().boundingBox();
    console.log(`box   : ${JSON.stringify(box)}`);
    const style = await el.first().evaluate((n2) => {
      const c = getComputedStyle(n2);
      return { fontSize: c.fontSize, color: c.color, opacity: c.opacity, textAlign: c.textAlign };
    });
    console.log(`style : ${JSON.stringify(style)}`);
  } else {
    console.log('body text sample:', (await page.locator('body').innerText()).slice(0, 300));
  }
} finally {
  if (browser) await browser.close();
  server.kill('SIGKILL');
}
