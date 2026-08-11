/**
 * ROUND 7 — micro-rooms fix verification (Counting House + Darkroom).
 * ONE msedge instance, sequential routes, 390x844 DPR 3 (AAA §0.4 harness rules).
 *
 * Measures exactly the three round-6 findings:
 *   1. Counting House: "Pencil what fits" must not wipe hand-pruned marks; Undo exists,
 *      is >=44px, and walks a board edit back.
 *   2. Darkroom: a press that starts on a letter key and is dragged off must NOT commit
 *      and must NOT move the cursor.
 *   3. Counting House: leaf width vs viewport, cell size, pencil-mark font size + colour,
 *      and whether the whole leaf is still visible at rest.
 *
 * Usage: node scripts/micro-rooms-round7-verify.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round7-micro');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] ?? 'http://localhost:5199/LexiconManor/';
const R = {};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: join(OUT, n + '.png') });
  const store = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    return { phase: s.day?.phase ?? null, hasManor: !!s.manor };
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
  await sleep(700);

  async function ensureExploring() {
    for (let i = 0; i < 80; i++) {
      const s = await store();
      if (s.phase === 'exploring' && s.hasManor) return true;
      if (await page.$('.dlg')) {
        const p = await page.$('.dlg-choice--primary');
        if (p) await p.click();
        else {
          const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
          if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown');
        }
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
    if (!(await ensureExploring())) throw new Error('never reached exploring');
    await page.evaluate(({ cardId, cell, kind }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({
        manor: {
          ...st.manor, playerCell: cell,
          rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N', 'S', 'E', 'W'], solved: false, kind } },
        },
      });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, cell, kind });
    await sleep(900);
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(400); };
  const box = (sel) => page.$eval(sel, (e) => {
    const r = e.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) };
  });

  // ── THE COUNTING HOUSE ───────────────────────────────────────────────────
  await openRoom('counting-house', { col: 5, row: 2 }, 'sudoku');
  await page.waitForSelector('.ch-cell');

  const pencilNow = () => page.$$eval('.ch-cell', (els) =>
    els.map((c) => c.querySelector('.ch-pencil')?.textContent ?? '').join('|'));
  const tools = await page.$$('.ch-tools--free .ch-tool');
  await tools[1].click(); await sleep(350);            // "Pencil what fits"
  const afterFill = await pencilNow();

  R.geometry = {
    viewport: { w: 390, h: 844 },
    leaf: await box('.ch-leaf'),
    cell: await box('.ch-cell'),
    stage: await page.evaluate(() => {
      const s = document.querySelector('.room-host__stage');
      return { clientH: s.clientHeight, scrollH: s.scrollHeight, over: s.scrollHeight - s.clientHeight };
    }),
    deckTop: (await box('.room-deck')).y,
    padKey: await box('.ch-key'),
    pencil: await page.$eval('.ch-pencil', (e) => {
      const cs = getComputedStyle(e);
      return { fontSize: cs.fontSize, color: cs.color };
    }),
    leafFullyVisible: await page.evaluate(() => {
      const leaf = document.querySelector('.ch-leaf').getBoundingClientRect();
      const deck = document.querySelector('.room-deck').getBoundingClientRect();
      return leaf.bottom <= deck.top + 0.5 && leaf.top >= 0;
    }),
  };
  await shot('ch-filled');

  // Hand-prune five multi-candidate cells, then tap the button again.
  const pruneInfo = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.ch-cell')];
    const out = [];
    for (let i = 0; i < cells.length && out.length < 5; i++) {
      const marks = (cells[i].querySelector('.ch-pencil')?.textContent ?? '').replace(/\s/g, '');
      if (marks.length > 2) out.push(i);
    }
    return out;
  });
  // Turn pencil mode on, then toggle marks off by tapping cell + figure keys.
  await tools[0].click(); await sleep(150);
  for (const cellIdx of pruneInfo) {
    await page.$$eval('.ch-cell', (els, i) => els[i].dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true })), cellIdx);
    await sleep(60);
    const marks = await page.$$eval('.ch-cell', (els, i) =>
      (els[i].querySelector('.ch-pencil')?.textContent ?? '').replace(/\s/g, '').split(''), cellIdx);
    const keys = await page.$$('.ch-key--fig');
    for (const d of marks.slice(1)) await keys[Number(d) - 1].click();
    await sleep(60);
  }
  const afterPrune = await pencilNow();
  await tools[1].click(); await sleep(350);            // "Pencil what fits" AGAIN
  const afterRefill = await pencilNow();

  R.pencilWork = {
    prunedCells: pruneInfo.length,
    prunedChanged: afterPrune !== afterFill,
    refillWipedWork: afterRefill === afterFill,
    refillTouchedAnything: afterRefill !== afterPrune,
  };
  await shot('ch-pruned');

  // UNDO
  const undoBtn = await page.$('.ch-pad button[aria-label*="Undo"]');
  R.undo = { present: !!undoBtn };
  if (undoBtn) {
    R.undo.box = await box('.ch-pad button[aria-label*="Undo"]');
    R.undo.hitTest = await page.evaluate(() => {
      const b = document.querySelector('.ch-pad button[aria-label*="Undo"]');
      const r = b.getBoundingClientRect();
      const at = (x, y) => { const el = document.elementFromPoint(x, y); return !!el && (el === b || b.contains(el)); };
      return {
        centre: at(r.x + r.width / 2, r.y + r.height / 2),
        corners: [[r.x + 3, r.y + 3], [r.right - 3, r.y + 3], [r.x + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]]
          .every(([x, y]) => at(x, y)),
      };
    });
    // Erase a cell's marks, then undo, and assert the board came back.
    const before = await pencilNow();
    await page.$$eval('.ch-cell', (els, i) => els[i].dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true })), pruneInfo[0]);
    await sleep(80);
    const eraseBtn = await page.$('.ch-pad button[aria-label*="Erase"], .ch-pad button[aria-label*="Lift"]');
    await eraseBtn.click(); await sleep(150);
    const wiped = await pencilNow();
    await undoBtn.click(); await sleep(200);
    const restored = await pencilNow();
    R.undo.eraseChanged = wiped !== before;
    R.undo.restoredExactly = restored === before;
  }
  await shot('ch-undo');
  await leave();

  // ── THE DARKROOM: drag off a letter key ──────────────────────────────────
  await openRoom('darkroom', { col: 4, row: 2 }, 'cipher');
  await page.waitForSelector('.mic-key');
  const readCipher = () => page.$$eval('.dk-cell', (els) =>
    els.map((c) => c.querySelector('.dk-cell__plain')?.textContent ?? '').join(''));
  const sel0 = () => page.$$eval('.dk-cell--sel', (e) =>
    (e.length ? e[0].querySelector('.dk-cell__cipher').textContent : null));

  R.cipher = {
    keyBox: await box('.mic-key'),
    selBefore: await sel0(),
    before: await readCipher(),
  };
  {
    const b = await (await page.$('.mic-key')).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y - 160, { steps: 14 });
    await page.mouse.up();
    await sleep(400);
  }
  R.cipher.after = await readCipher();
  R.cipher.selAfter = await sel0();
  R.cipher.dragCommitted = R.cipher.before !== R.cipher.after;
  R.cipher.cursorMoved = R.cipher.selBefore !== R.cipher.selAfter;

  // A clean tap on a key still pencils and still advances.
  {
    const keys = await page.$$('.mic-key');
    await keys[0].click(); await sleep(250);
    R.cipher.tapCommitted = (await readCipher()) !== R.cipher.after;
    R.cipher.tapAdvanced = (await sel0()) !== R.cipher.selAfter;
    // ...and pressing the letter a cell ALREADY carries does not skip a cell.
    const penciled = await page.evaluate(() => {
      const cell = [...document.querySelectorAll('.dk-cell')]
        .find((c) => (c.querySelector('.dk-cell__plain')?.textContent ?? '').trim()
          && !c.classList.contains('dk-cell--locked'));
      if (!cell) return null;
      cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return cell.querySelector('.dk-cell__plain').textContent.trim();
    });
    await sleep(200);
    const selNow = await sel0();
    const textNow = await readCipher();
    const letterKey = await page.$(`.mic-key[aria-label="Pencil ${penciled}"]`);
    await letterKey.click(); await sleep(250);
    R.cipher.repeat = {
      letter: penciled,
      heldCursor: (await sel0()) === selNow,
      unchangedText: (await readCipher()) === textNow,
    };
  }
  await shot('dk-after');
  await leave();

  // ── THE LINEN CLOSET: same keyboard rule, same probe ─────────────────────
  await openRoom('linen-closet', { col: 3, row: 2 }, 'crossword');
  await page.waitForSelector('.lc-key');
  const readGrid = () => page.$$eval('.lc-cell', (els) =>
    els.map((c) => (c.querySelector('.lc-cell__ch')?.textContent ?? '')).join(''));
  R.crossword = { keyBox: await box('.lc-key'), before: await readGrid() };
  {
    const b = await (await page.$('.lc-key')).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y - 180, { steps: 14 });
    await page.mouse.up();
    await sleep(350);
  }
  R.crossword.dragCommitted = (await readGrid()) !== R.crossword.before;
  {
    const keys = await page.$$('.lc-key');
    await keys[0].click(); await sleep(250);
    R.crossword.tapCommitted = (await readGrid()) !== R.crossword.before;
  }
  await shot('lc-after');
  await leave();

  // ── 375x667 (SE-class): the leaf must still be whole ─────────────────────
  await page.setViewportSize({ width: 375, height: 667 });
  await openRoom('counting-house', { col: 5, row: 3 }, 'sudoku');
  await page.waitForSelector('.ch-cell');
  R.se = {
    leaf: await box('.ch-leaf'),
    cell: await box('.ch-cell'),
    padKey: await box('.ch-key'),
    pencilFont: await page.$eval('.ch-pencil', (e) => getComputedStyle(e).fontSize).catch(() => 'none'),
    leafFullyVisible: await page.evaluate(() => {
      const leaf = document.querySelector('.ch-leaf').getBoundingClientRect();
      const deck = document.querySelector('.room-deck').getBoundingClientRect();
      return leaf.bottom <= deck.top + 0.5 && leaf.top >= 0;
    }),
    stage: await page.evaluate(() => {
      const s = document.querySelector('.room-host__stage');
      return { clientH: s.clientHeight, scrollH: s.scrollHeight, over: s.scrollHeight - s.clientHeight };
    }),
  };
  await shot('ch-se');
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify(R, null, 2));
