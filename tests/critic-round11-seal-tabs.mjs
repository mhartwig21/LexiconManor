/** critic round 11 — probe 6: what the moment seal covers on each screen. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VOL = JSON.parse(readFileSync(resolve(ROOT, 'content/authored/volumes/volume-1.json'), 'utf8'));
async function freePort(f = 5730, t = 5780) {
  for (let p = f; p <= t; p++) {
    const taken = await new Promise((r) => { const s = createServer(); s.once('error', () => r(true)); s.once('listening', () => s.close(() => r(false))); s.listen(p, '127.0.0.1'); });
    if (!taken) return p;
  } throw new Error('no port');
}
const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const log = (...a) => console.log('[critic6]', ...a);
const ok = (m) => console.log('[critic6]   PASS', m);
let failures = 0; const fails = [];
const fail = (m) => { console.error('[critic6]   ** FAIL:', m); failures++; fails.push(m); };
const check = (c, g, b) => { if (c) ok(g); else fail(b); };
const server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', () => {});
const up = (async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } throw new Error('no preview'); })();
let browser;
try {
  await up;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const drain = async () => {
    for (let i = 0; i < 25; i++) {
      const b = await page.evaluate(() => { const e = document.querySelector('.mom'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      if (!b) return; await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2); await page.waitForTimeout(160);
    }
  };
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.bp-btn--seal', { timeout: 30000 });
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene', { timeout: 8000 });
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.dlg', { timeout: 8000 });
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const p = await page.$('.dlg-choice--primary') ?? await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (p) await p.click().catch(() => {}); else await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await page.waitForTimeout(170);
  }
  await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 });
  await drain();

  await page.evaluate((ids) => { for (const id of ids) window.__manorStore.getState().fileFragment(id); }, VOL.fragments.slice(0, 4).map((f) => f.id));
  await page.waitForTimeout(400);
  await drain();

  log(''); log('— what the seal covers, per screen —');
  for (const [name, hash, wait, targets] of [
    ['/journal', '#/journal', '.jrn-page', ['.jrn-tabs button', '.jrn-page .backlink', '.jrn-sheet']],
    ['/chronicles', '#/chronicles', '.chron__title', ['.chron__setting', '.chron .backlink', '.chron__trunk button']],
    ['/manor', '#/manor', '.bp-page', ['.bp-foot__actions button', '.chr-retire', '.bp-sheet, svg']],
  ]) {
    await drain();
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForSelector(wait, { timeout: 8000 }).catch(() => {});
    await page.evaluate((id) => window.__manorStore.getState().fileFragment(id), VOL.fragments[6]?.id ?? VOL.fragments[0].id);
    // force a fresh moment regardless
    await page.evaluate((id) => {
      const s = window.__manorStore.getState();
      const v = s.volume;
      window.__manorStore.setState({ volume: { ...v, foundFragmentIds: v.foundFragmentIds.filter((f) => f !== id) } });
      window.__manorStore.getState().fileFragment(id);
    }, VOL.fragments[7]?.id ?? VOL.fragments[1].id);
    await page.waitForTimeout(600);
    const r = await page.evaluate((sels) => {
      const m = document.querySelector('.mom');
      if (!m) return null;
      const mb = m.getBoundingClientRect();
      const out = { seal: { top: Math.round(mb.top), bottom: Math.round(mb.bottom), h: Math.round(mb.height) }, covered: [] };
      for (const s of sels) {
        for (const el of document.querySelectorAll(s)) {
          const b = el.getBoundingClientRect();
          if (b.width < 1 || b.height < 1) continue;
          const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
          const hit = document.elementFromPoint(cx, cy);
          const blocked = hit && !(hit === el || el.contains(hit)) && m.contains(hit);
          if (blocked) out.covered.push({ sel: s, label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28), top: Math.round(b.top) });
        }
      }
      return out;
    }, targets);
    if (!r) { log(`   ${name}: no seal mounted`); continue; }
    log(`   ${name}: seal ${r.seal.top}..${r.seal.bottom} (${r.seal.h}px) · covered: ${JSON.stringify(r.covered)}`);
    check(r.covered.length === 0,
      `${name}: the seal covers no interactive control`,
      `${name}: the seal blocks ${r.covered.length} control(s) at their centres — ${r.covered.map((c) => `"${c.label}"@${c.top}`).join(', ')} (AAA 11.2)`);
  }
  await ctx.close();
} catch (e) { fail(`threw: ${e.message}`); }
finally { if (browser) await browser.close(); server.kill(); }
log(''); log(failures ? `DONE WITH ${failures} FAILURE(S)` : 'DONE — clean');
for (const f of fails) log('  -', f);
process.exit(0);
