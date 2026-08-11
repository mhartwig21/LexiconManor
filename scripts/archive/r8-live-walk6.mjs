/** r8-live-walk6.mjs — last gap: does a floorplan card unlock announce itself? */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function freePort(from = 5531, to = 5570) {
  for (let p = from; p <= to; p++) {
    let taken = false;
    for (const host of ['127.0.0.1', '::1', undefined]) {
      // eslint-disable-next-line no-await-in-loop
      taken = taken || await new Promise((res) => {
        const s = createServer();
        s.once('error', () => res(true));
        s.once('listening', () => s.close(() => res(false)));
        if (host) s.listen(p, host); else s.listen(p);
      });
    }
    if (!taken) return p;
  }
  throw new Error('no free port');
}
const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const say = (s) => console.log('[w6] ' + s);
const server = spawn(process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const up = (async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview did not answer');
})();
let browser;
try {
  await up;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title');
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene');
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.dlg');
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const p = await page.$('.dlg-choice--primary');
    if (p) { await p.click(); await page.waitForTimeout(160); continue; }
    const sk = await page.$('.dlg__skip');
    if (sk) { await sk.click(); await page.waitForTimeout(160); continue; }
    const c = await page.$('.dlg-choice');
    if (c) { await c.click(); await page.waitForTimeout(160); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await page.waitForTimeout(140);
  }
  await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring');
  for (let i = 0; i < 6 && (await page.$('.mom')); i++) { await page.click('.mom'); await page.waitForTimeout(250); }

  const flags = await page.evaluate(() => {
    // set every unlock flag the deck knows, through the real setFlag mutator
    const s = window.__manorStore.getState();
    const before = s.cabinet.unlockedCardIds.slice();
    for (const f of ['posy-quest-1', 'fern-quest-1', 'sys.first-gift', 'quest.posy.1', 'quest.fern.1']) {
      try { s.setFlag(f); } catch { /* not in the flag table */ }
    }
    return { before, after: window.__manorStore.getState().cabinet.unlockedCardIds.slice() };
  });
  await page.waitForTimeout(900);
  const glass = await page.evaluate(() => ({
    mom: document.querySelector('.mom')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    notices: [...document.querySelectorAll('.chr-notice')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()),
    entrances: [...document.querySelectorAll('.bp-foot button')].map((b) => ({
      label: b.innerText.replace(/\s+/g, ' ').trim(), mark: Boolean(b.querySelector('.unread')) })),
  }));
  say(`CARD UNLOCK: ${JSON.stringify(flags)}`);
  say(`GLASS at the moment of unlock: ${JSON.stringify(glass)}`);
} catch (e) {
  say(`THREW: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
