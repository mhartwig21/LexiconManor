/**
 * ROUND 11 — harsh critic pass over the seven word rooms.
 * Harness: system Edge (channel 'msedge'), ONE instance, closed in a finally,
 * 390x844 @2x, sequential routes.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round11-critic');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] ?? 'http://localhost:5741/LexiconManor/';
const load = (f) => JSON.parse(readFileSync(resolve(root, 'content/generated', f), 'utf8'));
const twistles = load('twistle.json');
const hives = load('hive.json');
const webs = load('word-web.json');
const R = {};
const log = (...a) => console.log('[r11]', ...a);

const KIND = { gallery: 'twistle', conservatory: 'hive', 'counting-house': 'sudoku', darkroom: 'cipher', library: 'word-web', study: 'forgotten-word', 'linen-closet': 'crossword' };
const ROOT = { twistle: '.anch--gallery', hive: '.anch--conservatory', sudoku: '.ch', cipher: '.mic--darkroom', 'word-web': '.anch--library', 'forgotten-word': '.anch--study', crossword: '.m2--linen' };

const gridSize = (g) => Math.round(Math.sqrt(g.length));
const centerIndex = (n) => { const m = Math.floor((n - 1) / 2); return m * n + m; };
function findPath(grid, word, rules) {
  const target = word.toUpperCase();
  if (target.length < rules.minLength) return null;
  const n = gridSize(grid), centre = centerIndex(n);
  const neigh = (i) => { const r = Math.floor(i / n), c = i % n, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc); } return out; };
  const walk = (path, depth) => { if (depth === target.length) return (rules.centerRequired && !path.includes(centre)) ? null : path;
    for (const k of neigh(path[path.length - 1])) { if (path.includes(k) || grid[k] !== target[depth]) continue;
      const f = walk([...path, k], depth + 1); if (f) return f; } return null; };
  for (let i = 0; i < grid.length; i++) { if (grid[i] !== target[0]) continue; const f = walk([i], 1); if (f) return f; }
  return null;
}

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
  const box = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) }; }).catch(() => null);
  const hitTest = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect();
    const at = (x, y) => { const n = document.elementFromPoint(x, y); return n === e || e.contains(n) ? 'self' : (n?.className?.baseVal ?? n?.className ?? n?.tagName ?? 'null'); };
    return { centre: at(r.x + r.width / 2, r.y + r.height / 2), tl: at(r.x + 3, r.y + 3), br: at(r.right - 3, r.bottom - 3), inView: r.top >= 0 && r.bottom <= innerHeight }; }).catch(() => null);

  // ── GALLERY: the solved screen, and what covers it ─────────────────────
  await openRoom('gallery', { col: 3, row: 2 });
  const gridLetters = await page.$$eval('.tw-cell', (els) => els.map((e) => e.childNodes[0].textContent.trim()));
  const tw = twistles.find((p) => p.grid.length === gridLetters.length && p.grid.every((l, i) => l === gridLetters[i]));
  R.gallery = { boardId: tw?.id ?? null };
  if (tw) {
    const tapPath = async (path) => {
      for (const idx of path) { await page.evaluate((i) => { const el = document.querySelector(`[data-idx="${i}"]`); const g = el.closest('.tw-grid');
        const r = el.getBoundingClientRect(); const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1 };
        g.dispatchEvent(new PointerEvent('pointerdown', o)); g.dispatchEvent(new PointerEvent('pointerup', o)); }, idx); await sleep(40); }
      await page.evaluate(() => { const b = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Claim'); b?.click(); }); await sleep(240);
    };
    for (const w of tw.targetWords.slice(0, tw.targetCount)) { const p = findPath(tw.grid, w, tw.rules); if (p) await tapPath(p); }
    await sleep(1000);
    R.gallery.won = await page.$eval('.anch--gallery', (e) => e.className.includes('anch--verdict')).catch(() => null);
    R.gallery.doneBox = await box('.anch-done');
    // What is on top of the solved headline?
    R.gallery.headline = await page.evaluate(() => {
      const h = document.querySelector('.anch-done__head, .anch-done h2, .anch-done__title');
      if (!h) return { found: false, all: [...document.querySelectorAll('.anch-done *')].slice(0, 6).map(e => e.className) };
      const r = h.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { found: true, text: h.textContent.trim().slice(0, 80), cls: h.className,
        box: { y: +r.y.toFixed(1), h: +r.height.toFixed(1) },
        coveredBy: (top === h || h.contains(top)) ? null : (top?.className ?? top?.tagName) };
    });
    R.gallery.momentUp = await page.evaluate(() => { const m = document.querySelector('.mom');
      if (!m) return null; const r = m.getBoundingClientRect(); return { cls: m.className, y: +r.y.toFixed(1), bottom: +r.bottom.toFixed(1) }; });
    await shot('gallery-won-with-moment');
    // dismiss moment, re-shoot
    for (let i = 0; i < 6; i++) { const gone = await page.evaluate(() => { const m = document.querySelector('.mom'); if (!m) return true;
      m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.click?.(); return false; }); if (gone) break; await sleep(400); }
    await shot('gallery-won-clean');
    R.gallery.exitHit = await hitTest('.room-host__leave, .anch-done__leave, .room-leave');
    R.gallery.leaveText = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).slice(-6));
  }
  await leave();

  // ── CONSERVATORY: the found strip ──────────────────────────────────────
  await openRoom('conservatory', { col: 4, row: 2 });
  const hl = await page.evaluate(() => ({ center: document.querySelector('.hv-cell--center .hv-cell__g').textContent.trim(),
    outer: [...document.querySelectorAll('.hv-cell:not(.hv-cell--center) .hv-cell__g')].map((e) => e.textContent.trim()) }));
  const hive = hives.find((p) => p.center === hl.center && p.outer.length === hl.outer.length && p.outer.every((l) => hl.outer.includes(l)));
  R.conservatory = { boardId: hive?.id ?? null };
  if (hive) {
    const words = [...hive.validWords].sort((a, b) => b.length - a.length).slice(0, 10);
    for (const w of words) { await page.keyboard.type(w); await page.keyboard.press('Enter'); await sleep(140); }
    await sleep(400);
    R.conservatory.strip = await page.evaluate(() => {
      const strip = document.querySelector('.hv-found__strip'); if (!strip) return null;
      const sr = strip.getBoundingClientRect(); const cs = getComputedStyle(strip);
      return { stripBox: { l: +sr.left.toFixed(1), r: +sr.right.toFixed(1) }, overflow: cs.overflowX,
        mask: cs.maskImage || cs.webkitMaskImage || 'none',
        chips: [...strip.children].map((c) => { const r = c.getBoundingClientRect();
          const vis = Math.min(r.right, sr.right) - Math.max(r.left, sr.left);
          return { word: c.textContent.trim(), l: +r.left.toFixed(1), r: +r.right.toFixed(1), full: +r.width.toFixed(1), visible: +vis.toFixed(1),
            frac: +(vis / r.width).toFixed(2) }; }) };
    });
    // The expander
    R.conservatory.expander = await page.evaluate(() => { const b = document.querySelector('.hv-found__more, .hv-found button, .hv-found__toggle');
      if (!b) return null; const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { text: b.textContent.trim(), w: +r.width.toFixed(1), h: +r.height.toFixed(1), hit: (top === b || b.contains(top)) ? 'self' : (top?.className ?? 'null') }; });
    if (R.conservatory.expander) { await page.click('.hv-found__more, .hv-found button, .hv-found__toggle').catch(() => {});
      await sleep(400); await shot('conservatory-found-open');
      R.conservatory.afterOpen = await page.evaluate(() => { const p = document.querySelector('.hv-found__panel, .hv-found__all, .hv-sheet');
        if (!p) return null; const r = p.getBoundingClientRect(); return { cls: p.className, y: +r.y.toFixed(1), bottom: +r.bottom.toFixed(1), inView: r.bottom <= innerHeight }; }); }
    await shot('conservatory-strip');
  }
  await leave();

  // ── COUNTING HOUSE: cell size, undo/erase ──────────────────────────────
  await openRoom('counting-house', { col: 2, row: 2 });
  R.countingHouse = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.ch-cell')];
    const r0 = cells[0]?.getBoundingClientRect();
    const keys = [...document.querySelectorAll('.ch-key, .ch-pad button')].map((k) => { const r = k.getBoundingClientRect();
      return { label: k.textContent.trim(), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; });
    const tools = [...document.querySelectorAll('.ch-tools button')].map((b) => ({ label: b.textContent.trim().replace(/\s+/g, ' '), disabled: b.disabled }));
    return { cellCount: cells.length, cell: r0 ? { w: +r0.width.toFixed(1), h: +r0.height.toFixed(1) } : null,
      keySizes: keys, tools, leaf: (() => { const l = document.querySelector('.ch-leaf, .ch-grid'); if (!l) return null;
        const r = l.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1), inView: r.bottom <= innerHeight }; })() };
  });
  await shot('counting-house');
  await leave();

  // ── LIBRARY: wrong-guess information bits (2.10) ───────────────────────
  await openRoom('library', { col: 1, row: 2 });
  const tiles = await page.$$eval('.ww-tile', (els) => els.map((e) => e.textContent.trim()));
  const web = webs.find((b) => b.layout.length === tiles.length && b.layout.every((w, i) => w === tiles[i]));
  R.library = { boardId: web?.id ?? null, tier: web?.tier ?? null, herrings: web?.herrings?.length ?? null };
  const pick = async (words) => { await page.evaluate(() => { document.querySelectorAll('.ww-tile--sel').forEach((t) => t.click()); });
    for (const w of words) { await page.evaluate((x) => { const t = [...document.querySelectorAll('.ww-tile')].find((e) => e.textContent.trim() === x); t?.click(); }, w); await sleep(80); }
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /guess|submit|shelve/i.test(x.textContent)); b?.click(); }); await sleep(1800);
    return page.evaluate(() => ({ main: document.querySelector('.ww-verdict, .anch-toast, .ww-toast')?.textContent.trim() ?? null,
      bit: document.querySelector('.ww-bit, .ww-hint, .ww-verdict__bit')?.textContent.trim() ?? null,
      allNotices: [...document.querySelectorAll('.ww-verdict, .ww-bit, .anch-toast, .ww-toast, .ww-hint')].map((e) => e.className + ' :: ' + e.textContent.trim()) })); };
  if (web) {
    // one-away: 3 from the yellow group + 1 outsider
    const y = web.groups.find((g) => g.tier === 'yellow'); const other = web.groups.find((g) => g.tier !== 'yellow');
    R.library.oneAway = await pick([...y.words.slice(0, 3), other.words[0]]);
    // herring chase
    const h = web.herrings?.[0];
    if (h) R.library.herringChase = { relation: h.relation, picked: h.words.slice(0, 4), ...(await pick(h.words.slice(0, 4))) };
    // scattered
    R.library.scattered = await pick(web.groups.map((g) => g.words[0]));
    R.library.hintControl = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean));
    await shot('library-bits');
  }
  await leave();

  // ── STUDY: tiers, hint ladder, leaks on glass ──────────────────────────
  await openRoom('study', { col: 1, row: 1 });
  R.study = await page.evaluate(() => {
    const t = (s) => document.querySelector(s)?.textContent.trim() ?? null;
    return { all: document.querySelector('.anch--study')?.innerText.slice(0, 900) ?? null,
      buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean) };
  });
  await shot('study');
  await leave();

  // ── LINEN CLOSET + DARKROOM quick pass ─────────────────────────────────
  await openRoom('linen-closet', { col: 2, row: 1 });
  R.linen = await page.evaluate(() => { const c = document.querySelector('.lc-cell:not(.lc-cell--void)'); const r = c?.getBoundingClientRect();
    return { cell: r ? { w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : null,
      cells: document.querySelectorAll('.lc-cell:not(.lc-cell--void)').length,
      text: document.querySelector('.m2--linen')?.innerText.slice(0, 400) ?? null }; });
  await shot('linen-closet');
  await leave();
  await openRoom('darkroom', { col: 3, row: 1 });
  R.darkroom = await page.evaluate(() => ({ text: document.querySelector('.mic--darkroom')?.innerText.slice(0, 500) ?? null,
    keys: [...document.querySelectorAll('.cy-key, .mic-key')].slice(0, 3).map((k) => { const r = k.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; }) }));
  await shot('darkroom');

  try{}catch(e){}
  writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(R, null, 2));
  log(JSON.stringify(R, null, 2));
} finally {
  await browser.close();
}
