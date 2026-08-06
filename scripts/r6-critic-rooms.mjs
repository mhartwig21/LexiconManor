/**
 * ROUND 6 CRITIC PROBE — anchor + micro rooms.
 * System Edge only (channel 'msedge'), exactly ONE browser instance, closed in
 * a finally. 390x844 @2x.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round6-critic');
const BASE = 'http://localhost:4173/LexiconManor/';
mkdirSync(OUT, { recursive: true });

const pools = {
  hive: JSON.parse(readFileSync(resolve(root, 'content/generated/hive.json'), 'utf8')),
  web: JSON.parse(readFileSync(resolve(root, 'content/generated/word-web.json'), 'utf8')),
};

const R = {};
const log = (...a) => console.log('[r6]', ...a);

const ROOM_KIND = {
  library: 'word-web', conservatory: 'hive', gallery: 'twistle', study: 'forgotten-word',
  darkroom: 'cipher', 'linen-closet': 'crossword', 'counting-house': 'sudoku',
};
const ROOM_ROOT = {
  'word-web': '.anch--library', hive: '.anch--conservatory', twistle: '.anch--gallery',
  'forgotten-word': '.anch--study', cipher: '.mic--darkroom', crossword: '.m2--linen', sudoku: '.ch',
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: join(OUT, n + '.png') });
  const store = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    return { phase: s.day?.phase ?? null, day: s.day?.day ?? null, steps: s.stepsRemaining(), gems: s.currencies.gems };
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(600);

  // ── boot to exploring ────────────────────────────────────────────────────
  for (let i = 0; i < 40; i++) {
    const s = await store();
    if (s.phase === 'exploring') break;
    if (s.phase === null) {
      const b = await page.$('.chr-scene__btn, .fs-begin, button');
      if (b) { await b.click(); await sleep(500); }
      await sleep(300); continue;
    }
    if (await page.$('.dlg')) {
      for (let k = 0; k < 40 && (await page.$('.dlg')); k++) {
        const p = await page.$('.dlg-choice--primary');
        if (p) { await p.click(); } else {
          const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
          if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown');
        }
        await sleep(200);
      }
      continue;
    }
    const btn = await page.$('.chr-scene__btn');
    if (btn) { await btn.click(); await sleep(500); continue; }
    await sleep(300);
  }
  log('phase', await store());

  async function ensureExploring() {
    for (let i = 0; i < 60; i++) {
      const s = await store();
      const hasManor = await page.evaluate(() => !!window.__manorStore.getState().manor);
      if (s.phase === 'exploring' && hasManor) return true;
      if (await page.$('.dlg')) {
        const p = await page.$('.dlg-choice--primary');
        if (p) await p.click();
        else {
          const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
          if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown');
        }
        await sleep(200); continue;
      }
      const skip = await page.$('.chr-dusk__skip');
      if (skip) { await skip.click(); await sleep(500); continue; }
      const btn = await page.$('.chr-scene__btn');
      if (btn) { await btn.click(); await sleep(500); continue; }
      await sleep(300);
    }
    return false;
  }

  async function openRoom(cardId, cell, puzzleId) {
    if (!(await ensureExploring())) { log('!! could not reach exploring for', cardId); return false; }
    const kind = ROOM_KIND[cardId];
    await page.evaluate(({ cardId, cell, kind, puzzleId }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({
        manor: { ...st.manor, playerCell: cell,
          rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind, puzzleId } } },
      });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, cell, kind, puzzleId });
    const ok = await page.waitForSelector(ROOM_ROOT[kind], { timeout: 10000 }).catch(() => null);
    await sleep(500);
    return !!ok;
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(300); };

  /** Measure dead space + small tap targets on the current room. */
  const measure = async (label) => page.evaluate((label) => {
    const stage = document.querySelector('.room-host__stage');
    const vv = { w: innerWidth, h: innerHeight };
    // interactive elements too small
    const small = [];
    for (const el of document.querySelectorAll('.room-host button, .room-host [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.width < 44 || r.height < 44) {
        small.push({ cls: el.className.toString().slice(0, 34), w: +r.width.toFixed(1), h: +r.height.toFixed(1), t: (el.textContent||'').trim().slice(0,10) });
      }
    }
    // biggest vertical gap between consecutive rendered content boxes inside the stage
    const boxes = [];
    const walk = (el) => {
      for (const c of el.children) {
        const r = c.getBoundingClientRect();
        const hasText = (c.textContent || '').trim().length > 0 || c.tagName === 'SVG' || c.querySelector('svg');
        if (r.height > 0 && r.width > 0 && hasText) { boxes.push({ top: r.top, bottom: r.bottom, tag: c.tagName, cls: c.className.toString().slice(0,28) }); }
        else walk(c);
      }
    };
    if (stage) walk(stage);
    boxes.sort((a, b) => a.top - b.top);
    let gap = { size: 0 };
    for (let i = 1; i < boxes.length; i++) {
      const g = boxes[i].top - boxes[i-1].bottom;
      if (g > gap.size) gap = { size: +g.toFixed(1), after: boxes[i-1].cls, before: boxes[i].cls };
    }
    const scrolls = stage ? stage.scrollHeight - stage.clientHeight : 0;
    return { label, vv, scrolls, gap, smallCount: small.length, small: small.slice(0, 6) };
  }, label);

  // ═══ LIBRARY ═════════════════════════════════════════════════════════════
  await openRoom('library', { col: 2, row: 2 }, 'web-1');
  await shot('lib-01-play');
  R.library = await measure('library');
  R.library.quoteCheck = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.ww-banner__theme, .anch__sub, .ww-tile, [class*=theme]')) {
      const t = (el.textContent || '').trim();
      if (t.includes('"') || t.includes('“') || t.includes('”')) {
        out.push({ t, codes: [...t].filter(c => /["“”]/.test(c)).map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()) });
      }
    }
    return out;
  });
  // wrong guess on a board with NO herring words: read the toast
  R.library.wrong = await page.evaluate(async () => {
    const tiles = [...document.querySelectorAll('.ww-tile')];
    return tiles.slice(0, 4).map(t => t.textContent.trim());
  });
  {
    const tiles = await page.$$('.ww-tile');
    for (const t of tiles.slice(0, 4)) { await t.click(); await sleep(60); }
    const weave = await page.$('.anch-btn--primary');
    if (weave) await weave.click();
    await sleep(900);
    R.library.wrongToast = await page.evaluate(() => document.querySelector('.anch-toast')?.textContent ?? null);
    await shot('lib-02-wrong');
  }
  await leave();

  // ═══ CONSERVATORY: drive to Every Petal ══════════════════════════════════
  const hivePuz = pools.hive[0];
  await openRoom('conservatory', { col: 3, row: 2 }, hivePuz.id);
  R.hive = { puzzle: hivePuz.id, words: hivePuz.validWords.length, totalPoints: hivePuz.totalPoints };
  R.hive.play = await measure('hive-play');
  R.hive.geomPlay = await page.evaluate(() => {
    const svg = document.querySelector('.hv-hive, .hv-hive svg, svg.hv-hive__svg') || document.querySelector('.anch--conservatory svg');
    const r = svg?.getBoundingClientRect();
    const cell = document.querySelector('.hv-cell')?.getBoundingClientRect();
    return { hive: r && { w: +r.width.toFixed(1), h: +r.height.toFixed(1), top: +r.top.toFixed(1) },
             cell: cell && { w: +cell.width.toFixed(1), h: +cell.height.toFixed(1) } };
  });
  await shot('hive-01-play');

  const answers = hivePuz.validWords ?? hivePuz.words ?? hivePuz.answers;
  const typeWord = async (w) => {
    await page.evaluate((w) => {
      for (const ch of w) window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }, w);
    await sleep(45);
  };
  let bloomShot = false;
  for (const w of answers) {
    await typeWord(w);
    const st = await page.evaluate(() => ({
      fullBloom: /Full Bloom|Every Petal/.test(document.querySelector('.hv-ladder, .anch__ladder, .anch--conservatory')?.textContent ?? ''),
      everyPetal: !!document.querySelector('.anch-done__title') && /Every Petal/.test(document.querySelector('.anch-done__title').textContent),
    })).catch(() => null);
    if (st?.fullBloom && !bloomShot) { bloomShot = true; await sleep(400); await shot('hive-02-fullbloom'); R.hive.geomBloom = await page.evaluate(() => { const svg = document.querySelector('.anch--conservatory svg'); const r = svg?.getBoundingClientRect(); const cell = document.querySelector('.hv-cell')?.getBoundingClientRect(); return { hive: r && { w:+r.width.toFixed(1), h:+r.height.toFixed(1), top:+r.top.toFixed(1) }, cell: cell && { w:+cell.width.toFixed(1), h:+cell.height.toFixed(1) } }; }); }
    if (st?.everyPetal) break;
  }
  await sleep(800);
  R.hive.everyPetal = await page.evaluate(() => {
    const d = document.querySelector('.anch-done');
    return d ? { title: document.querySelector('.anch-done__title')?.textContent, line: document.querySelector('.anch-done__line')?.textContent, fern: document.querySelector('.anch-done__fern')?.textContent } : null;
  });
  R.hive.gemsAfter = (await store()).gems;
  await shot('hive-03-everypetal');
  await leave();

  // ═══ DARKROOM: pointerdown-commit inside a scrolling deck ════════════════
  await openRoom('darkroom', { col: 4, row: 2 });
  R.cipher = await measure('cipher');
  R.cipher.stageScroll = await page.evaluate(() => { const s = document.querySelector('.room-host__stage'); return { scrollHeight: s.scrollHeight, clientHeight: s.clientHeight, over: s.scrollHeight - s.clientHeight }; });
  R.cipher.keyTouchAction = await page.evaluate(() => { const k = document.querySelector('.mic-key'); return { touchAction: getComputedStyle(k).touchAction, deckPos: getComputedStyle(document.querySelector('.room-deck')).position }; });
  // simulate a scroll-drag that STARTS on a letter key
  const readCipher = () => page.evaluate(() => [...document.querySelectorAll('.dk-cell')].map(c => (c.querySelector('.dk-cell__cipher')?.textContent ?? '') + ':' + (c.querySelector('.dk-cell__plain')?.textContent ?? '')).join('|'));
  const before = await readCipher();
  {
    const k = await page.$('.mic-keys__row .mic-key');
    const b = await k.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y - 120, { steps: 12 });
    await page.mouse.up();
    await sleep(300);
  }
  const after = await readCipher();
  R.cipher.dragCommitted = before !== after;
  R.cipher.beforeAfter = { before: before.slice(0, 90), after: after.slice(0, 90) };
  R.cipher.pressedStyled = await page.evaluate(() => {
    const k = document.querySelector('.mic-key'); k.classList.add('is-pressed');
    const t = getComputedStyle(k).transform; k.classList.remove('is-pressed');
    return t;
  });
  await shot('cipher-01');
  await leave();

  // ═══ COUNTING HOUSE ══════════════════════════════════════════════════════
  await openRoom('counting-house', { col: 5, row: 2 });
  R.sudoku = await measure('sudoku');
  R.sudoku.cellBox = await page.evaluate(() => { const c = document.querySelector('.ch-cell'); const r = c.getBoundingClientRect(); const leaf = document.querySelector('.ch-leaf').getBoundingClientRect(); return { cell: { w:+r.width.toFixed(1), h:+r.height.toFixed(1) }, leaf: { w:+leaf.width.toFixed(1) }, viewport: innerWidth }; });
  R.sudoku.pencilFontPx = await page.evaluate(() => { const p = document.querySelector('.ch-pencil'); return p ? getComputedStyle(p).fontSize : 'none'; });
  R.sudoku.pressedStyled = await page.evaluate(() => {
    const out = {};
    for (const sel of ['.ch-cell', '.ch-key', '.ch-tool']) {
      const el = document.querySelector(sel);
      const base = getComputedStyle(el).transform;
      el.classList.add('is-pressed');
      const pressed = getComputedStyle(el).transform;
      el.classList.remove('is-pressed');
      out[sel] = { base, pressed, changes: base !== pressed };
    }
    return out;
  });
  R.sudoku.verbs = await page.evaluate(() => [...document.querySelectorAll('.ch-tool, .ch-key')].map(b => b.textContent.trim()));
  const readPencil = () => page.evaluate(() => [...document.querySelectorAll('.ch-cell')].map(c => (c.querySelector('.ch-pencil')?.textContent ?? '')).join('|'));
  await page.click('.ch-tools--free .ch-tool:nth-child(2)'); // Pencil what fits
  await sleep(400);
  const maskA = await readPencil();
  await shot('sudoku-01-filled');
  // prune by hand: turn pencil mode on, toggle a few digits off in the selected cell
  await page.click('.ch-tools--free .ch-tool:nth-child(1)');
  await sleep(150);
  const keys = await page.$$('.ch-key--fig');
  for (const k of keys.slice(0, 4)) { await k.click(); await sleep(80); }
  const maskB = await readPencil();
  await page.click('.ch-tools--free .ch-tool:nth-child(2)'); // refill — overwrites?
  await sleep(300);
  const maskC = await readPencil();
  R.sudoku.fillPencilOverwrites = { prunedDiffersFromFilled: maskA !== maskB, refillRestoredNaive: maskC === maskA, workLost: maskA !== maskB && maskC === maskA };
  await shot('sudoku-02-after-refill');
  await leave();

  // ═══ GALLERY solved dead space ═══════════════════════════════════════════
  await openRoom('gallery', { col: 6, row: 2 });
  R.twistle = await measure('twistle');
  await shot('twistle-01');
  await leave();

  // ═══ STUDY ═══════════════════════════════════════════════════════════════
  await openRoom('study', { col: 2, row: 3 });
  R.study = await measure('study');
  await shot('study-01');
  await leave();

  // ═══ LINEN CLOSET ════════════════════════════════════════════════════════
  await openRoom('linen-closet', { col: 3, row: 3 });
  R.crossword = await measure('crossword');
  await shot('linen-01');
  await leave();

  console.log('\n===RESULTS===\n' + JSON.stringify(R, null, 1));
} finally {
  await browser.close();
}
