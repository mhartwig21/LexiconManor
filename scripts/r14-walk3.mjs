/**
 * Round 14 live critic — stage 3: full per-route + per-overlay walk at both
 * viewports. ONE browser (system Edge), closed in a finally.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = await (async () => {
  for (let p = 6410; p < 6470; p++) {
    const taken = await new Promise((res) => { const s = createServer(); s.once('error', () => res(true)); s.once('listening', () => s.close(() => res(false))); s.listen(p, '127.0.0.1'); });
    if (!taken) return p;
  }
  throw new Error('no free port');
})();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch { } await new Promise((r) => setTimeout(r, 500)); }

const L = (...a) => console.log(...a);

function hitFn(sel) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect();
  const ix = Math.max(4, r.width * 0.12), iy = Math.max(4, r.height * 0.12);
  const pts = {
    c: [r.left + r.width / 2, r.top + r.height / 2],
    tl: [r.left + ix, r.top + iy], tr: [r.right - ix, r.top + iy],
    bl: [r.left + ix, r.bottom - iy], br: [r.right - ix, r.bottom - iy],
  };
  const name = (n) => !n ? 'null' : (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).join('.') : n.tagName);
  const out = {};
  for (const [k, [x, y]] of Object.entries(pts)) {
    const h = document.elementFromPoint(x, y);
    out[k] = (h && (h === el || el.contains(h))) ? 'own' : name(h);
  }
  const bad = Object.entries(out).filter(([, v]) => v !== 'own');
  return {
    box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    aboveFold: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
    tap44: r.width >= 43.5 && r.height >= 43.5,
    covered: bad.length ? Object.fromEntries(bad) : 'clean',
  };
}

/** Hit-test EVERY visible control on the surface. */
function allHits() {
  const rows = [];
  for (const el of document.querySelectorAll('button,[role=button],a[href]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const ix = Math.max(4, r.width * 0.12), iy = Math.max(4, r.height * 0.12);
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + ix, r.top + iy], [r.right - ix, r.top + iy], [r.left + ix, r.bottom - iy], [r.right - ix, r.bottom - iy]];
    const names = ['c', 'tl', 'tr', 'bl', 'br'];
    const bad = {};
    pts.forEach(([x, y], i) => {
      const h = document.elementFromPoint(x, y);
      if (!(h && (h === el || el.contains(h)))) bad[names[i]] = !h ? 'null' : (typeof h.className === 'string' && h.className ? '.' + h.className.trim().split(/\s+/).join('.') : h.tagName);
    });
    rows.push({
      cls: typeof el.className === 'string' ? el.className : '',
      txt: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 38),
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      bad: Object.keys(bad).length ? bad : null,
    });
  }
  return rows;
}

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const VP of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    const hit = (s) => page.evaluate(hitFn, s);
    const all = () => page.evaluate(allHits);
    const drain = async () => {
      for (let i = 0; i < 30; i++) {
        const b = await page.$('.mom'); if (!b) return;
        const r = await b.boundingBox(); if (!r) return;
        await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
        await page.waitForTimeout(140);
      }
    };
    L(`\n\n############ VIEWPORT ${VP.width}x${VP.height} ############`);

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.bp-btn--seal');
    // chrome-height verification on this viewport, once a day exists
    await page.click('.bp-btn--seal');
    await page.waitForTimeout(1000);

    L('--- chrome token vs live bar ---');
    L(JSON.stringify(await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const bar = document.querySelector('.chr-header');
      const r = bar && bar.getBoundingClientRect();
      return { token: cs.getPropertyValue('--chrome-h').trim(), navFloor: cs.getPropertyValue('--page-nav-floor').trim(), bar: r ? +r.height.toFixed(2) : null, barTop: r ? r.top : null };
    })));

    L('\n--- OVERLAY: morning card ---');
    L('all hits:', JSON.stringify(await all(), null, 0));
    L('retire while morning card up:', JSON.stringify(await hit('.chr-retire')));
    await drain();
    L('after drain, retire:', JSON.stringify(await hit('.chr-retire')));

    // dismiss card -> dialogue
    await page.click('.chr-scene__btn');
    await page.waitForTimeout(800);
    L('\n--- OVERLAY: dialogue ---');
    L('all hits:', JSON.stringify(await all(), null, 0));
    L('retire while dialogue up:', JSON.stringify(await hit('.chr-retire')));
    for (let i = 0; i < 80 && (await page.$('.dlg')); i++) {
      const p = await page.$('.dlg-choice--primary');
      if (p) { await p.click(); await page.waitForTimeout(150); continue; }
      const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
      if (c) { await c.click(); await page.waitForTimeout(150); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => { });
      await page.waitForTimeout(140);
    }
    await page.waitForTimeout(500);
    await drain();

    L('\n--- ROUTE /manor (exploring) ---');
    L('all hits:', JSON.stringify(await all(), null, 0));

    // DRAFT overlay
    const door = await page.$('.bp-door, [aria-label*="Draft a room"]');
    if (door) {
      await door.click(); await page.waitForTimeout(700);
      L('\n--- OVERLAY: draft ---');
      L('all hits:', JSON.stringify(await all(), null, 0));
      L('retire during draft:', JSON.stringify(await hit('.chr-retire')));
      // cancel
      const cancel = await page.$('.bp-modal button:has-text("Not this")') || await page.$('.bp-modal .bp-btn--quiet');
      if (cancel) { await cancel.click(); await page.waitForTimeout(500); }
      L('after cancel hash:', await page.evaluate(() => location.hash), 'modal:', await page.evaluate(() => !!document.querySelector('.bp-modal')));
    }

    // CABINET overlay
    await page.click('text=Cabinet').catch(() => { });
    await page.waitForTimeout(700);
    L('\n--- OVERLAY: cabinet ---');
    L('all hits:', JSON.stringify(await all(), null, 0));
    L('retire during cabinet:', JSON.stringify(await hit('.chr-retire')));
    await page.keyboard.press('Escape').catch(() => { });
    const cclose = await page.$('.bp-modal .bp-modal__close, .bp-modal .bp-btn');
    if (cclose && await page.$('.bp-modal')) { await cclose.click(); await page.waitForTimeout(400); }
    L('cabinet closed:', !(await page.$('.bp-modal')));

    for (const route of ['/journal', '/chronicles', '/sanctum', '/room', '/nowhere']) {
      await page.evaluate((r) => { location.hash = r; }, route);
      await page.waitForTimeout(800);
      L(`\n--- ROUTE ${route} (exploring) ---`);
      L('hash:', await page.evaluate(() => location.hash));
      L('all hits:', JSON.stringify(await all(), null, 0));
    }
    L('\nerrs:', JSON.stringify(errs.slice(0, 8)));
    await ctx.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
