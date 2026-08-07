/**
 * scripts/probe-seal-geometry.mjs — OWNER: A8 (platform). THE SEAL'S COST SHEET.
 *
 * WHAT THIS MEASURES, AND WHY IT IS KEPT
 * The round-12 fix for AAA 11.2 / 11.27 (ui/moment/dock.ts) makes the moment
 * seal a non-tappable NOTICE inside a room instead of a card that eats the taps
 * aimed at the board under it. The rejected alternative — having the room
 * reserve a band and lay itself out in what is left — is the reason this script
 * exists: it looked right and it hit-tested clean, and then it was measured.
 * Every board sizes off `--stage-h`, so the reserve came out of the board:
 *
 *   390x844  ledger cell 43.3 -> 35.8 · hive hex 107.3 -> 75.8
 *   375x667  ledger cell 39.7 -> 25.8 · hive hex  86.1 -> 46.1
 *
 * AAA 6.19(a) exempts that ledger from the 44px floor **on a measured number**,
 * and its own footnote says the exemption is "from the number, never from the
 * measurement". A notice that shrinks the exempt board by 35% for five seconds
 * is a second defect, so the shipped fix costs the board nothing and this
 * script is what proves it: every `->` below must be a no-op.
 *
 * `tests/critic-round12-seal-overlap.mjs` is the pass/fail gate (zero covered
 * controls in all seven room kinds, plus a driven tap under the seal). This is
 * the cost sheet beside it: stage height, cell geometry and the exit's box,
 * with and without a seal, at both viewports. Re-run it after any change to the
 * moment card, the room shell or the dock, and paste the numbers into the
 * round's report.
 *
 * Harness rules (AAA §0.4): system Edge, ONE browser, closed in a finally.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = await (async () => {
  for (let p = 6410; p < 6460; p++) {
    const taken = await new Promise((res) => { const s = createServer(); s.once('error', () => res(true)); s.once('listening', () => s.close(() => res(false))); s.listen(p, '127.0.0.1'); });
    if (!taken) return p;
  }
  throw new Error('no free port');
})();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch { /* not up */ } await new Promise((r) => setTimeout(r, 500)); }

const CELL = {
  hive: '.hv-cell', twistle: '.tw-cell', cipher: '.cp-key, .cip-key, .dk-key',
  crossword: '.lc-cell', sudoku: '.ch-cell', 'forgotten-word': '.fw-input',
};

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const drain = async () => {
    for (let i = 0; i < 25; i++) {
      const b = await page.$('.mom');
      if (!b) return;
      const r = await b.boundingBox();
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      await page.waitForTimeout(150);
    }
  };
  await page.goto(`${BASE}?probe=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bp-btn--seal', { timeout: 30000 });
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene', { timeout: 8000 });
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.dlg', { timeout: 8000 });
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const p = await page.$('.dlg-choice--primary');
    if (p) { await p.click(); await page.waitForTimeout(170); continue; }
    const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (c) { await c.click(); await page.waitForTimeout(170); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 });
  await drain();

  // A DISTINCT grant per room per viewport: re-filling an already-unlocked
  // plate announces nothing, which is how a probe can measure ten rooms with
  // no seal on the glass at all and report a cost of zero.
  const ROOMS = [
    ['hive', 'conservatory', ['gallery', 'orangery']],
    ['twistle', 'gallery', ['darkroom', 'long-gallery']],
    ['cipher', 'darkroom', ['counting-house', 'strong-room']],
    ['crossword', 'chart-room', ['still-room', 'linen-closet']],
    ['sudoku', 'counting-house', ['boot-room', 'gem-vault']],
  ];
  const VIEWPORTS = [{ width: 390, height: 844 }, { width: 375, height: 667 }];
  for (const [pass, vp] of VIEWPORTS.entries()) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(300);
    console.log(`\n=== ${vp.width}x${vp.height} ===`);
    for (const [kind, cardId, grant] of ROOMS) {
      await page.evaluate(([k, c]) => {
        const store = window.__manorStore;
        const m = store.getState().manor;
        const cell = { col: m.playerCell.col, row: m.playerCell.row };
        const key = `${cell.col},${cell.row}`;
        store.setState({ manor: { ...m, rooms: { ...m.rooms, [key]: { cardId: c, cell, doors: ['N', 'S'], solved: false, kind: k } } } });
        store.getState().enterRoom(key);
      }, [kind, cardId]);
      await page.waitForTimeout(700);
      if (!(await page.$('.room-host__stage'))) { console.log(`${kind}: no stage`); continue; }
      const read = () => page.evaluate((sel) => {
        const stage = document.querySelector('.room-host__stage');
        const c = document.querySelector(sel);
        const cr = c?.getBoundingClientRect();
        const foot = document.querySelector('.room-host__footer button')?.getBoundingClientRect();
        return {
          stageH: stage ? Math.round(stage.clientHeight) : null,
          scrolls: stage ? Math.round(stage.scrollHeight) - Math.round(stage.clientHeight) : null,
          cell: cr ? `${cr.width.toFixed(1)}x${cr.height.toFixed(1)}` : null,
          footTop: foot ? Math.round(foot.top) : null,
          footBottom: foot ? Math.round(foot.bottom) : null,
        };
      }, CELL[kind] ?? '.nothing');
      const before = await read();
      await page.evaluate((g) => { try { window.__manorStore.getState().unlockCard(g); } catch { /* already */ } }, grant[pass]);
      await page.waitForTimeout(600);
      const during = await read();
      const seal = await page.evaluate(() => {
        const m = document.querySelector('.mom')?.getBoundingClientRect();
        return m ? [Math.round(m.top), Math.round(m.bottom)] : null;
      });
      console.log(`${kind}: seal ${JSON.stringify(seal)} | stage ${before.stageH}->${during.stageH} | cell ${before.cell}->${during.cell} | scrollable ${before.scrolls}->${during.scrolls} | exit ${before.footTop}-${before.footBottom} -> ${during.footTop}-${during.footBottom}`);
      await drain();
      await page.evaluate(() => window.__manorStore.getState().leaveRoom());
      await page.waitForTimeout(350);
    }
  }
} catch (e) {
  console.error('threw', e.message, e.stack);
} finally {
  if (browser) await browser.close();
  server.kill();
}
process.exit(0);
