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
    // stand her on the Sanctum landing (row 5, col 2)
    await page.evaluate(() => {
      const st = window.__manorStore; const s = st.getState(); const m = s.manor; const rooms = { ...m.rooms };
      for (let r = 1; r <= 5; r++) rooms[`2,${r}`] = { cardId: 'linen-closet', cell: { col: 2, row: r }, doors: ['N', 'E', 'S', 'W'], solved: true, kind: 'crossword' };
      st.setState({ manor: { ...m, rooms, playerCell: { col: 2, row: 5 } } });
    });
    await page.waitForTimeout(600);
    console.log(`### ${VP.width}x${VP.height} landing controls (no seal):`, JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.bp-sheetwrap [role=button], .bp-sheetwrap button, .bp-sheetwrap [tabindex]')].map((b) => { const r = b.getBoundingClientRect(); return { l: (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').slice(0, 44), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }; }))));
    await page.evaluate(() => window.__manorStore.getState().unlockCard('boot-room'));
    await page.waitForTimeout(600);
    console.log('with seal:', JSON.stringify(await page.evaluate(() => {
      const mom = document.querySelector('.mom'); const mr = mom && mom.getBoundingClientRect();
      const nm = (n) => !n ? 'null' : (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).join('.') : n.tagName);
      const rows = [];
      for (const b of document.querySelectorAll('.bp-sheetwrap [role=button], .bp-sheetwrap button, .bp-sheetwrap [tabindex], .bp-foot button')) {
        const r = b.getBoundingClientRect(); if (r.width < 2) continue;
        const ix = Math.max(3, r.width * .12), iy = Math.max(3, r.height * .12);
        const pts = { c: [r.left + r.width / 2, r.top + r.height / 2], tl: [r.left + ix, r.top + iy], tr: [r.right - ix, r.top + iy], bl: [r.left + ix, r.bottom - iy], br: [r.right - ix, r.bottom - iy] };
        const bad = {};
        for (const [k, [x, y]] of Object.entries(pts)) { const h = document.elementFromPoint(x, y); if (!(h && b.contains(h))) bad[k] = nm(h); }
        rows.push({ l: (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').slice(0, 40), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], bad: Object.keys(bad).length ? bad : 'clean' });
      }
      return { mom: mr ? [Math.round(mr.x), Math.round(mr.y), Math.round(mr.width), Math.round(mr.height)] : null, rows };
    })));
    await ctx.close();
  }
} finally { if (browser) await browser.close(); server.kill(); }
