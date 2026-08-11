/**
 * scripts/r7-compose-probe.mjs — ROUND 8 vertical-budget worksheet.
 *
 * The round-8 residue is almost all arithmetic: a board is under 44pt, or a
 * board row is under the sticky deck, because the room's column is taller than
 * `--stage-h`. Guessing at that from CSS is how the round-7 comments ended up
 * quoting numbers that were true on a phone with no notch. This prints, per
 * room per viewport: the stage box, the deck box, the height of every direct
 * child of the room column, the widest usable content box on the board, and the
 * effective (probe-measured) tap target of the board's own cell — so a fix can
 * be sized before it is written.
 *
 * Harness rules (AAA §0.4): system Edge via channel 'msedge', never a
 * downloaded browser; exactly ONE instance, closed in a finally.
 *
 * Usage: node scripts/r7-compose-probe.mjs [--out <file>]
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const OUT = resolve(ROOT, (args[args.indexOf('--out') + 1] && !args[args.indexOf('--out') + 1].startsWith('--'))
  ? args[args.indexOf('--out') + 1] : 'docs/shots/round8/compose/probe.json');
mkdirSync(dirname(OUT), { recursive: true });

const log = (...a) => console.log('[probe]', ...a);

async function freePort(from = 5431, to = 5490) {
  for (let p = from; p <= to; p++) {
    let taken = false;
    for (const host of ['127.0.0.1', '::1', undefined]) {
      // eslint-disable-next-line no-await-in-loop
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
const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
const serverUp = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 60000);
  server.stdout.on('data', (b) => {
    if (String(b).includes('ready in') || String(b).includes('Local:')) { clearTimeout(t); res(); }
  });
  server.on('exit', (c) => { clearTimeout(t); rej(new Error(`vite exited (${c})`)); });
});

/* Same safe-area shim as the audit — without it every number below describes a
   phone with no notch and no home indicator (see r7-compose-audit.mjs). */
const SAFE_AREA_SHIM = /* js */ `(() => {
  const INSET = { top: '47px', bottom: '34px', left: '0px', right: '0px' };
  const sub = (v) => v.replace(/env\\(\\s*safe-area-inset-(top|bottom|left|right)\\s*(?:,[^()]*)?\\)/g, (_, s) => INSET[s]);
  let n = 0;
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.style && /safe-area-inset/.test(rule.cssText)) {
        const before = rule.style.cssText, after = sub(before);
        if (after !== before) { n++; try { rule.style.cssText = after; } catch {} }
      }
      if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch {} }
  if (n) document.documentElement.dataset.saShim = '1';
  return n || (document.documentElement.dataset.saShim ? -1 : 0);
})()`;

const WORKSHEET = /* js */ `((cellSel) => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) }; };
  const stage = document.querySelector('.room-host__stage');
  const col = stage && stage.firstElementChild;
  const deck = document.querySelector('.room-deck');
  const out = {
    viewport: { w: innerWidth, h: innerHeight },
    stage: box(stage),
    stageScrollH: stage ? stage.scrollHeight : null,
    column: box(col),
    deck: box(deck),
    overflow: stage ? +(stage.scrollHeight - stage.clientHeight).toFixed(1) : null,
    children: [],
    deckChildren: [],
  };
  if (col) for (const ch of col.children) {
    const cs = getComputedStyle(ch);
    out.children.push({ sel: ch.className || ch.tagName, ...box(ch),
      mb: cs.marginBottom, display: cs.display });
  }
  if (deck) for (const ch of deck.children) {
    out.deckChildren.push({ sel: ch.className || ch.tagName, ...box(ch) });
  }
  /* Effective tap target of the board cell: probe outward from the centre
     until elementFromPoint stops answering as that button (a target grown by a
     pseudo-element is measured for what it really is). */
  const cell = cellSel ? document.querySelector(cellSel) : null;
  if (cell) {
    const r = cell.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const owns = (x, y) => { const h = document.elementFromPoint(x, y); return h === cell || cell.contains(h); };
    const reach = (dx, dy) => { let n = 0; while (n < 60 && owns(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
    out.cell = { box: box(cell),
      effW: +(reach(-1, 0) + reach(1, 0) + 1).toFixed(1),
      effH: +(reach(0, -1) + reach(0, 1) + 1).toFixed(1) };
  }
  return out;
})`;

let browser;
const report = {};
try {
  await serverUp;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const sleep = (ms) => page.waitForTimeout(ms);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title', { timeout: 25000 });
  await page.click('.bp-btn--seal');

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
          if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
        }
        await sleep(200); continue;
      }
      const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(400); continue; }
      const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(400); continue; }
      await sleep(200);
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

  const ROOMS = [
    ['study', 'study', { col: 1, row: 2 }, 'forgotten-word', '.anch--study', null],
    ['darkroom', 'darkroom', { col: 6, row: 2 }, 'cipher', '.mic--darkroom', '.dk-cell'],
    ['counting-house', 'counting-house', { col: 5, row: 2 }, 'sudoku', '.ch', '.ch-cell'],
    ['linen-closet', 'linen-closet', { col: 0, row: 3 }, 'crossword', '.m2--linen', '.lc-cell'],
  ];

  for (const vp of [{ w: 390, h: 844 }, { w: 375, h: 667 }]) {
    for (const [label, cardId, cell, kind, rootSel, cellSel] of ROOMS) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      if (!(await ensureExploring())) throw new Error('never reached exploring');
      await page.evaluate(({ cardId, cell, kind }) => {
        const st = window.__manorStore.getState();
        const key = `${cell.col},${cell.row}`;
        window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell,
          rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind } } } });
        window.__manorStore.getState().enterRoom(key);
      }, { cardId, cell, kind });
      await page.waitForSelector(rootSel, { timeout: 12000 });
      await sleep(450);
      await clearMoments();
      const shimmed = await page.evaluate(SAFE_AREA_SHIM);
      if (!shimmed) throw new Error('safe-area shim rewrote 0 rules');
      await sleep(250);
      /* WORKSHEET is source text, not a function reference: hand it its
         argument by composing the call, or evaluate() returns the (unserialisable)
         function itself and every number below is undefined. */
      const m = await page.evaluate(`${WORKSHEET}(${JSON.stringify(cellSel)})`);
      report[`${label}@${vp.w}x${vp.h}`] = m;
      log(`${label} @ ${vp.w}x${vp.h}: stage ${m.stage?.h} · column ${m.column?.h} · deck ${m.deck?.h} · overflow ${m.overflow}`
        + (m.cell ? ` · cell ${m.cell.box.w}x${m.cell.box.h} (effective ${m.cell.effW}x${m.cell.effH})` : ''));
      for (const c of m.children) log(`    child ${String(c.sel).slice(0, 34).padEnd(34)} h=${c.h}`);
      for (const c of m.deckChildren) log(`     deck ${String(c.sel).slice(0, 34).padEnd(34)} h=${c.h}`);
      await page.evaluate(() => window.__manorStore.getState().leaveRoom());
      await sleep(350);
    }
  }
} catch (e) {
  log('PROBE THREW:', e.message);
  report.error = e.message;
} finally {
  if (browser) await browser.close();
  server.kill();
}
writeFileSync(OUT, JSON.stringify(report, null, 2));
log('wrote', OUT);
