/**
 * scripts/r7-compose-hit.mjs — the EFFECTIVE tap-target check for the round-7
 * composition pass.
 *
 * `getBoundingClientRect()` measures the border box. Several boards in this
 * game keep a letter-sized visual cell and extend the TARGET with an absolutely
 * positioned `::after` that is part of the button (the Darkroom's cipher slots
 * do exactly this). A border-box audit therefore under-reports those, and a
 * naive fix would grow glyphs that are already the right size. This probes the
 * real thing: it hit-tests a ring of points at ±22px around each cell's centre
 * and reports the widest/tallest box that still answers as that button.
 *
 * Harness rules: system Edge (channel 'msedge'), ONE browser, closed in a
 * finally. Run: node scripts/r7-compose-hit.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function freePort(from = 5481, to = 5520) {
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
const server = spawn(process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite timeout')), 60000);
  server.stdout.on('data', (b) => { if (String(b).includes('ready in')) { clearTimeout(t); res(); } });
  server.on('exit', (c) => { clearTimeout(t); rej(new Error('vite exited ' + c)); });
});

const SHIM = `(() => {
  const I = { top: '47px', bottom: '34px', left: '0px', right: '0px' };
  const sub = (v) => v.replace(/env\\(\\s*safe-area-inset-(top|bottom|left|right)\\s*(?:,[^()]*)?\\)/g, (_, s) => I[s]);
  let n = 0;
  const walk = (rules) => { for (const r of rules) {
    if (r.style && /safe-area-inset/.test(r.cssText)) {
      const b = r.style.cssText, a = sub(b);
      if (a !== b) { n++; try { r.style.cssText = a; } catch {} }
    }
    if (r.cssRules && r.cssRules.length) walk(r.cssRules);
  } };
  for (const s of document.styleSheets) { try { walk(s.cssRules); } catch {} }
  if (n) document.documentElement.dataset.saShim = '1';
  return n || (document.documentElement.dataset.saShim ? -1 : 0);
})()`;

const KIND = { darkroom: 'cipher', 'counting-house': 'sudoku', 'linen-closet': 'crossword' };
const SEL = { cipher: '.mic--darkroom', sudoku: '.ch', crossword: '.m2--linen' };
const CELL = { darkroom: '.dk-cell', 'counting-house': '.ch-cell', 'linen-closet': '.lc-cell:not(.lc-cell--void)' };

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.goto(`http://localhost:${PORT}/LexiconManor/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title');

  async function ensureExploring() {
    for (let i = 0; i < 90; i++) {
      const st = await page.evaluate(() => window.__manorStore?.getState()?.day?.phase ?? null);
      const hasManor = await page.evaluate(() => !!window.__manorStore?.getState()?.manor);
      if (st === 'exploring' && hasManor) return true;
      if (await page.$('.dlg')) {
        const p = await page.$('.dlg-choice--primary');
        if (p) await p.click();
        else {
          const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
          if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
        }
        await sleep(180); continue;
      }
      const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(400); continue; }
      const seal = await page.$('.bp-btn--seal'); if (seal && st === null) { await seal.click(); await sleep(400); continue; }
      await sleep(200);
    }
    return false;
  }

  const out = {};
  for (const [card, cell] of [['darkroom', { col: 6, row: 2 }], ['counting-house', { col: 5, row: 2 }],
    ['linen-closet', { col: 0, row: 3 }]]) {
    await ensureExploring();
    const kind = KIND[card];
    await page.evaluate(({ card, cell, kind }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell,
        rooms: { ...st.manor.rooms, [key]: { cardId: card, cell, doors: ['N','S','E','W'], solved: false, kind } } } });
      window.__manorStore.getState().enterRoom(key);
    }, { card, cell, kind });
    await page.waitForSelector(SEL[kind]);
    for (let i = 0; i < 8; i++) {
      const gone = await page.evaluate(() => {
        const m = document.querySelector('.mom'); if (!m) return true;
        m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.click?.(); return false;
      });
      if (gone) break; await sleep(350);
    }
    out[card] = {};
    for (const vp of [{ w: 390, h: 844 }, { w: 375, h: 667 }]) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.evaluate(SHIM);
      await sleep(300);
      out[card][`${vp.w}x${vp.h}`] = await page.evaluate((sel) => {
        const cells = [...document.querySelectorAll(sel)].filter((c) => {
          const r = c.getBoundingClientRect();
          return r.width > 1 && r.top >= 0 && r.bottom <= window.innerHeight;
        });
        if (!cells.length) return null;
        const probe = (el) => {
          const r = el.getBoundingClientRect();
          const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
          const answers = (x, y) => { const h = document.elementFromPoint(x, y); return !!(h && (h === el || el.contains(h))); };
          let w = 0, h = 0;
          for (let d = 1; d <= 30; d++) { if (answers(cx - d, cy) && answers(cx + d, cy)) w = d * 2; else break; }
          for (let d = 1; d <= 30; d++) { if (answers(cx, cy - d) && answers(cx, cy + d)) h = d * 2; else break; }
          return { box: [+r.width.toFixed(1), +r.height.toFixed(1)], hit: [w, h] };
        };
        const samples = cells.slice(0, 12).map(probe);
        return {
          n: cells.length,
          box: samples[0].box,
          minHitW: Math.min(...samples.map((s) => s.hit[0])),
          minHitH: Math.min(...samples.map((s) => s.hit[1])),
        };
      }, CELL[card]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.__manorStore.getState().leaveRoom());
    await sleep(300);
  }
  console.log(JSON.stringify(out, null, 1));
} finally {
  if (browser) await browser.close();
  server.kill();
}
