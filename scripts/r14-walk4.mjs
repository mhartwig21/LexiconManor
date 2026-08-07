/**
 * Round 14 live critic — stage 4: rooms, lifecycle scenes, victory ceremony,
 * journal letter aside, campaign grants + persistent traces, marker truth.
 * ONE browser (system Edge), closed in a finally.
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
    pts.forEach(([x, y], i) => {
      const h = document.elementFromPoint(x, y);
      if (!(h && (h === el || el.contains(h)))) bad[names[i]] = !h ? 'null' : (typeof h.className === 'string' && h.className ? '.' + h.className.trim().split(/\s+/).join('.') : h.tagName);
    });
    rows.push({ cls: typeof el.className === 'string' ? el.className : '', txt: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 40), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], bad: Object.keys(bad).length ? bad : null });
  }
  return rows;
}

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const all = () => page.evaluate(allHits);
  const drain = async () => {
    for (let i = 0; i < 30; i++) {
      const b = await page.$('.mom'); if (!b) return;
      const r = await b.boundingBox(); if (!r) return;
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      await page.waitForTimeout(140);
    }
  };
  const toExploring = async () => {
    await page.waitForSelector('.bp-btn--seal');
    await page.click('.bp-btn--seal');
    await page.waitForTimeout(900);
    if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(700); }
    for (let i = 0; i < 80 && (await page.$('.dlg')); i++) {
      const p = await page.$('.dlg-choice--primary');
      if (p) { await p.click(); await page.waitForTimeout(150); continue; }
      const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
      if (c) { await c.click(); await page.waitForTimeout(150); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => { });
      await page.waitForTimeout(140);
    }
    await page.waitForTimeout(500);
    await drain();
  };

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await toExploring();

  /* ---------- ROOM: exits + retire reachability ---------- */
  L('=== ROOM SURFACES ===');
  for (const [kind, cardId] of [['hive', 'conservatory'], ['sudoku', 'counting-house'], ['crossword', 'still-room'], ['forgotten-word', 'study']]) {
    await page.evaluate(([k, c]) => {
      const store = window.__manorStore; const s = store.getState(); const m = s.manor;
      const cell = { col: m.playerCell.col, row: m.playerCell.row }; const key = `${cell.col},${cell.row}`;
      store.setState({ manor: { ...m, rooms: { ...m.rooms, [key]: { cardId: c, cell, doors: ['N', 'S'], solved: false, kind: k } } } });
      store.getState().enterRoom(key);
    }, [kind, cardId]);
    await page.waitForTimeout(800);
    const hash = await page.evaluate(() => location.hash);
    L(`\n--- room ${kind} (hash ${hash}) ---`);
    const rows = await all();
    L('exit-ish controls:', JSON.stringify(rows.filter((r) => /leave|abandon|back|manor|tomorrow/i.test(r.txt) || /backlink|retire|rh-/.test(r.cls))));
    L('any covered:', JSON.stringify(rows.filter((r) => r.bad)));
    // grant a campaign event from inside the room and look for the seal
    await page.evaluate(() => window.__manorStore.getState().unlockCard('boot-room'));
    await page.waitForTimeout(500);
    const seal = await page.evaluate(() => { const m = document.querySelector('.mom'); if (!m) return null; const r = m.getBoundingClientRect(); const cs = getComputedStyle(m); return { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], pe: cs.pointerEvents, txt: m.innerText.replace(/\s+/g, ' ').slice(0, 90), tag: m.tagName }; });
    L('seal in room:', JSON.stringify(seal));
    await drain();
    // leave the room by its own control
    const leave = await page.$('.rh-leave, .backlink, button:has-text("Leave")');
    if (leave) { await leave.click(); await page.waitForTimeout(600); L('after leave hash:', await page.evaluate(() => location.hash)); }
    else L('NO LEAVE CONTROL FOUND');
    await page.evaluate(() => { const s = window.__manorStore.getState(); if (s.day?.activeRoom) s.exitRoom?.(); location.hash = '/manor'; });
    await page.waitForTimeout(400);
  }

  /* ---------- JOURNAL: letter aside overlay + markers ---------- */
  L('\n\n=== JOURNAL ===');
  await page.evaluate(() => { location.hash = '/journal'; });
  await page.waitForTimeout(700);
  const jrnEntrance = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.bp-btn')].find((b) => /Journal/.test(b.innerText));
    return btn ? btn.innerText.replace(/\s+/g, ' ') : null;
  });
  L('entrance label (from manor):', jrnEntrance);
  await page.click('.jrn-tab:has-text("Letters")');
  await page.waitForTimeout(500);
  L('letters tab controls:', JSON.stringify(await all(), null, 0));
  const letter = await page.$('.jrn-letter, .jrn-card button, .jrn-letters button');
  if (letter) {
    await letter.click(); await page.waitForTimeout(600);
    L('--- letter aside overlay ---');
    L(JSON.stringify(await all(), null, 0));
    L('retire during letter aside:', await page.evaluate(() => !!document.querySelector('.chr-retire')));
    L('overlay attr:', await page.evaluate(() => document.documentElement.hasAttribute('data-overlay-open')));
  }
  L('errs:', JSON.stringify(errs.slice(0, 6)));
} finally {
  if (browser) await browser.close();
  server.kill();
}
