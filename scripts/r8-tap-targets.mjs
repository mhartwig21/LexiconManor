/**
 * scripts/r8-tap-targets.mjs — ROUND 8 VERIFIER, AAA 6.19.
 *
 * Round 13's composition pass asked AAA_BAR for three §6.19 rulings and quoted
 * measurements to justify them. A ruling written into the bar on quoted numbers
 * is exactly the drift 6.19's own footnote warns about ("the exemption is from
 * the number, never from the measurement") — and that pass ALSO found that
 * 6.19(a)'s recorded 43.3x43.3 had silently become 39x39 in the shipped tree.
 * So before anything is written down, the numbers are taken again, here.
 *
 * It measures the EFFECTIVE tap target, not the CSS box: `::after`/`::before`
 * target-extenders are common in this codebase, and a 30px box with a 44px
 * extender passes 6.19 while a naive rect read fails it. The effective box is
 * derived by hit-testing outward from each control's centre, which is the same
 * question the player's thumb asks.
 *
 * HARNESS RULES: system Edge via channel 'msedge', ONE instance, closed in a
 * finally. Never download a playwright browser.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PORT = await (async () => {
  for (let p = 5341; p <= 5400; p++) {
    let taken = false;
    for (const host of ['127.0.0.1', '::1', undefined]) {
      // eslint-disable-next-line no-await-in-loop
      taken = taken || await new Promise((res) => {
        const s = createServer();
        s.once('error', () => res(true));
        s.once('listening', () => s.close(() => res(false)));
        host ? s.listen(p, host) : s.listen(p);
      });
    }
    if (!taken) return p;
  }
  throw new Error('no free port');
})();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE); if (r.ok) break; } catch { /* not up */ }
  await new Promise((r) => setTimeout(r, 500));
}

/** kind -> [label, selector, what 6.19 says about it today] */
const TARGETS = {
  sudoku: [
    ['ledger cell', '.ch-cell', '6.19(a) EXEMPT — measurement recorded in the bar'],
    ['ledger pad key', '.ch-pad button, .ch-pad .ch-key', 'costed verb — no exemption'],
  ],
  cipher: [
    ['cipher slot', '.dk-cell', 'UNRULED — round 13 asked for a ruling'],
    ['darkroom key', '.mic-key', '6.19(b) EXEMPT while >=32w x >=48h'],
    ['darkroom verb', '.mic-btn--primary', 'costed verb — no exemption'],
  ],
  crossword: [
    ['crossword square', '.lc-cell:not(.lc-cell--void)', 'UNRULED at 375 — round 13 asked'],
    ['linen QWERTY key', '.lc-key', '6.19(b) EXEMPT while >=32w x >=48h'],
    ['clue row', '.lc-clue', 'no exemption reaches it'],
  ],
};

/* ROUND 20 — MEASURED ON THE WORST BOARD IN THE POOL, NOT ON WHICHEVER ONE
   THE SEED HANDED US. Every number 6.19 records is a floor, and a floor read
   off a soft board is not a floor: the cipher slot measures 37.4x54 on a
   16-glyph phrase and 32x54 on the 41-glyph one, and only the second is the
   number the exemption has to justify. The third element pins `puzzleId` on the
   placed room, which `openRoomSession` honours. */
const ROOMS = [
  ['cipher', 'darkroom', 'cipher-t3-40'],
  ['crossword', 'linen-closet', 'crossword-t3-19'],
  ['sudoku', 'counting-house', 'sudoku-t3-01'],
];

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  const drain = async () => {
    for (let i = 0; i < 25; i++) {
      const b = await page.$('.mom');
      if (!b) return;
      const r = await b.boundingBox();
      if (!r) return;
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2).catch(() => {});
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
  await page.waitForFunction(
    () => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 },
  );
  await drain();

  const rows = [];
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(300);
    console.log(`\n================ ${vp.width}x${vp.height} ================`);
    for (const [kind, cardId, pin] of ROOMS) {
      await page.evaluate(([k, c, p]) => {
        const store = window.__manorStore;
        const m = store.getState().manor;
        const cell = { col: m.playerCell.col, row: m.playerCell.row };
        const key = `${cell.col},${cell.row}`;
        store.setState({ manor: { ...m, rooms: { ...m.rooms, [key]: { cardId: c, cell, doors: ['N', 'S'], solved: false, kind: k, puzzleId: p } } } });
        store.getState().enterRoom(key);
      }, [kind, cardId, pin]);
      await page.waitForTimeout(900);
      await drain();
      if (!(await page.$('.room-host__stage'))) { console.log(`${kind}: no stage`); continue; }

      for (const [label, sel, ruling] of TARGETS[kind]) {
        // eslint-disable-next-line no-await-in-loop
        const m = await page.evaluate((s) => {
          const el = document.querySelector(s);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          if (r.width === 0) return null;
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const owns = (x, y) => {
            const hit = document.elementFromPoint(x, y);
            return !!hit && (hit === el || el.contains(hit) || hit.closest?.(s) === el);
          };
          // Effective target: walk out from the centre until the control stops
          // answering. This catches ::after extenders and inter-cell dead zones
          // alike, which a bounding-rect read cannot tell apart.
          const walk = (dx, dy) => {
            let n = 0;
            for (; n < 40; n++) if (!owns(cx + dx * (n + 1), cy + dy * (n + 1))) break;
            return n;
          };
          const L = walk(-1, 0), R = walk(1, 0), U = walk(0, -1), D = walk(0, 1);
          return {
            css: `${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
            effW: +(L + R + 1).toFixed(1),
            effH: +(U + D + 1).toFixed(1),
            count: document.querySelectorAll(s).length,
          };
        }, sel);
        if (!m) { console.log(`  ${label.padEnd(20)} — not on glass`); continue; }
        const pass = m.effW >= 44 && m.effH >= 44;
        rows.push({ vp: `${vp.width}x${vp.height}`, kind, label, ...m, pass, ruling });
        console.log(`  ${label.padEnd(20)} css ${m.css.padEnd(12)} effective ${m.effW}x${m.effH}`
          + `  n=${String(m.count).padEnd(3)} ${pass ? 'PASS 44pt' : 'UNDER 44pt'}   [${ruling}]`);
      }
      await page.evaluate(() => window.__manorStore.getState().leaveRoom());
      await page.waitForTimeout(400);
      await drain();
    }
  }
  console.log(`\n${JSON.stringify(rows, null, 1)}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
