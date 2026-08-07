/**
 * ROUND 13 — harsh critic pass: Library naming act, board legibility, Study.
 * Harness: system Edge (channel 'msedge'), ONE instance, closed in a finally.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round13-critic');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] ?? 'http://localhost:5741/LexiconManor/';
const load = (f) => JSON.parse(readFileSync(resolve(root, 'content/generated', f), 'utf8'));
const webs = load('word-web.json');
const R = {};
const KIND = { gallery: 'twistle', conservatory: 'hive', 'counting-house': 'sudoku', darkroom: 'cipher', library: 'word-web', study: 'forgotten-word', 'linen-closet': 'crossword' };
const ROOT = { twistle: '.anch--gallery', hive: '.anch--conservatory', sudoku: '.ch', cipher: '.mic--darkroom', 'word-web': '.anch--library', 'forgotten-word': '.anch--study', crossword: '.m2--linen' };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: join(OUT, n + '.png') });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
  await sleep(600);

  async function ensureExploring() {
    for (let i = 0; i < 80; i++) {
      const st = await page.evaluate(() => { const s = window.__manorStore?.getState(); return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor }; });
      if (st.phase === 'exploring' && st.hasManor) return true;
      if (await page.$('.dlg')) { const p = await page.$('.dlg-choice--primary');
        if (p) await p.click(); else { const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown'); }
        await sleep(200); continue; }
      const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(500); continue; }
      const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(500); continue; }
      const any = await page.$('button'); if (any && st.phase === null) { await any.click(); await sleep(400); continue; }
      await sleep(300);
    }
    return false;
  }
  async function openRoom(cardId, cell) {
    if (!(await ensureExploring())) throw new Error('never reached exploring');
    const kind = KIND[cardId];
    await page.evaluate(({ cardId, cell, kind }) => {
      const st = window.__manorStore.getState(); const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell, steps: 99,
        rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind } } } });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, cell, kind });
    await page.waitForSelector(ROOT[kind], { timeout: 10000 });
    await sleep(500);
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(500); };

  // ── LIBRARY: solve fully, capture every naming act ─────────────────────
  await openRoom('library', { col: 1, row: 2 });
  const tiles = await page.$$eval('.ww-tile', (els) => els.map((e) => e.textContent.trim()));
  const web = webs.find((b) => b.layout.length === tiles.length && b.layout.every((w, i) => w === tiles[i]));
  R.library = { boardId: web?.id ?? null, tier: web?.tier ?? null, themes: web?.groups.map(g => g.tier + ':' + g.theme) };

  const down = (sel, txt) => page.evaluate(({ sel, txt }) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === txt);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.click();
    return true;
  }, { sel, txt });
  const submit = async (words) => {
    await page.evaluate(() => { const c = [...document.querySelectorAll('.anch-btn')].find((b) => /clear/i.test(b.textContent)); if (c && !c.disabled) c.click(); });
    for (const w of words) { await down('.ww-tile', w); await sleep(60); }
    await page.evaluate(() => { const b = document.querySelector('.anch-btn--primary'); if (b && !b.disabled) b.click(); });
    await sleep(2200);
  };
  const namingSnapshot = async () => page.evaluate(() => {
    const root = document.querySelector('.ww-name');
    if (!root) return null;
    const opts = [...root.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect();
      return { text: b.textContent.trim().replace(/\s+/g, ' '), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        clipped: b.scrollWidth > b.clientWidth + 1, lines: Math.round(r.height / parseFloat(getComputedStyle(b).lineHeight || '16')) }; });
    return { cls: root.className, prompt: root.textContent.trim().replace(/\s+/g, ' ').slice(0, 160), opts };
  });

  R.library.namings = [];
  if (web) {
    for (const g of web.groups) {
      await submit(g.words);
      const snap = await namingSnapshot();
      if (snap) {
        R.library.namings.push({ theme: g.theme, words: g.words, ...snap });
        await shot('library-naming-' + g.tier);
        // pick the right one
        await page.evaluate((t) => { const norm = (s) => s.replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
          const b = [...document.querySelectorAll('.ww-name button')].find((x) => norm(x.textContent) === norm(t)); (b ?? document.querySelector('.ww-name button'))?.click(); }, g.theme);
        await sleep(1400);
      } else {
        R.library.namings.push({ theme: g.theme, none: true });
      }
    }
    await sleep(1500);
    R.library.endscreen = await page.evaluate(() => document.querySelector('.anch--library')?.innerText.slice(0, 700) ?? null);
    await shot('library-end');
    // banner legibility
    R.library.banners = await page.evaluate(() => [...document.querySelectorAll('.ww-band, .ww-banner, .ww-solved')].map((e) => {
      const r = e.getBoundingClientRect(); return { text: e.innerText.replace(/\s+/g, ' ').slice(0, 90), h: +r.height.toFixed(1), clipped: e.scrollWidth > e.clientWidth + 1 }; }));
  }
  await leave();

  // ── 375x667 Library legibility ─────────────────────────────────────────
  await page.setViewportSize({ width: 375, height: 667 });
  await openRoom('library', { col: 1, row: 3 });
  R.library375 = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.ww-tile')].map((e) => { const r = e.getBoundingClientRect();
      return { t: e.textContent.trim(), w: +r.width.toFixed(1), h: +r.height.toFixed(1), fs: getComputedStyle(e).fontSize,
        overflow: e.scrollWidth > e.clientWidth + 1 }; });
    const board = document.querySelector('.ww-grid, .ww-board'); const br = board?.getBoundingClientRect();
    return { tiles, boardBottom: br ? +br.bottom.toFixed(1) : null, vh: innerHeight,
      inView: br ? br.bottom <= innerHeight : null };
  });
  await shot('library-375');
  await leave();
  await page.setViewportSize({ width: 390, height: 844 });

  // ── STUDY: read the whole surface ──────────────────────────────────────
  await openRoom('study', { col: 1, row: 1 });
  R.study = await page.evaluate(() => ({
    text: document.querySelector('.anch--study')?.innerText.slice(0, 1200) ?? null,
    buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean),
  }));
  await shot('study');
  await leave();

  writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
} finally {
  await browser.close();
}
