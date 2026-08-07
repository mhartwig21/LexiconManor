import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = await (async () => { for (let p = 6410; p < 6470; p++) { const taken = await new Promise((res) => { const s = createServer(); s.once('error', () => res(true)); s.once('listening', () => s.close(() => res(false))); s.listen(p, '127.0.0.1'); }); if (!taken) return p; } throw new Error('no port'); })();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch { } await new Promise((r) => setTimeout(r, 500)); }
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const VP of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.bp-btn--seal'); await page.click('.bp-btn--seal'); await page.waitForTimeout(900);
    if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(700); }
    for (let i = 0; i < 80 && (await page.$('.dlg')); i++) {
      const p = await page.$('.dlg-choice--primary'); if (p) { await p.click(); await page.waitForTimeout(150); continue; }
      const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) { await c.click(); await page.waitForTimeout(150); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => { }); await page.waitForTimeout(140);
    }
    await page.waitForTimeout(400);
    for (let i = 0; i < 30; i++) { const b = await page.$('.mom'); if (!b) break; const r = await b.boundingBox(); await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(140); }
    await page.evaluate(() => {
      const st = window.__manorStore; const s = st.getState(); const m = s.manor; const rooms = { ...m.rooms };
      for (let r = 1; r <= 5; r++) rooms[`2,${r}`] = { cardId: 'linen-closet', cell: { col: 2, row: r }, doors: ['N', 'E', 'S', 'W'], solved: true, kind: 'crossword' };
      st.setState({ manor: { ...m, rooms, playerCell: { col: 2, row: 5 } } });
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__manorStore.getState().unlockCard('boot-room'));
    await page.waitForTimeout(600);
    const box = await page.evaluate(() => { const b = [...document.querySelectorAll('[aria-label]')].find((x) => /Approach the Sanctum/.test(x.getAttribute('aria-label'))); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    const before = await page.evaluate(() => ({ hash: location.hash, seal: !!document.querySelector('.mom') }));
    await page.mouse.click(box[0], box[1]);
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ hash: location.hash, seal: !!document.querySelector('.mom') }));
    console.log(`### ${VP.width}x${VP.height} DRIVEN tap at "Approach the Sanctum":`, JSON.stringify({ before, after }));
    await ctx.close();
  }
} finally { if (browser) await browser.close(); server.kill(); }
