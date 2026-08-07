/**
 * Round 14 live-interaction critic (AAA 0.4 / §11). ONE browser, system Edge.
 * Stage 1: routes + fresh-save reachability + chrome-height verification.
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

const HIT = `(sel) => {
  const el = document.querySelector(sel);
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect();
  const pts = {
    centre: [r.left + r.width/2, r.top + r.height/2],
    tl: [r.left + 4, r.top + 4], tr: [r.right - 4, r.top + 4],
    bl: [r.left + 4, r.bottom - 4], br: [r.right - 4, r.bottom - 4],
  };
  const out = {};
  for (const [k, [x, y]] of Object.entries(pts)) {
    const hit = document.elementFromPoint(x, y);
    const own = hit && (hit === el || el.contains(hit));
    out[k] = own ? 'own' : (hit ? (hit.className && hit.className.baseVal !== undefined ? hit.className.baseVal : (hit.className || hit.tagName)) : 'null');
  }
  return { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
           inViewport: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
           scrollY: window.scrollY, docScroll: document.documentElement.scrollTop, out };
}`;

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

  const hit = (sel) => page.evaluate(HIT, sel);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  L('=== FRESH SAVE, 390x844 ===');
  L('URL:', page.url());
  L('body html:', (await page.evaluate(() => document.body.innerText)).slice(0, 600));
  L('pageerrors:', JSON.stringify(errs, null, 1));

  // chrome height check
  const chromeInfo = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const bar = document.querySelector('.chr-header');
    return {
      token: cs.getPropertyValue('--chrome-h').trim(),
      tap: cs.getPropertyValue('--tap-target').trim(),
      navFloor: cs.getPropertyValue('--page-nav-floor').trim(),
      barBox: bar ? bar.getBoundingClientRect().height : null,
    };
  });
  L('chrome:', JSON.stringify(chromeInfo));

  // enumerate controls on fresh-save front step
  const controls = await page.evaluate(() => [...document.querySelectorAll('button, a, [role=button]')].map((b) => ({
    cls: b.className, txt: (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 50),
    r: (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height) }))(b.getBoundingClientRect()),
  })));
  L('front-step controls:', JSON.stringify(controls, null, 1));

  // Routes walk (pre-day)
  for (const route of ['/manor', '/room', '/journal', '/chronicles', '/sanctum', '/nowhere']) {
    await page.goto(`${BASE}#${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const info = await page.evaluate(() => ({
      loc: location.hash,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 260),
      controls: [...document.querySelectorAll('button, a, [role=button]')].map((b) => ({
        cls: typeof b.className === 'string' ? b.className : '', txt: (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 40),
      })),
    }));
    L(`\n--- ROUTE ${route} (pre-day) ---`);
    L(JSON.stringify(info, null, 1));
    const bl = await hit('.backlink');
    L('backlink hit:', JSON.stringify(bl));
  }
  L('\npageerrors after walk:', JSON.stringify(errs.slice(0, 10), null, 1));
} finally {
  if (browser) await browser.close();
  server.kill();
}
