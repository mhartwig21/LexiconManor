/**
 * scripts/r7-compose-fit.mjs — the room-fit worksheet for the round-7 mobile
 * composition pass. Prints, per room and per viewport, the stage box and the
 * height of every child of the room column, with iPhone safe-area insets shimmed
 * into the real cascade (desktop Chromium resolves env() to 0 and this Edge has
 * no Emulation.setSafeAreaInsets, so without the shim every board is measured
 * ~81px more generous than the device gives it).
 *
 * Harness rules: system Edge (channel 'msedge'), ONE browser, closed in a
 * finally. Run: node scripts/r7-compose-fit.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function freePort(from = 5431, to = 5480) {
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

const KIND = { gallery: 'twistle', conservatory: 'hive', 'counting-house': 'sudoku',
  darkroom: 'cipher', library: 'word-web', study: 'forgotten-word', 'linen-closet': 'crossword' };
const SEL = { twistle: '.anch--gallery', hive: '.anch--conservatory', sudoku: '.ch',
  cipher: '.mic--darkroom', 'word-web': '.anch--library', 'forgotten-word': '.anch--study',
  crossword: '.m2--linen' };

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title');
  await page.evaluate(SHIM);

  async function ensureExploring() {
    for (let i = 0; i < 90; i++) {
      const st = await page.evaluate(() => {
        const s = window.__manorStore?.getState();
        return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor };
      });
      if (st.phase === 'exploring' && st.hasManor) return true;
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
      const seal = await page.$('.bp-btn--seal'); if (seal && st.phase === null) { await seal.click(); await sleep(400); continue; }
      await sleep(200);
    }
    return false;
  }
  const clearMoments = async () => {
    for (let i = 0; i < 8; i++) {
      const gone = await page.evaluate(() => {
        const m = document.querySelector('.mom'); if (!m) return true;
        m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.click?.(); return false;
      });
      if (gone) return; await sleep(350);
    }
  };

  const report = {};
  for (const [card, cell] of [['conservatory', { col: 4, row: 2 }], ['gallery', { col: 3, row: 2 }],
    ['library', { col: 2, row: 5 }], ['study', { col: 1, row: 2 }], ['darkroom', { col: 6, row: 2 }],
    ['counting-house', { col: 5, row: 2 }], ['linen-closet', { col: 0, row: 3 }]]) {
    const kind = KIND[card];
    await ensureExploring();
    await page.evaluate(({ card, cell, kind }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell,
        rooms: { ...st.manor.rooms, [key]: { cardId: card, cell, doors: ['N','S','E','W'], solved: false, kind } } } });
      window.__manorStore.getState().enterRoom(key);
    }, { card, cell, kind });
    await page.waitForSelector(SEL[kind]);
    await clearMoments();
    report[card] = {};
    for (const vp of [{ w: 390, h: 844 }, { w: 375, h: 667 }]) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.evaluate(SHIM);
      await sleep(300);
      report[card][`${vp.w}x${vp.h}`] = await page.evaluate((sel) => {
        const stage = document.querySelector('.room-host__stage');
        const col = document.querySelector(sel);
        const foot = document.querySelector('.room-host__footer');
        const sr = stage.getBoundingClientRect();
        const kids = [...col.children].map((c) => {
          const r = c.getBoundingClientRect();
          return { cls: c.className.split(' ')[0] || c.tagName.toLowerCase(), h: +r.height.toFixed(1), top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1) };
        });
        return {
          stage: { top: +sr.top.toFixed(1), bottom: +sr.bottom.toFixed(1), h: +sr.height.toFixed(1),
            scrollH: stage.scrollHeight, clientH: stage.clientHeight,
            overflow: stage.scrollHeight - stage.clientHeight },
          footTop: +foot.getBoundingClientRect().top.toFixed(1),
          colH: +col.getBoundingClientRect().height.toFixed(1),
          kids,
        };
      }, SEL[kind]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.__manorStore.getState().leaveRoom());
    await sleep(300);
  }
  console.log(JSON.stringify(report, null, 1));
} finally {
  if (browser) await browser.close();
  server.kill();
}
