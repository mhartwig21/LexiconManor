/** ROUND 10 — does the hung Gallery sheet fit an SE-class glass? ONE msedge instance. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] ?? 'http://localhost:5741/LexiconManor/';
const twistles = JSON.parse(readFileSync(resolve(root, 'content/generated/twistle.json'), 'utf8'));
const gridSize = (g) => Math.round(Math.sqrt(g.length));
const centerIndex = (n) => { const m = Math.floor((n - 1) / 2); return m * n + m; };
function findPath(grid, word, rules) {
  const target = word.toUpperCase();
  if (target.length < rules.minLength) return null;
  const n = gridSize(grid), centre = centerIndex(n);
  const neigh = (i) => { const r = Math.floor(i / n), c = i % n, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue; const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
    } return out; };
  const walk = (path, depth) => {
    if (depth === target.length) return (rules.centerRequired && !path.includes(centre)) ? null : path;
    for (const k of neigh(path[path.length - 1])) {
      if (path.includes(k) || grid[k] !== target[depth]) continue;
      const f = walk([...path, k], depth + 1); if (f) return f;
    } return null; };
  for (let i = 0; i < grid.length; i++) { if (grid[i] !== target[0]) continue; const f = walk([i], 1); if (f) return f; }
  return null;
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    const sleep = (ms) => page.waitForTimeout(ms);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
    await sleep(600);
    for (let i = 0; i < 80; i++) {
      const st = await page.evaluate(() => { const s = window.__manorStore?.getState();
        return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor }; });
      if (st.phase === 'exploring' && st.hasManor) break;
      if (await page.$('.dlg').catch(() => null)) {
        const p = await page.$('.dlg-choice--primary');
        if (p) await p.click().catch(() => {});
        else { const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
          if (c) await c.click().catch(() => {}); else await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {}); }
        await sleep(200); continue;
      }
      const skip = await page.$(".chr-dusk__skip").catch(() => null); if (skip) { await skip.click().catch(() => {}); await sleep(400); continue; }
      const btn = await page.$(".chr-scene__btn").catch(() => null); if (btn) { await btn.click().catch(() => {}); await sleep(400); continue; }
      const any = await page.$("button").catch(() => null); if (any && st.phase === null) { await any.click().catch(() => {}); await sleep(400); continue; }
      await sleep(250);
    }
    await page.evaluate(() => {
      const st = window.__manorStore.getState();
      const cell = { col: 3, row: 2 }; const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell,
        rooms: { ...st.manor.rooms, [key]: { cardId: 'gallery', cell, doors: ['N','S','E','W'], solved: false, kind: 'twistle' } } } });
      window.__manorStore.getState().enterRoom(key);
    });
    await page.waitForSelector('.tw-cell', { timeout: 10000 });
    await sleep(500);
    const letters = await page.$$eval('.tw-cell', (els) => els.map((e) => e.childNodes[0].textContent.trim()));
    const tw = twistles.find((p) => p.grid.length === letters.length && p.grid.every((l, i) => l === letters[i]));
    for (const w of tw.targetWords.slice(0, tw.targetCount)) {
      const p = findPath(tw.grid, w, tw.rules);
      if (!p) continue;
      for (const idx of p) {
        await page.evaluate((i) => {
          const el = document.querySelector(`[data-idx="${i}"]`); const g = el.closest('.tw-grid');
          const r = el.getBoundingClientRect();
          const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1 };
          g.dispatchEvent(new PointerEvent('pointerdown', o)); g.dispatchEvent(new PointerEvent('pointerup', o));
        }, idx);
        await sleep(40);
      }
      await page.evaluate(() => { const b = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Claim'); b?.click(); });
      await sleep(260);
    }
    await sleep(1500);
    const m = await page.evaluate(() => {
      const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
        return { y: +r.y.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1), bottom: +r.bottom.toFixed(1) }; };
      const st = document.querySelector('.room-host__stage');
      return { stage: { clientH: st.clientHeight, scrollH: st.scrollHeight, over: st.scrollHeight - st.clientHeight,
                        bottom: +st.getBoundingClientRect().bottom.toFixed(1) },
        done: b('.anch-done'), grid: b('.tw-grid--hung'), lists: b('.tw-lists'), head: b('.anch__head'),
        threads: document.querySelectorAll('.tw-thread').length,
        threadOpacity: document.querySelector('.tw-thread') ? getComputedStyle(document.querySelector('.tw-thread')).opacity : null,
        frameTransform: document.querySelector('.tw-frame__seg') ? getComputedStyle(document.querySelector('.tw-frame__seg')).transform : null };
    });
    await page.screenshot({ path: join(root, 'docs/shots/round10-rooms', `gallery-won-${vp.width}x${vp.height}${process.env.RM ? '-rm' : ''}.png`) });
    console.log(JSON.stringify({ vp, board: tw.id, ...m }));
    await ctx.close();
  }
} finally { await browser.close(); }
