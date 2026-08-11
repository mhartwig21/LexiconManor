/**
 * r8-live-walk4.mjs — round 8 live pass, part 4: the retire moon during the
 * victory ceremony, minimum-tap lifecycle path, the letter grant channel on
 * the journal, unread truthfulness.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = process.env.WALK_VIEW === 'short'
  ? { width: 375, height: 667 } : { width: 390, height: 844 };

async function freePort(from = 5451, to = 5490) {
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
const say = (s) => console.log('[w4] ' + s);

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
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const controls = () => page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => b.getBoundingClientRect().width > 0)
    .map((b) => b.innerText.replace(/\s+/g, ' ').trim().slice(0, 34)));
  const retire = () => page.evaluate(() => {
    const el = document.querySelector('.chr-retire');
    if (!el) return { mounted: false };
    const r = el.getBoundingClientRect();
    const pts = [['centre', r.x + r.width / 2, r.y + r.height / 2],
      ['tl', r.x + 5, r.y + 5], ['tr', r.right - 5, r.y + 5],
      ['bl', r.x + 5, r.bottom - 5], ['br', r.right - 5, r.bottom - 5]];
    const res = pts.map(([w, x, y]) => {
      const h = document.elementFromPoint(x, y);
      return { w, isRetire: Boolean(h && h.closest && h.closest('.chr-retire')),
        hit: h ? h.tagName.toLowerCase() + '.' + (typeof h.className === 'string' ? h.className : '') : 'null' };
    });
    return { mounted: true, box: { x: r.x, y: r.y, w: r.width, h: r.height }, res,
      overlayAttr: document.documentElement.hasAttribute('data-overlay-open') };
  });
  const phase = () => page.evaluate(() => window.__manorStore.getState().day?.phase ?? null);
  const records = () => page.evaluate(() => window.__manorStore.getState().chronicles.dayRecords.length);

  async function skipScene() {
    // minimum-tap path out of a conversation: Skip, then the primary choice
    let taps = 0;
    for (let i = 0; i < 40 && (await page.$('.dlg')); i++) {
      const primary = await page.$('.dlg-choice--primary');
      if (primary) { await primary.click(); taps++; await page.waitForTimeout(200); continue; }
      const skip = await page.$('.dlg__skip');
      if (skip) { await skip.click(); taps++; await page.waitForTimeout(200); continue; }
      const c = await page.$('.dlg-choice');
      if (c) { await c.click(); taps++; await page.waitForTimeout(200); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {}); taps++;
      await page.waitForTimeout(150);
    }
    return taps;
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title');

  /* 1. minimum taps: front step → blueprint, using Skip */
  let taps = 0;
  await page.click('.bp-btn--seal'); taps++;              // begin the first day
  await page.waitForSelector('.chr-scene');
  await page.click('.chr-scene__btn'); taps++;            // begin the day
  await page.waitForSelector('.dlg');
  taps += await skipScene();
  await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring');
  say(`MIN TAPS front step → blueprint via Skip: ${taps}`);

  /* 2. letter channel on /journal: does the grant announce there, and does
        the unread mark clear on opening? */
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForTimeout(800);
  for (let i = 0; i < 6 && (await page.$('.mom')); i++) { await page.click('.mom'); await page.waitForTimeout(250); }
  const before = await page.evaluate(() => ({
    frags: window.__manorStore.getState().volume.foundFragmentIds.length,
    marks: [...document.querySelectorAll('[class*="unread"]')].length,
  }));
  await page.evaluate(() => window.__manorStore.getState().openLetter('readers-note'));
  await page.waitForTimeout(900);
  const letterMoment = await page.evaluate(() => {
    const el = document.querySelector('.mom');
    if (!el) return { mounted: false };
    const r = el.getBoundingClientRect();
    const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { mounted: true, size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      inFold: r.top >= 0 && r.bottom <= window.innerHeight,
      own: Boolean(h && (h === el || el.contains(h))),
      text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 100),
      queued: document.querySelectorAll('.mom').length };
  });
  const after = await page.evaluate(() => ({
    frags: window.__manorStore.getState().volume.foundFragmentIds.length,
    marks: [...document.querySelectorAll('[class*="unread"]')].map((m) => m.className + ':' + m.innerText.trim()),
  }));
  say(`LETTER GRANT on /journal: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  say(`  moment on the journal screen: ${JSON.stringify(letterMoment)}`);

  /* 3. unread truthfulness (11.21): entrance count vs engine truth */
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(600);
  const truth = await page.evaluate(() => {
    const host = [...document.querySelectorAll('.bp-foot button')].find((b) => /^Journal/.test(b.innerText));
    const mark = host?.querySelector('[class*="unread"]');
    const s = window.__manorStore.getState();
    return { entrance: host?.innerText.replace(/\s+/g, ' ').trim(), markTxt: mark?.innerText.trim() ?? null,
      found: s.volume.foundFragmentIds.length,
      viewedFlags: s.flags.filter((f) => /viewed/.test(f)).length,
      openedFlags: s.flags.filter((f) => /opened/.test(f)).length };
  });
  say(`UNREAD truthfulness: ${JSON.stringify(truth)}`);

  /* 4. THE VICTORY CEREMONY vs the retire moon (11.5) */
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    for (let i = 0; i < 17; i++) s.collectFragmentForRoom('mystery');
    location.hash = '#/sanctum';
  });
  await page.waitForTimeout(900);
  for (let i = 0; i < 8 && (await page.$('.mom')); i++) { await page.click('.mom'); await page.waitForTimeout(200); }
  say(`SANCTUM idle: retire=${JSON.stringify(await retire())}`);
  await page.fill('.snc-input', 'LACUNA');
  await page.click('.snc-speak');
  await page.waitForTimeout(2200);
  say(`CEREMONY won-reveal controls: ${JSON.stringify(await controls())}`);
  const r1 = await retire();
  say(`CEREMONY won-reveal retire: ${JSON.stringify(r1)}`);
  const recBefore = await records();
  const phaseBefore = await phase();
  if (r1.mounted) {
    const cx = r1.box.x + r1.box.w / 2, cy = r1.box.y + r1.box.h / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(150);
    const armed = await page.evaluate(() => document.querySelector('.chr-retire')?.textContent?.trim());
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(500);
    say(`CEREMONY: two taps on the retire moon → armed text "${armed}", phase ${phaseBefore} → ${await phase()}, dayRecords ${recBefore} → ${await records()}`);
    say(`  screen now: ${JSON.stringify(await controls())} hash=${await page.evaluate(() => location.hash)}`);
  }
  await page.screenshot({ path: 'r8-ceremony-retire.png' });
} catch (e) {
  say(`THREW: ${e.message} @ ${e.stack?.split('\n')[1]?.trim()}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
