/**
 * Harsh-critic room verification pass. ONE Edge instance, closed in a finally.
 * Verifies: Gallery hung-sheet traces, Conservatory strip slicing, Counting
 * House undo + surgical erase, Library wrong-guess bits.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/critic-rooms');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5741/LexiconManor/';
const load = (f) => JSON.parse(readFileSync(resolve(root, 'content/generated', f), 'utf8'));
const hives = load('hive.json');
const twistles = load('twistle.json');
const webs = load('word-web.json');
const R = {};
const log = (...a) => console.log('[critic]', ...a);

const KIND = { conservatory: 'hive', gallery: 'twistle', library: 'word-web', 'counting-house': 'sudoku' };
const ROOT = { hive: '.anch--conservatory', twistle: '.anch--gallery', 'word-web': '.anch--library', sudoku: '.ch' };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('PAGEERROR', e.message));
  const sleep = (ms) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: join(OUT, n + '.png') });

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
  async function openRoom(cardId, cell) {
    if (!(await ensureExploring())) throw new Error('never reached exploring');
    const kind = KIND[cardId];
    await page.evaluate(({ cardId, cell, kind }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell,
        rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind } } } });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, cell, kind });
    await page.waitForSelector(ROOT[kind], { timeout: 10000 });
    await sleep(450);
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(400); };
  const topUp = async () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    window.__manorStore.setState({ day: { ...s.day, steps: 400 } });
  });
  const clearMoments = async () => {
    for (let i = 0; i < 8; i++) {
      const gone = await page.evaluate(() => {
        const m = document.querySelector('.mom');
        if (!m) return true;
        m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.click?.(); return false;
      });
      if (gone) return; await sleep(400);
    }
  };

  // ══ 1. THE GALLERY — the hung sheet's traces ════════════════════════════
  await openRoom('gallery', { col: 3, row: 1 });
  await topUp();
  const twl = await page.evaluate(() => [...document.querySelectorAll('.tw-cell')].map((e) => e.textContent.trim()));
  const tw = twistles.find((p) => p.grid.length === twl.length && p.grid.every((c, i) => c === twl[i]));
  R.gallery = { boardId: tw?.id ?? null, gridLen: twl.length };
  if (tw) {
    // Real UI: tap-build each word cell by cell, then Claim (§0.4 driven).
    const size = tw.size;
    const nb = (a, b) => { const ax=a%size, ay=(a/size)|0, bx=b%size, by=(b/size)|0;
      return Math.abs(ax-bx)<=1 && Math.abs(ay-by)<=1 && a!==b; };
    const findPath = (grid, word, rules) => {
      const t = word.toUpperCase();
      if (t.length < rules.minLength) return null;
      const centre = ((size*size)-1)/2;
      const walk = (path, d) => {
        if (d === t.length) return (rules.centerRequired && !path.includes(centre)) ? null : path;
        const last = path[path.length-1];
        for (let n=0;n<grid.length;n++) {
          if (!nb(last,n) || path.includes(n) || grid[n] !== t[d]) continue;
          const f = walk([...path,n], d+1); if (f) return f;
        }
        return null;
      };
      for (let i=0;i<grid.length;i++) { if (grid[i]!==t[0]) continue; const f=walk([i],1); if (f) return f; }
      return null;
    };
    R.gallery.claimed = [];
    for (const w of tw.targetWords) {
      if (R.gallery.claimed.length >= tw.targetCount) break;
      const pth = findPath(tw.grid, w, tw.rules);
      if (!pth) continue;
      for (const ci of pth) { await page.click(`.tw-cell >> nth=${ci}`); await sleep(45); }
      const ok = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Claim');
        if (!b || b.disabled) return false; b.click(); return true;
      });
      if (ok) R.gallery.claimed.push(w);
      await sleep(220);
    }
    await sleep(1800);
    await clearMoments();
    R.gallery.won = await page.$$eval('.tw-hung', (e) => e.length > 0).catch(() => false);
    R.gallery.trace = await page.evaluate(() => {
      const g = document.querySelector('.tw-grid--hung');
      const svg = document.querySelector('.tw-threads');
      if (!g) return { grid: false };
      const gr = g.getBoundingClientRect();
      const polys = [...document.querySelectorAll('.tw-thread polyline')];
      const cells = [...g.querySelectorAll('.tw-cell')];
      const cr = cells.map((c) => c.getBoundingClientRect());
      const sr = svg ? svg.getBoundingClientRect() : null;
      // does each polyline vertex land on a cell centre?
      const misses = [];
      for (const p of polys) {
        const pts = p.getAttribute('points').trim().split(/\s+/).map((s) => s.split(',').map(Number));
        const ctm = p.getScreenCTM();
        for (const [x, y] of pts) {
          const sx = ctm.a * x + ctm.c * y + ctm.e;
          const sy = ctm.b * x + ctm.d * y + ctm.f;
          const on = cr.some((r) => Math.abs(r.x + r.width / 2 - sx) < 4 && Math.abs(r.y + r.height / 2 - sy) < 4);
          if (!on) misses.push([Math.round(sx), Math.round(sy)]);
        }
      }
      const cs = svg ? getComputedStyle(svg) : null;
      const first = polys[0] ? getComputedStyle(polys[0]) : null;
      return {
        grid: true, gridBox: { x: +gr.x.toFixed(1), y: +gr.y.toFixed(1), w: +gr.width.toFixed(1), h: +gr.height.toFixed(1), bottom: +gr.bottom.toFixed(1) },
        gridInView: gr.top >= 0 && gr.bottom <= window.innerHeight,
        svgBox: sr ? { w: +sr.width.toFixed(1), h: +sr.height.toFixed(1), dx: +(sr.x - gr.x).toFixed(1), dy: +(sr.y - gr.y).toFixed(1) } : null,
        polylines: polys.length,
        vertexMisses: misses.length, sampleMiss: misses.slice(0, 4),
        svgOpacity: cs?.opacity, svgDisplay: cs?.display,
        strokeColor: first?.stroke, strokeW: first?.strokeWidth, polyOpacity: first?.opacity,
        chips: [...document.querySelectorAll('.tw-lists .anch-chip')].length,
        hungCells: [...g.querySelectorAll('.tw-cell--hung')].length,
        stageOverflow: (() => { const s = document.querySelector('.room-stage') || document.querySelector('.anch'); return s ? s.scrollHeight - s.clientHeight : null; })(),
      };
    });
    R.gallery.words = tw.targetWords.slice(0, tw.targetCount + 2); R.gallery.target = tw.targetCount;
    await shot('gallery-hung-390');
    await page.setViewportSize({ width: 375, height: 667 });
    await sleep(600);
    R.gallery.at375 = await page.evaluate(() => {
      const g = document.querySelector('.tw-grid--hung');
      if (!g) return null;
      const r = g.getBoundingClientRect();
      const st = document.querySelector('.room-stage');
      return { y: +r.y.toFixed(1), bottom: +r.bottom.toFixed(1), inView: r.top >= 0 && r.bottom <= window.innerHeight,
        vh: window.innerHeight, stageOver: st ? st.scrollHeight - st.clientHeight : null,
        polylines: document.querySelectorAll('.tw-thread polyline').length };
    });
    await shot('gallery-hung-375');
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(400);
  }
  await leave();

  // ══ 2. THE CONSERVATORY — does the strip slice a word? ══════════════════
  await openRoom('conservatory', { col: 4, row: 2 });
  await topUp();
  const hl = await page.evaluate(() => ({
    center: document.querySelector('.hv-cell--center .hv-cell__g').textContent.trim(),
    outer: [...document.querySelectorAll('.hv-cell:not(.hv-cell--center) .hv-cell__g')].map((e) => e.textContent.trim()),
  }));
  const hive = hives.find((p) => p.center === hl.center && p.outer.length === hl.outer.length && p.outer.every((l) => hl.outer.includes(l)));
  R.conservatory = { boardId: hive?.id ?? null };
  if (hive) {
    const longest = [...hive.validWords].sort((a, b) => b.length - a.length);
    for (const w of longest.slice(0, 14)) {
      await page.keyboard.type(w); await page.keyboard.press('Enter'); await sleep(130);
    }
    await sleep(500); await clearMoments();
    const stripAudit = async () => page.evaluate(() => {
      const strip = document.querySelector('.hv-found__strip');
      if (!strip) return null;
      const sr = strip.getBoundingClientRect();
      const chips = [...strip.children].map((c) => {
        const r = c.getBoundingClientRect();
        return { t: c.textContent.trim(), vis: getComputedStyle(c).visibility,
          left: +r.x.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1) };
      });
      const visible = chips.filter((c) => c.vis === 'visible');
      const clipped = visible.filter((c) => c.right > sr.right + 0.5);
      // any visible chip whose right edge falls inside the 18px mask fade?
      const faded = visible.filter((c) => c.right > sr.right - 18 + 0.5);
      return {
        stripBox: { x: +sr.x.toFixed(1), right: +sr.right.toFixed(1), w: +sr.width.toFixed(1) },
        maskImage: getComputedStyle(strip).webkitMaskImage || getComputedStyle(strip).maskImage,
        overflow: getComputedStyle(strip).overflow,
        chips, visibleCount: visible.length, clipped, faded,
        toggle: (() => { const b = document.querySelector('.hv-found__toggle'); return b ? b.textContent.trim() : null; })(),
      };
    });
    R.conservatory.strip = await stripAudit();
    await shot('conservatory-strip-390');
    // Font-swap / dynamic-type stress: bump root font size, does the JS re-measure?
    await page.evaluate(() => { document.documentElement.style.fontSize = '19px'; });
    await sleep(700);
    R.conservatory.stripAfterTypeBump = await stripAudit();
    await shot('conservatory-strip-bump');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await sleep(500);
    await page.setViewportSize({ width: 375, height: 667 }); await sleep(700);
    R.conservatory.stripAt375 = await stripAudit();
    await shot('conservatory-strip-375');
    await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  }
  await leave();

  // ══ 3. THE COUNTING HOUSE — undo & surgical erase ═══════════════════════
  await openRoom('counting-house', { col: 2, row: 1 });
  await topUp();
  const pickEmpty = () => page.evaluate(() => {
    const cells = [...document.querySelectorAll('.ch-cell')];
    for (let i = 0; i < cells.length; i++) if (!cells[i].classList.contains('ch-cell--given') && cells[i].textContent.trim() === '') return i;
    return -1;
  });
  const idx = await pickEmpty();
  R.countingHouse = { cellIdx: idx };
  if (idx >= 0) {
    await page.click(`.ch-cell >> nth=${idx}`);
    await sleep(200);
    // pencil mode on
    const pm = await page.$('[aria-label^="Pencil mode"]');
    if (pm) { await pm.click(); await sleep(200); }
    const digitKey = (d) => page.click(`.ch-pad .ch-key >> nth=${d - 1}`);
    const marks = [];
    for (const d of [2, 5, 7, 9]) {
      await digitKey(d); await sleep(140);
      marks.push(await page.evaluate((i) => document.querySelectorAll('.ch-cell')[i].textContent.trim(), idx));
    }
    R.countingHouse.afterMarks = marks[marks.length - 1];
    R.countingHouse.eraseLabel = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.ch-key--verb')].find((x) => /Rub out|Lift/.test(x.textContent));
      return b ? { text: b.textContent.trim(), aria: b.getAttribute('aria-label'), disabled: b.disabled } : null;
    });
    // surgical erase: one tap should remove ONE mark (the last one, 9)
    await page.evaluate(() => { const b = [...document.querySelectorAll('.ch-key--verb')].find((x) => /Rub out|Lift/.test(x.textContent)); b?.click(); });
    await sleep(250);
    R.countingHouse.afterOneErase = await page.evaluate((i) => document.querySelectorAll('.ch-cell')[i].textContent.trim(), idx);
    R.countingHouse.eraseLabel2 = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.ch-key--verb')].find((x) => /Rub out|Lift/.test(x.textContent));
      return b ? b.textContent.trim() : null;
    });
    // undo restores it
    const undoProbe = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.ch-key--verb')].find((x) => /Undo/.test(x.textContent));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const c = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const corners = [[r.x + 4, r.y + 4], [r.right - 4, r.y + 4], [r.x + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]]
        .map(([x, y]) => { const e = document.elementFromPoint(x, y); return e === b || b.contains(e); });
      return { box: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) },
        inView: r.top >= 0 && r.bottom <= window.innerHeight,
        hit: c === b || b.contains(c) ? 'self' : (c?.className || c?.tagName || 'null'),
        corners, disabled: b.disabled };
    });
    R.countingHouse.undo = undoProbe;
    await page.evaluate(() => { const b = [...document.querySelectorAll('.ch-key--verb')].find((x) => /Undo/.test(x.textContent)); b?.click(); });
    await sleep(250);
    R.countingHouse.afterUndo = await page.evaluate((i) => document.querySelectorAll('.ch-cell')[i].textContent.trim(), idx);
    // undo depth: walk all four marks back
    for (let k = 0; k < 6; k++) {
      await page.evaluate(() => { const b = [...document.querySelectorAll('.ch-key--verb')].find((x) => /Undo/.test(x.textContent)); if (b && !b.disabled) b.click(); });
      await sleep(120);
    }
    R.countingHouse.afterDeepUndo = await page.evaluate((i) => document.querySelectorAll('.ch-cell')[i].textContent.trim(), idx);
    R.countingHouse.undoDisabledAtBottom = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.ch-key--verb')].find((x) => /Undo/.test(x.textContent)); return b?.disabled ?? null;
    });
    // does undo walk back an INKED (costed) figure or a bought one?
    await shot('countinghouse-390');
    // grid cell size for 6.19(a)
    R.countingHouse.cell = await page.evaluate(() => {
      const c = document.querySelector('.ch-cell'); const r = c.getBoundingClientRect();
      const leaf = document.querySelector('.ch-leaf') || c.parentElement;
      const lr = leaf.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), leafW: +lr.width.toFixed(1) };
    });
  }
  await leave();

  // ══ 4. THE LIBRARY — every wrong guess yields a bit ═════════════════════
  await openRoom('library', { col: 1, row: 4 });
  await topUp();
  const tiles = await page.$$eval('.ww-tile', (els) => els.map((e) => e.textContent.trim()));
  const board = webs.find((b) => b.layout.length === tiles.length && b.layout.every((w) => tiles.includes(w)));
  R.library = { boardId: board?.id ?? null, tier: board?.tier, herrings: board?.herrings };
  const selectAndSubmit = async (words) => {
    await page.evaluate((ws) => {
      for (const w of ws) {
        const t = [...document.querySelectorAll('.ww-tile')].find((e) => e.textContent.trim() === w);
        t?.click();
      }
    }, words);
    await sleep(250);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /weave/i.test(x.textContent)); if (b && !b.disabled) b.click(); });
    await sleep(2200);
    return page.evaluate(() => {
      const t = document.querySelector('.anch-toast, .ww-toast');
      const bit = document.querySelector('.anch-toast__bit, .ww-toast__bit');
      const all = [...document.querySelectorAll('[class*="toast"]')].map((e) => ({ c: e.className, t: e.textContent.trim() }));
      return { main: t?.textContent.trim() ?? null, bit: bit?.textContent.trim() ?? null, all };
    });
  };
  if (board) {
    const g = board.groups;
    // (a) scattered: one word from each group
    R.library.scattered = await selectAndSubmit([g[0].words[0], g[1].words[0], g[2].words[0], g[3].words[0]]);
    await page.evaluate(() => { document.querySelectorAll('.ww-tile--selected').forEach((e) => e.click()); });
    await sleep(300);
    // (b) one-away
    R.library.oneAway = await selectAndSubmit([g[0].words[0], g[0].words[1], g[0].words[2], g[1].words[0]]);
    await page.evaluate(() => { document.querySelectorAll('.ww-tile--selected').forEach((e) => e.click()); });
    await sleep(300);
    // (c) herring chase, if the board has one with an outside member
    const h = (board.herrings || [])[0];
    if (h) {
      const inGroup = new Set(g.flatMap((x) => x.words));
      const pick = h.words.slice(0, 3);
      const outsider = board.layout.find((w) => !h.words.includes(w));
      R.library.herringSel = [...pick, outsider];
      R.library.herring = await selectAndSubmit([...pick, outsider]);
      void inGroup;
    }
    await shot('library-feedback-390');
    R.library.toastStyles = await page.evaluate(() => {
      const el = document.querySelector('.anch-toast');
      const bit = document.querySelector('.anch-toast__bit');
      const f = (e) => e ? { fs: getComputedStyle(e).fontSize, color: getComputedStyle(e).color, ff: getComputedStyle(e).fontFamily.split(',')[0] } : null;
      return { main: f(el), bit: f(bit) };
    });
  }

  writeFileSync(join(OUT, 'results.json'), JSON.stringify(R, null, 1));
  log(JSON.stringify(R, null, 1));
} finally {
  await browser.close();
}
