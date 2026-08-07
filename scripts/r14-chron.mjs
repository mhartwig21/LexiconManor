import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = await (async () => { for (let p = 6410; p < 6470; p++) { const taken = await new Promise((res) => { const s = createServer(); s.once('error', () => res(true)); s.once('listening', () => s.close(() => res(false))); s.listen(p, '127.0.0.1'); }); if (!taken) return p; } throw new Error('no port'); })();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch { } await new Promise((r) => setTimeout(r, 500)); }
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const VP of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}#/chronicles`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    console.log(`### ${VP.width}x${VP.height}`);
    console.log(JSON.stringify(await page.evaluate(() => { const l = document.querySelector('.chron__ledger'); return { sh: l.scrollHeight, ch: l.clientHeight, oy: getComputedStyle(l).overflowY }; })));
    await page.evaluate(() => { const l = document.querySelector('.chron__ledger'); l.scrollTop = l.scrollHeight; });
    await page.waitForTimeout(400);
    console.log('after scroll:', JSON.stringify(await page.evaluate(() => {
      const nm = (n) => !n ? 'null' : (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).join('.') : n.tagName);
      const out = {};
      for (const label of ['Erase everything', 'Start a new volume', 'Pack (copy code)']) {
        const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes(label));
        if (!b) { out[label] = 'MISSING'; continue; }
        const r = b.getBoundingClientRect();
        const ix = Math.max(4, r.width * .12), iy = Math.max(4, r.height * .12);
        const pts = { c: [r.left + r.width / 2, r.top + r.height / 2], tl: [r.left + ix, r.top + iy], tr: [r.right - ix, r.top + iy], bl: [r.left + ix, r.bottom - iy], br: [r.right - ix, r.bottom - iy] };
        const bad = {};
        for (const [k, [x, y]] of Object.entries(pts)) { const h = document.elementFromPoint(x, y); if (!(h && b.contains(h))) bad[k] = nm(h); }
        out[label] = { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], bad: Object.keys(bad).length ? bad : 'clean' };
      }
      const bl = document.querySelector('.backlink'); const r = bl.getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      out.backlink = { box: [Math.round(r.x), Math.round(r.y)], owns: !!(h && bl.contains(h)) };
      return out;
    })));
    // open the confirm and check its controls
    const g = await page.$('button:has-text("Erase everything")');
    if (g) { await g.click(); await page.waitForTimeout(500); console.log('confirm ctrls:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.chron__confirm button')].map((b) => { const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { t: b.innerText.replace(/\s+/g, ' ').slice(0, 30), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], owns: !!(h && b.contains(h)) }; })))); }
    await ctx.close();
  }
} finally { if (browser) await browser.close(); server.kill(); }
