/**
 * scripts/r20-glass-drive.mjs — AAA §0.4: DRIVE THE CONTROLS, DON'T PHOTOGRAPH THEM.
 *
 * Exits non-zero on any failure, and it is not a gate that passes by
 * construction: run against HEAD before round 20 it reports 8 failures (a clue
 * row painted in part at both viewports, a click at that row's centre selecting
 * the wrong clue at both, and 2 of 35 inter-slot gutters falling through to the
 * sheet at each). Run against the tree after, 0.
 *
 * The two claims this round makes, tested by real page.mouse.click at real
 * coordinates, worst-case boards, both viewports:
 *   1. Tapping ANY clue row visible on the Linen Closet's panel changes which
 *      word is active and does NOT type a letter into the grid. (At HEAD a
 *      driven click at a clue's own centre turned "123" into "1G23".)
 *   2. Tapping the midpoint of EVERY inter-slot gutter in the Darkroom selects
 *      one of the two slots either side — no gutter falls through to the sheet.
 * ONE Edge instance, closed in a finally.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
const log = (...a) => console.log('[drive]', ...a);
let fails = 0;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
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
  async function openRoom(cardId, kind, root, cell, pin) {
    if (!(await ensureExploring())) throw new Error('never reached exploring');
    await page.evaluate(({ cardId, cell, kind, pin }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell,
        rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind, puzzleId: pin } } } });
      const s2 = window.__manorStore.getState();
      window.__manorStore.setState({ day: { ...s2.day, steps: 400 } });
      s2.enterRoom(key);
    }, { cardId, cell, kind, pin });
    await page.waitForSelector(root, { timeout: 10000 });
    await sleep(500);
    await clearMoments();
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(350); };

  for (const vp of [{ w: 390, h: 844 }, { w: 375, h: 667 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await sleep(300);
    const tag = `${vp.w}x${vp.h}`;

    // ── 1. THE LINEN CLOSET ────────────────────────────────────────────────
    await openRoom('linen-closet', 'crossword', '.m2--linen', { col: 4, row: 5 }, 'crossword-t3-19');
    // Every clue row the panel actually paints, in order.
    const rows = await page.evaluate(() => {
      const panel = document.querySelector('.lc-clues');
      const pr = panel.getBoundingClientRect();
      const cs = getComputedStyle(panel);
      const top = pr.top + (parseFloat(cs.borderTopWidth) || 0);
      const bottom = pr.bottom - (parseFloat(cs.borderBottomWidth) || 0);
      return [...document.querySelectorAll('.lc-clue')].map((el, i) => {
        const r = el.getBoundingClientRect();
        const shown = Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, top)) / r.height;
        return { i, id: el.querySelector('.lc-clue__id').textContent.trim(),
          cx: r.x + r.width / 2, cy: r.y + r.height / 2, shown: +shown.toFixed(3) };
      });
    });
    const painted = rows.filter((r) => r.shown > 0);
    const wholly = rows.filter((r) => r.shown >= 0.999);
    log(tag, 'linen: clue rows', rows.length, 'painted', painted.length, 'wholly', wholly.length,
      JSON.stringify(rows.map((r) => `${r.id}:${r.shown}`)));
    if (painted.length !== wholly.length) { fails++; log('  FAIL a clue row is painted in part'); }
    for (const r of painted) {
      const before = await page.evaluate(() => [...document.querySelectorAll('.lc-cell__ch')].map((e) => e.textContent).join('|'));
      await page.mouse.click(r.cx, r.cy);
      await sleep(160);
      const after = await page.evaluate(() => ({
        grid: [...document.querySelectorAll('.lc-cell__ch')].map((e) => e.textContent).join('|'),
        active: document.querySelector('.lc-clue--active .lc-clue__id')?.textContent.trim() ?? null,
      }));
      const typed = after.grid !== before;
      const selected = after.active === r.id;
      log(`  ${tag} tap clue ${r.id} -> active=${after.active} typedALetter=${typed}`);
      if (typed) { fails++; log('  FAIL tapping a clue mutated the grid'); }
      if (!selected) { fails++; log('  FAIL tapping a clue did not select it'); }
    }
    await leave();

    // ── 2. THE DARKROOM ────────────────────────────────────────────────────
    await openRoom('darkroom', 'cipher', '.mic--darkroom', { col: 3, row: 5 }, 'cipher-t3-40');
    const gutters = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('.dk-cell')].map((c) => ({ el: c, r: c.getBoundingClientRect() }));
      const out = [];
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i], b = cells[j];
          if (Math.abs(a.r.y - b.r.y) > 2) continue;
          const gap = b.r.left - a.r.right;
          if (gap <= 0 || gap > 20) continue;
          out.push({ x: (a.r.right + b.r.left) / 2, y: a.r.y + a.r.height / 2, gap: +gap.toFixed(1),
            a: a.el.getAttribute('aria-label'), b: b.el.getAttribute('aria-label'),
            /* A DEVELOPED slot refuses selection by design (CipherView:
               beginCellTap returns early on a locked letter), so a gutter
               between two of them correctly moves nothing. The test still
               proves the point is not parchment: elementFromPoint has to
               answer as one of the two cells either way. */
            locked: a.el.classList.contains('dk-cell--locked') || b.el.classList.contains('dk-cell--locked'),
            hitsACell: (() => { const h = document.elementFromPoint((a.r.right + b.r.left) / 2, a.r.y + a.r.height / 2);
              const c = h && h.closest('.dk-cell'); return c === a.el || c === b.el; })() });
        }
      }
      return out;
    });
    log(tag, 'darkroom: inter-slot gutters sampled', gutters.length);
    let gutterFails = 0;
    for (const g of gutters) {
      await page.mouse.click(g.x, g.y);
      await sleep(70);
      const sel = await page.evaluate(() => document.querySelector('.dk-cell--sel')?.getAttribute('aria-label') ?? null);
      const cipherOf = (s) => (s || '').replace(/^Cipher letter (\w).*$/, '$1');
      const selectedNeighbour = sel && (cipherOf(sel) === cipherOf(g.a) || cipherOf(sel) === cipherOf(g.b));
      const ok = g.hitsACell && (selectedNeighbour || g.locked);
      if (!ok) { gutterFails++; log(`  FAIL gutter ${g.gap}px at ${g.x.toFixed(0)},${g.y.toFixed(0)} -> ${sel} hitsACell=${g.hitsACell} locked=${g.locked}`); }
    }
    log(`  ${tag} gutters landing on neither neighbour: ${gutterFails}/${gutters.length}`);
    fails += gutterFails;
    await leave();
  }
  log(fails === 0 ? 'ALL DRIVEN CHECKS PASSED' : `${fails} DRIVEN CHECKS FAILED`);
} finally {
  await browser.close();
  server.kill();
}
process.exit(fails === 0 ? 0 : 1);
