/**
 * Round 14 live critic — stage 6: the seal over the BLUEPRINT's upper storeys
 * (the §0.5 escape-4 shape on a surface nobody re-probed), plus marker truth
 * across day roll, reload, and the sealed→legible transition.
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

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const VP of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
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

    /* --- put her high in the manor: a column of rooms up to row 5 --- */
    await page.evaluate(() => {
      const store = window.__manorStore; const s = store.getState(); const m = s.manor;
      const rooms = { ...m.rooms };
      for (let r = 1; r <= 5; r++) rooms[`2,${r}`] = { cardId: 'linen-closet', cell: { col: 2, row: r }, doors: ['N', 'E', 'S', 'W'], solved: true, kind: 'crossword' };
      store.setState({ manor: { ...m, rooms, playerCell: { col: 2, row: 5 } } });
    });
    await page.waitForTimeout(600);
    const doorsBefore = await page.evaluate(() => [...document.querySelectorAll('[aria-label*="Draft a room"]')].map((d) => { const r = d.getBoundingClientRect(); return { label: d.getAttribute('aria-label').slice(0, 44), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }; }));
    L('draft doors at row 5:', JSON.stringify(doorsBefore));

    // provoke a campaign grant from the blueprint the player is really on
    await page.evaluate(() => window.__manorStore.getState().unlockCard('boot-room'));
    await page.waitForTimeout(500);
    const probe = await page.evaluate(() => {
      const mom = document.querySelector('.mom');
      const nm = (n) => !n ? 'null' : (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).join('.') : n.tagName);
      const momBox = mom ? (({ x, y, width, height }) => [Math.round(x), Math.round(y), Math.round(width), Math.round(height)])(mom.getBoundingClientRect()) : null;
      const rows = [];
      for (const d of document.querySelectorAll('[aria-label*="Draft a room"], .bp-btn, [aria-label*="Enter"], [aria-label*="Walk"]')) {
        const r = d.getBoundingClientRect(); if (r.width < 2) continue;
        const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        rows.push({ label: (d.getAttribute('aria-label') || d.innerText || '').replace(/\s+/g, ' ').slice(0, 40), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], centre: (h && (h === d || d.contains(h))) ? 'own' : nm(h) });
      }
      return { momBox, momTag: mom && mom.tagName, momPE: mom && getComputedStyle(mom).pointerEvents, rows };
    });
    L('seal over blueprint at row 5:', JSON.stringify(probe, null, 0));

    // DRIVE it: tap a covered door and see what happens
    const covered = probe.rows.find((r) => r.centre === '.mom' || String(r.centre).startsWith('.mom'));
    if (covered) {
      const before = await page.evaluate(() => ({ modal: !!document.querySelector('.bp-modal'), mom: !!document.querySelector('.mom'), steps: window.__manorStore.getState().day.steps }));
      await page.mouse.click(covered.box[0] + covered.box[2] / 2, covered.box[1] + covered.box[3] / 2);
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({ modal: !!document.querySelector('.bp-modal'), mom: !!document.querySelector('.mom'), steps: window.__manorStore.getState().day.steps }));
      L('DRIVEN tap on covered door:', JSON.stringify({ target: covered.label, before, after }));
    } else L('no blueprint control covered by the seal');
    await drain();

    /* --- marker truth: entrance vs tab vs card counts --- */
    L('\n--- markers ---');
    const readMarks = () => page.evaluate(() => {
      const ent = [...document.querySelectorAll('.bp-btn')].map((b) => b.innerText.replace(/\s+/g, ' ')).filter((t) => /Journal|Chronicles|Cabinet/.test(t));
      return { entrances: ent, hash: location.hash };
    });
    await page.evaluate(() => { location.hash = '/manor'; }); await page.waitForTimeout(400);
    L('blueprint entrances:', JSON.stringify(await readMarks()));
    await page.evaluate(() => { location.hash = '/journal'; }); await page.waitForTimeout(700);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.jrn-tab')].map((t) => ({ txt: t.innerText.replace(/\s+/g, ' '), label: t.getAttribute('aria-label'), marks: [...t.querySelectorAll('.unread-mark, .unread-pip, .sealed-mark, .sealed-pip, [class*=unread], [class*=sealed]')].map((m) => m.className + '|' + (m.getAttribute('aria-label') || m.innerText || '')) })));
    L('journal tabs:', JSON.stringify(tabs, null, 0));
    // day roll + reload persistence
    await page.evaluate(() => { location.hash = '/manor'; }); await page.waitForTimeout(300);
    await page.evaluate(() => window.__manorStore.getState().endDay('steps-exhausted'));
    await page.waitForTimeout(5200);
    if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(900); }
    L('after day roll, entrances:', JSON.stringify(await readMarks()));
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
    L('after reload, body:', (await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))).slice(0, 300));
    L('after reload, entrances:', JSON.stringify(await readMarks()));
    L('errs:', JSON.stringify(errs.slice(0, 5)));
    await ctx.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
