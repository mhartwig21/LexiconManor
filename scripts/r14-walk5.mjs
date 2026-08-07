/**
 * Round 14 live critic — stage 5: Linen Closet clue row, dusk veil, night
 * digest, victory ceremony, marker truth across day roll + reload.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = await (async () => {
  for (let p = 6410; p < 6470; p++) {
    const taken = await new Promise((res) => { const s = createServer(); s.once('error', () => res(true)); s.once('listening', () => s.close(() => res(false))); s.listen(p, '127.0.0.1'); });
    if (!taken) return p;
  }
  throw new Error('no free port');
})();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch { } await new Promise((r) => setTimeout(r, 500)); }

const L = (...a) => console.log(...a);
function allHits() {
  const rows = [];
  for (const el of document.querySelectorAll('button,[role=button],a[href]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const ix = Math.max(4, r.width * 0.12), iy = Math.max(4, r.height * 0.12);
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + ix, r.top + iy], [r.right - ix, r.top + iy], [r.left + ix, r.bottom - iy], [r.right - ix, r.bottom - iy]];
    const names = ['c', 'tl', 'tr', 'bl', 'br'];
    const bad = {};
    pts.forEach(([x, y], i) => { const h = document.elementFromPoint(x, y); if (!(h && (h === el || el.contains(h)))) bad[names[i]] = !h ? 'null' : (typeof h.className === 'string' && h.className ? '.' + h.className.trim().split(/\s+/).join('.') : h.tagName); });
    rows.push({ cls: typeof el.className === 'string' ? el.className : '', txt: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 40), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], bad: Object.keys(bad).length ? bad : null });
  }
  return rows;
}

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const VP of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    const all = () => page.evaluate(allHits);
    const drain = async () => { for (let i = 0; i < 30; i++) { const b = await page.$('.mom'); if (!b) return; const r = await b.boundingBox(); if (!r) return; await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(140); } };
    L(`\n######## ${VP.width}x${VP.height} ########`);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.bp-btn--seal');
    await page.click('.bp-btn--seal'); await page.waitForTimeout(900);
    if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(700); }
    for (let i = 0; i < 80 && (await page.$('.dlg')); i++) {
      const p = await page.$('.dlg-choice--primary'); if (p) { await p.click(); await page.waitForTimeout(150); continue; }
      const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) { await c.click(); await page.waitForTimeout(150); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => { }); await page.waitForTimeout(140);
    }
    await page.waitForTimeout(400); await drain();

    /* --- LINEN CLOSET clue row --- */
    await page.evaluate(() => {
      const store = window.__manorStore; const s = store.getState(); const m = s.manor;
      const cell = { col: m.playerCell.col, row: m.playerCell.row }; const key = `${cell.col},${cell.row}`;
      store.setState({ manor: { ...m, rooms: { ...m.rooms, [key]: { cardId: 'linen-closet', cell, doors: ['N', 'S'], solved: false, kind: 'crossword' } } } });
      store.getState().enterRoom(key);
    });
    await page.waitForTimeout(900);
    L('--- Linen Closet ---');
    const lc = await page.evaluate(() => {
      const c = document.querySelector('.lc-clue'); if (!c) return null;
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const h = document.elementFromPoint(cx, cy);
      const nm = (n) => !n ? 'null' : (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).join('.') : n.tagName);
      const keys = document.querySelector('.lc-keys, .lc-keys__row');
      return { clue: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], centreHit: nm(h), ownsIt: !!(h && c.contains(h)), keysBox: keys ? (({ x, y, width, height }) => [Math.round(x), Math.round(y), Math.round(width), Math.round(height)])(keys.getBoundingClientRect()) : null, stageH: getComputedStyle(document.documentElement).getPropertyValue('--stage-h') };
    });
    L(JSON.stringify(lc));
    // driven tap on the clue row: does it do anything?
    const before = await page.evaluate(() => document.querySelector('.lc-clue')?.innerText.replace(/\s+/g, ' '));
    const cb = await page.$('.lc-clue'); if (cb) { const r = await cb.boundingBox(); await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(300); }
    const after = await page.evaluate(() => document.querySelector('.lc-clue')?.innerText.replace(/\s+/g, ' '));
    L('clue tap:', JSON.stringify({ before, after, changed: before !== after }));
    await page.evaluate(() => { window.__manorStore.getState().leaveRoom?.(); location.hash = '/manor'; });
    await page.waitForTimeout(500);

    /* --- DUSK + NIGHT DIGEST --- */
    await page.evaluate(() => window.__manorStore.getState().endDay('steps-exhausted'));
    await page.waitForTimeout(600);
    L('\n--- DUSK VEIL ---');
    L('phase:', await page.evaluate(() => window.__manorStore.getState().day?.phase));
    L(JSON.stringify(await all(), null, 0));
    L('retire during dusk:', await page.evaluate(() => !!document.querySelector('.chr-retire')));
    await page.waitForTimeout(4500);
    L('\n--- NIGHT DIGEST ---');
    L('phase:', await page.evaluate(() => window.__manorStore.getState().day?.phase));
    L('text:', await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500)));
    L(JSON.stringify(await all(), null, 0));
    L('retire during night digest:', await page.evaluate(() => !!document.querySelector('.chr-retire')));
    await ctx.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
