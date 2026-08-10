/**
 * scripts/r20-room-parchment.mjs — THE ROOMS' GLASS: dead parchment + hit tests.
 *
 * ONE Edge instance (channel msedge), closed in a finally. Both viewports.
 * For each of the seven puzzle rooms:
 *   - the stage rect, and the largest featureless vertical band inside it
 *     (union of every INK interval: own-text elements + interactive controls)
 *   - every interactive control: centre + four inset corners via
 *     elementFromPoint. A control whose centre answers as something else is a
 *     dead control; a control whose centre answers as a DIFFERENT control is
 *     worse — it mutates the puzzle.
 *   - per-room extras: crossword clue panel scroll, cipher inter-cell gaps.
 *
 * node scripts/r20-room-parchment.mjs --tag before|after
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const TAG = args.includes('--tag') ? args[args.indexOf('--tag') + 1] : 'before';
const OUT = resolve(ROOT, 'docs/shots/round20/glass');
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[glass]', ...a);

async function freePort(from = 5741, to = 5799) {
  for (let p = from; p <= to; p++) {
    let taken = false;
    for (const host of ['127.0.0.1', '::1', undefined]) {
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
  server.stdout.on('data', (b) => { if (/ready in|Local:/.test(String(b))) { clearTimeout(t); res(); } });
  server.on('exit', (c) => { clearTimeout(t); rej(new Error('vite exited ' + c)); });
});

/* Row >= 5 => tier 3 (app/slices/room.ts). `pin` is the WORST case in the pool
   for the two rooms this round owns: the 5-clue 5x5 closet whose longest clue
   is 42 characters, and the 41-glyph / 8-letter-longest-word cryptogram. A
   room measured on a soft board is not measured. */
const ROOMS = [
  { card: 'library', kind: 'word-web', root: '.anch--library', cell: { col: 1, row: 5 }, pin: 'web-c12' },
  { card: 'conservatory', kind: 'hive', root: '.anch--conservatory', cell: { col: 4, row: 5 }, pin: 'hive-t3-1' },
  { card: 'gallery', kind: 'twistle', root: '.anch--gallery', cell: { col: 3, row: 5 }, pin: 'twistle-t3-1' },
  { card: 'study', kind: 'forgotten-word', root: '.anch--study', cell: { col: 2, row: 5 }, pin: 'fw-pilcrow' },
  { card: 'darkroom', kind: 'cipher', root: '.mic--darkroom', cell: { col: 3, row: 5 }, pin: 'cipher-t3-40' },
  { card: 'linen-closet', kind: 'crossword', root: '.m2--linen', cell: { col: 4, row: 5 }, pin: 'crossword-t3-19' },
  { card: 'counting-house', kind: 'sudoku', root: '.ch', cell: { col: 2, row: 5 }, pin: 'sudoku-t3-01' },
  /* And the LIGHTEST board each of the two rooms can serve, because a room
     re-apportioned for its worst case must not look abandoned on its best:
     a 16-glyph cryptogram (below the `dense` threshold) and a tier-1 4x4
     closet with three clues. */
  { card: 'darkroom', kind: 'cipher', root: '.mic--darkroom', cell: { col: 3, row: 1 }, pin: 'cipher-t2-22', as: 'darkroom-light' },
  { card: 'linen-closet', kind: 'crossword', root: '.m2--linen', cell: { col: 4, row: 1 }, pin: 'crossword-t1-1', as: 'linen-light' },
];

const MEASURE = /* js */ `((rootSel) => {
  const root = document.querySelector(rootSel);
  const stage = document.querySelector('.room-host__stage');
  if (!root || !stage) return { error: 'no root/stage for ' + rootSel };
  const sr = stage.getBoundingClientRect();
  const R = (r) => ({ x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) });
  const path = (el) => {
    if (!el) return 'null';
    let s = el.tagName ? el.tagName.toLowerCase() : String(el);
    if (el.classList && el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
    return s;
  };
  const visible = (el, cs, r) => r.width >= 1 && r.height >= 1 && cs.visibility !== 'hidden'
    && cs.display !== 'none' && Number(cs.opacity) > 0.02;

  /* ── INK INTERVALS ─────────────────────────────────────────────────────
     Anything a player can SEE as content: an element with its own text run,
     or an interactive control, or an element carrying a visible border /
     non-paper background. Pure spacing wrappers contribute nothing. */
  const ink = [];
  /* Overflow clips at the PADDING box, not the border box — a 1px rule and
     7.2px of panel padding is 8.2px of a control that a border-box read calls
     visible and the browser does not paint. */
  const clipOf = (el) => {
    let n = el.parentElement, box = null;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowY) || /(auto|scroll|hidden|clip)/.test(cs.overflowX)) {
        const b = n.getBoundingClientRect();
        const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
        const top = b.top + bt, bottom = b.bottom - bb;
        box = box ? { top: Math.max(box.top, top), bottom: Math.min(box.bottom, bottom) } : { top, bottom };
      }
      n = n.parentElement;
    }
    return box;
  };
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!visible(el, cs, r)) continue;
    if (r.bottom < sr.top || r.top > sr.bottom) continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    const interactive = el.matches('button, a[href], [role="button"], input, select, textarea');
    const svg = el.tagName.toLowerCase() === 'svg';
    if (!ownText && !interactive && !svg) continue;
    const c = clipOf(el);
    let top = r.top, bottom = r.bottom;
    if (c) { top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom); }
    if (bottom - top < 1) continue;
    ink.push([Math.max(top, sr.top), Math.min(bottom, sr.bottom)]);
  }
  ink.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const iv of ink) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1] + 0.5) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  const gaps = [];
  let cursor = sr.top;
  for (const [a, b] of merged) {
    if (a - cursor > 1) gaps.push({ from: +cursor.toFixed(1), to: +a.toFixed(1), h: +(a - cursor).toFixed(1) });
    cursor = Math.max(cursor, b);
  }
  if (sr.bottom - cursor > 1) gaps.push({ from: +cursor.toFixed(1), to: +sr.bottom.toFixed(1), h: +(sr.bottom - cursor).toFixed(1) });
  gaps.sort((a, b) => b.h - a.h);

  /* ── HIT TESTS ─────────────────────────────────────────────────────────── */
  const owns = (el, hit) => !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  const controls = [];
  for (const el of root.querySelectorAll('button, a[href], [role="button"], input, select, textarea')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!visible(el, cs, r)) continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    const c = clipOf(el);
    const clippedOut = c && (r.bottom <= c.top + 0.5 || r.top >= c.bottom - 0.5);
    /* How much of the control the browser actually paints. A row scrolled
       wholly out of a panel is not a defect (that is what a scroller is for);
       a row painted in PART with its centre over the keyboard is the defect —
       she can see it, so she can aim at it, and the aim lands elsewhere. */
    const shownH = c ? Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)) : r.height;
    const shown = r.height > 0 ? +(shownH / r.height).toFixed(3) : 0;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const centre = document.elementFromPoint(cx, cy);
    const pts = [[r.x + 4, r.y + 4], [r.right - 4, r.y + 4], [r.x + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]];
    const corners = pts.map(([x, y]) => owns(el, document.elementFromPoint(x, y)));
    controls.push({
      sel: path(el), text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 28),
      box: R(r), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      centreOwn: owns(el, centre), centreHit: owns(el, centre) ? 'self' : path(centre),
      corners, cornersOk: corners.filter(Boolean).length,
      clippedOut: !!clippedOut, shown,
    });
  }
  /* stolen  — fully painted, centre answers as something else. Never allowed.
     partial — painted in part, centre answers as something else. Never allowed.
     offPanel— nothing of it is painted. Scrolled out; not a defect. */
  const stolen = controls.filter((c) => !c.centreOwn && c.shown >= 0.999);
  const partial = controls.filter((c) => !c.centreOwn && c.shown > 0 && c.shown < 0.999);
  const offPanel = controls.filter((c) => c.shown <= 0);

  /* ── PER-ROOM EXTRAS ───────────────────────────────────────────────────── */
  const scrollers = [];
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY)) continue;
    if (el.scrollHeight - el.clientHeight > 1) {
      scrollers.push({ sel: path(el), box: R(el.getBoundingClientRect()), scrollH: el.scrollHeight, clientH: el.clientHeight, over: el.scrollHeight - el.clientHeight });
    }
  }
  // cipher inter-cell dead zones
  let cellGaps = null;
  const cells = [...root.querySelectorAll('.dk-cell')];
  if (cells.length) {
    const rects = cells.map((c) => ({ el: c, r: c.getBoundingClientRect() }));
    const misses = []; let sampled = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (Math.abs(a.r.y - b.r.y) > 2) continue;
        const gap = b.r.left - a.r.right;
        if (gap <= 0 || gap > 14) continue;
        sampled++;
        const mx = (a.r.right + b.r.left) / 2, my = a.r.y + a.r.height / 2;
        const hit = document.elementFromPoint(mx, my);
        if (!hit || !hit.closest('.dk-cell')) misses.push({ x: +mx.toFixed(1), y: +my.toFixed(1), gap: +gap.toFixed(1), hit: path(hit) });
      }
    }
    const w = rects[0].r.width, h = rects[0].r.height;
    cellGaps = { sampled, misses: misses.length, sample: misses.slice(0, 4), cell: { w: +w.toFixed(1), h: +h.toFixed(1) } };
  }
  const named = {};
  for (const s of ['.dk-sheet', '.mic-keys', '.lc-grid', '.lc-clues', '.lc-keys', '.room-deck', '.dk-prints', '.mic-toastslot', '.m2-toastslot']) {
    const el = root.querySelector(s);
    if (el) named[s] = R(el.getBoundingClientRect());
  }
  const counts = { clues: root.querySelectorAll('.lc-clue').length, squares: root.querySelectorAll('.lc-cell:not(.lc-cell--void)').length,
    slots: root.querySelectorAll('.dk-cell').length };
  return {
    counts,
    stage: R(sr), stageScroll: stage.scrollHeight - stage.clientHeight,
    biggestGap: gaps[0] || null, gaps: gaps.slice(0, 4),
    controls: controls.length, stolen, partial, offPanel: offPanel.length, scrollers, cellGaps, named,
  };
})`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const RESULT = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('PAGEERROR', e.message));
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
  await sleep(600);

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
          if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown');
        }
        await sleep(180); continue;
      }
      const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(400); continue; }
      const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(400); continue; }
      const any = await page.$('button'); if (any && st.phase === null) { await any.click(); await sleep(350); continue; }
      await sleep(250);
    }
    return false;
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(350); };
  const clearMoments = async () => {
    for (let i = 0; i < 8; i++) {
      const gone = await page.evaluate(() => {
        const m = document.querySelector('.mom');
        if (!m) return true;
        m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.click?.(); return false;
      });
      if (gone) return; await sleep(350);
    }
  };
  async function openRoom(room) {
    if (!(await ensureExploring())) throw new Error('never reached exploring');
    await page.evaluate(({ cardId, cell, kind, pin }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell,
        rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind, puzzleId: pin || '' } } } });
      const s2 = window.__manorStore.getState();
      window.__manorStore.setState({ day: { ...s2.day, steps: 400 } });
      s2.enterRoom(key);
    }, { cardId: room.card, cell: room.cell, kind: room.kind, pin: room.pin || '' });
    await page.waitForSelector(room.root, { timeout: 10000 });
    await sleep(500);
    await clearMoments();
  }

  for (const vp of [{ w: 390, h: 844 }, { w: 375, h: 667 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await sleep(400);
    const key = `${vp.w}x${vp.h}`;
    RESULT[key] = {};
    for (const room of ROOMS) {
      try {
        await openRoom(room);
        const m = await page.evaluate(`(${MEASURE})(${JSON.stringify(room.root)})`);
        RESULT[key][room.as || room.card] = m;
        log(key, room.as || room.card, 'gap', m.biggestGap ? m.biggestGap.h : '-', 'stolen', m.stolen ? m.stolen.length : '-',
          'partial', m.partial ? m.partial.length : '-', 'offPanel', m.offPanel,
          'scrollers', m.scrollers ? m.scrollers.length : '-', 'stageScroll', m.stageScroll, 'counts', JSON.stringify(m.counts));
        if (m.stolen) for (const s of m.stolen) log('   STOLEN ', s.sel, JSON.stringify(s.box), '->', s.centreHit, '|', s.text);
        if (m.partial) for (const s of m.partial) log('   PARTIAL', s.sel, 'shown', s.shown, JSON.stringify(s.box), '->', s.centreHit, '|', s.text);
        if (m.cellGaps) log('   cellGaps', JSON.stringify(m.cellGaps));
        await page.screenshot({ path: join(OUT, `${TAG}-${room.as || room.card}-${key}.png`) });
      } catch (e) {
        RESULT[key][room.as || room.card] = { error: String(e.message || e) };
        log(key, room.as || room.card, 'ERROR', e.message);
      }
      await leave();
    }
  }
  writeFileSync(join(OUT, `${TAG}.json`), JSON.stringify(RESULT, null, 1));
  log('wrote', join(OUT, `${TAG}.json`));
} finally {
  await browser.close();
  server.kill();
}
