/** ROUND 13 — does the moment seal cover the Library's earned banners? ONE Edge instance. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round13-critic');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] ?? 'http://localhost:5741/LexiconManor/';
const R = {};
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
  await sleep(600);
  for (let i = 0; i < 80; i++) {
    const st = await page.evaluate(() => { const s = window.__manorStore?.getState(); return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor }; });
    if (st.phase === 'exploring' && st.hasManor) break;
    if (await page.$('.dlg')) { const p = await page.$('.dlg-choice--primary');
      if (p) await p.click(); else { const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown'); }
      await sleep(200); continue; }
    const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(500); continue; }
    const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(500); continue; }
    const any = await page.$('button'); if (any && st.phase === null) { await any.click(); await sleep(400); continue; }
    await sleep(300);
  }
  await page.evaluate(() => {
    const st = window.__manorStore.getState();
    window.__manorStore.setState({ manor: { ...st.manor, playerCell: { col: 1, row: 2 }, steps: 99,
      rooms: { ...st.manor.rooms, '1,2': { cardId: 'library', cell: { col: 1, row: 2 }, doors: ['N','S','E','W'], solved: false, kind: 'word-web' } } } });
    window.__manorStore.getState().enterRoom('1,2');
  });
  await page.waitForSelector('.anch--library', { timeout: 10000 });
  await sleep(500);
  const webs = await page.evaluate(() => [...document.querySelectorAll('.ww-tile')].map((e) => e.textContent.trim()));
  R.tiles = webs;
  const pool = JSON.parse((await import('node:fs')).readFileSync(resolve(root, 'content/generated/word-web.json'), 'utf8'));
  const board = pool.find((b) => b.layout.length === webs.length && b.layout.every((w, i) => w === webs[i]));
  R.board = board?.id ?? null;
  const down = (txt) => page.evaluate((t) => { const el = [...document.querySelectorAll('.ww-tile')].find((e) => e.textContent.trim() === t);
    if (!el) return false; const r = el.getBoundingClientRect();
    const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); el.click(); return true; }, txt);
  for (const g of board.groups) {
    await page.evaluate(() => { const c = [...document.querySelectorAll('.anch-btn')].find((b) => /clear/i.test(b.textContent)); if (c && !c.disabled) c.click(); });
    for (const w of g.words) { await down(w); await sleep(60); }
    await page.evaluate(() => { const b = document.querySelector('.anch-btn--primary'); if (b && !b.disabled) b.click(); });
    await sleep(2200);
    // capture the seal the moment it is up, over the banners
    const probe = await page.evaluate(() => {
      const seal = document.querySelector('.mom');
      if (!seal) return null;
      const sr = seal.getBoundingClientRect();
      const bands = [...document.querySelectorAll('.ww-banner')].map((b, i) => {
        const r = b.getBoundingClientRect();
        const theme = b.querySelector('.ww-banner__theme');
        const tr = theme.getBoundingClientRect();
        const at = document.elementFromPoint(tr.x + tr.width / 2, tr.y + tr.height / 2);
        return { i, text: theme.textContent.trim(), themeTop: +tr.top.toFixed(1),
          hitAtThemeCentre: (at === theme || theme.contains(at)) ? 'self' : (at?.className ?? at?.tagName ?? 'null'),
          coveredPx: +Math.max(0, Math.min(sr.bottom, r.bottom) - Math.max(sr.top, r.top)).toFixed(1) };
      });
      const tiles = [...document.querySelectorAll('.ww-tile')].map((t) => { const r = t.getBoundingClientRect();
        const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { w: t.textContent.trim(), hit: (at === t || t.contains(at)) ? 'self' : (at?.className ?? 'null') }; });
      return { sealBox: { top: +sr.top.toFixed(1), bottom: +sr.bottom.toFixed(1), h: +sr.height.toFixed(1) },
        bands, tilesIntercepted: tiles.filter((t) => t.hit !== 'self') };
    });
    if (probe) { R.seal = probe; await page.screenshot({ path: join(OUT, 'seal-over-banners.png') }); }
    const naming = await page.$('.ww-name');
    if (naming) await page.evaluate((t) => { const norm = (s) => s.replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
      const b = [...document.querySelectorAll('.ww-name button')].find((x) => norm(x.textContent) === norm(t)); (b ?? document.querySelector('.ww-name button'))?.click(); }, g.theme);
    await sleep(1200);
  }
  writeFileSync(join(OUT, 'seal-metrics.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
} finally {
  await browser.close();
}
