/**
 * Round 14 live critic — stage 8: DRIVE the dusk-veil skip over the Journal
 * entrance; victory ceremony exits + retire; reduced-motion pass.
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

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const RM of [false, true]) {
    for (const VP of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
      const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, reducedMotion: RM ? 'reduce' : 'no-preference' });
      const page = await ctx.newPage();
      page.setDefaultTimeout(20000);
      const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
      const drain = async () => { for (let i = 0; i < 30; i++) { const b = await page.$('.mom'); if (!b) return; const r = await b.boundingBox(); if (!r) return; await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(140); } };
      L(`\n######## ${VP.width}x${VP.height} reducedMotion=${RM} ########`);
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.bp-btn--seal');
      await page.click('.bp-btn--seal'); await page.waitForTimeout(900);
      if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(700); }
      for (let i = 0; i < 80 && (await page.$('.dlg')); i++) {
        const p = await page.$('.dlg-choice--primary'); if (p) { await p.click(); await page.waitForTimeout(150); continue; }
        const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) { await c.click(); await page.waitForTimeout(150); continue; }
        await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => { }); await page.waitForTimeout(140);
      }
      await page.waitForTimeout(400); await drain();

      // trigger dusk, then DRIVE a tap at the Journal entrance's centre
      await page.evaluate(() => window.__manorStore.getState().endDay('steps-exhausted'));
      await page.waitForTimeout(400);
      const probe = await page.evaluate(() => {
        const j = [...document.querySelectorAll('.bp-btn--quiet')].find((b) => /Journal/.test(b.innerText));
        if (!j) return null;
        const r = j.getBoundingClientRect();
        const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const skip = document.querySelector('.chr-dusk__skip');
        return {
          journal: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          centreHit: h ? (typeof h.className === 'string' && h.className ? '.' + h.className.trim().split(/\s+/).join('.') : h.tagName) : 'null',
          owns: !!(h && j.contains(h)),
          skipBox: skip ? (({ x, y, width, height }) => [Math.round(x), Math.round(y), Math.round(width), Math.round(height)])(skip.getBoundingClientRect()) : null,
          phase: window.__manorStore.getState().day?.phase,
        };
      });
      L('dusk probe:', JSON.stringify(probe));
      if (probe && !probe.owns) {
        await page.mouse.click(probe.journal[0] + probe.journal[2] / 2, probe.journal[1] + probe.journal[3] / 2);
        await page.waitForTimeout(600);
        L('DRIVEN tap aimed at "Journal" during dusk →', JSON.stringify(await page.evaluate(() => ({ hash: location.hash, phase: window.__manorStore.getState().day?.phase, scene: !!document.querySelector('.chr-scene') }))));
      }
      // through the digest to a new day, then win the volume
      await page.waitForTimeout(4200);
      if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(900); }
      await drain();

      // VICTORY CEREMONY
      await page.evaluate(() => {
        const s = window.__manorStore.getState();
        if (s.day?.phase === 'morning') s.advanceDayPhase();
      });
      await page.waitForTimeout(400);
      if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(700); }
      for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
        const p = await page.$('.dlg-choice--primary'); if (p) { await p.click(); await page.waitForTimeout(140); continue; }
        const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) { await c.click(); await page.waitForTimeout(140); continue; }
        await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => { }); await page.waitForTimeout(130);
      }
      await drain();
      const answer = await page.evaluate(() => { location.hash = '/sanctum'; return null; });
      await page.waitForTimeout(700);
      await page.evaluate(() => window.__manorStore.getState().guessAtSanctum('LACUNA'));
      await page.waitForTimeout(1200);
      L('sanctum after guess:', await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)));
      const cer = await page.evaluate(() => ({
        overlay: document.documentElement.hasAttribute('data-overlay-open'),
        dataOverlay: !!document.querySelector('[data-overlay]'),
        retire: !!document.querySelector('.chr-retire'),
        ctrls: [...document.querySelectorAll('button')].map((b) => ({ c: b.className, t: (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 40) })),
      }));
      L('ceremony:', JSON.stringify(cer));
      L('errs:', JSON.stringify(errs.slice(0, 4)));
      await ctx.close();
    }
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
