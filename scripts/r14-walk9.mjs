/** Round 14 live critic — stage 9: error/empty branches + chronicles scroll. */
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

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const VP of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
    const drain = async () => { for (let i = 0; i < 30; i++) { const b = await page.$('.mom'); if (!b) return; const r = await b.boundingBox(); if (!r) return; await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(140); } };
    L(`\n######## ${VP.width}x${VP.height} ########`);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.bp-btn--seal');

    /* ---- chronicles from a FRESH save: scroll + destructive reachability ---- */
    await page.evaluate(() => { location.hash = '/chronicles'; });
    await page.waitForTimeout(800);
    L('chronicles (fresh save):', JSON.stringify(await page.evaluate(() => {
      const el = document.querySelector('.chron');
      const de = document.documentElement;
      const grave = [...document.querySelectorAll('button')].find((b) => /Erase everything/.test(b.innerText));
      const r = grave && grave.getBoundingClientRect();
      return {
        docScrollable: de.scrollHeight > de.clientHeight,
        chronScroll: el ? { sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY } : null,
        graveBox: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
        vh: innerHeight,
      };
    })));
    // can she scroll to it?
    await page.evaluate(() => { const el = document.querySelector('.chron'); if (el) el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(400);
    L('after scrolling chron to bottom:', JSON.stringify(await page.evaluate(() => {
      const grave = [...document.querySelectorAll('button')].find((b) => /Erase everything/.test(b.innerText));
      if (!grave) return null; const r = grave.getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], owns: !!(h && grave.contains(h)), hit: h ? (typeof h.className === 'string' ? h.className : h.tagName) : 'null' };
    })));
    // and the backlink, at that scroll position (11.3: uncovered at EVERY scroll position)
    L('backlink at bottom scroll:', JSON.stringify(await page.evaluate(() => {
      const b = document.querySelector('.backlink'); if (!b) return null; const r = b.getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], owns: !!(h && b.contains(h)), hit: h ? (typeof h.className === 'string' ? h.className : h.tagName) : 'null' };
    })));

    /* ---- journal on an unauthored volume ---- */
    await page.evaluate(() => { location.hash = '/manor'; });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const st = window.__manorStore; const s = st.getState();
      st.setState({ volume: { ...s.volume, volumeId: 'volume-999' } });
      location.hash = '/journal';
    });
    await page.waitForTimeout(800);
    L('journal, unauthored volume:', JSON.stringify(await page.evaluate(() => ({
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
      ctrls: [...document.querySelectorAll('button')].map((b) => b.className + '|' + b.innerText.replace(/\s+/g, ' ').slice(0, 30)),
      backlinkOwns: (() => { const b = document.querySelector('.backlink'); if (!b) return null; const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(h && b.contains(h)); })(),
    }))));
    L('sanctum, unauthored volume:', JSON.stringify(await page.evaluate(() => { location.hash = '/sanctum'; return null; })));
    await page.waitForTimeout(700);
    L(JSON.stringify(await page.evaluate(() => ({
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
      ctrls: [...document.querySelectorAll('button')].map((b) => b.className + '|' + b.innerText.replace(/\s+/g, ' ').slice(0, 30)),
    }))));

    /* ---- unregistered room kind ---- */
    await page.evaluate(() => { const st = window.__manorStore; const s = st.getState(); st.setState({ volume: { ...s.volume, volumeId: 'volume-1' } }); location.hash = '/manor'; });
    await page.waitForTimeout(400);
    await page.click('.bp-btn--seal').catch(() => { });
    await page.waitForTimeout(900);
    if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(600); }
    for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
      const p = await page.$('.dlg-choice--primary'); if (p) { await p.click(); await page.waitForTimeout(140); continue; }
      const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) { await c.click(); await page.waitForTimeout(140); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => { }); await page.waitForTimeout(130);
    }
    await page.waitForTimeout(400); await drain();
    await page.evaluate(() => {
      const st = window.__manorStore; const s = st.getState(); const m = s.manor;
      const cell = { col: m.playerCell.col, row: m.playerCell.row }; const key = `${cell.col},${cell.row}`;
      st.setState({ manor: { ...m, rooms: { ...m.rooms, [key]: { cardId: 'nope-card', cell, doors: ['N', 'S'], solved: false, kind: 'not-a-kind' } } } });
      st.getState().enterRoom(key);
    });
    await page.waitForTimeout(800);
    L('unregistered room kind:', JSON.stringify(await page.evaluate(() => ({
      hash: location.hash,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 220),
      ctrls: [...document.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect();
        const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { c: b.className, t: b.innerText.replace(/\s+/g, ' ').slice(0, 30), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], owns: !!(h && b.contains(h)) };
      }),
    }))));
    L('errs:', JSON.stringify(errs.slice(0, 5)));
    await ctx.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
