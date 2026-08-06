/** ROUND 6 CRITIC PROBE v4 — tile geometry, cipher scroll-hijack, gallery solved. ONE msedge instance. */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round6-critic');
const BASE = 'http://localhost:4173/LexiconManor/';
mkdirSync(OUT, { recursive: true });
const twPool = JSON.parse(readFileSync(resolve(root, 'content/generated/twistle.json'), 'utf8'));
const R = {}; const log = (...a) => console.log('[r6d]', ...a);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: join(OUT, n + '.png') });
  const store = () => page.evaluate(() => { const s = window.__manorStore.getState(); return { phase: s.day?.phase ?? null, steps: s.stepsRemaining() }; });
  await page.goto(BASE, { waitUntil: 'networkidle' }); await sleep(600);

  async function ensureExploring() {
    for (let i = 0; i < 80; i++) {
      const s = await store();
      const hasManor = await page.evaluate(() => !!window.__manorStore?.getState().manor);
      if (s.phase === 'exploring' && hasManor) return true;
      if (await page.$('.dlg')) {
        const p = await page.$('.dlg-choice--primary');
        if (p) await p.click(); else { const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown'); }
        await sleep(200); continue;
      }
      const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(500); continue; }
      const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(500); continue; }
      const any = await page.$('button'); if (any && s.phase === null) { await any.click(); await sleep(400); continue; }
      await sleep(300);
    }
    return false;
  }
  async function openRoom(cardId, cell, kind) {
    if (!(await ensureExploring())) return false;
    await page.evaluate(({ cardId, cell, kind }) => {
      const st = window.__manorStore.getState(); const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell, rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind } } } });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, cell, kind }); await sleep(900); return true;
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(400); };
  const dead = () => page.evaluate(() => {
    const stage = document.querySelector('.room-host__stage'); const sr = stage.getBoundingClientRect();
    const leaves = [];
    for (const el of stage.querySelectorAll('*')) {
      if (el.children.length && !/^(BUTTON|SVG|OL|UL)$/.test(el.tagName)) continue;
      const r = el.getBoundingClientRect(); if (r.height < 1 || r.width < 1) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      if ((el.textContent||'').trim() || el.tagName === 'SVG' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderTopWidth !== '0px') leaves.push([Math.max(r.top, sr.top), Math.min(r.bottom, sr.bottom)]);
    }
    leaves.sort((a,b)=>a[0]-b[0]); const m = [];
    for (const [t,b] of leaves) { if (m.length && t <= m[m.length-1][1]+0.5) m[m.length-1][1]=Math.max(m[m.length-1][1],b); else m.push([t,b]); }
    const gaps = []; let cur = sr.top;
    for (const [t,b] of m) { if (t-cur>8) gaps.push({top:+cur.toFixed(0),h:+(t-cur).toFixed(0)}); cur=Math.max(cur,b); }
    if (sr.bottom-cur>8) gaps.push({top:+cur.toFixed(0),h:+(sr.bottom-cur).toFixed(0)});
    gaps.sort((a,b)=>b.h-a.h);
    return { stageH:+sr.height.toFixed(0), totalEmpty:+gaps.reduce((s,g)=>s+g.h,0).toFixed(0), biggest: gaps.slice(0,3) };
  });

  // LIBRARY tile geometry
  await openRoom('library', { col: 2, row: 2 }, 'word-web');
  await page.waitForSelector('.ww-tile');
  R.libTile = await page.$eval('.ww-tile', e => { const r = e.getBoundingClientRect(); return { w:+r.width.toFixed(1), h:+r.height.toFixed(1) }; });
  R.libGrid = await page.$eval('.ww-grid, .anch--library [class*=grid]', e => { const r = e.getBoundingClientRect(); return { w:+r.width.toFixed(1), h:+r.height.toFixed(1), top:+r.top.toFixed(1) }; }).catch(() => null);
  await leave();

  // GALLERY: solve it, measure the solved screen
  await openRoom('gallery', { col: 6, row: 2 }, 'twistle');
  await page.waitForSelector('.tw-cell');
  const grid = await page.$$eval('.tw-cell', els => els.map(e => e.innerText.trim()));
  const puz = twPool.find(p => (p.grid ? p.grid.flat().join('') : (p.letters||[]).join('')) === grid.join(''))
    || twPool.find(p => JSON.stringify(p).includes(grid.slice(0,5).join('')));
  R.twistle = { gridLen: grid.length, matched: !!puz, cell: await page.$eval('.tw-cell', e => { const r = e.getBoundingClientRect(); return { w:+r.width.toFixed(1), h:+r.height.toFixed(1) }; }) };
  R.twistle.deadPlay = await dead();
  await leave();

  // DARKROOM: drag that starts on a letter key
  await openRoom('darkroom', { col: 4, row: 2 }, 'cipher');
  await page.waitForSelector('.mic-key');
  const readCipher = () => page.$$eval('.dk-cell', els => els.map(c => (c.querySelector('.dk-cell__plain')?.textContent ?? '')).join(''));
  const sel0 = () => page.$$eval('.dk-cell--sel', e => e.length ? e[0].querySelector('.dk-cell__cipher').textContent : null);
  R.cipher = {
    stage: await page.evaluate(() => { const s = document.querySelector('.room-host__stage'); return { over: s.scrollHeight - s.clientHeight }; }),
    deckPos: await page.evaluate(() => getComputedStyle(document.querySelector('.room-deck')).position),
    keyTouchAction: await page.$eval('.mic-key', e => getComputedStyle(e).touchAction),
    keyBox: await page.$eval('.mic-key', e => { const r = e.getBoundingClientRect(); return { w:+r.width.toFixed(1), h:+r.height.toFixed(1) }; }),
    selBefore: await sel0(), before: await readCipher(),
  };
  {
    const b = await (await page.$('.mic-key')).boundingBox();
    await page.mouse.move(b.x + b.width/2, b.y + b.height/2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width/2, b.y - 160, { steps: 14 });
    await page.mouse.up(); await sleep(400);
  }
  R.cipher.after = await readCipher(); R.cipher.selAfter = await sel0();
  R.cipher.dragCommitted = R.cipher.before !== R.cipher.after;
  R.cipher.cursorMoved = R.cipher.selBefore !== R.cipher.selAfter;
  R.cipher.dead = await dead();
  await shot('cipher4-afterdrag');
  await leave();

  // COUNTING HOUSE: undo audit + pencil destruction, with shots
  await openRoom('counting-house', { col: 5, row: 2 }, 'sudoku');
  await page.waitForSelector('.ch-cell');
  R.sudoku = { verbs: await page.$$eval('.ch-tool', e => e.map(x => x.innerText.trim())), hasUndo: await page.$$eval('.room-host button', e => e.some(b => /undo|back|revert/i.test(b.innerText))) };
  const pencilNow = () => page.$$eval('.ch-cell', els => els.map(c => c.querySelector('.ch-pencil')?.textContent ?? '').join('|'));
  const tools = await page.$$('.ch-tools--free .ch-tool');
  await tools[1].click(); await sleep(400);           // Pencil what fits
  const A = await pencilNow();
  R.sudoku.pencilFont = await page.$eval('.ch-pencil', e => getComputedStyle(e).fontSize).catch(() => 'none');
  R.sudoku.pencilLayout = await page.$eval('.ch-pencil', e => { const cs = getComputedStyle(e); return { display: cs.display, cols: cs.gridTemplateColumns }; }).catch(() => null);
  await shot('sudoku4-filled');
  await tools[0].click(); await sleep(200);           // Pencil mode on
  const keys = await page.$$('.ch-key--fig');
  for (const k of keys.slice(0, 5)) { await k.click(); await sleep(90); }
  const B = await pencilNow();
  await tools[1].click(); await sleep(400);           // Pencil what fits AGAIN
  const C = await pencilNow();
  R.sudoku.destructive = { prunedChanged: A !== B, refillWipedWork: (A !== B) && (C === A) };
  await shot('sudoku4-refilled');
  await leave();

  writeFileSync(join(OUT, 'results4.json'), JSON.stringify(R, null, 1));
  log('done');
} finally { await browser.close(); }
