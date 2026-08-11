/**
 * r8-live-walk5.mjs — round 8 live pass, part 5: keepsake awards (11.17/11.12),
 * night digest exit hit test, reduced-motion legibility of moment + unread.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = { width: 390, height: 844 };

async function freePort(from = 5491, to = 5530) {
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
const say = (s) => console.log('[w5] ' + s);

const server = spawn(process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const up = (async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview did not answer');
})();

let browser;
try {
  await up;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: 2, reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const controls = () => page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => b.getBoundingClientRect().width > 0)
    .map((b) => b.innerText.replace(/\s+/g, ' ').trim().slice(0, 40)));
  const probe5 = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const pts = [['centre', r.x + r.width / 2, r.y + r.height / 2],
      ['tl', r.x + 5, r.y + 5], ['tr', r.right - 5, r.y + 5],
      ['bl', r.x + 5, r.bottom - 5], ['br', r.right - 5, r.bottom - 5]];
    return { found: true, size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      inFold: r.top >= 0 && r.bottom <= window.innerHeight,
      res: pts.map(([w, x, y]) => {
        const h = document.elementFromPoint(x, y);
        return { w, own: Boolean(h && (h === el || el.contains(h))),
          hit: h ? h.tagName.toLowerCase() + '.' + (typeof h.className === 'string' ? h.className : '') : 'null' };
      }) };
  }, sel);
  async function playScene() {
    for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
      const p = await page.$('.dlg-choice--primary');
      if (p) { await p.click(); await page.waitForTimeout(160); continue; }
      const sk = await page.$('.dlg__skip');
      if (sk) { await sk.click(); await page.waitForTimeout(160); continue; }
      const c = await page.$('.dlg-choice');
      if (c) { await c.click(); await page.waitForTimeout(160); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      await page.waitForTimeout(140);
    }
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title');
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene');
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.dlg');
  await playScene();
  await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring');

  const keepBefore = await page.evaluate(() => window.__manorStore.getState().earnedAchievementIds.slice());
  say(`KEEPSAKES after the first morning: ${JSON.stringify(keepBefore)}`);

  // the moment/notice glass at the instant a keepsake banks
  await page.evaluate(() => window.__manorStore.getState().endDay('retired-early'));
  await page.waitForTimeout(1500);
  const duskState = await page.evaluate(() => ({
    phase: window.__manorStore.getState().day?.phase,
    keeps: window.__manorStore.getState().earnedAchievementIds.slice(),
    mom: Boolean(document.querySelector('.mom')),
    notice: [...document.querySelectorAll('.chr-notice')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()),
    dusk: Boolean(document.querySelector('.chr-dusk')),
  }));
  say(`AT DUSK: ${JSON.stringify(duskState)}`);
  if (await page.$('.chr-dusk__skip')) { await page.click('.chr-dusk__skip'); await page.waitForTimeout(900); }
  await page.waitForSelector('.chr-scene', { timeout: 8000 }).catch(() => {});
  say(`NIGHT DIGEST exit hit test: ${JSON.stringify(await probe5('.chr-scene__btn'))}`);
  const nightText = await page.evaluate(() => document.querySelector('.chr-scene')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 300));
  say(`NIGHT DIGEST text: ${nightText}`);
  const afterNight = await page.evaluate(() => ({
    keeps: window.__manorStore.getState().earnedAchievementIds.slice(),
    mom: document.querySelector('.mom')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
  }));
  say(`KEEPSAKES banked by the day roll: ${JSON.stringify(afterNight)}`);

  await page.click('.chr-scene__btn');
  await page.waitForTimeout(900);
  await page.click('.chr-scene__btn').catch(() => {});
  await page.waitForTimeout(600);
  await playScene();
  await page.waitForTimeout(500);

  // Chronicles entrance: any marker for a newly earned keepsake? (11.12/11.19)
  const entrance = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.bp-foot button')];
    return btns.map((b) => ({ label: b.innerText.replace(/\s+/g, ' ').trim(),
      mark: Boolean(b.querySelector('[class*="unread"]')) }));
  });
  say(`BLUEPRINT entrances after a keepsake was earned: ${JSON.stringify(entrance)}`);

  // reduced-motion legibility of the unread mark and the moment (11.22)
  const rm = await page.evaluate(() => {
    const mark = document.querySelector('[class*="unread"]');
    const cs = mark ? getComputedStyle(mark) : null;
    return { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      markCls: mark?.className ?? null, markTxt: mark?.innerText.trim() ?? null,
      markSize: mark ? `${Math.round(mark.getBoundingClientRect().width)}x${Math.round(mark.getBoundingClientRect().height)}` : null,
      bg: cs?.backgroundColor, color: cs?.color, anim: cs?.animationName, radius: cs?.borderRadius };
  });
  say(`UNREAD under prefers-reduced-motion: ${JSON.stringify(rm)}`);
  await page.evaluate(() => window.__manorStore.getState().collectFragmentForRoom('mystery'));
  await page.waitForTimeout(700);
  const momRm = await page.evaluate(() => {
    const el = document.querySelector('.mom');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { size: `${Math.round(r.width)}x${Math.round(r.height)}`, opacity: cs.opacity,
      anim: cs.animationName, transform: cs.transform, text: el.innerText.replace(/\s+/g, ' ').slice(0, 60) };
  });
  say(`MOMENT under prefers-reduced-motion: ${JSON.stringify(momRm)}`);
  await page.screenshot({ path: 'r8-reduced-motion.png' });

  // chronicles keepsake shelf shows the earned plate
  await page.evaluate(() => { location.hash = '#/chronicles'; });
  await page.waitForTimeout(700);
  const shelf = await page.evaluate(() => {
    const l = document.querySelector('.chron__ledger');
    const earned = [...document.querySelectorAll('.chron__keepsake.is-earned')].map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 40));
    const totals = document.querySelector('.chron__totals')?.innerText.replace(/\s+/g, ' ').trim();
    return { earned, totals, scroll: l ? { h: l.scrollHeight, c: l.clientHeight } : null };
  });
  say(`CHRONICLES shelf: ${JSON.stringify(shelf)}`);
} catch (e) {
  say(`THREW: ${e.message} @ ${e.stack?.split('\n')[1]?.trim()}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
