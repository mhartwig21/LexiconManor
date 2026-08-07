/** Library wrong-guess bits — poll the toast slot. ONE Edge, closed in finally. */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/critic-rooms');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5741/LexiconManor/';
const webs = JSON.parse(readFileSync(resolve(root, 'content/generated/word-web.json'), 'utf8'));
const R = {};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
  await sleep(600);

  for (let i = 0; i < 90; i++) {
    const st = await page.evaluate(() => {
      const s = window.__manorStore?.getState();
      return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor };
    });
    if (st.phase === 'exploring' && st.hasManor) break;
    if (await page.$('.dlg')) {
      const p = await page.$('.dlg-choice--primary');
      if (p) await p.click();
      else { const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown'); }
      await sleep(180); continue;
    }
    const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(400); continue; }
    const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(400); continue; }
    const any = await page.$('button'); if (any && st.phase === null) { await any.click(); await sleep(350); continue; }
    await sleep(250);
  }
  await page.evaluate(() => {
    const st = window.__manorStore.getState();
    const cell = { col: 1, row: 4 }; const key = '1,4';
    window.__manorStore.setState({ day: { ...st.day, steps: 400 }, manor: { ...st.manor, playerCell: cell,
      rooms: { ...st.manor.rooms, [key]: { cardId: 'library', cell, doors: ['N','S','E','W'], solved: false, kind: 'word-web' } } } });
    window.__manorStore.getState().enterRoom(key);
  });
  await page.waitForSelector('.anch--library', { timeout: 10000 });
  await sleep(600);

  const tiles = await page.$$eval('.ww-tile', (els) => els.map((e) => e.textContent.trim()));
  const board = webs.find((b) => b.layout.length === tiles.length && b.layout.every((w) => tiles.includes(w)));
  R.boardId = board.id; R.tier = board.tier; R.herrings = board.herrings;
  R.groups = board.groups.map((g) => ({ theme: g.theme, tier: g.tier, words: g.words }));

  const tap = (w) => page.evaluate((word) => { const t=[...document.querySelectorAll('.ww-tile')].find((e)=>e.textContent.trim()===word); t?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1})); t?.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1})); }, w);
  const clearSel = async () => { const sel = await page.$$eval('.ww-tile--selected',(e)=>e.map(x=>x.textContent.trim())); for (const w of sel) await tap(w); await sleep(200); };

  async function guess(words, label) {
    await clearSel();
    for (const w of words) { await tap(w); await sleep(60); }
    await sleep(200);
    const fired = await page.evaluate(() => { const b = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Weave'); if (!b || b.disabled) return false; b.click(); return true; });
    // poll for a non-empty toast
    let seen = null;
    for (let t = 0; t < 60; t++) {
      const s = await page.evaluate(() => {
        const el = document.querySelector('.anch-toast');
        if (!el) return null;
        const bit = el.querySelector('.anch-toast__bit');
        const r = el.getBoundingClientRect();
        const f = (e) => { const c = getComputedStyle(e); return { fs: c.fontSize, color: c.color, ff: c.fontFamily.split(',')[0].replace(/"/g,''), display: c.display, opacity: c.opacity }; };
        return { text: el.textContent.trim(), bit: bit ? bit.textContent.trim() : null,
          box: { y: +r.y.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1) },
          inView: r.top >= 0 && r.bottom <= window.innerHeight,
          mainStyle: f(el), bitStyle: bit ? f(bit) : null };
      });
      if (s && s.text) { seen = s; break; }
      await sleep(100);
    }
    R[label] = { fired, words, toast: seen, steps: await page.evaluate(() => window.__manorStore.getState().day.steps) };
    await page.screenshot({ path: join(OUT, 'lib-' + label + '.png') });
    await sleep(1400);
  }

  const g = board.groups;
  await guess([g[0].words[0], g[1].words[0], g[2].words[0], g[3].words[0]], 'scattered');
  await guess([g[0].words[0], g[0].words[1], g[0].words[2], g[1].words[0]], 'oneaway');
  const h = (board.herrings || [])[0];
  if (h) {
    const inH = h.words.slice(0, 3);
    const out = board.layout.find((w) => !h.words.includes(w));
    await guess([...inH, out], 'herring');
  }
  // a wrong guess where two share a thread
  await guess([g[2].words[0], g[2].words[1], g[3].words[0], g[3].words[1]], 'twotwo');

  // the priced nudge
  R.nudge = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.anch-btn')].find((x) => /nudge/i.test(x.textContent));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const c = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { text: b.textContent.trim(), h: +r.height.toFixed(1), inView: r.top >= 0 && r.bottom <= window.innerHeight, hit: c === b || b.contains(c) ? 'self' : (c?.className ?? 'null') };
  });

  writeFileSync(join(OUT, 'library.json'), JSON.stringify(R, null, 1));
  console.log(JSON.stringify(R, null, 1));
} finally {
  await browser.close();
}
